/**
 * VaultFS Typed API Client & WebSocket Gateway.
 */

import {
  SystemStateResponse,
  FileDetailResponse,
  DefragResponse,
  FsckResponse,
  BenchmarkResponse,
  CreateFilePayload,
} from "../types/vfs";

const API_BASE = "/api";

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorDetail = `HTTP ${res.status}: ${res.statusText}`;
    try {
      const errorJson = await res.json();
      if (errorJson.detail) {
        errorDetail = typeof errorJson.detail === "string" ? errorJson.detail : JSON.stringify(errorJson.detail);
      }
    } catch {
      // ignore
    }
    throw new Error(errorDetail);
  }
  return res.json();
}

export const api = {
  async getState(): Promise<SystemStateResponse> {
    const res = await fetch(`${API_BASE}/state`);
    return handleResponse<SystemStateResponse>(res);
  },

  async formatVolume(default_alloc: number = 0): Promise<{ message: string; state: SystemStateResponse }> {
    const res = await fetch(`${API_BASE}/format`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ default_alloc }),
    });
    return handleResponse(res);
  },

  async createFile(payload: CreateFilePayload): Promise<{ message: string; inode_id: number; state: SystemStateResponse }> {
    const res = await fetch(`${API_BASE}/files`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return handleResponse(res);
  },

  async getFile(inode_id: number): Promise<FileDetailResponse> {
    const res = await fetch(`${API_BASE}/files/${inode_id}`);
    return handleResponse<FileDetailResponse>(res);
  },

  async deleteFile(inode_id: number): Promise<{ message: string; state: SystemStateResponse }> {
    const res = await fetch(`${API_BASE}/files/${inode_id}`, {
      method: "DELETE",
    });
    return handleResponse(res);
  },

  async mkdir(name: string, parent_inode: number = 0): Promise<{ message: string; inode_id: number; state: SystemStateResponse }> {
    const res = await fetch(`${API_BASE}/mkdir`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, parent_inode }),
    });
    return handleResponse(res);
  },

  async simulateAging(): Promise<{ message: string; state: SystemStateResponse; log: string[] }> {
    const res = await fetch(`${API_BASE}/simulate-aging`, {
      method: "POST",
    });
    return handleResponse(res);
  },

  async defrag(): Promise<DefragResponse> {
    const res = await fetch(`${API_BASE}/defrag`, {
      method: "POST",
    });
    return handleResponse(res);
  },

  async injectCorruption(): Promise<{ message: string; state: SystemStateResponse }> {
    const res = await fetch(`${API_BASE}/corrupt`, {
      method: "POST",
    });
    return handleResponse(res);
  },

  async runFsck(repair: boolean = true): Promise<FsckResponse> {
    const res = await fetch(`${API_BASE}/fsck`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repair }),
    });
    return handleResponse(res);
  },

  async runBenchmark(): Promise<BenchmarkResponse> {
    const res = await fetch(`${API_BASE}/benchmark`, {
      method: "POST",
    });
    return handleResponse(res);
  },
};

/**
 * Real-time WebSocket connection manager with automatic reconnect.
 */
export function createWebSocketClient(
  onState: (state: SystemStateResponse) => void,
  onEvent?: (event: string, data: any) => void
) {
  let ws: WebSocket | null = null;
  let shouldReconnect = true;
  let reconnectTimer: any = null;

  function connect() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    // Direct connection to FastAPI on port 8000 avoids intermediate Node proxy drops on page reload
    const isDev = window.location.port === "5173" || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    const host = isDev ? "127.0.0.1:8000" : window.location.host;
    const url = `${protocol}//${host}/ws`;

    ws = new WebSocket(url);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.state) {
          onState(msg.state);
        }
        if (onEvent && msg.event) {
          onEvent(msg.event, msg);
        }
      } catch (err) {
        console.error("WS Parse Error:", err);
      }
    };

    ws.onclose = () => {
      if (shouldReconnect) {
        reconnectTimer = setTimeout(connect, 2000);
      }
    };

    ws.onerror = (err) => {
      console.warn("WS error encountered, retrying...", err);
      ws?.close();
    };
  }

  connect();

  return {
    close() {
      shouldReconnect = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        ws.onclose = null;
        ws.onerror = null;
        ws.close();
      }
    },
    send(text: string) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(text);
      }
    },
  };
}

