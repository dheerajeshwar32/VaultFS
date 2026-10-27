"""VaultFS Binary Models and Serializers.

Provides exact struct-level serialization and deserialization for the Superblock,
Inode table, Directory entries, and Block telemetry.
"""

import struct
import time
from typing import List, Dict, Any, Optional
from .constants import (
    SUPERBLOCK_FMT,
    INODE_FMT,
    MAGIC,
    BLOCK_SIZE,
    TOTAL_BLOCKS,
    MAX_INODES,
    BITMAP_BLOCK,
    INODE_START_BLOCK,
    DATA_START_BLOCK,
    DATA_BLOCKS,
    ALLOC_CONTIGUOUS,
    ALLOC_LINKED,
    ALLOC_INDEXED,
    ALLOC_LABELS,
    TYPE_FILE,
    TYPE_DIR,
    TYPE_LABELS,
)


class Superblock:
    """
    Superblock binary model (Block 0, 512 bytes).
    Format: "<8s9IB467x"
    """

    def __init__(
        self,
        magic: bytes = MAGIC,
        block_size: int = BLOCK_SIZE,
        total_blocks: int = TOTAL_BLOCKS,
        total_inodes: int = MAX_INODES,
        bitmap_block: int = BITMAP_BLOCK,
        inode_start_block: int = INODE_START_BLOCK,
        data_start_block: int = DATA_START_BLOCK,
        free_blocks: int = DATA_BLOCKS,
        free_inodes: int = MAX_INODES - 1,  # Inode 0 reserved for root
        mount_count: int = 1,
        default_alloc: int = ALLOC_CONTIGUOUS,
    ) -> None:
        self.magic = magic
        self.block_size = block_size
        self.total_blocks = total_blocks
        self.total_inodes = total_inodes
        self.bitmap_block = bitmap_block
        self.inode_start_block = inode_start_block
        self.data_start_block = data_start_block
        self.free_blocks = free_blocks
        self.free_inodes = free_inodes
        self.mount_count = mount_count
        self.default_alloc = default_alloc

    def to_bytes(self) -> bytes:
        """Serialize Superblock to exactly 512 bytes."""
        return struct.pack(
            SUPERBLOCK_FMT,
            self.magic,
            self.block_size,
            self.total_blocks,
            self.total_inodes,
            self.bitmap_block,
            self.inode_start_block,
            self.data_start_block,
            self.free_blocks,
            self.free_inodes,
            self.mount_count,
            self.default_alloc,
        )

    @classmethod
    def from_bytes(cls, data: bytes) -> "Superblock":
        """Deserialize Superblock from 512 bytes."""
        if len(data) != 512:
            raise ValueError(f"Superblock raw data must be exactly 512 bytes, got {len(data)}")

        unpacked = struct.unpack(SUPERBLOCK_FMT, data)
        return cls(
            magic=unpacked[0],
            block_size=unpacked[1],
            total_blocks=unpacked[2],
            total_inodes=unpacked[3],
            bitmap_block=unpacked[4],
            inode_start_block=unpacked[5],
            data_start_block=unpacked[6],
            free_blocks=unpacked[7],
            free_inodes=unpacked[8],
            mount_count=unpacked[9],
            default_alloc=unpacked[10],
        )

    def to_dict(self) -> Dict[str, Any]:
        """Serialize Superblock to JSON-compatible dictionary."""
        return {
            "magic": self.magic.decode("utf-8", errors="replace").rstrip("\x00"),
            "block_size": self.block_size,
            "total_blocks": self.total_blocks,
            "total_inodes": self.total_inodes,
            "free_blocks": self.free_blocks,
            "free_inodes": self.free_inodes,
            "mount_count": self.mount_count,
            "default_alloc": self.default_alloc,
        }


