// ============================================================================
// FILE: src/database/models/UploadJob.ts
// WatermelonDB UploadJob model for WorkManager job tracking
// ============================================================================

import {Model} from '@nozbe/watermelondb';
import {field, relation, action} from '@nozbe/watermelondb/decorators';
import type Video from './Video';

export type JobStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';
export type JobType = 'chunk_upload' | 'video_processing' | 'cleanup' | 'retry';

export default class UploadJob extends Model {
  static table = 'upload_jobs';
  static associations = {
    videos: {type: 'belongs_to' as const, key: 'video_id'},
  };

  // Core job information
  @field('job_id') jobId!: string; // WorkManager UUID
  @field('video_id') videoId!: string;
  @field('job_type') jobType!: JobType;
  @field('status') status!: JobStatus;
  @field('priority') priority!: number; // 1-5, higher is more important

  // Retry logic
  @field('retry_count') retryCount!: number;
  @field('max_retries') maxRetries!: number;

  // Worker information
  @field('worker_class') workerClass!: string;

  // Data payload (JSON serialized)
  @field('input_data') inputData!: string;
  @field('output_data') outputData!: string;

  // Error handling
  @field('error_message') errorMessage!: string;

  // Timing
  @field('scheduled_at') scheduledAt!: number;
  @field('started_at') startedAt!: number;
  @field('completed_at') completedAt!: number;

  // Timestamps
  @field('created_at') createdAt!: number;
  @field('updated_at') updatedAt!: number;

  // Relationships
  @relation('videos', 'video_id') video!: Video;

  // Computed properties
  get isRunning(): boolean {
    return this.status === 'running';
  }

  get isCompleted(): boolean {
    return this.status === 'completed';
  }

  get isFailed(): boolean {
    return this.status === 'failed';
  }

  get canRetry(): boolean {
    return this.status === 'failed' && this.retryCount < this.maxRetries;
  }

  get executionTime(): number {
    if (this.startedAt && this.completedAt) {
      return this.completedAt - this.startedAt;
    }
    return 0;
  }

  get executionTimeFormatted(): string {
    const time = this.executionTime;
    if (time <= 0) return 'N/A';

    const seconds = Math.floor(time / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  get queueTime(): number {
    if (this.scheduledAt && this.startedAt) {
      return this.startedAt - this.scheduledAt;
    }
    return 0;
  }

  get inputDataParsed(): any {
    try {
      return JSON.parse(this.inputData || '{}');
    } catch {
      return {};
    }
  }

  get outputDataParsed(): any {
    try {
      return JSON.parse(this.outputData || '{}');
    } catch {
      return {};
    }
  }

  // Actions for updating job status
  @action async startJob() {
    await this.update(job => {
      job.status = 'running';
      job.startedAt = Date.now();
      job.updatedAt = Date.now();
    });
  }

  @action async completeJob(outputData?: any) {
    await this.update(job => {
      job.status = 'completed';
      job.completedAt = Date.now();
      job.updatedAt = Date.now();
      if (outputData) {
        job.outputData = JSON.stringify(outputData);
      }
    });
  }

  @action async failJob(errorMessage: string) {
    await this.update(job => {
      job.status = 'failed';
      job.errorMessage = errorMessage;
      job.retryCount = job.retryCount + 1;
      job.completedAt = Date.now();
      job.updatedAt = Date.now();
    });
  }

  @action async cancelJob() {
    await this.update(job => {
      job.status = 'cancelled';
      job.completedAt = Date.now();
      job.updatedAt = Date.now();
    });
  }

  @action async resetForRetry() {
    await this.update(job => {
      job.status = 'queued';
      job.startedAt = 0;
      job.completedAt = 0;
      job.errorMessage = '';
      job.scheduledAt = Date.now();
      job.updatedAt = Date.now();
    });
  }

  @action async updateInputData(inputData: any) {
    await this.update(job => {
      job.inputData = JSON.stringify(inputData);
      job.updatedAt = Date.now();
    });
  }

  @action async updateOutputData(outputData: any) {
    await this.update(job => {
      job.outputData = JSON.stringify(outputData);
      job.updatedAt = Date.now();
    });
  }

  // Factory method for creating new jobs
  static createJob = (jobData: {
    jobId: string;
    videoId: string;
    jobType: JobType;
    priority?: number;
    maxRetries?: number;
    workerClass: string;
    inputData?: any;
  }) => {
    const now = Date.now();

    return {
      jobId: jobData.jobId,
      videoId: jobData.videoId,
      jobType: jobData.jobType,
      status: 'queued' as JobStatus,
      priority: jobData.priority || 3,
      retryCount: 0,
      maxRetries: jobData.maxRetries || 3,
      workerClass: jobData.workerClass,
      inputData: JSON.stringify(jobData.inputData || {}),
      outputData: '{}',
      errorMessage: '',
      scheduledAt: now,
      startedAt: 0,
      completedAt: 0,
      createdAt: now,
      updatedAt: now,
    };
  };
}
