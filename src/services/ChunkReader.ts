// ============================================================================
// FILE: src/services/ChunkReader.ts
// Reads video files in chunks using react-native-fs
// ============================================================================

import RNFS from 'react-native-fs';
import type {ChunkInfo, FileInfo} from '../types';
import {Logger} from '../utils/logger';

/**
 * Read a specific chunk from a video file
 * Returns base64 encoded chunk data
 */
export const readChunk = async (chunk: ChunkInfo, fileUri: string): Promise<string> => {
  try {
    Logger.debug(
      `📖 Reading chunk ${chunk.chunkIndex + 1}/${chunk.totalChunks} ` +
        `from ${chunk.fileName} (${(chunk.size / 1024 / 1024).toFixed(2)} MB)`,
    );

    // Validate file exists
    const exists = await RNFS.exists(fileUri);
    if (!exists) {
      throw new Error(`File not found: ${fileUri}`);
    }

    // Read the chunk using react-native-fs
    // We read from startByte with the specified chunk size
    const base64Data = await RNFS.read(
      fileUri,
      chunk.size,
      chunk.startByte,
      'base64',
    );

    Logger.debug(
      `✅ Successfully read chunk ${chunk.chunkIndex + 1}/${chunk.totalChunks} ` +
        `(${base64Data.length} chars base64)`,
    );

    return base64Data;
  } catch (error) {
    Logger.error(`❌ Error reading chunk ${chunk.chunkIndex + 1}:`, error);
    throw error;
  }
};

/**
 * Read chunk as raw bytes
 * Returns Uint8Array for binary data
 */
export const readChunkAsBytes = async (chunk: ChunkInfo, fileUri: string): Promise<Uint8Array> => {
  try {
    const base64Data = await readChunk(chunk, fileUri);

    // Convert base64 to bytes
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);

    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    return bytes;
  } catch (error) {
    Logger.error('❌ Error reading chunk as bytes:', error);
    throw error;
  }
};

/**
 * Get file information
 */
export const getFileInfo = async (fileUri: string): Promise<FileInfo> => {
  try {
    const exists = await RNFS.exists(fileUri);

    if (!exists) {
      return { size: 0, exists: false };
    }

    const stat = await RNFS.stat(fileUri);

    return {
      size: stat.size,
      exists: true,
    };
  } catch (error) {
    Logger.error('❌ Error getting file info:', error);
    return { size: 0, exists: false };
  }
};

/**
 * Validate file can be read
 */
export const validateFile = async (fileUri: string): Promise<boolean> => {
  try {
    const info = await getFileInfo(fileUri);

    if (!info.exists) {
      Logger.error('❌ File does not exist:', fileUri);
      return false;
    }

    if (info.size === 0) {
      Logger.error('❌ File is empty:', fileUri);
      return false;
    }

    Logger.debug(`✅ File validated: ${fileUri} (${formatFileSize(info.size)})`);
    return true;
  } catch (error) {
    Logger.error('❌ Error validating file:', error);
    return false;
  }
};

/**
 * Read a small sample from the beginning of the file to test readability
 */
export const testFileAccess = async (fileUri: string): Promise<boolean> => {
  try {
    // Try to read just the first 1KB
    const testData = await RNFS.read(fileUri, 1024, 0, 'base64');

    if (testData && testData.length > 0) {
      Logger.debug('✅ File access test passed');
      return true;
    }

    Logger.error('❌ File access test failed: no data read');
    return false;
  } catch (error) {
    Logger.error('❌ File access test failed:', error);
    return false;
  }
};

/**
 * Calculate MD5 hash of a chunk (for verification)
 */
export const calculateChunkHash = async (chunk: ChunkInfo, fileUri: string): Promise<string> => {
  try {
    // Read chunk data
    const base64Data = await readChunk(chunk, fileUri);

    // This would require a crypto library for proper MD5
    // For now, we'll return a simple hash based on content
    let hash = 0;
    for (let i = 0; i < base64Data.length; i++) {
      const char = base64Data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }

    return Math.abs(hash).toString(16);
  } catch (error) {
    Logger.error('❌ Error calculating chunk hash:', error);
    throw error;
  }
};

/**
 * Get file mime type from extension
 */
export const getMimeType = (fileName: string): string => {
  const extension = fileName.toLowerCase().split('.').pop();

  const mimeTypes: Record<string, string> = {
    'mp4': 'video/mp4',
    'avi': 'video/x-msvideo',
    'mov': 'video/quicktime',
    'wmv': 'video/x-ms-wmv',
    'flv': 'video/x-flv',
    'webm': 'video/webm',
    'mkv': 'video/x-matroska',
    '3gp': 'video/3gpp',
    'm4v': 'video/x-m4v',
  };

  return mimeTypes[extension || ''] || 'video/mp4';
};

/**
 * Format file size for display
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const dm = 2;

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + units[i];
};

// Export as default object for convenient importing
export const chunkReader = {
  readChunk,
  readChunkAsBytes,
  getFileInfo,
  validateFile,
  testFileAccess,
  calculateChunkHash,
  getMimeType,
  formatFileSize,
};