class Inode:
    """
    Inode binary model (64 bytes).
    Format: "<BBBBIIIIhhhh32s4x"
    """

    def __init__(
        self,
        inode_id: int = 0,
        in_use: int = 0,
        file_type: int = TYPE_FILE,
        alloc_method: int = ALLOC_CONTIGUOUS,
        size_bytes: int = 0,
        block_count: int = 0,
        created_at: int = 0,
        modified_at: int = 0,
        start_block: int = -1,
        end_or_len: int = -1,
        index_block: int = -1,
        parent_inode: int = 0,
        name: str = "",
    ) -> None:
        self.inode_id = inode_id
        self.in_use = in_use
        self.file_type = file_type
        self.alloc_method = alloc_method
        self.size_bytes = size_bytes
        self.block_count = block_count
        self.created_at = created_at or int(time.time())
        self.modified_at = modified_at or int(time.time())
        self.start_block = start_block
        self.end_or_len = end_or_len
        self.index_block = index_block
        self.parent_inode = parent_inode
        self.name = name

    def to_bytes(self) -> bytes:
        """Serialize Inode to exactly 64 bytes."""
        encoded_name = self.name.encode("utf-8")[:32].ljust(32, b"\x00")
        return struct.pack(
            INODE_FMT,
            self.inode_id,
            self.in_use,
            self.file_type,
            self.alloc_method,
            self.size_bytes,
            self.block_count,
            self.created_at,
            self.modified_at,
            self.start_block,
            self.end_or_len,
            self.index_block,
            self.parent_inode,
            encoded_name,
        )

    @classmethod
    def from_bytes(cls, data: bytes) -> "Inode":
        """Deserialize Inode from 64 bytes."""
        if len(data) != 64:
            raise ValueError(f"Inode raw data must be exactly 64 bytes, got {len(data)}")

        unpacked = struct.unpack(INODE_FMT, data)
        name_str = unpacked[12].decode("utf-8", errors="replace").rstrip("\x00")
        return cls(
            inode_id=unpacked[0],
            in_use=unpacked[1],
            file_type=unpacked[2],
            alloc_method=unpacked[3],
            size_bytes=unpacked[4],
            block_count=unpacked[5],
            created_at=unpacked[6],
            modified_at=unpacked[7],
            start_block=unpacked[8],
            end_or_len=unpacked[9],
            index_block=unpacked[10],
            parent_inode=unpacked[11],
            name=name_str,
        )

    def to_dict(
        self,
        blocks_chain: Optional[List[int]] = None,
        internal_waste_bytes: int = 0,
        seek_distance: int = 0,
    ) -> Dict[str, Any]:
        """Serialize Inode to JSON-compatible dictionary matching API specification."""
        chain = blocks_chain if blocks_chain is not None else []
        return {
            "inode_id": self.inode_id,
            "in_use": self.in_use,
            "name": self.name,
            "file_type": self.file_type,
            "alloc_method": self.alloc_method,
            "alloc_label": ALLOC_LABELS.get(self.alloc_method, "UNKNOWN"),
            "size_bytes": self.size_bytes,
            "block_count": self.block_count,
            "start_block": self.start_block,
            "end_or_len": self.end_or_len,
            "index_block": self.index_block,
            "parent_inode": self.parent_inode,
            "blocks_chain": chain,
            "internal_waste_bytes": internal_waste_bytes,
            "seek_distance": seek_distance,
            "created_at": self.created_at,
        }


class DirectoryEntry:
    """Logical and binary representation of directory membership."""

    def __init__(self, inode_id: int, name: str, file_type: int) -> None:
        self.inode_id = inode_id
        self.name = name
        self.file_type = file_type

    def to_dict(self) -> Dict[str, Any]:
        return {
            "inode_id": self.inode_id,
            "name": self.name,
            "file_type": self.file_type,
            "type_label": TYPE_LABELS.get(self.file_type, "UNKNOWN"),
        }


class BlockInfo:
    """Telemetry and inspection model for an individual disk block."""

    def __init__(
        self,
        block_id: int,
        status: str,
        owner_inode: int = -1,
        owner_name: str = "",
        alloc_method: int = -1,
        next_block: int = -1,
        indexed_targets: Optional[List[int]] = None,
        used_bytes: int = 0,
        waste_bytes: int = 0,
        hex_preview: str = "",
        ascii_preview: str = "",
    ) -> None:
        self.block_id = block_id
        self.status = status
        self.owner_inode = owner_inode
        self.owner_name = owner_name
        self.alloc_method = alloc_method
        self.next_block = next_block
        self.indexed_targets = indexed_targets if indexed_targets is not None else []
        self.used_bytes = used_bytes
        self.waste_bytes = waste_bytes
        self.hex_preview = hex_preview
        self.ascii_preview = ascii_preview

    def to_dict(self) -> Dict[str, Any]:
        return {
            "block_id": self.block_id,
            "status": self.status,
            "owner_inode": self.owner_inode,
            "owner_name": self.owner_name,
            "alloc_method": self.alloc_method,
            "next_block": self.next_block,
            "indexed_targets": self.indexed_targets,
            "used_bytes": self.used_bytes,
            "waste_bytes": self.waste_bytes,
            "hex_preview": self.hex_preview,
            "ascii_preview": self.ascii_preview,
        }

