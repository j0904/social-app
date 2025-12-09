declare module 'bigtangle-ts' {
  interface WalletInfo {
    address: string
    publicKey: string
    privateKey: string
    ethAddress?: string
  }

  interface KeyPair {
    address: string
    publicKey: string
    privateKey: string
  }

  class BigTangle {
    constructor()

    /**
     * Generate a new wallet with address, public key, and private key
     */
    generateWallet(): Promise<WalletInfo>

    /**
     * Generate a new key pair
     */
    generateKeyPair(): Promise<KeyPair>

    /**
     * Validate if an address is valid
     */
    validateAddress(address: string): Promise<boolean>

    /**
     * Derive an address from a public key
     */
    deriveAddress(publicKey: string, index: number): Promise<string>

    /**
     * Encrypt data with a password
     */
    encrypt(data: string, password: string): Promise<string>

    /**
     * Decrypt data with a password
     */
    decrypt(encryptedData: string, password: string): Promise<string>

    /**
     * Sign a message with a private key
     */
    signMessage(message: string, privateKey: string): Promise<string>

    /**
     * Verify a signature
     */
    verifySignature(
      message: string,
      signature: string,
      publicKey: string,
    ): Promise<boolean>
  }

  export {BigTangle}
  export default BigTangle
}
