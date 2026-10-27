import React, { useState } from "react";
import {
  BarChart2,
  Play,
  RotateCcw,
  Sparkles,
  Zap,
  CheckCircle2,
  XCircle,
  Clock,
  Layers,
  ArrowRightLeft,
  Shield,
  BookOpen,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import { BenchmarkResponse } from "../types/vfs";
import { api } from "../api/client";

export const BenchmarkLab: React.FC = () => {
  const [data, setData] = useState<BenchmarkResponse | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState("");

  const handleRunBenchmark = async () => {
    setIsRunning(true);
    setError("");
    try {
      const res = await api.runBenchmark();
      setData(res);
    } catch (err: any) {
      setError(err.message || "Failed to execute benchmark");
    } finally {
      setIsRunning(false);
    }
  };

  // Prepare chart dataset
  const chartData = data
    ? [
        {
          metric: "External Frag (%)",
          Contiguous: data.contiguous.external_frag_pct,
          Linked: data.linked.external_frag_pct,
          Indexed: data.indexed.external_frag_pct,
        },
        {
          metric: "Avg Seek (Blocks)",
          Contiguous: data.contiguous.avg_seek_distance,
          Linked: data.linked.avg_seek_distance,
          Indexed: data.indexed.avg_seek_distance,
        },
        {
          metric: "Failed Allocs",
          Contiguous: data.contiguous.failed_allocations,
          Linked: data.linked.failed_allocations,
          Indexed: data.indexed.failed_allocations,
        },
      ]
    : [];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Hero Header */}
      <div className="bg-[#0F131D]/90 backdrop-blur-xl border border-white/[0.07] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.45)] p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BarChart2 className="w-5 h-5 text-violet-400" />
            <h1 className="text-xl font-extrabold text-white tracking-tight">
              3-Way Disk Allocation Benchmark Lab
            </h1>
          </div>
          <p className="text-xs text-slate-400 max-w-2xl">
            Executes an identical 25-step synthetic file workload across 3 isolated temporary binary
            disk images to mathematically evaluate and demonstrate operating system allocation trade-offs.
          </p>
        </div>

        <button
          onClick={handleRunBenchmark}
          disabled={isRunning}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-bold text-xs shadow-lg shadow-violet-600/30 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 shrink-0"
        >
          <Play className={`w-4 h-4 ${isRunning ? "animate-spin" : ""}`} />
          <span>{isRunning ? "Running 25 Workload Operations..." : "Run Comparative Benchmark"}</span>
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs">
          {error}
        </div>
      )}

      {/* 3 Strategy Architecture Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* CONTIGUOUS CARD */}
        <div className="bg-[#0F131D]/90 backdrop-blur-xl border border-emerald-500/30 rounded-2xl p-5 flex flex-col justify-between shadow-lg shadow-emerald-500/5">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-bold text-emerald-400">Contiguous Allocation</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                METHOD 0
              </span>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Allocates single consecutive runs of 512B blocks using First-Fit / Best-Fit algorithms.
            </p>

            <div className="space-y-2.5 text-xs font-mono">
              <div className="flex items-center justify-between bg-[#161B28] p-2.5 rounded-xl border border-white/[0.04]">
                <span className="text-slate-400">Random Access:</span>
                <span className="text-emerald-300 font-bold">O(1) Direct Offset</span>
              </div>
              <div className="flex items-center justify-between bg-[#161B28] p-2.5 rounded-xl border border-white/[0.04]">
                <span className="text-slate-400">Execution Time:</span>
                <span className="text-white font-bold">
                  {data ? `${data.contiguous.exec_time_ms} ms` : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between bg-[#161B28] p-2.5 rounded-xl border border-white/[0.04]">
                <span className="text-slate-400">External Frag %:</span>
                <span className="text-amber-400 font-bold">
                  {data ? `${data.contiguous.external_frag_pct}%` : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between bg-[#161B28] p-2.5 rounded-xl border border-white/[0.04]">
                <span className="text-slate-400">Failed Writes:</span>
                <span className="text-rose-400 font-bold">
                  {data ? `${data.contiguous.failed_allocations} (Frag Error)` : "—"}
                </span>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-white/[0.06] text-[11px] text-slate-400">
            <span className="text-emerald-400 font-semibold">Pro:</span> Zero pointer overhead.{" "}
            <span className="text-rose-400 font-semibold">Con:</span> Severe external fragmentation.
          </div>
        </div>

        {/* LINKED CARD */}
        <div className="bg-[#0F131D]/90 backdrop-blur-xl border border-violet-500/30 rounded-2xl p-5 flex flex-col justify-between shadow-lg shadow-violet-500/5">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-bold text-violet-400">Linked Allocation</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-violet-500/20 text-violet-300 border border-violet-500/30">
                METHOD 1
              </span>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Scatters 508B data chunks with 4B pointers (&lt;i&gt;) packed in sector tails.
            </p>

            <div className="space-y-2.5 text-xs font-mono">
              <div className="flex items-center justify-between bg-[#161B28] p-2.5 rounded-xl border border-white/[0.04]">
                <span className="text-slate-400">Random Access:</span>
                <span className="text-rose-400 font-bold">O(N) Sequential Crawl</span>
              </div>
              <div className="flex items-center justify-between bg-[#161B28] p-2.5 rounded-xl border border-white/[0.04]">
                <span className="text-slate-400">Execution Time:</span>
                <span className="text-white font-bold">
                  {data ? `${data.linked.exec_time_ms} ms` : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between bg-[#161B28] p-2.5 rounded-xl border border-white/[0.04]">
                <span className="text-slate-400">External Frag %:</span>
                <span className="text-emerald-400 font-bold">0.0% (Zero)</span>
              </div>
              <div className="flex items-center justify-between bg-[#161B28] p-2.5 rounded-xl border border-white/[0.04]">
                <span className="text-slate-400">Avg Seek Dist:</span>
                <span className="text-amber-400 font-bold">
                  {data ? `${data.linked.avg_seek_distance} blocks` : "—"}
                </span>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-white/[0.06] text-[11px] text-slate-400">
            <span className="text-emerald-400 font-semibold">Pro:</span> No external fragmentation.{" "}
            <span className="text-rose-400 font-semibold">Con:</span> Pointer seek bottleneck.
          </div>
        </div>

        {/* INDEXED CARD */}
        <div className="bg-[#0F131D]/90 backdrop-blur-xl border border-cyan-500/30 rounded-2xl p-5 flex flex-col justify-between shadow-lg shadow-cyan-500/5">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-bold text-cyan-400">Indexed Allocation</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                METHOD 2
              </span>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Dedicated index block holding an array of 256 16-bit block pointers (&lt;256h&gt;).
            </p>

            <div className="space-y-2.5 text-xs font-mono">
              <div className="flex items-center justify-between bg-[#161B28] p-2.5 rounded-xl border border-white/[0.04]">
                <span className="text-slate-400">Random Access:</span>
                <span className="text-cyan-300 font-bold">O(1) Direct Index</span>
              </div>
              <div className="flex items-center justify-between bg-[#161B28] p-2.5 rounded-xl border border-white/[0.04]">
                <span className="text-slate-400">Execution Time:</span>
                <span className="text-white font-bold">
                  {data ? `${data.indexed.exec_time_ms} ms` : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between bg-[#161B28] p-2.5 rounded-xl border border-white/[0.04]">
                <span className="text-slate-400">External Frag %:</span>
                <span className="text-emerald-400 font-bold">0.0% (Zero)</span>
              </div>
              <div className="flex items-center justify-between bg-[#161B28] p-2.5 rounded-xl border border-white/[0.04]">
                <span className="text-slate-400">Overhead:</span>
                <span className="text-fuchsia-300 font-bold">1 Index Block (512B)</span>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-white/[0.06] text-[11px] text-slate-400">
            <span className="text-emerald-400 font-semibold">Pro:</span> Ideal balance. Modern OS standard.{" "}
            <span className="text-amber-400 font-semibold">Con:</span> 1-block index overhead.
          </div>
        </div>
      </div>

      {/* Recharts Visualization */}
      {data && (
        <div className="bg-[#0F131D]/90 backdrop-blur-xl border border-white/[0.07] rounded-2xl p-6 shadow-[0_8px_32px_rgba(0,0,0,0.45)]">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/[0.06]">
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide">
              Empirical Comparison Chart (25-Step Controlled Workload)
            </h3>
            <span className="text-xs text-slate-400 font-mono">Lower is better</span>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                <XAxis dataKey="metric" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0F131D",
                    borderColor: "#ffffff20",
                    borderRadius: "12px",
                    color: "#fff",
                    fontSize: "12px",
                  }}
                />
                <Legend />
                <Bar dataKey="Contiguous" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Linked" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Indexed" fill="#06b6d4" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Automated Faculty Viva Summary Card */}
      <div className="bg-[#0F131D]/90 backdrop-blur-xl border border-white/[0.07] rounded-2xl p-6 shadow-[0_8px_32px_rgba(0,0,0,0.45)]">
        <div className="flex items-center gap-2 mb-3 pb-3 border-b border-white/[0.06]">
          <BookOpen className="w-5 h-5 text-cyan-400" />
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide">
            Automated Faculty Viva Defense & Theoretical Analysis
          </h3>
        </div>

        <div className="prose prose-invert max-w-none text-xs text-slate-300 leading-relaxed space-y-3">
          <p>
            <strong className="text-emerald-400">1. Why did Contiguous Allocation fail on fragmented writes?</strong>
            <br />
            Even though the disk image had plenty of total free blocks, those blocks were split into
            non-adjacent isolated holes. Contiguous allocation requires all $N$ blocks to be strictly
            sequential. When the largest free extent fell below $N$, VaultFS raised an explicit{" "}
            <code className="text-amber-300 bg-black/40 px-1 py-0.5 rounded">ExternalFragmentationError</code>,
            mirroring real OS disk driver behavior.
          </p>

          <p>
            <strong className="text-violet-400">2. Why did Linked Allocation have high Head Seek Distance?</strong>
            <br />
            Linked allocation successfully claimed scattered blocks across holes, eliminating external
            fragmentation. However, reading block $k$ required traversing through block pointers at offset 508
            across scattered cylinder tracks, causing high head travel distance and $O(N)$ random access penalties.
          </p>

          <p>
            <strong className="text-cyan-400">3. Why is Indexed Allocation the foundation of modern file systems?</strong>
            <br />
            Indexed allocation brings the best of both worlds: by allocating a dedicated index block packing an array
            of pointers (<code className="text-cyan-300 bg-black/40 px-1 py-0.5 rounded">&lt;256h&gt;</code>), it
            allows arbitrary scattered block placement (0% external fragmentation) while retaining $O(1)$ direct
            random block addressing. This architecture serves as the foundation for ext4 (extents/index tree) and
            NTFS ($MFT).
          </p>
        </div>
      </div>
    </div>
  );
};

