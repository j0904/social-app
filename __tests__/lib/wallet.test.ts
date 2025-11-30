import {
  createWallet,
  generateWalletMnemonic,
  loadWallet,
  saveHDWalletToFile,
  type WalletFile,
} from '../../src/lib/wallet'

describe('HDWallet', () => {
  let testMnemonic: string
  let testWallet: WalletFile

  beforeAll(() => {
    testMnemonic = generateWalletMnemonic()
    testWallet = createWallet(testMnemonic)
  })

  test('generates valid 24-word mnemonic', () => {
    expect(testMnemonic.split(' ').length).toBe(24)
  })

  test('generates new account with valid properties', () => {
    const account = createWallet(generateWalletMnemonic())
    expect(account.wallet.mnemonic.split(' ').length).toBe(24)
    expect(account.wallet.publicKey).toMatch(/^[0-9a-f]+$/)
    expect(account.wallet.privateKey).toMatch(/^[0-9a-f]+$/)
    expect(account.credentials.user).toContain('@bigt.ai')
  })

  test('creates wallet with correct credentials', () => {
    expect(testWallet.wallet).toHaveProperty('publicKey')
    expect(testWallet.wallet).toHaveProperty('privateKey')
    expect(testWallet.credentials.url).toMatch(/^https?:\/\//)
    expect(testWallet.credentials.user).toMatch(/@bigt\.ai$/)
    expect(testWallet.credentials.password).toHaveLength(64)
  })

  test('saves and loads wallet with credentials', () => {
    const walletData = saveHDWalletToFile(testWallet, 'test123')
    const loadedWallet = loadWallet(walletData)

    expect(loadedWallet.wallet.publicKey).toBe(testWallet.wallet.publicKey)
    expect(loadedWallet.wallet.privateKey).toBe(testWallet.wallet.privateKey)
    expect(loadedWallet.credentials).toEqual(testWallet.credentials)
  })

  test('signs messages consistently', () => {
    const message = 'Test message for cryptographic signing'
    const signature1 = testWallet.wallet.signMessage(message)
    const signature2 = testWallet.wallet.signMessage(message)

    expect(signature1).toEqual(signature2)
    expect(signature1.length).toBe(64)
  })

  test('rejects invalid mnemonics', () => {
    expect(() => createWallet('invalid mnemonic phrase')).toThrow()
  })

  test('handles invalid wallet files', () => {
    expect(() => loadWallet('invalid json')).toThrow()
    expect(() => loadWallet('{}')).toThrow('No key found in wallet file')
  })
})
