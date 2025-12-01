// ============================================================================
// FILE: src/types/index.ts
// TypeScript type definitions for video chunk processing
// ============================================================================

export interface VideoFile {
  id: string;
  name: string;
  uri: string;
  size: number;
  type: string;
}

export interface ChunkInfo {
  id: string;
  videoId: string;
  fileName: string;
  chunkIndex: number;
  totalChunks: number;
  startByte: number;
  endByte: number;
  size: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

export interface ChunkProgress {
  completed: number;
  total: number;
  percentage: number;
}

export interface QueueState {
  videos: VideoFile[];
  chunks: ChunkInfo[];
}

export interface ProgressEvent {
  chunkId: string;
  fileName: string;
  chunkIndex: number;
  totalChunks: number;
  status: 'completed' | 'failed';
}

export interface FileInfo {
  size: number;
  exists: boolean;
}
