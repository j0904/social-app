import {randomBytes} from '@noble/ciphers/webcrypto'

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

// Use dynamic imports to avoid circular dependency initialization issues with bigtangle-ts
export async function createWallet(): Promise<WalletFile> {
  // Dynamically import bigtangle-ts to avoid circular initialization issues
  const bigtangle = await import('bigtangle-ts')

  // Use TestNetParams as the default network parameters
  const networkParameters = bigtangle.TestNetParams.get()

  // Create a new EC key pair using bigtangle-ts
  const key = bigtangle.ECKey.createNewKey()
  // Generate an address from the key using the network parameters
  const addr = bigtangle.Address.fromKey(networkParameters, key).toString()

  const wallet: Key = {
    address: addr,
    privateKey: key.toString(), // Convert key to string representation for storage
  }

  const credentials: CredentialEntry = {
    url: 'https://wallet.bigt.ai',
    user: addr + '@bigt.ai', // Use the generated address instead of undefined variable
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

  const bigtangle = await import('bigtangle-ts')
  const raw = JSON.stringify(serialized, null, 2)
  const keyCrypter = new bigtangle.KeyCrypterScrypt()
  const key = keyCrypter.deriveKey(_password)
  const data = keyCrypter.encrypt(raw, key)
  return data
}

export async function loadWallet(
  fileData: string,
  _password: string,
): Promise<WalletFile> {
  const bigtangle = await import('bigtangle-ts')

  let parsed: SerializedWallet
  const keyCrypter = new bigtangle.KeyCrypterScrypt()
  const tmpkey = keyCrypter.deriveKey(_password)
  const raw = keyCrypter.decrypt(fileData, tmpkey)
  parsed = JSON.parse(raw)

  if (!parsed.keys?.length) {
    throw new Error('No key found in wallet file')
  }

  const key = parsed.keys[0]

  // Recreate the ECKey from the stored private key string
  // NOTE: This assumes there's a method to recreate key from string
  const privateKeyBytes = new Uint8Array(
    key.privateKey.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || [],
  )

  // Create new key from bytes if it's a hex string
  const ecKey =
    privateKeyBytes.length > 0
      ? bigtangle.ECKey.fromPrivate(privateKeyBytes, true) // compressed public key
      : bigtangle.ECKey.createNewKey() // fallback to new key

  const networkParameters = bigtangle.TestNetParams.get()
  const reconstructedAddress = bigtangle.Address.fromKey(
    networkParameters,
    ecKey,
  ).toString()

  const wallet: Key = {
    address: reconstructedAddress,
    privateKey: bigtangle.Utils.HEX.encode(ecKey.privateKey),
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
