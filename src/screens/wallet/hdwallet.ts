import {randomBytes} from '@noble/ciphers/webcrypto'
import {ripemd160} from '@noble/hashes/ripemd160'
import {sha256} from '@noble/hashes/sha256'
import * as secp256k1 from 'secp256k1'

export interface CredentialEntry {
  url: string
  user: string
  password: string
}

export interface Key {
  readonly address: string
  readonly privateKey: string
}

export interface WalletFile {
  wallet: Key
  credentials: CredentialEntry
}

export interface SerializedWallet {
  keys: Array<{address: string; privateKey: string}>
  credentials: CredentialEntry
}

// Base58 alphabet (same as Bitcoin)
const BASE58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

/**
 * Encode bytes to Base58 string
 */
function base58Encode(bytes: Uint8Array): string {
  // Count leading zeros
  let zeros = 0
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) {
    zeros++
  }

  // Convert to base58
  const encoded: number[] = []
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i]
    for (let j = 0; j < encoded.length; j++) {
      carry += encoded[j] << 8
      encoded[j] = carry % 58
      carry = Math.floor(carry / 58)
    }
    while (carry > 0) {
      encoded.push(carry % 58)
      carry = Math.floor(carry / 58)
    }
  }

  // Build result string
  let result = ''
  for (let i = 0; i < zeros; i++) {
    result += BASE58_ALPHABET[0]
  }
  for (let i = encoded.length - 1; i >= 0; i--) {
    result += BASE58_ALPHABET[encoded[i]]
  }

  return result
}

/**
 * Decode Base58 string to bytes
 */
function base58Decode(str: string): Uint8Array {
  // Count leading '1's (zeros)
  let zeros = 0
  for (let i = 0; i < str.length && str[i] === '1'; i++) {
    zeros++
  }

  // Decode base58
  const decoded: number[] = []
  for (let i = zeros; i < str.length; i++) {
    const idx = BASE58_ALPHABET.indexOf(str[i])
    if (idx === -1) {
      throw new Error('Invalid Base58 character')
    }
    let carry = idx
    for (let j = 0; j < decoded.length; j++) {
      carry += decoded[j] * 58
      decoded[j] = carry & 0xff
      carry >>= 8
    }
    while (carry > 0) {
      decoded.push(carry & 0xff)
      carry >>= 8
    }
  }

  // Build result with leading zeros
  const result = new Uint8Array(zeros + decoded.length)
  for (let i = 0; i < zeros; i++) {
    result[i] = 0
  }
  for (let i = 0; i < decoded.length; i++) {
    result[zeros + i] = decoded[decoded.length - 1 - i]
  }

  return result
}

/**
 * Encode bytes to Base58Check (with checksum)
 */
function base58CheckEncode(version: number, payload: Uint8Array): string {
  const versionedPayload = new Uint8Array(1 + payload.length)
  versionedPayload[0] = version
  versionedPayload.set(payload, 1)

  // Double SHA256 for checksum
  const checksum = sha256(sha256(versionedPayload)).slice(0, 4)

  const full = new Uint8Array(versionedPayload.length + 4)
  full.set(versionedPayload)
  full.set(checksum, versionedPayload.length)

  return base58Encode(full)
}

/**
 * Decode Base58Check string
 */
function base58CheckDecode(str: string): {
  version: number
  payload: Uint8Array
} {
  const decoded = base58Decode(str)
  if (decoded.length < 5) {
    throw new Error('Invalid Base58Check string: too short')
  }

  const payload = decoded.slice(0, -4)
  const checksum = decoded.slice(-4)

  // Verify checksum
  const expectedChecksum = sha256(sha256(payload)).slice(0, 4)
  for (let i = 0; i < 4; i++) {
    if (checksum[i] !== expectedChecksum[i]) {
      throw new Error('Invalid checksum')
    }
  }

  return {
    version: payload[0],
    payload: payload.slice(1),
  }
}

/**
 * Network parameters for TestNet
 */
const TEST_PARAMS = {
  addressHeader: 111, // 0x6f - testnet P2PKH address prefix
  p2shHeader: 196, // 0xc4 - testnet P2SH address prefix
}

/**
 * Generate a new EC key pair
 */
