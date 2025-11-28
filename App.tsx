// // ============================================================================
// // FILE: App.tsx
// // Main React Native application component for video chunk processing
// // ============================================================================

// import React, {useState, useEffect} from 'react';
// import {
//   View,
//   Text,
//   StyleSheet,
//   TouchableOpacity,
//   ScrollView,
//   Alert,
//   Platform,
//   PermissionsAndroid,
//   StatusBar,
//   RefreshControl,
//   ActivityIndicator,
// } from 'react-native';
// import DocumentPicker from 'react-native-document-picker';
// import {queueManager} from './src/services/QueueManager';
// import {backgroundService} from './src/services/BackgroundService';
// import {chunkReader} from './src/services/ChunkReader';
// import {Logger} from './src/utils/logger';
// import type {VideoFile, ChunkProgress, ProgressEvent} from './src/types';

// const App = () => {
//   const [videos, setVideos] = useState<VideoFile[]>([]);
//   const [isProcessing, setIsProcessing] = useState(false);
//   const [isLoading, setIsLoading] = useState(false);
//   const [progress, setProgress] = useState<ChunkProgress>({
//     completed: 0,
//     total: 0,
//     percentage: 0,
//   });
//   const [logs, setLogs] = useState<string[]>([]);
//   const [refreshing, setRefreshing] = useState(false);

//   useEffect(() => {
//     initializeApp();

//     return () => {
//       backgroundService.cleanup();
//     };
//   }, []);

//   const initializeApp = async () => {
//     setIsLoading(true);

//     try {
//       // Request permissions on mount
//       await requestPermissions();

//       // Test native module connection
//       const isConnected = backgroundService.testConnection();
//       if (!isConnected) {
//         addLog('⚠️ Native module not properly connected');
//       }

//       // Initialize background service
//       backgroundService.initialize();

//       // Listen for progress updates from native module
//       const progressSub =
//         backgroundService.addProgressListener(handleProgressUpdate);
//       const completeSub =
//         backgroundService.addWorkCompleteListener(handleWorkComplete);
//       const errorSub = backgroundService.addErrorListener(handleWorkError);

//       // Load existing queue state
//       await loadQueueState();

//       addLog('✅ App initialized successfully');
//     } catch (error) {
//       Logger.error('App initialization failed:', error);
//       addLog('❌ App initialization failed');
//     } finally {
//       setIsLoading(false);
//     }
//   };

//   const requestPermissions = async () => {
//     if (Platform.OS === 'android') {
//       try {
//         const permissions =
//           Platform.Version >= 33
//             ? [PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO]
//             : [
//                 PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
//                 PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
//               ];

//         const granted = await PermissionsAndroid.requestMultiple(permissions);

//         const allGranted = Object.values(granted).every(
//           permission => permission === PermissionsAndroid.RESULTS.GRANTED,
//         );

//         if (!allGranted) {
//           Alert.alert(
//             'Permission Required',
//             'Storage permission is required to process videos',
//           );
//           addLog('⚠️ Storage permissions not granted');
//         } else {
//           addLog('✅ Storage permissions granted');
//         }
//       } catch (err) {
//         Logger.error('Permission error:', err);
//         addLog('❌ Permission request failed');
//       }
//     }
//   };

//   const loadQueueState = async () => {
//     try {
//       const state = await queueManager.loadState();
//       if (state.videos.length > 0) {
//         setVideos(state.videos);
//         await updateProgress();
//         addLog(`📂 Loaded ${state.videos.length} videos from previous session`);
//       }
//     } catch (error) {
//       Logger.error('Failed to load queue state:', error);
//     }
//   };

//   const handleProgressUpdate = (event: ProgressEvent) => {
//     addLog(
//       `📦 Chunk ${event.chunkIndex + 1}/${event.totalChunks} ` +
//         `of ${event.fileName} ${event.status}`,
//     );
//     updateProgress();
//   };

//   const handleWorkComplete = (success: boolean, message: string) => {
//     setIsProcessing(false);
//     if (success) {
//       addLog('🎉 All chunks processed successfully!');
//     } else {
//       addLog(`❌ Work completed with errors: ${message}`);
//     }
//     updateProgress();
//   };

