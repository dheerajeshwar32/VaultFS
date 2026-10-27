"""VaultFS FastAPI REST API and Real-Time WebSocket Server.

Exposes high-performance endpoints for all file system operations,
broadcasts telemetry updates over WebSockets, and handles CORS.
"""

import asyncio
import os
from typing import List, Dict, Any, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from vaultfs.constants import (
    ALLOC_CONTIGUOUS,
    ALLOC_LINKED,
    ALLOC_INDEXED,
    ALLOC_LABELS,
    ExternalFragmentationError,
    DiskFullError,
    InodeTableFullError,
    VaultFSFileNotFoundError,
    VaultFSFileExistsError,
    DirectoryNotEmptyError,
    InvalidAllocationError,
    CorruptionDetectedError,
    VaultFSError,
)
from vaultfs.engine import VaultFSEngine
from vaultfs.benchmark import BenchmarkRunner

# ------------------------------------------------------------------------------
# Pydantic Request Models
# ------------------------------------------------------------------------------

class FormatRequest(BaseModel):
    default_alloc: int = Field(default=ALLOC_CONTIGUOUS, ge=0, le=2)


class CreateFileRequest(BaseModel):
    name: str
    content: str = ""
    size_bytes: int = 0
    alloc_method: int = Field(default=ALLOC_CONTIGUOUS, ge=0, le=2)
    parent_inode: int = 0
    fit_strategy: str = Field(default="first_fit")


class MkdirRequest(BaseModel):
    name: str
    parent_inode: int = 0


class FsckRequest(BaseModel):
    repair: bool = True


# ------------------------------------------------------------------------------
# WebSocket Connection Manager
# ------------------------------------------------------------------------------

class ConnectionManager:
    """Manages active WebSocket client connections for real-time state broadcast."""

    def __init__(self) -> None:
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: Dict[str, Any]) -> None:
        disconnected = []
        for connection in list(self.active_connections):
            try:
                await connection.send_json(message)
            except Exception:
                disconnected.append(connection)
        for dead_conn in disconnected:
            self.disconnect(dead_conn)


# ------------------------------------------------------------------------------
# Application Lifecycle & Engine Initialization
# ------------------------------------------------------------------------------

DISK_PATH = os.environ.get("VAULTFS_DISK_PATH", "disk.img")
engine: Optional[VaultFSEngine] = None
manager = ConnectionManager()


@asynccontextmanager
async def lifespan(app: FastAPI):
    global engine
    engine = VaultFSEngine(image_path=DISK_PATH)
    yield
    if engine and engine.disk:
        engine.disk.close()


