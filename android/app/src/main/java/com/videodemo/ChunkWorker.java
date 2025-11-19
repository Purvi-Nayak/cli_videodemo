// ============================================================================
// FILE: android/app/src/main/java/com/videodemo/ChunkWorker.java
// WorkManager Worker that processes video chunks in background
// ============================================================================

package com.videodemo;

import android.content.Context;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import androidx.work.Data;

import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.RandomAccessFile;
import java.util.Base64;
import java.util.concurrent.TimeUnit;

public class ChunkWorker extends Worker {
    private static final String TAG = "ChunkWorker";
    private static final int PROCESSING_DELAY_MS = 500; // Delay between chunks
    private static final int MAX_RETRIES = 3;

    public ChunkWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        try {
            Log.d(TAG, "ChunkWorker started - Processing chunks in background");

            // Get chunks data from input
            String chunksJson = getInputData().getString("chunks");
            long timestamp = getInputData().getLong("timestamp", System.currentTimeMillis());
            
            if (chunksJson == null || chunksJson.isEmpty()) {
                Log.e(TAG, "No chunks data provided");
                sendErrorEvent("No chunks data provided");
                return Result.failure();
            }

            JSONArray chunks = new JSONArray(chunksJson);
            Log.d(TAG, "Processing " + chunks.length() + " chunks (started at " + timestamp + ")");

            int processedCount = 0;
            int failedCount = 0;

            // Process each chunk
            for (int i = 0; i < chunks.length(); i++) {
                // Check if work is stopped
                if (isStopped()) {
                    Log.d(TAG, "Work stopped by user after processing " + processedCount + " chunks");
                    sendWorkCompleteEvent(false, "Work cancelled after processing " + processedCount + " chunks");
                    return Result.failure();
                }

                try {
                    JSONObject chunk = chunks.getJSONObject(i);
                    boolean success = processChunk(chunk, i + 1, chunks.length());
                    
                    if (success) {
                        processedCount++;
                    } else {
                        failedCount++;
                    }

                    // Small delay between chunks to avoid overwhelming system
                    if (i < chunks.length() - 1) { // Don't delay after last chunk
                        Thread.sleep(PROCESSING_DELAY_MS);
                    }

                } catch (Exception e) {
                    Log.e(TAG, "Error processing chunk " + (i + 1), e);
                    failedCount++;
                    sendChunkErrorEvent("Error processing chunk " + (i + 1) + ": " + e.getMessage());
                }
            }

            Log.d(TAG, "Work completed: " + processedCount + " succeeded, " + failedCount + " failed");
            
            // Send completion event
            boolean success = failedCount == 0;
            String message = processedCount + " chunks processed successfully";
            if (failedCount > 0) {
                message += ", " + failedCount + " failed";
            }
            
            sendWorkCompleteEvent(success, message);
            
            return success ? Result.success() : Result.failure();

        } catch (Exception e) {
            Log.e(TAG, "Fatal error in ChunkWorker", e);
            sendErrorEvent("Fatal error: " + e.getMessage());
            return Result.failure();
        }
    }

    /**
     * Process a single chunk
     * This simulates reading and uploading the chunk
     */
    private boolean processChunk(JSONObject chunk, int currentIndex, int totalChunks) {
        try {
            String chunkId = chunk.getString("id");
            String videoId = chunk.getString("videoId");
            String fileName = chunk.getString("fileName");
            int chunkIndex = chunk.getInt("chunkIndex");
            double startByte = chunk.getDouble("startByte");
            double endByte = chunk.getDouble("endByte");
            double size = chunk.getDouble("size");

            Log.d(TAG, String.format(
                "Processing chunk %d/%d: %s (chunk %d/%d, %.2f MB)",
                currentIndex, totalChunks, fileName, chunkIndex + 1, 
                chunk.getInt("totalChunks"), size / (1024.0 * 1024.0)
            ));

            // Simulate chunk processing work
            // In production, you would:
            // 1. Read the actual chunk from file using startByte/endByte
            // 2. Upload to your server
            // 3. Handle retries and errors
            
            // Simulate variable processing time
            long processingTime = (long) (500 + Math.random() * 1000); // 0.5-1.5 seconds
            Thread.sleep(processingTime);

            // Simulate occasional failures (5% failure rate for testing)
            if (Math.random() < 0.05) {
                throw new Exception("Simulated processing failure");
            }

            // Send progress event to React Native
            sendChunkProcessedEvent(chunkId, fileName, chunkIndex, 
                chunk.getInt("totalChunks"), "completed");

            Log.d(TAG, String.format(
                "Chunk %d/%d completed (%s, chunk %d)",
                currentIndex, totalChunks, fileName, chunkIndex + 1
            ));

            return true;

        } catch (Exception e) {
            Log.e(TAG, "Error processing chunk", e);
            
            try {
                // Send failure event
                sendChunkProcessedEvent(
                    chunk.getString("id"),
                    chunk.getString("fileName"),
                    chunk.getInt("chunkIndex"),
                    chunk.getInt("totalChunks"),
                    "failed"
                );
            } catch (Exception eventError) {
                Log.e(TAG, "Error sending failure event", eventError);
            }
            
            return false;
        }
    }

    /**
     * Send chunk processed event to React Native
     */
    private void sendChunkProcessedEvent(String chunkId, String fileName, 
                                       int chunkIndex, int totalChunks, String status) {
        try {
            WritableMap params = Arguments.createMap();
            params.putString("chunkId", chunkId);
            params.putString("fileName", fileName);
            params.putInt("chunkIndex", chunkIndex);
            params.putInt("totalChunks", totalChunks);
            params.putString("status", status);
            params.putLong("timestamp", System.currentTimeMillis());

            VideoChunkModule.sendEvent("onChunkProcessed", params);
        } catch (Exception e) {
            Log.e(TAG, "Error sending chunk processed event", e);
        }
    }

    /**
     * Send work completion event
     */
    private void sendWorkCompleteEvent(boolean success, String message) {
        try {
            WritableMap params = Arguments.createMap();
            params.putBoolean("success", success);
            params.putString("message", message);
            params.putLong("timestamp", System.currentTimeMillis());

            VideoChunkModule.sendEvent("onWorkComplete", params);
        } catch (Exception e) {
            Log.e(TAG, "Error sending work complete event", e);
        }
    }

    /**
     * Send error event
     */
    private void sendErrorEvent(String errorMessage) {
        try {
            WritableMap params = Arguments.createMap();
            params.putString("message", errorMessage);
            params.putLong("timestamp", System.currentTimeMillis());

            VideoChunkModule.sendEvent("onWorkError", params);
        } catch (Exception e) {
            Log.e(TAG, "Error sending error event", e);
        }
    }

    /**
     * Send chunk error event
     */
    private void sendChunkErrorEvent(String errorMessage) {
        try {
            WritableMap params = Arguments.createMap();
            params.putString("message", errorMessage);
            params.putString("type", "chunk_error");
            params.putLong("timestamp", System.currentTimeMillis());

            VideoChunkModule.sendEvent("onWorkError", params);
        } catch (Exception e) {
            Log.e(TAG, "Error sending chunk error event", e);
        }
    }

    /**
     * Read chunk from file (Production implementation)
     * This shows how to actually read a chunk from a video file
     */
    private byte[] readChunkFromFile(String filePath, long startByte, int size) throws Exception {
        File file = new File(filePath);
        if (!file.exists()) {
            throw new Exception("File not found: " + filePath);
        }

        RandomAccessFile randomAccessFile = null;
        try {
            randomAccessFile = new RandomAccessFile(file, "r");
            randomAccessFile.seek(startByte);
            
            byte[] buffer = new byte[size];
            int bytesRead = randomAccessFile.read(buffer);
            
            if (bytesRead != size) {
                // Handle case where we read less than expected (end of file)
                byte[] actualBuffer = new byte[bytesRead];
                System.arraycopy(buffer, 0, actualBuffer, 0, bytesRead);
                return actualBuffer;
            }
            
            return buffer;
        } finally {
            if (randomAccessFile != null) {
                try {
                    randomAccessFile.close();
                } catch (Exception e) {
                    Log.w(TAG, "Error closing file", e);
                }
            }
        }
    }

    /**
     * Convert bytes to Base64 string
     */
    private String bytesToBase64(byte[] bytes) {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            return Base64.getEncoder().encodeToString(bytes);
        } else {
            return android.util.Base64.encodeToString(bytes, android.util.Base64.DEFAULT);
        }
    }

    /**
     * Upload chunk to server (Production implementation)
     * This is where you would implement actual HTTP upload
     */
    private void uploadChunk(String videoId, int chunkIndex, byte[] chunkData) throws Exception {
        // TODO: Implement actual HTTP upload to your server
        // Example using HTTP connection:
        /*
        URL url = new URL("https://your-server.com/upload");
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setRequestMethod("POST");
        connection.setRequestProperty("Content-Type", "application/octet-stream");
        connection.setRequestProperty("Video-ID", videoId);
        connection.setRequestProperty("Chunk-Index", String.valueOf(chunkIndex));
        connection.setDoOutput(true);
        
        try (OutputStream outputStream = connection.getOutputStream()) {
            outputStream.write(chunkData);
        }
        
        int responseCode = connection.getResponseCode();
        if (responseCode != 200) {
            throw new Exception("Upload failed with response code: " + responseCode);
        }
        */
        
        Log.d(TAG, "Uploading chunk " + chunkIndex + " for video " + videoId + 
              " (" + chunkData.length + " bytes)");
        
        // Simulate upload delay
        Thread.sleep(200);
    }

    /**
     * Calculate MD5 hash of chunk data
     */
    private String calculateMD5(byte[] data) {
        try {
            java.security.MessageDigest md = java.security.MessageDigest.getInstance("MD5");
            byte[] hash = md.digest(data);
            
            StringBuilder hexString = new StringBuilder();
            for (byte b : hash) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1) {
                    hexString.append('0');
                }
                hexString.append(hex);
            }
            
            return hexString.toString();
        } catch (Exception e) {
            Log.e(TAG, "Error calculating MD5", e);
            return null;
        }
    }
}