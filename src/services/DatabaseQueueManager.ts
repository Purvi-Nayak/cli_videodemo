// ============================================================================
// FILE: src/services/DatabaseQueueManager.ts
// Enhanced queue manager using WatermelonDB for 5GB video support
// ============================================================================

import {videoRepository} from '../repositories/VideoRepository';
import {chunkRepository} from '../repositories/ChunkRepository';
import {Logger} from '../utils/logger';
import type {VideoFile, ChunkInfo, ChunkProgress, QueueState} from '../types';

// Constants for large file handling
const DEFAULT_CHUNK_SIZE = 20 * 1024 * 1024; // 20MB chunks for optimal upload
const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024; // 5GB max file size

export class DatabaseQueueManager {
  private isInitialized = false;

  // ========================================================================
  // INITIALIZATION
  // ========================================================================

  /**
   * Initialize the database queue manager
   */
  initialize = async (): Promise<boolean> => {
    try {
      if (this.isInitialized) return true;

      Logger.info('🗄️ Initializing Database Queue Manager...');

      // Database is initialized externally in App.tsx
      this.isInitialized = true;
      Logger.info('✅ Database Queue Manager initialized');

      return true;
    } catch (error) {
      Logger.error('❌ Failed to initialize Database Queue Manager:', error);
      return false;
    }
  };

  // ========================================================================
  // VIDEO MANAGEMENT (Optimized for 5GB files)
  // ========================================================================

  /**
   * Add a video to the upload queue with chunking calculation
   * Optimized for 5GB files with 20MB chunks
   */
  addVideo = async (videoFile: VideoFile): Promise<boolean> => {
    try {
      // Validate file size (max 5GB)
      if (videoFile.size > MAX_FILE_SIZE) {
        Logger.warn(
          `File ${videoFile.name} exceeds 5GB limit: ${(
            videoFile.size /
            1024 /
            1024 /
            1024
          ).toFixed(2)} GB`,
        );
        return false;
      }

      // Calculate optimal chunk size for the file
      const chunkSize = this.calculateOptimalChunkSize(videoFile.size);
      const totalChunks = Math.ceil(videoFile.size / chunkSize);

      Logger.info(`📹 Adding video: ${videoFile.name}`);
      Logger.info(
        `📦 File size: ${(videoFile.size / 1024 / 1024).toFixed(2)} MB`,
      );
      Logger.info(
        `🔢 Total chunks: ${totalChunks} (${(chunkSize / 1024 / 1024).toFixed(
          2,
        )} MB each)`,
      );

      // Create video record
      const video = await videoRepository.createVideo({
        videoId: videoFile.id,
        fileName: videoFile.name,
        fileUri: videoFile.uri,
        fileSize: videoFile.size,
        mimeType: videoFile.type,
        totalChunks,
        chunkSize,
        cloudinaryFolder: `video_uploads/${Date.now()}`,
      });

      // Create chunk records for the video
      const chunks = await chunkRepository.createChunksForVideo(
        videoFile.id,
        totalChunks,
        chunkSize,
        videoFile.size,
      );

      Logger.info(
        `✅ Added video ${videoFile.name} with ${chunks.length} chunks to queue`,
      );
      return true;
    } catch (error) {
      Logger.error(`❌ Failed to add video ${videoFile.name}:`, error);
      return false;
    }
  };

  /**
   * Calculate optimal chunk size based on file size
   */
  private calculateOptimalChunkSize = (fileSize: number): number => {
    // For files > 1GB, use larger chunks to reduce total chunk count
    if (fileSize > 1024 * 1024 * 1024) {
      // > 1GB
      return 50 * 1024 * 1024; // 50MB chunks
    } else if (fileSize > 500 * 1024 * 1024) {
      // > 500MB
      return 30 * 1024 * 1024; // 30MB chunks
    } else {
      return DEFAULT_CHUNK_SIZE; // 20MB chunks
    }
  };

