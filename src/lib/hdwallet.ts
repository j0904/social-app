import {randomBytes} from '@noble/ciphers/webcrypto'
import {secp256k1 as secp} from '@noble/curves/secp256k1'
import {ripemd160} from '@noble/hashes/ripemd160'
import {sha256 as nobleSha256} from '@noble/hashes/sha256'
import {generateMnemonic, mnemonicToSeedSync} from '@scure/bip39'
import {wordlist} from '@scure/bip39/wordlists/english'

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

  // Configure HMAC-SHA256 for secp256k1
  const hmacSha256Sync = (
    key: Uint8Array,
    ...msgs: Uint8Array[]
  ): Uint8Array => {
    const h = nobleSha256.create()
    h.update(key)
    msgs.forEach(m => h.update(m))
    return h.digest()
  }
  ;(secp.utils as any).hmacSha256Sync = hmacSha256Sync

  // Derive private key from mnemonic seed
  const seedBytes = mnemonicToSeedSync(mnemonic)
  const privateKey = nobleSha256(seedBytes)
  const publicKey = secp.getPublicKey(privateKey)

  const wallet: HDWallet = {
    mnemonic,
    publicKey: bytesToHex(publicKey),
    privateKey: bytesToHex(privateKey),
    derivePath: () => {
      throw new Error('Hierarchical derivation not supported')
    },
    signMessage(message: string): Uint8Array {
      return secp.sign(sha256(message), privateKey).toCompactRawBytes()
    },
  }

  const credentials: CredentialEntry = {
    url: 'https://wallet.bigt.ai',
    user: publicKeyToBitcoinAddress(bytesToHex(publicKey)) + '@bigt.ai',
    password: bytesToHex(randomBytes(32)),
  }

  return {wallet, credentials}
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
  // Create wallet directly from private key bytes
  const privateKey = privateKeyBytes

  const wallet: HDWallet = {
    mnemonic: '',
    publicKey: key.publicKey,
    privateKey: key.privateKey,
    signMessage: (message: string) => {
      if (!privateKey) throw new Error('Missing private key')
      return secp.sign(sha256(message), privateKey).toCompactRawBytes()
    },
    derivePath: () => {
      throw new Error('Hierarchical derivation not supported')
    },
  }

  return {
    wallet,
    credentials: parsed.credentials,
  }
}

// Utility functions
function sha256(message: string): Uint8Array {
  return nobleSha256(new TextEncoder().encode(message))
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function publicKeyToBitcoinAddress(publicKeyHex: string): string {
  const pubKeyBytes = new Uint8Array(
    publicKeyHex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || [],
  )
  const shaHash = nobleSha256(pubKeyBytes)
  const hash160 = ripemd160(shaHash)
  const versionedPayload = new Uint8Array([0x00, ...hash160])
  const checksum = nobleSha256(nobleSha256(versionedPayload)).slice(0, 4)
  return base58Encode(new Uint8Array([...versionedPayload, ...checksum]))
}

const BASE58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

function base58Encode(buffer: Uint8Array): string {
  let hex = Array.from(buffer)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  let x = BigInt('0x' + hex)
  let result = ''
  while (x > 0n) {
    const [quotient, remainder] = [x / 58n, x % 58n]
    result = BASE58_ALPHABET[Number(remainder)] + result
    x = quotient
  }
  return result
}
