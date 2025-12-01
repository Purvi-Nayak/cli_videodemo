// Bridge to native Android background service using WorkManager

import {NativeModules, NativeEventEmitter, Platform} from 'react-native';
import {queueManager} from './QueueManager';
import {Logger} from '../utils/logger';
import type {ProgressEvent, CloudinaryConfig} from '../types';

// Get native module
const {VideoChunkModule} = NativeModules;

if (!VideoChunkModule) {
  Logger.error('VideoChunkModule native module not found!');
}

// Create event emitter for listening to native events
const eventEmitter = VideoChunkModule
  ? new NativeEventEmitter(VideoChunkModule)
  : null;

// State management
let isInitialized = false;
let listeners: Array<{remove: () => void}> = [];

// Cloudinary configuration
let cloudinaryConfig: CloudinaryConfig = {
  cloudName: 'dmoajpxcj',
  uploadPreset: 'chat_app_upload',
};

/**
 * Initialize the background service with optional Cloudinary config
 */
export const initializeBackgroundService = (
  config?: Partial<CloudinaryConfig>,
): void => {
  if (isInitialized) {
    Logger.warn('BackgroundService already initialized');
    return;
  }

  if (Platform.OS !== 'android') {
    Logger.warn('BackgroundService is only supported on Android');
    return;
  }

  if (!VideoChunkModule) {
    Logger.error(
      'VideoChunkModule not available - ensure native module is properly linked',
    );
    return;
  }

  // Update Cloudinary config if provided
  if (config) {
    cloudinaryConfig = {...cloudinaryConfig, ...config};
  }

  isInitialized = true;
  Logger.info(
    'BackgroundService initialized successfully with Cloudinary:',
    cloudinaryConfig.cloudName,
  );
};

/**
 * Start background work using WorkManager with Cloudinary upload
 */
export const startBackgroundWork = async (): Promise<void> => {
  try {
    if (!isInitialized || !VideoChunkModule) {
      throw new Error('BackgroundService not properly initialized');
    }

    // Get all pending chunks from QueueManager
    const pendingChunks = queueManager.getPendingChunks();

    if (pendingChunks.length === 0) {
      Logger.warn('No pending chunks to process');
      return;
    }

    // Get video files for file paths
    const videosMap = new Map();
    queueManager.getAllVideos().forEach(video => {
      videosMap.set(video.id, video);
    });

    // Convert chunks to format expected by native module
    const chunksForNative = pendingChunks.map(chunk => {
      const video = videosMap.get(chunk.videoId);
      return {
        id: chunk.id,
        videoId: chunk.videoId,
        fileName: chunk.fileName,
        chunkIndex: chunk.chunkIndex,
        totalChunks: chunk.totalChunks,
        startByte: chunk.startByte,
        endByte: chunk.endByte,
        size: chunk.size,
        filePath: video?.uri || '', // Add file path for reading
      };
    });

    Logger.info(
      ` Starting Cloudinary upload of ${chunksForNative.length} pending chunks`,
    );

    // Start background work via native module with Cloudinary config
    await VideoChunkModule.startCloudinaryUpload(chunksForNative, {
      cloudName: cloudinaryConfig.cloudName,
      uploadPreset: cloudinaryConfig.uploadPreset,
      apiKey: cloudinaryConfig.apiKey,
    });

    Logger.info(' Cloudinary background work started successfully');
  } catch (error) {
    Logger.error(' Failed to start background work:', error);
    throw error;
  }
};

/**
 * Stop background work
 */
export const stopBackgroundWork = async (): Promise<void> => {
  try {
    if (!VideoChunkModule) {
      Logger.warn('VideoChunkModule not available');
      return;
    }

    await VideoChunkModule.stopBackgroundWork();
    Logger.info(' Background work stopped');
  } catch (error) {
    Logger.error(' Failed to stop background work:', error);
    throw error;
  }
};

/**
 * Check if background work is currently running
 */
export const isWorkRunning = async (): Promise<boolean> => {
  try {
    if (!VideoChunkModule) {
      return false;
    }

    return await VideoChunkModule.isWorkRunning();
  } catch (error) {
    Logger.error(' Failed to check work status:', error);
    return false;
  }
};

/**
 * Add listener for progress updates from native module
 */
