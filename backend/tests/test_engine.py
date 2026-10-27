"""Comprehensive Test Suite for VaultFS Binary Engine.

Tests:
- Geometry, struct alignment, and clean format
- Contiguous, Linked, and Indexed read/write byte-parity
- First-Fit vs Best-Fit allocation algorithms
- External Fragmentation detection and exception raising
- Directory hierarchy and recursive deletion guards
- Disk Aging simulation
- Sequential Defragmentation and payload preservation
- Fault injection and fsck anomaly detection and repair
- 3-way Benchmark execution
"""

import os
import tempfile
import pytest

from vaultfs.constants import (
    BLOCK_SIZE,
    TOTAL_BLOCKS,
    DISK_SIZE,
    MAX_INODES,
    DATA_START_BLOCK,
    ALLOC_CONTIGUOUS,
    ALLOC_LINKED,
    ALLOC_INDEXED,
    MAGIC,
    ExternalFragmentationError,
    DiskFullError,
    DirectoryNotEmptyError,
    VaultFSFileNotFoundError,
    VaultFSFileExistsError,
)
from vaultfs.engine import VaultFSEngine
from vaultfs.benchmark import BenchmarkRunner


@pytest.fixture
def temp_engine():
    """Fixture providing a cleanly formatted engine backed by a temporary file."""
    fd, path = tempfile.mkstemp(suffix=".img", prefix="vaultfs_test_")
    os.close(fd)
    if os.path.exists(path):
        os.remove(path)

    engine = VaultFSEngine(image_path=path)
    engine.format(default_alloc=ALLOC_CONTIGUOUS)
    yield engine

    try:
        engine.disk.close()
        if os.path.exists(path):
            os.remove(path)
    except Exception:
        pass


def test_disk_geometry_and_format(temp_engine):
    """Test disk size, superblock, bitmap, and root directory initialization."""
    engine = temp_engine
    assert os.path.getsize(engine.image_path) == DISK_SIZE

    sb = engine.read_superblock()
    assert sb.magic == MAGIC
    assert sb.block_size == BLOCK_SIZE
    assert sb.total_blocks == TOTAL_BLOCKS
    assert sb.total_inodes == MAX_INODES
    assert sb.free_blocks == 246
    assert sb.free_inodes == 63
    assert sb.mount_count >= 1

    bitmap = engine.get_bitmap()
    # Blocks 0..9 system reserved
    for b in range(10):
        assert bitmap[b] == 1
    # Blocks 10..255 free
    for b in range(10, TOTAL_BLOCKS):
        assert bitmap[b] == 0

    root_inode = engine.read_inode(0)
    assert root_inode.in_use == 1
    assert root_inode.name == "/"
    assert root_inode.file_type == 1  # Directory


def test_contiguous_allocation_and_read_parity(temp_engine):
    """Test contiguous allocation and exact byte read parity."""
    engine = temp_engine
    data = b"HELLO_VAULTFS_CONTIGUOUS_" * 50  # 1250 bytes -> 3 blocks
    inode = engine.create_and_write_file("test_contig.txt", 0, data, ALLOC_CONTIGUOUS)

    assert inode.size_bytes == len(data)
    assert inode.block_count == 3
    assert inode.start_block == DATA_START_BLOCK
    assert inode.end_or_len == 3

    read_back = engine.read_file(inode.inode_id)
    assert read_back == data

    # Check bitmap
    bitmap = engine.get_bitmap()
    assert bitmap[DATA_START_BLOCK] == 1
    assert bitmap[DATA_START_BLOCK + 1] == 1
    assert bitmap[DATA_START_BLOCK + 2] == 1
    assert bitmap[DATA_START_BLOCK + 3] == 0


