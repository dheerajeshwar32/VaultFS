# VaultFS: Virtual File System Implementation & Operating Systems Project Report

---

## Academic Information
- **Course**: Operating Systems (CS 301 / CSE 312)
- **Module Mapping**: Module 6 — File-System Interface & File-System Implementation
- **Authors**: Principal Systems Architect & Staff Design Engineer
- **Core Technology**: Python 3 `struct` binary serialization, 128 KB raw block image (`disk.img`), FastAPI REST/WebSocket telemetry engine, React 18 / TypeScript visual workbench.

---

## 1. Executive Summary & Educational Motivation

Traditional university operating systems courses teach file system concepts—such as inodes, allocation strategies, directory trees, fragmentation, and file system integrity checks (`fsck`)—primarily through abstract diagrams. When students do code, they often build toy in-memory mock file systems (Python dictionaries or C memory buffers) that completely bypass the real challenges of binary disk layouts, block alignment, sector-level persistence, and hardware-constrained fragmentation.

**VaultFS** bridges this pedagogical gap by providing:
1. **Real Sector Persistence**: 100% of volume state is stored in a single 128 KB binary image file (`disk.img`). Every operation seeks and writes raw little-endian binary bytes.
2. **Side-by-Side Allocation Comparison**: True runtime implementations of **Contiguous**, **Linked**, and **Indexed** allocation running over the exact same disk geometry.
3. **Hardware Emulation & Visual Telemetry**: A real-time 16x16 interactive sector matrix displaying raw hex dumps, ASCII streams, animated Bezier pointer overlays, head seek distance calculations, and fragmentation gauges.
4. **Resilience & Forensics**: Live fault injection (orphan leaks, unmarked blocks, superblock drift) and an automated `fsck` engine that traverses inode ground truth to heal corrupted storage.

---

## 2. Disk Geometry & Physical Layout

VaultFS formats a standardized 131,072-byte (128 KB) raw binary file partitioned into 256 physical sectors of 512 bytes each:

```
+--------------------------------------------------------------------------------------------------+
| Sector 0    | Sector 1   | Sectors 2..9   | Sectors 10..255                                      |
| Superblock  | Free-Space | Inode Table    | Data Area & Index Blocks                             |
| (512 Bytes) | Bitmap     | (8 Blocks,     | (246 Blocks, 125,952 Bytes)                          |
|             | (512 B)    | 64 Inodes)     | Payloads & <256h> Pointer Tables                     |
+--------------------------------------------------------------------------------------------------+
```

### 2.1 Disk Partition Geometry Table

| Region | Physical Sector(s) | Byte Offset Range | Size | Description |
| :--- | :--- | :--- | :--- | :--- |
| **Superblock** | Sector `0` | `0x00000` – `0x001FF` | 512 B | Global volume metadata, geometry, mount count, alloc default. |
| **Allocation Bitmap** | Sector `1` | `0x00200` – `0x003FF` | 512 B | 1-byte per sector allocation status for sectors 0..255. |
| **Inode Table** | Sectors `2` – `9` | `0x00400` – `0x013FF` | 4,096 B | 64 Inodes (64 B each, 8 per sector). Inode 0 is root (`/`). |
| **Data Area** | Sectors `10` – `255` | `0x01400` – `0x1FFFF` | 125,952 B | 246 data sectors used for file payloads and index blocks. |

---

## 3. Binary Struct Formats & Endian Alignment

All binary structures are packed using **Little-Endian** byte order (`<`) via Python's native `struct` module.

### 3.1 Superblock Struct Layout (`<8s9IB467x` = 512 Bytes)

