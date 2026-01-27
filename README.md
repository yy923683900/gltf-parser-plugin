# GLTF Parser Plugin

A high-performance GLTF/GLB loader plugin for `3d-tiles-renderer` that offloads parsing to Web Workers.

## Features

- **Web Worker Parsing**: Moves GLTF/GLB parsing and Draco decompression to a background thread to maintain high frame rates and UI responsiveness.
- **Metadata Support**: Full support for `EXT_mesh_features` and `EXT_structural_metadata` extensions, mapping metadata to Three.js objects.
- **Efficient Resource Management**: Uses a shared worker pool with reference counting to manage resources efficiently.
- **Draco Compression**: Built-in support for Draco-compressed meshes.

## Installation

```bash
npm install gltf-parser-plugin
```

## Usage

Register the plugin with your `3d-tiles-renderer` instance:

```typescript
import { TilesRenderer } from "3d-tiles-renderer";
import { GLTFParserPlugin } from "gltf-parser-plugin";

const tilesRenderer = new TilesRenderer("path/to/tileset.json");

// Register the plugin
tilesRenderer.registerPlugin(
  new GLTFParserPlugin({
    metadata: true, // Enable metadata parsing (default: true)
  }),
);
```

## Options

### `GLTFParserPluginOptions`

| Option     | Type      | Default | Description                                                                    |
| ---------- | --------- | ------- | ------------------------------------------------------------------------------ |
| `metadata` | `boolean` | `true`  | Whether to parse `EXT_mesh_features` and `EXT_structural_metadata` extensions. |

## Requirements

- `three`: >= 0.150.0
- `3d-tiles-renderer`: Compatible version
