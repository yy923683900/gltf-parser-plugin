# GLTF Parser Plugin

专为 `3d-tiles-renderer` 设计的高性能 GLTF/GLB 加载器插件，使用 Web Workers 进行异步解析。

## 功能特性

- **Web Worker 解析**: 将 GLTF/GLB 解析和 Draco 解码操作移至后台线程，确保主线程流畅，避免掉帧。
- **元数据支持**: 完整支持 `EXT_mesh_features` 和 `EXT_structural_metadata` 扩展，将元数据映射到 Three.js 对象中。
- **高效资源管理**: 使用带有引用计数的共享 Worker 池来高效管理资源。
- **Draco 压缩**: 内置支持 Draco 压缩的网格模型。

## 安装

```bash
npm install gltf-parser-plugin
```

## 使用方法

在 `3d-tiles-renderer` 实例中注册插件：

```typescript
import { TilesRenderer } from '3d-tiles-renderer';
import { GLTFParserPlugin } from 'gltf-parser-plugin';

const tilesRenderer = new TilesRenderer('path/to/tileset.json');

// 注册插件
tilesRenderer.registerPlugin(new GLTFParserPlugin({
    metadata: true // 启用元数据解析 (默认: true)
}));
```

## 配置选项

### `GLTFParserPluginOptions`

| 选项 | 类型 | 默认值 | 描述 |
|--------|------|---------|-------------|
| `metadata` | `boolean` | `true` | 是否解析 `EXT_mesh_features` 和 `EXT_structural_metadata` 扩展。 |

## 环境要求

- `three`: >= 0.150.0
- `3d-tiles-renderer`: 兼容版本
