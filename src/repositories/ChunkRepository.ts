// ============================================================================
// FILE: src/repositories/ChunkRepository.ts
// Repository for chunk CRUD operations and upload tracking
// ============================================================================

import {Q} from '@nozbe/watermelondb';
import {database, collections} from '../database';
import type {Chunk, ChunkStatus} from '../database/models';
import {Logger} from '../utils/logger';

export class ChunkRepository {
  private collection = collections.chunks;

  // ========================================================================
  // CREATE OPERATIONS
  // ========================================================================

  /**
   * Create a new chunk record
   */
  createChunk = async (chunkData: {
    chunkId: string;
    videoId: string;
    chunkIndex: number;
    startByte: number;
    endByte: number;
    sizeBytes: number;
  }): Promise<Chunk> => {
    try {
      const chunk = await database.write(async () => {
        return await this.collection.create(chunk => {
          chunk.chunkId = chunkData.chunkId;
          chunk.videoId = chunkData.videoId;
          chunk.chunkIndex = chunkData.chunkIndex;
          chunk.startByte = chunkData.startByte;
          chunk.endByte = chunkData.endByte;
          chunk.sizeBytes = chunkData.sizeBytes;
          chunk.status = 'pending';
          chunk.retryCount = 0;
          chunk.uploadUrl = '';
          chunk.cloudinaryPublicId = '';
          chunk.uploadStartedAt = 0;
          chunk.uploadCompletedAt = 0;
          chunk.uploadSpeed = 0;
          chunk.errorMessage = '';
          chunk.createdAt = Date.now();
          chunk.updatedAt = Date.now();
        });
      });

      Logger.debug(
        `📦 Created chunk ${chunkData.chunkIndex} for video ${chunkData.videoId}`,
      );
      return chunk;
    } catch (error) {
      Logger.error('Failed to create chunk:', error);
      throw error;
    }
  };

  /**
   * Create multiple chunks for a video (batch operation)
   */
  createChunksForVideo = async (
    videoId: string,
    totalChunks: number,
    chunkSize: number,
    totalFileSize: number,
  ): Promise<Chunk[]> => {
    try {
      const chunks: Chunk[] = [];

      await database.write(async () => {
        for (let i = 0; i < totalChunks; i++) {
          const startByte = i * chunkSize;
          const endByte = Math.min(
            startByte + chunkSize - 1,
            totalFileSize - 1,
          );
          const actualSize = endByte - startByte + 1;

          const chunk = await this.collection.create(chunk => {
            chunk.chunkId = `${videoId}_chunk_${i}`;
            chunk.videoId = videoId;
            chunk.chunkIndex = i;
            chunk.startByte = startByte;
            chunk.endByte = endByte;
            chunk.sizeBytes = actualSize;
            chunk.status = 'pending';
            chunk.retryCount = 0;
            chunk.uploadUrl = '';
            chunk.cloudinaryPublicId = '';
            chunk.uploadStartedAt = 0;
            chunk.uploadCompletedAt = 0;
            chunk.uploadSpeed = 0;
            chunk.errorMessage = '';
            chunk.createdAt = Date.now();
            chunk.updatedAt = Date.now();
          });

          chunks.push(chunk);
        }
      });

      Logger.info(`📦 Created ${totalChunks} chunks for video ${videoId}`);
      return chunks;
    } catch (error) {
      Logger.error('Failed to create chunks for video:', error);
      throw error;
    }
  };

  // ========================================================================
  // READ OPERATIONS
  // ========================================================================

  /**
   * Get chunk by ID
   */
  getChunkById = async (chunkId: string): Promise<Chunk | null> => {
    try {
      const chunks = await this.collection
        .query(Q.where('chunk_id', chunkId))
        .fetch();

      return chunks[0] || null;
    } catch (error) {
      Logger.error(`Failed to get chunk ${chunkId}:`, error);
      return null;
    }
  };

