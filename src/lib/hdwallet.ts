import {randomBytes} from '@noble/ciphers/webcrypto'
import {ripemd160} from '@noble/hashes/ripemd160'
import {sha256 as nobleSha256} from '@noble/hashes/sha256'
import {sign} from '@noble/secp256k1'
import {HDKey} from '@scure/bip32'
import {generateMnemonic, mnemonicToSeedSync} from '@scure/bip39'
import {wordlist} from '@scure/bip39/wordlists/english'

export interface HDWallet {
  readonly mnemonic: string
  readonly publicKey: string
  readonly privateKey: string // hex string
  derivePath(path: string): HDWallet
  signMessage(message: string): Uint8Array
}

export function generateWalletMnemonic(): string {
  return generateMnemonic(wordlist, 256)
}

export function createWalletFromMnemonic(mnemonic: string): HDWallet {
  const seed = mnemonicToSeedSync(mnemonic)
  const root = HDKey.fromMasterSeed(seed)

  return {
    mnemonic,
    publicKey: bytesToHex(root.publicKey!),
    privateKey: root.privateKey ? bytesToHex(root.privateKey) : '',
    derivePath(path: string) {
      const childNode = root.derive(path)
      return createWalletFromNode(childNode, mnemonic)
    },
    signMessage(message: string): Uint8Array {
      if (!root.privateKey) throw new Error('Missing private key')
      return sign(
        nobleSha256(message),
        root.privateKey!,
      )!.toCompactRawBytes()! as Uint8Array
    },
  }
}

function createWalletFromNode(node: HDKey, mnemonic: string): HDWallet {
  return {
    mnemonic,
    publicKey: bytesToHex(node.publicKey!),
    privateKey: node.privateKey ? bytesToHex(node.privateKey) : '',
    derivePath(path: string) {
      return createWalletFromNode(node.derive(path), mnemonic)
    },
    signMessage(message: string): Uint8Array {
      if (!node.privateKey) throw new Error('Missing private key')
      return sign(
        sha256(message),
        node.privateKey!,
      )!.toCompactRawBytes()! as Uint8Array
    },
  }
}

export function getPublicKeyFromMnemonic(mnemonic: string): string {
  const wallet = createWalletFromMnemonic(mnemonic)
  return wallet.derivePath("m/44'/0'/0'/0/0").publicKey
}

// React Native compatible utilities
function sha256(message: string): Uint8Array {
  return nobleSha256(new TextEncoder().encode(message))
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// Wallet serialization functions
export interface CredentialEntry {
  url: string
  user: string
  password: string
}

export interface SerializedWallet {
  keys: {publicKey: string; privateKey: string}[]
  credentials: CredentialEntry[]
}

export function saveHDWalletToFile(
  wallet: HDWallet,
  _password: string,
): string {
  const serialized: SerializedWallet = {
    keys: [{publicKey: wallet.publicKey, privateKey: wallet.privateKey}],
    credentials: [],
  }
  return JSON.stringify(serialized, null, 2)
}

export function loadHDWalletFromFile(
  fileData: string,
  _password: string,
): HDWallet {
  // Parse the wallet file and reconstruct using the stored private key
  const parsed: SerializedWallet = JSON.parse(fileData)
  const key = parsed.keys[0]
  if (!key) throw new Error('No key found in wallet file')
  // Reconstruct the wallet from the stored private key using HDKey constructor
  const privateKeyBytes = new Uint8Array(
    key.privateKey.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || [],
  )
  const hdkey = new HDKey({privateKey: privateKeyBytes})
  return {
    mnemonic: '', // Not stored in this format
    publicKey: key.publicKey,
    privateKey: key.privateKey,
    derivePath(path: string) {
      const child = hdkey.derive(path)
      return {
        mnemonic: '',
        publicKey: bytesToHex(child.publicKey!),
        privateKey: child.privateKey ? bytesToHex(child.privateKey) : '',
        derivePath: this.derivePath,
        signMessage(message: string) {
          if (!child.privateKey) throw new Error('Missing private key')
          return sign(
            sha256(message),
            child.privateKey!,
          )!.toCompactRawBytes()! as Uint8Array
        },
      }
    },
    signMessage(message: string) {
      if (!hdkey.privateKey) throw new Error('Missing private key')
      return sign(
        sha256(message),
        hdkey.privateKey!,
      )!.toCompactRawBytes()! as Uint8Array
    },
  }
}

export function addCredentialToWalletFile(
  fileData: string,
  _password: string,
  entry: CredentialEntry,
): string {
  const parsed: SerializedWallet = JSON.parse(fileData)
  // Find by url+user
  const idx = parsed.credentials.findIndex(
    c => c.url === entry.url && c.user === entry.user,
  )
  if (idx >= 0) {
    parsed.credentials[idx] = entry // update password
  } else {
    parsed.credentials.push(entry)
  }
  return JSON.stringify(parsed, null, 2)
}

export function loadCredentialsFromWalletFile(
  fileData: string,
  _password: string,
): CredentialEntry[] {
  const parsed: SerializedWallet = JSON.parse(fileData)
  return parsed.credentials || []
}

// Helper: Convert secp256k1 public key (hex) to Bitcoin address (P2PKH, mainnet)
function publicKeyToBitcoinAddress(publicKeyHex: string): string {
  // Convert hex to bytes
  const pubKeyBytes = new Uint8Array(
    publicKeyHex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || [],
  )

  // SHA-256 followed by RIPEMD-160
  const shaHash = nobleSha256(pubKeyBytes)
  const hash160 = ripemd160(shaHash)

  // Add version byte (0x00 for mainnet)
  const versionedPayload = new Uint8Array(1 + hash160.length)
  versionedPayload[0] = 0x00 // Mainnet P2PKH version
  versionedPayload.set(hash160, 1)

  // Calculate checksum
  const checksum = nobleSha256(nobleSha256(versionedPayload)).slice(0, 4)

  // Combine payload and checksum
  const addressBytes = new Uint8Array([...versionedPayload, ...checksum])

  // Base58 encoding
  return base58Encode(addressBytes)
}

// Base58 alphabet for Bitcoin addresses
const BASE58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

function base58Encode(buffer: Uint8Array): string {
  // Convert bytes to bigint
  let hexString = Array.from(buffer, byte =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
  let x = BigInt('0x' + hexString)

  // Encode to base58
  let result = ''
  while (x > 0n) {
    const [quotient, remainder] = [x / 58n, x % 58n]
    result = BASE58_ALPHABET[Number(remainder)] + result
    x = quotient
  }

  // Add leading '1's for zero bytes
  for (let i = 0; i < buffer.length && buffer[i] === 0; i++) {
    result = '1' + result
  }

  return result
}

export function createCredentialEntryForWallet(
  wallet: HDWallet,
  url: string,
): CredentialEntry {
  const user = publicKeyToBitcoinAddress(wallet.publicKey) + '@dummy.com'
  const password = bytesToHex(randomBytes(32))
  return {
    url,
    user,
    password,
  }
}