```
Offset (Hex) | Offset (Dec) | Type | Field Name         | Description
0x0000       | 0            | 8s   | magic              | Magic identifier: b"VAULTFS1"
0x0008       | 8            | I    | block_size         | 512 (Bytes per sector)
0x000C       | 12           | I    | total_blocks       | 256 (Total sectors on disk)
0x0010       | 16           | I    | total_inodes       | 64 (Capacity of inode table)
0x0014       | 20           | I    | bitmap_block       | 1 (Sector index of allocation bitmap)
0x0018       | 24           | I    | inode_start_block  | 2 (First sector of inode table)
0x001C       | 28           | I    | data_start_block   | 10 (First sector of data area)
0x0020       | 32           | I    | free_blocks        | Dynamic count of unallocated data sectors
0x0024       | 36           | I    | free_inodes        | Dynamic count of unallocated inodes
0x0028       | 40           | I    | mount_count        | Volume mount counter (incremented on boot)
0x002C       | 44           | B    | default_alloc      | Default allocation strategy (0, 1, or 2)
0x002D       | 45           | 467x | _pad               | 467 null bytes (Zero padding to exactly 512B)
```

$$\text{Superblock Size} = 8 + (9 \times 4) + 1 + 467 = 512 \text{ Bytes}$$

### 3.2 Inode Struct Layout (`<BBBBIIIIhhhh32s4x` = 64 Bytes)

```
Offset (Hex) | Offset (Dec) | Type | Field Name     | Description
0x0000       | 0            | B    | inode_id       | Inode number (0..63)
0x0001       | 1            | B    | in_use         | 0 = Free, 1 = Active
0x0002       | 2            | B    | file_type      | 0 = Regular File, 1 = Directory
0x0003       | 3            | B    | alloc_method   | 0 = Contiguous, 1 = Linked, 2 = Indexed
0x0004       | 4            | I    | size_bytes     | Exact logical file size in bytes
0x0008       | 8            | I    | block_count    | Total disk sectors consumed (data + index)
0x000C       | 12           | I    | created_at     | Unix timestamp (seconds)
0x0010       | 16           | I    | modified_at    | Unix timestamp (seconds)
0x0014       | 20           | h    | start_block    | First sector ID (or -1 if empty)
0x0016       | 22           | h    | end_or_len     | Contiguous length (Method 0) / Last sector (Method 1)
0x0018       | 24           | h    | index_block    | Sector ID of Index Table (Method 2; -1 otherwise)
0x001A       | 26           | h    | parent_inode   | Parent directory Inode ID (0 for root)
0x001C       | 28           | 32s  | name           | Filename encoded in UTF-8, null-padded
0x003C       | 60           | 4x   | _pad           | 4 null bytes (Alignment to exactly 64B)
```

$$\text{Inode Size} = 1 + 1 + 1 + 1 + (4 \times 4) + (4 \times 2) + 32 + 4 = 64 \text{ Bytes}$$
$$\text{Inodes Per Sector} = \frac{512 \text{ Bytes}}{64 \text{ Bytes}} = 8 \text{ Inodes}$$
$$\text{Total Inode Sectors} = \frac{64 \text{ Inodes}}{8} = 8 \text{ Sectors (Sectors 2..9)}$$

---

## 4. Allocation Strategy Mechanics

VaultFS implements the three foundational disk allocation strategies studied in Operating Systems:

```
1. CONTIGUOUS ALLOCATION:
   [Inode] -> start_block: 10, length: 3
              Sector 10 [ Payload Chunk 1 (512B) ]
              Sector 11 [ Payload Chunk 2 (512B) ]
              Sector 12 [ Payload Chunk 3 (512B) ]

2. LINKED ALLOCATION:
   [Inode] -> start_block: 14
              Sector 14 [ 508B Data | next: 28 ] ---> Sector 28 [ 508B Data | next: 33 ] ---> Sector 33 [ 508B Data | next: -1 (EOF) ]

3. INDEXED ALLOCATION:
   [Inode] -> index_block: 18
              Sector 18 [ Index Table <256h>: [22, 29, 35, -1, -1...] ]
                           |       |       |
                           v       v       v
                        Sec 22  Sec 29  Sec 35
```

