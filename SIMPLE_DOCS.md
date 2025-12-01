# React Native Video Chunk Processor - Project Documentation

## Table of Contents

1. [Project Overview](#project-overview)
2. [Project Setup](#project-setup)
3. [Architecture Overview](#architecture-overview)
4. [File Structure](#file-structure)
5. [MMKV Storage Setup](#mmkv-storage-setup)
6. [Android Native Components](#android-native-components)
7. [Frontend Components](#frontend-components)
8. [Backend Integration](#backend-integration)
9. [Usage Guide](#usage-guide)
10. [Troubleshooting](#troubleshooting)

---

## 1. Project Overview

**Project Name:** videodemo  
**Version:** 0.0.1  
**Platform:** React Native (iOS/Android)  
**Purpose:** Upload large video files by splitting them into chunks for reliable background processing

### Key Features

- **Chunked Video Upload**: Split large videos (1.5GB+) into manageable chunks (30MB each)
- **Background Processing**: Use Android WorkManager for background upload continuation
- **MMKV Storage**: Fast local storage for queue state persistence
- **Progress Tracking**: Real-time upload progress with chunk-level status
- **Content URI Handling**: Support for various Android file providers (Gallery, Google Photos)

---

## 2. Project Setup

### Prerequisites

- Node.js >= 18
- React Native CLI
- Android Studio (for Android development)
- Xcode (for iOS development)

### Installation Steps

```bash
# 1. Clone and install dependencies
git clone <your-repo>
cd videodemo
npm install

# 2. iOS setup (if targeting iOS)
cd ios && pod install && cd ..

# 3. Android setup
# Ensure Android SDK and build tools are installed
# Open android/ folder in Android Studio to sync Gradle

# 4. Start Metro bundler
npm start

# 5. Run on device/emulator
npm run android  # For Android
npm run ios      # For iOS
```

### Required Permissions

#### Android Permissions (AndroidManifest.xml)

```xml
<!-- Network -->
<uses-permission android:name="android.permission.INTERNET" />

<!-- Storage (API < 33) -->
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />

<!-- Media Access (API >= 33) -->
<uses-permission android:name="android.permission.READ_MEDIA_VIDEO" />

<!-- Background Work -->
<uses-permission android:name="android.permission.WAKE_LOCK" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
```

---

## 3. Architecture Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend UI   │────│   Queue Manager  │────│  MMKV Storage   │
│   (App.tsx)     │    │ (QueueManager.ts)│    │(MMKVStorage.ts) │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                        │                        │
         │                        │                        │
         ▼                        ▼                        ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Chunk Reader   │    │  Chunk Uploader  │    │ Background Svc  │
│(ChunkReader.ts) │    │(ChunkUploader.ts)│    │(BackgroundSvc.ts│
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                        │                        │
         │                        │                        │
         ▼                        ▼                        ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Native RNFS   │    │   HTTP Upload    │    │ Android Worker  │
│   (File I/O)    │    │  (fetch/FormData)│    │(ChunkWorker.java│
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

---

## 4. File Structure

### Frontend Structure

```
src/
├── services/
│   ├── BackgroundService.ts     # Background work coordination
│   ├── ChunkReader.ts           # File reading & chunk extraction
│   ├── ChunkUploader.ts         # HTTP upload logic
│   └── QueueManager.ts          # Queue state management
├── storage/
│   └── MMKVStorage.ts           # MMKV wrapper for fast storage
├── types/
│   └── index.ts                 # TypeScript interfaces
└── utils/
    └── logger.ts                # Logging utility
```

### Android Native Structure

```
android/app/src/main/java/com/videodemo/
├── MainActivity.kt              # Main React Native activity
├── MainApplication.kt           # App entry point with package registration
├── VideoChunkModule.java        # React Native bridge module
├── VideoChunkPackage.java       # Package to register native module
└── ChunkWorker.java            # WorkManager background worker
```

### Key Configuration Files

```
├── index.js                     # App entry point with polyfills
├── App.tsx                      # Main UI component
├── package.json                 # Dependencies and scripts
├── android/
│   ├── app/src/main/AndroidManifest.xml  # Android permissions & config
│   └── app/build.gradle         # Android build configuration
└── ios/
    └── videodemo/Info.plist     # iOS permissions & config
```

---

## 5. MMKV Storage Setup

### Installation

```bash
npm install react-native-mmkv
cd ios && pod install  # iOS only
```

### Implementation (`src/storage/MMKVStorage.ts`)

```typescript
import {MMKV} from 'react-native-mmkv';

const storage = new MMKV({
  id: 'videodemo', // Unique storage instance
});

// AsyncStorage-compatible API
export async function getItem(key: string): Promise<string | null> {
  try {
    const v = storage.getString(key);
    return typeof v === 'undefined' ? null : v;
  } catch (e) {
    return null;
  }
}

export async function setItem(key: string, value: string): Promise<void> {
  storage.set(key, value);
}

export async function removeItem(key: string): Promise<void> {
  storage.delete(key);
}
```

### Usage in QueueManager

```typescript
import MMKVStorage from '../storage/MMKVStorage';

// Save queue state
const saveState = async (): Promise<void> => {
  const state = {videos, chunks};
  await MMKVStorage.setItem('@video_chunk_queue', JSON.stringify(state));
};

// Load queue state
const loadState = async (): Promise<QueueState> => {
  const stateStr = await MMKVStorage.getItem('@video_chunk_queue');
  return stateStr ? JSON.parse(stateStr) : {videos: [], chunks: []};
};
```

### Benefits of MMKV

- **Fast**: Synchronous operations, no async overhead
- **Reliable**: Memory-mapped file storage
- **Small**: Lightweight compared to SQLite
- **Cross-platform**: Works on iOS and Android

---

## 6. Android Native Components

### VideoChunkModule.java

**Purpose**: Bridge between JavaScript and Android WorkManager

```java
@ReactModule(name = VideoChunkModule.NAME)
public class VideoChunkModule extends ReactContextBaseJavaModule {

    @ReactMethod
    public void startBackgroundWork(ReadableArray chunks, Promise promise) {
        // Start WorkManager with chunk data
        WorkRequest workRequest = new OneTimeWorkRequest.Builder(ChunkWorker.class)
            .setInputData(inputData)
            .setConstraints(constraints)
            .build();

        workManager.enqueue(workRequest);
    }
}
```

### ChunkWorker.java

**Purpose**: Background processor that handles chunks even when app is closed

```java
public class ChunkWorker extends Worker {
    @Override
    public Result doWork() {
        // Process chunks in background
        // Read chunk data from files
        // Upload via HTTP
        // Send progress events to React Native
        return Result.success();
    }
}
```

### VideoChunkPackage.java

**Purpose**: Register the native module with React Native

```java
public class VideoChunkPackage implements ReactPackage {
    @Override
    public List<NativeModule> createNativeModules(ReactApplicationContext reactContext) {
        List<NativeModule> modules = new ArrayList<>();
        modules.add(new VideoChunkModule(reactContext));
        return modules;
    }
}
```

### MainApplication.kt Registration

```kotlin
override fun getPackages(): List<ReactPackage> =
    PackageList(this).packages.apply {
        add(VideoChunkPackage()) // Register our custom package
    }
```

### AndroidManifest.xml Configuration

```xml
<application
  android:name=".MainApplication"
  android:label="@string/app_name">

  <activity android:name=".MainActivity">
    <intent-filter>
      <action android:name="android.intent.action.MAIN" />
      <category android:name="android.intent.category.LAUNCHER" />
    </intent-filter>
  </activity>

</application>
```

---

## 7. Frontend Components

### App.tsx - Main UI Component

- **Video Selection**: Uses `react-native-document-picker`
- **Progress Display**: Shows upload progress per video and overall
- **Queue Management**: Add/remove videos, start/stop processing
- **Logging**: Real-time activity logs

### QueueManager.ts - Core Logic

- **Video Chunking**: Split videos into 30MB chunks
- **State Persistence**: Save/load using MMKV
- **Progress Tracking**: Track chunk-level upload status
- **Queue Operations**: FIFO processing, retry logic

### ChunkReader.ts - File Operations

- **Chunk Reading**: Read specific byte ranges from files
- **File Validation**: Check file existence and accessibility
- **Binary Conversion**: Convert between base64 and bytes
- **MIME Type Detection**: Determine file types

### ChunkUploader.ts - HTTP Client

- **FormData Upload**: Send files via multipart/form-data
- **Error Handling**: Retry logic and error reporting
- **Progress Callbacks**: Report upload progress

---

## 8. Backend Integration

### Required Backend Setup

**Route Configuration** (Express.js example):

```javascript
import multer from 'multer';

const storage = multer.diskStorage({
  destination: './uploads/videos',
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  limits: {fileSize: 10 * 1024 * 1024 * 1024}, // 10GB
});

router.post(
  '/upload',
  upload.fields([{name: 'videos', maxCount: 5}]),
  uploadController,
);
```

**Controller** (Fixed version):

```javascript
export const uploadVideo = (req, res) => {
  let savedFiles = [];

  if (req.file) {
    savedFiles.push(req.file);
  } else if (req.files && req.files.videos) {
    savedFiles.push(...req.files.videos);
  }

  if (savedFiles.length === 0) {
    return res.status(400).json({message: 'No file uploaded'});
  }

  res.json({
    success: true,
    files: savedFiles.map(f => ({
      path: f.path,
      filename: f.filename,
      size: f.size,
    })),
  });
};
```

### Frontend Configuration

Update `ChunkUploader.ts` with your backend URL:

```typescript
const LOCAL_IP = 'YOUR_SERVER_IP'; // e.g., '192.168.1.162'
const API_URL = `http://${LOCAL_IP}:5000/api/upload`;
```

---

## 9. Usage Guide

### Basic Workflow

1. **Start App**: Launch on device/emulator
2. **Select Videos**: Tap "Select Videos" → choose from gallery
3. **View Queue**: See selected videos and chunk breakdown
4. **Start Upload**: Tap "Start" to begin background processing
5. **Monitor Progress**: Watch real-time progress and logs

### Chunk Processing Flow

```
Video File (1.5GB)
    ↓
Split into Chunks (50 × 30MB)
    ↓
Queue in MMKV Storage
    ↓
Background Worker Processes Chunks
    ↓
Upload Each Chunk via HTTP
    ↓
Update Progress in Real-time
```

### Supported File Sources

- ✅ Device Gallery (local files)
- ✅ Downloaded files (file:// URIs)
- ✅ Google Photos (content:// URIs - with auto-copy)
- ✅ Cloud storage apps (with provider support)

---

## 10. Troubleshooting

### Common Issues

#### "File does not exist: content://..."

**Problem**: Picker returned content URI instead of file path  
**Solution**: App auto-copies content URIs to local files  
**Check**: Ensure sufficient storage space

#### "uploadFullVideo is not a function"

**Problem**: Import/export mismatch  
**Solution**: Fixed with named exports in ChunkUploader.ts  
**Action**: Clear Metro cache: `npm start --reset-cache`

#### Backend 500 Error: "Cannot read properties of undefined (reading 'path')"

**Problem**: Controller expects `req.file` but route uses `upload.fields()`  
**Solution**: Update controller to handle `req.files` object

#### Upload Fails on Large Files

**Problem**: Memory limits or network timeouts  
**Solution**: Chunked upload is designed for this - use background processing

#### Android Build Errors

**Problem**: Native module linking issues  
**Solution**:

```bash
cd android && ./gradlew clean
cd .. && npm start --reset-cache
npm run android
```

### Debug Steps

1. **Check Logs**: Monitor Metro console and device logs
2. **Test Backend**: Use curl or Postman to test upload endpoint
3. **Verify Network**: Ensure device can reach backend IP
4. **Check Permissions**: Verify storage permissions granted

### Performance Tips

- Use chunked upload for files > 100MB
- Enable background processing for reliability
- Clear MMKV storage periodically: Reset in app
- Monitor device storage space

---

## Dependencies

### Core Libraries

- **react-native-mmkv**: Fast storage
- **react-native-document-picker**: File selection
- **react-native-fs**: File operations
- **buffer**: Base64 operations

### Dev Environment

- **React Native**: 0.76.7
- **TypeScript**: 5.0.4
- **Node.js**: >= 18

---

## Build Commands

```bash
# Development
npm start                    # Start Metro bundler
npm run android             # Run on Android


# Production
npm run build:android       # Build Android APK
npm run clean:android       # Clean Android build

# Debugging
npm run logs:android        # View Android logs
npm run logs:metro         # Verbose Metro logs
```

---

This documentation covers the complete setup and usage of the video chunk processing system.
