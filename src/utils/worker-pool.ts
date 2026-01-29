// Import inline Worker (Vite will compile and bundle the worker code into a base64 data URL)
import GLTFWorkerClass from "../worker/index?worker&inline";

// Worker pool management
let workerPool: Worker[] = [];
let maxWorkers = 1;
let currentWorkerIndex = 0;

/**
 * Set the maximum number of Workers (must be called before initialization)
 */
export function setMaxWorkers(count: number): void {
  maxWorkers = Math.max(1, Math.min(count, navigator.hardwareConcurrency || 4));
}

/**
 * Create a single Worker and wait for it to be ready
 */
function createWorker(): Worker {
  return new GLTFWorkerClass();
}

/**
 * Initialize the Worker pool
 */
function initWorkerPool() {
  if (workerPool.length === 0) {
    // Create all Workers
    for (let i = 0; i < maxWorkers; i++) {
      workerPool.push(createWorker());
    }
  }
}

export function getWorkers(): Worker[] {
  initWorkerPool();
  return workerPool;
}

/**
 * Acquire a Worker (wait if none are available)
 */
export function acquireWorker() {
  initWorkerPool();

  const worker = workerPool[currentWorkerIndex];
  currentWorkerIndex = (currentWorkerIndex + 1) % workerPool.length;
  return worker;
}
