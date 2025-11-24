// ============================================================================
// FILE: src/storage/MMKVStorage.ts
// Ultra-fast storage for real-time chunk operations using MMKV
// ============================================================================

import {MMKV} from 'react-native-mmkv';
import {Logger} from '../utils/logger';

// MMKV Storage Keys for different data types
const KEYS = {
  // Real-time counters (updated every chunk completion)
  CHUNK_COUNTER: 'chunk_counter_', // videoId -> completed count
  CHUNK_PROGRESS: 'chunk_progress_', // videoId -> progress percentage
  UPLOAD_SPEED: 'upload_speed_', // videoId -> current MB/s

  // Upload flags and states (ultra-fast read/write)
  UPLOAD_RUNNING: 'upload_running_', // videoId -> boolean
  UPLOAD_PAUSED: 'upload_paused_', // videoId -> boolean
  NETWORK_AVAILABLE: 'network_available', // global -> boolean
  BATTERY_OPTIMIZED: 'battery_optimized', // global -> boolean

  // Temporary chunk data (cleared after upload)
  CHUNK_TEMP: 'chunk_temp_', // chunkId -> temp data
  FAILED_CHUNKS: 'failed_chunks_', // videoId -> failed chunk IDs array
  RETRY_QUEUE: 'retry_queue_', // videoId -> retry chunk IDs array

  // Performance metrics (for UI and analytics)
  SESSION_START: 'session_start', // global -> timestamp
  TOTAL_UPLOADED: 'total_uploaded', // global -> bytes
  UPLOAD_ERRORS: 'upload_errors', // global -> error count

  // App state flags
  LAST_ACTIVE: 'last_active', // global -> timestamp
  BACKGROUND_JOBS: 'background_jobs', // global -> active job IDs array
  APP_VERSION: 'app_version', // global -> version string
} as const;

class MMKVStorageService {
  private storage: MMKV;

  constructor() {
    this.storage = new MMKV({
      id: 'VideoChunkProcessor',
      encryptionKey: 'video_chunks_secure_key_2024', // Encrypt sensitive data
    });

    Logger.info('🚀 MMKV Storage initialized');
  }

  // ========================================================================
  // REAL-TIME CHUNK COUNTERS (Updated every chunk completion)
  // ========================================================================

  /**
   * Update chunk completion counter (called every chunk upload)
   * Ultra-fast: ~0.1ms operation
   */
  updateChunkCounter = (videoId: string, completedCount: number): void => {
    this.storage.set(`${KEYS.CHUNK_COUNTER}${videoId}`, completedCount);
  };

  /**
   * Get current chunk completion count
   * Ultra-fast: ~0.05ms operation
   */
  getChunkCounter = (videoId: string): number => {
    return this.storage.getNumber(`${KEYS.CHUNK_COUNTER}${videoId}`) || 0;
  };

  /**
   * Update upload progress percentage
   * Called every chunk completion for instant UI updates
   */
  updateProgress = (videoId: string, percentage: number): void => {
    this.storage.set(`${KEYS.CHUNK_PROGRESS}${videoId}`, percentage);
  };

  /**
   * Get current upload progress
   */
  getProgress = (videoId: string): number => {
    return this.storage.getNumber(`${KEYS.CHUNK_PROGRESS}${videoId}`) || 0;
  };

  /**
   * Update real-time upload speed (MB/s)
   * Called every few seconds during upload
   */
  updateUploadSpeed = (videoId: string, mbPerSecond: number): void => {
    this.storage.set(`${KEYS.UPLOAD_SPEED}${videoId}`, mbPerSecond);
  };

  /**
   * Get current upload speed
   */
  getUploadSpeed = (videoId: string): number => {
    return this.storage.getNumber(`${KEYS.UPLOAD_SPEED}${videoId}`) || 0;
  };

  // ========================================================================
  // UPLOAD STATE FLAGS (Instant read/write for UI responsiveness)
  // ========================================================================

  /**
   * Mark video upload as running
   */
  setUploadRunning = (videoId: string, isRunning: boolean): void => {
    this.storage.set(`${KEYS.UPLOAD_RUNNING}${videoId}`, isRunning);
  };

  /**
   * Check if video upload is currently running
   */
  isUploadRunning = (videoId: string): boolean => {
    return this.storage.getBoolean(`${KEYS.UPLOAD_RUNNING}${videoId}`) || false;
  };

