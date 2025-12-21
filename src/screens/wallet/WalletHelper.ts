import {secp256k1} from '@noble/curves/secp256k1'
import {ripemd160} from '@noble/hashes/ripemd160'
import {sha256} from '@noble/hashes/sha256'
import {randomBytes} from '@noble/hashes/utils'

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

// Default context root for bigtangle network
const DEFAULT_CONTEXT_ROOT = 'http://localhost:8088/'

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
  const privateKey = randomBytes(32)

  // Ensure private key is valid (non-zero, less than curve order)
  // @noble/curves will reject invalid keys
  const publicKey = secp256k1.getPublicKey(privateKey, true) // compressed

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
  const module = require('../../../../bigtangle-ts/dist/net/bigtangle/crypto/KeyCrypterScrypt.js')
  return module.KeyCrypterScrypt
}

/**
 * Helper to import bigtangle-ts modules for wallet operations
 */
function importBigtangleModules() {
  const WalletModule = require('../../../../bigtangle-ts/dist/net/bigtangle/wallet/Wallet.js')
  const ECKeyModule = require('../../../../bigtangle-ts/dist/net/bigtangle/core/ECKey.js')
  const TestParamsModule = require('../../../../bigtangle-ts/dist/net/bigtangle/params/TestParams.js')

  return {
    Wallet: WalletModule.Wallet,
    ECKey: ECKeyModule.ECKey,
    TestParams: TestParamsModule.TestParams,
  }
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

  // Convert string to Uint8Array for encryption
  const encoder = new TextEncoder()
  const plainBytes = encoder.encode(raw)

  const keyCrypter = new KeyCrypterScrypt()
  const key = await keyCrypter.deriveKey(_password)
  const encryptedData = await keyCrypter.encrypt(plainBytes, key)

  // Serialize the EncryptedData object to a JSON-safe format
  // We need to save: salt (from scryptParameters), iv, and encryptedBytes
  const output = {
    salt: bytesToHex(keyCrypter.scryptParameters.salt),
    iv: bytesToHex(encryptedData.initialisationVector),
    data: bytesToHex(encryptedData.encryptedBytes),
    // Save scrypt params for decryption
    N: keyCrypter.scryptParameters.N,
    r: keyCrypter.scryptParameters.r,
    p: keyCrypter.scryptParameters.p,
  }

  return JSON.stringify(output, null, 2)
}

