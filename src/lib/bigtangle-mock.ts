// Mock implementation of bigtangle-ts for demonstration purposes
// In a real scenario, this would come from the published package

// Core interfaces/types
export interface IAddress {
  toString(): string
}

export interface ITransaction {
  getHash?(): {toString(): string}
}

export interface IBlock {
  height?: number
}

export interface IECKey {
  getPublicKey?(): Uint8Array
}

// Mock implementations
export class Address implements IAddress {
  private address: string

  constructor(key?: ECKey) {
    this.address = key
      ? `mock_address_${Date.now()}`
      : `mock_default_address_${Date.now()}`
  }

  toString(): string {
    return this.address
  }
}

export class ECKey implements IECKey {
  constructor() {}

  getPublicKey?(): Uint8Array {
    return new Uint8Array([1, 2, 3, 4])
  }
}

export class Transaction implements ITransaction {
  private hash: string

  constructor() {
    this.hash = `mock_transaction_hash_${Date.now()}`
  }

  getHash?(): {toString(): string} {
    return {
      toString: () => this.hash,
    }
  }
}

export class Block implements IBlock {
  height?: number

  constructor() {
    this.height = Math.floor(Math.random() * 1000000)
  }
}

// Re-export for compatibility with expected exports
export default {
  Address,
  ECKey,
  Transaction,
  Block,
}
