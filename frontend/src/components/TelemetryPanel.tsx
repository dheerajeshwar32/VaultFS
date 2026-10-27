import React from "react";
import {
  Gauge,
  Activity,
  ArrowRightLeft,
  HardDrive,
  Trash2,
  CheckCircle,
  AlertTriangle,
} from "lucide-react";
import { MetricsState, BlockState } from "../types/vfs";

interface TelemetryPanelProps {
  metrics: MetricsState | null;
  blocks: BlockState[];
}

export const TelemetryPanel: React.FC<TelemetryPanelProps> = ({ metrics, blocks }) => {
  const extFrag = metrics?.external_frag_percent ?? 0;
  const intFragBytes = metrics?.internal_frag_bytes ?? 0;
  const avgSeek = metrics?.avg_seek_distance ?? 0;
  const totalSeeks = metrics?.total_seek_operations ?? 0;
  const freeExtentsCount = metrics?.free_extents_count ?? 0;
  const largestExtent = metrics?.largest_free_extent ?? 0;
  const usedBlocks = metrics?.used_blocks ?? 10;
  const freeBlocks = 256 - usedBlocks;
  const isHealthy = metrics?.health_status === "HEALTHY";

  // Breakdown by allocation category
  const counts = blocks.reduce(
    (acc, b) => {
      if (b.status === "SUPERBLOCK" || b.status === "BITMAP" || b.status === "INODE") {
        acc.meta++;
      } else if (b.status === "CONTIGUOUS") {
        acc.contig++;
      } else if (b.status === "LINKED") {
        acc.linked++;
      } else if (b.status === "INDEXED" || b.status === "INDEX_BLOCK") {
        acc.indexed++;
      } else if (b.status === "CORRUPTED") {
        acc.corrupt++;
      } else {
        acc.free++;
      }
      return acc;
    },
    { meta: 0, contig: 0, linked: 0, indexed: 0, corrupt: 0, free: 0 }
  );

  const getFragColor = (val: number) => {
    if (val < 15) return "text-emerald-400";
    if (val < 35) return "text-amber-400";
    return "text-rose-400";
  };

  const getFragBar = (val: number) => {
    if (val < 15) return "bg-emerald-400";
    if (val < 35) return "bg-amber-400";
    return "bg-rose-500 animate-pulse";
  };

  return (
    <div className="bg-[#0F131D]/90 backdrop-blur-xl border border-white/[0.07] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.45)] p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-violet-400" />
          <h2 className="text-xs font-bold tracking-wider uppercase text-slate-200">
            Real-Time Telemetry
          </h2>
        </div>
        <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>LIVE WS</span>
        </span>
      </div>

      {/* 2x2 Metric Cards Grid - Fixes squishing & text wrapping */}
      <div className="grid grid-cols-2 gap-3">
        {/* 1. External Fragmentation */}
        <div className="bg-[#161B28]/80 border border-white/[0.05] rounded-xl p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-medium text-slate-400">External Frag</span>
            <Gauge className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <div className="my-1">
            <span className={`text-xl font-bold font-mono tracking-tight ${getFragColor(extFrag)}`}>
              {extFrag.toFixed(1)}%
            </span>
          </div>
          <div className="w-full bg-black/50 h-1.5 rounded-full overflow-hidden mb-1.5">
            <div className={`h-full rounded-full transition-all duration-500 ${getFragBar(extFrag)}`} style={{ width: `${Math.min(100, Math.max(3, extFrag))}%` }} />
          </div>
          <span className="text-[9.5px] font-mono text-slate-400 truncate">
            {freeExtentsCount} holes • max {largestExtent} blks
          </span>
        </div>

        {/* 2. Internal Waste */}
        <div className="bg-[#161B28]/80 border border-white/[0.05] rounded-xl p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-medium text-slate-400">Internal Waste</span>
            <Trash2 className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="my-1 flex items-baseline gap-1">
            <span className="text-xl font-bold font-mono tracking-tight text-amber-400">
              {intFragBytes.toLocaleString()}
            </span>
            <span className="text-[10px] text-slate-400 font-mono">B</span>
          </div>
          <div className="w-full bg-black/50 h-1.5 rounded-full overflow-hidden mb-1.5">
            <div
              className="h-full rounded-full bg-amber-400 transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(4, (intFragBytes / 16384) * 100))}%` }}
            />
          </div>
          <span className="text-[9.5px] font-mono text-slate-400 truncate">
            Slack space across active sectors
          </span>
        </div>

        {/* 3. Average Seek Distance */}
        <div className="bg-[#161B28]/80 border border-white/[0.05] rounded-xl p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-medium text-slate-400">Avg Seek Dist</span>
            <ArrowRightLeft className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="my-1 flex items-baseline gap-1">
            <span className="text-xl font-bold font-mono tracking-tight text-cyan-400">
              {avgSeek.toFixed(1)}
            </span>
            <span className="text-[10px] text-slate-400 font-mono">blks</span>
          </div>
          <div className="w-full bg-black/50 h-1.5 rounded-full overflow-hidden mb-1.5">
            <div
              className="h-full rounded-full bg-cyan-400 transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(5, (avgSeek / 30) * 100))}%` }}
            />
          </div>
          <span className="text-[9.5px] font-mono text-slate-400 truncate">
            {totalSeeks} seek hops recorded
          </span>
        </div>

        {/* 4. Free Blocks Capacity */}
        <div className="bg-[#161B28]/80 border border-white/[0.05] rounded-xl p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-medium text-slate-400">Free Sectors</span>
            <HardDrive className="w-3.5 h-3.5 text-violet-400" />
          </div>
          <div className="my-1 flex items-baseline gap-1">
            <span className="text-xl font-bold font-mono tracking-tight text-violet-300">
              {freeBlocks}
            </span>
            <span className="text-[10px] text-slate-400 font-mono">/ 256</span>
          </div>
          <div className="w-full bg-black/50 h-1.5 rounded-full overflow-hidden mb-1.5">
            <div
              className="h-full rounded-full bg-violet-500 transition-all duration-500"
              style={{ width: `${Math.round((usedBlocks / 256) * 100)}%` }}
            />
          </div>
          <span className="text-[9.5px] font-mono text-slate-400 truncate">
            Used: {usedBlocks} blks ({(usedBlocks * 512) / 1024} KB)
          </span>
        </div>
      </div>

      {/* Allocation Distribution Card */}
      <div className="bg-[#161B28]/60 border border-white/[0.04] p-3.5 rounded-xl space-y-2.5">
        <div className="flex items-center justify-between text-[11px] text-slate-300 font-semibold">
          <span>Physical Sector Breakdown</span>
          <span className="font-mono text-[10px] text-slate-400">256 Sectors (128 KB)</span>
        </div>

        {/* Multi-segment Bar */}
        <div className="w-full h-2.5 rounded-full bg-black/60 overflow-hidden flex shadow-inner">
          <div style={{ width: `${(counts.meta / 256) * 100}%` }} className="bg-amber-500" title={`Metadata: ${counts.meta}`} />
          <div style={{ width: `${(counts.contig / 256) * 100}%` }} className="bg-emerald-500" title={`Contiguous: ${counts.contig}`} />
          <div style={{ width: `${(counts.linked / 256) * 100}%` }} className="bg-violet-500" title={`Linked: ${counts.linked}`} />
          <div style={{ width: `${(counts.indexed / 256) * 100}%` }} className="bg-cyan-500" title={`Indexed: ${counts.indexed}`} />
          <div style={{ width: `${(counts.corrupt / 256) * 100}%` }} className="bg-rose-500 animate-pulse" title={`Corrupted: ${counts.corrupt}`} />
          <div style={{ width: `${(counts.free / 256) * 100}%` }} className="bg-[#232b3e]" title={`Free: ${counts.free}`} />
        </div>

        {/* 2-column or 3-column structured legend */}
        <div className="grid grid-cols-3 gap-2 pt-1 text-[10px] font-mono">
          <div className="flex items-center gap-1.5 text-amber-400">
            <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
            <span className="truncate">Sys: {counts.meta}</span>
          </div>
          <div className="flex items-center gap-1.5 text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            <span className="truncate">Contig: {counts.contig}</span>
          </div>
          <div className="flex items-center gap-1.5 text-violet-400">
            <span className="w-2 h-2 rounded-full bg-violet-500 shrink-0" />
            <span className="truncate">Linked: {counts.linked}</span>
          </div>
          <div className="flex items-center gap-1.5 text-cyan-400">
            <span className="w-2 h-2 rounded-full bg-cyan-500 shrink-0" />
            <span className="truncate">Indexed: {counts.indexed}</span>
          </div>
          <div className="flex items-center gap-1.5 text-rose-400">
            <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
            <span className="truncate">Err: {counts.corrupt}</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-400">
            <span className="w-2 h-2 rounded-full bg-[#232b3e] shrink-0" />
            <span className="truncate">Free: {counts.free}</span>
          </div>
        </div>
      </div>

      {/* System Integrity Badge */}
      <div className={`p-3 rounded-xl border flex items-center justify-between text-xs font-mono ${
        isHealthy
          ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
          : "bg-rose-500/15 border-rose-500/40 text-rose-300 animate-pulse"
      }`}>
        <div className="flex items-center gap-2">
          {isHealthy ? (
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span className="font-semibold">{isHealthy ? "Structure Clean" : "Inconsistencies Present"}</span>
        </div>
        <span className="text-[10px] uppercase font-bold tracking-wider">
          {isHealthy ? "Verified" : "Run fsck"}
        </span>
      </div>
    </div>
  );
};
