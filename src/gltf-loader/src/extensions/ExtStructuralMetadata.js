// EXT_structural_metadata extension
// https://github.com/CesiumGS/glTF/tree/3d-tiles-next/extensions/2.0/Vendor/EXT_structural_metadata

export const EXT_STRUCTURAL_METADATA = 'EXT_structural_metadata';

/**
 * 从 gltf 中提取 EXT_structural_metadata 扩展数据
 * 返回构造插件所需的数据结构
 *
 * @param {Object} gltf - 原始 gltf json
 * @param {Array} buffers - 属性表数据的 ArrayBuffer 数组（按 bufferView 索引）
 * @returns {Object|null} 扩展数据，包含 schema、propertyTables、buffers
 */
export function getStructuralMetadataData(gltf, buffers) {
    const extensions = gltf.extensions;
    if (!extensions || !extensions[EXT_STRUCTURAL_METADATA]) {
        return null;
    }

    const ext = extensions[EXT_STRUCTURAL_METADATA];
    return {
        schema: ext.schema,
        propertyTables: ext.propertyTables || [],
        buffers: buffers
    };
}

/**
 * 收集 propertyTables 需要加载的 bufferView 索引
 *
 * @param {Array} propertyTables - 属性表定义数组
 * @returns {Set} 需要加载的 bufferView 索引集合
 */
export function collectPropertyTableBufferViews(propertyTables) {
    const bufferViewsToLoad = new Set();

    propertyTables.forEach(table => {
        const props = table.properties || {};
        for (const name in props) {
            const prop = props[name];
            if (prop.values !== undefined) bufferViewsToLoad.add(prop.values);
            if (prop.arrayOffsets !== undefined) bufferViewsToLoad.add(prop.arrayOffsets);
            if (prop.stringOffsets !== undefined) bufferViewsToLoad.add(prop.stringOffsets);
        }
    });

    return bufferViewsToLoad;
}