  /**
   * Mark video upload as paused
   */
  setUploadPaused = (videoId: string, isPaused: boolean): void => {
    this.storage.set(`${KEYS.UPLOAD_PAUSED}${videoId}`, isPaused);
  };

  /**
   * Check if video upload is paused
   */
  isUploadPaused = (videoId: string): boolean => {
    return this.storage.getBoolean(`${KEYS.UPLOAD_PAUSED}${videoId}`) || false;
  };

  /**
   * Global network availability flag
   */
  setNetworkAvailable = (isAvailable: boolean): void => {
    this.storage.set(KEYS.NETWORK_AVAILABLE, isAvailable);
  };

  /**
   * Check if network is available
   */
  isNetworkAvailable = (): boolean => {
    return this.storage.getBoolean(KEYS.NETWORK_AVAILABLE) || false;
  };

  // ========================================================================
  // TEMPORARY CHUNK DATA (Cleared after successful upload)
  // ========================================================================

  /**
   * Store temporary chunk data during upload
   * Automatically cleared after successful upload
   */
  setChunkTempData = (chunkId: string, data: any): void => {
    this.storage.set(`${KEYS.CHUNK_TEMP}${chunkId}`, JSON.stringify(data));
  };

  /**
   * Get temporary chunk data
   */
  getChunkTempData = (chunkId: string): any => {
    const data = this.storage.getString(`${KEYS.CHUNK_TEMP}${chunkId}`);
    return data ? JSON.parse(data) : null;
  };

  /**
   * Clear temporary chunk data
   */
  clearChunkTempData = (chunkId: string): void => {
    this.storage.delete(`${KEYS.CHUNK_TEMP}${chunkId}`);
  };

  /**
   * Add failed chunk to retry queue
   */
  addFailedChunk = (videoId: string, chunkId: string): void => {
    const failedChunks = this.getFailedChunks(videoId);
    if (!failedChunks.includes(chunkId)) {
      failedChunks.push(chunkId);
      this.storage.set(
        `${KEYS.FAILED_CHUNKS}${videoId}`,
        JSON.stringify(failedChunks),
      );
    }
  };

  /**
   * Get failed chunks for video
   */
  getFailedChunks = (videoId: string): string[] => {
    const data = this.storage.getString(`${KEYS.FAILED_CHUNKS}${videoId}`);
    return data ? JSON.parse(data) : [];
  };

  /**
   * Remove chunk from failed list (after successful retry)
   */
  removeFailedChunk = (videoId: string, chunkId: string): void => {
    const failedChunks = this.getFailedChunks(videoId);
    const filtered = failedChunks.filter(id => id !== chunkId);
    this.storage.set(
      `${KEYS.FAILED_CHUNKS}${videoId}`,
      JSON.stringify(filtered),
    );
  };

  /**
   * Clear all failed chunks for video
   */
  clearFailedChunks = (videoId: string): void => {
    this.storage.delete(`${KEYS.FAILED_CHUNKS}${videoId}`);
  };

  // ========================================================================
  // PERFORMANCE METRICS (For analytics and UI)
  // ========================================================================

  /**
   * Mark session start time
   */
  setSessionStart = (): void => {
    this.storage.set(KEYS.SESSION_START, Date.now());
  };

  /**
   * Get session duration in milliseconds
   */
  getSessionDuration = (): number => {
    const start = this.storage.getNumber(KEYS.SESSION_START);
    return start ? Date.now() - start : 0;
  };

  /**
   * Update total bytes uploaded in this session
   */
  updateTotalUploaded = (bytes: number): void => {
    const current = this.storage.getNumber(KEYS.TOTAL_UPLOADED) || 0;
    this.storage.set(KEYS.TOTAL_UPLOADED, current + bytes);
  };

  /**
   * Get total bytes uploaded in session
   */
  getTotalUploaded = (): number => {
    return this.storage.getNumber(KEYS.TOTAL_UPLOADED) || 0;
  };

  /**
   * Increment error counter
   */
  incrementErrorCount = (): void => {
    const current = this.storage.getNumber(KEYS.UPLOAD_ERRORS) || 0;
    this.storage.set(KEYS.UPLOAD_ERRORS, current + 1);
  };

  /**
   * Get total error count
   */
  getErrorCount = (): number => {
    return this.storage.getNumber(KEYS.UPLOAD_ERRORS) || 0;
  };

  // ========================================================================
  // BACKGROUND JOB TRACKING
  // ========================================================================

