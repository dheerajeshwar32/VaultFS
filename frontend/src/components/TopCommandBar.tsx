import React from "react";
import {
  HardDrive,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Play,
  RotateCcw,
  Sparkles,
  Bug,
  ShieldCheck,
  Plus,
  FolderPlus,
  BarChart2,
  Layers,
  BookOpen,
} from "lucide-react";
import { SystemStateResponse } from "../types/vfs";

interface TopCommandBarProps {
  state: SystemStateResponse | null;
  activeTab: "workbench" | "benchmark" | "guide";
  onTabChange: (tab: "workbench" | "benchmark" | "guide") => void;
  onOpenFileModal: () => void;
  onOpenMkdirModal: () => void;
  onSimulateAging: () => void;
  onDefrag: () => void;
  onInjectCorruption: () => void;
  onRunFsck: () => void;
  onFormatVolume: () => void;
  showAllPointers: boolean;
  onTogglePointers: (val: boolean) => void;
  isLoading: boolean;
  actionStatus: string;
}

export const TopCommandBar: React.FC<TopCommandBarProps> = ({
  state,
  activeTab,
  onTabChange,
  onOpenFileModal,
  onOpenMkdirModal,
  onSimulateAging,
  onDefrag,
  onInjectCorruption,
  onRunFsck,
  onFormatVolume,
  showAllPointers,
  onTogglePointers,
  isLoading,
  actionStatus,
}) => {
  const health = state?.metrics?.health_status ?? "HEALTHY";
  const isHealthy = health === "HEALTHY";
  const mountCount = state?.superblock?.mount_count ?? 1;

  return (
    <header className="border-b border-white/[0.08] bg-[#0F131D]/90 backdrop-blur-xl sticky top-0 z-40 px-4 xl:px-8 py-3 transition-all">
      <div className="flex flex-col xl:flex-row items-center justify-between gap-3">
        {/* Brand & System Status */}
        <div className="flex items-center gap-3.5 w-full xl:w-auto justify-between xl:justify-start">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-violet-600 via-fuchsia-600 to-cyan-400 p-[1px] shadow-lg shadow-violet-500/20">
              <div className="h-full w-full bg-[#0F131D] rounded-xl flex items-center justify-center">
                <HardDrive className="w-4 h-4 text-violet-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                  VaultFS
                </span>
                <span className="px-1.5 py-0.2 text-[9.5px] font-mono tracking-wider font-semibold rounded bg-violet-500/20 text-violet-300 border border-violet-500/30">
                  v1.0-RAW
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                <span>disk.img</span>
                <span>•</span>
                <span>128 KB</span>
                <span>•</span>
                <span>Mount #{mountCount}</span>
              </div>
            </div>
          </div>

          {/* Health Status Pill */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide border transition-all ${
              isHealthy
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.2)]"
                : "bg-rose-500/20 text-rose-300 border-rose-500/80 animate-pulse shadow-[0_0_16px_rgba(244,63,94,0.3)]"
            }`}
          >
            {isHealthy ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400 animate-bounce" />
            )}
            <span>{isHealthy ? "HEALTHY" : "CORRUPTION"}</span>
          </div>
        </div>

        {/* View Tabs */}
        <div className="flex items-center bg-[#161B28] p-1 rounded-xl border border-white/[0.06] shrink-0">
          <button
            onClick={() => onTabChange("workbench")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "workbench"
                ? "bg-violet-600 text-white shadow-md shadow-violet-600/30"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Workbench</span>
          </button>
          <button
            onClick={() => onTabChange("benchmark")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "benchmark"
                ? "bg-violet-600 text-white shadow-md shadow-violet-600/30"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]"
            }`}
          >
            <BarChart2 className="w-3.5 h-3.5" />
            <span>Benchmark Lab</span>
          </button>
          <button
            onClick={() => onTabChange("guide")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "guide"
                ? "bg-violet-600 text-white shadow-md shadow-violet-600/30"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Architecture</span>
          </button>
        </div>

        {/* Action Ribbon */}
        <div className="flex items-center flex-wrap gap-1.5 w-full xl:w-auto justify-end">
          {/* Pointer Toggle */}
          <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-300 bg-[#161B28] px-2.5 py-1.5 rounded-xl border border-white/[0.06] cursor-pointer hover:border-white/15 transition-all">
            <input
              type="checkbox"
              checked={showAllPointers}
              onChange={(e) => onTogglePointers(e.target.checked)}
              className="accent-violet-500 rounded cursor-pointer w-3.5 h-3.5"
            />
            <span>Pointers</span>
          </label>

          {/* New File */}
          <button
            onClick={onOpenFileModal}
            disabled={isLoading}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-[11px] font-semibold shadow-md shadow-violet-600/25 border border-violet-500/40 transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>File</span>
          </button>

          {/* New Dir */}
          <button
            onClick={onOpenMkdirModal}
            disabled={isLoading}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold border border-white/[0.08] transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
          >
            <FolderPlus className="w-3.5 h-3.5 text-cyan-400" />
            <span>Dir</span>
          </button>

          {/* Simulate Aging */}
          <button
            onClick={onSimulateAging}
            disabled={isLoading}
            title="Simulate realistic writes, deletes, and checkerboard holes"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 text-[11px] font-semibold border border-amber-500/40 shadow-sm transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5 text-amber-400" />
            <span>Age Disk</span>
          </button>

          {/* Defrag Disk */}
          <button
            onClick={onDefrag}
            disabled={isLoading}
            title="Sequentially compact sectors and eliminate seek bottlenecks"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 text-[11px] font-semibold border border-cyan-500/40 shadow-sm transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>Defrag</span>
          </button>

          {/* Inject Corruption */}
          <button
            onClick={onInjectCorruption}
            disabled={isLoading}
            title="Inject orphan leaks, unmarked blocks, and superblock counter drift"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 text-[11px] font-semibold border border-rose-500/40 shadow-sm transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
          >
            <Bug className="w-3.5 h-3.5 text-rose-400" />
            <span>Corrupt</span>
          </button>

          {/* Run FSCK & Repair */}
          <button
            onClick={onRunFsck}
            disabled={isLoading}
            title="Perform ground truth scan and repair disk image"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-[11px] font-semibold border border-emerald-500/40 shadow-sm transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>fsck</span>
          </button>

          {/* Format Volume */}
          <button
            onClick={onFormatVolume}
            disabled={isLoading}
            title="Cleanly zero and reformat disk.img"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-red-950/40 hover:bg-red-900/50 text-red-300 text-[11px] font-semibold border border-red-800/40 transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5 text-red-400" />
            <span>Format</span>
          </button>
        </div>
      </div>

      {actionStatus && (
        <div className="mt-2 text-[11px] font-mono text-cyan-300 bg-cyan-950/30 border border-cyan-800/40 px-3 py-1 rounded-lg flex items-center gap-2 animate-fade-in">
          <Activity className="w-3 h-3 animate-spin text-cyan-400" />
          <span>{actionStatus}</span>
        </div>
      )}
    </header>
  );
};
