## 📋 更新日志

### v1.0.0

Three.js mesh处理工具库，专门用于处理3D Tiles模型的单体化和基于shader的隐藏功能。

## 功能特性

### 1. 基于Shader的Mesh隐藏功能

通过自定义shader根据OID数组隐藏原始mesh的指定部分，性能优于几何体重构方式。

#### 主要函数

- `hideOriginalMeshByOids()` - 根据OID数组隐藏mesh的对应部分
- `restoreOidsByArray()` - 根据OID数组恢复被隐藏的特定部分
- `restoreOriginalMaterials()` - 恢复所有mesh的原始材质
- `updateHiddenOids()` - 动态更新隐藏的OID列表

#### 基本使用示例

```typescript
import { 
  hideOriginalMeshByOids, 
  restoreOidsByArray, 
  restoreOriginalMaterials 
} from 'mesh-helper';

// 1. 隐藏指定OID的物件
const hiddenCount = hideOriginalMeshByOids({
  oids: [1001, 1002, 1003], // 要隐藏的OID数组
  scene: scene,             // Three.js场景对象
  maxOids: 50,             // 最大支持的OID数量（可选）
  debug: true              // 是否启用调试模式（可选）
});

// 2. 恢复指定OID的物件（部分恢复）
const restoredCount = restoreOidsByArray({
  oids: [1001, 1002],      // 要恢复的OID数组
  scene: scene,            // Three.js场景对象
  debug: true              // 是否启用调试模式（可选）
});

// 3. 恢复所有原始材质（完全恢复）
const allRestoredCount = restoreOriginalMaterials(scene, { debug: true });
```

#### 高级使用示例

```typescript
import { 
  hideOriginalMeshByOids,
  restoreOidsByArray,
  getMeshHiddenOids,
  getAllShaderedMeshInfo,
  updateHiddenOids
} from 'mesh-helper';

// 分步隐藏物件
hideOriginalMeshByOids({ oids: [1001, 1002, 1003], scene });
hideOriginalMeshByOids({ oids: [2001, 2002], scene });

// 查看所有应用了shader的mesh信息
const shaderedInfo = getAllShaderedMeshInfo();
shaderedInfo.forEach(({ mesh, hiddenOids }) => {
});

// 部分恢复：只恢复特定OID
restoreOidsByArray({ oids: [1001, 2001], scene, debug: true });

// 动态更新隐藏列表
updateHiddenOids(scene, [1002, 1003, 2002]);

// 查看特定mesh的隐藏OID
scene.traverse(mesh => {
  if (mesh.type === 'Mesh') {
    const hiddenOids = getMeshHiddenOids(mesh);
    if (hiddenOids.length > 0) {
    }
  }
});
```

#### Shader原理

1. **顶点着色器**：读取每个顶点的`_feature_id_0`属性，传递给片段着色器
2. **片段着色器**：
   - 根据featureId查找对应的OID
   - 检查OID是否在隐藏列表中
   - 如果在列表中，使用`discard`丢弃该片段
   - 否则正常渲染

3. **Uniforms数组**：将OID数组转换为固定长度的uniform数组传递给shader

#### 智能恢复机制

`restoreOidsByArray()` 函数提供了智能的部分恢复功能：

- **部分恢复**：如果mesh还有其他隐藏的OID，只更新shader的uniform数组
- **完全恢复**：如果没有其他隐藏的OID，直接恢复原始材质
- **性能优化**：避免不必要的shader重建，动态更新uniform即可

### 2. Mesh单体化功能

提供mesh拆分和管理功能，从existing mesh.ts模块继承。

- `getMeshesByOid()` - 根据OID获取单体mesh
- `splitMeshByFeatureId()` - 按feature ID拆分mesh
- `getAllIndividualMeshes()` - 获取所有单体mesh

### 3. 交集计算功能

从existing intersection.ts模块提供相交检测功能。

## 技术要求

- Three.js (建议版本 >= 0.150.0)
- 支持WebGL的浏览器环境
- Mesh必须包含`meshFeatures`和`structuralMetadata`用户数据
- Geometry必须包含`_feature_id_0`属性

## 注意事项

1. **Performance**: Shader方式比几何体重构性能更好，适合实时隐藏/显示场景
2. **兼容性**: 需要支持自定义shader的WebGL环境
3. **内存管理**: 自动管理原始材质的保存和恢复，避免内存泄漏
4. **最大OID限制**: 默认支持50个OID，可根据GPU能力调整

## API参考

### 核心接口

#### HideMeshOptions

```typescript
interface HideMeshOptions {
  oids: (string | number)[];  // 要隐藏的OID数组
  scene: any;                 // Three.js场景对象
  maxOids?: number;          // 最大支持的OID数量，默认50
  debug?: boolean;           // 是否启用调试模式，默认false
}
```

#### RestoreOidsOptions

```typescript
interface RestoreOidsOptions {
  oids: (string | number)[];  // 要恢复的OID数组
  scene: any;                 // Three.js场景对象
  debug?: boolean;           // 是否启用调试模式，默认false
}
```

### 主要函数

| 函数名 | 功能 | 返回值 |
|--------|------|--------|
| `hideOriginalMeshByOids()` | 隐藏指定OID的mesh部分 | 影响的mesh数量 |
| `restoreOidsByArray()` | 恢复指定OID的mesh部分 | 恢复的mesh数量 |
| `restoreOriginalMaterials()` | 恢复所有原始材质 | 恢复的mesh数量 |
| `getMeshHiddenOids()` | 获取mesh的隐藏OID列表 | OID数组 |
| `getAllShaderedMeshInfo()` | 获取所有shader mesh信息 | mesh信息数组 |
| `updateHiddenOids()` | 更新所有mesh的隐藏OID | 更新的mesh数量 |

### 返回值

所有主要函数都返回数字，表示操作影响的mesh数量，便于调试和性能监控。

## 使用场景

### 1. 建筑物单体隐藏/显示

```typescript
// 隐藏特定楼层
hideOriginalMeshByOids({ oids: [101, 102, 103], scene }); // 隐藏1-3层

// 只显示指定楼层
restoreOriginalMaterials(scene); // 先恢复所有
hideOriginalMeshByOids({ oids: [104, 105, 106, 107], scene }); // 隐藏4-7层
```

### 2. 设备管理

```typescript
// 隐藏所有管道设备
const pipeOids = [2001, 2002, 2003, 2004];
hideOriginalMeshByOids({ oids: pipeOids, scene });

// 显示部分管道进行检修
restoreOidsByArray({ oids: [2001, 2002], scene });
```

### 3. 动态展示

```typescript
// 循环展示不同区域
const areas = [[1001, 1002], [2001, 2002], [3001, 3002]];
let currentArea = 0;

setInterval(() => {
  restoreOriginalMaterials(scene);
  const otherAreas = areas.filter((_, i) => i !== currentArea).flat();
  hideOriginalMeshByOids({ oids: otherAreas, scene });
  currentArea = (currentArea + 1) % areas.length;
}, 3000);
```

## 开发说明

基于three.html中的`hideOriginalMeshFeature`函数逻辑实现，通过shader替代几何体重构以提升性能。

## 版本信息

当前版本: 1.0.0 