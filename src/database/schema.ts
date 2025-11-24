// ============================================================================
// FILE: src/database/schema.ts
// WatermelonDB schema for 5GB video chunk processing
// ============================================================================

import {appSchema, tableSchema} from '@nozbe/watermelondb';

export const schema = appSchema({
  version: 1,
  tables: [
    // Videos table - stores video metadata and upload state
    tableSchema({
      name: 'videos',
      columns: [
        {name: 'video_id', type: 'string', isIndexed: true}, // Unique video identifier
        {name: 'file_name', type: 'string', isIndexed: true}, // Original filename
        {name: 'file_uri', type: 'string'}, // Local file path
        {name: 'file_size', type: 'number', isIndexed: true}, // File size in bytes (for 5GB support)
        {name: 'mime_type', type: 'string'},
        {name: 'total_chunks', type: 'number', isIndexed: true}, // Total number of chunks
        {name: 'chunk_size', type: 'number'}, // Size per chunk (20MB default)
        {name: 'status', type: 'string', isIndexed: true}, // pending, processing, completed, failed
        {name: 'upload_progress', type: 'number'}, // 0-100 percentage
        {name: 'chunks_completed', type: 'number', isIndexed: true}, // Number of completed chunks
        {name: 'chunks_failed', type: 'number'}, // Number of failed chunks
        {name: 'upload_speed', type: 'number'}, // Upload speed in MB/s
        {name: 'time_remaining', type: 'number'}, // Estimated time remaining in seconds
        {name: 'cloudinary_folder', type: 'string'}, // Cloudinary folder path
        {name: 'created_at', type: 'number', isIndexed: true}, // Unix timestamp
        {name: 'updated_at', type: 'number', isIndexed: true}, // Unix timestamp
        {name: 'started_at', type: 'number'}, // Upload start time
        {name: 'completed_at', type: 'number'}, // Upload completion time
      ],
    }),

    // Chunks table - stores individual chunk information
    tableSchema({
      name: 'chunks',
      columns: [
        {name: 'chunk_id', type: 'string', isIndexed: true}, // Unique chunk identifier
        {name: 'video_id', type: 'string', isIndexed: true}, // Foreign key to videos
        {name: 'chunk_index', type: 'number', isIndexed: true}, // 0-based chunk index
        {name: 'start_byte', type: 'number'}, // Starting byte position
        {name: 'end_byte', type: 'number'}, // Ending byte position
        {name: 'size_bytes', type: 'number'}, // Chunk size in bytes
        {name: 'status', type: 'string', isIndexed: true}, // pending, uploading, completed, failed
        {name: 'retry_count', type: 'number'}, // Number of upload attempts
        {name: 'upload_url', type: 'string'}, // Cloudinary upload URL
        {name: 'cloudinary_public_id', type: 'string'}, // Cloudinary response ID
        {name: 'upload_started_at', type: 'number'}, // Upload start time
        {name: 'upload_completed_at', type: 'number'}, // Upload completion time
        {name: 'error_message', type: 'string'}, // Last error message
        {name: 'upload_speed', type: 'number'}, // Individual chunk upload speed
        {name: 'created_at', type: 'number', isIndexed: true},
        {name: 'updated_at', type: 'number', isIndexed: true},
      ],
    }),

    // Upload Jobs table - for recovery and job management
    tableSchema({
      name: 'upload_jobs',
      columns: [
        {name: 'job_id', type: 'string', isIndexed: true}, // WorkManager job ID
        {name: 'video_id', type: 'string', isIndexed: true}, // Associated video
        {name: 'job_type', type: 'string'}, // chunk_upload, video_processing, etc.
        {name: 'status', type: 'string', isIndexed: true}, // queued, running, completed, failed
        {name: 'priority', type: 'number'}, // Job priority (1-5)
        {name: 'retry_count', type: 'number'},
        {name: 'max_retries', type: 'number'},
        {name: 'worker_class', type: 'string'}, // Java worker class name
        {name: 'input_data', type: 'string'}, // JSON serialized input data
        {name: 'output_data', type: 'string'}, // JSON serialized output data
        {name: 'error_message', type: 'string'},
        {name: 'scheduled_at', type: 'number'}, // When job was scheduled
        {name: 'started_at', type: 'number'}, // When job started running
        {name: 'completed_at', type: 'number'}, // When job completed
        {name: 'created_at', type: 'number', isIndexed: true},
        {name: 'updated_at', type: 'number', isIndexed: true},
      ],
    }),

    // Upload Sessions table - for analytics and recovery
    tableSchema({
      name: 'upload_sessions',
      columns: [
        {name: 'session_id', type: 'string', isIndexed: true},
        {name: 'total_videos', type: 'number'},
        {name: 'total_size_bytes', type: 'number'}, // Total session size
        {name: 'videos_completed', type: 'number'},
        {name: 'videos_failed', type: 'number'},
        {name: 'total_chunks', type: 'number'},
        {name: 'chunks_completed', type: 'number'},
        {name: 'chunks_failed', type: 'number'},
        {name: 'average_upload_speed', type: 'number'}, // MB/s
        {name: 'total_upload_time', type: 'number'}, // Seconds
        {name: 'network_type', type: 'string'}, // wifi, mobile, etc.
        {name: 'device_info', type: 'string'}, // JSON device information
        {name: 'app_version', type: 'string'},
        {name: 'status', type: 'string', isIndexed: true}, // active, completed, aborted
        {name: 'started_at', type: 'number', isIndexed: true},
        {name: 'completed_at', type: 'number'},
        {name: 'created_at', type: 'number', isIndexed: true},
        {name: 'updated_at', type: 'number', isIndexed: true},
      ],
    }),

    // Error Logs table - for debugging and analytics
    tableSchema({
      name: 'error_logs',
      columns: [
        {name: 'log_id', type: 'string', isIndexed: true},
        {name: 'video_id', type: 'string', isIndexed: true}, // Optional association
        {name: 'chunk_id', type: 'string', isIndexed: true}, // Optional association
        {name: 'job_id', type: 'string', isIndexed: true}, // Optional association
        {name: 'error_type', type: 'string', isIndexed: true}, // network, file, upload, etc.
        {name: 'error_code', type: 'string'},
        {name: 'error_message', type: 'string'},
        {name: 'stack_trace', type: 'string'},
        {name: 'context_data', type: 'string'}, // JSON additional context
        {name: 'severity', type: 'string', isIndexed: true}, // low, medium, high, critical
        {name: 'resolved', type: 'boolean', isIndexed: true},
        {name: 'resolution_notes', type: 'string'},
        {name: 'occurred_at', type: 'number', isIndexed: true},
        {name: 'created_at', type: 'number', isIndexed: true},
        {name: 'updated_at', type: 'number', isIndexed: true},
      ],
    }),
  ],
});

// Database migrations for future schema changes
export const migrations = [
  // Migration example for future updates
  // {
  //   toVersion: 2,
  //   steps: [
  //     createTable({
  //       name: 'new_table',
  //       columns: [
  //         { name: 'id', type: 'string', isIndexed: true },
  //       ],
  //     }),
  //   ],
  // },
];