//   const handleWorkError = (error: string) => {
//     addLog(`❌ Processing error: ${error}`);
//   };

//   const addLog = (message: string) => {
//     const timestamp = new Date().toLocaleTimeString();
//     setLogs((prev: string[]) =>
//       [`[${timestamp}] ${message}`, ...prev].slice(0, 100),
//     );
//     Logger.log(message);
//   };

//   const pickVideos = async () => {
//     try {
//       setIsLoading(true);

//       const results = await DocumentPicker.pick({
//         type: [DocumentPicker.types.video],
//         allowMultiSelection: true,
//         copyTo: 'documentDirectory',
//       });

//       const selectedVideos: VideoFile[] = [];

//       for (const file of results) {
//         // Validate file
//         const isValid = await chunkReader.validateFile(
//           file.fileCopyUri || file.uri,
//         );

//         if (!isValid) {
//           addLog(`⚠️ Skipping invalid file: ${file.name}`);
//           continue;
//         }

//         const video: VideoFile = {
//           id: Date.now().toString() + Math.random().toString(),
//           name: file.name || 'Unknown',
//           uri: file.fileCopyUri || file.uri,
//           size: file.size || 0,
//           type: file.type || chunkReader.getMimeType(file.name || ''),
//         };

//         selectedVideos.push(video);
//       }

//       if (selectedVideos.length === 0) {
//         Alert.alert('No Valid Videos', 'No valid video files were selected');
//         return;
//       }

//       // Add videos to queue
//       for (const video of selectedVideos) {
//         await queueManager.addVideo(video);
//       }

//       setVideos((prev: VideoFile[]) => [...prev, ...selectedVideos]);
//       await updateProgress();

//       addLog(`📁 Selected ${selectedVideos.length} video(s)`);

//       // Show file sizes
//       const totalSize = selectedVideos.reduce((sum, v) => sum + v.size, 0);
//       addLog(`💾 Total size: ${chunkReader.formatFileSize(totalSize)}`);
//     } catch (err) {
//       if (!DocumentPicker.isCancel(err)) {
//         Logger.error('Error picking videos:', err);
//         Alert.alert('Error', 'Failed to select videos');
//         addLog('❌ Failed to select videos');
//       }
//     } finally {
//       setIsLoading(false);
//     }
//   };

//   const startProcessing = async () => {
//     try {
//       setIsLoading(true);

//       const pendingChunks = queueManager.getPendingChunks();
//       if (pendingChunks.length === 0) {
//         Alert.alert('No Work', 'No pending chunks to process');
//         return;
//       }

//       addLog(
//         `🚀 Starting background processing of ${pendingChunks.length} chunks...`,
//       );

//       // Start background service
//       await backgroundService.startBackgroundWork();

//       setIsProcessing(true);
//       addLog('✅ Background service started');
//     } catch (error) {
//       Logger.error('Error starting processing:', error);
//       Alert.alert('Error', 'Failed to start processing');
//       addLog('❌ Failed to start processing');
//     } finally {
//       setIsLoading(false);
//     }
//   };

//   const stopProcessing = async () => {
//     try {
//       setIsLoading(true);
//       await backgroundService.stopBackgroundWork();
//       setIsProcessing(false);
//       addLog('⏸️ Processing paused');
//     } catch (error) {
//       Logger.error('Error stopping processing:', error);
//       addLog('❌ Failed to stop processing');
//     } finally {
//       setIsLoading(false);
//     }
//   };

//   const resetAll = async () => {
//     try {
//       Alert.alert(
//         'Reset All',
//         'This will clear all videos and progress. Continue?',
//         [
//           {text: 'Cancel', style: 'cancel'},
//           {
//             text: 'Reset',
//             style: 'destructive',
//             onPress: async () => {
//               setIsLoading(true);
//               try {
//                 await backgroundService.stopBackgroundWork();
//                 await queueManager.reset();
//                 setVideos([]);
//                 setIsProcessing(false);
//                 setProgress({completed: 0, total: 0, percentage: 0});
//                 setLogs([]);
//                 addLog('🔄 Reset complete');
//               } catch (error) {
//                 Logger.error('Error resetting:', error);
//                 addLog('❌ Reset failed');
//               } finally {
//                 setIsLoading(false);
//               }
//             },
//           },
//         ],
//       );
//     } catch (error) {
//       Logger.error('Error resetting:', error);
//     }
//   };