### 4.1 Contiguous Allocation (`alloc_method = 0`)
- **Block Payload Capacity**: 512 bytes.
- **Addressing Mechanism**: Direct calculation. Block $k$ of a file is located at $\text{start\_block} + k$.
- **Time Complexity**:
  - Sequential Access: $O(1)$
  - Random Access: $O(1)$
- **External Fragmentation**:
  When free space is scattered into isolated holes, contiguous allocation fails if no single hole is $\ge N$ blocks, even if total free blocks $\ge N$. VaultFS raises:
  ```python
  ExternalFragmentationError(
      f"Contiguous allocation failed: Need {N} contiguous blocks, have {free_blocks} total free blocks, but largest contiguous extent is only {largest_extent} blocks."
  )
  ```
- **Fit Algorithms**:
  - **First-Fit**: Scans extents and selects the first contiguous run $\ge N$.
  - **Best-Fit**: Scans all extents and selects the smallest contiguous run $\ge N$ to minimize residual extent slivers.

### 4.2 Linked Allocation (`alloc_method = 1`)
- **Block Payload Capacity**: 508 bytes payload + 4 bytes pointer (`<i`).
- **Addressing Mechanism**: Pointer chasing. Offset 508 of Sector $k$ contains a 32-bit signed integer pointing to Sector $k+1$. Value `-1` denotes End of File (EOF).
- **Time Complexity**:
  - Sequential Access: $O(1)$ per subsequent read
  - Random Access: $O(N)$ (must traverse $k-1$ previous pointers from disk)
- **External Fragmentation**: **0.0%**. Any arbitrary free sector on the disk can be linked into the chain.
- **Head Seek Penalty**: Non-adjacent block allocation leads to high disk arm travel.

### 4.3 Indexed Allocation (`alloc_method = 2`)
- **Block Payload Capacity**: 512 bytes per data block.
- **Index Block Structure**: 1 dedicated sector holding an array of 256 16-bit signed integers (`<256h>` = 512 bytes). Unused slots hold `-1`.
- **Addressing Mechanism**: Direct index lookup. Block $k$ is found at `index_table[k]`.
- **Time Complexity**:
  - Sequential Access: $O(1)$
  - Random Access: $O(1)$
- **Storage Overhead**: Exactly 1 dedicated index sector (512 bytes) per file.

---

## 5. Defragmentation & FSCK Algorithms

### 5.1 Sequential Disk Defragmentation Algorithm
```
Algorithm 1: Sequential Disk Compaction (defrag)
Input: Volume with fragmented data sectors [10..255]
Output: Compacted volume with zero external fragmentation and minimized seek distances

1. Read all active inodes (1..63) where file_type == TYPE_FILE.
2. For each active inode i:
     Read full logical payload bytes into memory buffer.
     Record old block chain: old_chain = get_inode_blocks(i).
3. Zero out physical sectors 10 through 255.
4. Reset Bitmap: sectors 0..9 = 1, sectors 10..255 = 0.
5. Set current_sector = 10.
6. For each buffered file:
     If Contiguous:
       Write payload into sectors [current_sector .. current_sector + N - 1].
       Update inode.start_block = current_sector, inode.end_or_len = N.
       current_sector += N.
     If Linked:
       Write payload chunks with sequential pointers (current_sector + 1, ..., -1).
       Update inode.start_block = current_sector, inode.end_or_len = current_sector + N - 1.
       current_sector += N.
     If Indexed:
       Write index block at current_sector pointing to data blocks [current_sector + 1 .. current_sector + N - 1].
       Write data blocks at [current_sector + 1 .. current_sector + N - 1].
       Update inode.index_block = current_sector, inode.start_block = current_sector + 1.
       current_sector += N.
7. Mark sectors 10 .. current_sector - 1 as 1 in Bitmap.
8. Update Superblock.free_blocks = 256 - current_sector.
9. Flush updated Inodes, Bitmap, and Superblock to disk.img.
```

