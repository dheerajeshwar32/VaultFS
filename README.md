# VaultFS: Virtual File System & Visual Workbench

> **A Kernel-Grade, Persistent Binary File System in `disk.img` paired with an Obsidian-Themed React 18 Telemetry Workbench.**

Built for **Operating Systems (Module 6: File-System Implementation)** to empirically demonstrate **Contiguous**, **Linked**, and **Indexed** disk allocation trade-offs, external vs internal fragmentation, seek distance dynamics, live disk defragmentation, fault injection, and `fsck` repair.

---

## Highlights

- **Real Binary Persistence**: Every read and write seeks and mutates physical sectors inside a single 128 KB raw disk image (`disk.img`) using Python's `struct` module. Zero in-memory caching tricks. If the server restarts, all data persists.
- **Side-by-Side Allocation Strategies**:
  - `Contiguous (0)`: Direct $O(1)$ block addressing; triggers `ExternalFragmentationError` on fragmented disks.
  - `Linked (1)`: Block-tail pointer chains (`<i` at offset 508..512); zero external fragmentation with $O(N)$ seek penalties.
  - `Indexed (2)`: Dedicated index block packing an array of 256 16-bit pointers (`<256h>`); true $O(1)$ random access.
- **Interactive 16x16 Sector Matrix**: Displays all 256 blocks with raw Hex and decoded ASCII previews, occupancy gauges, and an **animated SVG Bezier pointer overlay** linking file sectors.
- **Automated Defragmentation**: Compacts active sectors sequentially, recalculates pointer chains, and restores a single continuous free extent.
- **Fault Injection & `fsck` Healing**: Deliberately injects orphan block leaks, unmarked allocations, and superblock counter drift, then heals them via ground-truth inode traversal.
- **Turnkey 3-Way Benchmark Lab**: Runs an identical 25-step controlled workload to mathematically compare execution times, fragmentation rates, and head seek distances.
- **Interactive Web Terminal**: Full bottom-drawer command line supporting `ls`, `stat`, `cat`, `touch`, `mkdir`, `rm`, `df`, `age`, `defrag`, `corrupt`, and `fsck`.

---

## Architecture & Binary Geometry

VaultFS formats a standardized 131,072-byte (128 KB) disk partitioned into 256 sectors of 512 bytes each:

```
+--------------------------------------------------------------------------------------------------+
| Sector 0    | Sector 1   | Sectors 2..9   | Sectors 10..255                                      |
| Superblock  | Free-Space | Inode Table    | Data Sectors & Index Tables                          |
| (512 Bytes) | Bitmap     | (8 Blocks,     | (246 Blocks, 125,952 Bytes)                          |
|             | (512 B)    | 64 Inodes)     | File Payloads & <256h> Pointer Tables                |
+--------------------------------------------------------------------------------------------------+
```

---

## Quick Start (Turnkey Launcher)

### Option 1: Automatic Launcher (Recommended)
VaultFS includes a cross-platform launcher that boots both backend and frontend, checks dependencies, and launches your browser:

```bash
python start_vaultfs.py
```

### Option 2: Manual Boot

#### 1. Backend Server
```bash
cd backend
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

#### 2. Frontend Visual Workbench
```bash
cd frontend
npm install
npm run dev
```
Open **http://localhost:5173** in your browser.

---

## Running the Automated Test Suite

Run the full pytest suite covering binary alignment, contiguous fit strategies, linked chains, indexed tables, defrag, and fsck:

```bash
$env:PYTHONPATH="backend"
python -m pytest backend/tests -v
```

All 14 tests run in under 2.5 seconds with 100% pass rates.

---

## 3-Minute Technical Demonstration Script

1. **Format Volume**: Click **"Format"** in the top ribbon to demonstrate clean zeroing of `disk.img` and root inode (`/`) initialization.
2. **Simulate Aging**: Click **"Simulate Aging"**. Explain how 14 files were written across Contiguous, Linked, and Indexed methods, 5 files were deleted to create checkerboard holes, and 3 files scattered across those holes. Point out the glowing violet and cyan pointer chains on the 16x16 grid.
3. **Inspect Raw Sectors**: Click any block in the grid to display its live 64-byte Hex dump and decoded ASCII payload in the drawer.
4. **Trigger External Fragmentation**: Open **"+ New File"**, select **Contiguous (0)**, set size to **4,096 Bytes (8 blocks)**, and click Create. Show how VaultFS raises `ExternalFragmentationError` because no single contiguous extent can satisfy 8 blocks.
5. **Defragment Disk**: Click **"Defrag"**. Watch the modal display before vs. after metrics showing External Fragmentation drop to `0.0%` and Head Seek Distance drop to minimum.
6. **Inject Corruption & Heal**: Click **"Corrupt"** to flip bitmap bits and cause superblock counter drift (the health badge turns red). Click **"fsck Repair"** to scan inode ground truth, view the diagnostic anomaly report, and heal the volume back to green.
7. **Benchmark Lab**: Switch to the **Benchmark Lab** tab, click **"Run Comparative Benchmark"**, and show the Recharts comparison and storage strategy evaluation card.

---

## License & Academic Honor Code
Developed for academic laboratory evaluation and OS research. Free to use and inspect.

