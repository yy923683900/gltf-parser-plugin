// 导入内联 Worker (Vite 会将 worker 代码编译打包成 base64 data URL)
import GLTFWorkerClass from "../worker/index?worker&inline";

// Worker 池管理
let sharedWorker: Worker | null = null;
let workerRefCount = 0;
let workerReadyPromise: Promise<void> | null = null;

/**
 * 获取共享 Worker 实例
 */
export function getSharedWorker(): Worker | null {
  return sharedWorker;
}

/**
 * 获取 Worker 就绪 Promise
 */
export function getWorkerReadyPromise(): Promise<void> | null {
  return workerReadyPromise;
}

/**
 * 初始化共享 Worker
 */
export function initSharedWorker(): Promise<void> {
  workerRefCount++;

  if (!sharedWorker) {
    // 使用 Vite 内联 Worker，代码已被编译打包成 base64
    sharedWorker = new GLTFWorkerClass();
    workerReadyPromise = new Promise((resolve, reject) => {
      const onMessage = (event: MessageEvent) => {
        if (event.data.type === "ready") {
          sharedWorker?.removeEventListener("message", onMessage);
          resolve();
        } else if (event.data.type === "error" && !event.data.callback) {
          sharedWorker?.removeEventListener("message", onMessage);
          reject(new Error(event.data.error));
        }
      };
      sharedWorker!.addEventListener("message", onMessage);
    });
  }

  return workerReadyPromise!;
}

/**
 * 释放共享 Worker 引用
 */
export function releaseSharedWorker(): void {
  workerRefCount--;

  if (workerRefCount <= 0 && sharedWorker) {
    sharedWorker.terminate();
    sharedWorker = null;
    workerReadyPromise = null;
    workerRefCount = 0;
  }
}
