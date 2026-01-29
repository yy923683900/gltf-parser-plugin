import {
  Group,
  LoadingManager,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Scene,
  Texture,
  Loader,
} from "three";
import {
  acquireWorker,
  buildTextures,
  buildMaterials,
  buildMeshPrimitives,
  type PrimitiveData,
  getWorkers,
} from "./utils";
import type { GLTFNodeData, GLTFWorkerData } from "./types";
import { StructuralMetadata } from "3d-tiles-renderer/src/three/plugins/gltf/metadata/classes/StructuralMetadata.js";
import { MeshFeatures } from "3d-tiles-renderer/src/three/plugins/gltf/metadata/classes/MeshFeatures.js";

// Extension names
const EXT_STRUCTURAL_METADATA = "EXT_structural_metadata";
const EXT_MESH_FEATURES = "EXT_mesh_features";

/**
 * GLTFWorkerLoader 配置选项
 */
export interface GLTFWorkerLoaderOptions {
  /** 是否启用 metadata 支持 (EXT_mesh_features, EXT_structural_metadata) */
  metadata?: boolean;
}

let uuid = 0;

/**
 * 使用 Worker 解析 GLTF 的自定义 Loader
 */
export class GLTFWorkerLoader extends Loader {
  private _metadata: boolean = true;
  private _loaderId = uuid++;
  private _callbacks = new Map<
    number,
    { resolve: (data: any) => void; reject: (err: Error) => void }
  >();
  private _nextRequestId = 1;

  constructor(manager?: LoadingManager, options?: GLTFWorkerLoaderOptions) {
    super(manager);
    this._metadata = options?.metadata ?? true;

    this.addListeners();
  }

  addListeners() {
    const workers = getWorkers();
    workers.forEach((worker) => {
      worker.addEventListener("message", this._onMessage);
    });
  }

  removeListeners() {
    const workers = getWorkers();
    workers.forEach((worker) => {
      worker.removeEventListener("message", this._onMessage);
    });
  }

  /**
   * 异步解析 GLTF buffer
   */
  async parseAsync(buffer: ArrayBuffer, path: string): Promise<any> {
    // 获取可用 Worker（如果都忙则等待）
    const worker = acquireWorker();

    // 使用 worker 解析
    const data = await this.parseWithWorker(worker, buffer, path);

    // 构建 Three.js 场景
    const scene = this.buildSceneFromGLTFData(data);

    // 返回与GLTFLoader相同的格式
    return {
      scene: scene,
      scenes: [scene],
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
    worker: Worker,
    buffer: ArrayBuffer,
    workingPath: string,
  ): Promise<GLTFWorkerData> {
    return new Promise((resolve, reject) => {
      const requestId = this._nextRequestId++;
      this._callbacks.set(requestId, { resolve, reject });

      // 发送 buffer 和工作路径给 worker
      worker.postMessage(
        {
          method: "parseTile",
          buffer: buffer,
          root: workingPath,
          loaderId: this._loaderId, // Use requestId as loaderId for the worker
          requestId,
        },
        [buffer],
      );
    });
  }

  private _onMessage = (event: MessageEvent) => {
    const { type, data, error, loaderId, requestId } = event.data;

    // loaderId here is our requestId
    if (loaderId !== this._loaderId) return;
    const callback = this._callbacks.get(requestId);
    if (!callback) return;

    this._callbacks.delete(requestId);

    if (type === "success") {
      callback.resolve(data);
    } else if (type === "error") {
      callback.reject(new Error(error));
    }
  };

  /**
   * 将 Worker 返回的 GLTF 数据转换成 Three.js Scene
   */
  private buildSceneFromGLTFData(data: GLTFWorkerData): Scene {
    const scene = new Scene();

    // 构建纹理
    const { textureMap, textureArray } = buildTextures(data);

    // 构建材质
    const materialMap = buildMaterials(data, textureMap);

    // 创建默认材质
    const defaultMaterial = new MeshStandardMaterial({ color: 0xcccccc });

    // 构建 mesh primitives
    const meshMap = buildMeshPrimitives(data, materialMap, defaultMaterial);

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
          // 记录 mesh 对应的原始 GLTF 索引
          mesh.userData._gltfMeshIndex = nodeData.mesh;
          mesh.userData._gltfPrimitiveIndex = primitiveIndex;
          node.add(mesh);
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
      this.processMetadata(scene, data, textureArray, meshMap);
    }

    return scene;
  }

  /**
   * 处理并挂载 metadata 到场景和 mesh 对象
   */
  private processMetadata(
    scene: Scene,
    data: GLTFWorkerData,
    textures: (Texture | null)[],
    meshMap: Map<number, PrimitiveData[]>,
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
    let rootMetadata: any = null;
    if (hasStructuralMetadata && data.structuralMetadata) {
      const rootExtension = data.json?.extensions?.[EXT_STRUCTURAL_METADATA];
      if (rootExtension) {
        const definition = {
          schema: data.structuralMetadata.schema,
          propertyTables: data.structuralMetadata.propertyTables || [],
          propertyTextures: rootExtension.propertyTextures || [],
          propertyAttributes: rootExtension.propertyAttributes || [],
        };

        const buffers = data.structuralMetadata.buffers || [];
        rootMetadata = new StructuralMetadata(definition, textures, buffers);
        scene.userData.structuralMetadata = rootMetadata;
      }
    }

    // 遍历场景中的所有 mesh，处理 mesh-level metadata
    scene.traverse((child) => {
      if (!(child instanceof Mesh)) return;

      const meshIndex = child.userData._gltfMeshIndex as number | undefined;
      const primitiveIndex = child.userData._gltfPrimitiveIndex as number | undefined;
      if (meshIndex === undefined || primitiveIndex === undefined) return;

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
