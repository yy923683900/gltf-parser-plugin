import { MeshFeatures } from './metadata/classes/MeshFeatures.js';

// https://github.com/CesiumGS/glTF/tree/3d-tiles-next/extensions/2.0/Vendor/EXT_mesh_features

const EXT_NAME = 'EXT_mesh_features';

function forEachPrimitiveExtension( scene, parser, callback ) {

	scene.traverse( c => {

		if ( parser.associations.has( c ) ) {

			// check if this object has extension references
			const { meshes, primitives } = parser.associations.get( c );

			const primitive = parser.json.meshes[ meshes ]?.primitives[ primitives ];

			if ( primitive && primitive.extensions && primitive.extensions[ EXT_NAME ] ) {

				callback( c, primitive.extensions[ EXT_NAME ] );

			}

		}

	} );

}

export class GLTFMeshFeaturesExtension {

	constructor( parser ) {

		this.parser = parser;
		this.name = EXT_NAME;

	}

	async afterRoot( { scene, parser } ) {

		// skip if the extension is not present
		const extensionsUsed = parser.json.extensionsUsed;
		if ( ! extensionsUsed || ! extensionsUsed.includes( EXT_NAME ) ) {

			return;

		}

		// get fetch the relevant textures are loaded
		const textureCount = parser.json.textures?.length || 0;
		const promises = new Array( textureCount ).fill( null );
		forEachPrimitiveExtension( scene, parser, ( child, { featureIds } ) => {

			featureIds.forEach( info => {

				if ( info.texture && promises[ info.texture.index ] === null ) {

					const index = info.texture.index;
					promises[ index ] = parser.loadTexture( index );

				}

			} );

		} );

		// initialize mesh features on each primitive
		const textures = await Promise.all( promises );
		forEachPrimitiveExtension( scene, parser, ( child, extension ) => {

			child.userData.meshFeatures = new MeshFeatures( child.geometry, textures, extension );

		} );

	}

}

// 原始形式是什么样
// 获得一个什么
//

// feature id 存储在
// feature查询
// feature id关联属性表，查询数据

// 延迟加载：afterRoot 钩子中处理，确保场景已构建
// 纹理预加载：收集所有需要的纹理索引，统一加载
// 数据挂载：将 MeshFeatures 实例挂到 userData.meshFeatures，便于访问
// 关联映射：通过 parser.associations 建立 JSON 数据与 Three.js 对象的映射

// MeshFeatures 类的功能
// getFeatures(triangle, barycoord)：同步获取feature id
// getFeaturesAsync(triangle, barycoord)：异步获取feature id （纹理读取）
// getFeatureInfo()：获取feature info
// getTextures()：获取纹理列表
