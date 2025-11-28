// ============================================================================
// FILE: src/services/QueueManager.ts
// Manages the queue of video chunks to be processed
// ============================================================================

import type {VideoFile, ChunkInfo, QueueState, ChunkProgress} from '../types';
import {Logger} from '../utils/logger';
// replaced AsyncStorage with MMKV wrapper
import MMKVStorage from '../storage/MMKVStorage';

// NEW: import uploader
import {uploadChunk} from './ChunkUploader';

const STORAGE_KEY = '@video_chunk_queue';
const CHUNK_SIZE = 30 * 1024 * 1024; // 30MB chunks

// State management
let chunks: ChunkInfo[] = [];
let videos: VideoFile[] = [];

/**
 * Add a video to the queue and split it into chunks
 */
export const addVideo = async (video: VideoFile): Promise<void> => {
  try {
    const totalChunks = Math.max(1, Math.ceil(video.size / CHUNK_SIZE));
    const videoChunks: ChunkInfo[] = [];

    Logger.info(
      `📹 Adding video: ${video.name} (${(video.size / 1024 / 1024).toFixed(
        2,
      )} MB)`,
    );

    for (let i = 0; i < totalChunks; i++) {
      const startByte = i * CHUNK_SIZE;
      const endByte = Math.min((i + 1) * CHUNK_SIZE, video.size);
      const size = endByte - startByte;

      const chunk: ChunkInfo = {
        id: `${video.id}_chunk_${i}`,
        videoId: video.id,
        fileName: video.name,
        chunkIndex: i,
        totalChunks,
        startByte,
        endByte,
        size,
        status: 'pending',
      };
      videoChunks.push(chunk);
    }

    // Add to memory
    chunks.push(...videoChunks);

    // Add video if not already exists
    if (!videos.find(v => v.id === video.id)) {
      videos.push(video);
    }

    await saveState();
    Logger.log(`✅ Added ${totalChunks} chunks for ${video.name}`);
  } catch (error) {
    Logger.error('❌ Error adding video to queue:', error);
    throw error;
  }
};

/**
 * Get the next pending chunk (FIFO)
 */
export const getNextChunk = (): ChunkInfo | null => {
  const next = chunks.find(c => c.status === 'pending') || null;
  return next;
};

/**
 * Get pending chunks (up to limit)
 */
export const getPendingChunks = (limit: number = 10): ChunkInfo[] => {
  const pending = chunks.filter(c => c.status === 'pending').slice(0, limit);
  return pending;
};

/**
 * Update status for a chunk
 */
export const updateChunkStatus = async (
  chunkId: string,
  status: 'pending' | 'processing' | 'completed' | 'failed',
  errorMessage?: string,
): Promise<void> => {
  try {
    const idx = chunks.findIndex(c => c.id === chunkId);
    if (idx === -1) {
      Logger.warn(`⚠️ Chunk not found: ${chunkId}`);
      return;
    }

    chunks[idx].status = status;
    if (status === 'failed' && errorMessage) {
      Logger.error(`❌ Chunk ${chunkId} failed: ${errorMessage}`);
    }

    await saveState();
  } catch (error) {
    Logger.error(`❌ Failed to update chunk status for ${chunkId}:`, error);
    throw error;
  }
};

/**
 * Get overall upload progress across all videos
 */
export const getProgress = async (): Promise<ChunkProgress> => {
  try {
    const completed = chunks.filter(c => c.status === 'completed').length;
    const total = chunks.length;
    return {
      completed,
      total,
      percentage: total > 0 ? (completed / total) * 100 : 0,
    };
  } catch (error) {
    Logger.error('❌ Failed to get overall progress:', error);
    return {completed: 0, total: 0, percentage: 0};
  }
};

/**
 * Get progress for a specific video
 */
export const getVideoProgress = (videoId: string): ChunkProgress => {
  const videoChunks = chunks.filter(c => c.videoId === videoId);
  const completed = videoChunks.filter(c => c.status === 'completed').length;
  const total = videoChunks.length;
  return {
    completed,
    total,
    percentage: total > 0 ? (completed / total) * 100 : 0,
  };
};

/**
 * Get all chunks
 */
export const getAllChunks = (): ChunkInfo[] => {
  return [...chunks];
};

/**
 * Get all videos
 */
export const getAllVideos = (): VideoFile[] => {
  return [...videos];
};

/**
 * Get video by ID
 */
export const getVideo = (videoId: string): VideoFile | null => {
  return videos.find(v => v.id === videoId) || null;
};

/**
 * Remove a video and its chunks
 */
