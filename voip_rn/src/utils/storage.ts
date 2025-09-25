// Cross-platform storage solution
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { apiLogger } from './logger';

interface StorageInterface {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

class WebStorage implements StorageInterface {
  async getItem(key: string): Promise<string | null> {
    try {
      const w: any = typeof globalThis !== 'undefined' ? (globalThis as any) : undefined;
      if (w && w.localStorage) {
        return w.localStorage.getItem(key);
      }
      return null;
    } catch (error) {
      apiLogger.warn('WebStorage getItem error:', error);
      return null;
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    try {
      const w: any = typeof globalThis !== 'undefined' ? (globalThis as any) : undefined;
      if (w && w.localStorage) {
        w.localStorage.setItem(key, value);
      }
    } catch (error) {
      apiLogger.warn('WebStorage setItem error:', error);
    }
  }

  async removeItem(key: string): Promise<void> {
    try {
      const w: any = typeof globalThis !== 'undefined' ? (globalThis as any) : undefined;
      if (w && w.localStorage) {
        w.localStorage.removeItem(key);
      }
    } catch (error) {
      apiLogger.warn('WebStorage removeItem error:', error);
    }
  }
}

// Create platform-specific storage
const createStorage = (): StorageInterface => {
  if (Platform.OS === 'web') {
    return new WebStorage();
  }
  return AsyncStorage;
};

export const storage = createStorage();
