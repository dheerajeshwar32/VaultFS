/**
 * Strict TypeScript models matching FastAPI VaultFS schemas exactly.
 */

export interface SuperblockState {
  magic: string;
  block_size: number;
  total_blocks: number;
  total_inodes: number;
  free_blocks: number;
  free_inodes: number;
  mount_count: number;
  default_alloc: number;
}

export interface MetricsState {
  used_blocks: number;
  metadata_blocks: number;
  data_blocks_used: number;
  external_frag_percent: number;
  internal_frag_bytes: number;
  free_extents_count: number;
  largest_free_extent: number;
  avg_seek_distance: number;
  total_seek_operations: number;
  health_status: "HEALTHY" | "CORRUPTED" | string;
}

export interface InodeState {
  inode_id: number;
  in_use?: number;
  name: string;
  file_type: number; // 0 = file, 1 = directory
  alloc_method: number; // 0 = contiguous, 1 = linked, 2 = indexed
  alloc_label: "CONTIGUOUS" | "LINKED" | "INDEXED" | string;
  size_bytes: number;
  block_count: number;
  start_block: number;
  end_or_len: number;
  index_block: number;
  parent_inode: number;
  blocks_chain: number[];
  internal_waste_bytes: number;
  seek_distance: number;
  created_at: number;
}

export interface BlockState {
  block_id: number;
  status:
    | "SUPERBLOCK"
    | "BITMAP"
    | "INODE"
    | "FREE"
    | "CONTIGUOUS"
    | "LINKED"
    | "INDEXED"
    | "INDEX_BLOCK"
    | "CORRUPTED"
    | string;
  owner_inode: number;
  owner_name: string;
  alloc_method: number;
  next_block: number;
  indexed_targets: number[];
  used_bytes: number;
  waste_bytes: number;
  hex_preview: string;
  ascii_preview: string;
}

export interface SystemStateResponse {
  superblock: SuperblockState;
  metrics: MetricsState;
  inodes: InodeState[];
  blocks: BlockState[];
}

export interface FileDetailResponse {
  inode_id: number;
  name: string;
  file_type: number;
  alloc_method: number;
  alloc_label: string;
  size_bytes: number;
  block_count: number;
  blocks_chain: number[];
  content: string;
  created_at: number;
  modified_at: number;
  parent_inode: number;
}

export interface BlockMoveRecord {
  inode_id: number;
  file: string;
  alloc_method: string;
  from_blocks: number[];
  to_blocks: number[];
}

export interface DefragResponse {
  before: MetricsState;
  after: MetricsState;
  moves: BlockMoveRecord[];
  state: SystemStateResponse;
}

export interface FsckAnomaly {
  type: string;
  severity: "CRITICAL" | "ERROR" | "WARNING" | string;
  block_or_inode: number;
  description: string;
  fixed: boolean;
}

export interface FsckResponse {
  anomalies: FsckAnomaly[];
  repaired: boolean;
  state: SystemStateResponse;
}

export interface BenchmarkResult {
  alloc_method: number;
  method_name: "CONTIGUOUS" | "LINKED" | "INDEXED" | string;
  exec_time_ms: number;
  external_frag_pct: number;
  internal_frag_bytes: number;
  avg_seek_distance: number;
  failed_allocations: number;
  random_access_complexity: string;
  sequential_access_complexity: string;
  disk_space_efficiency: string;
}

export interface BenchmarkResponse {
  contiguous: BenchmarkResult;
  linked: BenchmarkResult;
  indexed: BenchmarkResult;
  verdict_text: string;
}

export interface CreateFilePayload {
  name: string;
  content: string;
  size_bytes: number;
  alloc_method: number;
  parent_inode: number;
  fit_strategy: string;
}