### 5.2 File System Consistency Checker (fsck) Ground-Truth Traversal
```
Algorithm 2: File System Ground-Truth Consistency Audit (fsck)
Input: disk.img with potential bit rot or metadata corruption
Output: Anomaly diagnostics list and repaired binary disk image

1. Initialize ground_truth_set = {0, 1, 2, 3, 4, 5, 6, 7, 8, 9} (System reserved sectors).
2. For each inode i from 0 to 63:
     If inode.in_use == 1:
       Walk block chain (Contiguous range, Linked chain, or Index table).
       Add all referenced sectors to ground_truth_set.
       Check for sector sharing: If sector already in ground_truth_set, flag CROSS_LINKED_BLOCK.
3. Read Bitmap from Sector 1.
4. For sector b from 10 to 255:
     If Bitmap[b] == 1 and b NOT in ground_truth_set:
       Flag ORPHAN_BLOCK_LEAK (Sector marked allocated but no inode owns it).
       If repair == True: set Bitmap[b] = 0.
     If Bitmap[b] == 0 and b IN ground_truth_set:
       Flag UNMARKED_ALLOCATED_BLOCK (Sector owned by inode but marked free).
       If repair == True: set Bitmap[b] = 1.
5. Read Superblock from Sector 0.
6. expected_free_blocks = 256 - len(ground_truth_set).
7. If Superblock.free_blocks != expected_free_blocks:
     Flag SUPERBLOCK_FREE_BLOCKS_DRIFT.
     If repair == True: Superblock.free_blocks = expected_free_blocks.
8. If repair == True:
     Flush repaired Bitmap to Sector 1 and repaired Superblock to Sector 0.
```

---

## 6. Faculty Viva Voce Defense Guide (10 High-Scoring Questions)

### Question 1: What constitutes the physical boundary between metadata and data in VaultFS?
**Answer**:
Physical sector 10 (`byte offset 0x01400`, or 5,120 bytes from image start) is the strict boundary. Sectors 0 through 9 are permanently reserved for metadata upon volume format: Sector 0 is the Superblock, Sector 1 is the Allocation Bitmap, and Sectors 2 through 9 hold the 64-entry Inode Table. Sectors 10 through 255 (246 sectors = 125,952 bytes) constitute the data region.

### Question 2: Why does Linked Allocation achieve zero external fragmentation while Contiguous allocation fails?
**Answer**:
Contiguous allocation requires a single uninterrupted physical extent of length $N$. If disk deletions create isolated single-block holes, the space cannot satisfy any request where $N > 1$. Linked allocation only requires individual blocks; each block stores a 4-byte pointer (`<i`) to the next available block anywhere across the disk, allowing it to utilize scattered holes.

### Question 3: Why does Linked Allocation degrade performance during random file seeks?
**Answer**:
To access byte offset $B$ in a linked file, the operating system must calculate the target block $k = \lfloor B / 508 \rfloor$. Because there is no central index table, the disk driver must physically read Sector 1, read its pointer at byte 508, seek to Sector 2, read its pointer, and repeat $k-1$ times. This sequential pointer chasing has a time complexity of $O(N)$ and causes severe disk head travel.

### Question 4: How does Indexed Allocation resolve the trade-off between Contiguous and Linked?
**Answer**:
Indexed allocation allocates a single dedicated Index Block that stores a direct array of pointers (`<256h>` in VaultFS). This provides:
1. **Zero External Fragmentation**: Data blocks can be placed in any available free sector.
2. **$O(1)$ Random Access**: Block $k$ is directly addressed by reading index entry `table[k]`.
The only cost is a fixed 1-sector overhead per file.

### Question 5: How does VaultFS calculate External Fragmentation percentage?
**Answer**:
VaultFS uses the standard operating systems formula comparing the largest contiguous free extent against total available free blocks:
$$\text{External Fragmentation \%} = \left( 1.0 - \frac{\text{Largest Free Extent}}{\text{Total Free Blocks}} \right) \times 100$$
If all free blocks form a single contiguous run, the ratio is $1.0$, resulting in $0.0\%$ fragmentation. As free blocks become split across multiple holes, the ratio decreases and fragmentation approaches $100\%$.

