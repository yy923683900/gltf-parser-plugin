// 导入内联 Worker (Vite 会将 worker 代码编译打包成 base64 data URL)
import GLTFWorkerClass from "../worker/index?worker&inline";

// Worker 池管理
let workerPool: Worker[] = [];
let maxWorkers = 1;
let currentWorkerIndex = 0;

/**
 * 设置最大 Worker 数量（必须在初始化之前调用）
 */
export function setMaxWorkers(count: number): void {
  maxWorkers = Math.max(1, Math.min(count, navigator.hardwareConcurrency || 4));
}

/**
 * 创建单个 Worker 并等待其就绪
 */
function createWorker(): Worker {
  return new GLTFWorkerClass();
}

/**
 * 初始化 Worker 池
 */
function initWorkerPool() {
  if (workerPool.length === 0) {
    // 创建所有 Worker
    for (let i = 0; i < maxWorkers; i++) {
      workerPool.push(createWorker());
    }
  }
}

/**
 * 获取一个 Worker（如果没有空闲的则等待）
 * @returns Promise 解析为可用的 Worker
 */
export function acquireWorker() {
  initWorkerPool();

  const worker = workerPool[currentWorkerIndex];
  currentWorkerIndex = (currentWorkerIndex + 1) % workerPool.length;
  return worker;
}
