/// <reference lib="webworker" />

// Load gltf-loader, draco decoder and Three.js simultaneously
Promise.all([
  // @ts-ignore
  import("https://esm.sh/@maptalks/gltf-loader"),
  // @ts-ignore
  import("https://esm.sh/@maptalks/transcoders.draco"),
  // @ts-ignore
  import("https://esm.sh/three"),
])
  .then(([gltfModule, dracoModule, THREE]) => {
    const { GLTFLoader } = gltfModule;
    const { BufferGeometry, BufferAttribute } = THREE;

    function load(root: string, data: any, options: any) {
      const loader = new GLTFLoader(root, data, options);
      return loader.load({
        skipAttributeTransform: true,
      });
    }

    interface Quantization {
      quantizationBits: number;
      range?: number;
      minValues?: number[];
      octEncoded?: boolean;
    }

    interface AttributeData {
      array: Float32Array | Uint16Array | Uint8Array | Int16Array | Int8Array;
      quantization?: Quantization;
      itemSize: number;
      type?: string;
    }

    // Function to dequantize Draco quantized data
    function dequantizeAttribute(
      attrData: AttributeData,
      itemSize: number,
    ):
      | Float32Array
      | (Float32Array | Uint16Array | Uint8Array | Int16Array | Int8Array) {
      const { array, quantization: quant } = attrData;

      if (!quant) return array;

      const count = array.length / itemSize;
      const result = new Float32Array(array.length);
      const maxQuantizedValue = (1 << quant.quantizationBits) - 1;

      // Dequantize using range and minValues
      if (quant.range !== undefined && quant.minValues) {
        for (let i = 0; i < count; i++) {
          for (let j = 0; j < itemSize; j++) {
            const idx = i * itemSize + j;
            result[idx] =
              (array[idx] / maxQuantizedValue) * quant.range +
              quant.minValues[j];
          }
        }
      } else {
        // Simple normalization
        for (let i = 0; i < array.length; i++) {
          result[i] = array[i] / maxQuantizedValue;
        }
      }

      return result;
    }

    // Oct-encoded normals decoding function
    function decodeOctEncodedNormals(
      attrData: AttributeData,
    ):
      | Float32Array
      | (Float32Array | Uint16Array | Uint8Array | Int16Array | Int8Array) {
      const { array, quantization: quant } = attrData;

      // If no octEncoded or already Float32Array and itemSize is 3
      if (!quant) {
        return array instanceof Float32Array
          ? array
          : dequantizeAttribute(attrData, 3);
      }

      const maxQuantizedValue = (1 << quant.quantizationBits) - 1;
      const count = array.length / 2; // oct-encoded has 2 components
      const result = new Float32Array(count * 3);

      for (let i = 0; i < count; i++) {
        // Convert quantized values to [-1, 1] range
        let x = (array[i * 2] / maxQuantizedValue) * 2 - 1;
        let y = (array[i * 2 + 1] / maxQuantizedValue) * 2 - 1;

        // Oct decoding
        let z = 1 - Math.abs(x) - Math.abs(y);

        if (z < 0) {
          const oldX = x;
          x = (1 - Math.abs(y)) * (x >= 0 ? 1 : -1);
          y = (1 - Math.abs(oldX)) * (y >= 0 ? 1 : -1);
        }

        // Normalize
        const len = Math.sqrt(x * x + y * y + z * z);
        result[i * 3] = x / len;
        result[i * 3 + 1] = y / len;
        result[i * 3 + 2] = z / len;
      }

      return result;
    }

    // Compute vertex normals using Three.js
    function computeVertexNormals(
      posArray: Float32Array | any,
      indexArray: Uint16Array | Uint32Array | any,
    ) {
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new BufferAttribute(posArray, 3));
      if (indexArray) {
        geometry.setIndex(new BufferAttribute(indexArray, 1));
      }
      geometry.computeVertexNormals();
      return geometry.getAttribute("normal").array as Float32Array;
    }

    // Process tangent data (may have oct-encoding)
    function decodeTangent(
      attrData: AttributeData,
    ):
      | Float32Array
      | (Float32Array | Uint16Array | Uint8Array | Int16Array | Int8Array) {
      const { array, quantization: quant } = attrData;

      if (!quant || !quant.octEncoded) {
        // Normal quantization or no quantization
        return quant ? dequantizeAttribute(attrData, 4) : array;
      }

      // Oct-encoded tangents require special handling
      const maxVal = (1 << quant.quantizationBits) - 1;
      const count = array.length / 3; // oct(2) + w(1)
      const result = new Float32Array(count * 4);

      for (let i = 0; i < count; i++) {
        // Decode oct-encoded xyz
        let x = (array[i * 3] / maxVal) * 2 - 1;
        let y = (array[i * 3 + 1] / maxVal) * 2 - 1;
        let z = 1 - Math.abs(x) - Math.abs(y);

        if (z < 0) {
          const oldX = x;
          x = (1 - Math.abs(y)) * (x >= 0 ? 1 : -1);
          y = (1 - Math.abs(oldX)) * (y >= 0 ? 1 : -1);
        }

        const len = Math.sqrt(x * x + y * y + z * z);
        result[i * 4] = x / len;
        result[i * 4 + 1] = y / len;
        result[i * 4 + 2] = z / len;
        // w component: 1 or -1
        result[i * 4 + 3] = array[i * 3 + 2] > maxVal / 2 ? 1 : -1;
      }

      return result;
    }

    // Dequantize and decode vertex attributes in GLTF data
    function processGLTFData(data: any) {
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
              const computedNormals = computeVertexNormals(
                posArray,
                indexArray,
              );
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

    self.onmessage = function (event: MessageEvent) {
      const { type, fetchOptions, callback, buffer, root } = event.data;

      if (type === "parseBuffer") {
        load(
          root || "",
          { buffer: buffer, byteOffset: 0 },
          {
            transferable: true,
            fetchOptions: fetchOptions || {},
            decoders: {
              draco: dracoModule.default(),
            },
          },
        )
          .then((data: any) => {
            if (data.message) {
              self.postMessage({
                type: "error",
                callback,
                error: data.message,
              });
              return;
            }

            // Complete dequantization and decoding in Worker
            try {
              const { data: processedData, transferables } =
                processGLTFData(data);
              self.postMessage(
                {
                  type: "success",
                  callback,
                  data: processedData,
                },
                transferables,
              );
            } catch (err: any) {
              self.postMessage({
                type: "error",
                callback,
                error: err.message || String(err),
              });
            }
          })
          .catch((error: any) => {
            self.postMessage({
              type: "error",
              callback,
              error: error.message || String(error),
            });
          });
      }
    };

    self.postMessage({ type: "ready" });
  })
  .catch((error) => {
    self.postMessage({
      type: "error",
      error: "Failed to load: " + error.message,
    });
  });
