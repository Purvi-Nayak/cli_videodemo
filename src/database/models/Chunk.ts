// ============================================================================
// FILE: src/database/models/Chunk.ts
// WatermelonDB Chunk model for individual video chunk tracking
// ============================================================================

import {Model} from '@nozbe/watermelondb';
import {field, relation, action} from '@nozbe/watermelondb/decorators';
import type Video from './Video';

export type ChunkStatus = 'pending' | 'uploading' | 'completed' | 'failed';

export default class Chunk extends Model {
  static table = 'chunks';
  static associations = {
    videos: {type: 'belongs_to' as const, key: 'video_id'},
  };

  // Core chunk information
  @field('chunk_id') chunkId!: string;
  @field('video_id') videoId!: string;
  @field('chunk_index') chunkIndex!: number; // 0-based index
  @field('start_byte') startByte!: number;
  @field('end_byte') endByte!: number;
  @field('size_bytes') sizeBytes!: number;

  // Upload status and tracking
  @field('status') status!: ChunkStatus;
  @field('retry_count') retryCount!: number;
  @field('upload_url') uploadUrl!: string;
  @field('cloudinary_public_id') cloudinaryPublicId!: string;

  // Performance tracking
  @field('upload_started_at') uploadStartedAt!: number;
  @field('upload_completed_at') uploadCompletedAt!: number;
  @field('upload_speed') uploadSpeed!: number; // MB/s

  // Error handling
  @field('error_message') errorMessage!: string;

  // Timestamps
  @field('created_at') createdAt!: number;
  @field('updated_at') updatedAt!: number;

  // Relationships
  @relation('videos', 'video_id') video!: Video;

  // Computed properties
  get sizeFormatted(): string {
    return this.formatFileSize(this.sizeBytes);
  }

  get isCompleted(): boolean {
    return this.status === 'completed' && this.cloudinaryPublicId.length > 0;
  }

  get isFailed(): boolean {
    return this.status === 'failed' || this.retryCount > 3;
  }

  get canRetry(): boolean {
    return this.status === 'failed' && this.retryCount < 3;
  }

  get uploadDuration(): number {
    if (this.uploadStartedAt && this.uploadCompletedAt) {
      return this.uploadCompletedAt - this.uploadStartedAt;
    }
    return 0;
  }

  get uploadDurationFormatted(): string {
    const duration = this.uploadDuration;
    if (duration <= 0) return 'N/A';

    const seconds = Math.floor(duration / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    } else {
      return `${remainingSeconds}s`;
    }
  }

  get uploadSpeedFormatted(): string {
    if (this.uploadSpeed <= 0) return 'N/A';

    if (this.uploadSpeed < 1) {
      return `${(this.uploadSpeed * 1024).toFixed(1)} KB/s`;
    } else {
      return `${this.uploadSpeed.toFixed(2)} MB/s`;
    }
  }

  // Actions for updating chunk status
  @action async startUpload(uploadUrl?: string) {
    await this.update(chunk => {
      chunk.status = 'uploading';
      chunk.uploadStartedAt = Date.now();
      chunk.updatedAt = Date.now();
      if (uploadUrl) {
        chunk.uploadUrl = uploadUrl;
      }
    });
  }

  @action async completeUpload(
    cloudinaryPublicId: string,
    uploadSpeed: number = 0,
  ) {
    await this.update(chunk => {
      chunk.status = 'completed';
      chunk.cloudinaryPublicId = cloudinaryPublicId;
      chunk.uploadCompletedAt = Date.now();
      chunk.uploadSpeed = uploadSpeed;
      chunk.errorMessage = '';
      chunk.updatedAt = Date.now();
    });
  }

  @action async failUpload(errorMessage: string) {
    await this.update(chunk => {
      chunk.status = 'failed';
      chunk.errorMessage = errorMessage;
      chunk.retryCount = chunk.retryCount + 1;
      chunk.updatedAt = Date.now();
    });
  }

  @action async resetForRetry() {
    await this.update(chunk => {
      chunk.status = 'pending';
      chunk.uploadStartedAt = 0;
      chunk.uploadCompletedAt = 0;
      chunk.uploadSpeed = 0;
      chunk.errorMessage = '';
      chunk.updatedAt = Date.now();
    });
  }

  @action async updateProgress(uploadSpeed: number) {
    await this.update(chunk => {
      chunk.uploadSpeed = uploadSpeed;
      chunk.updatedAt = Date.now();
    });
  }

  // Helper methods
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';

    const units = ['B', 'KB', 'MB', 'GB'];
    const k = 1024;
    const dm = 2;

    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + units[i];
  }

  // Factory method for creating new chunks
  static createChunk = (chunkData: {
    chunkId: string;
    videoId: string;
    chunkIndex: number;
    startByte: number;
    endByte: number;
    sizeBytes: number;
  }) => {
    const now = Date.now();

    return {
      chunkId: chunkData.chunkId,
      videoId: chunkData.videoId,
      chunkIndex: chunkData.chunkIndex,
      startByte: chunkData.startByte,
      endByte: chunkData.endByte,
      sizeBytes: chunkData.sizeBytes,
      status: 'pending' as ChunkStatus,
      retryCount: 0,
      uploadUrl: '',
      cloudinaryPublicId: '',
      uploadStartedAt: 0,
      uploadCompletedAt: 0,
      uploadSpeed: 0,
      errorMessage: '',
      createdAt: now,
      updatedAt: now,
    };
  };
}