//   const updateProgress = async () => {
//     try {
//       const prog = await queueManager.getProgress();
//       setProgress(prog);
//     } catch (error) {
//       Logger.error('Error updating progress:', error);
//     }
//   };

//   const onRefresh = async () => {
//     setRefreshing(true);
//     await updateProgress();

//     // Get queue stats
//     const stats = queueManager.getStats();
//     addLog(
//       `📊 Queue: ${stats.totalChunks} chunks ` +
//         `(${stats.pending} pending, ${stats.completed} done, ${stats.failed} failed)`,
//     );

//     setRefreshing(false);
//   };

//   const removeVideo = async (videoId: string) => {
//     try {
//       await queueManager.removeVideo(videoId);
//       setVideos(prev => prev.filter(v => v.id !== videoId));
//       await updateProgress();
//       addLog('🗑️ Video removed from queue');
//     } catch (error) {
//       Logger.error('Error removing video:', error);
//     }
//   };

//   const getVideoProgress = (videoId: string): ChunkProgress => {
//     return queueManager.getVideoProgress(videoId);
//   };

//   if (isLoading) {
//     return (
//       <View style={[styles.container, styles.centerContent]}>
//         <ActivityIndicator size="large" color="#6c5ce7" />
//         <Text style={styles.loadingText}>Initializing...</Text>
//       </View>
//     );
//   }

//   return (
//     <View style={styles.container}>
//       <StatusBar barStyle="light-content" backgroundColor="#16213e" />

//       <View style={styles.header}>
//         <Text style={styles.title}>📹 Video Chunk Processor</Text>
//         <Text style={styles.subtitle}>
//           Background Processing with WorkManager
//         </Text>

//         {isProcessing && (
//           <View style={styles.statusBadge}>
//             <Text style={styles.statusText}>🔄 Processing...</Text>
//           </View>
//         )}
//       </View>

//       <ScrollView
//         style={styles.content}
//         refreshControl={
//           <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
//         }>
//         {/* Controls */}
//         <View style={styles.controls}>
//           <TouchableOpacity
//             style={[styles.button, styles.primaryButton]}
//             onPress={pickVideos}
//             disabled={isLoading}>
//             <Text style={styles.buttonText}>📁 Select Videos</Text>
//           </TouchableOpacity>
//           {/*
//           <TouchableOpacity
//             style={[styles.button, styles.successButton]}
//             onPress={startProcessing}
//             disabled={isProcessing || videos.length === 0 || isLoading}>
//             <Text style={styles.buttonText}>▶️ Start</Text>
//           </TouchableOpacity>

//           <TouchableOpacity
//             style={[styles.button, styles.warningButton]}
//             onPress={stopProcessing}
//             disabled={!isProcessing || isLoading}>
//             <Text style={styles.buttonText}>⏸️ Pause</Text>
//           </TouchableOpacity> */}

//           <TouchableOpacity
//             style={[styles.button, styles.dangerButton]}
//             onPress={resetAll}
//             disabled={isLoading}>
//             <Text style={styles.buttonText}>🔄 Reset</Text>
//           </TouchableOpacity>
//         </View>

//         {/* Videos List */}
//         {videos.length > 0 && (
//           <View style={styles.section}>
//             <Text style={styles.sectionTitle}>
//               📂 Selected Videos ({videos.length})
//             </Text>
//             {videos.map(video => {
//               const videoProgress = getVideoProgress(video.id);
//               return (
//                 <View key={video.id} style={styles.videoItem}>
//                   <View style={styles.videoHeader}>
//                     <Text style={styles.videoName} numberOfLines={2}>
//                       {video.name}
//                     </Text>
//                     <TouchableOpacity
//                       style={styles.removeButton}
//                       onPress={() => removeVideo(video.id)}
//                       disabled={isProcessing}>
//                       <Text style={styles.removeButtonText}>✕</Text>
//                     </TouchableOpacity>
//                   </View>

