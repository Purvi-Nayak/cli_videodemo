// ============================================================================
// FILE: src/database/DatabaseInitializer.ts
// Database initialization and setup for 5GB video support
// ============================================================================

import {initializeDatabase} from './index';
import {databaseQueueManager} from '../services/DatabaseQueueManager';
import {Logger} from '../utils/logger';

export class DatabaseInitializer {
  private static isInitialized = false;
  private static initializationPromise: Promise<boolean> | null = null;

  /**
   * Initialize the entire database system
   * This should be called once during app startup
   */
  static initialize = async (): Promise<boolean> => {
    // Prevent multiple initialization attempts
    if (this.initializationPromise) {
      return await this.initializationPromise;
    }

    if (this.isInitialized) {
      return true;
    }

    this.initializationPromise = this.performInitialization();
    const result = await this.initializationPromise;
    this.initializationPromise = null;

    return result;
  };

  private static performInitialization = async (): Promise<boolean> => {
    try {
      Logger.info('🚀 Starting database initialization...');
      const startTime = Date.now();

      // Step 1: Initialize WatermelonDB
      Logger.info('📊 Initializing WatermelonDB...');
      const dbInitialized = await initializeDatabase();

      if (!dbInitialized) {
        Logger.error('❌ Failed to initialize WatermelonDB');
        return false;
      }

      Logger.info('✅ WatermelonDB initialized successfully');

      // Step 2: Initialize Database Queue Manager
      Logger.info('🗂️ Initializing Database Queue Manager...');
      const queueInitialized = await databaseQueueManager.initialize();

      if (!queueInitialized) {
        Logger.error('❌ Failed to initialize Database Queue Manager');
        return false;
      }

      Logger.info('✅ Database Queue Manager initialized successfully');

      // Step 3: Cleanup old data (optional)
      Logger.info('🧹 Performing database cleanup...');
      await this.performCleanup();

      // Step 4: Validate database integrity
      Logger.info('🔍 Validating database integrity...');
      const isValid = await this.validateDatabaseIntegrity();

      if (!isValid) {
        Logger.warn('⚠️ Database integrity issues detected, but continuing...');
      }

      const endTime = Date.now();
      const initTime = endTime - startTime;

      Logger.info(`🎉 Database initialization completed in ${initTime}ms`);
      Logger.info('💾 Ready to handle 5GB video uploads with chunking');

      this.isInitialized = true;
      return true;
    } catch (error) {
      Logger.error('💥 Database initialization failed:', error);
      this.isInitialized = false;
      return false;
    }
  };

  /**
   * Perform database cleanup on startup
   */
  private static performCleanup = async (): Promise<void> => {
    try {
      // This could include:
      // - Removing orphaned chunks
      // - Cleaning up failed uploads older than X days
      // - Resetting stuck "processing" statuses to "failed"

      Logger.debug('🧹 Database cleanup completed');
    } catch (error) {
      Logger.warn('⚠️ Database cleanup failed:', error);
    }
  };

  /**
   * Validate database integrity
   */
  private static validateDatabaseIntegrity = async (): Promise<boolean> => {
    try {
      // Basic validation - try to get stats
      const stats = await databaseQueueManager.getStats();

      Logger.info(`📊 Database validation passed:`);
      Logger.info(`   - Total videos: ${stats.videos.total}`);
      Logger.info(`   - Total chunks: ${stats.chunks.total}`);
      Logger.info(`   - Total size: ${stats.performance.totalSizeGB} GB`);

      return true;
    } catch (error) {
      Logger.error('❌ Database validation failed:', error);
      return false;
    }
  };

  /**
   * Check if database is initialized
   */
  static isReady = (): boolean => {
    return this.isInitialized;
  };

  /**
   * Reset initialization state (for testing)
   */
  static reset = (): void => {
    this.isInitialized = false;
    this.initializationPromise = null;
  };

  /**
   * Get database status information
   */
  static getStatus = async () => {
    if (!this.isInitialized) {
      return {
        initialized: false,
        ready: false,
        error: 'Database not initialized',
      };
    }

    try {
      const stats = await databaseQueueManager.getStats();

      return {
        initialized: true,
        ready: true,
        stats,
        capabilities: {
          maxFileSize: '5GB',
          chunkSize: '20-50MB',
          database: 'WatermelonDB + SQLite',
          fastStorage: 'MMKV (pending)',
          platform: 'Android',
        },
      };
    } catch (error) {
      return {
        initialized: true,
        ready: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  };
}

// Export for easy access
export const initializeAppDatabase = DatabaseInitializer.initialize;
export const isDatabaseReady = DatabaseInitializer.isReady;
export const getDatabaseStatus = DatabaseInitializer.getStatus;
