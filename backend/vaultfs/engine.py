"""VaultFS Core Engine.

Implements all Virtual File System operations:
- Volume formatting and mounting
- Contiguous Allocation (First-Fit & Best-Fit with External Fragmentation checks)
- Linked Allocation (Block-tail pointer chains with <i)
- Indexed Allocation (Dedicated index block with <256h)
- File Read, Write, Delete, and Directory creation
- Disk Aging Simulation with checkerboard fragmentation
- Sequential Disk Defragmentation with seek optimization
- Intentional Fault/Corruption Injection
- File System Consistency Checker (fsck) and live repair
"""

import math
import os
import struct
import time
from typing import List, Dict, Any, Tuple, Optional, Set

from .constants import (
    BLOCK_SIZE,
    TOTAL_BLOCKS,
    MAX_INODES,
    SUPERBLOCK_BLOCK,
    BITMAP_BLOCK,
    INODE_START_BLOCK,
    INODE_BLOCKS,
    DATA_START_BLOCK,
    DATA_BLOCKS,
    INODES_PER_BLOCK,
    ALLOC_CONTIGUOUS,
    ALLOC_LINKED,
    ALLOC_INDEXED,
    ALLOC_LABELS,
    TYPE_FILE,
    TYPE_DIR,
    MAGIC,
    SUPERBLOCK_FMT,
    INODE_FMT,
    INDEX_BLOCK_FMT,
    LINKED_PTR_FMT,
    LINKED_PTR_OFFSET,
    LINKED_PAYLOAD_SIZE,
    EOF_POINTER,
    DiskFullError,
    InodeTableFullError,
    ExternalFragmentationError,
    VaultFSFileNotFoundError,
    VaultFSFileExistsError,
    DirectoryNotEmptyError,
    InvalidAllocationError,
    CorruptionDetectedError,
    VaultFSError,
)
from .disk import RawDisk
from .models import Superblock, Inode, DirectoryEntry, BlockInfo


