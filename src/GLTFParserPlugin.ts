import { GLTFWorkerLoader } from "./GLTFWorkerLoader";
import type { MaterialBuilder } from "./types";
import { setMaxWorkers } from "./utils";
import { tileCache } from "./db";

/**
 * GLTFParserPlugin configuration options
 */
export interface GLTFParserPluginOptions {
  /**
   * Whether to enable metadata support
   * Includes EXT_mesh_features and EXT_structural_metadata extensions
   * @default true
   */
  metadata?: boolean;
  /**
   * Maximum number of workers in the worker pool
   * Maximum value is navigator.hardwareConcurrency
   * @default navigator.hardwareConcurrency
   */
  maxWorkers?: number;

  /**
   * Custom material builder function
   * Used to handle GLTF material extensions or custom material logic
   */
  materialBuilder?: MaterialBuilder;

  /**
   * Callback function before parsing
   * Used to preprocess the buffer before parsing GLTF
   */
  beforeParseTile?: (
    buffer: ArrayBuffer,
    tile: any,
    extension: any,
    uri: string,
    abortSignal: AbortSignal,
  ) => Promise<ArrayBuffer>;

  /**
   * Whether to enable IndexedDB caching for tile data
   * @default false
   */
  useIndexedDB?: boolean;
}

export class GLTFParserPlugin {
  name = "GLTFParserPlugin";

  private tiles: any = null;
  private _loader: GLTFWorkerLoader | null = null;
  private readonly _gltfRegex = /\.(gltf|glb)$/g;
  private readonly _options: GLTFParserPluginOptions;

  /**
   * Create a GLTFParserPlugin instance
   * @param options configuration options
   */
  constructor(options?: GLTFParserPluginOptions) {
    console.log("GLTFParserPlugin constructor");
    this._options = {
      metadata: true,
      maxWorkers: navigator.hardwareConcurrency || 4,
      useIndexedDB: false,
      ...options,
    };

    // Set worker pool size and initialize
    setMaxWorkers(this._options.maxWorkers!);
  }

  /**
   * Fetch tile data with IndexedDB caching support
   * If data exists in IndexedDB, return cached data without network request
   * If not cached, fetch from network and store in IndexedDB
   * @param url The processed URL (used as cache key)
   * @param options Fetch options
   * @returns Cached data (ArrayBuffer for binary, parsed JSON for .json) or Response on error
   */
  async fetchData(
    url: string,
    options?: RequestInit,
  ): Promise<Response | ArrayBuffer | object> {
    // 如果禁用缓存，直接 fetch
    const isJson = url.toLowerCase().endsWith(".json");
    if (!this._options.useIndexedDB || isJson) {
      return this.tiles.fetchData(url, options);
    }

    try {
      // 尝试从 IndexedDB 获取缓存数据
      const cachedData = await tileCache.get(url);

      if (cachedData) {
        // 二进制文件：直接返回 ArrayBuffer
        return cachedData;
      }

      // 缓存未命中，发起网络请求
      const response = await this.tiles.fetchData(url, options);

      if (!response.ok) {
        return response;
      }

      // 读取为 ArrayBuffer（统一存储格式）
      const arrayBuffer = await response.arrayBuffer();

      // 异步存储到 IndexedDB（不阻塞返回）
      tileCache.set(url, arrayBuffer).catch((err) => {
        console.warn("[GLTFParserPlugin] Failed to cache data:", err);
      });

      // 二进制文件：返回 ArrayBuffer
      return arrayBuffer;
    } catch (error) {
      console.error("[GLTFParserPlugin] fetchData error:", error);
      // 发生错误时，回退到普通 fetch
      return this.tiles.fetchData(url, options);
    }
  }

  /**
   * Clear all cached tile data from IndexedDB
   */
  async clearCache(): Promise<void> {
    await tileCache.clear();
    console.info("[GLTFParserPlugin] Cache cleared");
  }

  /**
   * Plugin initialization, called by TilesRenderer
   */
  init(tiles: any) {
    this.tiles = tiles;

    // Create custom loader and register, passing metadata options
    this._loader = new GLTFWorkerLoader(tiles.manager, {
      metadata: this._options.metadata,
      materialBuilder: this._options.materialBuilder,
    });

    // Use regex to match .gltf and .glb files
    tiles.manager.addHandler(this._gltfRegex, this._loader);
  }

  async parseTile(
    buffer: ArrayBuffer,
    tile: any,
    extension: any,
    uri: string,
    abortSignal: AbortSignal,
  ) {
    // Call beforeParseTile callback
    if (this._options.beforeParseTile) {
      buffer = await this._options.beforeParseTile(
        buffer,
        tile,
        extension,
        uri,
        abortSignal,
      );
    }
    return this.tiles.parseTile(buffer, tile, extension, uri, abortSignal);
  }

  /**
   * Plugin disposal
   */
  dispose() {
    // Remove handler
    if (this.tiles) {
      this.tiles.manager.removeHandler(this._gltfRegex);
    }

    // Remove Worker listeners
    if (this._loader) {
      this._loader.removeListeners();
    }
    this._loader = null;
    this.tiles = null;
  }
}