  /**
   * Add active background job
   */
  addBackgroundJob = (jobId: string): void => {
    const jobs = this.getBackgroundJobs();
    if (!jobs.includes(jobId)) {
      jobs.push(jobId);
      this.storage.set(KEYS.BACKGROUND_JOBS, JSON.stringify(jobs));
    }
  };

  /**
   * Remove completed background job
   */
  removeBackgroundJob = (jobId: string): void => {
    const jobs = this.getBackgroundJobs();
    const filtered = jobs.filter(id => id !== jobId);
    this.storage.set(KEYS.BACKGROUND_JOBS, JSON.stringify(filtered));
  };

  /**
   * Get all active background jobs
   */
  getBackgroundJobs = (): string[] => {
    const data = this.storage.getString(KEYS.BACKGROUND_JOBS);
    return data ? JSON.parse(data) : [];
  };

  /**
   * Check if any background jobs are running
   */
  hasActiveJobs = (): boolean => {
    return this.getBackgroundJobs().length > 0;
  };

  // ========================================================================
  // VIDEO-SPECIFIC OPERATIONS (Batch operations for performance)
  // ========================================================================

  /**
   * Get all real-time data for a video (single operation)
   * Returns: { progress, speed, counter, isRunning, isPaused, failedChunks }
   */
  getVideoRealTimeData = (videoId: string) => {
    return {
      progress: this.getProgress(videoId),
      speed: this.getUploadSpeed(videoId),
      counter: this.getChunkCounter(videoId),
      isRunning: this.isUploadRunning(videoId),
      isPaused: this.isUploadPaused(videoId),
      failedChunks: this.getFailedChunks(videoId),
    };
  };

  /**
   * Clear all data for a completed video
   */
  clearVideoData = (videoId: string): void => {
    const keys = [
      `${KEYS.CHUNK_COUNTER}${videoId}`,
      `${KEYS.CHUNK_PROGRESS}${videoId}`,
      `${KEYS.UPLOAD_SPEED}${videoId}`,
      `${KEYS.UPLOAD_RUNNING}${videoId}`,
      `${KEYS.UPLOAD_PAUSED}${videoId}`,
      `${KEYS.FAILED_CHUNKS}${videoId}`,
      `${KEYS.RETRY_QUEUE}${videoId}`,
    ];

    keys.forEach(key => this.storage.delete(key));
  };

  // ========================================================================
  // CLEANUP AND MAINTENANCE
  // ========================================================================

  /**
   * Clear all temporary data (call on app start)
   */
  clearTempData = (): void => {
    // Get all keys and find temp keys
    const allKeys = this.storage.getAllKeys();
    const tempKeys = allKeys.filter(
      key =>
        key.includes('chunk_temp_') ||
        key.includes('upload_running_') ||
        key.includes('upload_paused_'),
    );

    tempKeys.forEach(key => this.storage.delete(key));

    Logger.info(`🧹 Cleared ${tempKeys.length} temporary MMKV keys`);
  };

  /**
   * Reset session data (new session)
   */
  resetSession = (): void => {
    this.storage.set(KEYS.SESSION_START, Date.now());
    this.storage.set(KEYS.TOTAL_UPLOADED, 0);
    this.storage.set(KEYS.UPLOAD_ERRORS, 0);
    this.storage.set(KEYS.BACKGROUND_JOBS, JSON.stringify([]));
    this.storage.set(KEYS.LAST_ACTIVE, Date.now());
  };

  /**
   * Get storage statistics
   */
  getStorageStats = () => {
    const allKeys = this.storage.getAllKeys();
    const keysByType = {
      counters: allKeys.filter(
        k => k.includes('counter_') || k.includes('progress_'),
      ).length,
      flags: allKeys.filter(
        k => k.includes('running_') || k.includes('paused_'),
      ).length,
      temp: allKeys.filter(k => k.includes('temp_')).length,
      failed: allKeys.filter(k => k.includes('failed_')).length,
      global: allKeys.filter(k => !k.includes('_')).length,
    };

    return {
      totalKeys: allKeys.length,
      breakdown: keysByType,
      sessionDuration: this.getSessionDuration(),
      totalUploaded: this.getTotalUploaded(),
      errorCount: this.getErrorCount(),
      activeJobs: this.getBackgroundJobs().length,
    };
  };
}

// Export singleton instance for app-wide use
export const mmkvStorage = new MMKVStorageService();

// Export the class for testing
export {MMKVStorageService};
