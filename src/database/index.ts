// ============================================================================
// FILE: src/database/index.ts
// WatermelonDB database setup and initialization
// ============================================================================

import {Database} from '@nozbe/watermelondb';
import {setGenerator} from '@nozbe/watermelondb/utils/common/randomId';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';

import {schema} from './schema';
import {Video, Chunk, UploadJob} from './models';

// Configure database adapter for Android
const adapter = new SQLiteAdapter({
  schema,
  dbName: 'VideoChunkProcessor',
  jsi: true, // Use JSI for better performance on newer RN versions
  onSetUpError: error => {
    console.error('Database setup error:', error);
  },
});

// Create database instance
export const database = new Database({
  adapter,
  modelClasses: [Video, Chunk, UploadJob],
});

// Use a secure random ID generator
setGenerator(() => {
  // Generate UUID v4 for better uniqueness with large datasets
  return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c == 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
});

// Database initialization and error handling
export const initializeDatabase = async (): Promise<boolean> => {
  try {
    console.log('🗄️ Initializing WatermelonDB...');

    // Test database connection
    await database.write(async () => {
      // Simple write operation to test connection
    });

    console.log('✅ WatermelonDB initialized successfully');
    return true;
  } catch (error) {
    console.error('❌ Failed to initialize WatermelonDB:', error);
    return false;
  }
};

// Database collections (for easy access)
export const collections = {
  videos: database.collections.get<Video>('videos'),
  chunks: database.collections.get<Chunk>('chunks'),
  uploadJobs: database.collections.get<UploadJob>('upload_jobs'),
};

// Export database instance
export {database as default};