def test_linked_allocation_and_read_parity(temp_engine):
    """Test linked allocation with pointer chains and byte parity."""
    engine = temp_engine
    # 508 bytes per block -> 1800 bytes requires 4 blocks
    data = b"LINKED_DATA_STREAM_" * 95
    data = data[:1800]
    inode = engine.create_and_write_file("test_linked.log", 0, data, ALLOC_LINKED)

    assert inode.size_bytes == 1800
    assert inode.block_count == 4

    blocks = engine.get_inode_blocks(inode)
    assert len(blocks) == 4

    read_back = engine.read_file(inode.inode_id)
    assert read_back == data


def test_indexed_allocation_and_read_parity(temp_engine):
    """Test indexed allocation with index table block and byte parity."""
    engine = temp_engine
    # 512 bytes per data block -> 1600 bytes requires 4 data blocks + 1 index block = 5 blocks
    data = b"INDEXED_CHUNK_" * 120
    data = data[:1600]
    inode = engine.create_and_write_file("test_indexed.db", 0, data, ALLOC_INDEXED)

    assert inode.size_bytes == 1600
    assert inode.block_count == 5  # 1 index + 4 data

    blocks = engine.get_inode_blocks(inode)
    assert len(blocks) == 5
    assert blocks[0] == inode.index_block

    read_back = engine.read_file(inode.inode_id)
    assert read_back == data


def test_first_fit_vs_best_fit(temp_engine):
    """Test contiguous fit strategies."""
    engine = temp_engine
    # Create 3 files: F1 (2 blocks), F2 (4 blocks), F3 (2 blocks)
    f1 = engine.create_and_write_file("f1", 0, b"A" * 1000, ALLOC_CONTIGUOUS)  # blocks 10..11
    f2 = engine.create_and_write_file("f2", 0, b"B" * 2000, ALLOC_CONTIGUOUS)  # blocks 12..15
    f3 = engine.create_and_write_file("f3", 0, b"C" * 1000, ALLOC_CONTIGUOUS)  # blocks 16..17

    # Delete f2 (leaves hole of 4 blocks at 12..15)
    engine.delete_file(f2.inode_id)

    # Now create F4 (5 blocks at 18..22)
    f4 = engine.create_and_write_file("f4", 0, b"D" * 2500, ALLOC_CONTIGUOUS)

    # Delete f4 (leaves hole of 5 blocks at 18..22)
    engine.delete_file(f4.inode_id)

    # Now we have holes: [12..15] (len 4) and [18..22] (len 5) and [23..255] (len 233)
    # Request 3 blocks with best_fit: should choose [12..15] (smallest extent >= 3)
    fit_test = engine.create_and_write_file("best_fit_file", 0, b"E" * 1500, ALLOC_CONTIGUOUS, fit_strategy="best_fit")
    assert fit_test.start_block == 12


def test_contiguous_external_fragmentation_error(temp_engine):
    """Test that ExternalFragmentationError is correctly triggered when space is fragmented."""
    engine = temp_engine

    # Fill data area with small 1-block files
    files = []
    # Create 20 small files of 1 block each
    for i in range(20):
        f = engine.create_and_write_file(f"frag_{i}", 0, b"X" * 400, ALLOC_CONTIGUOUS)
        files.append(f)

    # Fill remaining space with one large contiguous file
    sb = engine.read_superblock()
    remaining = sb.free_blocks
    big_data = b"Y" * (remaining * 512)
    big_file = engine.create_and_write_file("big_tail", 0, big_data, ALLOC_CONTIGUOUS)

    # Now delete every second small file (0, 2, 4, 6, 8, 10, 12, 14, 16, 18)
    # This creates 10 isolated 1-block holes! Total free blocks = 10, but largest extent = 1!
    for i in range(0, 20, 2):
        engine.delete_file(files[i].inode_id)

    sb_after = engine.read_superblock()
    assert sb_after.free_blocks == 10

    extents = engine.get_free_extents()
    largest = max(length for _, length in extents)
    assert largest == 1

    # Requesting 2 contiguous blocks must raise ExternalFragmentationError!
    with pytest.raises(ExternalFragmentationError) as exc_info:
        engine.create_and_write_file("should_fail", 0, b"Z" * 800, ALLOC_CONTIGUOUS)

    assert "ExternalFragmentationError" in str(type(exc_info.value).__name__)
    assert "largest contiguous extent is only 1 blocks" in str(exc_info.value)