  /**
   * Remove video and all associated chunks
   */
  removeVideo = async (videoId: string): Promise<boolean> => {
    try {
      // Delete chunks first
      const deletedChunks = await chunkRepository.deleteChunksForVideo(videoId);

      // Then delete video
      const success = await videoRepository.deleteVideo(videoId);

      if (success) {
        Logger.info(`🗑️ Removed video ${videoId} and ${deletedChunks} chunks`);
      }

      return success;
    } catch (error) {
      Logger.error(`❌ Failed to remove video ${videoId}:`, error);
      return false;
    }
  };

  // ========================================================================
  // CHUNK OPERATIONS (Optimized for large files)
  // ========================================================================

  /**
   * Get pending chunks for upload (with priority for smaller chunks first)
   */
  getPendingChunks = async (limit: number = 10): Promise<ChunkInfo[]> => {
    try {
      const dbChunks = await chunkRepository.getPendingChunks(limit);

      return dbChunks.map(chunk => ({
        id: chunk.chunkId,
        videoId: chunk.videoId,
        fileName: '', // Will be populated from video data
        chunkIndex: chunk.chunkIndex,
        totalChunks: 0, // Will be populated from video data
        startByte: chunk.startByte,
        endByte: chunk.endByte,
        size: chunk.sizeBytes,
        status: chunk.status as
          | 'pending'
          | 'processing'
          | 'completed'
          | 'failed',
      }));
    } catch (error) {
      Logger.error('❌ Failed to get pending chunks:', error);
      return [];
    }
  };

  /**
   * Get chunks for a specific video
   */
  getVideoChunks = async (videoId: string): Promise<ChunkInfo[]> => {
    try {
      const dbChunks = await chunkRepository.getChunksForVideo(videoId);
      const video = await videoRepository.getVideoById(videoId);

      return dbChunks.map(chunk => ({
        id: chunk.chunkId,
        videoId: chunk.videoId,
        fileName: video?.fileName || '',
        chunkIndex: chunk.chunkIndex,
        totalChunks: video?.totalChunks || 0,
        startByte: chunk.startByte,
        endByte: chunk.endByte,
        size: chunk.sizeBytes,
        status: chunk.status as
          | 'pending'
          | 'processing'
          | 'completed'
          | 'failed',
      }));
    } catch (error) {
      Logger.error(`❌ Failed to get chunks for video ${videoId}:`, error);
      return [];
    }
  };

  /**
   * Update chunk status after upload operation
   */
  updateChunkStatus = async (
    chunkId: string,
    status: 'processing' | 'completed' | 'failed',
    errorMessage?: string,
  ): Promise<boolean> => {
    try {
      let success = false;

      switch (status) {
        case 'processing':
          success = await chunkRepository.startChunkUpload(chunkId);
          break;

        case 'completed':
          success = await chunkRepository.completeChunkUpload(
            chunkId,
            `cloudinary_${chunkId}`,
            0,
          );
          // Also update video progress
          if (success) {
            await this.updateVideoProgress(chunkId);
          }
          break;

        case 'failed':
          success = await chunkRepository.failChunkUpload(
            chunkId,
            errorMessage || 'Unknown error',
          );
          break;
      }

      return success;
    } catch (error) {
      Logger.error(`❌ Failed to update chunk status for ${chunkId}:`, error);
      return false;
    }
  };

  /**
   * Update video progress based on completed chunks
   */
  private updateVideoProgress = async (chunkId: string): Promise<void> => {
    try {
      const chunk = await chunkRepository.getChunkById(chunkId);
      if (!chunk) return;

      const stats = await chunkRepository.getVideoChunkStats(chunk.videoId);
      await videoRepository.updateVideoProgress(
        chunk.videoId,
        stats.completed,
        0,
      );

      // If all chunks completed, mark video as completed
      if (stats.completed === stats.total && stats.total > 0) {
        await videoRepository.updateVideoStatus(chunk.videoId, 'completed');
        Logger.info(`🎉 Video ${chunk.videoId} upload completed!`);
      }
    } catch (error) {
      Logger.error('Failed to update video progress:', error);
    }
  };

  // ========================================================================
  // PROGRESS TRACKING (Real-time for UI)
  // ========================================================================

  /**
   * Get overall upload progress across all videos
   */
  getProgress = async (): Promise<ChunkProgress> => {
    try {
      const stats = await chunkRepository.getOverallChunkStats();

      return {
        completed: stats.completed,
        total: stats.total,
        percentage: stats.overallProgress,
      };
    } catch (error) {
      Logger.error('❌ Failed to get overall progress:', error);
      return {completed: 0, total: 0, percentage: 0};
    }
  };