//                   <View style={styles.videoInfo}>
//                     <Text style={styles.videoSize}>
//                       📦 {chunkReader.formatFileSize(video.size)}
//                     </Text>
//                     <Text style={styles.videoProgress}>
//                       📊 {videoProgress.completed}/{videoProgress.total} chunks
//                       ({videoProgress.percentage.toFixed(1)}%)
//                     </Text>
//                   </View>

//                   {videoProgress.total > 0 && (
//                     <View style={styles.progressBar}>
//                       <View
//                         style={[
//                           styles.progressFill,
//                           {width: `${videoProgress.percentage}%`},
//                         ]}
//                       />
//                     </View>
//                   )}
//                 </View>
//               );
//             })}
//           </View>
//         )}

//         {/* Overall Progress */}
//         {progress.total > 0 && (
//           <View style={styles.section}>
//             <Text style={styles.sectionTitle}>📈 Overall Progress</Text>
//             <View style={styles.progressContainer}>
//               <View style={styles.progressBar}>
//                 <View
//                   style={[
//                     styles.progressFill,
//                     {width: `${progress.percentage}%`},
//                   ]}
//                 />
//               </View>
//               <Text style={styles.progressText}>
//                 {progress.completed}/{progress.total} chunks (
//                 {progress.percentage.toFixed(1)}%)
//               </Text>
//             </View>
//           </View>
//         )}

//         {/* Console Logs */}
//         <View style={styles.section}>
//           <Text style={styles.sectionTitle}>📋 Console Logs</Text>
//           <ScrollView style={styles.logsContainer}>
//             {logs.length === 0 ? (
//               <Text style={styles.noLogsText}>No logs yet...</Text>
//             ) : (
//               logs.map((log, index) => (
//                 <Text key={index} style={styles.logText}>
//                   {log}
//                 </Text>
//               ))
//             )}
//           </ScrollView>
//         </View>

//         {/* Bottom spacing */}
//         <View style={{height: 20}} />
//       </ScrollView>
//     </View>
//   );
// };

