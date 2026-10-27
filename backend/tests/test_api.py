"""FastAPI REST Endpoint Integration Tests for VaultFS."""

import os
import pytest
from fastapi.testclient import TestClient

from main import app, get_engine


@pytest.fixture(scope="module")
def client():
    # Use dedicated test disk image
    os.environ["VAULTFS_DISK_PATH"] = "test_api_disk.img"
    with TestClient(app) as test_client:
        yield test_client

    if os.path.exists("test_api_disk.img"):
        try:
            os.remove("test_api_disk.img")
        except Exception:
            pass


def test_api_state(client):
    res = client.get("/api/state")
    assert res.status_code == 200
    data = res.json()
    assert "superblock" in data
    assert "metrics" in data
    assert "inodes" in data
    assert "blocks" in data
    assert len(data["blocks"]) == 256
    assert data["superblock"]["magic"] == "VAULTFS1"


def test_api_create_and_read_file(client):
    payload = {
        "name": "api_test.txt",
        "content": "Hello from API integration test",
        "size_bytes": 1024,
        "alloc_method": 0,
        "parent_inode": 0,
        "fit_strategy": "first_fit",
    }
    create_res = client.post("/api/files", json=payload)
    assert create_res.status_code == 200
    create_data = create_res.json()
    inode_id = create_data["inode_id"]

    # Read file
    read_res = client.get(f"/api/files/{inode_id}")
    assert read_res.status_code == 200
    read_data = read_res.json()
    assert read_data["size_bytes"] == 1024
    assert len(read_data["blocks_chain"]) == 2  # 1024 // 512 = 2 blocks


def test_api_mkdir_and_delete(client):
    mkdir_res = client.post("/api/mkdir", json={"name": "test_folder", "parent_inode": 0})
    assert mkdir_res.status_code == 200
    dir_id = mkdir_res.json()["inode_id"]

    del_res = client.delete(f"/api/files/{dir_id}")
    assert del_res.status_code == 200


def test_api_aging_defrag_fsck_benchmark(client):
    # Aging
    aging_res = client.post("/api/simulate-aging")
    assert aging_res.status_code == 200
    assert len(aging_res.json()["log"]) > 0

    # Defrag
    defrag_res = client.post("/api/defrag")
    assert defrag_res.status_code == 200
    assert "moves" in defrag_res.json()

    # Corrupt
    corrupt_res = client.post("/api/corrupt")
    assert corrupt_res.status_code == 200
    assert corrupt_res.json()["state"]["metrics"]["health_status"] == "CORRUPTED"

    # FSCK
    fsck_res = client.post("/api/fsck", json={"repair": True})
    assert fsck_res.status_code == 200
    assert fsck_res.json()["state"]["metrics"]["health_status"] == "HEALTHY"

    # Benchmark
    bench_res = client.post("/api/benchmark")
    assert bench_res.status_code == 200
    assert "verdict_text" in bench_res.json()

