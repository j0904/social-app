import { sha256 as nobleSha256 } from '@noble/hashes/sha256';
import { sign } from '@noble/secp256k1';
import { HDKey } from '@scure/bip32';
import { generateMnemonic, mnemonicToSeedSync } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';


export interface HDWallet {
  readonly mnemonic: string;
  readonly publicKey: string;
  readonly did: string;
  derivePath(path: string): HDWallet;
  signMessage(message: string): Uint8Array;
}

export function generateWalletMnemonic(): string {
  return generateMnemonic(wordlist, 256);
}

export function createWalletFromMnemonic(mnemonic: string): HDWallet {
  const seed = mnemonicToSeedSync(mnemonic);
  const root = HDKey.fromMasterSeed(seed);

  return {
    mnemonic,
    publicKey: bytesToHex(root.publicKey!),
    did: `did:key:${bytesToHex(root.publicKey!)}`,
    derivePath(path: string) {
      const childNode = root.derive(path);
      return createWalletFromNode(childNode, mnemonic);
    },
    signMessage(message: string): Uint8Array {
      if (!root.privateKey) throw new Error('Missing private key');
      return sign(nobleSha256(message), root.privateKey!)!.toCompactRawBytes()! as Uint8Array;
    }
  };
}

function createWalletFromNode(node: HDKey, mnemonic: string): HDWallet {
  return {
    mnemonic,
    publicKey: bytesToHex(node.publicKey!),
    did: `did:key:${bytesToHex(node.publicKey!)}`,
    derivePath(path: string) {
      return createWalletFromNode(node.derive(path), mnemonic);
    },
    signMessage(message: string): Uint8Array {
      if (!node.privateKey) throw new Error('Missing private key');
      return sign(sha256(message), node.privateKey!)!.toCompactRawBytes()! as Uint8Array;
    }
  };
}

export function getPublicKey(): Promise<string> {
  // Temporary mock implementation
  return Promise.resolve('03ab5f5798f2d3d12b19dca4e1b05d9a4cacf6853a7c67a6d6f7d7c9e9b0d1e2f3')
}

export function getPublicKeyFromMnemonic(mnemonic: string): string {
  const wallet = createWalletFromMnemonic(mnemonic);
  return wallet.derivePath("m/44'/0'/0'/0/0").publicKey;
}

// React Native compatible utilities
function sha256(message: string): Uint8Array {
  return nobleSha256(new TextEncoder().encode(message));
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Wallet serialization functions
export interface SerializedWallet {
  address: string;
  encryptedMnemonic: string;
}

export function loadHDWalletFromFile(fileData: string): HDWallet {
  try {
    const {encryptedMnemonic}: SerializedWallet = JSON.parse(fileData);
    // TODO: Implement actual decryption
    return createWalletFromMnemonic(encryptedMnemonic);
  } catch (e) {
    throw new Error('Invalid wallet file format');
  }
}

export function saveHDWalletToFile(wallet: HDWallet): string {
  // TODO: Implement actual encryption
  const serialized: SerializedWallet = {
    address: wallet.derivePath("m/44'/0'/0'/0/0").publicKey,
    encryptedMnemonic: wallet.mnemonic
  };
  return JSON.stringify(serialized, null, 2);
}
