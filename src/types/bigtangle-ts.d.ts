declare module 'bigtangle-ts' {
  // Type definitions for bigtangle-ts module to prevent TypeScript errors
  // Based on usage in src/screens/wallet/hdwallet.ts
  //
  // NOTE: The bigtangle-ts library has known circular dependency issues at runtime.
  // Importing from the main 'bigtangle-ts' index triggers circular dependencies
  // because it loads Block/TransactionOutput which depend on Coin.
  //
  // SOLUTION: Import from specific sub-modules instead:
  //   - bigtangle-ts/dist/net/bigtangle/core/ECKey.js
  //   - bigtangle-ts/dist/net/bigtangle/core/Address.js
  //   - bigtangle-ts/dist/net/bigtangle/params/TestParams.js
  //   - bigtangle-ts/dist/net/bigtangle/crypto/KeyCrypterScrypt.js

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
    static get(): NetworkParameters
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
    static HEX: {
      encode(data: Uint8Array): string
      decode(hex: string): Uint8Array
    }
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

// Sub-module declarations to support direct imports that avoid circular dependencies
declare module 'bigtangle-ts/dist/net/bigtangle/core/ECKey.js' {
  export class ECKey {
    constructor(...args: any[])
    static createNewKey(): ECKey
    static fromPrivate(privateKeyBytes: Uint8Array, compressed: boolean): ECKey
    toString(): string
    getPubKeyHash(): Uint8Array
    readonly privateKey: Uint8Array
  }
}

declare module 'bigtangle-ts/dist/net/bigtangle/core/Address.js' {
  import {type ECKey} from '../../../bigtangle-ts/dist/net/bigtangle/core/ECKey.js'

  export class Address {
    constructor(...args: any[])
    static fromKey(params: any, key: ECKey): Address
    toString(): string
  }
}

declare module 'bigtangle-ts/dist/net/bigtangle/params/TestParams.js' {
  export class TestParams {
    constructor(...args: any[])
    static get(): TestParams
    getAddressHeader(): number
    getP2SHHeader(): number
  }
}

declare module 'bigtangle-ts/dist/net/bigtangle/core/Utils.js' {
  export class Utils {
    constructor(...args: any[])
    static HEX: {
      encode(data: Uint8Array): string
      decode(hex: string): Uint8Array
    }
  }
}

declare module 'bigtangle-ts/dist/net/bigtangle/crypto/KeyCrypterScrypt.js' {
  export class KeyCrypterScrypt {
    constructor(...args: any[])
    deriveKey(password: string): any
    encrypt(data: string, key: any): string
    decrypt(encryptedData: string, key: any): string
  }
}