export const addProgressListener = (
  callback: (event: ProgressEvent) => void,
): {remove: () => void} => {
  if (!eventEmitter) {
    Logger.warn('Event emitter not available');
    return {remove: () => {}};
  }

  const subscription = eventEmitter.addListener('onChunkProcessed', event => {
    Logger.debug(' Received progress event:', event);

    // Update chunk status in QueueManager
    if (event.chunkId && event.status) {
      queueManager
        .updateChunkStatus(event.chunkId, event.status)
        .catch(error => Logger.error(' Failed to update chunk status:', error));
    }

    // Call user callback
    callback(event);
  });

  // Keep track of subscription for cleanup
  listeners.push(subscription);
  return subscription;
};

/**
 * Add listener for work completion
 */
export const addWorkCompleteListener = (
  callback: (success: boolean, message: string) => void,
): {remove: () => void} => {
  if (!eventEmitter) {
    Logger.warn('Event emitter not available');
    return {remove: () => {}};
  }

  const subscription = eventEmitter.addListener('onWorkComplete', event => {
    Logger.info(' Work completed:', event);
    callback(event.success, event.message);
  });

  listeners.push(subscription);
  return subscription;
};

/**
 * Add listener for work errors
 */
export const addErrorListener = (
  callback: (error: string) => void,
): {remove: () => void} => {
  if (!eventEmitter) {
    Logger.warn('Event emitter not available');
    return {remove: () => {}};
  }

  const subscription = eventEmitter.addListener('onWorkError', event => {
    Logger.error(' Work error:', event);
    callback(event.message || 'Unknown error');
  });

  listeners.push(subscription);
  return subscription;
};

/**
 * Remove all listeners and cleanup
 */
export const cleanup = (): void => {
  listeners.forEach(listener => {
    try {
      listener.remove();
    } catch (error) {
      Logger.warn(' Error removing listener:', error);
    }
  });

  listeners = [];
  isInitialized = false;
  Logger.info(' BackgroundService cleanup completed');
};

/**
 * Get work queue information from native side
 */
export const getWorkQueueInfo = async (): Promise<any> => {
  try {
    if (!VideoChunkModule) {
      return null;
    }

    return await VideoChunkModule.getWorkQueueInfo();
  } catch (error) {
    Logger.error(' Failed to get work queue info:', error);
    return null;
  }
};

/**
 * Cancel specific work by tag/id
 */
export const cancelWork = async (workId?: string): Promise<void> => {
  try {
    if (!VideoChunkModule) {
      Logger.warn('VideoChunkModule not available');
      return;
    }

    if (workId) {
      await VideoChunkModule.cancelWorkById(workId);
      Logger.info(` Cancelled work: ${workId}`);
    } else {
      await VideoChunkModule.stopBackgroundWork();
      Logger.info(' Cancelled all background work');
    }
  } catch (error) {
    Logger.error(' Failed to cancel work:', error);
    throw error;
  }
};

/**
 * Test native module connectivity
 */
export const testConnection = (): boolean => {
  if (!VideoChunkModule) {
    Logger.error(' VideoChunkModule not found');
    return false;
  }

  try {
    // Test method exists
    const methods = [
      'startBackgroundWork',
      'stopBackgroundWork',
      'isWorkRunning',
    ];

    const available = methods.every(
      method => typeof VideoChunkModule[method] === 'function',
    );

    if (available) {
      Logger.info(' Native module connection test passed');
      return true;
    } else {
      Logger.error(' Some native module methods are missing');
      return false;
    }
  } catch (error) {
    Logger.error(' Native module connection test failed:', error);
    return false;
  }
};

/**
 * Get current Cloudinary configuration
 */
export const getCloudinaryConfig = (): CloudinaryConfig => {
  return {...cloudinaryConfig};
};

/**
 * Update Cloudinary configuration
 */
export const updateCloudinaryConfig = (
  config: Partial<CloudinaryConfig>,
): void => {
  cloudinaryConfig = {...cloudinaryConfig, ...config};
  Logger.info(' Cloudinary config updated:', cloudinaryConfig);
};

// Export as default object for convenient importing
export const backgroundService = {
  initialize: initializeBackgroundService,
  startBackgroundWork,
  stopBackgroundWork,
  isWorkRunning,
  addProgressListener,
  addWorkCompleteListener,
  addErrorListener,
  cleanup,
  getWorkQueueInfo,
  cancelWork,
  testConnection,
  getCloudinaryConfig,
  updateCloudinaryConfig,
};
