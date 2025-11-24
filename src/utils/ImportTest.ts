// ============================================================================
// FILE: src/utils/ImportTest.ts
// Test imports for MMKV and WatermelonDB to debug red line errors
// ============================================================================

import {Logger} from './logger';

// Test MMKV import
const testMMKVImport = () => {
  try {
    Logger.info('🔍 Testing MMKV import...');

    // Try different import methods
    try {
      const {MMKV} = require('react-native-mmkv');
      Logger.info('✅ MMKV imported successfully via require');
      Logger.info('MMKV type:', typeof MMKV);

      // Try to create instance
      const storage = new MMKV();
      Logger.info('✅ MMKV instance created successfully');
      return true;
    } catch (error) {
      Logger.error('❌ MMKV require failed:', error);
      return false;
    }
  } catch (error) {
    Logger.error('❌ MMKV import test failed:', error);
    return false;
  }
};

// Test WatermelonDB import
const testWatermelonDBImport = () => {
  try {
    Logger.info('🔍 Testing WatermelonDB import...');

    const {Database} = require('@nozbe/watermelondb');
    const {
      default: SQLiteAdapter,
    } = require('@nozbe/watermelondb/adapters/sqlite');
    const {Model} = require('@nozbe/watermelondb');

    Logger.info('✅ WatermelonDB imported successfully');
    Logger.info('Database type:', typeof Database);
    Logger.info('SQLiteAdapter type:', typeof SQLiteAdapter);
    Logger.info('Model type:', typeof Model);

    return true;
  } catch (error) {
    Logger.error('❌ WatermelonDB import test failed:', error);
    return false;
  }
};

// Test AsyncStorage as fallback
const testAsyncStorageImport = () => {
  try {
    Logger.info('🔍 Testing AsyncStorage fallback...');

    const AsyncStorage = require('@react-native-async-storage/async-storage');
    Logger.info('✅ AsyncStorage imported successfully');
    Logger.info('AsyncStorage type:', typeof AsyncStorage);

    return true;
  } catch (error) {
    Logger.error('❌ AsyncStorage import test failed:', error);
    return false;
  }
};

// Run all import tests
export const runImportTests = () => {
  Logger.info('🧪 Starting import tests...');

  const results = {
    mmkv: testMMKVImport(),
    watermelondb: testWatermelonDBImport(),
    asyncstorage: testAsyncStorageImport(),
  };

  Logger.info('📊 Import test results:');
  Logger.info('MMKV:', results.mmkv ? '✅' : '❌');
  Logger.info('WatermelonDB:', results.watermelondb ? '✅' : '❌');
  Logger.info('AsyncStorage:', results.asyncstorage ? '✅' : '❌');

  return results;
};

// Export individual test functions
export {testMMKVImport, testWatermelonDBImport, testAsyncStorageImport};
