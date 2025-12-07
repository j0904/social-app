declare module 'bigtangle-ts' {
  export interface WalletInfo {
    address: string;
    publicKey: string;
    privateKey: string;
    ethAddress?: string;
  }

  export interface KeyPair {
    address: string;
    publicKey: string;
    privateKey: string;
  }

  export class BigTangle {
    constructor();
    generateWallet(): Promise<WalletInfo>;
    generateKeyPair(): Promise<KeyPair>;
    // Add other methods as needed based on actual library API
  }
}