// ============================================================================
// FILE: src/services/QueueManager.ts
// Manages the queue of video chunks to be processed
// ============================================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import type {VideoFile, ChunkInfo, QueueState, ChunkProgress} from '../types';
import {Logger} from '../utils/logger';

const STORAGE_KEY = '@video_chunk_queue';
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks

// State management
let chunks: ChunkInfo[] = [];
let videos: VideoFile[] = [];

/**
 * Add a video to the queue and split it into chunks
 */
export const addVideo = async (video: VideoFile): Promise<void> => {
  try {
    const totalChunks = Math.ceil(video.size / CHUNK_SIZE);
    const videoChunks: ChunkInfo[] = [];

    Logger.info(
      `📹 Adding video: ${video.name} (${(video.size / 1024 / 1024).toFixed(
        2,
      )} MB)`,
    );

    for (let i = 0; i < totalChunks; i++) {
      const startByte = i * CHUNK_SIZE;
      const endByte = Math.min((i + 1) * CHUNK_SIZE, video.size);

      const chunk: ChunkInfo = {
        id: `${video.id}_chunk_${i}`,
        videoId: video.id,
        fileName: video.name,
        chunkIndex: i,
        totalChunks,
        startByte,
        endByte,
        size: endByte - startByte,
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

    // Persist to storage
    await saveState();

    Logger.log(`✅ Added ${totalChunks} chunks for ${video.name}`);
  } catch (error) {
    Logger.error('❌ Error adding video to queue:', error);
    throw error;
  }
};

/**
 * Get the next pending chunk
 */
export const getNextChunk = (): ChunkInfo | null => {
  return chunks.find(chunk => chunk.status === 'pending') || null;
};

/**
 * Get all pending chunks
 */
export const getPendingChunks = (): ChunkInfo[] => {
  return chunks.filter(chunk => chunk.status === 'pending');
};

/**
 * Update chunk status
 */
export const updateChunkStatus = async (
  chunkId: string,
  status: ChunkInfo['status'],
): Promise<void> => {
  try {
    const chunk = chunks.find(c => c.id === chunkId);
    if (chunk) {
      const oldStatus = chunk.status;
      chunk.status = status;

      Logger.debug(`📦 Chunk ${chunkId} status: ${oldStatus} → ${status}`);

      await saveState();
    } else {
      Logger.warn(`⚠️ Chunk not found: ${chunkId}`);
    }
  } catch (error) {
    Logger.error('❌ Error updating chunk status:', error);
    throw error;
  }
};

/**
 * Get overall progress
 */
export const getProgress = async (): Promise<ChunkProgress> => {
  const completed = chunks.filter(c => c.status === 'completed').length;
  const total = chunks.length;

  return {
    completed,
    total,
    percentage: total > 0 ? (completed / total) * 100 : 0,
  };
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
 * Get all chunks for serialization to native
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
    // Remove video
    videos = videos.filter(v => v.id !== videoId);

    // Remove all chunks for this video
    const removedCount = chunks.filter(c => c.videoId === videoId).length;
    chunks = chunks.filter(c => c.videoId !== videoId);

    await saveState();

    Logger.log(`🗑️ Removed video ${videoId} and ${removedCount} chunks`);
  } catch (error) {
    Logger.error('❌ Error removing video:', error);
    throw error;
  }
};

/**
 * Save state to AsyncStorage
 */
export const saveState = async (): Promise<void> => {
  try {
    const state: QueueState = {
      videos: videos,
      chunks: chunks,
    };

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    Logger.debug('💾 Queue state saved');
  } catch (error) {
    Logger.error('❌ Failed to save queue state:', error);
    throw error;
  }
};

/**
 * Load state from AsyncStorage
 */
export const loadState = async (): Promise<QueueState> => {
  try {
    const stateStr = await AsyncStorage.getItem(STORAGE_KEY);

    if (stateStr) {
      const state: QueueState = JSON.parse(stateStr);
      chunks = state.chunks || [];
      videos = state.videos || [];

      Logger.info(
        `📂 Loaded queue state: ${videos.length} videos, ${chunks.length} chunks`,
      );
      return state;
    }

    Logger.info('📂 No previous queue state found');
    return {videos: [], chunks: []};
  } catch (error) {
    Logger.error('❌ Failed to load queue state:', error);
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
    await AsyncStorage.removeItem(STORAGE_KEY);

    Logger.info('🔄 Queue reset completed');
  } catch (error) {
    Logger.error('❌ Error resetting queue:', error);
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
};