app = FastAPI(
    title="VaultFS Telemetry & Engine API",
    description="Virtual File System binary storage engine and real-time visualization workbench backend.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_engine() -> VaultFSEngine:
    global engine
    if engine is None:
        engine = VaultFSEngine(image_path=DISK_PATH)
    return engine


async def notify_state_change(event_type: str = "STATE_UPDATE", extra: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Helper to fetch state and broadcast over WebSockets to all connected workbenches."""
    eng = get_engine()
    state = eng.get_state()
    msg = {
        "event": event_type,
        "state": state,
    }
    if extra:
        msg.update(extra)
    await manager.broadcast(msg)
    return state


# ------------------------------------------------------------------------------
# REST Endpoints
# ------------------------------------------------------------------------------

@app.get("/api/state")
async def get_state():
    """Retrieve full file system state (Superblock, Metrics, Inodes, and all 256 Blocks)."""
    eng = get_engine()
    return eng.get_state()


@app.post("/api/format")
async def format_volume(req: FormatRequest):
    """Format the disk image cleanly with the chosen default allocation strategy."""
    eng = get_engine()
    eng.format(default_alloc=req.default_alloc)
    state = await notify_state_change("FORMAT")
    return {"message": "Volume successfully formatted", "state": state}


@app.post("/api/files")
async def create_file(req: CreateFileRequest):
    """
    Create and persist a new file using Contiguous, Linked, or Indexed allocation.
    If size_bytes > len(content), automatically expands readable content for hex dumps.
    """
    eng = get_engine()

    content_bytes = req.content.encode("utf-8")
    target_size = req.size_bytes if req.size_bytes > 0 else len(content_bytes)

    if target_size > len(content_bytes):
        # Repeat content pattern or fill readable ASCII text
        base_text = req.content if req.content else f"// VaultFS binary payload for '{req.name}'\n"
        multiplier = (target_size // len(base_text.encode("utf-8"))) + 1
        expanded = (base_text * multiplier).encode("utf-8")[:target_size]
    else:
        expanded = content_bytes[:target_size] if target_size > 0 else content_bytes

    try:
        inode = eng.create_and_write_file(
            name=req.name,
            parent_inode=req.parent_inode,
            data_bytes=expanded,
            alloc_method=req.alloc_method,
            fit_strategy=req.fit_strategy,
        )
    except ExternalFragmentationError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    except (DiskFullError, InodeTableFullError) as e:
        raise HTTPException(status_code=status.HTTP_507_INSUFFICIENT_STORAGE, detail=str(e))
    except VaultFSFileExistsError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except VaultFSError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    state = await notify_state_change("FILE_CREATED", {"created_inode": inode.inode_id})
    return {"message": f"File '{req.name}' created successfully", "inode_id": inode.inode_id, "state": state}


@app.get("/api/files/{inode_id}")
async def get_file_content(inode_id: int):
    """Read decoded file content, block trace, and metadata for an active file."""
    eng = get_engine()
    try:
        inode = eng.read_inode(inode_id)
        if inode.in_use == 0:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Inode {inode_id} not found")

        blocks = eng.get_inode_blocks(inode)
        if inode.file_type == 1:
            content_str = f"[Directory: {inode.name}]"
        else:
            raw_bytes = eng.read_file(inode_id)
            content_str = raw_bytes.decode("utf-8", errors="replace")

        return {
            "inode_id": inode.inode_id,
            "name": inode.name,
            "file_type": inode.file_type,
            "alloc_method": inode.alloc_method,
            "alloc_label": ALLOC_LABELS.get(inode.alloc_method, "UNKNOWN"),
            "size_bytes": inode.size_bytes,
            "block_count": inode.block_count,
            "blocks_chain": blocks,
            "content": content_str,
            "created_at": inode.created_at,
            "modified_at": inode.modified_at,
            "parent_inode": inode.parent_inode,
        }
    except VaultFSError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@app.delete("/api/files/{inode_id}")
async def delete_file(inode_id: int):
    """Delete an active file or empty directory and free its allocated blocks."""
    eng = get_engine()
    try:
        eng.delete_file(inode_id)
    except VaultFSFileNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except DirectoryNotEmptyError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except VaultFSError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    state = await notify_state_change("FILE_DELETED", {"deleted_inode": inode_id})
    return {"message": f"Inode {inode_id} deleted successfully", "state": state}


@app.post("/api/mkdir")
async def make_directory(req: MkdirRequest):
    """Create a new directory inode."""
    eng = get_engine()
    try:
        inode = eng.mkdir(req.name, req.parent_inode)
    except VaultFSFileExistsError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except InodeTableFullError as e:
        raise HTTPException(status_code=status.HTTP_507_INSUFFICIENT_STORAGE, detail=str(e))
    except VaultFSError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    state = await notify_state_change("DIR_CREATED", {"created_inode": inode.inode_id})
    return {"message": f"Directory '{req.name}' created", "inode_id": inode.inode_id, "state": state}


@app.post("/api/simulate-aging")
async def simulate_aging():
    """Populate 14 files, delete 5 to fragment space, and scatter 3 linked/indexed files."""
    eng = get_engine()
    state, log = eng.simulate_aging()
    await notify_state_change("DISK_AGED", {"log": log})
    return {"message": "Aging simulation complete", "state": state, "log": log}


@app.post("/api/defrag")
async def defragment_disk():
    """Compact all data blocks sequentially and eliminate seek bottlenecks."""
    eng = get_engine()
    result = eng.defrag()
    await notify_state_change("DEFRAG_COMPLETE", {"moves_count": len(result["moves"])})
    return result


@app.post("/api/corrupt")
async def inject_corruption():
    """Inject orphan block leaks, unmarked blocks, and superblock counter drift."""
    eng = get_engine()
    state = eng.inject_corruption()
    await notify_state_change("CORRUPTION_INJECTED")
    return {"message": "Disk corruption injected", "state": state}


@app.post("/api/fsck")
async def check_and_repair_disk(req: FsckRequest):
    """Scan and verify disk integrity against inode ground truth, with optional repair."""
    eng = get_engine()
    result = eng.fsck(repair=req.repair)
    await notify_state_change("FSCK_RUN", {"anomalies_count": len(result["anomalies"])})
    return result


@app.post("/api/benchmark")
async def run_benchmark():
    """Run standardized 25-step workload comparing Contiguous vs Linked vs Indexed."""
    runner = BenchmarkRunner(base_dir=os.path.dirname(os.path.abspath(DISK_PATH)))
    results = runner.run_benchmark()
    return results


# ------------------------------------------------------------------------------
# WebSocket Endpoint
# ------------------------------------------------------------------------------

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """Real-time bi-directional telemetry connection."""
    await manager.connect(websocket)
    eng = get_engine()
    # Immediately send initial state on connect
    await websocket.send_json({"event": "INITIAL_STATE", "state": eng.get_state()})
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
            elif data == "get_state":
                await websocket.send_json({"event": "STATE_UPDATE", "state": eng.get_state()})
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)


# ------------------------------------------------------------------------------
# Serve Built Frontend Bundle (Enables 1-Port Cloud Deployment)
# ------------------------------------------------------------------------------

from fastapi.staticfiles import StaticFiles

frontend_dist = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))
if os.path.exists(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")


