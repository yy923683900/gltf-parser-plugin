/// <reference lib="webworker" />

import { GLTFLoader } from "@maptalks/gltf-loader";
import dracoLoader from "@maptalks/transcoders.draco";
import { processGLTFData } from "./process";

/**
 * Load GLTF data using the loader
 */
function load(root: string, data: any, options: any) {
  const loader = new GLTFLoader(root, data, options);
  return loader.load({
    skipAttributeTransform: true,
  });
}

/**
 * Worker message handler
 */
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
          draco: dracoLoader(),
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
          const { data: processedData, transferables } = processGLTFData(data);
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

// Signal that worker is ready
self.postMessage({ type: "ready" });
