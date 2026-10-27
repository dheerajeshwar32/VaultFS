# VaultFS Architecture & Implementation Plan

## Executive Summary
VaultFS is an industry-grade, educational Virtual File System implemented inside a single raw binary disk image (`disk.img`), paired with a real-time React 18 visual workbench. It exposes low-level file system mechanisms—such as superblock bookkeeping, bitmap free-space tracking, inode tables, contiguous/linked/indexed block allocation, external/internal fragmentation, head seek metrics, disk defragmentation, and fsck consistency verification.

---

## Technical Specifications & Architecture

### 1. Disk Geometry
- **Block Size**: 512 bytes
- **Total Blocks**: 256 blocks (Total disk image: 131,072 bytes / 128 KB)
- **Max Inodes**: 64 inodes
- **Block Layout**:
  - `Block 0`: Superblock (512 bytes)
  - `Block 1`: Free-Space Bitmap (512 bytes; first 256 bytes represent blocks 0..255: 0=free, 1=allocated; rest padded)
  - `Blocks 2..9`: Inode Table (8 blocks * 8 inodes/block = 64 inodes of 64 bytes each)
  - `Blocks 10..255`: Data Area (246 blocks for file payloads and index blocks)
- **System Reserved**: Blocks 0..9 are permanently allocated.

### 2. Binary Struct Formats (Little-Endian `<`)
- **Superblock (`<8s9IB467x` = 512 bytes)**:
  - `magic` (8s): `b"VAULTFS1"`
  - `block_size` (I): 512
  - `total_blocks` (I): 256
  - `total_inodes` (I): 64
  - `bitmap_block` (I): 1
  - `inode_start_block` (I): 2
  - `data_start_block` (I): 10
  - `free_blocks` (I): 198
  - `free_inodes` (I): 55
  - `mount_count` (I): incremented upon mount
  - `default_alloc` (B): 0 (Contiguous), 1 (Linked), 2 (Indexed)
  - Pad: 467 bytes

- **Inode (`<BBBBIIIIhhhh32s4x` = 64 bytes)**:
  - `inode_id` (B): 0..63
  - `in_use` (B): 0=free, 1=active
  - `file_type` (B): 0=file, 1=directory
  - `alloc_method` (B): 0=Contiguous, 1=Linked, 2=Indexed
  - `size_bytes` (I): logical payload size in bytes
  - `block_count` (I): total blocks consumed
  - `created_at` (I): unix timestamp
  - `modified_at` (I): unix timestamp
  - `start_block` (h): first data block (-1 if empty)
  - `end_or_len` (h): contiguous block length for Contiguous; last block ID for Linked; -1 for Indexed
  - `index_block` (h): index block ID for Indexed; -1 for others
  - `parent_inode` (h): parent directory inode ID (0 for root `/`)
  - `name` (32s): UTF-8 filename padded with `\x00`
  - Pad: 4 bytes

- **Linked Allocation Pointer**:
  - Stored in bytes 508..512 of each linked block as `<i` (signed 32-bit int).
  - `-1` indicates End of File (EOF).
  - Effective payload per block: 508 bytes.

- **Indexed Allocation Table**:
  - Packed inside the dedicated index block as `<256h` (256 signed 16-bit integers = 512 bytes).
  - `-1` indicates unused slot.
  - Effective payload per data block: 512 bytes.

---

## Phased Execution Roadmap

### Phase 1: Backend Foundation & Binary Engine
- `backend/vaultfs/constants.py`: Geometry constants, struct formats, allocation/file types, custom exceptions (`ExternalFragmentationError`, `DiskFullError`, `CorruptionDetectedError`, etc.).
- `backend/vaultfs/disk.py`: Low-level block read/write interface with boundary validation and raw binary persistence in `disk.img`.
- `backend/vaultfs/models.py`: Binary serialization & deserialization for Superblock, Inode, DirectoryEntry, and BlockInfo.
- `backend/vaultfs/engine.py`: High-level virtual file system engine:
  - Volume formatting, mounting, state extraction.
  - Contiguous allocation with `first_fit` and `best_fit`, plus explicit `ExternalFragmentationError` checking.
  - Linked allocation with block-tail pointer chains (`<i`).
  - Indexed allocation with dedicated index block (`<256h`).
  - File reading, payload reassembly, file deletion, and directory creation.
  - Aging simulation (14 files created, 5 deleted, 3 scattered files allocated).
  - Defragmentation with sequential block compaction, pointer rewrites, and seek optimization.
  - Intentional corruption injection (orphan leaks, unmarked allocations, superblock drift).
  - `fsck` file system consistency check and automated repair.
- `backend/vaultfs/benchmark.py`: Isolated 3-way comparative benchmark runner comparing Contiguous, Linked, and Indexed allocation across 25 operations.
- `backend/tests/test_engine.py`: Unit and integration test suite covering format, all 3 allocation schemes, read/write parity, aging, defrag, corruption, and fsck.

### Phase 2: FastAPI REST & WebSocket Server
- `backend/main.py`:
  - CORS-enabled FastAPI application with WebSocket broadcast on `/ws`.
  - Full REST endpoints matching Section 3 specification.
  - Serialization of raw 64-byte hex and ASCII previews for every block.
- Verification: Run `pytest` on backend until 100% test pass.

### Phase 3: Modern React 18 Visual Workbench
- Setup Vite + React 18 + TypeScript + Tailwind CSS + Lucide Icons + Framer Motion + Recharts.
- Strict TypeScript models matching FastAPI schemas in `frontend/src/types/vfs.ts`.
- API client with typed fetch and WebSocket integration in `frontend/src/api/client.ts`.
- Components:
  - `TopCommandBar.tsx`: System status, mount count, volume health indicator, action buttons.
  - `BlockMatrix.tsx`: 16x16 grid showing 256 blocks, block occupancy bars, live Hex/ASCII inspector, and animated SVG Bezier pointer overlay for Linked chains and Indexed hubs.
  - `FileExplorer.tsx`: Tree explorer, inode details drawer, new file modal with allocation strategies and fit algorithms.
  - `TelemetryPanel.tsx`: External/internal fragmentation gauges, head seek distance, extent histogram.
  - `BenchmarkLab.tsx`: Comparative benchmarks with Recharts visual graphs and viva explanation cards.
  - `WebTerminal.tsx`: Interactive shell with command history, output log, and 1-click quick-action chips.

### Phase 4: Verification, Launcher & Academic Report
- `start_vaultfs.py`: Cross-platform Windows/Mac/Linux launcher.
- `docs/OS_PROJECT_REPORT.md`: Comprehensive OS project report with syllabus mapping, binary layouts, algorithm pseudocode, and 10-question Viva defense guide.
- Complete end-to-end integration test on Windows.

