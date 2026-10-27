import React, { useState, useRef, useEffect } from "react";
import {
  Terminal as TerminalIcon,
  ChevronUp,
  ChevronDown,
  X,
  Play,
  RotateCcw,
  Sparkles,
  Bug,
  ShieldCheck,
  HelpCircle,
  Folder,
} from "lucide-react";
import { SystemStateResponse } from "../types/vfs";
import { api } from "../api/client";

interface WebTerminalProps {
  state: SystemStateResponse | null;
  onRefresh: () => void;
  onOpenDefragModal?: (res: any) => void;
  onOpenFsckModal?: (res: any) => void;
}

interface LogEntry {
  type: "input" | "output" | "error" | "info";
  text: string;
}

export const WebTerminal: React.FC<WebTerminalProps> = ({
  state,
  onRefresh,
  onOpenDefragModal,
  onOpenFsckModal,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      type: "info",
      text: "VaultFS Kernel Shell v1.0 [Little-Endian Binary Engine]. Type 'help' or click quick pills above.",
    },
  ]);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      inputRef.current?.focus();
    }
  }, [logs, isOpen]);

  const addLog = (type: LogEntry["type"], text: string) => {
    setLogs((prev) => [...prev, { type, text }]);
  };

  const executeCommand = async (cmdStr: string) => {
    const trimmed = cmdStr.trim();
    if (!trimmed) return;

    addLog("input", `$ ${trimmed}`);
    setHistory((prev) => [...prev, trimmed]);
    setHistoryIdx(-1);

    const parts = trimmed.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    try {
      switch (cmd) {
        case "help":
          addLog(
            "info",
            "Available commands:\n" +
              "  ls                          List files and directories in current volume\n" +
              "  cat <name>                  Display file payload content\n" +
              "  stat <name>                 Show Inode metadata and sector block chain\n" +
              "  touch <name> <bytes> [type] Create file. Type: contig (0), linked (1), indexed (2)\n" +
              "  mkdir <name>                Create a directory\n" +
              "  rm <name>                   Delete file or empty directory\n" +
              "  df                          Display disk space usage and fragmentation\n" +
              "  age                         Simulate realistic disk aging and fragmentation\n" +
              "  defrag                      Compact blocks sequentially\n" +
              "  corrupt                     Inject realistic bitmap and superblock errors\n" +
              "  fsck                        Run consistency check and repair anomalies\n" +
              "  format                      Reformat disk.img cleanly\n" +
              "  clear                       Clear terminal output"
          );
          break;

        case "clear":
          setLogs([]);
          break;

        case "ls": {
          const inodes = state?.inodes || [];
          if (inodes.length <= 1) {
            addLog("output", "Volume contains only root directory '/'.");
          } else {
            const lines = inodes
              .filter((i) => i.in_use === 1)
              .map(
                (i) =>
                  `#${String(i.inode_id).padStart(2, "0")}  ${i.file_type === 1 ? "[DIR] " : "      "}${i.name.padEnd(20)}  ${String(i.size_bytes).padStart(6)} B  [${i.alloc_label}]  blocks: ${i.blocks_chain.join(",")}`
              );
            addLog("output", lines.join("\n"));
          }
          break;
        }

        case "stat": {
          if (!args[0]) {
            addLog("error", "Usage: stat <filename>");
            break;
          }
          const target = state?.inodes.find((i) => i.name === args[0]);
          if (!target) {
            addLog("error", `File '${args[0]}' not found`);
          } else {
            addLog(
              "output",
              `Inode: #${target.inode_id}\n` +
                `Name: ${target.name}\n` +
                `Type: ${target.file_type === 1 ? "DIRECTORY" : "FILE"}\n` +
                `Allocation: ${target.alloc_label} (${target.alloc_method})\n` +
                `Logical Size: ${target.size_bytes} Bytes\n` +
                `Physical Blocks Consumed: ${target.block_count}\n` +
                `Block Chain: [${target.blocks_chain.join(" -> ")}]\n` +
                `Internal Waste: ${target.internal_waste_bytes} Bytes\n` +
                `Head Seek Travel: ${target.seek_distance} Blocks`
            );
          }
          break;
        }

        case "cat": {
          if (!args[0]) {
            addLog("error", "Usage: cat <filename>");
            break;
          }
          const target = state?.inodes.find((i) => i.name === args[0]);
          if (!target) {
            addLog("error", `File '${args[0]}' not found`);
          } else {
            const detail = await api.getFile(target.inode_id);
            addLog("output", detail.content || "// (Empty file)");
          }
          break;
        }

        case "touch": {
          if (!args[0]) {
            addLog("error", "Usage: touch <name> <bytes> [contig|linked|indexed]");
            break;
          }
          const fname = args[0];
          const bytes = parseInt(args[1] || "512", 10);
          let method = 0;
          if (args[2]?.toLowerCase() === "linked") method = 1;
          if (args[2]?.toLowerCase() === "indexed") method = 2;

          const res = await api.createFile({
            name: fname,
            content: `// Created via CLI command: touch ${fname} ${bytes}`,
            size_bytes: bytes,
            alloc_method: method,
            parent_inode: 0,
            fit_strategy: "first_fit",
          });
          addLog("output", `File '${fname}' persisted with Inode #${res.inode_id}.`);
          onRefresh();
          break;
        }

        case "mkdir": {
          if (!args[0]) {
            addLog("error", "Usage: mkdir <name>");
            break;
          }
          const res = await api.mkdir(args[0], 0);
          addLog("output", `Directory '${args[0]}' created with Inode #${res.inode_id}.`);
          onRefresh();
          break;
        }

        case "rm": {
          if (!args[0]) {
            addLog("error", "Usage: rm <name>");
            break;
          }
          const target = state?.inodes.find((i) => i.name === args[0]);
          if (!target) {
            addLog("error", `File '${args[0]}' not found`);
          } else {
            await api.deleteFile(target.inode_id);
            addLog("output", `Deleted '${args[0]}' (Inode #${target.inode_id}). Blocks reclaimed.`);
            onRefresh();
          }
          break;
        }

        case "df": {
          const m = state?.metrics;
          const sb = state?.superblock;
          addLog(
            "output",
            `Disk Filesystem Summary (disk.img):\n` +
              `Total Blocks: ${sb?.total_blocks} (128 KB)\n` +
              `Used Blocks: ${m?.used_blocks} (${(m?.used_blocks || 0) * 512} B)\n` +
              `Free Blocks: ${sb?.free_blocks}\n` +
              `External Fragmentation: ${m?.external_frag_percent}%\n` +
              `Free Extents: ${m?.free_extents_count} (Largest extent: ${m?.largest_free_extent} blocks)\n` +
              `Slack Space (Internal Waste): ${m?.internal_frag_bytes} Bytes\n` +
              `Health: ${m?.health_status}`
          );
          break;
        }

        case "age": {
          addLog("info", "Executing disk aging simulation workload...");
          const res = await api.simulateAging();
          addLog("output", res.log.join("\n"));
          onRefresh();
          break;
        }

        case "defrag": {
          addLog("info", "Executing sequential disk defragmentation...");
          const res = await api.defrag();
          addLog(
            "output",
            `Defrag complete! Compacted ${res.moves.length} files.\n` +
              `Seek Distance: ${res.before.avg_seek_distance} -> ${res.after.avg_seek_distance}\n` +
              `External Frag: ${res.before.external_frag_percent}% -> ${res.after.external_frag_percent}%`
          );
          if (onOpenDefragModal) onOpenDefragModal(res);
          onRefresh();
          break;
        }

        case "corrupt": {
          addLog("info", "Injecting deliberate bitmap leaks and superblock drift...");
          await api.injectCorruption();
          addLog("output", "Faults injected. Volume status is now CORRUPTED.");
          onRefresh();
          break;
        }

        case "fsck": {
          addLog("info", "Running fsck scan and repair against ground truth...");
          const res = await api.runFsck(true);
          if (res.anomalies.length === 0) {
            addLog("output", "fsck clean: 0 anomalies detected. File system is HEALTHY.");
          } else {
            const report = res.anomalies
              .map((a) => `[${a.severity}] ${a.type}: ${a.description} -> ${a.fixed ? "REPAIRED" : "UNFIXED"}`)
              .join("\n");
            addLog("output", `fsck Anomaly Report:\n${report}\nDisk successfully healed!`);
          }
          if (onOpenFsckModal) onOpenFsckModal(res);
          onRefresh();
          break;
        }

        case "format": {
          await api.formatVolume(0);
          addLog("output", "Disk cleanly formatted. Inode 0 (/) initialized.");
          onRefresh();
          break;
        }

        default:
          addLog("error", `Unknown command: '${cmd}'. Type 'help' for available commands.`);
      }
    } catch (err: any) {
      addLog("error", `Error: ${err.message}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      executeCommand(input);
      setInput("");
    } else if (e.key === "ArrowUp") {
      if (history.length > 0) {
        const nextIdx = historyIdx + 1;
        if (nextIdx < history.length) {
          setHistoryIdx(nextIdx);
          setInput(history[history.length - 1 - nextIdx]);
        }
      }
    } else if (e.key === "ArrowDown") {
      if (historyIdx > 0) {
        const nextIdx = historyIdx - 1;
        setHistoryIdx(nextIdx);
        setInput(history[history.length - 1 - nextIdx]);
      } else if (historyIdx === 0) {
        setHistoryIdx(-1);
        setInput("");
      }
    }
  };

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-40 bg-[#090C14]/95 backdrop-blur-2xl border-t border-white/[0.08] transition-all duration-300 shadow-[0_-8px_32px_rgba(0,0,0,0.6)] ${
        isOpen ? "h-80" : "h-11"
      }`}
    >
      {/* Drawer Bar Header */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="h-11 px-6 flex items-center justify-between cursor-pointer border-b border-white/[0.04] hover:bg-white/[0.02]"
      >
        <div className="flex items-center gap-3">
          <TerminalIcon className="w-4 h-4 text-violet-400" />
          <span className="text-xs font-bold text-slate-200 tracking-wide">
            VaultFS Interactive Kernel CLI
          </span>
          <span className="text-[10px] font-mono text-slate-500">
            [Type 'help' for shell commands]
          </span>
        </div>

        {/* 1-Click Macro Pills */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="hidden md:flex items-center gap-2 text-xs font-mono"
        >
          <span className="text-slate-500 text-[10px]">Macro Pills:</span>
          <button
            onClick={() => executeCommand("age")}
            className="px-2 py-0.5 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px]"
          >
            $ age
          </button>
          <button
            onClick={() => executeCommand("df")}
            className="px-2 py-0.5 rounded bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[11px]"
          >
            $ df
          </button>
          <button
            onClick={() => executeCommand("defrag")}
            className="px-2 py-0.5 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px]"
          >
            $ defrag
          </button>
          <button
            onClick={() => executeCommand("corrupt")}
            className="px-2 py-0.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[11px]"
          >
            $ corrupt
          </button>
          <button
            onClick={() => executeCommand("fsck")}
            className="px-2 py-0.5 rounded bg-violet-500/10 hover:bg-violet-500/20 text-violet-300 border border-violet-500/30 text-[11px]"
          >
            $ fsck
          </button>
        </div>

        <div className="flex items-center gap-2">
          {isOpen ? (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          )}
        </div>
      </div>

      {/* Terminal Body */}
      {isOpen && (
        <div className="p-4 flex flex-col h-[calc(100%-44px)] font-mono text-xs">
          <div className="flex-1 overflow-y-auto space-y-1.5 pr-2 mb-2 select-text">
            {logs.map((log, idx) => (
              <div
                key={`term-log-${idx}`}
                className={`whitespace-pre-wrap leading-relaxed ${
                  log.type === "input"
                    ? "text-violet-400 font-bold"
                    : log.type === "error"
                    ? "text-rose-400 bg-rose-500/10 px-2 py-1 rounded border border-rose-500/20"
                    : log.type === "info"
                    ? "text-cyan-400/90"
                    : "text-slate-300"
                }`}
              >
                {log.text}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Command Prompt Line */}
          <div className="flex items-center gap-2 pt-2 border-t border-white/[0.06] bg-[#090C14]">
            <span className="text-violet-400 font-bold">vaultfs&gt;</span>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. ls, stat kernel.sys, df, age, defrag, fsck"
              className="flex-1 bg-transparent text-white outline-none font-mono text-xs placeholder-slate-600"
            />
          </div>
        </div>
      )}
    </div>
  );
};

