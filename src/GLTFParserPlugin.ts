import {
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  DoubleSide,
  FrontSide,
  Group,
  LoadingManager,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  RGBAFormat,
  SRGBColorSpace,
  Scene,
  Texture,
  UnsignedByteType,
} from "three";
import {
  GLTFLoader,
  type GLTF,
} from "three/examples/jsm/loaders/GLTFLoader.js";
import type {
  GLTFNodeData,
  GLTFWorkerData,
  PrimitiveExtensions,
} from "./types";

// Metadata classes from renderer-plugin
// @ts-expect-error - No type declarations for these JS modules
import { StructuralMetadata } from "3d-tiles-renderer/src/three/plugins/gltf/metadata/classes/StructuralMetadata.js";
// @ts-expect-error - No type declarations for these JS modules
import { MeshFeatures } from "3d-tiles-renderer/src/three/plugins/gltf/metadata/classes/MeshFeatures.js";

// Extension names
const EXT_STRUCTURAL_METADATA = "EXT_structural_metadata";
const EXT_MESH_FEATURES = "EXT_mesh_features";

// Worker URL
const WORKER_URL = new URL("./gltf-worker.ts", import.meta.url).href;

// Worker 池管理
let sharedWorker: Worker | null = null;
let workerRefCount = 0;
let workerReadyPromise: Promise<void> | null = null;

/**
 * 初始化共享 Worker
 */
function initSharedWorker(): Promise<void> {
  workerRefCount++;

  if (!sharedWorker) {
    sharedWorker = new Worker(WORKER_URL, { type: "module" });
    workerReadyPromise = new Promise((resolve, reject) => {
      const onMessage = (event: MessageEvent) => {
        if (event.data.type === "ready") {
          sharedWorker?.removeEventListener("message", onMessage);
          resolve();
        } else if (event.data.type === "error" && !event.data.callback) {
          sharedWorker?.removeEventListener("message", onMessage);
          reject(new Error(event.data.error));
        }
      };
      sharedWorker!.addEventListener("message", onMessage);
    });
  }

  return workerReadyPromise!;
}

/**
 * 释放共享 Worker 引用
 */
function releaseSharedWorker(): void {
  workerRefCount--;

  if (workerRefCount <= 0 && sharedWorker) {
    sharedWorker.terminate();
    sharedWorker = null;
    workerReadyPromise = null;
    workerRefCount = 0;
  }
}

/**
 * GLTFWorkerLoader 配置选项
 */
interface GLTFWorkerLoaderOptions {
  /** 是否启用 metadata 支持 (EXT_mesh_features, EXT_structural_metadata) */
  metadata?: boolean;
}

/**
 * Mesh associations - 映射 Three.js Mesh 到原始的 mesh/primitive 索引
 */
interface MeshAssociation {
  meshes: number;
  primitives: number;
}

/**
 * 使用 Worker 解析 GLTF 的自定义 Loader
 */
class GLTFWorkerLoader extends GLTFLoader {
  private _metadata: boolean = true;

  constructor(manager?: LoadingManager, options?: GLTFWorkerLoaderOptions) {
    super(manager);
    this._metadata = options?.metadata ?? true;
  }

  /**
   * 异步解析 GLTF buffer
   */
  async parseAsync(buffer: ArrayBuffer, path: string): Promise<GLTF> {
    await workerReadyPromise;

    if (!sharedWorker) {
      throw new Error("GLTFWorkerLoader: Worker not initialized");
    }

    // 使用 worker 解析
    const data = await this.parseWithWorker(buffer, path);

    // 构建 Three.js 场景
    const scene = this.buildSceneFromGLTFData(data);

    // 返回完整的 GLTF 对象
    return {
      scene: scene as unknown as Group,
      scenes: [scene as unknown as Group],
      animations: [],
      cameras: [],
      asset: {
        generator: "GLTFWorkerLoader",
        version: "2.0",
      },
      parser: null as any,
      userData: {},
    };
  }

  /**
   * 使用 Worker 解析 GLTF 数据
   */
  private parseWithWorker(
    buffer: ArrayBuffer,
    workingPath: string,
  ): Promise<GLTFWorkerData> {
    return new Promise((resolve, reject) => {
      if (!sharedWorker) {
        reject(new Error("Worker not available"));
        return;
      }

      const callbackId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;

      const onMessage = (event: MessageEvent) => {
        const { type, data, error, callback } = event.data;

        if (callback !== callbackId) return;

        sharedWorker?.removeEventListener("message", onMessage);

        if (type === "success") {
          resolve(data);
        } else if (type === "error") {
          reject(new Error(error));
        }
      };

      sharedWorker.addEventListener("message", onMessage);

      // 发送 buffer 和工作路径给 worker
      sharedWorker.postMessage(
        {
          type: "parseBuffer",
          buffer: buffer,
          root: workingPath,
          callback: callbackId,
        },
        [buffer],
      );
    });
  }

