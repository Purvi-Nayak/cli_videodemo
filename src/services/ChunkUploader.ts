// src/services/ChunkUploader.ts

import {Logger} from '../utils/logger';

// Use your physical device / machine IP only
const LOCAL_IP = '192.168.1.162';
const API_URL = `http://${LOCAL_IP}:5000/api/upload`;

export const uploadChunk = async (
  chunkUri: string,
  fileName: string,
  chunkIndex: number,
  totalChunks: number,
) => {
  try {
    const formData = new FormData();

    formData.append('videos', {
      uri: chunkUri,
      type: 'video/mp4',
      name: `${fileName}_chunk_${chunkIndex}.mp4`,
    } as any);

    formData.append('chunkIndex', String(chunkIndex));
    formData.append('totalChunks', String(totalChunks));
    formData.append('originalFileName', fileName);

    // IMPORTANT: do NOT set Content-Type manually for FormData in RN
    const response = await fetch(API_URL, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const text = await response.text();
      Logger.error('Chunk upload HTTP error', response.status, text);
      throw new Error(
        `Upload failed: ${response.status} ${response.statusText}`,
      );
    }

    const result = await response.json();
    Logger.info('Chunk upload result:', result);
    return result;
  } catch (err: any) {
    Logger.error('Chunk upload failed:', err);
    throw err;
  }
};

/**
 * Upload full file (useful for quick test)
 * - uri: file://... or content uri returned by DocumentPicker
 * - fileName: original file name
 */
export async function uploadFullVideo(fileUri: string, fileName?: string) {
  const api = API_URL;
  try {
    const formData = new FormData();
    formData.append('videos', {
      uri: fileUri,
      type: 'video/mp4',
      name: fileName || `upload_${Date.now()}.mp4`,
    } as any);

    // optional metadata
    formData.append('originalFileName', fileName || '');
    formData.append('isFullUpload', '1');

    const res = await fetch(api, {
      method: 'POST',
      body: formData, // do NOT set Content-Type header manually
    });

    if (!res.ok) {
      const text = await res.text();
      Logger.error('uploadFullVideo HTTP error', res.status, text);
      throw new Error(`Upload failed: ${res.status} ${res.statusText}`);
    }

    const json = await res.json();
    Logger.info('uploadFullVideo success', json);
    return json;
  } catch (err: any) {
    Logger.error('uploadFullVideo failed', err);
    throw err;
  }
}
