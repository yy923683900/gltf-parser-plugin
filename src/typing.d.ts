declare module "@maptalks/gltf-loader";
declare module "@maptalks/transcoders.draco";
declare module "3d-tiles-renderer/src/three/plugins/gltf/metadata/classes/StructuralMetadata.js";
declare module "3d-tiles-renderer/src/three/plugins/gltf/metadata/classes/MeshFeatures.js";

// Vite inline worker
declare module "*?worker&inline" {
  const workerConstructor: {
    new (): Worker;
  };
  export default workerConstructor;
}

declare module "*?worker" {
  const workerConstructor: {
    new (): Worker;
  };
  export default workerConstructor;
}