// const styles = StyleSheet.create({
//   container: {
//     flex: 1,
//     backgroundColor: '#1a1a2e',
//   },
//   centerContent: {
//     justifyContent: 'center',
//     alignItems: 'center',
//   },
//   loadingText: {
//     color: '#fff',
//     marginTop: 16,
//     fontSize: 16,
//   },
//   content: {
//     flex: 1,
//     padding: 16,
//   },
//   header: {
//     paddingTop: 50,
//     paddingBottom: 20,
//     paddingHorizontal: 16,
//     backgroundColor: '#16213e',
//   },
//   title: {
//     fontSize: 28,
//     fontWeight: 'bold',
//     color: '#fff',
//     marginBottom: 4,
//   },
//   subtitle: {
//     fontSize: 14,
//     color: '#a0a0a0',
//   },
//   statusBadge: {
//     backgroundColor: '#00b894',
//     borderRadius: 12,
//     paddingHorizontal: 12,
//     paddingVertical: 4,
//     alignSelf: 'flex-start',
//     marginTop: 8,
//   },
//   statusText: {
//     color: '#fff',
//     fontSize: 12,
//     fontWeight: 'bold',
//   },
//   controls: {
//     flexDirection: 'row',
//     flexWrap: 'wrap',
//     gap: 8,
//     marginBottom: 20,
//   },
//   button: {
//     paddingHorizontal: 16,
//     paddingVertical: 12,
//     borderRadius: 8,
//     minWidth: 100,
//     alignItems: 'center',
//     opacity: 1,
//   },
//   primaryButton: {
//     backgroundColor: '#6c5ce7',
//   },
//   successButton: {
//     backgroundColor: '#00b894',
//   },
//   warningButton: {
//     backgroundColor: '#fdcb6e',
//   },
//   dangerButton: {
//     backgroundColor: '#d63031',
//   },
//   buttonText: {
//     color: '#fff',
//     fontWeight: 'bold',
//     fontSize: 14,
//   },
//   section: {
//     backgroundColor: '#16213e',
//     borderRadius: 12,
//     padding: 16,
//     marginBottom: 16,
//   },
//   sectionTitle: {
//     fontSize: 18,
//     fontWeight: 'bold',
//     color: '#fff',
//     marginBottom: 12,
//   },
//   videoItem: {
//     backgroundColor: '#0f3460',
//     padding: 12,
//     borderRadius: 8,
//     marginBottom: 8,
//   },
//   videoHeader: {
//     flexDirection: 'row',
//     justifyContent: 'space-between',
//     alignItems: 'flex-start',
//   },
//   videoName: {
//     color: '#fff',
//     fontSize: 14,
//     fontWeight: '600',
//     flex: 1,
//     marginRight: 8,
//   },
//   removeButton: {
//     backgroundColor: '#000000',
//     borderRadius: 12,
//     width: 24,
//     height: 24,
//     justifyContent: 'center',
//     alignItems: 'center',
//   },
//   removeButtonText: {
//     color: '#fff',
//     fontSize: 12,
//     fontWeight: 'bold',
//   },
//   videoInfo: {
//     flexDirection: 'row',
//     justifyContent: 'space-between',
//     marginTop: 8,
//   },
//   videoSize: {
//     color: '#a0a0a0',
//     fontSize: 12,
//   },
//   videoProgress: {
//     color: '#a0a0a0',
//     fontSize: 12,
//   },
//   progressContainer: {
//     gap: 8,
//   },
//   progressBar: {
//     height: 8,
//     backgroundColor: '#0f3460',
//     borderRadius: 4,
//     overflow: 'hidden',
//     marginTop: 8,
//   },
//   progressFill: {
//     height: '100%',
//     backgroundColor: '#00b894',
//   },
//   progressText: {
//     color: '#fff',
//     fontSize: 14,
//     textAlign: 'center',
//     marginTop: 4,
//   },
//   logsContainer: {
//     maxHeight: 200,
//     backgroundColor: '#0f0f0f',
//     borderRadius: 8,
//     padding: 12,
//   },
//   noLogsText: {
//     color: '#666',
//     fontSize: 12,
//     fontStyle: 'italic',
//     textAlign: 'center',
//   },
//   logText: {
//     color: '#00ff00',
//     fontSize: 12,
//     fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
//     marginBottom: 4,
//   },
// });

// export default App;
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
} from 'react-native';
import DocumentPicker from 'react-native-document-picker';
import {queueManager} from './src/services/QueueManager';
import {backgroundService} from './src/services/BackgroundService';
import {chunkReader} from './src/services/ChunkReader';
import {Logger} from './src/utils/logger';
import {uploadFullVideo} from './src/services/ChunkUploader';
import type {VideoFile, ChunkProgress, ProgressEvent} from './src/types';

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
    initializeApp();

    return () => {
      backgroundService.cleanup();
    };
  }, []);

  const initializeApp = async () => {
    setIsLoading(true);

    try {
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

      if (selectedVideos.length > 0) {
        try {
          addLog('🔁 Running quick upload test (full file) to backend...');
          // test upload the first video (remove this after testing)
          const testVid = selectedVideos[0];
          const result = await uploadFullVideo(testVid.uri, testVid.name);
          addLog(`✅ Test upload response: ${JSON.stringify(result)}`);
        } catch (err) {
          addLog(`❌ Test upload failed: ${String(err)}`);
        }
      }
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

  const startProcessing = async () => {
    try {
      setIsLoading(true);

      const pendingChunks = queueManager.getPendingChunks();
      if (pendingChunks.length === 0) {
        Alert.alert('No Work', 'No pending chunks to process');
        return;
      }

      addLog(
        `🚀 Starting background processing of ${pendingChunks.length} chunks...`,
      );

      // Start background service
      await backgroundService.startBackgroundWork();

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
          {/* 
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
          </TouchableOpacity> */}

          <TouchableOpacity
            style={[styles.button, styles.dangerButton]}
            onPress={resetAll}
            disabled={isLoading}>
            <Text style={styles.buttonText}>🔄 Reset</Text>
          </TouchableOpacity>
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
