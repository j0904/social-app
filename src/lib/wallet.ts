import { randomBytes } from '@noble/ciphers/webcrypto'
import { secp256k1 } from '@noble/curves/secp256k1'
import { ripemd160 } from '@noble/hashes/ripemd160'
import { sha256 as nobleSha256 } from '@noble/hashes/sha256'
import { generateMnemonic, mnemonicToSeedSync } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english'

// Utility function for creating SHA256 hash of string
function sha256(message: string): Uint8Array {
  return nobleSha256(new TextEncoder().encode(message))
}

export interface CredentialEntry {
  url: string;
  user: string;
  password: string;
}

export interface HDWallet {
  readonly mnemonic: string;
  readonly publicKey: string;
  readonly privateKey: string;
  derivePath(path: string): HDWallet;
  signMessage(message: string): Uint8Array;
}

export interface WalletFile {
  wallet: HDWallet;
  credentials: CredentialEntry;
}

export function generateWalletMnemonic(): string {
  return generateMnemonic(wordlist, 256);
}

export function generateNewAccount(): WalletFile {
  const mnemonic = generateWalletMnemonic();
  return createWallet(mnemonic);
}

export function createWallet(mnemonic: string): WalletFile {
  if (mnemonic.split(' ').length < 12) {
    throw new Error('Invalid mnemonic - must contain at least 12 words');
  }

  // Generate keys from mnemonic using noble/crypto libraries
  // Configure HMAC-SHA256 for secp256k1 (similar to original hdwallet.ts)
  const hmacSha256Sync = (
    key: Uint8Array,
    ...msgs: Uint8Array[]
  ): Uint8Array => {
    const h = nobleSha256.create()
    h.update(key)
    msgs.forEach(m => h.update(m))
    return h.digest()
  }

  // Safely assign hmacSha256Sync if the utils object exists
  if (secp256k1.utils) {
    (secp256k1.utils as any).hmacSha256Sync = hmacSha256Sync;
  }

  const seedBytes = mnemonicToSeedSync(mnemonic);
  const privateKeyBytes = nobleSha256(seedBytes);
  const publicKeyBytes = secp256k1.getPublicKey(privateKeyBytes, true); // compressed

  const publicKeyHex = Array.from(publicKeyBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  const privateKeyHex = Array.from(privateKeyBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  const wallet: HDWallet = {
    mnemonic,
    publicKey: publicKeyHex,
    privateKey: privateKeyHex,
    derivePath: (_path: string): HDWallet => {
      return {
        mnemonic,
        publicKey: publicKeyHex,
        privateKey: privateKeyHex,
        derivePath: (_subPath: string) => {
          return wallet.derivePath(_subPath);
        },
        signMessage: (message: string): Uint8Array => {
          // Use secp256k1 to sign the message using the same pattern as original
          return secp256k1.sign(sha256(message), privateKeyBytes).toCompactRawBytes();
        },
      };
    },
    signMessage: (message: string): Uint8Array => {
      // Use secp256k1 to sign the message using the same pattern as original
      return secp256k1.sign(sha256(message), privateKeyBytes).toCompactRawBytes();
    },
  };

  const credentials: CredentialEntry = {
    url: 'https://wallet.bigt.ai',
    user: publicKeyToBitcoinAddress(publicKeyHex) + '@bigt.ai',
    password: Array.from(randomBytes(32))
      .map(b => b.toString(16).padStart(2, '0'))
      .join(''),
  };

  return {wallet, credentials};
}

export interface SerializedWallet {
  keys: Array<{publicKey: string; privateKey: string}>;
  credentials: CredentialEntry;
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
  };
  return JSON.stringify(serialized, null, 2);
}

export function loadWallet(fileData: string): WalletFile {
  let parsed: SerializedWallet;
  try {
    parsed = JSON.parse(fileData);
  } catch (e) {
    throw new Error('Invalid wallet file format');
  }

  if (!parsed.keys?.length) {
    throw new Error('No key found in wallet file');
  }

  const key = parsed.keys[0];

  // Parse private key from hex string
  const privateKeyBytes = new Uint8Array(
    key.privateKey.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || [],
  );

  const wallet: HDWallet = {
    mnemonic: '',
    publicKey: key.publicKey,
    privateKey: key.privateKey,
    signMessage: (message: string): Uint8Array => {
      // Use secp256k1 to sign the message using the same pattern as original
      if (!privateKeyBytes || privateKeyBytes.length === 0) throw new Error('Missing private key');
      return secp256k1.sign(sha256(message), privateKeyBytes).toCompactRawBytes();
    },
    derivePath: (_path: string): HDWallet => {
      return {
        mnemonic: '',
        publicKey: key.publicKey,
        privateKey: key.privateKey,
        signMessage: (message: string): Uint8Array => {
          // Same implementation using noble
          if (!privateKeyBytes || privateKeyBytes.length === 0) throw new Error('Missing private key');
          return secp256k1.sign(sha256(message), privateKeyBytes).toCompactRawBytes();
        },
        derivePath: (_subPath: string) => {
          return wallet.derivePath(_subPath);
        },
      };
    },
  };

  return {
    wallet,
    credentials: parsed.credentials,
  };
}

// Utility functions
function publicKeyToBitcoinAddress(publicKeyHex: string): string {
  const pubKeyBytes = new Uint8Array(
    publicKeyHex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || [],
  );
  const shaHash = nobleSha256(pubKeyBytes);
  const hash160 = ripemd160(shaHash);
  const versionedPayload = new Uint8Array([0x00, ...hash160]);
  const checksum = nobleSha256(nobleSha256(versionedPayload)).slice(0, 4);
  return base58Encode(new Uint8Array([...versionedPayload, ...checksum]));
}

const BASE58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Encode(buffer: Uint8Array): string {
  let hex = Array.from(buffer)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  let x = BigInt('0x' + hex);
  let result = '';
  while (x > 0n) {
    const [quotient, remainder] = [x / 58n, x % 58n];
    result = BASE58_ALPHABET[Number(remainder)] + result;
    x = quotient;
  }
  return result;
}