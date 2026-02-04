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
    skipAttributeTransform: false,
  });
}

/**
 * Worker message handler
 */
self.onmessage = function (event: MessageEvent) {
  const { method, fetchOptions, loaderId, requestId, buffer, root } =
    event.data;

  if (method === "parseTile") {
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
            loaderId,
            requestId,
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
              loaderId,
              requestId,
              data: processedData,
            },
            transferables,
          );
        } catch (err: any) {
          self.postMessage({
            type: "error",
            loaderId,
            requestId,
            error: err.message || String(err),
          });
        }
      })
      .catch((error: any) => {
        self.postMessage({
          type: "error",
          loaderId,
          requestId,
          error: error.message || String(error),
        });
      });
  }
};

// Signal that worker is ready
self.postMessage({ type: "ready" });
