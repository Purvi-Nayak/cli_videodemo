// ============================================================================
// FILE: App.tsx
// Main React Native application component for video chunk processing
// ============================================================================

import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
  PermissionsAndroid,
  StatusBar,
  RefreshControl,
  ActivityIndicator,
  Linking,
} from 'react-native';
import DocumentPicker from 'react-native-document-picker';
import RNFS from 'react-native-fs';

import {fastStorage} from './src/storage/FastStorage';
import {Logger} from './src/utils/logger';
import {queueManager} from './src/services/QueueManager';
import {backgroundService} from './src/services/BackgroundService';
import {chunkReader} from './src/services/ChunkReader';
import {runImportTests} from './src/utils/ImportTest';
import {uploadFileToDropbox} from './src/services/DropboxUploader';
import type {VideoFile, ChunkProgress, ProgressEvent} from './src/types/index';

const App = () => {
  const [videos, setVideos] = useState<VideoFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<ChunkProgress>({
    completed: 0,
    total: 0,
    percentage: 0,
  });
  const [logs, setLogs] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    // Log MMKV/AsyncStorage integration
    const fastStats = fastStorage.getStats();
    console.log('FastStorage Integration:', fastStats);

    // Skip WatermelonDB initialization — initialize app immediately and use MMKV (fastStorage)
    initializeApp();

    return () => {
      backgroundService.cleanup();
    };
  }, []);

  const initializeApp = async () => {
    setIsLoading(true);

    try {
      // Test imports first
      addLog('🧪 Testing package imports...');
      const importResults = runImportTests();

      if (importResults.mmkv) {
        addLog('✅ MMKV imported successfully');
      } else {
        addLog('❌ MMKV import failed - using fallback storage');
      }

      if (importResults.watermelondb) {
        addLog('✅ WatermelonDB imported successfully');
      } else {
        addLog('❌ WatermelonDB import failed - using fallback storage');
      }

      // Request permissions on mount
      await requestPermissions();

      // Test native module connection
      const isConnected = backgroundService.testConnection();
      if (!isConnected) {
        addLog('⚠️ Native module not properly connected');
      }

      // Initialize background service
      backgroundService.initialize();

      // Listen for progress updates from native module
      const progressSub =
        backgroundService.addProgressListener(handleProgressUpdate);
      const completeSub =
        backgroundService.addWorkCompleteListener(handleWorkComplete);
      const errorSub = backgroundService.addErrorListener(handleWorkError);

      // Load existing queue state
      await loadQueueState();

      addLog('✅ App initialized successfully');

      // check Dropbox token / account right after init (optional)
      await checkDropboxStatus();
    } catch (error) {
      Logger.error('App initialization failed:', error);
      addLog('❌ App initialization failed');
    } finally {
      setIsLoading(false);
    }
  };

  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      try {
        const permissions =
          Platform.Version >= 33
            ? [PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO]
            : [
                PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
                PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
              ];

        const granted = await PermissionsAndroid.requestMultiple(permissions);

        const allGranted = Object.values(granted).every(
          permission => permission === PermissionsAndroid.RESULTS.GRANTED,
        );

        if (!allGranted) {
          Alert.alert(
            'Permission Required',
            'Storage permission is required to process videos',
          );
          addLog('⚠️ Storage permissions not granted');
        } else {
          addLog('✅ Storage permissions granted');
        }
      } catch (err) {
        Logger.error('Permission error:', err);
        addLog('❌ Permission request failed');
      }
    }
  };

  const loadQueueState = async () => {
    try {
      const state = await queueManager.loadState();
      if (state.videos.length > 0) {
        setVideos(state.videos);
        await updateProgress();
        addLog(`📂 Loaded ${state.videos.length} videos from previous session`);
      }
    } catch (error) {
      Logger.error('Failed to load queue state:', error);
    }
  };

  const handleProgressUpdate = (event: ProgressEvent) => {
    addLog(
      `📦 Chunk ${event.chunkIndex + 1}/${event.totalChunks} ` +
        `of ${event.fileName} ${event.status}`,
    );
    updateProgress();
  };

  const handleWorkComplete = (success: boolean, message: string) => {
    setIsProcessing(false);
    if (success) {
      addLog('🎉 All chunks processed successfully!');
    } else {
      addLog(`❌ Work completed with errors: ${message}`);
    }
    updateProgress();
  };

  const handleWorkError = (error: string) => {
    addLog(`❌ Processing error: ${error}`);
  };

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev: string[]) =>
      [`[${timestamp}] ${message}`, ...prev].slice(0, 100),
    );
    Logger.log(message);
  };

  const pickVideos = async () => {
    try {
      setIsLoading(true);

      const results = await DocumentPicker.pick({
        type: [DocumentPicker.types.video],
        allowMultiSelection: true,
        copyTo: 'documentDirectory',
      });

      const selectedVideos: VideoFile[] = [];

      for (const file of results) {
        // Validate file
        const isValid = await chunkReader.validateFile(
          file.fileCopyUri || file.uri,
        );

        if (!isValid) {
          addLog(`⚠️ Skipping invalid file: ${file.name}`);
          continue;
        }

        const video: VideoFile = {
          id: Date.now().toString() + Math.random().toString(),
          name: file.name || 'Unknown',
          uri: file.fileCopyUri || file.uri,
          size: file.size || 0,
          type: file.type || chunkReader.getMimeType(file.name || ''),
        };

        selectedVideos.push(video);
      }

      if (selectedVideos.length === 0) {
        Alert.alert('No Valid Videos', 'No valid video files were selected');
        return;
      }

      // Add videos to queue
      for (const video of selectedVideos) {
        await queueManager.addVideo(video);
      }

      setVideos((prev: VideoFile[]) => [...prev, ...selectedVideos]);
      await updateProgress();

      addLog(`📁 Selected ${selectedVideos.length} video(s)`);

      // Show file sizes
      const totalSize = selectedVideos.reduce((sum, v) => sum + v.size, 0);
      addLog(`💾 Total size: ${chunkReader.formatFileSize(totalSize)}`);
    } catch (err) {
      if (!DocumentPicker.isCancel(err)) {
        Logger.error('Error picking videos:', err);
        Alert.alert('Error', 'Failed to select videos');
        addLog('❌ Failed to select videos');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const DROPBOX_CLIENT_ID = 'egiwo2to10hhrrc';
  const DROPBOX_REDIRECT = 'myapp://oauth';

  // Set true if your Dropbox app is "App folder" type (uploads must be committed relative to app folder).
  // Set false if your app has full Dropbox access and you want to upload to an absolute path.
  const DROPBOX_APP_FOLDER = true;

  const getDropboxUploadPath = (fileName: string) => {
    if (DROPBOX_APP_FOLDER) {
      // app-folder apps: path is relative to app folder
      return `/${fileName}`;
    }
    // full-access apps: choose a folder name you own
    return `/Apps/MyApp/${fileName}`;
  };

  // --- Dropbox OAuth helpers (scaffold) ---
  const generatePKCE = async (): Promise<{
    verifier: string;
    challenge?: string;
  }> => {
    // NOTE: implement S256 code_challenge properly using SHA-256 + base64url.
    // This is a quick placeholder using a random verifier. Replace with a real S256 challenge.
    const verifier =
      Math.random().toString(36).slice(2) + Date.now().toString(36);
    return {verifier};
  };

  const startDropboxAuth = async () => {
    try {
      const {verifier, challenge} = await generatePKCE();
      await fastStorage.set('dropbox_pkce_verifier', verifier);

      const params = new URLSearchParams({
        response_type: 'code',
        client_id: DROPBOX_CLIENT_ID,
        redirect_uri: DROPBOX_REDIRECT,
        // code_challenge & method should be present when you implement S256
        // code_challenge: challenge || '',
        // code_challenge_method: 'S256',
        token_access_type: 'offline', // to get refresh_token
      });

      const authUrl = `https://www.dropbox.com/oauth2/authorize?response_type=code&client_id=${DROPBOX_CLIENT_ID}&redirect_uri=${DROPBOX_REDIRECT}&code_challenge=${challenge}&code_challenge_method=S256`;
      Linking.openURL(authUrl);
    } catch (e) {
      addLog('❌ Failed to start Dropbox auth');
      Alert.alert('Auth error', 'Could not start Dropbox authorization');
    }
  };

  // Listen to OAuth redirect and exchange code for tokens
  useEffect(() => {
    const handleUrl = async ({url}: {url: string}) => {
      if (!url) return;
      try {
        const parsed = new URL(url);
        const code = parsed.searchParams.get('code');
        if (!code) return;

        const verifier = await fastStorage.getString('dropbox_pkce_verifier');

        const body = new URLSearchParams({
          code,
          grant_type: 'authorization_code',
          client_id: DROPBOX_CLIENT_ID,
          redirect_uri: DROPBOX_REDIRECT,
          // include code_verifier when you use PKCE S256
          code_verifier: verifier || '',
        });

        const res = await fetch('https://api.dropbox.com/oauth2/token', {
          method: 'POST',
          headers: {'Content-Type': 'application/x-www-form-urlencoded'},
          body: body.toString(),
        });
        const json = await res.json();
        if (json.error) {
          addLog(
            `❌ Dropbox token error: ${json.error_description || json.error}`,
          );
          return;
        }
        // store tokens securely
        await fastStorage.set('dropbox_access_token', json.access_token);
        if (json.refresh_token) {
          await fastStorage.set('dropbox_refresh_token', json.refresh_token);
        }
        addLog('✅ Dropbox authorized');
      } catch (err) {
        addLog('❌ Dropbox redirect handling failed');
      }
    };

    // subscribe and keep subscription for cleanup (RN Linking typing prefers this)
    const subscription = Linking.addEventListener('url', handleUrl);
    (async () => {
      const initial = await Linking.getInitialURL();
      if (initial) handleUrl({url: initial});
    })();

    return () => {
      // remove the subscription
      subscription.remove();
    };
  }, []);

  const checkDropboxStatus = async (): Promise<boolean> => {
    const token = await fastStorage.getString('dropbox_access_token');
    addLog(`🔎 dropbox_access_token: ${token ? 'FOUND' : 'MISSING'}`);
    if (!token) return false;

    try {
      const res = await fetch(
        'https://api.dropboxapi.com/2/users/get_current_account',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: undefined, // explicit empty JSON body
        },
      );

      // If not OK, log raw text and return false
      if (!res.ok) {
        const text = await res.text();
        addLog(
          `❌ Dropbox account fetch failed: ${res.status} ${res.statusText}`,
        );
        addLog(`❌ Response: ${text}`);
        console.error(
          'Dropbox fetch failed:',
          res.status,
          res.statusText,
          text,
        );
        return false;
      }

      // Parse JSON with fallback to raw text for debugging
      let json: any;
      try {
        json = await res.json();
      } catch (parseErr) {
        const text = await res.text();
        addLog('❌ Dropbox JSON parse failed — see console for response text');
        console.error(
          'Dropbox JSON parse error:',
          parseErr,
          'response text:',
          text,
        );
        return false;
      }

      // success (don't rely on name/email for upload logic)
      addLog(
        `✅ Dropbox token valid (account: ${
          json.email || json.name?.display_name || 'unknown'
        })`,
      );
      return true;
    } catch (e) {
      addLog(`❌ Dropbox token test failed: ${String(e)}`);
      console.error(e);
      return false;
    }
  };

  // Upload all videos in the queue (sequential). Removes video from queue on success.
  const uploadAllVideosToDropbox = async () => {
    try {
      const ok = await checkDropboxStatus();
      if (!ok) {
        addLog('⚠️ Dropbox not authorized. Please login.');
        return;
      }

      if (videos.length === 0) {
        addLog('⚠️ No videos to upload');
        return;
      }

      setIsLoading(true);
      for (const v of videos.slice()) {
        try {
          addLog(`⬆️ Uploading ${v.name} ...`);
          const dropboxPath = getDropboxUploadPath(v.name);
          await uploadFileToDropbox(v.uri, dropboxPath, pct => {
            addLog(`📤 ${v.name}: ${pct}%`);
          });
          addLog(`✅ Uploaded ${v.name} to ${dropboxPath}`);

          // remove from queue/persistence
          try {
            await queueManager.removeVideo(v.id);
            setVideos(prev => prev.filter(x => x.id !== v.id));
            addLog(`🗑️ Removed ${v.name} from local queue`);
          } catch (rmErr) {
            addLog(
              `⚠️ Uploaded but failed to remove local queue item: ${v.name}`,
            );
            console.error('queue remove error:', rmErr);
          }
        } catch (err) {
          addLog(`❌ Upload failed for ${v.name}: ${String(err)}`);
          console.error('upload error:', err);
          // continue with next file (or break if you prefer)
        }
      }
      await updateProgress();
    } finally {
      setIsLoading(false);
    }
  };

  // update startProcessing to call the new uploader (and keep background service start)
  const startProcessing = async () => {
    try {
      setIsLoading(true);

      const pendingChunks = queueManager.getPendingChunks();
      if (pendingChunks.length === 0 && videos.length === 0) {
        Alert.alert('No Work', 'No pending chunks or videos to process');
        return;
      }

      addLog(
        `🚀 Starting background processing of ${pendingChunks.length} chunks...`,
      );

      // Start background service
      await backgroundService.startBackgroundWork();

      // Upload queued videos to Dropbox (JS-level chunked uploader)
      await uploadAllVideosToDropbox();

      setIsProcessing(true);
      addLog('✅ Background service started');
    } catch (error) {
      Logger.error('Error starting processing:', error);
      Alert.alert('Error', 'Failed to start processing');
      addLog('❌ Failed to start processing');
    } finally {
      setIsLoading(false);
    }
  };

  const stopProcessing = async () => {
    try {
      setIsLoading(true);
      await backgroundService.stopBackgroundWork();
      setIsProcessing(false);
      addLog('⏸️ Processing paused');
    } catch (error) {
      Logger.error('Error stopping processing:', error);
      addLog('❌ Failed to stop processing');
    } finally {
      setIsLoading(false);
    }
  };

  const resetAll = async () => {
    try {
      Alert.alert(
        'Reset All',
        'This will clear all videos and progress. Continue?',
        [
          {text: 'Cancel', style: 'cancel'},
          {
            text: 'Reset',
            style: 'destructive',
            onPress: async () => {
              setIsLoading(true);
              try {
                await backgroundService.stopBackgroundWork();
                await queueManager.reset();
                setVideos([]);
                setIsProcessing(false);
                setProgress({completed: 0, total: 0, percentage: 0});
                setLogs([]);
                addLog('🔄 Reset complete');
              } catch (error) {
                Logger.error('Error resetting:', error);
                addLog('❌ Reset failed');
              } finally {
                setIsLoading(false);
              }
            },
          },
        ],
      );
    } catch (error) {
      Logger.error('Error resetting:', error);
    }
  };

  const updateProgress = async () => {
    try {
      const prog = await queueManager.getProgress();
      setProgress(prog);
    } catch (error) {
      Logger.error('Error updating progress:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await updateProgress();

    // Get queue stats
    const stats = queueManager.getStats();
    addLog(
      `📊 Queue: ${stats.totalChunks} chunks ` +
        `(${stats.pending} pending, ${stats.completed} done, ${stats.failed} failed)`,
    );

    setRefreshing(false);
  };

  const removeVideo = async (videoId: string) => {
    try {
      await queueManager.removeVideo(videoId);
      setVideos(prev => prev.filter(v => v.id !== videoId));
      await updateProgress();
      addLog('🗑️ Video removed from queue');
    } catch (error) {
      Logger.error('Error removing video:', error);
    }
  };

  const getVideoProgress = (videoId: string): ChunkProgress => {
    return queueManager.getVideoProgress(videoId);
  };

  // DEV helper: set a raw Dropbox access token into fastStorage (DEV only)
  const setDevDropboxToken = async () => {
    if (!__DEV__) return;
    // WARNING: This is for local development/testing only.
    // Do NOT commit this token or use in production. Revoke token if exposed.
    const DEV_TOKEN =
      'sl.u.AGIAP3HiwGmiMnvmELZBqvNyQ9RrFulb24kO1pS1TRy-WaVv3SkbsMZSlftDjeFQR2Q4PXSCPoQHYP4RyEiGuMpAcpaBNsjQV7f2AiL-YN8r5pSJLSYB_c4elZulANgdgh-2vX9WSTXqg2MFz4vTRuYxH6nHaQt59_kO5zBT30H4dsqQGiSza7CHn-5Km7Xi3AYXy9Um77txzOuvfvcrqNAZbqjzQ4Zb1-HjomdOs0WJVP7ZI9ESUmBAsmV-qFG6gu0CTRDYz6ZSQgcsrpX1wNNeWrpibpui3kxdpuXIR2n4yEtlp3im31T3KfIGOfNnJ4sCdCkqQR2UC2HTdUj4bRZC9rDGFNkCV9ZmtFyy0TQsLCG8oLqos6yA10DEcaRI_aPBQ8dYtw7qpWAeb_VfwvPgwqdvN4QpV902qEyLIig8S4BHRanDoQi7c-9AJ5MWe1G_3p2U59Z9Idy8T3kBMArqcyhhbOGMOAbGHoWl7BFq24UtbHZDZsJ6zBBvtn9NkD1LxDNf9GxUYIB6VgyBU31jDg5vHmjH2QTuej92ZKxqroGBE1cnUWvaOHIxaK3mV_SewYggYXr_STlqaWo-f3FT8g8BbnETmQeI-rTURzTNID8ZJ9wI2bNFrZ6wi4bEUhOoOvZs2hQbWCxdjimrvk3DuyviysrmRsBCxUC6jwoQ7-YnAcHaRuFWmDMqK9njFUKVbcChBba8EAgM3NorgDytz-AujsECJichq0UjaO83dAByCjyzPiSMljbM_oHx1_io4T0aHDwdHeSJ194f0XkLHJifFJfvMLKs9PrtFCemdzTfK3Yd3uPi1jigK0helNjiOiLhKqiDROnxGvY9Rw95N-vpL_ef_oQc1JN2TZxnLXv_LtSy5PVJ5tE7O5yoor5EFNrAsR1j_e8yrvJ04MRXfqWiD4j7UWEwL9bltNJZucpgfFy-mWSDjGTBQvVqwiJ1Kb9U3OLXUsg65XUagKE5XuIDFh5LvhjpuC44WKn_zEEjdPG1xnyxp8snUWVO-F5yhyvzEY-Wi0Ii7Nyvj9FvkfQ7RF8FpGQPKFbTM3I4VrSd_avOniisRp3jq9Nc4K_vjgQmbMebiR5VWWmdgcKoBOONYrNgD_45rSKoKNbN7esx27kPQAeVsfSzTbL0Qh9i0O7GsRhW-lpeK-tSMVebOZrqmypIvbtx-wAihKQwzC0f8CQBRUUH01tVl5q3EBwmRPoFZwsFUOzA1rMxqNvs0qVEuCMHmbTymTH9GnKw4xomy_6c8RI9ZPj9Kxd6LGtXUaL8pkGtPflAcF3EwyEGfRqXlsZZV49vnMlaHaw25kUq0pUgNOofOwqLW4MaFbz4930nQ7RWF9ZHp2JnpMRRbMdGMdLCP166iKHDI0yj3OIqzKTa0JeD2pDCMx-KlDqN3SfK8th-M7gMDyF_Jc_s';

    try {
      await fastStorage.set('dropbox_access_token', DEV_TOKEN);
      addLog('✅ Dev Dropbox token saved (DEV only)');
      // validate immediately
      await checkDropboxStatus();
    } catch (err) {
      addLog('❌ Failed to save dev Dropbox token');
      console.error(err);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#6c5ce7" />
        <Text style={styles.loadingText}>Initializing...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#16213e" />

      <View style={styles.header}>
        <Text style={styles.title}>📹 Video Chunk Processor</Text>
        <Text style={styles.subtitle}>
          Background Processing with WorkManager
        </Text>

        {isProcessing && (
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>🔄 Processing...</Text>
          </View>
        )}
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }>
        {/* Controls */}
        <View style={styles.controls}>
          <TouchableOpacity
            style={[styles.button, styles.primaryButton]}
            onPress={pickVideos}
            disabled={isLoading}>
            <Text style={styles.buttonText}>📁 Select Videos</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, {backgroundColor: '#3742fa'}]}
            onPress={checkDropboxStatus}
            disabled={isLoading}>
            <Text style={styles.buttonText}>🔎 Check Dropbox</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.successButton]}
            onPress={startProcessing}
            disabled={isProcessing || videos.length === 0 || isLoading}>
            <Text style={styles.buttonText}>▶️ Start</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.warningButton]}
            onPress={stopProcessing}
            disabled={!isProcessing || isLoading}>
            <Text style={styles.buttonText}>⏸️ Pause</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.dangerButton]}
            onPress={resetAll}
            disabled={isLoading}>
            <Text style={styles.buttonText}>🔄 Reset</Text>
          </TouchableOpacity>

          {__DEV__ && (
            <TouchableOpacity
              style={[styles.button, {backgroundColor: '#8e44ad'}]}
              onPress={setDevDropboxToken}
              disabled={isLoading}>
              <Text style={styles.buttonText}>DEV: Set Token</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Videos List */}
        {videos.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              📂 Selected Videos ({videos.length})
            </Text>
            {videos.map(video => {
              const videoProgress = getVideoProgress(video.id);
              return (
                <View key={video.id} style={styles.videoItem}>
                  <View style={styles.videoHeader}>
                    <Text style={styles.videoName} numberOfLines={2}>
                      {video.name}
                    </Text>
                    <TouchableOpacity
                      style={styles.removeButton}
                      onPress={() => removeVideo(video.id)}
                      disabled={isProcessing}>
                      <Text style={styles.removeButtonText}>✕</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.videoInfo}>
                    <Text style={styles.videoSize}>
                      📦 {chunkReader.formatFileSize(video.size)}
                    </Text>
                    <Text style={styles.videoProgress}>
                      📊 {videoProgress.completed}/{videoProgress.total} chunks
                      ({videoProgress.percentage.toFixed(1)}%)
                    </Text>
                  </View>

                  {videoProgress.total > 0 && (
                    <View style={styles.progressBar}>
                      <View
                        style={[
                          styles.progressFill,
                          {width: `${videoProgress.percentage}%`},
                        ]}
                      />
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* Overall Progress */}
        {progress.total > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📈 Overall Progress</Text>
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    {width: `${progress.percentage}%`},
                  ]}
                />
              </View>
              <Text style={styles.progressText}>
                {progress.completed}/{progress.total} chunks (
                {progress.percentage.toFixed(1)}%)
              </Text>
            </View>
          </View>
        )}

        {/* Console Logs */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📋 Console Logs</Text>
          <ScrollView style={styles.logsContainer}>
            {logs.length === 0 ? (
              <Text style={styles.noLogsText}>No logs yet...</Text>
            ) : (
              logs.map((log, index) => (
                <Text key={index} style={styles.logText}>
                  {log}
                </Text>
              ))
            )}
          </ScrollView>
        </View>

        {/* Bottom spacing */}
        <View style={{height: 20}} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    marginTop: 16,
    fontSize: 16,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  header: {
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 16,
    backgroundColor: '#16213e',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#a0a0a0',
  },
  statusBadge: {
    backgroundColor: '#00b894',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  controls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
    opacity: 1,
  },
  primaryButton: {
    backgroundColor: '#6c5ce7',
  },
  successButton: {
    backgroundColor: '#00b894',
  },
  warningButton: {
    backgroundColor: '#fdcb6e',
  },
  dangerButton: {
    backgroundColor: '#d63031',
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  section: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  videoItem: {
    backgroundColor: '#0f3460',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  videoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  videoName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  removeButton: {
    backgroundColor: '#000000',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  videoInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  videoSize: {
    color: '#a0a0a0',
    fontSize: 12,
  },
  videoProgress: {
    color: '#a0a0a0',
    fontSize: 12,
  },
  progressContainer: {
    gap: 8,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#0f3460',
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#00b894',
  },
  progressText: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 4,
  },
  logsContainer: {
    maxHeight: 200,
    backgroundColor: '#0f0f0f',
    borderRadius: 8,
    padding: 12,
  },
  noLogsText: {
    color: '#666',
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  logText: {
    color: '#00ff00',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginBottom: 4,
  },
});

export default App;
