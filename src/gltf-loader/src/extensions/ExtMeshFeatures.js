// EXT_mesh_features extension
// https://github.com/CesiumGS/glTF/tree/3d-tiles-next/extensions/2.0/Vendor/EXT_mesh_features

export const EXT_MESH_FEATURES = 'EXT_mesh_features';

/**
 * 检查 primitive 是否包含 EXT_mesh_features 扩展数据
 * 扩展数据已经在 primitive.extensions 中，无需额外处理
 */
export function hasMeshFeaturesExtension(primJSON) {
    return primJSON.extensions && primJSON.extensions[EXT_MESH_FEATURES];
}
