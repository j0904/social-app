/**
 * WalletHelper.ts - Bigtangle wallet utilities
 *
 * Uses imports from bigtangle-ts to work in both Node.js and webpack environments.
 * Note: bigtangle-ts doesn't have TypeScript declaration files, so we use @ts-ignore
 * for type errors. The runtime code works correctly.
 */

// @ts-ignore - bigtangle-ts doesn't have declaration files
import {
  Base58,
  ECKey,
  KeyCrypterScrypt,
  TestParams,
  Utils,
  Wallet,
} from '@bigtangle/bigtangle-ts'

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
// In browser, use the proxy path to bypass CORS; in Node.js, use direct URL
const DEFAULT_CONTEXT_ROOT = 'http://localhost:8088/'

/**
 * Get TestParams instance (lazy loaded and cached)
 */
let _testParams: any = null
function getTestParams(): any {
  if (!_testParams) {
    _testParams = TestParams.get()
  }
  return _testParams
}

/**
 * Generate random bytes using crypto API
 */
function getRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  } else {
    // Fallback for environments without crypto
    for (let i = 0; i < length; i++) {
      bytes[i] = Math.floor(Math.random() * 256)
    }
  }
  return bytes
}

// Use bigtangle-ts ECKey and Address for wallet creation
export async function createWallet(): Promise<WalletFile> {
  const testParams = getTestParams()

  // Generate a new EC key pair using bigtangle-ts ECKey
  const ecKey = ECKey.createNewKey()

  // Get the private key hex and address from the ECKey
  const privateKeyHex = ecKey.getPrivateKeyAsHex()
  const addr = ecKey.toAddress(testParams).toBase58()

  const wallet: Key = {
    address: addr,
    privateKey: privateKeyHex,
  }

  const credentials: CredentialEntry = {
    url: 'https://wallet.bigt.ai',
    user: addr + '@bigt.ai',
    password: Utils.HEX.encode(getRandomBytes(32)),
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
    salt: Utils.HEX.encode(keyCrypter.scryptParameters.salt),
    iv: Utils.HEX.encode(encryptedData.initialisationVector),
    data: Utils.HEX.encode(encryptedData.encryptedBytes),
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
  const testParams = getTestParams()

  // Parse the encrypted file format
  const encrypted = JSON.parse(fileData)

  // Reconstruct scrypt parameters with the saved salt
  const keyCrypter = new KeyCrypterScrypt({
    salt: Utils.HEX.decode(encrypted.salt),
    N: encrypted.N,
    r: encrypted.r,
    p: encrypted.p,
  })

  // Derive the key using the same parameters
  const tmpkey = await keyCrypter.deriveKey(_password)

  // Reconstruct the EncryptedData object
  const encryptedData = {
    initialisationVector: Utils.HEX.decode(encrypted.iv),
    encryptedBytes: Utils.HEX.decode(encrypted.data),
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

  // Recreate ECKey and address from the stored private key using bigtangle-ts
  const ecKey = ECKey.fromPrivateString(keyData.privateKey)
  const reconstructedAddress = ecKey.toAddress(testParams).toBase58()

  const wallet: Key = {
    address: reconstructedAddress,
    privateKey: keyData.privateKey,
  }

  return {
    wallet,
    credentials: parsed.credentials,
  }
}

/**
 * Decode a Base58Check-encoded string and return the version byte and payload.
 * Uses bigtangle-ts Base58.decodeChecked which validates the checksum.
 */
function base58CheckDecode(encoded: string): {
  version: number
  payload: Uint8Array
} {
  const decoded = Base58.decodeChecked(encoded)
  return {
    version: decoded[0],
    payload: decoded.slice(1),
  }
}

/**
 * Import a wallet from a private key (hex string or WIF format)
 * @param privateKeyInput - Private key in hex format (64 chars) or WIF format
 * @returns WalletFile with the imported key
 */
export async function importPrivateKey(
  privateKeyInput: string,
): Promise<WalletFile> {
  const testParams = getTestParams()

  let privateKeyHex: string

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
      let privateKeyBytes: Uint8Array
      if (decoded.payload.length === 33 && decoded.payload[32] === 0x01) {
        privateKeyBytes = decoded.payload.slice(0, 32)
      } else if (decoded.payload.length === 32) {
        privateKeyBytes = decoded.payload
      } else {
        throw new Error('Invalid WIF payload length')
      }
      privateKeyHex = Utils.HEX.encode(privateKeyBytes)
    } catch (e) {
      throw new Error(`Invalid WIF format: ${(e as Error).message}`)
    }
  } else if (/^[0-9a-fA-F]{64}$/.test(cleanInput)) {
    // It's a hex private key
    privateKeyHex = cleanInput.toLowerCase()
  } else {
    throw new Error(
      'Invalid private key format. Expected 64-character hex string or WIF format.',
    )
  }

  // Validate the private key and generate address using bigtangle-ts ECKey
  let ecKey: any
  let address: string
  try {
    ecKey = ECKey.fromPrivateString(privateKeyHex)
    address = ecKey.toAddress(testParams).toBase58()
  } catch (error_) {
    // Log the error for debugging purposes
    console.error('ECKey error:', error_)
    throw new Error('Invalid private key: failed to generate public key')
  }

  const wallet: Key = {
    address,
    privateKey: privateKeyHex,
  }

  const credentials: CredentialEntry = {
    url: 'https://wallet.bigt.ai',
    user: address + '@bigt.ai',
    password: Utils.HEX.encode(getRandomBytes(32)),
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
  const testParams = getTestParams()

  // Create ECKey from private key hex string
  const ecKey = ECKey.fromPrivateString(walletFile.wallet.privateKey)
  const keys = [ecKey]

  // Create wallet using Wallet.fromKeysURL
  const btWallet = await Wallet.fromKeysURL(testParams, keys, contextRoot)

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
  const testParams = getTestParams()

  // Create ECKey from private key hex string
  const ecKey = ECKey.fromPrivateString(privateKey)
  const keys = [ecKey]

  // Create wallet using Wallet.fromKeysURL
  const btWallet = await Wallet.fromKeysURL(testParams, keys, contextRoot)

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
