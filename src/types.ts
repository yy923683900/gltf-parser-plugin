export interface GLTFWorkerData {
  textures?: Array<{
    image?: {
      array: Uint8Array;
      width: number;
      height: number;
    };
  }>;
  materials?: Array<{
    pbrMetallicRoughness?: {
      baseColorFactor?: number[];
      baseColorTexture?: { index: number };
      metallicFactor?: number;
      roughnessFactor?: number;
      metallicRoughnessTexture?: { index: number };
    };
    normalTexture?: { index: number; scale?: number };
    occlusionTexture?: { index: number };
    emissiveTexture?: { index: number };
    emissiveFactor?: number[];
    doubleSided?: boolean;
    alphaMode?: string;
    alphaCutoff?: number;
  }>;
  meshes?: Record<
    string,
    {
      primitives: Array<{
        attributes?: {
          POSITION?: { array: Float32Array; itemSize: number };
          NORMAL?: { array: Float32Array; itemSize: number };
          TEXCOORD_0?: { array: Float32Array; itemSize: number };
          COLOR_0?: { array: Float32Array; itemSize: number };
          TANGENT?: { array: Float32Array; itemSize: number };
        };
        indices?: { array: Uint16Array | Uint32Array };
        material?: number;
      }>;
    }
  >;
  scenes: Array<{
    nodes: Array<GLTFNodeData>;
  }>;
}

export interface GLTFNodeData {
  name?: string;
  mesh: number;
  matrix?: number[];
  translation?: number[];
  rotation?: number[];
  scale?: number[];
  children?: GLTFNodeData[];
}
