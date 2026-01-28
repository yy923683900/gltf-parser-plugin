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
import type { GLTFNodeData, GLTFWorkerData } from "./types";

// Metadata classes from renderer-plugin
// @ts-expect-error - No type declarations for these JS modules
import { StructuralMetadata } from "3d-tiles-renderer/src/three/plugins/gltf/metadata/classes/StructuralMetadata.js";
// @ts-expect-error - No type declarations for these JS modules
import { MeshFeatures } from "3d-tiles-renderer/src/three/plugins/gltf/metadata/classes/MeshFeatures.js";

import {
  getSharedWorker,
  getWorkerReadyPromise,
  buildTextures,
  buildMaterials,
  buildMeshPrimitives,
  type PrimitiveData,
} from "./utils";

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

/**
 * Mesh associations - 映射 Three.js Mesh 到原始的 mesh/primitive 索引
 */
interface MeshAssociation {
  meshes: number;
  primitives: number;
}

let uuid = 0;

/**
 * 使用 Worker 解析 GLTF 的自定义 Loader
 */
export class GLTFWorkerLoader extends Loader {
  private _metadata: boolean = true;
  loaderId = uuid++;

  constructor(manager?: LoadingManager, options?: GLTFWorkerLoaderOptions) {
    super(manager);
    this._metadata = options?.metadata ?? true;
  }

  /**
   * 异步解析 GLTF buffer
   */
  async parseAsync(buffer: ArrayBuffer, path: string): Promise<any> {
    await getWorkerReadyPromise();

    const worker = getSharedWorker();
    if (!worker) {
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
      const worker = getSharedWorker();
      if (!worker) {
        reject(new Error("Worker not available"));
        return;
      }

      const onMessage = (event: MessageEvent) => {
        const { type, data, error, loaderId } = event.data;

        if (loaderId !== this.loaderId) return;

        worker.removeEventListener("message", onMessage);

        if (type === "success") {
          resolve(data);
        } else if (type === "error") {
          reject(new Error(error));
        }
      };

      worker.addEventListener("message", onMessage);

      // 发送 buffer 和工作路径给 worker
      worker.postMessage(
        {
          method: "parseTile",
          buffer: buffer,
          root: workingPath,
          loaderId: this.loaderId,
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
    let rootMetadata: StructuralMetadata | null = null;
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

      const association = associations.get(child);
      if (!association) return;

      const { meshes: meshIndex, primitives: primitiveIndex } = association;

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
