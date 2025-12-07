// Crypto polyfill for React Native/Expo environment
// This provides the Node.js crypto API using expo-crypto and other alternatives

// Use expo-crypto for hashing functions
import * as ExpoCrypto from 'expo-crypto';

// Import TextEncoder/TextDecoder for string/byte conversions
// These may not be available in older React Native environments
let TextEncoder, TextDecoder;
// For React Native/Expo environments, try to import from 'text-encoding'
try {
  // If available, use expo's TextEncoder/TextDecoder polyfill
  const { TextEncoder: ExpoTextEncoder, TextDecoder: ExpoTextDecoder } = require('@zxing/text-encoding');
  TextEncoder = ExpoTextEncoder;
  TextDecoder = ExpoTextDecoder;
} catch (e) {
  // Fallback: try to use built-in if available in global environment
  if (typeof global !== 'undefined' && typeof global.TextEncoder !== 'undefined') {
    TextEncoder = global.TextEncoder;
    TextDecoder = global.TextDecoder;
  } else if (typeof window !== 'undefined' && typeof window.TextEncoder !== 'undefined') {
    TextEncoder = window.TextEncoder;
    TextDecoder = window.TextDecoder;
  } else {
    // As a last resort, define basic implementations
    TextEncoder = class { encode(str) { return new Uint8Array(str.split('').map(c => c.charCodeAt(0))); } };
    TextDecoder = class { decode(uint8array) { return String.fromCharCode.apply(null, uint8array); } };
  }
}

// Import a JS implementation for RIPEMD160 if needed
// For now, implement a basic createHash-compatible function
class Hash {
  constructor(algorithm) {
    this.algorithm = algorithm.toLowerCase();
    this.data = [];
  }

  update(data, inputEncoding) {
    if (typeof data === 'string') {
      // Convert string to Uint8Array
      if (inputEncoding === 'hex') {
        // Convert hex string to bytes
        data = new Uint8Array(data.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
      } else {
        // Default to utf8
        data = new TextEncoder().encode(data);
      }
    } else if (ArrayBuffer.isView(data)) {
      // If it's already a typed array, convert to Uint8Array
      data = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    }
    this.data.push(data);
    return this;
  }

  digest(encoding) {
    // Combine all data segments
    const combinedData = combineArrays(this.data);
    let hash;

    if (this.algorithm === 'sha256') {
      // Use expo-crypto for sha256
      hash = ExpoCrypto.sha256(combinedData);
    } else if (this.algorithm === 'ripemd160') {
      // For ripemd160, we'll need to implement or import a JS version
      // Using crypto-js as a fallback
      hash = this._ripemd160(combinedData);
    } else if (this.algorithm === 'md5') {
      // For MD5, we'll need to implement or import
      hash = this._md5(combinedData);
    } else {
      throw new Error(`Algorithm ${this.algorithm} not supported`);
    }

    if (encoding === 'hex') {
      return arrayToHex(hash);
    } else if (encoding === 'binary') {
      return new TextDecoder().decode(hash);
    } else {
      // Return as Uint8Array (buffer-like)
      return hash;
    }
  }

  _ripemd160(data) {
    // Import react-native-crypto-js if available
    try {
      const CryptoJS = require('react-native-crypto-js');
      const wordArray = CryptoJS.lib.WordArray.create(data);
      const hash = CryptoJS.RIPEMD160(wordArray);
      return hexToBytes(hash.toString());
    } catch (e) {
      // Fallback: implement a basic RIPEMD160 or throw an error
      throw new Error('RIPEMD160 not available in this environment');
    }
  }

  _md5(data) {
    // Import react-native-crypto-js for MD5
    try {
      const CryptoJS = require('react-native-crypto-js');
      const wordArray = CryptoJS.lib.WordArray.create(data);
      const hash = CryptoJS.MD5(wordArray);
      return hexToBytes(hash.toString());
    } catch (e) {
      throw new Error('MD5 not available in this environment');
    }
  }
}

function combineArrays(arrays) {
  if (arrays.length === 0) return new Uint8Array(0);
  if (arrays.length === 1) return arrays[0];

  let totalLength = 0;
  for (let i = 0; i < arrays.length; i++) {
    totalLength += arrays[i].length;
  }

  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (let i = 0; i < arrays.length; i++) {
    result.set(arrays[i], offset);
    offset += arrays[i].length;
  }

  return result;
}

function arrayToHex(array) {
  return Array.from(array)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex) {
  const bytes = [];
  for (let c = 0; c < hex.length; c += 2) {
    bytes.push(parseInt(hex.substr(c, 2), 16));
  }
  return new Uint8Array(bytes);
}

// Create a crypto API that mimics Node.js crypto module
export default {
  createHash: (algorithm) => {
    return new Hash(algorithm);
  },

  createCipheriv: (_algorithm, _key, _iv, _options) => {
    // Import from react-native-crypto-js for encryption
    try {
      const _CryptoJS = require('react-native-crypto-js');
      return {
        update: (_data) => {
          // Implementation for cipher update
          throw new Error('createCipheriv implementation incomplete');
        },
        final: () => {
          throw new Error('createCipheriv implementation incomplete');
        },
        setAutoPadding: () => {
          // No-op for now
        }
      };
    } catch (e) {
      throw new Error('createCipheriv not available in this environment');
    }
  },

  createDecipheriv: (_algorithm, _key, _iv, _options) => {
    // Import from react-native-crypto-js for decryption
    try {
      const _CryptoJS = require('react-native-crypto-js');
      return {
        update: (_data) => {
          // Implementation for decipher update
          throw new Error('createDecipheriv implementation incomplete');
        },
        final: () => {
          throw new Error('createDecipheriv implementation incomplete');
        },
        setAutoPadding: () => {
          // No-op for now
        }
      };
    } catch (e) {
      throw new Error('createDecipheriv not available in this environment');
    }
  },

  randomBytes: (size) => {
    // Use expo-crypto for random bytes
    try {
      // expo-crypto doesn't have randomBytes, use getRandomBytes
      const bytes = ExpoCrypto.getRandomValues(new Uint8Array(size));
      return bytes;
    } catch (e) {
      // Fallback to Math.random if expo-crypto is not available
      const bytes = new Uint8Array(size);
      for (let i = 0; i < size; i++) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
      return bytes;
    }
  },
};