  /**
   * Get all chunks for a video
   */
  getChunksForVideo = async (videoId: string): Promise<Chunk[]> => {
    try {
      return await this.collection
        .query(Q.where('video_id', videoId), Q.sortBy('chunk_index', Q.asc))
        .fetch();
    } catch (error) {
      Logger.error(`Failed to get chunks for video ${videoId}:`, error);
      return [];
    }
  };

  /**
   * Get chunks by status
   */
  getChunksByStatus = async (
    status: ChunkStatus,
    videoId?: string,
  ): Promise<Chunk[]> => {
    try {
      const conditions = [Q.where('status', status)];
      if (videoId) {
        conditions.push(Q.where('video_id', videoId));
      }

      return await this.collection
        .query(...conditions, Q.sortBy('chunk_index', Q.asc))
        .fetch();
    } catch (error) {
      Logger.error(`Failed to get chunks with status ${status}:`, error);
      return [];
    }
  };

  /**
   * Get pending chunks for upload
   */
  getPendingChunks = async (limit?: number): Promise<Chunk[]> => {
    try {
      const query = this.collection.query(
        Q.where('status', 'pending'),
        Q.sortBy('created_at', Q.asc),
      );

      if (limit) {
        const limitedQuery = this.collection.query(
          Q.where('status', 'pending'),
          Q.sortBy('created_at', Q.asc),
          Q.take(limit),
        );
        return await limitedQuery.fetch();
      }

      return await query.fetch();
    } catch (error) {
      Logger.error('Failed to get pending chunks:', error);
      return [];
    }
  };

  /**
   * Get failed chunks for retry
   */
  getFailedChunks = async (maxRetries: number = 3): Promise<Chunk[]> => {
    try {
      return await this.collection
        .query(
          Q.where('status', 'failed'),
          Q.where('retry_count', Q.lt(maxRetries)),
          Q.sortBy('retry_count', Q.asc),
          Q.sortBy('updated_at', Q.asc),
        )
        .fetch();
    } catch (error) {
      Logger.error('Failed to get failed chunks:', error);
      return [];
    }
  };

  // ========================================================================
  // UPDATE OPERATIONS
  // ========================================================================

  /**
   * Start chunk upload
   */
  startChunkUpload = async (
    chunkId: string,
    uploadUrl?: string,
  ): Promise<boolean> => {
    try {
      const chunk = await this.getChunkById(chunkId);
      if (!chunk) return false;

      await chunk.startUpload(uploadUrl);
      return true;
    } catch (error) {
      Logger.error(`Failed to start upload for chunk ${chunkId}:`, error);
      return false;
    }
  };

  /**
   * Complete chunk upload
   */
  completeChunkUpload = async (
    chunkId: string,
    cloudinaryPublicId: string,
    uploadSpeed: number = 0,
  ): Promise<boolean> => {
    try {
      const chunk = await this.getChunkById(chunkId);
      if (!chunk) return false;

      await chunk.completeUpload(cloudinaryPublicId, uploadSpeed);
      Logger.debug(`✅ Completed upload for chunk ${chunkId}`);
      return true;
    } catch (error) {
      Logger.error(`Failed to complete upload for chunk ${chunkId}:`, error);
      return false;
    }
  };

  /**
   * Fail chunk upload with error
   */
  failChunkUpload = async (
    chunkId: string,
    errorMessage: string,
  ): Promise<boolean> => {
    try {
      const chunk = await this.getChunkById(chunkId);
      if (!chunk) return false;

      await chunk.failUpload(errorMessage);
      Logger.warn(`❌ Failed upload for chunk ${chunkId}: ${errorMessage}`);
      return true;
    } catch (error) {
      Logger.error(`Failed to mark chunk ${chunkId} as failed:`, error);
      return false;
    }
  };

  /**
   * Reset chunk for retry
   */
  resetChunkForRetry = async (chunkId: string): Promise<boolean> => {
    try {
      const chunk = await this.getChunkById(chunkId);
      if (!chunk) return false;

      await chunk.resetForRetry();
      Logger.info(`🔄 Reset chunk ${chunkId} for retry`);
      return true;
    } catch (error) {
      Logger.error(`Failed to reset chunk ${chunkId} for retry:`, error);
      return false;
    }
  };