  /**
   * 将 Worker 返回的 GLTF 数据转换成 Three.js Scene
   */
  private buildSceneFromGLTFData(data: GLTFWorkerData): Scene {
    const scene = new Scene();

    // Mesh associations - 映射 Three.js Mesh 到原始的 mesh/primitive 索引
    const associations = new Map<Mesh, MeshAssociation>();

    // 解析纹理
    const textureMap = new Map<number, Texture>();
    const textureArray: (Texture | null)[] = [];
    if (data.textures) {
      for (const [index, textureData] of data.textures.entries()) {
        if (textureData.image && textureData.image.array) {
          const imageData = textureData.image;
          const tex = new DataTexture(
            imageData.array,
            imageData.width,
            imageData.height,
            RGBAFormat,
            UnsignedByteType,
          );
          tex.flipY = false;
          tex.colorSpace = SRGBColorSpace;
          tex.needsUpdate = true;
          textureMap.set(index, tex);
          textureArray[index] = tex;
          continue;
        }

        // 默认空纹理
        const texture = new Texture();
        texture.flipY = false;
        textureMap.set(index, texture);
        textureArray[index] = texture;
      }
    }

    // 解析材质
    const materialMap = new Map<number, MeshStandardMaterial>();
    if (data.materials) {
      for (const [index, matData] of data.materials.entries()) {
        const material = new MeshStandardMaterial();

        // PBR材质属性
        if (matData.pbrMetallicRoughness) {
          const pbr = matData.pbrMetallicRoughness;

          // 基础颜色
          if (pbr.baseColorFactor) {
            material.color.setRGB(
              pbr.baseColorFactor[0],
              pbr.baseColorFactor[1],
              pbr.baseColorFactor[2],
            );
            if (pbr.baseColorFactor[3] !== undefined) {
              material.opacity = pbr.baseColorFactor[3];
              if (material.opacity < 1) material.transparent = true;
            }
          }

          // 基础颜色纹理
          if (
            pbr.baseColorTexture &&
            pbr.baseColorTexture.index !== undefined
          ) {
            const tex = textureMap.get(pbr.baseColorTexture.index);
            if (tex) {
              material.map = tex;
            }
          }

          // 金属度和粗糙度
          material.metalness =
            pbr.metallicFactor !== undefined ? pbr.metallicFactor : 1.0;
          material.roughness =
            pbr.roughnessFactor !== undefined ? pbr.roughnessFactor : 1.0;

          // 金属粗糙度纹理
          if (
            pbr.metallicRoughnessTexture &&
            pbr.metallicRoughnessTexture.index !== undefined
          ) {
            const tex = textureMap.get(pbr.metallicRoughnessTexture.index);
            if (tex) {
              material.metalnessMap = material.roughnessMap = tex;
            }
          }
        }

        // 法线贴图
        if (
          matData.normalTexture &&
          matData.normalTexture.index !== undefined
        ) {
          const tex = textureMap.get(matData.normalTexture.index);
          if (tex) {
            material.normalMap = tex;
            if (matData.normalTexture.scale !== undefined) {
              material.normalScale.set(
                matData.normalTexture.scale,
                matData.normalTexture.scale,
              );
            }
          }
        }

        // 遮蔽贴图
        if (
          matData.occlusionTexture &&
          matData.occlusionTexture.index !== undefined
        ) {
          const tex = textureMap.get(matData.occlusionTexture.index);
          if (tex) {
            material.aoMap = tex;
          }
        }

        // 自发光
        if (
          matData.emissiveTexture &&
          matData.emissiveTexture.index !== undefined
        ) {
          const tex = textureMap.get(matData.emissiveTexture.index);
          if (tex) {
            material.emissiveMap = tex;
          }
        }
        if (matData.emissiveFactor) {
          material.emissive.setRGB(
            matData.emissiveFactor[0],
            matData.emissiveFactor[1],
            matData.emissiveFactor[2],
          );
        }

        // 双面渲染
        material.side = matData.doubleSided ? DoubleSide : FrontSide;

        // Alpha模式
        if (matData.alphaMode === "BLEND") {
          material.transparent = true;
        } else if (matData.alphaMode === "MASK") {
          material.alphaTest =
            matData.alphaCutoff !== undefined ? matData.alphaCutoff : 0.5;
        }

        materialMap.set(index, material);
      }
    }

    // 创建默认材质
    const defaultMaterial = new MeshStandardMaterial({
      color: 0xcccccc,
    });

    // 解析mesh，同时记录 primitive extensions
    const meshMap = new Map<
      number,
      Array<{
        geometry: BufferGeometry;
        material: MeshStandardMaterial;
        primitiveIndex: number;
        extensions?: PrimitiveExtensions;
      }>
    >();
    if (data.meshes) {
      for (const meshIndex in data.meshes) {
        const meshData = data.meshes[meshIndex];
        const primitiveDataList: Array<{
          geometry: BufferGeometry;
          material: MeshStandardMaterial;
          primitiveIndex: number;
          extensions?: PrimitiveExtensions;
        }> = [];
        const primitives = meshData.primitives;

        for (
          let primitiveIndex = 0;
          primitiveIndex < primitives.length;
          primitiveIndex++
        ) {
          const primitive = primitives[primitiveIndex];
          const geometry = new BufferGeometry();

          // 处理顶点属性
          if (primitive.attributes) {
            // 位置
            const posData = primitive.attributes.POSITION;
            if (posData && posData.array) {
              geometry.setAttribute(
                "position",
                new BufferAttribute(posData.array, posData.itemSize || 3),
              );
            }

            // 法线
            const normalData = primitive.attributes.NORMAL;
            if (normalData && normalData.array) {
              geometry.setAttribute(
                "normal",
                new BufferAttribute(normalData.array, normalData.itemSize || 3),
              );
            }

            // UV坐标
            const uvData = primitive.attributes.TEXCOORD_0;
            if (uvData && uvData.array) {
              geometry.setAttribute(
                "uv",
                new BufferAttribute(uvData.array, uvData.itemSize || 2),
              );
            }

            // 顶点颜色
            const colorData = primitive.attributes.COLOR_0;
            if (colorData && colorData.array) {
              geometry.setAttribute(
                "color",
                new BufferAttribute(colorData.array, colorData.itemSize || 3),
              );
            }

            // 切线
            const tangentData = primitive.attributes.TANGENT;
            if (tangentData && tangentData.array) {
              geometry.setAttribute(
                "tangent",
                new BufferAttribute(
                  tangentData.array,
                  tangentData.itemSize || 4,
                ),
              );
            }

            // Feature ID 属性 (用于 EXT_mesh_features)
            for (const attrName in primitive.attributes) {
              if (attrName.startsWith("_FEATURE_ID_")) {
                const featureIdData = primitive.attributes[attrName];
                if (featureIdData && featureIdData.array) {
                  const normalizedName = attrName
                    .toLowerCase()
                    .replace("_feature_id_", "_feature_id_");
                  geometry.setAttribute(
                    normalizedName,
                    new BufferAttribute(
                      featureIdData.array,
                      featureIdData.itemSize || 1,
                    ),
                  );
                }
              }
            }
          }

          // 索引
          const indexData = primitive.indices;
          if (indexData && indexData.array) {
            geometry.setIndex(new BufferAttribute(indexData.array, 1));
          }

          // 获取材质
          const material =
            primitive.material !== undefined
              ? materialMap.get(primitive.material) || defaultMaterial
              : defaultMaterial;

          primitiveDataList.push({
            geometry,
            material,
            primitiveIndex,
            extensions: primitive.extensions,
          });
        }

        meshMap.set(Number(meshIndex), primitiveDataList);
      }
    }

    // 解析节点
    const parseNodeData = (nodeData: GLTFNodeData): Group => {
      const node = new Group();

      const primitiveDataList = meshMap.get(nodeData.mesh);
      if (primitiveDataList) {
        for (const {
          geometry,
          material,
          primitiveIndex,
        } of primitiveDataList) {
          const mesh = new Mesh(geometry, material);
          node.add(mesh);

          // 记录 mesh associations
          associations.set(mesh, {
            meshes: nodeData.mesh,
            primitives: primitiveIndex,
          });
        }
      }

      // 设置节点名称
      if (nodeData.name) {
        node.name = nodeData.name;
      }

      // 应用变换
      if (nodeData.matrix) {
        const m = new Matrix4();
        m.fromArray(nodeData.matrix);
        node.applyMatrix4(m);
      } else {
        if (nodeData.translation) {
          node.position.set(
            nodeData.translation[0],
            nodeData.translation[1],
            nodeData.translation[2],
          );
        }
        if (nodeData.rotation) {
          node.quaternion.set(
            nodeData.rotation[0],
            nodeData.rotation[1],
            nodeData.rotation[2],
            nodeData.rotation[3],
          );
        }
        if (nodeData.scale) {
          node.scale.set(
            nodeData.scale[0],
            nodeData.scale[1],
            nodeData.scale[2],
          );
        }
      }

      // 递归处理子节点
      if (nodeData.children && Array.isArray(nodeData.children)) {
        for (const child of nodeData.children) {
          const childNode = parseNodeData(child);
          node.add(childNode);
        }
      }

      return node;
    };

    // 添加场景节点
    const sceneData = data.scenes[0];
    for (const nodeData of sceneData.nodes) {
      const node = parseNodeData(nodeData);
      scene.add(node);
    }

    // 处理 metadata (如果启用)
    if (this._metadata) {
      this.processMetadata(scene, data, associations, textureArray, meshMap);
    }

    return scene;
  }

