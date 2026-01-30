// IndexedDB 常量
const DB_NAME = "GLTFParserPluginTilesCache";
const DB_VERSION = 1;
const STORE_NAME = "tiles";

/**
 * IndexedDB 缓存管理类
 */
export class TileCacheDB {
  private dbPromise: Promise<IDBDatabase> | null = null;

  /**
   * 打开/获取数据库连接
   */
  private openDB(): Promise<IDBDatabase> {
    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error("Failed to open IndexedDB:", request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "url" });
        }
      };
    });

    return this.dbPromise;
  }

  /**
   * 从缓存获取数据
   * @param url 缓存键（processedUrl）
   */
  async get(url: string): Promise<ArrayBuffer | null> {
    try {
      const db = await this.openDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(url);

        request.onerror = () => {
          console.error("Failed to get from cache:", request.error);
          reject(request.error);
        };

        request.onsuccess = () => {
          const result = request.result;
          resolve(result ? result.data : null);
        };
      });
    } catch (error) {
      console.error("Cache get error:", error);
      return null;
    }
  }

  /**
   * 存储数据到缓存
   * @param url 缓存键（processedUrl）
   * @param data 要缓存的数据
   */
  async set(url: string, data: ArrayBuffer): Promise<void> {
    try {
      const db = await this.openDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put({
          url,
          data,
          timestamp: Date.now(),
        });

        request.onerror = () => {
          console.error("Failed to set cache:", request.error);
          reject(request.error);
        };

        request.onsuccess = () => {
          resolve();
        };
      });
    } catch (error) {
      console.error("Cache set error:", error);
    }
  }

  /**
   * 清空缓存
   */
  async clear(): Promise<void> {
    try {
      const db = await this.openDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } catch (error) {
      console.error("Cache clear error:", error);
    }
  }
}

// 全局缓存实例
export const tileCache = new TileCacheDB();