function createNewKey(): {privateKey: Uint8Array; publicKey: Uint8Array} {
  const privateKey = new Uint8Array(32)
  crypto.getRandomValues(privateKey)

  // Ensure private key is valid (non-zero, less than curve order)
  // This is a simplified check; secp256k1 will reject invalid keys
  const publicKey = secp256k1.publicKeyCreate(privateKey, true) // compressed

  return {privateKey, publicKey}
}

/**
 * Get public key hash (RIPEMD160(SHA256(pubKey)))
 */
function getPubKeyHash(publicKey: Uint8Array): Uint8Array {
  return ripemd160(sha256(publicKey))
}

/**
 * Create address from public key hash
 */
function addressFromPubKeyHash(
  pubKeyHash: Uint8Array,
  version: number = TEST_PARAMS.addressHeader,
): string {
  return base58CheckEncode(version, pubKeyHash)
}

/**
 * Helper to import KeyCrypterScrypt module.
 * This module doesn't have circular dependency issues.
 *
 * Uses require() instead of dynamic import() for Jest compatibility.
 * The KeyCrypterScrypt module doesn't trigger the circular dependency chain
 * because it only imports from crypto/, not from core/ where Coin/Block live.
 */
function importKeyCrypter() {
  const module = require('bigtangle-ts/dist/net/bigtangle/crypto/KeyCrypterScrypt.js')
  return module.KeyCrypterScrypt
}

// Use our standalone crypto implementation to avoid bigtangle-ts circular dependencies
export async function createWallet(): Promise<WalletFile> {
  // Generate a new EC key pair using our standalone implementation
  const {privateKey, publicKey} = createNewKey()

  // Get public key hash and create address
  const pubKeyHash = getPubKeyHash(publicKey)
  const addr = addressFromPubKeyHash(pubKeyHash)

  const wallet: Key = {
    address: addr,
    privateKey: bytesToHex(privateKey),
  }

  const credentials: CredentialEntry = {
    url: 'https://wallet.bigt.ai',
    user: addr + '@bigt.ai',
    password: bytesToHex(randomBytes(32)),
  }

  return {wallet, credentials}
}

export async function saveKeyToFile(
  walletFile: WalletFile,
  _password: string,
): Promise<string> {
  const serialized: SerializedWallet = {
    keys: [
      {
        address: walletFile.wallet.address,
        privateKey: walletFile.wallet.privateKey,
      },
    ],
    credentials: walletFile.credentials,
  }

  const KeyCrypterScrypt = importKeyCrypter()
  const raw = JSON.stringify(serialized, null, 2)
  const keyCrypter = new KeyCrypterScrypt()
  const key = await keyCrypter.deriveKey(_password)
  const data = await keyCrypter.encrypt(raw, key)
  return data
}

export async function loadWallet(
  fileData: string,
  _password: string,
): Promise<WalletFile> {
  const KeyCrypterScrypt = importKeyCrypter()

  const keyCrypter = new KeyCrypterScrypt()
  const tmpkey = await keyCrypter.deriveKey(_password)
  const raw = await keyCrypter.decrypt(fileData, tmpkey)
  const parsed: SerializedWallet = JSON.parse(raw)

  if (!parsed.keys?.length) {
    throw new Error('No key found in wallet file')
  }

  const keyData = parsed.keys[0]

  // Recreate the public key from the stored private key
  const privateKeyBytes = hexToBytes(keyData.privateKey)
  const publicKey = secp256k1.publicKeyCreate(privateKeyBytes, true) // compressed

  // Recreate address from public key
  const pubKeyHash = getPubKeyHash(publicKey)
  const reconstructedAddress = addressFromPubKeyHash(pubKeyHash)

  const wallet: Key = {
    address: reconstructedAddress,
    privateKey: keyData.privateKey,
  }

  return {
    wallet,
    credentials: parsed.credentials,
  }
}

// Helper function to convert bytes to hex
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// Helper function to convert hex to bytes
function hexToBytes(hex: string): Uint8Array {
  const matches = hex.match(/.{1,2}/g)
  if (!matches) {
    throw new Error('Invalid hex string')
  }
  return new Uint8Array(matches.map(byte => Number.parseInt(byte, 16)))
}
