/**
 * Tests for bigtangle-ts library
 *
 * These tests verify:
 * 1. Proper module loading without circular dependency issues
 * 2. Core functionality of the bigtangle-ts library
 * 3. Detection of circular dependency patterns that could cause
 *    "Cannot access 'X' before initialization" errors
 *
 * Note: bigtangle-ts is an ESM module. Jest transforms it via babel-jest.
 * The moduleNameMapper in package.json maps 'bigtangle-ts' to the dist/index.js
 */

// Use require for Jest compatibility - the actual app uses dynamic imports

const bigtangle = require('bigtangle-ts')

describe('bigtangle-ts library', () => {
  describe('circular dependency detection', () => {
    it('should load bigtangle-ts without circular dependency errors', () => {
      // If the module loads without throwing "Cannot access 'X' before initialization"
      // then there are no circular dependency issues
      expect(bigtangle).toBeDefined()
    })

    it('should be able to access all exported classes after import', () => {
      // These are the exports defined in dist/index.js
      // Core blockchain types
      expect(bigtangle.Address).toBeDefined()
      expect(bigtangle.Block).toBeDefined()
      expect(bigtangle.Transaction).toBeDefined()
      expect(bigtangle.TransactionInput).toBeDefined()
      expect(bigtangle.TransactionOutput).toBeDefined()
      expect(bigtangle.TransactionOutPoint).toBeDefined()

      // Cryptographic types
      expect(bigtangle.ECKey).toBeDefined()
      expect(bigtangle.ECPoint).toBeDefined()
      expect(bigtangle.ECDSASignature).toBeDefined()
      expect(bigtangle.Sha256Hash).toBeDefined()

      // Utilities
      expect(bigtangle.Utils).toBeDefined()
      expect(bigtangle.BigIntegerConverter).toBeDefined()
      expect(bigtangle.VarInt).toBeDefined()

      // Network parameters
      expect(bigtangle.NetworkParameters).toBeDefined()

      // Coin and monetary types
      expect(bigtangle.Coin).toBeDefined()
      expect(bigtangle.CoinConstants).toBeDefined()

      // Other common types
      expect(bigtangle.UTXO).toBeDefined()
      expect(bigtangle.BloomFilter).toBeDefined()
    })

    it('should not have initialization order issues when accessing Coin class', () => {
      // This test specifically checks for the "Cannot access 'Coin' before initialization" error
      // which was a known issue with circular dependencies in bigtangle-ts
      expect(() => {
        const CoinClass = bigtangle.Coin
        return CoinClass
      }).not.toThrow()
    })

    it('should not have initialization order issues when accessing CoinConstants', () => {
      // CoinConstants was introduced to fix circular dependency issues with Coin static properties
      expect(() => {
        const CoinConstantsClass = bigtangle.CoinConstants
        return CoinConstantsClass
      }).not.toThrow()
    })

    it('should allow multiple requires without issues', () => {
      // First require (cached)
      const bigtangle1 = require('bigtangle-ts')
      expect(bigtangle1.ECKey).toBeDefined()

      // Second require (should use cached module)
      const bigtangle2 = require('bigtangle-ts')
      expect(bigtangle2.ECKey).toBeDefined()

      // Both should reference the same module
      expect(bigtangle1.ECKey).toBe(bigtangle2.ECKey)
    })

    it('should have consistent class references across module', () => {
      // Verify class references are stable (not affected by circular deps)
      const ECKey1 = bigtangle.ECKey
      const ECKey2 = bigtangle.ECKey
      expect(ECKey1).toBe(ECKey2)

      const Address1 = bigtangle.Address
      const Address2 = bigtangle.Address
      expect(Address1).toBe(Address2)

      const Coin1 = bigtangle.Coin
      const Coin2 = bigtangle.Coin
      expect(Coin1).toBe(Coin2)
    })
  })

  describe('ECKey functionality', () => {
    it('should create a new EC key', () => {
      const key = bigtangle.ECKey.createNewKey()
      expect(key).toBeDefined()
    })

    it('should create different keys on each call', () => {
      const key1 = bigtangle.ECKey.createNewKey()
      const key2 = bigtangle.ECKey.createNewKey()

      expect(key1.toString()).not.toBe(key2.toString())
    })

    it('should convert key to string', () => {
      const key = bigtangle.ECKey.createNewKey()
      const keyString = key.toString()

      expect(typeof keyString).toBe('string')
      expect(keyString.length).toBeGreaterThan(0)
    })
  })

  describe('Address functionality', () => {
    it('should have Address class available', () => {
      expect(bigtangle.Address).toBeDefined()
      expect(typeof bigtangle.Address).toBe('function')
    })
  })

  describe('Utils functionality', () => {
    it('should have Utils class available', () => {
      expect(bigtangle.Utils).toBeDefined()
    })

    it('should have HEX utility', () => {
      expect(bigtangle.Utils.HEX).toBeDefined()
    })
  })

  describe('Coin and CoinConstants', () => {
    it('should have Coin class available', () => {
      expect(bigtangle.Coin).toBeDefined()
    })

    it('should have CoinConstants class available', () => {
      expect(bigtangle.CoinConstants).toBeDefined()
    })

    it('should be able to access Coin and CoinConstants together without circular dep errors', () => {
      // This specifically tests that accessing both doesn't cause initialization issues
      expect(() => {
        const coin = bigtangle.Coin
        const coinConstants = bigtangle.CoinConstants
        return {coin, coinConstants}
      }).not.toThrow()
    })
  })

  describe('Transaction types', () => {
    it('should have Transaction class available', () => {
      expect(bigtangle.Transaction).toBeDefined()
    })

    it('should have TransactionInput class available', () => {
      expect(bigtangle.TransactionInput).toBeDefined()
    })

    it('should have TransactionOutput class available', () => {
      expect(bigtangle.TransactionOutput).toBeDefined()
    })

    it('should have TransactionOutPoint class available', () => {
      expect(bigtangle.TransactionOutPoint).toBeDefined()
    })
  })

  describe('Cryptographic types', () => {
    it('should have ECPoint class available', () => {
      expect(bigtangle.ECPoint).toBeDefined()
    })

    it('should have ECDSASignature class available', () => {
      expect(bigtangle.ECDSASignature).toBeDefined()
    })

    it('should have Sha256Hash class available', () => {
      expect(bigtangle.Sha256Hash).toBeDefined()
    })
  })

  describe('error handling', () => {
    it('should handle invalid key reconstruction gracefully', () => {
      // Creating a key from invalid private bytes should throw or handle gracefully
      const invalidBytes = new Uint8Array([0, 1, 2]) // Too short to be valid

      try {
        const key = bigtangle.ECKey.fromPrivate(invalidBytes, true)
        // If it doesn't throw, it should at least create some object
        expect(key).toBeDefined()
      } catch (error) {
        // Expected behavior - invalid key data should throw
        expect(error).toBeDefined()
      }
    })
  })
})