export async function loadWallet(
  fileData: string,
  _password: string,
): Promise<WalletFile> {
  const KeyCrypterScrypt = importKeyCrypter()

  // Parse the encrypted file format
  const encrypted = JSON.parse(fileData)

  // Reconstruct scrypt parameters with the saved salt
  const keyCrypter = new KeyCrypterScrypt({
    salt: hexToBytes(encrypted.salt),
    N: encrypted.N,
    r: encrypted.r,
    p: encrypted.p,
  })

  // Derive the key using the same parameters
  const tmpkey = await keyCrypter.deriveKey(_password)

  // Reconstruct the EncryptedData object
  const encryptedData = {
    initialisationVector: hexToBytes(encrypted.iv),
    encryptedBytes: hexToBytes(encrypted.data),
  }

  // Decrypt the data
  const decryptedBytes = await keyCrypter.decrypt(encryptedData, tmpkey)

  // Convert Uint8Array back to string
  const decoder = new TextDecoder()
  const raw = decoder.decode(decryptedBytes)

  const parsed: SerializedWallet = JSON.parse(raw)

  if (!parsed.keys?.length) {
    throw new Error('No key found in wallet file')
  }

  const keyData = parsed.keys[0]

  // Recreate the public key from the stored private key
  const privateKeyBytes = hexToBytes(keyData.privateKey)
  const publicKey = secp256k1.getPublicKey(privateKeyBytes, true) // compressed

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

/**
 * Import a wallet from a private key (hex string or WIF format)
 * @param privateKeyInput - Private key in hex format (64 chars) or WIF format
 * @returns WalletFile with the imported key
 */
export async function importPrivateKey(
  privateKeyInput: string,
): Promise<WalletFile> {
  let privateKeyHex: string
  let privateKeyBytes: Uint8Array

  // Clean up input - remove spaces and trim
  const cleanInput = privateKeyInput.trim().replaceAll(/\s+/g, '')

  // Check if it's a WIF (Wallet Import Format) - starts with 5, K, L, c, or 9 (testnet)
  if (/^[5KLc9][1-9A-HJ-NP-Za-km-z]{50,51}$/.test(cleanInput)) {
    // Decode WIF
    try {
      const decoded = base58CheckDecode(cleanInput)
      // WIF version: 0x80 for mainnet, 0xef for testnet
      if (decoded.version !== 0x80 && decoded.version !== 0xef) {
        throw new Error('Invalid WIF version')
      }
      // If compressed (33 bytes with 0x01 suffix), remove the suffix
      if (decoded.payload.length === 33 && decoded.payload[32] === 0x01) {
        privateKeyBytes = decoded.payload.slice(0, 32)
      } else if (decoded.payload.length === 32) {
        privateKeyBytes = decoded.payload
      } else {
        throw new Error('Invalid WIF payload length')
      }
      privateKeyHex = bytesToHex(privateKeyBytes)
    } catch (e) {
      throw new Error(`Invalid WIF format: ${(e as Error).message}`)
    }
  } else if (/^[0-9a-fA-F]{64}$/.test(cleanInput)) {
    // It's a hex private key
    privateKeyHex = cleanInput.toLowerCase()
    privateKeyBytes = hexToBytes(privateKeyHex)
  } else {
    throw new Error(
      'Invalid private key format. Expected 64-character hex string or WIF format.',
    )
  }

  // Validate the private key by generating the public key
  let publicKey: Uint8Array
  try {
    publicKey = secp256k1.getPublicKey(privateKeyBytes, true) // compressed
  } catch (error_) {
    // Log the error for debugging purposes
    console.error('secp256k1 error:', error_)
    throw new Error('Invalid private key: failed to generate public key')
  }

  // Generate address from public key
  const pubKeyHash = getPubKeyHash(publicKey)
  const address = addressFromPubKeyHash(pubKeyHash)

  const wallet: Key = {
    address,
    privateKey: privateKeyHex,
  }

  const credentials: CredentialEntry = {
    url: 'https://wallet.bigt.ai',
    user: address + '@bigt.ai',
    password: bytesToHex(randomBytes(32)),
  }

  return {wallet, credentials}
}

/**
 * Create a bigtangle-ts Wallet instance from a WalletFile
 * This creates a fully functional Wallet that can interact with the blockchain
 *
 * @param walletFile - The wallet file containing the private key
 * @param contextRoot - The server URL (default: http://localhost:8088/)
 * @returns A bigtangle-ts Wallet instance
 *
 * @example
 * ```typescript
 * const walletFile = await createWallet();
 * const btWallet = await createBigtangleWallet(walletFile);
 * // Now you can use btWallet to make payments, check balances, etc.
 * ```
 */
export async function createBigtangleWallet(
  walletFile: WalletFile,
  contextRoot: string = DEFAULT_CONTEXT_ROOT,
): Promise<any> {
  const {Wallet, ECKey, TestParams} = importBigtangleModules()

  // Get network parameters (TestNet)
  const networkParameters = TestParams.get()

  // Create ECKey from private key hex string
  const ecKey = ECKey.fromPrivateString(walletFile.wallet.privateKey)
  const keys = [ecKey]

  // Create wallet using Wallet.fromKeysURL
  const btWallet = await Wallet.fromKeysURL(
    networkParameters,
    keys,
    contextRoot,
  )

  return btWallet
}

/**
 * Create a bigtangle-ts Wallet instance directly from a private key string
 *
 * @param privateKey - Private key in hex format (64 chars)
 * @param contextRoot - The server URL (default: http://localhost:8088/)
 * @returns A bigtangle-ts Wallet instance
 */
export async function createBigtangleWalletFromPrivateKey(
  privateKey: string,
  contextRoot: string = DEFAULT_CONTEXT_ROOT,
): Promise<any> {
  const {Wallet, ECKey, TestParams} = importBigtangleModules()

  // Get network parameters (TestNet)
  const networkParameters = TestParams.get()

  // Create ECKey from private key hex string
  const ecKey = ECKey.fromPrivateString(privateKey)
  const keys = [ecKey]

  // Create wallet using Wallet.fromKeysURL
  const btWallet = await Wallet.fromKeysURL(
    networkParameters,
    keys,
    contextRoot,
  )

  return btWallet
}

/**
 * Get the default context root URL for bigtangle network
 */
export function getDefaultContextRoot(): string {
  return DEFAULT_CONTEXT_ROOT
}

/**
 * Set a custom context root URL (for production use)
 * @param url - The server URL
 */
export function setContextRoot(url: string): string {
  return url
}