### Question 6: What is Slack Space (Internal Fragmentation) and how does VaultFS measure it?
**Answer**:
Internal fragmentation occurs because storage is allocated in fixed-size blocks (512 bytes). If a file has 600 bytes of payload, it consumes two 512-byte blocks (1,024 bytes). The unused 424 bytes in the second block cannot be allocated to another file and represent wasted space. VaultFS computes internal waste for each file as:
$$\text{Waste} = (\text{Allocated Capacity}) - (\text{Logical File Size})$$

### Question 7: How is data consistency maintained across server restarts?
**Answer**:
VaultFS does not keep file system data in RAM. Every `create_and_write_file`, `delete_file`, or `mkdir` call directly updates the underlying binary image using Python's `RawDisk` driver, which seeks to the sector offset, executes binary write, and immediately calls `file.flush()`. When the server boots, it mounts `disk.img` by reading Sector 0 and incrementing `mount_count`.

### Question 8: Explain the mechanism of the Orphan Block Leak injected by `/api/corrupt`.
**Answer**:
An Orphan Block Leak occurs when a sector's status bit in the Free-Space Bitmap (Sector 1) is set to `1` (Allocated), but no active inode in the Inode Table claims ownership of that sector. This causes the file system to lose capacity permanently until `fsck` scans the inode table, identifies that no inode owns the sector, and clears the bit back to `0`.

### Question 9: Why does `fsck` trust the Inode Table over the Free-Space Bitmap?
**Answer**:
In Unix and POSIX architectures, the Inode Table is the primary authority on file existence and block ownership. The Bitmap is merely an allocation cache. If a discrepancy exists between what files exist and what the bitmap records, the file data must be preserved; therefore, the ground truth of active inodes dictates how the bitmap is reconstructed.

### Question 10: How does Disk Defragmentation optimize Head Seek Distance?
**Answer**:
Head seek distance is the absolute difference in physical sector addresses between consecutive block accesses: $\sum |b_{i+1} - b_i|$. On a fragmented disk, a 4-block file might span sectors `[14, 89, 23, 110]`, causing a total seek distance of:
$$|89 - 14| + |23 - 89| + |110 - 23| = 75 + 66 + 87 = 228 \text{ sectors}$$
Defragmentation compacts the file into sequential sectors `[10, 11, 12, 13]`, reducing seek distance to:
$$|11 - 10| + |12 - 11| + |13 - 12| = 1 + 1 + 1 = 3 \text{ sectors}$$
This yields an immediate ~98.7% reduction in mechanical seek overhead.

---

## 7. Verification & Test Suite Summary

VaultFS includes a comprehensive automated test suite (`backend/tests/`) with 100% pass rates:
- `test_disk_geometry_and_format`: Verifies 128 KB size, superblock magic, and root inode.
- `test_contiguous_allocation_and_read_parity`: Verifies exact byte reconstruction for Contiguous files.
- `test_linked_allocation_and_read_parity`: Verifies pointer chain packing and unpacking.
- `test_indexed_allocation_and_read_parity`: Verifies `<256h>` table block integrity.
- `test_first_fit_vs_best_fit`: Verifies extent selection heuristics.
- `test_contiguous_external_fragmentation_error`: Proves that `ExternalFragmentationError` triggers when holes exist.
- `test_directory_creation_and_child_deletion_guard`: Proves non-empty directory deletion guards.
- `test_aging_and_defragmentation`: Proves 100% payload preservation through sequential defrag.
- `test_corruption_injection_and_fsck_repair`: Proves automatic detection and healing of all 3 fault types.
- `test_benchmark_runner`: Proves 3-way comparative benchmark execution and metrics calculations.

