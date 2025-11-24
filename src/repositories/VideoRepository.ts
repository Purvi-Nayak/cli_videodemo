// ============================================================================
// FILE: src/repositories/VideoRepository.ts
// Repository for video CRUD operations and 5GB file management
// ============================================================================

import {Q} from '@nozbe/watermelondb';
import {database, collections} from '../database';
import type {Video, VideoStatus} from '../database/models';
import {Logger} from '../utils/logger';

export class VideoRepository {
  private collection = collections.videos;

  // ========================================================================
  // CREATE OPERATIONS
  // ========================================================================

  /**
   * Create a new video record for 5GB file support
   */
  createVideo = async (videoData: {
    videoId: string;
    fileName: string;
    fileUri: string;
    fileSize: number; // Supports up to 9 petabytes
    mimeType: string;
    totalChunks: number;
    chunkSize: number; // Default 20MB per chunk
    cloudinaryFolder?: string;
  }): Promise<Video> => {
    try {
      const video = await database.write(async () => {
        return await this.collection.create(video => {
          video.videoId = videoData.videoId;
          video.fileName = videoData.fileName;
          video.fileUri = videoData.fileUri;
          video.fileSize = videoData.fileSize;
          video.mimeType = videoData.mimeType;
          video.totalChunks = videoData.totalChunks;
          video.chunkSize = videoData.chunkSize;
          video.status = 'pending';
          video.uploadProgress = 0;
          video.chunksCompleted = 0;
          video.chunksFailed = 0;
          video.uploadSpeed = 0;
          video.timeRemaining = 0;
          video.cloudinaryFolder = videoData.cloudinaryFolder || '';
          video.createdAt = Date.now();
          video.updatedAt = Date.now();
          video.startedAt = 0;
          video.completedAt = 0;
        });
      });

      Logger.info(
        `📹 Created video record: ${videoData.fileName} (${(
          videoData.fileSize /
          1024 /
          1024
        ).toFixed(2)} MB)`,
      );
      return video;
    } catch (error) {
      Logger.error('Failed to create video:', error);
      throw error;
    }
  };

  // ========================================================================
  // READ OPERATIONS
  // ========================================================================

  /**
   * Get video by ID
   */
  getVideoById = async (videoId: string): Promise<Video | null> => {
    try {
      const video = await this.collection
        .query(Q.where('video_id', videoId))
        .fetch();

      return video[0] || null;
    } catch (error) {
      Logger.error(`Failed to get video ${videoId}:`, error);
      return null;
    }
  };

  /**
   * Get all videos with optional status filter
   */
  getAllVideos = async (status?: VideoStatus): Promise<Video[]> => {
    try {
      const query = status
        ? this.collection.query(Q.where('status', status))
        : this.collection.query();

      return await query.fetch();
    } catch (error) {
      Logger.error('Failed to get all videos:', error);
      return [];
    }
  };

  /**
   * Get videos by status with sorting
   */
  getVideosByStatus = async (
    status: VideoStatus,
    sortBy: 'created_at' | 'updated_at' = 'created_at',
  ): Promise<Video[]> => {
    try {
      return await this.collection
        .query(Q.where('status', status), Q.sortBy(sortBy, Q.desc))
        .fetch();
    } catch (error) {
      Logger.error(`Failed to get videos with status ${status}:`, error);
      return [];
    }
  };

  /**
   * Get large videos (> 1GB) for special handling
   */
  getLargeVideos = async (): Promise<Video[]> => {
    try {
      const oneGB = 1024 * 1024 * 1024;
      return await this.collection
        .query(Q.where('file_size', Q.gt(oneGB)), Q.sortBy('file_size', Q.desc))
        .fetch();
    } catch (error) {
      Logger.error('Failed to get large videos:', error);
      return [];
    }
  };

  /**
   * Get videos with failed chunks
   */
  getVideosWithFailedChunks = async (): Promise<Video[]> => {
    try {
      return await this.collection
        .query(
          Q.where('chunks_failed', Q.gt(0)),
          Q.sortBy('chunks_failed', Q.desc),
        )
        .fetch();
    } catch (error) {
      Logger.error('Failed to get videos with failed chunks:', error);
      return [];
    }
  };

  /**
   * Get active upload videos (processing or pending)
   */
  getActiveUploads = async (): Promise<Video[]> => {
    try {
      return await this.collection
        .query(
          Q.or(Q.where('status', 'pending'), Q.where('status', 'processing')),
          Q.sortBy('created_at', Q.asc),
        )
        .fetch();
    } catch (error) {
      Logger.error('Failed to get active uploads:', error);
      return [];
    }
  };

  // ========================================================================
  // UPDATE OPERATIONS
  // ========================================================================

  /**
   * Update video status
   */
  updateVideoStatus = async (
    videoId: string,
    status: VideoStatus,
  ): Promise<boolean> => {
    try {
      const video = await this.getVideoById(videoId);
      if (!video) return false;

      await video.updateStatus(status);
      Logger.debug(`Updated video ${videoId} status to ${status}`);
      return true;
    } catch (error) {
      Logger.error(`Failed to update video status for ${videoId}:`, error);
      return false;
    }
  };

