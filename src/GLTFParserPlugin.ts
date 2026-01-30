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
    // If cache is disabled, fetch directly
    const isJson = url.toLowerCase().endsWith(".json");
    if (!this._options.useIndexedDB || isJson) {
      return this.tiles.fetchData(url, options);
    }

    try {
      // Try to get cached data from IndexedDB
      const cachedData = await tileCache.get(url);

      if (cachedData) {
        // Binary file: return ArrayBuffer directly
        return cachedData;
      }

      // Cache miss, fetch from network
      const response = await this.tiles.fetchData(url, options);

      if (!response.ok) {
        return response;
      }

      // Read as ArrayBuffer (unified storage format)
      const arrayBuffer = await response.arrayBuffer();

      // Store to IndexedDB asynchronously (non-blocking)
      tileCache.set(url, arrayBuffer).catch((err) => {
        console.warn("[GLTFParserPlugin] Failed to cache data:", err);
      });

      // Binary file: return ArrayBuffer
      return arrayBuffer;
    } catch (error) {
      // Fallback to normal fetch on error
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
