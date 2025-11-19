// ============================================================================
// FILE: android/app/src/main/java/com/videodemo/VideoChunkModule.java
// Native Android module for background video chunk processing
// ============================================================================

package com.videodemo;

import android.content.Context;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.Data;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkInfo;
import androidx.work.WorkManager;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutionException;

public class VideoChunkModule extends ReactContextBaseJavaModule {
    private static final String TAG = "VideoChunkModule";
    private static final String WORK_NAME = "video_chunk_work";
    private static ReactApplicationContext reactContext;

    public VideoChunkModule(ReactApplicationContext context) {
        super(context);
        reactContext = context;
        Log.d(TAG, "VideoChunkModule initialized");
    }

    @NonNull
    @Override
    public String getName() {
        return "VideoChunkModule";
    }

    /**
     * Send event to React Native
     */
    public static void sendEvent(String eventName, WritableMap params) {
        if (reactContext != null && reactContext.hasActiveCatalystInstance()) {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit(eventName, params);
        }
    }

    /**
     * Start background work using WorkManager
     * This will continue even if app is killed
     */
    @ReactMethod
    public void startBackgroundWork(ReadableArray chunks, Promise promise) {
        try {
            Log.d(TAG, "Starting background work with " + chunks.size() + " chunks");

            if (chunks.size() == 0) {
                promise.reject("NO_CHUNKS", "No chunks provided for processing");
                return;
            }

            // Convert ReadableArray to JSON string
            JSONArray jsonChunks = new JSONArray();
            for (int i = 0; i < chunks.size(); i++) {
                ReadableMap chunk = chunks.getMap(i);
                JSONObject jsonChunk = new JSONObject();
                
                jsonChunk.put("id", chunk.getString("id"));
                jsonChunk.put("videoId", chunk.getString("videoId"));
                jsonChunk.put("fileName", chunk.getString("fileName"));
                jsonChunk.put("chunkIndex", chunk.getInt("chunkIndex"));
                jsonChunk.put("totalChunks", chunk.getInt("totalChunks"));
                jsonChunk.put("startByte", chunk.getDouble("startByte")); // Use double for large numbers
                jsonChunk.put("endByte", chunk.getDouble("endByte"));
                jsonChunk.put("size", chunk.getDouble("size"));
                
                jsonChunks.put(jsonChunk);
            }

            // Create input data for WorkManager
            Data inputData = new Data.Builder()
                .putString("chunks", jsonChunks.toString())
                .putLong("timestamp", System.currentTimeMillis())
                .build();

            // Set constraints
            Constraints constraints = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.NOT_REQUIRED) // Can work offline
                .setRequiresBatteryNotLow(false) // Can run on low battery
                .setRequiresCharging(false) // Can run without charging
                .setRequiresStorageNotLow(true) // Need storage for processing
                .build();

            // Create work request
            OneTimeWorkRequest workRequest = new OneTimeWorkRequest.Builder(ChunkWorker.class)
                .setInputData(inputData)
                .setConstraints(constraints)
                .addTag(WORK_NAME)
                .build();

            // Enqueue work (replace existing work with same name)
            WorkManager workManager = WorkManager.getInstance(reactContext);
            workManager.enqueueUniqueWork(
                WORK_NAME,
                ExistingWorkPolicy.REPLACE,
                workRequest
            );

            Log.d(TAG, "Background work scheduled successfully with ID: " + workRequest.getId());
            
            // Send success response
            WritableMap result = Arguments.createMap();
            result.putString("workId", workRequest.getId().toString());
            result.putBoolean("success", true);
            
            promise.resolve(result);
            
        } catch (Exception e) {
            Log.e(TAG, "Error starting background work", e);
            promise.reject("START_WORK_ERROR", "Failed to start background work: " + e.getMessage());
        }
    }

    /**
     * Stop background work
     */
    @ReactMethod
    public void stopBackgroundWork(Promise promise) {
        try {
            WorkManager workManager = WorkManager.getInstance(reactContext);
            workManager.cancelUniqueWork(WORK_NAME);
            
            Log.d(TAG, "Background work stopped");
            promise.resolve(true);
            
        } catch (Exception e) {
            Log.e(TAG, "Error stopping background work", e);
            promise.reject("STOP_WORK_ERROR", "Failed to stop background work: " + e.getMessage());
        }
    }

    /**
     * Cancel work by ID
     */
    @ReactMethod
    public void cancelWorkById(String workId, Promise promise) {
        try {
            WorkManager workManager = WorkManager.getInstance(reactContext);
            workManager.cancelWorkById(UUID.fromString(workId));
            
            Log.d(TAG, "Work cancelled: " + workId);
            promise.resolve(true);
            
        } catch (Exception e) {
            Log.e(TAG, "Error cancelling work", e);
            promise.reject("CANCEL_WORK_ERROR", "Failed to cancel work: " + e.getMessage());
        }
    }

    /**
     * Check if work is running
     */
    @ReactMethod
    public void isWorkRunning(Promise promise) {
        try {
            WorkManager workManager = WorkManager.getInstance(reactContext);
            List<WorkInfo> workInfos = workManager.getWorkInfosForUniqueWork(WORK_NAME).get();
            
            boolean isRunning = false;
            for (WorkInfo workInfo : workInfos) {
                if (workInfo.getState() == WorkInfo.State.RUNNING || 
                    workInfo.getState() == WorkInfo.State.ENQUEUED) {
                    isRunning = true;
                    break;
                }
            }
            
            Log.d(TAG, "Work running status: " + isRunning);
            promise.resolve(isRunning);
            
        } catch (InterruptedException | ExecutionException e) {
            Log.e(TAG, "Error checking work status", e);
            promise.reject("CHECK_WORK_ERROR", "Failed to check work status: " + e.getMessage());
        }
    }

    /**
     * Get work queue information
     */
    @ReactMethod
    public void getWorkQueueInfo(Promise promise) {
        try {
            WorkManager workManager = WorkManager.getInstance(reactContext);
            List<WorkInfo> workInfos = workManager.getWorkInfosForUniqueWork(WORK_NAME).get();
            
            WritableMap result = Arguments.createMap();
            result.putInt("totalWorks", workInfos.size());
            
            int running = 0, enqueued = 0, succeeded = 0, failed = 0, cancelled = 0;
            
            for (WorkInfo workInfo : workInfos) {
                switch (workInfo.getState()) {
                    case RUNNING:
                        running++;
                        break;
                    case ENQUEUED:
                        enqueued++;
                        break;
                    case SUCCEEDED:
                        succeeded++;
                        break;
                    case FAILED:
                        failed++;
                        break;
                    case CANCELLED:
                        cancelled++;
                        break;
                }
            }
            
            result.putInt("running", running);
            result.putInt("enqueued", enqueued);
            result.putInt("succeeded", succeeded);
            result.putInt("failed", failed);
            result.putInt("cancelled", cancelled);
            
            promise.resolve(result);
            
        } catch (InterruptedException | ExecutionException e) {
            Log.e(TAG, "Error getting work queue info", e);
            promise.reject("QUEUE_INFO_ERROR", "Failed to get work queue info: " + e.getMessage());
        }
    }

    /**
     * Test method to verify module connection
     */
    @ReactMethod
    public void ping(Promise promise) {
        Log.d(TAG, "Ping received from React Native");
        
        WritableMap result = Arguments.createMap();
        result.putString("message", "Pong from VideoChunkModule");
        result.putLong("timestamp", System.currentTimeMillis());
        result.putString("version", "1.0.0");
        
        promise.resolve(result);
    }
}