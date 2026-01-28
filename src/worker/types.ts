/**
 * Quantization parameters for Draco compressed data
 */
export interface Quantization {
  quantizationBits: number;
  range?: number;
  minValues?: number[];
  octEncoded?: boolean;
}

/**
 * Attribute data structure with optional quantization info
 */
export interface AttributeData {
  array: Float32Array | Uint16Array | Uint8Array | Int16Array | Int8Array;
  quantization?: Quantization;
  itemSize: number;
  type?: string;
}

/**
 * Type for array types used in attribute data
 */
export type AttributeArray =
  | Float32Array
  | Uint16Array
  | Uint8Array
  | Int16Array
  | Int8Array;
