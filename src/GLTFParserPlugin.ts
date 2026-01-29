import { GLTFWorkerLoader } from "./GLTFWorkerLoader";
import type { MaterialBuilder } from "./types";
import { setMaxWorkers } from "./utils";

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
