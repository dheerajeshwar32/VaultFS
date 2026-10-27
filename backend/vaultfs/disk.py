"""VaultFS Raw Binary Disk Interface.

Provides direct block-level and byte-level read/write operations over the
physical disk image (disk.img). Every operation enforces strict geometry boundaries
and immediately syncs to disk.
"""

import os
import threading
from typing import Optional
from .constants import BLOCK_SIZE, TOTAL_BLOCKS, DISK_SIZE, VaultFSError


class DiskBoundsError(VaultFSError):
    """Raised when an operation attempts to access blocks or bytes out of bounds."""
    pass


class RawDisk:
    """
    Direct block-level driver over a single raw binary disk image.
    Ensures that every sector write directly mutates disk.img with zero in-memory cheating.
    """

    def __init__(self, image_path: str = "disk.img") -> None:
        self.image_path = os.path.abspath(image_path)
        self._file: Optional[object] = None
        self._lock = threading.RLock()

    def exists(self) -> bool:
        """Check if the disk image file exists and has correct size."""
        return os.path.exists(self.image_path) and os.path.getsize(self.image_path) == DISK_SIZE

    def open(self) -> None:
        """Open the disk image in binary read/write mode."""
        with self._lock:
            if self._file is not None and not self._file.closed:
                return

            if not os.path.exists(self.image_path):
                self._create_zeroed_file(self.image_path)

            self._file = open(self.image_path, "r+b")

    def close(self) -> None:
        """Flush and close the disk image handle."""
        with self._lock:
            if self._file is not None and not self._file.closed:
                self._file.flush()
                self._file.close()
                self._file = None

    def _ensure_open(self) -> None:
        """Ensure file is opened."""
        if self._file is None or self._file.closed:
            self.open()

    @staticmethod
    def _create_zeroed_file(path: str) -> None:
        """Create a zeroed binary disk image of exactly DISK_SIZE bytes."""
        parent_dir = os.path.dirname(path)
        if parent_dir and not os.path.exists(parent_dir):
            os.makedirs(parent_dir, exist_ok=True)
        with open(path, "wb") as f:
            f.write(b"\x00" * DISK_SIZE)

    def init_storage(self) -> None:
        """Ensure disk image exists and is sized to exactly 131,072 bytes."""
        with self._lock:
            if not os.path.exists(self.image_path) or os.path.getsize(self.image_path) != DISK_SIZE:
                if self._file is not None and not self._file.closed:
                    self._file.close()
                    self._file = None
                self._create_zeroed_file(self.image_path)
            self._ensure_open()

    def read_block(self, block_id: int) -> bytes:
        """
        Read exactly BLOCK_SIZE (512) bytes from the specified block.
        """
        if not (0 <= block_id < TOTAL_BLOCKS):
            raise DiskBoundsError(f"Block ID {block_id} out of bounds (0..{TOTAL_BLOCKS - 1})")

        with self._lock:
            self._ensure_open()
            self._file.seek(block_id * BLOCK_SIZE)
            data = self._file.read(BLOCK_SIZE)
            if len(data) != BLOCK_SIZE:
                raise DiskBoundsError(f"Short read at block {block_id}: expected {BLOCK_SIZE}, got {len(data)}")
            return data

    def write_block(self, block_id: int, data: bytes) -> None:
        """
        Write exactly BLOCK_SIZE (512) bytes to the specified block and flush.
        If data is shorter, it is padded with null bytes.
        """
        if not (0 <= block_id < TOTAL_BLOCKS):
            raise DiskBoundsError(f"Block ID {block_id} out of bounds (0..{TOTAL_BLOCKS - 1})")

        if len(data) > BLOCK_SIZE:
            raise DiskBoundsError(f"Block data too large: {len(data)} > {BLOCK_SIZE}")

        if len(data) < BLOCK_SIZE:
            data = data.ljust(BLOCK_SIZE, b"\x00")

        with self._lock:
            self._ensure_open()
            self._file.seek(block_id * BLOCK_SIZE)
            self._file.write(data)
            self._file.flush()

    def read_bytes(self, offset: int, length: int) -> bytes:
        """Read arbitrary byte slice within the disk boundaries."""
        if offset < 0 or offset + length > DISK_SIZE:
            raise DiskBoundsError(f"Offset {offset} + length {length} exceeds disk size {DISK_SIZE}")

        with self._lock:
            self._ensure_open()
            self._file.seek(offset)
            data = self._file.read(length)
            return data

    def write_bytes(self, offset: int, data: bytes) -> None:
        """Write arbitrary byte slice within the disk boundaries and flush."""
        length = len(data)
        if offset < 0 or offset + length > DISK_SIZE:
            raise DiskBoundsError(f"Offset {offset} + length {length} exceeds disk size {DISK_SIZE}")

        with self._lock:
            self._ensure_open()
            self._file.seek(offset)
            self._file.write(data)
            self._file.flush()

    def __enter__(self) -> "RawDisk":
        self.open()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.close()