def test_directory_creation_and_child_deletion_guard(temp_engine):
    """Test directory hierarchy and prevention of deleting non-empty directories."""
    engine = temp_engine
    docs_dir = engine.mkdir("documents", 0)
    assert docs_dir.file_type == 1

    # Create file inside documents
    child_file = engine.create_and_write_file("notes.txt", docs_dir.inode_id, b"Meeting Notes", ALLOC_CONTIGUOUS)
    assert child_file.parent_inode == docs_dir.inode_id

    # Attempting to delete documents directory directly must fail with DirectoryNotEmptyError
    with pytest.raises(DirectoryNotEmptyError):
        engine.delete_file(docs_dir.inode_id)

    # Delete child file first
    engine.delete_file(child_file.inode_id)

    # Now directory deletion succeeds
    engine.delete_file(docs_dir.inode_id)
    assert engine.read_inode(docs_dir.inode_id).in_use == 0


def test_aging_and_defragmentation(temp_engine):
    """Test disk aging simulation and subsequent offline defragmentation."""
    engine = temp_engine
    state, log = engine.simulate_aging()
    assert len(log) > 5
    assert state["metrics"]["external_frag_percent"] > 0

    # Ensure files exist and can be read before defrag
    active_inodes = [in_obj for in_obj in state["inodes"] if in_obj["file_type"] == 0]
    assert len(active_inodes) > 5

    original_payloads = {}
    for in_dict in active_inodes:
        iid = in_dict["inode_id"]
        original_payloads[iid] = engine.read_file(iid)

    # Run defrag
    defrag_result = engine.defrag()
    assert "before" in defrag_result
    assert "after" in defrag_result
    assert len(defrag_result["moves"]) > 0

    # Verify after defrag: external fragmentation is 0% (single contiguous free space)
    assert defrag_result["after"]["external_frag_percent"] == 0.0

    # Verify that every file's payload is 100% preserved
    for iid, orig_bytes in original_payloads.items():
        read_after = engine.read_file(iid)
        assert read_after == orig_bytes, f"Payload mismatch on inode {iid} after defrag!"


def test_corruption_injection_and_fsck_repair(temp_engine):
    """Test fault injection and fsck automated repair."""
    engine = temp_engine
    # Create a couple of files first
    engine.create_and_write_file("file1.dat", 0, b"A" * 1500, ALLOC_CONTIGUOUS)
    engine.create_and_write_file("file2.dat", 0, b"B" * 1200, ALLOC_LINKED)

    # Inject corruption
    corrupt_state = engine.inject_corruption()
    assert corrupt_state["metrics"]["health_status"] == "CORRUPTED"

    # Run fsck with repair=False
    scan_report = engine.fsck(repair=False)
    assert len(scan_report["anomalies"]) >= 2
    assert any(a["type"] in ("ORPHAN_BLOCK_LEAK", "UNMARKED_ALLOCATED_BLOCK", "SUPERBLOCK_FREE_BLOCKS_DRIFT") for a in scan_report["anomalies"])

    # Run fsck with repair=True
    repair_report = engine.fsck(repair=True)
    assert repair_report["repaired"] is True
    assert repair_report["state"]["metrics"]["health_status"] == "HEALTHY"


def test_benchmark_runner(temp_engine):
    """Test 3-way comparative benchmark runner."""
    base_dir = os.path.dirname(temp_engine.image_path)
    runner = BenchmarkRunner(base_dir=base_dir)
    results = runner.run_benchmark()

    assert "contiguous" in results
    assert "linked" in results
    assert "indexed" in results
    assert "verdict_text" in results

    assert results["contiguous"]["random_access_complexity"] == "O(1)"
    assert results["linked"]["random_access_complexity"] == "O(N)"
    assert results["indexed"]["random_access_complexity"] == "O(1)"

