import React, { useMemo } from "react";
import { BlockState, InodeState } from "../types/vfs";
import {
  Layers,
  X,
  Hash,
  ArrowRight,
  Database,
  ExternalLink,
} from "lucide-react";

interface BlockMatrixProps {
  blocks: BlockState[];
  inodes: InodeState[];
  selectedBlockId: number | null;
  onSelectBlock: (blockId: number | null) => void;
  selectedInode: InodeState | null;
  hoveredInode: InodeState | null;
  showAllPointers: boolean;
}

export const BlockMatrix: React.FC<BlockMatrixProps> = ({
  blocks,
  inodes,
  selectedBlockId,
  onSelectBlock,
  selectedInode,
  hoveredInode,
  showAllPointers,
}) => {
  const activeFocusInode = hoveredInode || selectedInode;

  const selectedBlock = useMemo(() => {
    if (selectedBlockId === null) return null;
    return blocks.find((b) => b.block_id === selectedBlockId) || null;
  }, [blocks, selectedBlockId]);

  // Coordinate helper inside 1600x1600 viewBox
  const getCoords = (blockId: number) => {
    const col = blockId % 16;
    const row = Math.floor(blockId / 16);
    return {
      x: col * 100 + 50,
      y: row * 100 + 50,
    };
  };

  // Build SVG pointer paths
  const pointerElements = useMemo(() => {
    const targetsToRender: InodeState[] = [];

    if (showAllPointers) {
      targetsToRender.push(...inodes.filter((i) => i.file_type === 0 && i.blocks_chain.length > 0));
    } else if (activeFocusInode && activeFocusInode.file_type === 0) {
      targetsToRender.push(activeFocusInode);
    }

    const lines: React.ReactNode[] = [];

    targetsToRender.forEach((inode) => {
      const chain = inode.blocks_chain;
      if (!chain || chain.length === 0) return;

      // 1. LINKED ALLOCATION: Animated curved pointer chains with arrowheads
      if (inode.alloc_method === 1 && chain.length > 1) {
        for (let i = 0; i < chain.length - 1; i++) {
          const from = getCoords(chain[i]);
          const to = getCoords(chain[i + 1]);

          const dx = to.x - from.x;
          const dy = to.y - from.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const curvature = Math.min(50, dist * 0.12);
          const cx = (from.x + to.x) / 2 - (dy / (dist || 1)) * curvature;
          const cy = (from.y + to.y) / 2 + (dx / (dist || 1)) * curvature;

          const pathD = `M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`;

          lines.push(
            <g key={`linked-ptr-${inode.inode_id}-${chain[i]}-${chain[i + 1]}`}>
              <path
                d={pathD}
                fill="none"
                stroke="#a855f7"
                strokeWidth="3.5"
                strokeDasharray="8 5"
                strokeOpacity="0.9"
                className="animate-dash"
                markerEnd="url(#arrow-violet)"
              />
              <circle cx={from.x} cy={from.y} r="5" fill="#c084fc" />
            </g>
          );
        }
      }

      // 2. INDEXED ALLOCATION: Radiating Hub-and-Spoke laser lines
      if (inode.alloc_method === 2 && inode.index_block !== -1) {
        const hub = getCoords(inode.index_block);
        const dataTargets = chain.filter((b) => b !== inode.index_block);

        dataTargets.forEach((targetBlockId) => {
          const target = getCoords(targetBlockId);
          lines.push(
            <g key={`indexed-laser-${inode.inode_id}-${targetBlockId}`}>
              <line
                x1={hub.x}
                y1={hub.y}
                x2={target.x}
                y2={target.y}
                stroke="#06b6d4"
                strokeWidth="2.5"
                strokeDasharray="6 4"
                strokeOpacity="0.8"
                className="animate-dash"
                markerEnd="url(#arrow-cyan)"
              />
              <circle cx={target.x} cy={target.y} r="4" fill="#22d3ee" />
            </g>
          );
        });

        // Hub indicator around index block
        lines.push(
          <circle
            key={`indexed-hub-${inode.inode_id}`}
            cx={hub.x}
            cy={hub.y}
            r="15"
            fill="none"
            stroke="#f43f5e"
            strokeWidth="3"
            strokeDasharray="4 4"
            className="animate-spin"
            style={{ transformOrigin: `${hub.x}px ${hub.y}px`, animationDuration: "8s" }}
          />
        );
      }

      // 3. CONTIGUOUS ALLOCATION: Highlight contiguous bounding run
      if (inode.alloc_method === 0 && chain.length > 0) {
        chain.forEach((blockId) => {
          const c = getCoords(blockId);
          lines.push(
            <rect
              key={`contig-box-${inode.inode_id}-${blockId}`}
              x={c.x - 42}
              y={c.y - 42}
              width="84"
              height="84"
              rx="10"
              fill="none"
              stroke="#10b981"
              strokeWidth="3.5"
              strokeOpacity="0.95"
              className="animate-pulse"
            />
          );
        });
      }
    });

    return lines;
  }, [showAllPointers, activeFocusInode, inodes]);

  const getBlockStyle = (block: BlockState) => {
    const isSelected = selectedBlockId === block.block_id;
    const isOwnerFocused =
      activeFocusInode &&
      activeFocusInode.file_type === 0 &&
      activeFocusInode.blocks_chain.includes(block.block_id);

    let base = "border rounded-lg transition-all duration-150 cursor-pointer relative overflow-hidden flex flex-col justify-between p-1 select-none ";

    if (isSelected) {
      base += "ring-2 ring-white scale-110 z-20 shadow-xl ";
    } else if (isOwnerFocused) {
      base += "scale-105 ring-1 ring-white/60 z-10 ";
    }

    switch (block.status) {
      case "SUPERBLOCK":
      case "BITMAP":
      case "INODE":
        return base + "bg-amber-500/20 border-amber-500/50 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.15)]";
      case "CONTIGUOUS":
        return base + "bg-emerald-500/25 border-emerald-400/60 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.2)]";
      case "LINKED":
        return base + "bg-violet-500/25 border-violet-400/60 text-violet-300 shadow-[0_0_10px_rgba(139,92,246,0.2)]";
      case "INDEXED":
        return base + "bg-cyan-500/25 border-cyan-400/60 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.2)]";
      case "INDEX_BLOCK":
        return base + "bg-fuchsia-500/30 border-fuchsia-400/80 text-fuchsia-200 ring-1 ring-fuchsia-400/50 shadow-[0_0_12px_rgba(217,70,239,0.25)]";
      case "CORRUPTED":
        return base + "bg-rose-500/35 border-rose-500 animate-pulse text-rose-200 shadow-[0_0_14px_rgba(244,63,94,0.4)]";
      case "FREE":
      default:
        return base + "bg-[#161B28]/60 border-white/[0.04] text-slate-500 hover:border-white/20 hover:bg-[#1a2030]";
    }
  };

  // Convert raw 64-byte preview into canonical hexdump -C format lines
  const formattedHexLines = useMemo(() => {
    if (!selectedBlock) return [];
    const hexTokens = selectedBlock.hex_preview.split(" ");
    const asciiChars = selectedBlock.ascii_preview.split("");
    const lines = [];

    for (let row = 0; row < 4; row++) {
      const offset = (row * 16).toString(16).padStart(4, "0");
      const rowHex = hexTokens.slice(row * 16, row * 16 + 16);
      const rowAscii = asciiChars.slice(row * 16, row * 16 + 16).join("");

      // Split 16 bytes into two groups of 8
      const part1 = rowHex.slice(0, 8).join(" ");
      const part2 = rowHex.slice(8, 16).join(" ");
      const fullHexStr = `${part1.padEnd(23)}  ${part2.padEnd(23)}`;

      lines.push({
        offset,
        hex: fullHexStr,
        ascii: rowAscii,
      });
    }
    return lines;
  }, [selectedBlock]);

  return (
    <div className="flex flex-col gap-4">
      {/* 16x16 Matrix Box */}
      <div className="bg-[#0F131D]/90 backdrop-blur-xl border border-white/[0.07] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.45)] p-5 relative overflow-hidden">
        {/* Grid Title Bar */}
        <div className="flex items-center justify-between mb-3 pb-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-violet-400" />
            <h2 className="text-xs font-bold tracking-wider uppercase text-slate-200">
              Disk Sector Matrix (16x16 • 256 Blocks • 128 KB)
            </h2>
          </div>
          <div className="text-xs font-mono">
            {activeFocusInode ? (
              <span className="text-cyan-300 font-semibold truncate max-w-[240px] inline-block">
                {activeFocusInode.name} ({activeFocusInode.blocks_chain.length} blks)
              </span>
            ) : (
              <span className="text-slate-400 text-[11px]">Click sector to inspect hex</span>
            )}
          </div>
        </div>

        {/* Constrained Aspect-Square Grid (Avoids Screen Overflow) */}
        <div className="relative w-full max-w-[560px] aspect-square mx-auto bg-[#090C14] rounded-xl p-2.5 border border-white/[0.04]">
          {/* Interactive SVG Pointer Overlay */}
          <svg
            viewBox="0 0 1600 1600"
            className="absolute inset-0 w-full h-full pointer-events-none z-20"
          >
            <defs>
              <marker
                id="arrow-violet"
                viewBox="0 0 10 10"
                refX="7"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#c084fc" />
              </marker>
              <marker
                id="arrow-cyan"
                viewBox="0 0 10 10"
                refX="7"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#22d3ee" />
              </marker>
            </defs>
            {pointerElements}
          </svg>

          {/* 16x16 Grid */}
          <div className="grid grid-cols-16 gap-1 w-full h-full relative z-10">
            {blocks.map((block) => {
              const occupancyPct = Math.min(100, Math.round((block.used_bytes / 512) * 100));
              return (
                <div
                  key={block.block_id}
                  onClick={() => onSelectBlock(block.block_id === selectedBlockId ? null : block.block_id)}
                  className={getBlockStyle(block)}
                  title={`Block ${block.block_id} | ${block.status} | Owner: ${block.owner_name}`}
                >
                  {/* Block ID */}
                  <div className="flex items-center justify-between w-full">
                    <span className="font-mono text-[8px] font-bold tracking-tighter opacity-80">
                      {String(block.block_id).padStart(3, "0")}
                    </span>
                    {block.status === "INDEX_BLOCK" && (
                      <span className="w-1 h-1 rounded-full bg-fuchsia-400 animate-ping" />
                    )}
                    {block.status === "CORRUPTED" && (
                      <span className="w-1 h-1 rounded-full bg-rose-400 animate-ping" />
                    )}
                  </div>

                  {/* Micro label */}
                  <div className="text-[7px] font-mono truncate leading-none opacity-80 my-0.5 text-center">
                    {block.status === "SUPERBLOCK" && "SB"}
                    {block.status === "BITMAP" && "MAP"}
                    {block.status === "INODE" && "INO"}
                    {block.status === "CONTIGUOUS" && "CONT"}
                    {block.status === "LINKED" && "LINK"}
                    {block.status === "INDEXED" && "DATA"}
                    {block.status === "INDEX_BLOCK" && "IDX"}
                    {block.status === "CORRUPTED" && "ERR"}
                  </div>

                  {/* Fill Bar */}
                  <div className="w-full bg-black/40 h-0.5 rounded-full overflow-hidden mt-auto">
                    <div
                      className={`h-full rounded-full ${
                        block.status === "FREE"
                          ? "bg-transparent"
                          : block.status === "CONTIGUOUS"
                          ? "bg-emerald-400"
                          : block.status === "LINKED"
                          ? "bg-violet-400"
                          : block.status === "INDEX_BLOCK"
                          ? "bg-fuchsia-400"
                          : block.status === "CORRUPTED"
                          ? "bg-rose-400"
                          : "bg-cyan-400"
                      }`}
                      style={{ width: `${occupancyPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="mt-3 pt-2.5 border-t border-white/[0.06] flex items-center justify-center flex-wrap gap-3 text-[11px] font-medium text-slate-300">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-amber-500/30 border border-amber-500/60" />
            <span>Sys (0..9)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-emerald-500/30 border border-emerald-400/60" />
            <span>Contiguous</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-violet-500/30 border border-violet-400/60" />
            <span>Linked</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-cyan-500/30 border border-cyan-400/60" />
            <span>Indexed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-fuchsia-500/30 border border-fuchsia-400/80" />
            <span>Idx Block</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-[#161B28] border border-white/[0.08]" />
            <span>Free</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-rose-500/40 border border-rose-500 animate-pulse" />
            <span>Corrupted</span>
          </div>
        </div>
      </div>

      {/* Hexdump -C Canonical Sector Inspector */}
      {selectedBlock && (
        <div className="bg-[#0F131D]/90 backdrop-blur-xl border border-white/[0.09] rounded-2xl p-4 shadow-2xl animate-fade-in relative">
          <button
            onClick={() => onSelectBlock(null)}
            className="absolute top-3 right-3 p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-all"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center justify-between gap-3 mb-3 pb-2.5 border-b border-white/[0.06]">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-violet-500/20 text-violet-300 border border-violet-500/30">
                <Hash className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-white flex items-center gap-2">
                  <span>Sector #{selectedBlock.block_id}</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-white/[0.06] border border-white/[0.1]">
                    {selectedBlock.status}
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  Owner: <span className="text-cyan-300 font-semibold">{selectedBlock.owner_name}</span>{" "}
                  {selectedBlock.owner_inode !== -1 && `(Inode #${selectedBlock.owner_inode})`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-[11px] font-mono">
              <span className="text-slate-400">Payload: </span>
              <span className="text-emerald-400 font-bold">{selectedBlock.used_bytes} / 512 B</span>
              {selectedBlock.next_block !== -1 && (
                <span className="text-violet-300 ml-2">
                  Next: #{selectedBlock.next_block}
                </span>
              )}
            </div>
          </div>

          {/* Canonical Hexdump -C Container */}
          <div className="bg-[#080B12] p-3 rounded-xl border border-white/[0.06] font-mono text-[11px] leading-relaxed overflow-x-auto select-all">
            <div className="text-[10px] text-slate-500 pb-1 mb-1 border-b border-white/[0.04] flex justify-between">
              <span>OFFSET</span>
              <span>HEX BYTES (00..07  08..0F)</span>
              <span>ASCII DECODED</span>
            </div>
            {formattedHexLines.map((line, idx) => (
              <div key={`hex-row-${idx}`} className="flex items-center justify-between gap-4 hover:bg-white/[0.02] px-1 rounded">
                <span className="text-slate-500">{line.offset}</span>
                <span className="text-emerald-400 tracking-wide">{line.hex}</span>
                <span className="text-cyan-300 border-l border-white/[0.06] pl-2">{line.ascii}</span>
              </div>
            ))}
          </div>

          {/* Index Table Targets */}
          {selectedBlock.status === "INDEX_BLOCK" && selectedBlock.indexed_targets.length > 0 && (
            <div className="mt-2.5 bg-fuchsia-950/20 border border-fuchsia-800/40 p-2.5 rounded-xl flex items-center gap-2 flex-wrap text-xs">
              <span className="font-bold text-fuchsia-300 text-[11px]">Indexed Targets:</span>
              {selectedBlock.indexed_targets.map((tb) => (
                <button
                  key={`target-btn-${tb}`}
                  onClick={() => onSelectBlock(tb)}
                  className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-fuchsia-500/20 hover:bg-fuchsia-500/30 text-fuchsia-200 border border-fuchsia-500/40"
                >
                  #{tb}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
