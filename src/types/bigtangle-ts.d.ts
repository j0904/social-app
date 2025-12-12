declare module 'bigtangle-ts' {
  // Type definitions for bigtangle-ts module to prevent TypeScript errors
  // Based on usage in src/lib/bigtangle-wrapper.ts and src/lib/safe-bigtangle.ts
  //
  // NOTE: The bigtangle-ts library has known circular dependency issues at runtime.
  // Use dynamic imports (await import('bigtangle-ts')) to avoid initialization problems.
  // See src/lib/bigtangle-wrapper.ts for proper usage pattern.

  export class Address {
    constructor(...args: any[])
    static fromKey(params: any, key: ECKey): Address
    toString(): string
  }

  export class ECKey {
    constructor(...args: any[])
    static createNewKey(): ECKey
    static fromPrivate(privateKeyBytes: Uint8Array, compressed: boolean): ECKey
    toString(): string
    readonly privateKey: Uint8Array
  }

  export class EncryptedData {
    constructor(...args: any[])
  }

  export class KeyCrypterScrypt {
    constructor(...args: any[])
    deriveKey(password: string): any
    encrypt(data: string, key: any): string
    decrypt(encryptedData: string, key: any): string
  }

  export class TestParams {
    constructor(...args: any[])
  }

  export class TestNetParams {
    constructor(...args: any[])
    static get(): NetworkParameters
  }

  export class NetworkParameters {
    constructor(...args: any[])
  }

  export class Coin {
    constructor(...args: any[])
  }

  export class Utils {
    constructor(...args: any[])
    static HEX: any
  }

  const bigtangle: {
    Address: typeof Address
    ECKey: typeof ECKey
    EncryptedData: typeof EncryptedData
    KeyCrypterScrypt: typeof KeyCrypterScrypt
    TestParams: typeof TestParams
    TestNetParams: typeof TestNetParams
    NetworkParameters: typeof NetworkParameters
    Coin: typeof Coin
    Utils: typeof Utils
  }

  export default bigtangle
}