  /**
   * Update video progress (for real-time UI updates)
   */
  updateVideoProgress = async (
    videoId: string,
    chunksCompleted: number,
    uploadSpeed: number = 0,
  ): Promise<boolean> => {
    try {
      const video = await this.getVideoById(videoId);
      if (!video) return false;

      await video.updateProgress(chunksCompleted, uploadSpeed);
      return true;
    } catch (error) {
      Logger.error(`Failed to update video progress for ${videoId}:`, error);
      return false;
    }
  };

  /**
   * Increment failed chunks count
   */
  incrementFailedChunks = async (videoId: string): Promise<boolean> => {
    try {
      const video = await this.getVideoById(videoId);
      if (!video) return false;

      await video.incrementFailedChunks();
      return true;
    } catch (error) {
      Logger.error(`Failed to increment failed chunks for ${videoId}:`, error);
      return false;
    }
  };

  /**
   * Reset video progress (for retry)
   */
  resetVideoProgress = async (videoId: string): Promise<boolean> => {
    try {
      const video = await this.getVideoById(videoId);
      if (!video) return false;

      await video.resetProgress();
      Logger.info(`Reset progress for video ${videoId}`);
      return true;
    } catch (error) {
      Logger.error(`Failed to reset video progress for ${videoId}:`, error);
      return false;
    }
  };

  // ========================================================================
  // DELETE OPERATIONS
  // ========================================================================

  /**
   * Delete video and all associated chunks
   */
  deleteVideo = async (videoId: string): Promise<boolean> => {
    try {
      const video = await this.getVideoById(videoId);
      if (!video) return false;

      await database.write(async () => {
        // Delete associated chunks first
        const chunks = await video.chunks.query().fetch();
        for (const chunk of chunks) {
          await chunk.markAsDeleted();
        }

        // Delete associated upload jobs
        const jobs = await video.uploadJobs.query().fetch();
        for (const job of jobs) {
          await job.markAsDeleted();
        }

        // Finally delete the video
        await video.markAsDeleted();
      });

      Logger.info(`Deleted video ${videoId} and associated data`);
      return true;
    } catch (error) {
      Logger.error(`Failed to delete video ${videoId}:`, error);
      return false;
    }
  };

  /**
   * Delete completed videos older than specified days
   */
  deleteOldCompletedVideos = async (daysOld: number = 7): Promise<number> => {
    try {
      const cutoffTime = Date.now() - daysOld * 24 * 60 * 60 * 1000;

      const oldVideos = await this.collection
        .query(
          Q.where('status', 'completed'),
          Q.where('completed_at', Q.lt(cutoffTime)),
        )
        .fetch();

      let deletedCount = 0;

      for (const video of oldVideos) {
        const success = await this.deleteVideo(video.videoId);
        if (success) deletedCount++;
      }

      Logger.info(`Deleted ${deletedCount} old completed videos`);
      return deletedCount;
    } catch (error) {
      Logger.error('Failed to delete old completed videos:', error);
      return 0;
    }
  };

  // ========================================================================
  // ANALYTICS AND STATISTICS
  // ========================================================================

  /**
   * Get video statistics for dashboard
   */
  getVideoStats = async () => {
    try {
      const [
        totalVideos,
        pendingVideos,
        processingVideos,
        completedVideos,
        failedVideos,
        largeVideos,
      ] = await Promise.all([
        this.collection.query().fetchCount(),
        this.collection.query(Q.where('status', 'pending')).fetchCount(),
        this.collection.query(Q.where('status', 'processing')).fetchCount(),
        this.collection.query(Q.where('status', 'completed')).fetchCount(),
        this.collection.query(Q.where('status', 'failed')).fetchCount(),
        this.collection
          .query(Q.where('file_size', Q.gt(1024 * 1024 * 1024)))
          .fetchCount(),
      ]);

      return {
        total: totalVideos,
        pending: pendingVideos,
        processing: processingVideos,
        completed: completedVideos,
        failed: failedVideos,
        large: largeVideos,
      };
    } catch (error) {
      Logger.error('Failed to get video stats:', error);
      return {
        total: 0,
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        large: 0,
      };
    }
  };

  /**
   * Get total upload statistics
   */
  getTotalUploadStats = async () => {
    try {
      const videos = await this.getAllVideos();

      let totalSize = 0;
      let uploadedSize = 0;
      let totalChunks = 0;
      let completedChunks = 0;
      let failedChunks = 0;

      for (const video of videos) {
        totalSize += video.fileSize;
        uploadedSize += (video.fileSize * video.uploadProgress) / 100;
        totalChunks += video.totalChunks;
        completedChunks += video.chunksCompleted;
        failedChunks += video.chunksFailed;
      }

      return {
        totalSizeBytes: totalSize,
        uploadedSizeBytes: uploadedSize,
        totalChunks,
        completedChunks,
        failedChunks,
        overallProgress:
          totalChunks > 0 ? (completedChunks / totalChunks) * 100 : 0,
      };
    } catch (error) {
      Logger.error('Failed to get total upload stats:', error);
      return {
        totalSizeBytes: 0,
        uploadedSizeBytes: 0,
        totalChunks: 0,
        completedChunks: 0,
        failedChunks: 0,
        overallProgress: 0,
      };
    }
  };
}

// Export singleton instance
export const videoRepository = new VideoRepository();