export const removeVideo = async (videoId: string): Promise<void> => {
  try {
    const removedCount = chunks.filter(c => c.videoId === videoId).length;
    videos = videos.filter(v => v.id !== videoId);
    chunks = chunks.filter(c => c.videoId !== videoId);

    await saveState();
    Logger.log(`🗑️ Removed video ${videoId} and ${removedCount} chunks`);
  } catch (error) {
    Logger.error('❌ Error removing video:', error);
    throw error;
  }
};

/**
 * Get queue statistics
 */
export const getStats = () => {
  const pending = chunks.filter(c => c.status === 'pending').length;
  const processing = chunks.filter(c => c.status === 'processing').length;
  const completed = chunks.filter(c => c.status === 'completed').length;
  const failed = chunks.filter(c => c.status === 'failed').length;

  return {
    totalVideos: videos.length,
    totalChunks: chunks.length,
    pending,
    processing,
    completed,
    failed,
  };
};

/**
 * Persist current in-memory state to storage (MMKV)
 */
export const saveState = async (): Promise<void> => {
  try {
    const state: QueueState = {videos, chunks};
    await MMKVStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    Logger.debug('💾 Queue state saved (MMKV)');
  } catch (error) {
    Logger.error('❌ Failed to save queue state:', error);
    throw error;
  }
};

/**
 * Load state from storage (MMKV)
 */
export const loadState = async (): Promise<QueueState> => {
  try {
    const stateStr = await MMKVStorage.getItem(STORAGE_KEY);
    if (stateStr) {
      const state: QueueState = JSON.parse(stateStr);
      chunks = state.chunks || [];
      videos = state.videos || [];
      Logger.info(
        `📂 Loaded queue state: ${videos.length} videos, ${chunks.length} chunks`,
      );
      return state;
    }
    Logger.info('📂 No previous queue state found (MMKV)');
    return {videos: [], chunks: []};
  } catch (error) {
    Logger.error('❌ Failed to load queue state:', error);
    chunks = [];
    videos = [];
    return {videos: [], chunks: []};
  }
};

/**
 * Reset the queue completely
 */
export const reset = async (): Promise<void> => {
  try {
    chunks = [];
    videos = [];
    await MMKVStorage.removeItem(STORAGE_KEY);
    Logger.info('🔄 Queue reset completed (MMKV)');
  } catch (error) {
    Logger.error('❌ Error resetting queue:', error);
    throw error;
  }
};

/**
 * Process pending chunks by uploading them sequentially.
 * - limit: max number of pending chunks to process in this call (default 1)
 * This function updates chunk status to 'processing' before upload and
 * 'completed' / 'failed' afterwards and persists state.
 */
export const processPendingChunks = async (
  limit: number = 1,
): Promise<void> => {
  try {
    const pending = getPendingChunks(limit);
    if (pending.length === 0) {
      Logger.info('No pending chunks to process');
      return;
    }

    // video lookup map
    const videosMap = new Map<string, VideoFile>();
    videos.forEach(v => videosMap.set(v.id, v));

    for (const chunk of pending) {
      try {
        Logger.info(
          `🔄 Processing chunk ${chunk.id} (${chunk.chunkIndex + 1}/${
            chunk.totalChunks
          })`,
        );
        // mark as processing
        await updateChunkStatus(chunk.id, 'processing');

        const video = videosMap.get(chunk.videoId) || getVideo(chunk.videoId);
        const chunkUri = video?.uri || ''; // file path/uri for uploader

        // call your uploader (it expects chunk URI, fileName, chunkIndex, totalChunks)
        const result = await uploadChunk(
          chunkUri,
          chunk.fileName,
          chunk.chunkIndex,
          chunk.totalChunks,
        );

        // on success mark completed
        await updateChunkStatus(chunk.id, 'completed');
        Logger.info(
          `✅ Chunk uploaded: ${chunk.id} result=${JSON.stringify(result)}`,
        );
      } catch (err: any) {
        // mark failed and log error
        const msg = err?.message || String(err);
        await updateChunkStatus(chunk.id, 'failed', msg);
        Logger.error(`❌ Chunk ${chunk.id} failed to upload: ${msg}`);
      }
    }
  } catch (error) {
    Logger.error('❌ processPendingChunks error:', error);
    throw error;
  }
};

// Export as default object for convenient importing
export const queueManager = {
  addVideo,
  getNextChunk,
  getPendingChunks,
  updateChunkStatus,
  getProgress,
  getVideoProgress,
  getAllChunks,
  getAllVideos,
  getVideo,
  removeVideo,
  saveState,
  loadState,
  reset,
  getStats,
  // NEW export
  processPendingChunks,
};
