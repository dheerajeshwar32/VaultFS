import React, { useState } from "react";
import {
  FileText,
  Folder,
  FolderPlus,
  FilePlus,
  Trash2,
  Eye,
  ChevronRight,
  HardDrive,
  Clock,
  ArrowRight,
  Check,
  AlertCircle,
  X,
  Sparkles,
} from "lucide-react";
import { InodeState, CreateFilePayload, FileDetailResponse } from "../types/vfs";
import { api } from "../api/client";

interface FileExplorerProps {
  inodes: InodeState[];
  selectedInode: InodeState | null;
  onSelectInode: (inode: InodeState | null) => void;
  onHoverInode: (inode: InodeState | null) => void;
  isFileModalOpen: boolean;
  onCloseFileModal: () => void;
  isMkdirModalOpen: boolean;
  onCloseMkdirModal: () => void;
  onRefresh: () => void;
  onSelectBlock: (blockId: number | null) => void;
}

export const FileExplorer: React.FC<FileExplorerProps> = ({
  inodes,
  selectedInode,
  onSelectInode,
  onHoverInode,
  isFileModalOpen,
  onCloseFileModal,
  isMkdirModalOpen,
  onCloseMkdirModal,
  onRefresh,
  onSelectBlock,
}) => {
  // Modal Form States
  const [fileName, setFileName] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [fileSize, setFileSize] = useState(1024);
  const [allocMethod, setAllocMethod] = useState(0);
  const [fitStrategy, setFitStrategy] = useState("first_fit");
  const [parentInode, setParentInode] = useState(0);

  const [dirName, setDirName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // Content Preview Modal State
  const [previewContent, setPreviewContent] = useState<FileDetailResponse | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  // Filter active inodes
  const activeInodes = inodes.filter((i) => i.in_use === 1 && i.inode_id !== 0);
  const directories = inodes.filter((i) => i.in_use === 1 && i.file_type === 1);

  // Handle Create File
  const handleCreateFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileName.trim()) {
      setFormError("File name is required");
      return;
    }
    setFormError("");
    setIsSubmitting(true);

    try {
      await api.createFile({
        name: fileName.trim(),
        content: fileContent,
        size_bytes: fileSize,
        alloc_method: allocMethod,
        parent_inode: parentInode,
        fit_strategy: fitStrategy,
      });
      setFileName("");
      setFileContent("");
      setFileSize(1024);
      onCloseFileModal();
      onRefresh();
    } catch (err: any) {
      setFormError(err.message || "Failed to create file");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Mkdir
  const handleMkdir = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dirName.trim()) {
      setFormError("Directory name is required");
      return;
    }
    setFormError("");
    setIsSubmitting(true);

    try {
      await api.mkdir(dirName.trim(), parentInode);
      setDirName("");
      onCloseMkdirModal();
      onRefresh();
    } catch (err: any) {
      setFormError(err.message || "Failed to create directory");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Delete File
  const handleDelete = async (inodeId: number) => {
    if (!window.confirm(`Are you sure you want to delete Inode #${inodeId}?`)) return;
    try {
      await api.deleteFile(inodeId);
      if (selectedInode?.inode_id === inodeId) {
        onSelectInode(null);
      }
      onRefresh();
    } catch (err: any) {
      alert(`Delete Error: ${err.message}`);
    }
  };

  // View file content modal
  const handleViewContent = async (inodeId: number) => {
    setIsLoadingPreview(true);
    try {
      const detail = await api.getFile(inodeId);
      setPreviewContent(detail);
    } catch (err: any) {
      alert(`Read Error: ${err.message}`);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const getAllocBadge = (method: number) => {
    switch (method) {
      case 0:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            CONTIGUOUS
          </span>
        );
      case 1:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-violet-500/20 text-violet-300 border border-violet-500/30">
            LINKED
          </span>
        );
      case 2:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
            INDEXED
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="bg-[#0F131D]/90 backdrop-blur-xl border border-white/[0.07] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.45)] p-5 flex flex-col h-full">
      {/* Explorer Header */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <Folder className="w-4 h-4 text-cyan-400" />
          <h2 className="text-sm font-bold tracking-wide uppercase text-slate-200">
            Virtual VFS Inode Hierarchy
          </h2>
        </div>
        <span className="text-xs font-mono text-slate-400">
          {activeInodes.length} / 63 Inodes
        </span>
      </div>

      {/* Inodes List */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[560px]">
        {/* Root Directory Item */}
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#161B28]/60 border border-white/[0.04]">
          <div className="flex items-center gap-2.5">
            <Folder className="w-4 h-4 text-amber-400" />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white">/ (Root Directory)</span>
                <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-1.5 rounded">
                  Inode 0
                </span>
              </div>
            </div>
          </div>
          <span className="text-[10px] font-mono text-slate-400">SYSTEM</span>
        </div>

        {activeInodes.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-xs">
            No files found on volume. Click "+ New File" or "Simulate Aging" above.
          </div>
        ) : (
          activeInodes.map((inode) => {
            const isSelected = selectedInode?.inode_id === inode.inode_id;
            return (
              <div
                key={inode.inode_id}
                onClick={() => onSelectInode(isSelected ? null : inode)}
                onMouseEnter={() => onHoverInode(inode)}
                onMouseLeave={() => onHoverInode(null)}
                className={`flex flex-col p-3 rounded-xl border transition-all cursor-pointer ${
                  isSelected
                    ? "bg-violet-950/30 border-violet-500/60 shadow-lg shadow-violet-500/10 ring-1 ring-violet-400/40"
                    : "bg-[#161B28]/40 border-white/[0.04] hover:border-white/15 hover:bg-[#161B28]/80"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {inode.file_type === 1 ? (
                      <Folder className="w-4 h-4 text-cyan-400 shrink-0" />
                    ) : (
                      <FileText className="w-4 h-4 text-slate-300 shrink-0" />
                    )}
                    <span className="text-xs font-semibold text-slate-200 truncate">
                      {inode.name}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      #{inode.inode_id}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {getAllocBadge(inode.alloc_method)}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleViewContent(inode.inode_id);
                      }}
                      className="p-1 rounded text-slate-400 hover:text-cyan-300 hover:bg-white/[0.06] transition-all"
                      title="Inspect Decoded Content"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(inode.inode_id);
                      }}
                      className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                      title="Delete File"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Sub info */}
                <div className="mt-2 pt-2 border-t border-white/[0.04] flex items-center justify-between text-[11px] font-mono text-slate-400">
                  <div className="flex items-center gap-2">
                    <span>{inode.size_bytes} B</span>
                    <span>•</span>
                    <span>{inode.block_count} blocks</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-500">Seek:</span>
                    <span className="text-cyan-400 font-bold">{inode.seek_distance} blks</span>
                  </div>
                </div>

                {/* Block Chain Pills */}
                {isSelected && inode.blocks_chain.length > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-white/[0.06]">
                    <span className="text-[10px] text-slate-400 block mb-1 font-semibold uppercase tracking-wider">
                      Allocated Sector Chain:
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {inode.blocks_chain.map((bId, idx) => (
                        <button
                          key={`chain-pill-${inode.inode_id}-${bId}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectBlock(bId);
                          }}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-all ${
                            bId === inode.index_block
                              ? "bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/40"
                              : "bg-white/[0.06] hover:bg-white/[0.12] text-slate-300 border border-white/[0.08]"
                          }`}
                        >
                          {bId === inode.index_block ? `Idx:${bId}` : `#${bId}`}
                          {idx < inode.blocks_chain.length - 1 && " →"}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* CREATE FILE MODAL */}
      {isFileModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0F131D] border border-white/[0.1] rounded-2xl p-6 w-full max-w-xl shadow-2xl relative animate-fade-in max-h-[90vh] overflow-y-auto">
            <button
              onClick={onCloseFileModal}
              className="absolute top-5 right-5 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06]"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="p-2.5 rounded-xl bg-violet-600/20 text-violet-300 border border-violet-500/30">
                <FilePlus className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Create File on Raw Volume</h3>
                <p className="text-xs text-slate-400">
                  Writes raw binary blocks to disk.img with full struct persistence.
                </p>
              </div>
            </div>

            {formError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCreateFile} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  File Name
                </label>
                <input
                  type="text"
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  placeholder="e.g., telemetry_dump.log"
                  className="w-full bg-[#161B28] border border-white/[0.08] focus:border-violet-500 rounded-xl px-3.5 py-2 text-sm text-white placeholder-slate-500 outline-none transition-all"
                  required
                />
              </div>

              {/* Allocation Strategy Visual Cards */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Allocation Strategy
                </label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                  {/* Contiguous */}
                  <div
                    onClick={() => setAllocMethod(0)}
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                      allocMethod === 0
                        ? "bg-emerald-500/15 border-emerald-400 text-white shadow-md shadow-emerald-500/10"
                        : "bg-[#161B28]/50 border-white/[0.06] text-slate-400 hover:border-white/15"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-emerald-300">Contiguous (0)</span>
                      {allocMethod === 0 && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                    </div>
                    <p className="text-[11px] text-slate-400 leading-snug">
                      $O(1)$ Direct Addressing. Fails if fragmented.
                    </p>
                  </div>

                  {/* Linked */}
                  <div
                    onClick={() => setAllocMethod(1)}
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                      allocMethod === 1
                        ? "bg-violet-500/15 border-violet-400 text-white shadow-md shadow-violet-500/10"
                        : "bg-[#161B28]/50 border-white/[0.06] text-slate-400 hover:border-white/15"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-violet-300">Linked (1)</span>
                      {allocMethod === 1 && <Check className="w-3.5 h-3.5 text-violet-400" />}
                    </div>
                    <p className="text-[11px] text-slate-400 leading-snug">
                      No External Frag. $O(N)$ Seek Chain.
                    </p>
                  </div>

                  {/* Indexed */}
                  <div
                    onClick={() => setAllocMethod(2)}
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                      allocMethod === 2
                        ? "bg-cyan-500/15 border-cyan-400 text-white shadow-md shadow-cyan-500/10"
                        : "bg-[#161B28]/50 border-white/[0.06] text-slate-400 hover:border-white/15"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-cyan-300">Indexed (2)</span>
                      {allocMethod === 2 && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                    </div>
                    <p className="text-[11px] text-slate-400 leading-snug">
                      $O(1)$ Direct Index Table. Modern Standard.
                    </p>
                  </div>
                </div>
              </div>

              {/* Fit Strategy for Contiguous */}
              {allocMethod === 0 && (
                <div className="bg-[#161B28]/60 p-3 rounded-xl border border-white/[0.06]">
                  <label className="block text-xs font-semibold text-slate-300 mb-2">
                    Contiguous Fit Algorithm
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                      <input
                        type="radio"
                        name="fit"
                        value="first_fit"
                        checked={fitStrategy === "first_fit"}
                        onChange={(e) => setFitStrategy(e.target.value)}
                        className="accent-violet-500"
                      />
                      <span>First-Fit (First sufficient extent)</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                      <input
                        type="radio"
                        name="fit"
                        value="best_fit"
                        checked={fitStrategy === "best_fit"}
                        onChange={(e) => setFitStrategy(e.target.value)}
                        className="accent-violet-500"
                      />
                      <span>Best-Fit (Smallest fitting extent)</span>
                    </label>
                  </div>
                </div>
              )}

              {/* File Size Slider */}
              <div>
                <div className="flex items-center justify-between text-xs font-semibold text-slate-300 mb-1.5">
                  <span>Target File Size: {fileSize} Bytes</span>
                  <span className="text-slate-400 font-mono">
                    ~{Math.ceil(fileSize / (allocMethod === 1 ? 508 : 512))} blocks
                  </span>
                </div>
                <input
                  type="range"
                  min="128"
                  max="8192"
                  step="128"
                  value={fileSize}
                  onChange={(e) => setFileSize(Number(e.target.value))}
                  className="w-full accent-violet-500 cursor-pointer"
                />
              </div>

              {/* Payload Text Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Custom Text Payload (Optional)
                </label>
                <textarea
                  value={fileContent}
                  onChange={(e) => setFileContent(e.target.value)}
                  placeholder="Leave empty or enter custom text. If file size > content length, text will pattern-repeat."
                  rows={3}
                  className="w-full bg-[#161B28] border border-white/[0.08] focus:border-violet-500 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 outline-none font-mono"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-white/[0.06]">
                <button
                  type="button"
                  onClick={onCloseFileModal}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/[0.06]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold shadow-lg shadow-violet-600/30 transition-all disabled:opacity-50"
                >
                  {isSubmitting ? "Writing to disk.img..." : "Create & Persist File"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MKDIR MODAL */}
      {isMkdirModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0F131D] border border-white/[0.1] rounded-2xl p-6 w-full max-w-md shadow-2xl relative animate-fade-in">
            <button
              onClick={onCloseMkdirModal}
              className="absolute top-5 right-5 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06]"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="p-2.5 rounded-xl bg-cyan-600/20 text-cyan-300 border border-cyan-500/30">
                <FolderPlus className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Create Directory</h3>
                <p className="text-xs text-slate-400">Allocates a directory inode entry.</p>
              </div>
            </div>

            {formError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleMkdir} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Directory Name
                </label>
                <input
                  type="text"
                  value={dirName}
                  onChange={(e) => setDirName(e.target.value)}
                  placeholder="e.g., system_logs"
                  className="w-full bg-[#161B28] border border-white/[0.08] focus:border-cyan-500 rounded-xl px-3.5 py-2 text-sm text-white placeholder-slate-500 outline-none transition-all"
                  required
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-white/[0.06]">
                <button
                  type="button"
                  onClick={onCloseMkdirModal}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/[0.06]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-lg shadow-cyan-600/30 transition-all disabled:opacity-50"
                >
                  {isSubmitting ? "Creating..." : "Create Directory"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FILE CONTENT INSPECT MODAL */}
      {previewContent && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0F131D] border border-white/[0.1] rounded-2xl p-6 w-full max-w-2xl shadow-2xl relative animate-fade-in max-h-[85vh] flex flex-col">
            <button
              onClick={() => setPreviewContent(null)}
              className="absolute top-5 right-5 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06]"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-white/[0.06]">
              <div className="p-2.5 rounded-xl bg-violet-600/20 text-violet-300 border border-violet-500/30">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span>{previewContent.name}</span>
                  <span className="text-xs font-mono text-slate-400">#{previewContent.inode_id}</span>
                </h3>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span>Strategy: {previewContent.alloc_label}</span>
                  <span>•</span>
                  <span>Size: {previewContent.size_bytes} Bytes</span>
                  <span>•</span>
                  <span>Blocks: {previewContent.block_count}</span>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto bg-[#090C14] border border-white/[0.06] rounded-xl p-4 font-mono text-xs text-emerald-400 whitespace-pre-wrap select-all">
              {previewContent.content || "// (Empty file)"}
            </div>

            <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between text-xs text-slate-400">
              <span className="font-mono">
                Chain: [{previewContent.blocks_chain.join(" -> ")}]
              </span>
              <button
                onClick={() => setPreviewContent(null)}
                className="px-4 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