  /**
   * Get progress for a specific video
   */
  getVideoProgress = async (videoId: string): Promise<ChunkProgress> => {
    try {
      const stats = await chunkRepository.getVideoChunkStats(videoId);

      return {
        completed: stats.completed,
        total: stats.total,
        percentage: stats.progress,
      };
    } catch (error) {
      Logger.error(`❌ Failed to get progress for video ${videoId}:`, error);
      return {completed: 0, total: 0, percentage: 0};
    }
  };

  /**
   * Get comprehensive statistics for dashboard
   */
  getStats = async () => {
    try {
      const [videoStats, chunkStats, uploadStats] = await Promise.all([
        videoRepository.getVideoStats(),
        chunkRepository.getOverallChunkStats(),
        videoRepository.getTotalUploadStats(),
      ]);

      return {
        videos: videoStats,
        chunks: chunkStats,
        uploads: uploadStats,
        performance: {
          totalSizeGB: (
            uploadStats.totalSizeBytes /
            1024 /
            1024 /
            1024
          ).toFixed(2),
          uploadedSizeGB: (
            uploadStats.uploadedSizeBytes /
            1024 /
            1024 /
            1024
          ).toFixed(2),
          remainingSizeGB: (
            (uploadStats.totalSizeBytes - uploadStats.uploadedSizeBytes) /
            1024 /
            1024 /
            1024
          ).toFixed(2),
        },
      };
    } catch (error) {
      Logger.error('❌ Failed to get statistics:', error);
      return {
        videos: {
          total: 0,
          pending: 0,
          processing: 0,
          completed: 0,
          failed: 0,
          large: 0,
        },
        chunks: {
          total: 0,
          pending: 0,
          uploading: 0,
          completed: 0,
          failed: 0,
          overallProgress: 0,
        },
        uploads: {
          totalSizeBytes: 0,
          uploadedSizeBytes: 0,
          totalChunks: 0,
          completedChunks: 0,
          failedChunks: 0,
          overallProgress: 0,
        },
        performance: {
          totalSizeGB: '0',
          uploadedSizeGB: '0',
          remainingSizeGB: '0',
        },
      };
    }
  };

  // ========================================================================
  // STATE MANAGEMENT (Compatible with existing interface)
  // ========================================================================

  /**
   * Load queue state (for compatibility with existing code)
   */
  loadState = async (): Promise<QueueState> => {
    try {
      const videos = await videoRepository.getAllVideos();
      const chunks = await this.getAllChunks();

      const videoFiles: VideoFile[] = videos.map(video => ({
        id: video.videoId,
        name: video.fileName,
        uri: video.fileUri,
        size: video.fileSize,
        type: video.mimeType,
      }));

      return {
        videos: videoFiles,
        chunks,
      };
    } catch (error) {
      Logger.error('❌ Failed to load queue state:', error);
      return {videos: [], chunks: []};
    }
  };

  /**
   * Get all chunks (for compatibility)
   */
  private getAllChunks = async (): Promise<ChunkInfo[]> => {
    try {
      const allVideos = await videoRepository.getAllVideos();
      const allChunks: ChunkInfo[] = [];

      for (const video of allVideos) {
        const videoChunks = await this.getVideoChunks(video.videoId);
        allChunks.push(...videoChunks);
      }

      return allChunks;
    } catch (error) {
      Logger.error('❌ Failed to get all chunks:', error);
      return [];
    }
  };

  /**
   * Reset all data (clear database)
   */
  reset = async (): Promise<boolean> => {
    try {
      Logger.warn('🧹 Resetting all video upload data...');

      const videos = await videoRepository.getAllVideos();

      for (const video of videos) {
        await this.removeVideo(video.videoId);
      }

      Logger.info('✅ Database reset completed');
      return true;
    } catch (error) {
      Logger.error('❌ Failed to reset database:', error);
      return false;
    }
  };
}

// Export singleton instance
export const databaseQueueManager = new DatabaseQueueManager();
