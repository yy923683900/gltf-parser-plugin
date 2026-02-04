import { computeVertexNormals } from "./normals";

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

  if (data.meshes) {
    for (const meshData of Object.values(data.meshes) as any[]) {
      for (const primitive of meshData.primitives) {
        const { attributes, indices } = primitive;
        if (!attributes) continue;

        // Compute vertex normals
        if (attributes.POSITION) {
          const posArray = attributes.POSITION.array;
          const indexArray = indices?.array ?? null;
          const computedNormals = computeVertexNormals(posArray, indexArray);
          attributes.NORMAL = { array: computedNormals, itemSize: 3 };
          addTransferable(computedNormals);
        }

        // Process vertex colors (itemSize needed: VEC4 = 4, VEC3 = 3)
        if (attributes.COLOR_0?.array) {
          attributes.COLOR_0.itemSize =
            attributes.COLOR_0.type === "VEC4" ? 4 : 3;
          addTransferable(attributes.COLOR_0.array);
        }
      }
    }
  }

  return { data, transferables };
}
