import { BufferAttribute, BufferGeometry, Material } from "three";
import type { GLTFWorkerData, PrimitiveExtensions } from "../types";

export interface PrimitiveData {
  geometry: BufferGeometry;
  material: Material;
  primitiveIndex: number;
  extensions?: PrimitiveExtensions;
}

/**
 * 从 GLTF 数据构建 Mesh Primitives
 */
export function buildMeshPrimitives(
  data: GLTFWorkerData,
  materialMap: Map<number, Material>,
  defaultMaterial: Material,
): Map<number, PrimitiveData[]> {
  const meshMap = new Map<number, PrimitiveData[]>();

  if (!data.meshes) {
    return meshMap;
  }

  for (const meshIndex in data.meshes) {
    const meshData = data.meshes[meshIndex];
    const primitiveDataList: PrimitiveData[] = [];
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
            new BufferAttribute(tangentData.array, tangentData.itemSize || 4),
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

  return meshMap;
}