  // ========================================================================
  // DELETE OPERATIONS
  // ========================================================================

  /**
   * Delete all chunks for a video
   */
  deleteChunksForVideo = async (videoId: string): Promise<number> => {
    try {
      const chunks = await this.getChunksForVideo(videoId);

      await database.write(async () => {
        for (const chunk of chunks) {
          await chunk.markAsDeleted();
        }
      });

      Logger.info(`Deleted ${chunks.length} chunks for video ${videoId}`);
      return chunks.length;
    } catch (error) {
      Logger.error(`Failed to delete chunks for video ${videoId}:`, error);
      return 0;
    }
  };

  /**
   * Delete completed chunks older than specified days
   */
  deleteOldCompletedChunks = async (daysOld: number = 7): Promise<number> => {
    try {
      const cutoffTime = Date.now() - daysOld * 24 * 60 * 60 * 1000;

      const oldChunks = await this.collection
        .query(
          Q.where('status', 'completed'),
          Q.where('upload_completed_at', Q.lt(cutoffTime)),
        )
        .fetch();

      await database.write(async () => {
        for (const chunk of oldChunks) {
          await chunk.markAsDeleted();
        }
      });

      Logger.info(`Deleted ${oldChunks.length} old completed chunks`);
      return oldChunks.length;
    } catch (error) {
      Logger.error('Failed to delete old completed chunks:', error);
      return 0;
    }
  };

  // ========================================================================
  // ANALYTICS AND STATISTICS
  // ========================================================================

  /**
   * Get chunk statistics for a video
   */
  getVideoChunkStats = async (videoId: string) => {
    try {
      const [
        totalChunks,
        pendingChunks,
        uploadingChunks,
        completedChunks,
        failedChunks,
      ] = await Promise.all([
        this.collection.query(Q.where('video_id', videoId)).fetchCount(),
        this.collection
          .query(Q.where('video_id', videoId), Q.where('status', 'pending'))
          .fetchCount(),
        this.collection
          .query(Q.where('video_id', videoId), Q.where('status', 'uploading'))
          .fetchCount(),
        this.collection
          .query(Q.where('video_id', videoId), Q.where('status', 'completed'))
          .fetchCount(),
        this.collection
          .query(Q.where('video_id', videoId), Q.where('status', 'failed'))
          .fetchCount(),
      ]);

      const progress =
        totalChunks > 0 ? (completedChunks / totalChunks) * 100 : 0;

      return {
        total: totalChunks,
        pending: pendingChunks,
        uploading: uploadingChunks,
        completed: completedChunks,
        failed: failedChunks,
        progress,
      };
    } catch (error) {
      Logger.error(`Failed to get chunk stats for video ${videoId}:`, error);
      return {
        total: 0,
        pending: 0,
        uploading: 0,
        completed: 0,
        failed: 0,
        progress: 0,
      };
    }
  };

  /**
   * Get overall chunk statistics
   */
  getOverallChunkStats = async () => {
    try {
      const [
        totalChunks,
        pendingChunks,
        uploadingChunks,
        completedChunks,
        failedChunks,
      ] = await Promise.all([
        this.collection.query().fetchCount(),
        this.collection.query(Q.where('status', 'pending')).fetchCount(),
        this.collection.query(Q.where('status', 'uploading')).fetchCount(),
        this.collection.query(Q.where('status', 'completed')).fetchCount(),
        this.collection.query(Q.where('status', 'failed')).fetchCount(),
      ]);

      return {
        total: totalChunks,
        pending: pendingChunks,
        uploading: uploadingChunks,
        completed: completedChunks,
        failed: failedChunks,
        overallProgress:
          totalChunks > 0 ? (completedChunks / totalChunks) * 100 : 0,
      };
    } catch (error) {
      Logger.error('Failed to get overall chunk stats:', error);
      return {
        total: 0,
        pending: 0,
        uploading: 0,
        completed: 0,
        failed: 0,
        overallProgress: 0,
      };
    }
  };
}

// Export singleton instance
export const chunkRepository = new ChunkRepository();
