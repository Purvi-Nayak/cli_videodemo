import {MMKV} from 'react-native-mmkv';
import {Logger} from '../utils/logger';

const storage = new MMKV({
  id: 'videodemo',
});

/**
 * Async-like helpers matching AsyncStorage API used elsewhere:
 * - getItem(key): Promise<string | null>
 * - setItem(key, value): Promise<void>
 * - removeItem(key): Promise<void>
 *
 * Also export named functions and a default object for compatibility.
 */

export async function getItem(key: string): Promise<string | null> {
  try {
    const v = storage.getString(key);
    return typeof v === 'undefined' ? null : v;
  } catch (e) {
    Logger.error('MMKV getItem error', e);
    return null;
  }
}

export async function setItem(key: string, value: string): Promise<void> {
  try {
    storage.set(key, value);
  } catch (e) {
    Logger.error('MMKV setItem error', e);
    throw e;
  }
}

export async function removeItem(key: string): Promise<void> {
  try {
    storage.delete(key);
  } catch (e) {
    Logger.error('MMKV removeItem error', e);
    throw e;
  }
}

// default export for modules importing default
const MMKVStorage = {
  getItem,
  setItem,
  removeItem,
};

export default MMKVStorage;
