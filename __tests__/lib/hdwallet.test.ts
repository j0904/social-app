import {
  addCredentialToWalletFile,
  createWalletFromMnemonic,
  type CredentialEntry,
  generateWalletMnemonic,
  loadCredentialsFromWalletFile,
  saveHDWalletToFile,
} from '../../src/lib/hdwallet'

describe('HDWallet', () => {
  it('should generate a mnemonic and create a wallet', () => {
    const mnemonic = generateWalletMnemonic()
    const wallet = createWalletFromMnemonic(mnemonic)
    expect(typeof mnemonic).toBe('string')
    expect(wallet).toHaveProperty('mnemonic', mnemonic)
    expect(typeof wallet.publicKey).toBe('string')
    expect(typeof wallet.derivePath).toBe('function')
    expect(typeof wallet.signMessage).toBe('function')
  })

  it('should save a wallet to file with public and private key', () => {
    const mnemonic = generateWalletMnemonic()
    const wallet = createWalletFromMnemonic(mnemonic)
    const password = 'testpass'
    const fileData = saveHDWalletToFile(wallet, password)
    const parsed = JSON.parse(fileData)
    expect(Array.isArray(parsed.keys)).toBe(true)
    expect(parsed.keys[0]).toHaveProperty('publicKey', wallet.publicKey)
    expect(parsed.keys[0]).toHaveProperty('privateKey')
    expect(Array.isArray(parsed.credentials)).toBe(true)
  })

  it('should add and update credentials for the same url+user', () => {
    const mnemonic = generateWalletMnemonic()
    const wallet = createWalletFromMnemonic(mnemonic)
    const password = 'testpass'
    let fileData = saveHDWalletToFile(wallet, password)
    const entry1: CredentialEntry = {
      url: 'https://example.com',
      user: 'a@example.com',
      password: 'pw1',
    }
    fileData = addCredentialToWalletFile(fileData, password, entry1)
    const entry2: CredentialEntry = {
      url: 'https://example.com',
      user: 'b@example.com',
      password: 'pw2',
    }
    fileData = addCredentialToWalletFile(fileData, password, entry2)
    const entry3: CredentialEntry = {
      url: 'https://example.com',
      user: 'a@example.com',
      password: 'pw3',
    }
    fileData = addCredentialToWalletFile(fileData, password, entry3)
     
    const creds = loadCredentialsFromWalletFile(fileData, password)
    expect(creds.length).toBe(2)
    expect(creds.find(c => c.user === 'a@example.com')!.password).toBe('pw3')
    expect(creds.find(c => c.user === 'b@example.com')!.password).toBe('pw2')
  })

  it('should keep credentials for different urls separate', () => {
    const mnemonic = generateWalletMnemonic()
    const wallet = createWalletFromMnemonic(mnemonic)
    const password = 'testpass'
    let fileData = saveHDWalletToFile(wallet, password)
    const entry1: CredentialEntry = {
      url: 'https://site1.com',
      user: 'a@site1.com',
      password: 'pw1',
    }
    const entry2: CredentialEntry = {
      url: 'https://site2.com',
      user: 'b@site2.com',
      password: 'pw2',
    }
    fileData = addCredentialToWalletFile(fileData, password, entry1)
    fileData = addCredentialToWalletFile(fileData, password, entry2)
     
    const creds = loadCredentialsFromWalletFile(fileData, password)
    expect(creds.length).toBe(2)
    expect(creds.find(c => c.url === 'https://site1.com')!.user).toBe(
      'a@site1.com',
    )
    expect(creds.find(c => c.url === 'https://site2.com')!.user).toBe(
      'b@site2.com',
    )
  })
})
