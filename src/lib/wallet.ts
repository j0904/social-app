import {secp256k1} from '@noble/curves/secp256k1.js'
import {ripemd160} from '@noble/hashes/legacy.js'
import {sha256} from '@noble/hashes/sha2.js'
import {generateMnemonic, mnemonicToSeedSync} from '@scure/bip39'
import {wordlist} from '@scure/bip39/wordlists/english.js'

export interface CredentialEntry {
  url: string
  user: string
  password: string
}

export interface HDWallet {
  readonly mnemonic: string
  readonly publicKey: string
  readonly privateKey: string
  derivePath(path: string): HDWallet
  signMessage(message: string): Uint8Array
}

export interface WalletFile {
  wallet: HDWallet
  credentials: CredentialEntry
}

export function generateWalletMnemonic(): string {
  return generateMnemonic(wordlist, 256)
}

export function generateNewAccount(): WalletFile {
  const mnemonic = generateWalletMnemonic()
  return createWallet(mnemonic)
}

export function createWallet(mnemonic: string): WalletFile {
  if (mnemonic.split(' ').length < 12) {
    throw new Error('Invalid mnemonic - must contain at least 12 words')
  }

  // Derive private key from mnemonic seed using scure/bip39
  const seedBytes = mnemonicToSeedSync(mnemonic)

  // Create an ECKey from the seed using @scure/bip39
  // Note: This is a simplified approach - in a real implementation,
  // you would properly derive keys based on BIP32/BIP44 standards
  const privateKeyBytes = seedBytes.slice(0, 32)

  // For browser compatibility, we'll use @noble libraries instead of Bigtangle's ECKey
  // First, let's implement the functionality without relying on Node-specific crypto
  const publicKey = derivePublicKey(privateKeyBytes)

  const hdWallet: HDWallet = {
    mnemonic,
    publicKey: bytesToHex(publicKey),
    privateKey: bytesToHex(privateKeyBytes),
    derivePath: (_path: string) => {
      throw new Error(
        'Hierarchical derivation not fully implemented in this example',
      )
    },
    signMessage: (message: string): Uint8Array => {
      // For now, we'll implement a simplified signing using noble libraries
      return simpleSign(message, privateKeyBytes)
    },
  }

  const credentials: CredentialEntry = {
    url: 'https://wallet.bigt.ai',
    user: publicKeyToBitcoinAddress(bytesToHex(publicKey)) + '@bigt.ai',
    password: bytesToHex(generateRandomBytes(32)),
  }

  return {wallet: hdWallet, credentials}
}

export interface SerializedWallet {
  keys: Array<{publicKey: string; privateKey: string}>
  credentials: CredentialEntry
}

export function saveHDWalletToFile(
  walletFile: WalletFile,
  _password: string,
): string {
  const serialized: SerializedWallet = {
    keys: [
      {
        publicKey: walletFile.wallet.publicKey,
        privateKey: walletFile.wallet.privateKey,
      },
    ],
    credentials: walletFile.credentials,
  }
  return JSON.stringify(serialized, null, 2)
}

export function loadWallet(fileData: string): WalletFile {
  let parsed: SerializedWallet
  try {
    parsed = JSON.parse(fileData)
  } catch (e) {
    throw new Error('Invalid wallet file format')
  }

  if (!parsed.keys?.length) {
    throw new Error('No key found in wallet file')
  }

  const key = parsed.keys[0]

  const privateKeyBytes = new Uint8Array(
    key.privateKey.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || [],
  )

  const wallet: HDWallet = {
    mnemonic: '',
    publicKey: key.publicKey,
    privateKey: key.privateKey,
    signMessage: (message: string) => {
      return simpleSign(message, privateKeyBytes)
    },
    derivePath: (_path: string) => {
      throw new Error('Hierarchical derivation not supported')
    },
  }

  return {
    wallet,
    credentials: parsed.credentials,
  }
}

// Utility function to generate random bytes
function generateRandomBytes(length: number): Uint8Array {
  if (typeof window !== 'undefined' && window.crypto) {
    // Browser environment
    const array = new Uint8Array(length)
    window.crypto.getRandomValues(array)
    return array
  } else {
    // Node.js environment - we'll use a simple implementation
    // In real applications, use crypto.randomBytes
    const array = new Uint8Array(length)
    for (let i = 0; i < length; i++) {
      array[i] = Math.floor(Math.random() * 256)
    }
    return array
  }
}

// Utility functions
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function publicKeyToBitcoinAddress(publicKeyHex: string): string {
  const pubKeyBytes = new Uint8Array(
    publicKeyHex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || [],
  )

  // SHA256 hash the public key
  const shaHash = sha256(pubKeyBytes)
  // RIPEMD160 hash the result
  const hash160 = ripemd160(shaHash)

  // Add version byte (0x00 for mainnet)
  const versionedPayload = new Uint8Array([0x00, ...hash160])

  // Double SHA256 for checksum
  const checksum = sha256(sha256(versionedPayload)).slice(0, 4)

  // Combine payload and checksum
  const payloadWithChecksum = new Uint8Array([...versionedPayload, ...checksum])

  // Base58 encode
  return base58Encode(payloadWithChecksum)
}

const BASE58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

function base58Encode(buffer: Uint8Array): string {
  let x = BigInt(
    `0x${Array.from(buffer)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')}`,
  )
  let result = ''

  while (x > 0n) {
    const [quotient, remainder] = [x / 58n, x % 58n]
    result = BASE58_ALPHABET[Number(remainder)] + result
    x = quotient
  }

  // Add leading zeros (base58 of 0x00 is '1')
  for (let i = 0; i < buffer.length && buffer[i] === 0; i++) {
    result = '1' + result
  }

  return result
}

// Helper function to derive public key from private key using secp256k1
function derivePublicKey(privateKeyBytes: Uint8Array): Uint8Array {
  try {
    // Use noble/secp256k1 to derive the public key
    const publicKeyBytes = secp256k1.getPublicKey(privateKeyBytes, true) // true for compressed
    return publicKeyBytes
  } catch (error) {
    throw new Error(`Error deriving public key: ${error}`)
  }
}

// Helper function to sign a message using secp256k1
function simpleSign(message: string, privateKeyBytes: Uint8Array): Uint8Array {
  try {
    // Hash the message
    const messageHash = sha256(new TextEncoder().encode(message))

    // Sign the hash
    const signature = secp256k1.sign(messageHash, privateKeyBytes)

    // Return the signature bytes
    return signature
  } catch (error) {
    throw new Error(`Error signing message: ${error}`)
  }
}
