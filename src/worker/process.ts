
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

  // Helper to process attribute: ensure structure and mark as transferable
  const processAttribute = (
    key: string,
    itemSize: number,
    attributes: Record<string, any>,
  ) => {
    const attr = attributes[key];
    if (!attr?.array) return null;

    // Update attribute structure and add to transferables
    attributes[key] = { array: attr.array, itemSize };
    addTransferable(attr.array);

    return attr.array;
  };

  if (data.meshes) {
    for (const meshData of Object.values(data.meshes) as any[]) {
      for (const primitive of meshData.primitives) {
        const { attributes } = primitive;
        if (!attributes) continue;

        // Process position
        processAttribute("POSITION", 3, attributes);

        // Process normals
        processAttribute("NORMAL", 3, attributes);

        // Process UV
        processAttribute("TEXCOORD_0", 2, attributes);

        // Process vertex colors
        const colorData = attributes.COLOR_0;
        if (colorData && colorData.array) {
          const itemSize = colorData.type === "VEC4" ? 4 : 3;
          processAttribute("COLOR_0", itemSize, attributes);
        }

        // Process tangents
        processAttribute("TANGENT", 4, attributes);

        // Process Feature ID attributes (for EXT_mesh_features)
        for (const attrName in attributes) {
          if (attrName.startsWith("_FEATURE_ID_")) {
            processAttribute(attrName, 1, attributes);
          }
        }
      }
    }
  }

  return { data, transferables };
}
