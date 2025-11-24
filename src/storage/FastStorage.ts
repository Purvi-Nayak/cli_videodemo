// ============================================================================
// FILE: src/storage/FastStorage.ts
// Fallback storage system with MMKV when available, AsyncStorage as fallback
// ============================================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import {Logger} from '../utils/logger';
import {MMKV} from 'react-native-mmkv';

// Storage interface for consistent API
interface IFastStorage {
  set(key: string, value: string | number | boolean): Promise<void> | void;
  getString(key: string): Promise<string | undefined> | string | undefined;
  getNumber(key: string): Promise<number | undefined> | number | undefined;
  getBoolean(key: string): Promise<boolean | undefined> | boolean | undefined;
  delete(key: string): Promise<void> | void;
}

import {Platform} from 'react-native';

class FastStorageService {
  private storage: IFastStorage | undefined = undefined;
  private isMMKV = false;
  private isInitialized = false;

  constructor() {
    this.init();
  }

  private async init() {
    if (Platform.OS === 'android') {
      try {
        // Try MMKV
        const mmkv = new MMKV({
          id: 'VideoChunkProcessor',
          encryptionKey: 'video_chunks_secure_key_2024',
        });
        mmkv.set('test', 'value');
        const testResult = mmkv.getString('test');
        mmkv.delete('test');
        if (testResult === 'value') {
          this.storage = mmkv as any;
          this.isMMKV = true;
          Logger.info('✅ MMKV initialized successfully (Android)');
        } else {
          throw new Error('MMKV test failed');
        }
      } catch (err) {
        Logger.warn('⚠️ MMKV init failed, using AsyncStorage:', err);
        this.initAsyncStorage();
      }
    } else {
      this.initAsyncStorage();
    }
    this.isInitialized = true;
  }

  private initAsyncStorage() {
    Logger.info('📱 Initializing AsyncStorage fallback...');
    this.storage = {
      set: async (key, value) => {
        await AsyncStorage.setItem(key, String(value));
      },
      getString: async key => {
        const result = await AsyncStorage.getItem(key);
        return result || undefined;
      },
      getNumber: async key => {
        const result = await AsyncStorage.getItem(key);
        return result ? parseFloat(result) : undefined;
      },
      getBoolean: async key => {
        const result = await AsyncStorage.getItem(key);
        return result === 'true';
      },
      delete: async key => {
        await AsyncStorage.removeItem(key);
      },
    };
    this.isMMKV = false;
    Logger.info('✅ AsyncStorage fallback initialized');
  }

  async set(key: string, value: string | number | boolean) {
    if (!this.storage) await this.init();
    if (!this.storage) return;
    try {
      await this.storage.set(key, value);
    } catch (err) {
      Logger.error(`Failed to set ${key}:`, err);
    }
  }

  async getString(key: string) {
    if (!this.storage) await this.init();
    if (!this.storage) return undefined;
    try {
      return await this.storage.getString(key);
    } catch (err) {
      Logger.error(`Failed to get string ${key}:`, err);
      return undefined;
    }
  }

  async getNumber(key: string) {
    if (!this.storage) await this.init();
    if (!this.storage) return 0;
    try {
      return (await this.storage.getNumber(key)) || 0;
    } catch (err) {
      Logger.error(`Failed to get number ${key}:`, err);
      return 0;
    }
  }

  async getBoolean(key: string) {
    if (!this.storage) await this.init();
    if (!this.storage) return false;
    try {
      return (await this.storage.getBoolean(key)) || false;
    } catch (err) {
      Logger.error(`Failed to get boolean ${key}:`, err);
      return false;
    }
  }

  async delete(key: string) {
    if (!this.storage) await this.init();
    if (!this.storage) return;
    try {
      await this.storage.delete(key);
    } catch (err) {
      Logger.error(`Failed to delete ${key}:`, err);
    }
  }

  isUsingMMKV() {
    return this.isMMKV;
  }

  getStorageType() {
    return this.isMMKV ? 'MMKV' : 'AsyncStorage';
  }

  getStats() {
    return {
      type: this.getStorageType(),
      initialized: this.isInitialized,
      performance: this.isMMKV
        ? 'Ultra-fast (synchronous)'
        : 'Standard (async)',
    };
  }
}

export const fastStorage = new FastStorageService();
