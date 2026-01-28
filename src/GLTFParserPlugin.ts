import { GLTFWorkerLoader } from "./GLTFWorkerLoader";
import { initSharedWorker, releaseSharedWorker } from "./utils";

/**
 * GLTFParserPlugin 配置选项
 */
export interface GLTFParserPluginOptions {
  /**
   * 是否启用 metadata 支持
   * 包括 EXT_mesh_features 和 EXT_structural_metadata 扩展
   * @default true
   */
  metadata?: boolean;
}

export class GLTFParserPlugin {
  name = "GLTFParserPlugin";

  private tiles: any = null;
  private _loader: GLTFWorkerLoader | null = null;
  private readonly _gltfRegex = /\.(gltf|glb)$/g;
  private readonly _options: GLTFParserPluginOptions;

  /**
   * 创建 GLTFParserPlugin 实例
   * @param options 配置选项
   */
  constructor(options?: GLTFParserPluginOptions) {
    console.log("GLTFParserPlugin constructor");
    this._options = {
      metadata: true,
      ...options,
    };

    // 初始化共享 worker
    initSharedWorker();
  }

  /**
   * 插件初始化，由 TilesRenderer 调用
   */
  init(tiles: any) {
    this.tiles = tiles;

    // 创建自定义 loader 并注册，传入 metadata 选项
    this._loader = new GLTFWorkerLoader(tiles.manager, {
      metadata: this._options.metadata,
    });

    // 使用正则表达式匹配 .gltf 和 .glb 文件
    tiles.manager.addHandler(this._gltfRegex, this._loader);
  }

  /**
   * 插件销毁
   */
  dispose() {
    // 移除 handler
    if (this.tiles) {
      this.tiles.manager.removeHandler(this._gltfRegex);
    }

    this._loader = null;
    this.tiles = null;

    // 释放 worker 引用
    releaseSharedWorker();
  }
}
