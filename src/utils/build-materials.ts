import {
  DoubleSide,
  FrontSide,
  MeshStandardMaterial,
  Texture,
} from "three";
import type { GLTFWorkerData } from "../types";

/**
 * 从 GLTF 数据构建材质
 */
export function buildMaterials(
  data: GLTFWorkerData,
  textureMap: Map<number, Texture>,
): Map<number, MeshStandardMaterial> {
  const materialMap = new Map<number, MeshStandardMaterial>();

  if (!data.materials) {
    return materialMap;
  }

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
      if (pbr.baseColorTexture && pbr.baseColorTexture.index !== undefined) {
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
    if (matData.normalTexture && matData.normalTexture.index !== undefined) {
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

  return materialMap;
}