  /**
   * 处理并挂载 metadata 到场景和 mesh 对象
   */
  private processMetadata(
    scene: Scene,
    data: GLTFWorkerData,
    associations: Map<Mesh, MeshAssociation>,
    textures: (Texture | null)[],
    meshMap: Map<
      number,
      Array<{
        geometry: BufferGeometry;
        material: MeshStandardMaterial;
        primitiveIndex: number;
        extensions?: PrimitiveExtensions;
      }>
    >,
  ): void {
    const extensionsUsed = data.json?.extensionsUsed || [];
    const hasStructuralMetadata = extensionsUsed.includes(
      EXT_STRUCTURAL_METADATA,
    );
    const hasMeshFeatures = extensionsUsed.includes(EXT_MESH_FEATURES);

    if (!hasStructuralMetadata && !hasMeshFeatures) {
      return;
    }

    // 处理 EXT_structural_metadata
    let rootMetadata: StructuralMetadata | null = null;
    if (hasStructuralMetadata && data.structuralMetadata) {
      const rootExtension = data.json?.extensions?.[EXT_STRUCTURAL_METADATA];
      if (rootExtension) {
        // 构建 StructuralMetadata 需要的 definition 对象
        const definition = {
          schema: data.structuralMetadata.schema,
          propertyTables: data.structuralMetadata.propertyTables || [],
          propertyTextures: rootExtension.propertyTextures || [],
          propertyAttributes: rootExtension.propertyAttributes || [],
        };

        // buffers 数组用于 PropertyTableAccessor
        const buffers = data.structuralMetadata.buffers || [];

        // 创建根级 StructuralMetadata 实例
        rootMetadata = new StructuralMetadata(definition, textures, buffers);
        scene.userData.structuralMetadata = rootMetadata;
      }
    }

    // 遍历场景中的所有 mesh，处理 mesh-level metadata
    scene.traverse((child) => {
      if (!(child instanceof Mesh)) return;

      const association = associations.get(child);
      if (!association) return;

      const { meshes: meshIndex, primitives: primitiveIndex } = association;

      // 获取原始 primitive 数据
      const primitiveDataList = meshMap.get(meshIndex);
      if (!primitiveDataList) return;

      const primitiveData = primitiveDataList.find(
        (p) => p.primitiveIndex === primitiveIndex,
      );
      if (!primitiveData) return;

      const extensions = primitiveData.extensions;

      // 处理 EXT_structural_metadata (primitive level)
      if (hasStructuralMetadata && rootMetadata) {
        const primMetadataExt = extensions?.[EXT_STRUCTURAL_METADATA];
        if (primMetadataExt) {
          // primitive 有自己的 metadata 引用
          const rootExtension =
            data.json?.extensions?.[EXT_STRUCTURAL_METADATA];
          if (rootExtension) {
            const definition = {
              schema: data.structuralMetadata!.schema,
              propertyTables: data.structuralMetadata!.propertyTables || [],
              propertyTextures: rootExtension.propertyTextures || [],
              propertyAttributes: rootExtension.propertyAttributes || [],
            };
            const buffers = data.structuralMetadata!.buffers || [];

            child.userData.structuralMetadata = new StructuralMetadata(
              definition,
              textures,
              buffers,
              primMetadataExt,
              child,
            );
          }
        } else {
          // 使用根级 metadata
          child.userData.structuralMetadata = rootMetadata;
        }
      }

      // 处理 EXT_mesh_features
      if (hasMeshFeatures) {
        const meshFeaturesExt = extensions?.[EXT_MESH_FEATURES];
        if (meshFeaturesExt) {
          child.userData.meshFeatures = new MeshFeatures(
            child.geometry,
            textures,
            meshFeaturesExt,
          );
        }
      }
    });
  }
}

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
