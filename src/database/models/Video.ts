// ============================================================================
// FILE: src/database/models/Video.ts
// WatermelonDB Video model for 5GB video support
// ============================================================================

import {Model} from '@nozbe/watermelondb';
import {field, children, writer, action} from '@nozbe/watermelondb/decorators';
import type {Collection} from '@nozbe/watermelondb';

export type VideoStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'paused';

export default class Video extends Model {
  static table = 'videos';
  static associations = {
    chunks: {type: 'has_many' as const, foreignKey: 'video_id'},
    upload_jobs: {type: 'has_many' as const, foreignKey: 'video_id'},
  };

  // Core video information
  @field('video_id') videoId!: string;
  @field('file_name') fileName!: string;
  @field('file_uri') fileUri!: string;
  @field('file_size') fileSize!: number; // Supports up to 9 petabytes (JavaScript number limit)
  @field('mime_type') mimeType!: string;

  // Chunking information
  @field('total_chunks') totalChunks!: number;
  @field('chunk_size') chunkSize!: number;

  // Upload status and progress
  @field('status') status!: VideoStatus;
  @field('upload_progress') uploadProgress!: number; // 0-100
  @field('chunks_completed') chunksCompleted!: number;
  @field('chunks_failed') chunksFailed!: number;

  // Performance metrics
  @field('upload_speed') uploadSpeed!: number; // MB/s
  @field('time_remaining') timeRemaining!: number; // seconds

  // Cloudinary information
  @field('cloudinary_folder') cloudinaryFolder!: string;

  // Timestamps
  @field('created_at') createdAt!: number;
  @field('updated_at') updatedAt!: number;
  @field('started_at') startedAt!: number;
  @field('completed_at') completedAt!: number;

  // Relationships (using any to avoid circular import issues)
  @children('chunks') chunks!: Collection<any>;
  @children('upload_jobs') uploadJobs!: Collection<any>;

  // Computed properties
  get fileSizeFormatted(): string {
    return this.formatFileSize(this.fileSize);
  }

  get isLargeFile(): boolean {
    return this.fileSize > 1024 * 1024 * 1024; // > 1GB
  }

  get isCompleted(): boolean {
    return this.status === 'completed' && this.uploadProgress === 100;
  }

  get isFailed(): boolean {
    return this.status === 'failed' || this.chunksFailed > 0;
  }

  get estimatedTimeFormatted(): string {
    if (this.timeRemaining <= 0) return 'Unknown';

    const hours = Math.floor(this.timeRemaining / 3600);
    const minutes = Math.floor((this.timeRemaining % 3600) / 60);
    const seconds = Math.floor(this.timeRemaining % 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  }

  get uploadSpeedFormatted(): string {
    if (this.uploadSpeed <= 0) return '0 MB/s';

    if (this.uploadSpeed < 1) {
      return `${(this.uploadSpeed * 1024).toFixed(1)} KB/s`;
    } else {
      return `${this.uploadSpeed.toFixed(2)} MB/s`;
    }
  }

  // Actions for updating video status
  @action async updateProgress(
    chunksCompleted: number,
    uploadSpeed: number = 0,
  ) {
    const progress =
      this.totalChunks > 0 ? (chunksCompleted / this.totalChunks) * 100 : 0;
    const timeRemaining =
      uploadSpeed > 0
        ? ((this.totalChunks - chunksCompleted) * this.chunkSize) /
          1024 /
          1024 /
          uploadSpeed
        : 0;

    await this.update(video => {
      video.chunksCompleted = chunksCompleted;
      video.uploadProgress = Math.min(progress, 100);
      video.uploadSpeed = uploadSpeed;
      video.timeRemaining = timeRemaining;
      video.updatedAt = Date.now();
    });
  }

  @action async updateStatus(status: VideoStatus, error?: string) {
    await this.update(video => {
      video.status = status;
      video.updatedAt = Date.now();

      // Update timestamps based on status
      if (status === 'processing' && !video.startedAt) {
        video.startedAt = Date.now();
      } else if (status === 'completed' || status === 'failed') {
        video.completedAt = Date.now();
      }
    });
  }

  @action async incrementFailedChunks() {
    await this.update(video => {
      video.chunksFailed = video.chunksFailed + 1;
      video.updatedAt = Date.now();
    });
  }

  @action async resetProgress() {
    await this.update(video => {
      video.chunksCompleted = 0;
      video.chunksFailed = 0;
      video.uploadProgress = 0;
      video.uploadSpeed = 0;
      video.timeRemaining = 0;
      video.status = 'pending';
      video.startedAt = 0;
      video.completedAt = 0;
      video.updatedAt = Date.now();
    });
  }

  // Helper methods
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const k = 1024;
    const dm = 2;

    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + units[i];
  }

  // Factory method for creating new videos
  static createVideo = (videoData: {
    videoId: string;
    fileName: string;
    fileUri: string;
    fileSize: number;
    mimeType: string;
    totalChunks: number;
    chunkSize: number;
    cloudinaryFolder?: string;
  }) => {
    const now = Date.now();

    return {
      videoId: videoData.videoId,
      fileName: videoData.fileName,
      fileUri: videoData.fileUri,
      fileSize: videoData.fileSize,
      mimeType: videoData.mimeType,
      totalChunks: videoData.totalChunks,
      chunkSize: videoData.chunkSize,
      status: 'pending' as VideoStatus,
      uploadProgress: 0,
      chunksCompleted: 0,
      chunksFailed: 0,
      uploadSpeed: 0,
      timeRemaining: 0,
      cloudinaryFolder: videoData.cloudinaryFolder || '',
      createdAt: now,
      updatedAt: now,
      startedAt: 0,
      completedAt: 0,
    };
  };
}