class VaultFSEngine:
    """Core Virtual File System engine operating directly over raw disk image."""

    def __init__(self, image_path: str = "disk.img") -> None:
        self.disk = RawDisk(image_path)
        self.image_path = self.disk.image_path
        self._ensure_mounted()

    def _ensure_mounted(self) -> None:
        """Mount existing volume or format a new one if image does not exist or is invalid."""
        if not self.disk.exists():
            self.format(default_alloc=ALLOC_CONTIGUOUS)
        else:
            try:
                self.disk.open()
                sb_bytes = self.disk.read_block(SUPERBLOCK_BLOCK)
                if not sb_bytes.startswith(MAGIC):
                    self.format(default_alloc=ALLOC_CONTIGUOUS)
                else:
                    sb = Superblock.from_bytes(sb_bytes)
                    sb.mount_count += 1
                    self.disk.write_block(SUPERBLOCK_BLOCK, sb.to_bytes())
            except Exception:
                self.format(default_alloc=ALLOC_CONTIGUOUS)

    def format(self, default_alloc: int = ALLOC_CONTIGUOUS) -> None:
        """
        Format the disk image cleanly.
        - Zeroes out entire 131,072-byte image.
        - Writes Block 0: Superblock.
        - Writes Block 1: Free-Space Bitmap (Blocks 0..9 marked 1, 10..255 marked 0).
        - Writes Blocks 2..9: Inode Table (Inode 0 initialized as root directory '/').
        """
        if default_alloc not in (ALLOC_CONTIGUOUS, ALLOC_LINKED, ALLOC_INDEXED):
            default_alloc = ALLOC_CONTIGUOUS

        self.disk.init_storage()

        # Zero out all 256 blocks
        zero_block = b"\x00" * BLOCK_SIZE
        for b in range(TOTAL_BLOCKS):
            self.disk.write_block(b, zero_block)

        # 1. Superblock (Block 0)
        sb = Superblock(
            magic=MAGIC,
            block_size=BLOCK_SIZE,
            total_blocks=TOTAL_BLOCKS,
            total_inodes=MAX_INODES,
            bitmap_block=BITMAP_BLOCK,
            inode_start_block=INODE_START_BLOCK,
            data_start_block=DATA_START_BLOCK,
            free_blocks=DATA_BLOCKS,
            free_inodes=MAX_INODES - 1,  # Inode 0 reserved for root
            mount_count=1,
            default_alloc=default_alloc,
        )
        self.disk.write_block(SUPERBLOCK_BLOCK, sb.to_bytes())

        # 2. Free-Space Bitmap (Block 1)
        # First 256 bytes represent Blocks 0..255.
        # Blocks 0..9 are metadata reserved (marked 1), Blocks 10..255 are free (marked 0).
        bitmap = bytearray(BLOCK_SIZE)
        for i in range(10):
            bitmap[i] = 1
        for i in range(10, TOTAL_BLOCKS):
            bitmap[i] = 0
        self.disk.write_block(BITMAP_BLOCK, bytes(bitmap))

        # 3. Inode Table (Blocks 2..9, 64 inodes)
        root_inode = Inode(
            inode_id=0,
            in_use=1,
            file_type=TYPE_DIR,
            alloc_method=default_alloc,
            size_bytes=0,
            block_count=0,
            created_at=int(time.time()),
            modified_at=int(time.time()),
            start_block=-1,
            end_or_len=-1,
            index_block=-1,
            parent_inode=0,
            name="/",
        )
        self.write_inode(root_inode)

    # --------------------------------------------------------------------------
    # Bitmap and Inode Primitives
    # --------------------------------------------------------------------------

    def get_bitmap(self) -> bytearray:
        """Read the 256-block allocation status bytearray from Block 1."""
        raw = self.disk.read_block(BITMAP_BLOCK)
        return bytearray(raw[:TOTAL_BLOCKS])

    def write_bitmap(self, bitmap: bytearray) -> None:
        """Write the 256-block allocation status bytearray back to Block 1."""
        full_block = bytearray(BLOCK_SIZE)
        full_block[:TOTAL_BLOCKS] = bitmap[:TOTAL_BLOCKS]
        self.disk.write_block(BITMAP_BLOCK, bytes(full_block))

    def get_free_blocks(self) -> List[int]:
        """Return list of unallocated data block IDs (in range 10..255)."""
        bitmap = self.get_bitmap()
        return [b for b in range(DATA_START_BLOCK, TOTAL_BLOCKS) if bitmap[b] == 0]

    def get_free_extents(self) -> List[Tuple[int, int]]:
        """
        Return list of contiguous free extents as (start_block, length) tuples
        within the data area (Blocks 10..255).
        """
        bitmap = self.get_bitmap()
        extents: List[Tuple[int, int]] = []
        current_start: Optional[int] = None
        current_len = 0

        for b in range(DATA_START_BLOCK, TOTAL_BLOCKS):
            if bitmap[b] == 0:
                if current_start is None:
                    current_start = b
                    current_len = 1
                else:
                    current_len += 1
            else:
                if current_start is not None:
                    extents.append((current_start, current_len))
                    current_start = None
                    current_len = 0

        if current_start is not None:
            extents.append((current_start, current_len))

        return extents

    def read_superblock(self) -> Superblock:
        """Read and deserialize the Superblock from Block 0."""
        return Superblock.from_bytes(self.disk.read_block(SUPERBLOCK_BLOCK))

    def write_superblock(self, sb: Superblock) -> None:
        """Serialize and write the Superblock to Block 0."""
        self.disk.write_block(SUPERBLOCK_BLOCK, sb.to_bytes())

    def read_inode(self, inode_id: int) -> Inode:
        """Read an Inode from the on-disk inode table (Blocks 2..9)."""
        if not (0 <= inode_id < MAX_INODES):
            raise VaultFSError(f"Invalid inode ID {inode_id}")

        block_id = INODE_START_BLOCK + (inode_id // INODES_PER_BLOCK)
        offset_in_block = (inode_id % INODES_PER_BLOCK) * 64
        block_bytes = self.disk.read_block(block_id)
        raw_inode = block_bytes[offset_in_block : offset_in_block + 64]
        return Inode.from_bytes(raw_inode)

    def write_inode(self, inode: Inode) -> None:
        """Write an Inode to the on-disk inode table (Blocks 2..9)."""
        if not (0 <= inode.inode_id < MAX_INODES):
            raise VaultFSError(f"Invalid inode ID {inode.inode_id}")

        block_id = INODE_START_BLOCK + (inode.inode_id // INODES_PER_BLOCK)
        offset_in_block = (inode.inode_id % INODES_PER_BLOCK) * 64
        block_bytes = bytearray(self.disk.read_block(block_id))
        block_bytes[offset_in_block : offset_in_block + 64] = inode.to_bytes()
        self.disk.write_block(block_id, bytes(block_bytes))

    def find_inode_by_name(self, name: str, parent_inode: int = 0) -> Optional[Inode]:
        """Find an active inode by name under a given parent directory."""
        clean_name = name.strip("/")
        for i in range(MAX_INODES):
            in_obj = self.read_inode(i)
            if in_obj.in_use == 1:
                if in_obj.parent_inode == parent_inode and in_obj.name == clean_name:
                    return in_obj
                if parent_inode == 0 and clean_name == "" and in_obj.inode_id == 0:
                    return in_obj
        return None

    def allocate_inode_slot(self, name: str, parent_inode: int, file_type: int, alloc_method: int) -> Inode:
        """Allocate an unused inode entry from the inode table."""
        clean_name = name.strip()
        if not clean_name:
            raise VaultFSError("Filename cannot be empty")
        if len(clean_name.encode("utf-8")) > 30:
            raise VaultFSError("Filename exceeds 30-byte limit")

        # Verify no file with identical name exists in parent directory
        existing = self.find_inode_by_name(clean_name, parent_inode)
        if existing is not None:
            raise VaultFSFileExistsError(f"File or directory '{clean_name}' already exists in parent {parent_inode}")

        # Scan for first free inode (1..63)
        for i in range(1, MAX_INODES):
            in_obj = self.read_inode(i)
            if in_obj.in_use == 0:
                in_obj.inode_id = i
                in_obj.in_use = 1
                in_obj.file_type = file_type
                in_obj.alloc_method = alloc_method
                in_obj.name = clean_name
                in_obj.parent_inode = parent_inode
                in_obj.created_at = int(time.time())
                in_obj.modified_at = int(time.time())
                in_obj.size_bytes = 0
                in_obj.block_count = 0
                in_obj.start_block = -1
                in_obj.end_or_len = -1
                in_obj.index_block = -1
                self.write_inode(in_obj)

                # Update Superblock free inodes count
                sb = self.read_superblock()
                sb.free_inodes = max(0, sb.free_inodes - 1)
                self.write_superblock(sb)
                return in_obj

        raise InodeTableFullError("Inode table full: all 64 inodes are in active use.")

    # --------------------------------------------------------------------------
    # Block Chain Resolution & Telemetry
    # --------------------------------------------------------------------------

    def get_inode_blocks(self, inode: Inode) -> List[int]:
        """
        Return the exact list of disk blocks consumed by this inode.
        For Contiguous: [start_block, ..., start_block + N - 1]
        For Linked: [start_block, ptr1, ptr2, ..., end_block]
        For Indexed: [index_block, data_block_0, data_block_1, ...]
        """
        if inode.in_use == 0 or inode.block_count == 0:
            return []

        if inode.alloc_method == ALLOC_CONTIGUOUS:
            if inode.start_block < DATA_START_BLOCK or inode.end_or_len <= 0:
                return []
            return list(range(inode.start_block, inode.start_block + inode.end_or_len))

        elif inode.alloc_method == ALLOC_LINKED:
            chain: List[int] = []
            curr = inode.start_block
            visited: Set[int] = set()

            while curr != EOF_POINTER and curr >= DATA_START_BLOCK and curr < TOTAL_BLOCKS:
                if curr in visited:
                    break  # Cycle protection
                visited.add(curr)
                chain.append(curr)

                block_bytes = self.disk.read_block(curr)
                next_ptr = struct.unpack_from(LINKED_PTR_FMT, block_bytes, LINKED_PTR_OFFSET)[0]
                curr = next_ptr

            return chain

        elif inode.alloc_method == ALLOC_INDEXED:
            if inode.index_block < DATA_START_BLOCK or inode.index_block >= TOTAL_BLOCKS:
                return []

            chain: List[int] = [inode.index_block]
            idx_bytes = self.disk.read_block(inode.index_block)
            entries = struct.unpack(INDEX_BLOCK_FMT, idx_bytes)

            for target_block in entries:
                if target_block == -1:
                    break
                if DATA_START_BLOCK <= target_block < TOTAL_BLOCKS:
                    chain.append(target_block)

            return chain

        return []

    def compute_inode_seek_distance(self, blocks_chain: List[int]) -> int:
        """Compute the cumulative disk head travel distance for sequential file access."""
        if len(blocks_chain) <= 1:
            return 0
        total_seek = 0
        for i in range(len(blocks_chain) - 1):
            total_seek += abs(blocks_chain[i + 1] - blocks_chain[i])
        return total_seek

    def compute_inode_internal_waste(self, inode: Inode) -> int:
        """Compute wasted padding bytes inside the allocated blocks of a file."""
        if inode.in_use == 0 or inode.file_type == TYPE_DIR:
            return 0

        if inode.alloc_method == ALLOC_CONTIGUOUS:
            # 512 bytes per block
            capacity = inode.block_count * BLOCK_SIZE
            return max(0, capacity - inode.size_bytes)

        elif inode.alloc_method == ALLOC_LINKED:
            # 508 bytes payload per block + 4 bytes pointer
            capacity = inode.block_count * LINKED_PAYLOAD_SIZE
            return max(0, capacity - inode.size_bytes)

        elif inode.alloc_method == ALLOC_INDEXED:
            # 1 index block (512B overhead) + 512B per data block
            data_blocks = max(0, inode.block_count - 1)
            capacity = data_blocks * BLOCK_SIZE
            # Internal waste = unused space in last data block + unused space in index block
            data_waste = max(0, capacity - inode.size_bytes)
            index_used_entries = data_blocks * 2
            index_waste = BLOCK_SIZE - index_used_entries
            return data_waste + index_waste

        return 0

    # --------------------------------------------------------------------------
    # Core File Operations (Write, Read, Delete, Mkdir)
    # --------------------------------------------------------------------------

    def create_and_write_file(
        self,
        name: str,
        parent_inode: int,
        data_bytes: bytes,
        alloc_method: int = ALLOC_CONTIGUOUS,
        fit_strategy: str = "first_fit",
        scatter: bool = False,
    ) -> Inode:
        """
        Allocate blocks and create a persistent file on disk using the specified allocation strategy.
        Supports:
        - ALLOC_CONTIGUOUS (0): First-Fit or Best-Fit contiguous runs
        - ALLOC_LINKED (1): Scattered block chain linked via <i at byte 508
        - ALLOC_INDEXED (2): Dedicated index block with <256h pointers
        """
        if alloc_method not in (ALLOC_CONTIGUOUS, ALLOC_LINKED, ALLOC_INDEXED):
            raise InvalidAllocationError(f"Unknown allocation method: {alloc_method}")

        size = len(data_bytes)
        bitmap = self.get_bitmap()
        free_blocks_list = [b for b in range(DATA_START_BLOCK, TOTAL_BLOCKS) if bitmap[b] == 0]

        # ----------------------------------------------------------------------
        # CONTIGUOUS ALLOCATION
        # ----------------------------------------------------------------------
        if alloc_method == ALLOC_CONTIGUOUS:
            needed_blocks = math.ceil(size / BLOCK_SIZE) if size > 0 else 1
            if len(free_blocks_list) < needed_blocks:
                raise DiskFullError(
                    f"Disk Full: Need {needed_blocks} blocks, but only {len(free_blocks_list)} total free blocks available."
                )

            extents = self.get_free_extents()
            largest_extent = max((length for _, length in extents), default=0)

            # Check for External Fragmentation
            if largest_extent < needed_blocks:
                raise ExternalFragmentationError(
                    f"Contiguous allocation failed: Need {needed_blocks} contiguous blocks, "
                    f"have {len(free_blocks_list)} total free blocks, but largest contiguous extent is only {largest_extent} blocks."
                )

            # Filter extents that can satisfy the request
            valid_extents = [e for e in extents if e[1] >= needed_blocks]
            if fit_strategy.lower() == "best_fit":
                # Smallest extent that fits
                chosen_start, _ = min(valid_extents, key=lambda e: e[1])
            else:
                # First-Fit
                chosen_start, _ = valid_extents[0]

            chosen_blocks = list(range(chosen_start, chosen_start + needed_blocks))

            # Write data blocks
            offset = 0
            for b in chosen_blocks:
                chunk = data_bytes[offset : offset + BLOCK_SIZE]
                self.disk.write_block(b, chunk)
                bitmap[b] = 1
                offset += len(chunk)

            self.write_bitmap(bitmap)

            # Allocate and populate Inode
            inode = self.allocate_inode_slot(name, parent_inode, TYPE_FILE, ALLOC_CONTIGUOUS)
            inode.size_bytes = size
            inode.block_count = needed_blocks
            inode.start_block = chosen_start
            inode.end_or_len = needed_blocks
            inode.index_block = -1
            self.write_inode(inode)

            # Update Superblock
            sb = self.read_superblock()
            sb.free_blocks = max(0, sb.free_blocks - needed_blocks)
            self.write_superblock(sb)
            return inode

        # ----------------------------------------------------------------------
        # LINKED ALLOCATION
        # ----------------------------------------------------------------------
        elif alloc_method == ALLOC_LINKED:
            needed_blocks = math.ceil(size / LINKED_PAYLOAD_SIZE) if size > 0 else 1
            if len(free_blocks_list) < needed_blocks:
                raise DiskFullError(
                    f"Disk Full: Need {needed_blocks} blocks for linked file, only {len(free_blocks_list)} free."
                )

            extents = self.get_free_extents()
            if scatter and len(extents) > 1:
                extent_lists = [list(range(start, start + length)) for start, length in extents]
                chosen_blocks = []
                ext_idx = 0
                while len(chosen_blocks) < needed_blocks:
                    if extent_lists[ext_idx]:
                        chosen_blocks.append(extent_lists[ext_idx].pop(0))
                    ext_idx = (ext_idx + 1) % len(extent_lists)
            else:
                chosen_blocks = free_blocks_list[:needed_blocks]

            offset = 0

            for i, b in enumerate(chosen_blocks):
                chunk = data_bytes[offset : offset + LINKED_PAYLOAD_SIZE]
                offset += len(chunk)

                # Pad chunk to 508 bytes
                block_buffer = bytearray(chunk.ljust(LINKED_PAYLOAD_SIZE, b"\x00"))

                # Next block pointer in bytes 508..512
                next_block_id = chosen_blocks[i + 1] if i + 1 < needed_blocks else EOF_POINTER
                block_buffer.extend(struct.pack(LINKED_PTR_FMT, next_block_id))

                self.disk.write_block(b, bytes(block_buffer))
                bitmap[b] = 1

            self.write_bitmap(bitmap)

            inode = self.allocate_inode_slot(name, parent_inode, TYPE_FILE, ALLOC_LINKED)
            inode.size_bytes = size
            inode.block_count = needed_blocks
            inode.start_block = chosen_blocks[0]
            inode.end_or_len = chosen_blocks[-1]
            inode.index_block = -1
            self.write_inode(inode)

            sb = self.read_superblock()
            sb.free_blocks = max(0, sb.free_blocks - needed_blocks)
            self.write_superblock(sb)
            return inode

        # ----------------------------------------------------------------------
        # INDEXED ALLOCATION
        # ----------------------------------------------------------------------
        elif alloc_method == ALLOC_INDEXED:
            data_blocks_needed = math.ceil(size / BLOCK_SIZE) if size > 0 else 1
            total_needed = 1 + data_blocks_needed  # 1 index block + N data blocks

            if len(free_blocks_list) < total_needed:
                raise DiskFullError(
                    f"Disk Full: Need {total_needed} blocks (1 index + {data_blocks_needed} data), only {len(free_blocks_list)} free."
                )

            extents = self.get_free_extents()
            if scatter and len(extents) > 1:
                extent_lists = [list(range(start, start + length)) for start, length in extents]
                chosen_blocks = []
                ext_idx = 0
                while len(chosen_blocks) < total_needed:
                    if extent_lists[ext_idx]:
                        chosen_blocks.append(extent_lists[ext_idx].pop(0))
                    ext_idx = (ext_idx + 1) % len(extent_lists)
                index_block = chosen_blocks[0]
                data_blocks = chosen_blocks[1:total_needed]
            else:
                index_block = free_blocks_list[0]
                data_blocks = free_blocks_list[1:total_needed]

            # Write Index Block table (<256h)
            table = [-1] * 256
            for idx, db in enumerate(data_blocks):
                table[idx] = db
            index_bytes = struct.pack(INDEX_BLOCK_FMT, *table)
            self.disk.write_block(index_block, index_bytes)
            bitmap[index_block] = 1

            # Write Data Blocks
            offset = 0
            for db in data_blocks:
                chunk = data_bytes[offset : offset + BLOCK_SIZE]
                self.disk.write_block(db, chunk)
                bitmap[db] = 1
                offset += len(chunk)

            self.write_bitmap(bitmap)

            inode = self.allocate_inode_slot(name, parent_inode, TYPE_FILE, ALLOC_INDEXED)
            inode.size_bytes = size
            inode.block_count = total_needed
            inode.start_block = data_blocks[0] if data_blocks else -1
            inode.end_or_len = -1
            inode.index_block = index_block
            self.write_inode(inode)

            sb = self.read_superblock()
            sb.free_blocks = max(0, sb.free_blocks - total_needed)
            self.write_superblock(sb)
            return inode

        raise InvalidAllocationError(f"Unhandled allocation method: {alloc_method}")

    def read_file(self, inode_id: int) -> bytes:
        """
        Reconstruct and return the exact binary payload of an active file.
        Traverses contiguous runs, linked pointer chains, or index tables.
        """
        inode = self.read_inode(inode_id)
        if inode.in_use == 0:
            raise VaultFSFileNotFoundError(f"Inode {inode_id} is not in use.")
        if inode.file_type == TYPE_DIR:
            raise VaultFSError(f"Inode {inode_id} is a directory; cannot read raw payload.")
        if inode.size_bytes == 0:
            return b""

        payload_chunks: List[bytes] = []

        if inode.alloc_method == ALLOC_CONTIGUOUS:
            for b in range(inode.start_block, inode.start_block + inode.end_or_len):
                payload_chunks.append(self.disk.read_block(b))

        elif inode.alloc_method == ALLOC_LINKED:
            curr = inode.start_block
            visited: Set[int] = set()

            while curr != EOF_POINTER and DATA_START_BLOCK <= curr < TOTAL_BLOCKS:
                if curr in visited:
                    break
                visited.add(curr)
                block_bytes = self.disk.read_block(curr)
                payload_chunks.append(block_bytes[:LINKED_PAYLOAD_SIZE])
                next_ptr = struct.unpack_from(LINKED_PTR_FMT, block_bytes, LINKED_PTR_OFFSET)[0]
                curr = next_ptr

        elif inode.alloc_method == ALLOC_INDEXED:
            if inode.index_block < DATA_START_BLOCK or inode.index_block >= TOTAL_BLOCKS:
                raise VaultFSError(f"Corrupted index block pointer {inode.index_block} on inode {inode_id}")

            idx_bytes = self.disk.read_block(inode.index_block)
            targets = struct.unpack(INDEX_BLOCK_FMT, idx_bytes)

            for target_block in targets:
                if target_block == -1:
                    break
                if DATA_START_BLOCK <= target_block < TOTAL_BLOCKS:
                    payload_chunks.append(self.disk.read_block(target_block))

        assembled = b"".join(payload_chunks)
        return assembled[: inode.size_bytes]

    def delete_file(self, inode_id: int) -> None:
        """
        Delete an active file or empty directory:
        - Frees all associated blocks in the Free-Space Bitmap
        - Zeroes out block bytes on disk
        - Resets the Inode entry
        - Updates Superblock counters
        """
        if inode_id == 0:
            raise VaultFSError("Cannot delete root directory '/'")

        inode = self.read_inode(inode_id)
        if inode.in_use == 0:
            raise VaultFSFileNotFoundError(f"Inode {inode_id} does not exist or is already deleted.")

        # If directory, ensure it has no active children
        if inode.file_type == TYPE_DIR:
            for i in range(MAX_INODES):
                other = self.read_inode(i)
                if other.in_use == 1 and other.parent_inode == inode_id:
                    raise DirectoryNotEmptyError(f"Directory '{inode.name}' is not empty.")

        # Reclaim all consumed blocks
        blocks_to_free = self.get_inode_blocks(inode)
        bitmap = self.get_bitmap()
        zero_block = b"\x00" * BLOCK_SIZE

        for b in blocks_to_free:
            if DATA_START_BLOCK <= b < TOTAL_BLOCKS:
                bitmap[b] = 0
                self.disk.write_block(b, zero_block)

        self.write_bitmap(bitmap)

        # Clear Inode
        cleared_inode = Inode(inode_id=inode_id, in_use=0)
        self.write_inode(cleared_inode)

        # Update Superblock counters
        sb = self.read_superblock()
        sb.free_blocks = min(DATA_BLOCKS, sb.free_blocks + len(blocks_to_free))
        sb.free_inodes = min(MAX_INODES - 1, sb.free_inodes + 1)
        self.write_superblock(sb)

    def mkdir(self, name: str, parent_inode: int = 0) -> Inode:
        """Create a new directory inode."""
        clean_name = name.strip()
        inode = self.allocate_inode_slot(clean_name, parent_inode, TYPE_DIR, ALLOC_CONTIGUOUS)
        return inode

    # --------------------------------------------------------------------------
    # Disk Aging Simulation
    # --------------------------------------------------------------------------

    def simulate_aging(self, seed: int = 42) -> Tuple[Dict[str, Any], List[str]]:
        """
        Simulate real-world disk fragmentation workload:
        1. Cleanly formats volume
        2. Populates 14 realistic files across all 3 allocation schemes
        3. Deletes 5 intermediate files to create alternating checkerboard holes
        4. Writes 3 Linked and Indexed files that jump across those holes
        """
        self.format(default_alloc=ALLOC_CONTIGUOUS)
        log: List[str] = ["[Aging] Volume cleanly formatted."]

        # Realistic workload spanning physical sectors 10 through 186
        workload = [
            ("kernel.sys", 3072, ALLOC_CONTIGUOUS),        # 6 blocks (10..15)
            ("syslog.log", 3500, ALLOC_LINKED),            # 7 blocks (16..22)
            ("db_index.dat", 4096, ALLOC_INDEXED),         # 8 data + 1 index = 9 blocks (23..31)
            ("user_profile.json", 2560, ALLOC_CONTIGUOUS), # 5 blocks (32..36)
            ("cache_01.tmp", 4000, ALLOC_LINKED),          # 8 blocks (37..44)
            ("video_chunk.bin", 6144, ALLOC_CONTIGUOUS),   # 12 blocks (45..56)
            ("config.yaml", 1536, ALLOC_INDEXED),          # 3 data + 1 index = 4 blocks (57..60)
            ("auth.db", 4096, ALLOC_CONTIGUOUS),           # 8 blocks (61..68)
            ("access_log.txt", 5000, ALLOC_LINKED),        # 10 blocks (69..78)
            ("swap.img", 8192, ALLOC_CONTIGUOUS),          # 16 blocks (79..94)
            ("metadata.bin", 2560, ALLOC_INDEXED),         # 5 data + 1 index = 6 blocks (95..100)
            ("patch_v2.diff", 4000, ALLOC_LINKED),         # 8 blocks (101..108)
            ("network.pcap", 5120, ALLOC_CONTIGUOUS),      # 10 blocks (109..118)
            ("archive_bak.tar", 14336, ALLOC_CONTIGUOUS),  # 28 blocks (119..146)
            ("temp_state.dat", 3500, ALLOC_INDEXED),       # 7 data + 1 index = 8 blocks (147..154)
            ("system_image.bin", 16384, ALLOC_CONTIGUOUS), # 32 blocks (155..186)
        ]

        created_inodes: Dict[str, Inode] = {}
        for fname, size, method in workload:
            # Generate deterministic patterned data
            pattern = f"DATA_PAYLOAD_{fname}_" * (size // 20 + 2)
            raw_payload = pattern.encode("utf-8")[:size]
            in_obj = self.create_and_write_file(fname, 0, raw_payload, method)
            created_inodes[fname] = in_obj
            log.append(f"[Create] {fname} ({size}B, {ALLOC_LABELS[method]}) -> {in_obj.block_count} blocks")

        # Delete 5 files to create alternating checkerboard free-space holes
        to_delete = ["user_profile.json", "cache_01.tmp", "swap.img", "patch_v2.diff", "temp_state.dat"]
        for fname in to_delete:
            if fname in created_inodes:
                in_obj = created_inodes[fname]
                self.delete_file(in_obj.inode_id)
                log.append(f"[Delete] Freed {fname} to create checkerboard fragmentation hole.")

        # Allocate 3 files that scatter across the freed holes
        scatter_files = [
            ("audit_trail.log", 4500, ALLOC_LINKED),
            ("sensor_telemetry.bin", 5000, ALLOC_INDEXED),
            ("error_dump.log", 3500, ALLOC_LINKED),
        ]

        for fname, size, method in scatter_files:
            pattern = f"SCATTERED_CHAIN_{fname}_" * (size // 20 + 2)
            raw_payload = pattern.encode("utf-8")[:size]
            in_obj = self.create_and_write_file(fname, 0, raw_payload, method, scatter=True)
            log.append(f"[Scatter] Created {fname} ({size}B, {ALLOC_LABELS[method]}) jumping across scattered holes.")

        state = self.get_state()
        return state, log

    # --------------------------------------------------------------------------
    # Sequential Disk Defragmentation
    # --------------------------------------------------------------------------

    def defrag(self) -> Dict[str, Any]:
        """
        Perform complete offline disk defragmentation:
        - Reads each active file's payload into memory
        - Preserves inode IDs, names, file types, and allocation methods
        - Compacts all blocks sequentially starting at Block 10 without gaps
        - Rewrites Linked next-block pointers (<i) and Indexed index tables (<256h)
        - Clears remaining blocks and updates Bitmap and Superblock
        - Returns before/after telemetry and animated block move records
        """
        before_state = self.get_state()
        before_metrics = before_state["metrics"]

        # Collect active files (exclude root directory and inactive inodes)
        active_files: List[Dict[str, Any]] = []
        for i in range(1, MAX_INODES):
            in_obj = self.read_inode(i)
            if in_obj.in_use == 1:
                if in_obj.file_type == TYPE_FILE:
                    payload = self.read_file(i)
                    old_blocks = self.get_inode_blocks(in_obj)
                    active_files.append({
                        "inode": in_obj,
                        "payload": payload,
                        "old_blocks": old_blocks,
                    })

        # Clear data blocks area on disk and reset bitmap
        zero_block = b"\x00" * BLOCK_SIZE
        for b in range(DATA_START_BLOCK, TOTAL_BLOCKS):
            self.disk.write_block(b, zero_block)

        new_bitmap = bytearray(BLOCK_SIZE)
        for i in range(10):
            new_bitmap[i] = 1

        moves: List[Dict[str, Any]] = []
        current_block = DATA_START_BLOCK

        # Sequentially compact every file
        for item in active_files:
            inode: Inode = item["inode"]
            payload: bytes = item["payload"]
            old_blocks: List[int] = item["old_blocks"]
            size = len(payload)
            new_blocks: List[int] = []

            if inode.alloc_method == ALLOC_CONTIGUOUS:
                needed = inode.block_count
                start_b = current_block
                offset = 0
                for _ in range(needed):
                    chunk = payload[offset : offset + BLOCK_SIZE]
                    self.disk.write_block(current_block, chunk)
                    new_bitmap[current_block] = 1
                    new_blocks.append(current_block)
                    offset += len(chunk)
                    current_block += 1

                inode.start_block = start_b
                inode.end_or_len = needed
                inode.index_block = -1
                self.write_inode(inode)

            elif inode.alloc_method == ALLOC_LINKED:
                needed = inode.block_count
                start_b = current_block
                allocated_chain = list(range(current_block, current_block + needed))
                offset = 0

                for idx, b in enumerate(allocated_chain):
                    chunk = payload[offset : offset + LINKED_PAYLOAD_SIZE]
                    offset += len(chunk)

                    block_buffer = bytearray(chunk.ljust(LINKED_PAYLOAD_SIZE, b"\x00"))
                    next_ptr = allocated_chain[idx + 1] if idx + 1 < needed else EOF_POINTER
                    block_buffer.extend(struct.pack(LINKED_PTR_FMT, next_ptr))

                    self.disk.write_block(b, bytes(block_buffer))
                    new_bitmap[b] = 1
                    new_blocks.append(b)

                current_block += needed
                inode.start_block = start_b
                inode.end_or_len = allocated_chain[-1]
                inode.index_block = -1
                self.write_inode(inode)

            elif inode.alloc_method == ALLOC_INDEXED:
                needed = inode.block_count
                data_needed = needed - 1
                idx_b = current_block
                data_chain = list(range(current_block + 1, current_block + 1 + data_needed))

                # Index table
                table = [-1] * 256
                for tidx, db in enumerate(data_chain):
                    table[tidx] = db
                idx_bytes = struct.pack(INDEX_BLOCK_FMT, *table)
                self.disk.write_block(idx_b, idx_bytes)
                new_bitmap[idx_b] = 1
                new_blocks.append(idx_b)

                offset = 0
                for db in data_chain:
                    chunk = payload[offset : offset + BLOCK_SIZE]
                    self.disk.write_block(db, chunk)
                    new_bitmap[db] = 1
                    new_blocks.append(db)
                    offset += len(chunk)

                current_block += needed
                inode.start_block = data_chain[0] if data_chain else -1
                inode.end_or_len = -1
                inode.index_block = idx_b
                self.write_inode(inode)

            moves.append({
                "inode_id": inode.inode_id,
                "file": inode.name,
                "alloc_method": ALLOC_LABELS.get(inode.alloc_method, "UNKNOWN"),
                "from_blocks": old_blocks,
                "to_blocks": new_blocks,
            })

        # Commit new bitmap
        self.write_bitmap(new_bitmap)

        # Update Superblock free blocks
        sb = self.read_superblock()
        sb.free_blocks = TOTAL_BLOCKS - current_block
        self.write_superblock(sb)

        after_state = self.get_state()
        after_metrics = after_state["metrics"]

        return {
            "before": before_metrics,
            "after": after_metrics,
            "moves": moves,
            "state": after_state,
        }

    # --------------------------------------------------------------------------
    # Corruption Injection & FSCK Repair
    # --------------------------------------------------------------------------

    def inject_corruption(self) -> Dict[str, Any]:
        """
        Inject 3 realistic disk errors for resilience testing:
        1. Orphan Block Leak: Marks 3 free data blocks in Bitmap as 1 (Allocated) without inode ownership.
        2. Unmarked Allocated Block: Flips 1 active file data block to 0 (Free) in Bitmap.
        3. Superblock Counter Drift: Artificially drifts free_blocks in Superblock by +7.
        """
        bitmap = self.get_bitmap()
        sb = self.read_superblock()

        # 1. Orphan Block Leak: Mark 3 free blocks as 1
        free_blocks = [b for b in range(DATA_START_BLOCK, TOTAL_BLOCKS) if bitmap[b] == 0]
        orphan_targets = free_blocks[-3:] if len(free_blocks) >= 3 else free_blocks
        for b in orphan_targets:
            bitmap[b] = 1

        # 2. Unmarked Allocated Block: Find an active inode's block and mark 0
        unmarked_target: Optional[int] = None
        for i in range(1, MAX_INODES):
            in_obj = self.read_inode(i)
            if in_obj.in_use == 1 and in_obj.file_type == TYPE_FILE:
                blocks = self.get_inode_blocks(in_obj)
                if blocks:
                    unmarked_target = blocks[-1]
                    bitmap[unmarked_target] = 0
                    break

        self.write_bitmap(bitmap)

        # 3. Superblock Counter Drift (+7)
        sb.free_blocks = min(DATA_BLOCKS, sb.free_blocks + 7)
        self.write_superblock(sb)

        return self.get_state()

    def fsck(self, repair: bool = True) -> Dict[str, Any]:
        """
        File System Consistency Checker (fsck):
        - Scans all 64 inodes to establish ground truth of allocated blocks
        - Compares against Free-Space Bitmap (Block 1) and Superblock counters (Block 0)
        - Reports structured anomalies with severity and repair status
        - If repair=True, writes corrected Bitmap and Superblock back to disk
        """
        anomalies: List[Dict[str, Any]] = []

        # Ground truth structures
        ground_truth_blocks: Set[int] = set(range(10))  # Blocks 0..9 system reserved
        block_owners: Dict[int, List[int]] = {}

        active_inodes_count = 0
        for i in range(MAX_INODES):
            in_obj = self.read_inode(i)
            if in_obj.in_use == 1:
                active_inodes_count += 1
                if in_obj.file_type == TYPE_FILE:
                    blocks = self.get_inode_blocks(in_obj)
                    for b in blocks:
                        ground_truth_blocks.add(b)
                        block_owners.setdefault(b, []).append(i)

        # Check for cross-linked blocks (multiple inodes claiming the same block)
        for b, owners in block_owners.items():
            if len(owners) > 1:
                anomalies.append({
                    "type": "CROSS_LINKED_BLOCK",
                    "severity": "CRITICAL",
                    "block_or_inode": b,
                    "description": f"Block {b} is cross-claimed by multiple inodes: {owners}",
                    "fixed": False,
                })

        # Compare with on-disk bitmap
        bitmap = self.get_bitmap()
        repaired_bitmap = bytearray(BLOCK_SIZE)
        for b in range(10):
            repaired_bitmap[b] = 1

        for b in range(DATA_START_BLOCK, TOTAL_BLOCKS):
            is_bitmap_marked = (bitmap[b] == 1)
            is_ground_truth_marked = (b in ground_truth_blocks)

            if is_bitmap_marked and not is_ground_truth_marked:
                # Orphan block leak
                anomalies.append({
                    "type": "ORPHAN_BLOCK_LEAK",
                    "severity": "ERROR",
                    "block_or_inode": b,
                    "description": f"Block {b} marked allocated in bitmap, but no active Inode owns it.",
                    "fixed": repair,
                })
                repaired_bitmap[b] = 0 if repair else 1

            elif not is_bitmap_marked and is_ground_truth_marked:
                # Unmarked allocated block
                owner = block_owners.get(b, [0])[0]
                anomalies.append({
                    "type": "UNMARKED_ALLOCATED_BLOCK",
                    "severity": "CRITICAL",
                    "block_or_inode": b,
                    "description": f"Block {b} is owned by Inode {owner}, but marked FREE in bitmap.",
                    "fixed": repair,
                })
                repaired_bitmap[b] = 1 if repair else 0

            else:
                repaired_bitmap[b] = 1 if is_ground_truth_marked else 0

        # Check Superblock counters
        sb = self.read_superblock()
        expected_free_blocks = TOTAL_BLOCKS - len(ground_truth_blocks)
        expected_free_inodes = MAX_INODES - active_inodes_count

        if sb.free_blocks != expected_free_blocks:
            anomalies.append({
                "type": "SUPERBLOCK_FREE_BLOCKS_DRIFT",
                "severity": "WARNING",
                "block_or_inode": 0,
                "description": f"Superblock claims {sb.free_blocks} free blocks, but actual free count is {expected_free_blocks}.",
                "fixed": repair,
            })
            if repair:
                sb.free_blocks = expected_free_blocks

        if sb.free_inodes != expected_free_inodes:
            anomalies.append({
                "type": "SUPERBLOCK_FREE_INODES_DRIFT",
                "severity": "WARNING",
                "block_or_inode": 0,
                "description": f"Superblock claims {sb.free_inodes} free inodes, but actual free count is {expected_free_inodes}.",
                "fixed": repair,
            })
            if repair:
                sb.free_inodes = expected_free_inodes

        # Apply repairs if requested
        if repair:
            self.write_bitmap(repaired_bitmap)
            self.write_superblock(sb)

        return {
            "anomalies": anomalies,
            "repaired": repair,
            "state": self.get_state(),
        }

    # --------------------------------------------------------------------------
    # Telemetry and Full System State Serialization
    # --------------------------------------------------------------------------

    def get_state(self) -> Dict[str, Any]:
        """
        Assemble the complete real-time file system state matching the strict
        FastAPI / React schema contract.
        """
        sb = self.read_superblock()
        bitmap = self.get_bitmap()

        # Inodes collection and ownership mapping
        active_inodes: List[Dict[str, Any]] = []
        block_owner_map: Dict[int, Tuple[int, str, int]] = {}  # block_id -> (inode_id, name, alloc_method)
        index_target_map: Dict[int, List[int]] = {}  # index_block_id -> [data_block_ids]
        linked_next_map: Dict[int, int] = {}  # block_id -> next_block_id

        total_seek_dist = 0
        total_seek_hops = 0
        total_internal_waste = 0

        for i in range(MAX_INODES):
            in_obj = self.read_inode(i)
            if in_obj.in_use == 1:
                chain = self.get_inode_blocks(in_obj)
                waste = self.compute_inode_internal_waste(in_obj)
                seek = self.compute_inode_seek_distance(chain)

                total_internal_waste += waste
                if len(chain) > 1:
                    total_seek_dist += seek
                    total_seek_hops += (len(chain) - 1)

                active_inodes.append(in_obj.to_dict(
                    blocks_chain=chain,
                    internal_waste_bytes=waste,
                    seek_distance=seek,
                ))

                # Map blocks to owners
                if in_obj.file_type == TYPE_FILE:
                    for b in chain:
                        block_owner_map[b] = (in_obj.inode_id, in_obj.name, in_obj.alloc_method)

                    if in_obj.alloc_method == ALLOC_INDEXED and in_obj.index_block != -1:
                        index_target_map[in_obj.index_block] = [tb for tb in chain if tb != in_obj.index_block]

                    elif in_obj.alloc_method == ALLOC_LINKED and len(chain) > 1:
                        for c_idx in range(len(chain) - 1):
                            linked_next_map[chain[c_idx]] = chain[c_idx + 1]
                        linked_next_map[chain[-1]] = EOF_POINTER

        # Metrics computation
        used_blocks_count = sum(1 for b in range(TOTAL_BLOCKS) if bitmap[b] == 1)
        data_blocks_used = max(0, used_blocks_count - 10)
        free_extents = self.get_free_extents()
        free_extents_count = len(free_extents)
        largest_free_extent = max((length for _, length in free_extents), default=0)
        total_free_blocks = sum(length for _, length in free_extents)

        # External fragmentation percentage
        if total_free_blocks > 0:
            external_frag_pct = round((1.0 - (largest_free_extent / total_free_blocks)) * 100.0, 1)
        else:
            external_frag_pct = 0.0

        avg_seek = round(total_seek_dist / total_seek_hops, 2) if total_seek_hops > 0 else 0.0

        # Health status check: verify bitmap against superblock and ground truth
        health_status = "HEALTHY"
        expected_free = TOTAL_BLOCKS - used_blocks_count
        if sb.free_blocks != expected_free:
            health_status = "CORRUPTED"
        else:
            # Check for orphaned or unmarked blocks
            for b in range(DATA_START_BLOCK, TOTAL_BLOCKS):
                is_used_in_bitmap = (bitmap[b] == 1)
                is_owned = (b in block_owner_map)
                if is_used_in_bitmap != is_owned:
                    health_status = "CORRUPTED"
                    break

        metrics = {
            "used_blocks": used_blocks_count,
            "metadata_blocks": 10,
            "data_blocks_used": data_blocks_used,
            "external_frag_percent": external_frag_pct,
            "internal_frag_bytes": total_internal_waste,
            "free_extents_count": free_extents_count,
            "largest_free_extent": largest_free_extent,
            "avg_seek_distance": avg_seek,
            "total_seek_operations": total_seek_hops,
            "health_status": health_status,
        }

        # Blocks inspection array (all 256 blocks)
        blocks_list: List[Dict[str, Any]] = []
        for b in range(TOTAL_BLOCKS):
            raw_block = self.disk.read_block(b)
            preview_bytes = raw_block[:64]
            hex_preview = " ".join(f"{byte:02x}" for byte in preview_bytes)
            ascii_preview = "".join(chr(byte) if 32 <= byte <= 126 else "." for byte in preview_bytes)

            status = "FREE"
            owner_id = -1
            owner_name = "Unallocated"
            alloc_method = -1
            next_b = -1
            indexed_targets: List[int] = []
            used_bytes = 0
            waste_bytes = 0

            if b == SUPERBLOCK_BLOCK:
                status = "SUPERBLOCK"
                owner_name = "System Superblock"
                used_bytes = 512
            elif b == BITMAP_BLOCK:
                status = "BITMAP"
                owner_name = "Free-Space Bitmap"
                used_bytes = 512
            elif INODE_START_BLOCK <= b < DATA_START_BLOCK:
                status = "INODE"
                owner_name = f"Inode Table ({b - INODE_START_BLOCK + 1}/8)"
                used_bytes = 512
            else:
                # Data block area
                if b in block_owner_map:
                    owner_id, owner_name, alloc_method = block_owner_map[b]
                    if b in index_target_map:
                        status = "INDEX_BLOCK"
                        indexed_targets = index_target_map[b]
                        used_bytes = 512
                    elif alloc_method == ALLOC_CONTIGUOUS:
                        status = "CONTIGUOUS"
                        used_bytes = 512
                    elif alloc_method == ALLOC_LINKED:
                        status = "LINKED"
                        next_b = linked_next_map.get(b, EOF_POINTER)
                        used_bytes = 512
                    elif alloc_method == ALLOC_INDEXED:
                        status = "INDEXED"
                        used_bytes = 512
                else:
                    if bitmap[b] == 1:
                        status = "CORRUPTED"
                        owner_name = "Orphan Block Leak"
                        used_bytes = 512
                    else:
                        status = "FREE"
                        owner_name = "Unallocated"

            blocks_list.append(BlockInfo(
                block_id=b,
                status=status,
                owner_inode=owner_id,
                owner_name=owner_name,
                alloc_method=alloc_method,
                next_block=next_b,
                indexed_targets=indexed_targets,
                used_bytes=used_bytes,
                waste_bytes=waste_bytes,
                hex_preview=hex_preview,
                ascii_preview=ascii_preview,
            ).to_dict())

        return {
            "superblock": sb.to_dict(),
            "metrics": metrics,
            "inodes": active_inodes,
            "blocks": blocks_list,
        }

