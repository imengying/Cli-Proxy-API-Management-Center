/**
 * 本地存储混淆服务（可逆）
 * 基于原项目 src/utils/secure-storage.js
 *
 * IMPORTANT: 这不是安全边界，仅用于避免“肉眼直读”的轻度混淆。
 */

import { obfuscateData, deobfuscateData } from '@/utils/encryption';

interface StorageOptions {
  obfuscate?: boolean;
}

class ObfuscatedStorageService {
  /**
   * 存储数据
   */
  setItem(key: string, value: unknown, options: StorageOptions = {}): void {
    const obfuscate = options.obfuscate ?? true;

    if (value === null || value === undefined) {
      this.removeItem(key);
      return;
    }

    const stringValue = JSON.stringify(value);
    const storedValue = obfuscate ? obfuscateData(stringValue) : stringValue;

    localStorage.setItem(key, storedValue);
  }

  /**
   * 获取数据
   */
  getItem<T = unknown>(key: string, options: StorageOptions = {}): T | null {
    const obfuscate = options.obfuscate ?? true;

    const raw = localStorage.getItem(key);
    if (raw === null) return null;

    try {
      const decrypted = obfuscate ? deobfuscateData(raw) : raw;
      return JSON.parse(decrypted) as T;
    } catch {
      return null;
    }
  }

  /**
   * 删除数据
   */
  removeItem(key: string): void {
    localStorage.removeItem(key);
  }
}

export const obfuscatedStorage = new ObfuscatedStorageService();
