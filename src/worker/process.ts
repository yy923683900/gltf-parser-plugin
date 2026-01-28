import type { AttributeData } from "./types";
import { dequantizeAttribute } from "./dequantize";
import { decodeOctEncodedNormals, computeVertexNormals } from "./normals";
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
  const transferables = new Set<ArrayBuffer>();
  const addTransferable = (arr: any) => {
    if (arr && arr.buffer) transferables.add(arr.buffer);
  };

  if (data.meshes) {
    for (const meshData of Object.values(data.meshes) as any[]) {
      for (const primitive of meshData.primitives) {
        const { attributes, indices } = primitive;
        if (!attributes) continue;

        // Helper to process and replace attribute
        const processAndReplace = (
          key: string,
          itemSize: number,
          decoder?: (attr: AttributeData) => any,
        ) => {
          const attr = attributes[key];
          if (attr && attr.array) {
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

        // Process position
        processAndReplace("POSITION", 3);

        // Process normals
        const normalProcessed = processAndReplace(
          "NORMAL",
          3,
          decodeOctEncodedNormals,
        );
        if (!normalProcessed && attributes.POSITION) {
          // If no normal data, compute vertex normals
          const posArray = attributes.POSITION.array;
          const indexArray = indices ? indices.array : null;
          const computedNormals = computeVertexNormals(posArray, indexArray);
          attributes.NORMAL = { array: computedNormals, itemSize: 3 };
          addTransferable(computedNormals);
        }

        // Process UV
        processAndReplace("TEXCOORD_0", 2);

        // Process vertex colors
        const colorData = attributes.COLOR_0;
        if (colorData && colorData.array) {
          const itemSize = colorData.type === "VEC4" ? 4 : 3;
          processAndReplace("COLOR_0", itemSize);
        }

        // Process tangents
        processAndReplace("TANGENT", 4, decodeTangent);

        // Process Feature ID attributes (for EXT_mesh_features)
        for (const attrName in attributes) {
          if (attrName.startsWith("_FEATURE_ID_")) {
            processAndReplace(attrName, 1);
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

  // Process texture data
  if (data.textures) {
    for (const textureData of data.textures) {
      if (textureData.image && textureData.image.array) {
        addTransferable(textureData.image.array);
      }
    }
  }

  // Process structuralMetadata buffers
  if (data.structuralMetadata && data.structuralMetadata.buffers) {
    for (const buf of data.structuralMetadata.buffers) {
      if (buf) transferables.add(buf);
    }
  }

  data.transferables = [];

  return { data, transferables: Array.from(transferables) };
}
