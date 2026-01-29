import { GLTFWorkerLoader } from "./GLTFWorkerLoader";
import { setMaxWorkers } from "./utils";

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
  /**
   * Worker 池中最大 Worker 数量
   * 最大值为 navigator.hardwareConcurrency
   * @default navigator.hardwareConcurrency
   */
  maxWorkers?: number;
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
      maxWorkers: navigator.hardwareConcurrency || 4,
      ...options,
    };

    // 设置 Worker 池大小并初始化
    setMaxWorkers(this._options.maxWorkers!);
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

    // 移除 Worker 监听器
    if (this._loader) {
      this._loader.removeListeners();
    }
    this._loader = null;
    this.tiles = null;
  }
}
