import type { AttributeData } from "./types";
import { dequantizeAttribute } from "./dequantize";
import { computeVertexNormals } from "./normals";
import { decodeTangent } from "./tangent";

/**
 * Process and dequantize GLTF data
 * @param data - Raw GLTF data from loader
 * @returns Processed data with transferables array
 */
export function processGLTFData(data: any): {
  data: any;
  transferables: ArrayBuffer[];
} {
  const transferables = data.transferables || [];
  const addTransferable = (arr: any) => {
    if (arr && arr.buffer && !transferables.includes(arr.buffer)) {
      transferables.push(arr.buffer);
    }
  };

  // Helper to process and replace attribute
  const processAndReplace = (
    key: string,
    itemSize: number,
    attributes: Record<string, AttributeData>,
    decoder?: (attr: AttributeData) => any,
  ) => {
    const attr = attributes[key];
    if (attr && attr.array) {
      // if else
      const processed = decoder
        ? decoder(attr)
        : attr.quantization
          ? dequantizeAttribute(attr, itemSize)
          : attr.array;
      attributes[key] = { array: processed, itemSize };
      addTransferable(processed);
      return processed;
    }
    return null;
  };

  if (data.meshes) {
    for (const meshData of Object.values(data.meshes) as any[]) {
      for (const primitive of meshData.primitives) {
        const { attributes, indices } = primitive;
        if (!attributes) continue;
        // Process position
        processAndReplace("POSITION", 3, attributes);

        // Process normals
        if (attributes.POSITION) {
          // compute vertex normals
          const posArray = attributes.POSITION.array;
          const indexArray = indices ? indices.array : null;
          const computedNormals = computeVertexNormals(posArray, indexArray);
          attributes.NORMAL = { array: computedNormals, itemSize: 3 };
          addTransferable(computedNormals);
        }

        // Process UV
        processAndReplace("TEXCOORD_0", 2, attributes);

        // Process vertex colors
        const colorData = attributes.COLOR_0;
        if (colorData && colorData.array) {
          const itemSize = colorData.type === "VEC4" ? 4 : 3;
          processAndReplace("COLOR_0", itemSize, attributes);
        }

        // Process tangents
        processAndReplace("TANGENT", 4, attributes, decodeTangent);

        // Process Feature ID attributes (for EXT_mesh_features)
        for (const attrName in attributes) {
          if (attrName.startsWith("_FEATURE_ID_")) {
            processAndReplace(attrName, 1, attributes);
          }
        }

        // Process indices - ensure TypedArray
        if (indices && indices.array) {
          // Indices do not need conversion, keep original type
          primitive.indices = { array: indices.array };
          addTransferable(indices.array);
        }
      }
    }
  }

  return { data, transferables };
}
