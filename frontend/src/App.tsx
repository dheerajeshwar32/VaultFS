import React, { useState, useEffect, useCallback } from "react";
import { TopCommandBar } from "./components/TopCommandBar";
import { BlockMatrix } from "./components/BlockMatrix";
import { FileExplorer } from "./components/FileExplorer";
import { TelemetryPanel } from "./components/TelemetryPanel";
import { BenchmarkLab } from "./components/BenchmarkLab";
import { WebTerminal } from "./components/WebTerminal";
import { api, createWebSocketClient } from "./api/client";
import {
  SystemStateResponse,
  InodeState,
  DefragResponse,
  FsckResponse,
} from "./types/vfs";
import {
  Sparkles,
  ShieldCheck,
  X,
  ArrowRight,
  BookOpen,
  Cpu,
  Layers,
  Database,
  Terminal,
} from "lucide-react";

export default function App() {
  const [state, setState] = useState<SystemStateResponse | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<number | null>(null);
  const [selectedInode, setSelectedInode] = useState<InodeState | null>(null);
  const [hoveredInode, setHoveredInode] = useState<InodeState | null>(null);
  const [showAllPointers, setShowAllPointers] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"workbench" | "benchmark" | "guide">("workbench");

  // Modals
  const [isFileModalOpen, setIsFileModalOpen] = useState(false);
  const [isMkdirModalOpen, setIsMkdirModalOpen] = useState(false);
  const [defragModalData, setDefragModalData] = useState<DefragResponse | null>(null);
  const [fsckModalData, setFsckModalData] = useState<FsckResponse | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [actionStatus, setActionStatus] = useState("");

  const refreshState = useCallback(async () => {
    try {
      const data = await api.getState();
      setState(data);
    } catch (err) {
      console.error("Failed to fetch state:", err);
    }
  }, []);

  // Initial mount & WebSocket subscription
  useEffect(() => {
    refreshState();

    const wsClient = createWebSocketClient(
      (newState) => {
        setState(newState);
      },
      (event) => {
        setActionStatus(`Live Event: ${event}`);
        setTimeout(() => setActionStatus(""), 3000);
      }
    );

    return () => {
      wsClient.close();
    };
  }, [refreshState]);

  // Keep selectedInode synced if state updates
  useEffect(() => {
    if (selectedInode && state) {
      const updated = state.inodes.find((i) => i.inode_id === selectedInode.inode_id);
      setSelectedInode(updated || null);
    }
  }, [state]);

  // Command Bar Actions
  const handleSimulateAging = async () => {
    setIsLoading(true);
    setActionStatus("Simulating disk aging and checkerboard fragmentation...");
    try {
      const res = await api.simulateAging();
      setState(res.state);
      setActionStatus("Simulated disk aging: 14 files created, 5 deleted, 3 scattered.");
    } catch (err: any) {
      alert(`Simulation error: ${err.message}`);
    } finally {
      setIsLoading(false);
      setTimeout(() => setActionStatus(""), 4000);
    }
  };

  const handleDefrag = async () => {
    setIsLoading(true);
    setActionStatus("Executing sequential offline disk defragmentation...");
    try {
      const res = await api.defrag();
      setState(res.state);
      setDefragModalData(res);
      setActionStatus("Disk compacted! Seek distance minimized.");
    } catch (err: any) {
      alert(`Defrag error: ${err.message}`);
    } finally {
      setIsLoading(false);
      setTimeout(() => setActionStatus(""), 4000);
    }
  };

  const handleInjectCorruption = async () => {
    setIsLoading(true);
    setActionStatus("Injecting deliberate bitmap leaks and superblock drift...");
    try {
      const res = await api.injectCorruption();
      setState(res.state);
      setActionStatus("Faults injected! Health status is now CORRUPTED.");
    } catch (err: any) {
      alert(`Corruption injection error: ${err.message}`);
    } finally {
      setIsLoading(false);
      setTimeout(() => setActionStatus(""), 4000);
    }
  };

  const handleRunFsck = async () => {
    setIsLoading(true);
    setActionStatus("Running fsck consistency check and healing disk image...");
    try {
      const res = await api.runFsck(true);
      setState(res.state);
      setFsckModalData(res);
      setActionStatus("fsck scan and repair complete!");
    } catch (err: any) {
      alert(`fsck error: ${err.message}`);
    } finally {
      setIsLoading(false);
      setTimeout(() => setActionStatus(""), 4000);
    }
  };

  const handleFormatVolume = async () => {
    if (!window.confirm("Are you sure you want to completely reformat disk.img? All data will be zeroed.")) return;
    setIsLoading(true);
    setActionStatus("Formatting disk.img...");
    try {
      const res = await api.formatVolume(0);
      setState(res.state);
      setSelectedBlockId(null);
      setSelectedInode(null);
      setActionStatus("Volume cleanly formatted. Inode 0 (/) initialized.");
    } catch (err: any) {
      alert(`Format error: ${err.message}`);
    } finally {
      setIsLoading(false);
      setTimeout(() => setActionStatus(""), 3000);
    }
  };

  return (
    <div className="min-h-screen bg-[#07090E] text-[#F1F5F9] flex flex-col font-sans pb-16 selection:bg-violet-500/30">
      {/* Top Command Bar */}
      <TopCommandBar
        state={state}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onOpenFileModal={() => setIsFileModalOpen(true)}
        onOpenMkdirModal={() => setIsMkdirModalOpen(true)}
        onSimulateAging={handleSimulateAging}
        onDefrag={handleDefrag}
        onInjectCorruption={handleInjectCorruption}
        onRunFsck={handleRunFsck}
        onFormatVolume={handleFormatVolume}
        showAllPointers={showAllPointers}
        onTogglePointers={setShowAllPointers}
        isLoading={isLoading}
        actionStatus={actionStatus}
      />

      {/* Main Content Body */}
      <main className="flex-1 px-3 xl:px-6 py-4 max-w-[1720px] mx-auto w-full overflow-x-hidden">
        {activeTab === "workbench" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 xl:gap-5">
            {/* Left Column: File Explorer (3 cols) */}
            <div className="lg:col-span-3">
              <FileExplorer
                inodes={state?.inodes || []}
                selectedInode={selectedInode}
                onSelectInode={setSelectedInode}
                onHoverInode={setHoveredInode}
                isFileModalOpen={isFileModalOpen}
                onCloseFileModal={() => setIsFileModalOpen(false)}
                isMkdirModalOpen={isMkdirModalOpen}
                onCloseMkdirModal={() => setIsMkdirModalOpen(false)}
                onRefresh={refreshState}
                onSelectBlock={setSelectedBlockId}
              />
            </div>

            {/* Center Column: 16x16 Interactive Grid & Inspector (6 cols) */}
            <div className="lg:col-span-6">
              <BlockMatrix
                blocks={state?.blocks || []}
                inodes={state?.inodes || []}
                selectedBlockId={selectedBlockId}
                onSelectBlock={setSelectedBlockId}
                selectedInode={selectedInode}
                hoveredInode={hoveredInode}
                showAllPointers={showAllPointers}
              />
            </div>

            {/* Right Column: Telemetry & Metrics (3 cols) */}
            <div className="lg:col-span-3">
              <TelemetryPanel
                metrics={state?.metrics || null}
                blocks={state?.blocks || []}
              />
            </div>
          </div>
        )}

        {activeTab === "benchmark" && <BenchmarkLab />}

        {activeTab === "guide" && (
          <div className="bg-[#0F131D]/90 backdrop-blur-xl border border-white/[0.07] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.45)] p-8 max-w-4xl mx-auto space-y-6">
            <div className="flex items-center gap-3 pb-4 border-b border-white/[0.08]">
              <div className="p-3 rounded-2xl bg-violet-600/20 text-violet-300 border border-violet-500/30">
                <BookOpen className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-extrabold text-white">
                  VaultFS Operating System Architecture Guide & Viva Defense
                </h1>
                <p className="text-xs text-slate-400">
                  Comprehensive reference for Operating Systems Module 6: File System Implementation.
                </p>
              </div>
            </div>

            <div className="space-y-6 text-xs text-slate-300 leading-relaxed">
              <section className="space-y-2">
                <h2 className="text-sm font-bold text-violet-400 uppercase tracking-wide">
                  1. Physical Disk Geometry & Binary Layout
                </h2>
                <p>
                  VaultFS operates inside a single contiguous raw disk image of exactly 131,072 bytes (128 KB),
                  split into 256 sectors of 512 bytes each:
                </p>
                <div className="bg-[#090C14] p-3.5 rounded-xl border border-white/[0.06] font-mono text-[11px] text-emerald-400 space-y-1">
                  <div>Sector 0: Superblock (&lt;8s9IB467x&gt; = 512 bytes)</div>
                  <div>Sector 1: Free-Space Allocation Bitmap (first 256 bytes represent blocks 0..255)</div>
                  <div>Sectors 2..9: Inode Table (8 blocks * 8 inodes/block = 64 Inodes of 64 bytes each)</div>
                  <div>Sectors 10..255: Data Area (246 blocks for file payloads & index tables)</div>
                </div>
              </section>

              <section className="space-y-2">
                <h2 className="text-sm font-bold text-violet-400 uppercase tracking-wide">
                  2. Allocation Strategy Mechanics
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="bg-[#161B28] p-3 rounded-xl border border-white/[0.04]">
                    <span className="font-bold text-emerald-400 block mb-1">Contiguous (0)</span>
                    <p className="text-[11px] text-slate-400">
                      Payload: 512B/block. Direct random access $O(1)$. Checked against largest free extent.
                      Triggers ExternalFragmentationError if holes exist.
                    </p>
                  </div>
                  <div className="bg-[#161B28] p-3 rounded-xl border border-white/[0.04]">
                    <span className="font-bold text-violet-400 block mb-1">Linked (1)</span>
                    <p className="text-[11px] text-slate-400">
                      Payload: 508B/block + 4B pointer at offset 508..512 (&lt;i&gt;). Zero external fragmentation.
                      $O(N)$ random access seek crawl.
                    </p>
                  </div>
                  <div className="bg-[#161B28] p-3 rounded-xl border border-white/[0.04]">
                    <span className="font-bold text-cyan-400 block mb-1">Indexed (2)</span>
                    <p className="text-[11px] text-slate-400">
                      1 dedicated Index block packing &lt;256h&gt; pointers + 512B data blocks. $O(1)$ random access,
                      zero external fragmentation. Foundation of ext4/NTFS.
                    </p>
                  </div>
                </div>
              </section>

              <section className="space-y-2">
                <h2 className="text-sm font-bold text-violet-400 uppercase tracking-wide">
                  3. Key Viva Questions & Answers
                </h2>
                <div className="space-y-3">
                  <div className="bg-[#161B28]/60 p-3 rounded-xl border border-white/[0.04]">
                    <strong className="text-white block mb-1">
                      Q: How is data persisted when the server restarts?
                    </strong>
                    <span>
                      Every file write directly seeks and writes binary bytes into <code className="text-cyan-300">disk.img</code> using Python's <code className="text-cyan-300">struct.pack</code> and immediately calls <code className="text-cyan-300">flush()</code>. On startup, the superblock is read directly from Sector 0 to restore state.
                    </span>
                  </div>

                  <div className="bg-[#161B28]/60 p-3 rounded-xl border border-white/[0.04]">
                    <strong className="text-white block mb-1">
                      Q: How does fsck detect and repair corruption?
                    </strong>
                    <span>
                      fsck performs a ground-truth traversal: it reads all 64 inodes, walks every contiguous span, linked pointer chain, and index block table to build the authoritative set of owned blocks. It compares this against Sector 1 (Bitmap) to detect orphan leaks and unmarked allocated blocks, then writes the corrected bitmap and superblock counters back to disk.
                    </span>
                  </div>

                  <div className="bg-[#161B28]/60 p-3 rounded-xl border border-white/[0.04]">
                    <strong className="text-white block mb-1">
                      Q: What happens during disk defragmentation?
                    </strong>
                    <span>
                      VaultFS reads each active file's payload into memory, clears the data region, and compacts every file sequentially starting at Block 10. For linked files, pointer chains are rewritten to sequential addresses (b, b+1...). For indexed files, the index block is placed adjacent to its data blocks. This drops Head Seek Distance to minimum and restores a single contiguous free extent.
                    </span>
                  </div>
                </div>
              </section>
            </div>
          </div>
        )}
      </main>

      {/* DEFRAG BEFORE / AFTER MODAL */}
      {defragModalData && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0F131D] border border-cyan-500/40 rounded-2xl p-6 w-full max-w-xl shadow-2xl relative animate-fade-in max-h-[85vh] flex flex-col">
            <button
              onClick={() => setDefragModalData(null)}
              className="absolute top-5 right-5 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06]"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="p-2.5 rounded-xl bg-cyan-600/20 text-cyan-300 border border-cyan-500/30">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Defragmentation Complete</h3>
                <p className="text-xs text-slate-400">
                  Compacted {defragModalData.moves.length} active files sequentially starting at Sector 10.
                </p>
              </div>
            </div>

            {/* Before vs After Telemetry Comparison */}
            <div className="grid grid-cols-2 gap-4 mb-4 text-xs font-mono">
              <div className="bg-[#161B28] p-3.5 rounded-xl border border-white/[0.06]">
                <span className="text-slate-400 font-bold block mb-2 uppercase">Before Defrag</span>
                <div className="space-y-1">
                  <div>External Frag: <span className="text-rose-400 font-bold">{defragModalData.before.external_frag_percent}%</span></div>
                  <div>Avg Seek: <span className="text-amber-400 font-bold">{defragModalData.before.avg_seek_distance} blks</span></div>
                  <div>Largest Extent: <span className="text-slate-300 font-bold">{defragModalData.before.largest_free_extent} blks</span></div>
                  <div>Holes: <span className="text-slate-300 font-bold">{defragModalData.before.free_extents_count}</span></div>
                </div>
              </div>

              <div className="bg-[#161B28] p-3.5 rounded-xl border border-emerald-500/30">
                <span className="text-emerald-400 font-bold block mb-2 uppercase">After Defrag</span>
                <div className="space-y-1">
                  <div>External Frag: <span className="text-emerald-400 font-bold">{defragModalData.after.external_frag_percent}%</span></div>
                  <div>Avg Seek: <span className="text-emerald-400 font-bold">{defragModalData.after.avg_seek_distance} blks</span></div>
                  <div>Largest Extent: <span className="text-emerald-400 font-bold">{defragModalData.after.largest_free_extent} blks</span></div>
                  <div>Holes: <span className="text-emerald-400 font-bold">{defragModalData.after.free_extents_count} (Single Run)</span></div>
                </div>
              </div>
            </div>

            {/* Moves List */}
            <div className="flex-1 overflow-y-auto bg-[#090C14] p-3 rounded-xl border border-white/[0.06] text-xs font-mono max-h-48">
              <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1.5">
                Block Compaction Trace:
              </span>
              {defragModalData.moves.map((m, idx) => (
                <div key={`move-${idx}`} className="py-1 border-b border-white/[0.04] flex items-center justify-between">
                  <span className="text-slate-200">{m.file} ({m.alloc_method})</span>
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <span>[{m.from_blocks.join(",")}]</span>
                    <ArrowRight className="w-3 h-3 text-cyan-400" />
                    <span className="text-emerald-400 font-bold">[{m.to_blocks.join(",")}]</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-3 border-t border-white/[0.06] flex justify-end">
              <button
                onClick={() => setDefragModalData(null)}
                className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-lg shadow-cyan-600/30"
              >
                Close Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FSCK REPORT MODAL */}
      {fsckModalData && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0F131D] border border-emerald-500/40 rounded-2xl p-6 w-full max-w-xl shadow-2xl relative animate-fade-in max-h-[85vh] flex flex-col">
            <button
              onClick={() => setFsckModalData(null)}
              className="absolute top-5 right-5 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06]"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="p-2.5 rounded-xl bg-emerald-600/20 text-emerald-300 border border-emerald-500/30">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">fsck Consistency Report</h3>
                <p className="text-xs text-slate-400">
                  Scanned 64 Inodes, checked against Bitmap and Superblock ground truth.
                </p>
              </div>
            </div>

            {fsckModalData.anomalies.length === 0 ? (
              <div className="p-6 text-center bg-emerald-500/10 border border-emerald-500/20 rounded-xl my-4 text-emerald-400 text-xs font-semibold">
                No anomalies detected! 100% block consistency verified.
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-60 mb-4">
                {fsckModalData.anomalies.map((a, idx) => (
                  <div
                    key={`anom-${idx}`}
                    className="p-3 rounded-xl bg-[#161B28] border border-white/[0.06] text-xs font-mono"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-amber-400 font-bold">[{a.severity}] {a.type}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300">
                        {a.fixed ? "REPAIRED" : "UNREPAIRED"}
                      </span>
                    </div>
                    <p className="text-slate-300 text-[11px] leading-relaxed">{a.description}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-auto pt-3 border-t border-white/[0.06] flex items-center justify-between">
              <span className="text-xs text-slate-400 font-mono">
                Status: <span className="text-emerald-400 font-bold">{fsckModalData.state.metrics.health_status}</span>
              </span>
              <button
                onClick={() => setFsckModalData(null)}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/30"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Collapsible Web Terminal Drawer */}
      <WebTerminal
        state={state}
        onRefresh={refreshState}
        onOpenDefragModal={setDefragModalData}
        onOpenFsckModal={setFsckModalData}
      />
    </div>
  );
}

