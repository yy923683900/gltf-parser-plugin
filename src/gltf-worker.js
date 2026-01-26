// 同时加载 gltf-loader、draco 解码器和 Three.js
Promise.all([
  // import("https://esm.sh/@maptalks/gltf-loader"),
  import("http:127.0.0.1:9100/dist/gltf-loader.es.js"),
  import("https://esm.sh/@maptalks/transcoders.draco"),
  import("https://esm.sh/three"),
])
  .then(([gltfModule, dracoModule, THREE]) => {
    const { GLTFLoader } = gltfModule;
    const { BufferGeometry, BufferAttribute } = THREE;

    // debugger

    function load(root, data, options) {
      const loader = new GLTFLoader(root, data, options);
      return loader.load({
        skipAttributeTransform: true,
      });
    }

    // Draco 量化数据反量化函数
    function dequantizeAttribute(attrData, itemSize) {
      const array = attrData.array;
      const quant = attrData.quantization;

      if (!quant) {
        return array;
      }

      const count = array.length / itemSize;
      const result = new Float32Array(array.length);
      const maxQuantizedValue = (1 << quant.quantizationBits) - 1;

      // 使用 range 和 minValues 进行反量化
      if (quant.range !== undefined && quant.minValues) {
        for (let i = 0; i < count; i++) {
          for (let j = 0; j < itemSize; j++) {
            const idx = i * itemSize + j;
            const normalized = array[idx] / maxQuantizedValue;
            result[idx] = normalized * quant.range + quant.minValues[j];
          }
        }
      } else {
        // 简单归一化
        for (let i = 0; i < array.length; i++) {
          result[i] = array[i] / maxQuantizedValue;
        }
      }

      return result;
    }

    // Oct-encoded 法线解码函数
    function decodeOctEncodedNormals(attrData) {
      const array = attrData.array;
      const quant = attrData.quantization;

      // 如果没有 octEncoded 或已经是 Float32Array 且 itemSize 为 3
      if (!quant) {
        if (array instanceof Float32Array) {
          return array;
        }
        // 普通量化的法线
        return dequantizeAttribute(attrData, 3);
      }

      const maxQuantizedValue = (1 << quant.quantizationBits) - 1;
      const count = array.length / 2; // oct-encoded 是 2 分量
      const result = new Float32Array(count * 3);

      for (let i = 0; i < count; i++) {
        // 将量化值转换为 [-1, 1] 范围
        let x = (array[i * 2] / maxQuantizedValue) * 2 - 1;
        let y = (array[i * 2 + 1] / maxQuantizedValue) * 2 - 1;

        // Oct 解码
        let z = 1 - Math.abs(x) - Math.abs(y);

        if (z < 0) {
          const oldX = x;
          x = (1 - Math.abs(y)) * (x >= 0 ? 1 : -1);
          y = (1 - Math.abs(oldX)) * (y >= 0 ? 1 : -1);
        }

        // 归一化
        const len = Math.sqrt(x * x + y * y + z * z);
        result[i * 3] = x / len;
        result[i * 3 + 1] = y / len;
        result[i * 3 + 2] = z / len;
      }

      return result;
    }

    // 使用 Three.js 计算顶点法线
    function computeVertexNormals(posArray, indexArray) {
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new BufferAttribute(posArray, 3));
      if (indexArray) {
        geometry.setIndex(new BufferAttribute(indexArray, 1));
      }
      geometry.computeVertexNormals();
      return geometry.getAttribute("normal").array;
    }

    // 处理切线数据（可能有 oct-encoding）
    function decodeTangent(attrData) {
      const array = attrData.array;
      const quant = attrData.quantization;

      if (!quant || !quant.octEncoded) {
        // 普通量化或无量化
        return quant ? dequantizeAttribute(attrData, 4) : array;
      }

      // Oct-encoded 切线需要特殊处理
      const maxVal = (1 << quant.quantizationBits) - 1;
      const count = array.length / 3; // oct(2) + w(1)
      const result = new Float32Array(count * 4);

      for (let i = 0; i < count; i++) {
        // 解码 oct-encoded xyz
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
        // w 分量：1 或 -1
        result[i * 4 + 3] = array[i * 3 + 2] > maxVal / 2 ? 1 : -1;
      }

      return result;
    }

    // 对 GLTF 数据中的顶点属性进行反量化和解码
    function processGLTFData(data) {
      const transferables = [];

      if (data.meshes) {
        for (const meshIndex in data.meshes) {
          const meshData = data.meshes[meshIndex];
          const primitives = meshData.primitives;

          for (const primitive of primitives) {
            if (primitive.attributes) {
              // 处理位置
              const posData = primitive.attributes.POSITION;
              if (posData && posData.array) {
                const processed = posData.quantization
                  ? dequantizeAttribute(posData, 3)
                  : posData.array;
                primitive.attributes.POSITION = {
                  array: processed,
                  itemSize: 3,
                };
                transferables.push(processed.buffer);
              }

              // 处理法线
              const normalData = primitive.attributes.NORMAL;
              if (normalData && normalData.array) {
                const processed = decodeOctEncodedNormals(normalData);
                primitive.attributes.NORMAL = { array: processed, itemSize: 3 };
                transferables.push(processed.buffer);
              } else if (primitive.attributes.POSITION) {
                // 如果没有法线数据，计算顶点法线
                const posArray = primitive.attributes.POSITION.array;
                const indexArray = primitive.indices
                  ? primitive.indices.array
                  : null;
                const computedNormals = computeVertexNormals(
                  posArray,
                  indexArray
                );
                primitive.attributes.NORMAL = {
                  array: computedNormals,
                  itemSize: 3,
                };
                transferables.push(computedNormals.buffer);
              }

              // 处理 UV
              const uvData = primitive.attributes.TEXCOORD_0;
              if (uvData && uvData.array) {
                const processed = uvData.quantization
                  ? dequantizeAttribute(uvData, 2)
                  : uvData.array;
                primitive.attributes.TEXCOORD_0 = {
                  array: processed,
                  itemSize: 2,
                };
                transferables.push(processed.buffer);
              }

              // 处理顶点颜色
              const colorData = primitive.attributes.COLOR_0;
              if (colorData && colorData.array) {
                const itemSize = colorData.type === "VEC4" ? 4 : 3;
                const processed = colorData.quantization
                  ? dequantizeAttribute(colorData, itemSize)
                  : colorData.array;
                primitive.attributes.COLOR_0 = { array: processed, itemSize };
                transferables.push(processed.buffer);
              }

              // 处理切线
              const tangentData = primitive.attributes.TANGENT;
              if (tangentData && tangentData.array) {
                const processed = decodeTangent(tangentData);
                primitive.attributes.TANGENT = {
                  array: processed,
                  itemSize: 4,
                };
                transferables.push(processed.buffer);
              }

              // 处理 Feature ID 属性 (用于 EXT_mesh_features)
              for (const attrName in primitive.attributes) {
                if (attrName.startsWith("_FEATURE_ID_")) {
                  const featureIdData = primitive.attributes[attrName];
                  if (featureIdData && featureIdData.array) {
                    const processed = featureIdData.quantization
                      ? dequantizeAttribute(featureIdData, 1)
                      : featureIdData.array;
                    primitive.attributes[attrName] = {
                      array: processed,
                      itemSize: 1,
                    };
                    if (
                      processed.buffer &&
                      !transferables.includes(processed.buffer)
                    ) {
                      transferables.push(processed.buffer);
                    }
                  }
                }
              }
            }

            // 处理索引 - 确保是 TypedArray
            const indexData = primitive.indices;
            if (indexData && indexData.array) {
              // 索引不需要转换，保持原类型
              primitive.indices = { array: indexData.array };
              if (indexData.array.buffer) {
                transferables.push(indexData.array.buffer);
              }
            }

            // 保留 primitive 的 extensions 用于 metadata 处理
            // extensions 数据已经在 primitive 中，无需特殊处理
          }
        }
      }

      // 处理纹理数据
      if (data.textures) {
        for (const textureData of data.textures) {
          if (
            textureData.image &&
            textureData.image.array &&
            textureData.image.array.buffer
          ) {
            transferables.push(textureData.image.array.buffer);
          }
        }
      }

      // 处理 structuralMetadata 的 buffers
      if (data.structuralMetadata && data.structuralMetadata.buffers) {
        for (const buf of data.structuralMetadata.buffers) {
          if (buf && !transferables.includes(buf)) {
            transferables.push(buf);
          }
        }
      }

      data.transferables = [];

      return { data, transferables };
    }

    self.onmessage = function (event) {
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
          }
        )
          .then((data) => {
            if (data.message) {
              self.postMessage({
                type: "error",
                callback,
                error: data.message,
              });
              return;
            }

            // 在 Worker 中完成反量化和解码
            const { data: processedData, transferables } =
              processGLTFData(data);

            self.postMessage(
              {
                type: "success",
                callback,
                data: processedData,
              },
              transferables
            );
          })
          .catch((error) => {
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
