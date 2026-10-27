"""VaultFS Constants, Geometry, Struct Formats, and Error Definitions."""

import struct

# Disk Geometry
BLOCK_SIZE = 512
TOTAL_BLOCKS = 256
DISK_SIZE = BLOCK_SIZE * TOTAL_BLOCKS  # 131,072 bytes (128 KB)
MAX_INODES = 64

SUPERBLOCK_BLOCK = 0
BITMAP_BLOCK = 1
INODE_START_BLOCK = 2
INODE_BLOCKS = 8  # Blocks 2..9 hold 8 inodes each = 64 inodes
DATA_START_BLOCK = 10
DATA_BLOCKS = TOTAL_BLOCKS - DATA_START_BLOCK  # 246 data blocks (10..255)
INODES_PER_BLOCK = BLOCK_SIZE // 64  # 8

# Allocation Strategy IDs
ALLOC_CONTIGUOUS = 0
ALLOC_LINKED = 1
ALLOC_INDEXED = 2

ALLOC_LABELS = {
    ALLOC_CONTIGUOUS: "CONTIGUOUS",
    ALLOC_LINKED: "LINKED",
    ALLOC_INDEXED: "INDEXED",
}

# File Type IDs
TYPE_FILE = 0
TYPE_DIR = 1

TYPE_LABELS = {
    TYPE_FILE: "FILE",
    TYPE_DIR: "DIRECTORY",
}

# Magic identifier
MAGIC = b"VAULTFS1"

# Binary struct formats (Little-Endian)
SUPERBLOCK_FMT = "<8s9IB467x"
assert struct.calcsize(SUPERBLOCK_FMT) == 512, f"SUPERBLOCK_FMT size mismatch: {struct.calcsize(SUPERBLOCK_FMT)}"

INODE_FMT = "<BBBBIIIIhhhh32s4x"
assert struct.calcsize(INODE_FMT) == 64, f"INODE_FMT size mismatch: {struct.calcsize(INODE_FMT)}"

INDEX_BLOCK_FMT = "<256h"
assert struct.calcsize(INDEX_BLOCK_FMT) == 512, f"INDEX_BLOCK_FMT size mismatch: {struct.calcsize(INDEX_BLOCK_FMT)}"

LINKED_PTR_FMT = "<i"
LINKED_PTR_OFFSET = 508
LINKED_PAYLOAD_SIZE = 508
EOF_POINTER = -1


# VaultFS Error Hierarchy
class VaultFSError(Exception):
    """Base exception for all VaultFS file system errors."""
    pass


class DiskFullError(VaultFSError):
    """Raised when the disk has insufficient free blocks."""
    pass


class InodeTableFullError(VaultFSError):
    """Raised when all 64 inodes are in active use."""
    pass


class ExternalFragmentationError(VaultFSError):
    """
    Critical OS teaching error raised when sufficient free blocks exist across the disk,
    but cannot satisfy a contiguous allocation request due to fragmented extents.
    """
    pass


class VaultFSFileNotFoundError(VaultFSError):
    """Raised when a requested file or inode does not exist."""
    pass


class VaultFSFileExistsError(VaultFSError):
    """Raised when attempting to create a file or directory that already exists."""
    pass


class DirectoryNotEmptyError(VaultFSError):
    """Raised when attempting to delete a directory containing entries."""
    pass


class InvalidAllocationError(VaultFSError):
    """Raised when an invalid allocation method is specified."""
    pass


class CorruptionDetectedError(VaultFSError):
    """Raised when low-level integrity verification detects structural corruption."""
    pass

