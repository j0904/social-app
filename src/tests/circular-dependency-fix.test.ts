/**
 * Test to verify the fix for the "Cannot access 'Coin' before initialization" circular dependency issue
 *
 * This test ensures that the bigtangle-ts library can be loaded without triggering
 * the circular dependency error that occurred during module initialization.
 */

describe('Circular Dependency Fix Test', () => {
  beforeEach(() => {
    jest.resetModules() // Reset modules to test import behavior
  })

  it('should load hdwallet functions without circular dependency error', async () => {
    // This test verifies that we can import and use the hdwallet functions
    // without encountering the "Cannot access 'Coin' before initialization" error

    // This will try to import the module without triggering the circular dependency issue
    const hdwallet = require('../screens/wallet/hdwallet')
    const {createWallet, saveKeyToFile, loadWallet} = hdwallet

    // Verify that the functions are properly defined
    expect(createWallet).toBeDefined()
    expect(saveKeyToFile).toBeDefined()
    expect(loadWallet).toBeDefined()

    // Verify that createWallet is now an async function
    expect(typeof createWallet).toBe('function')

    // Run a basic test to ensure createWallet works properly
    const wallet = await createWallet()

    // Verify the wallet has the expected structure
    expect(wallet).toBeDefined()
    expect(wallet.wallet).toBeDefined()
    expect(wallet.wallet.address).toBeDefined()
    expect(wallet.wallet.privateKey).toBeDefined()
    expect(wallet.credentials).toBeDefined()
    expect(wallet.credentials.user).toContain('@bigt.ai')
  })

  it('should create wallets with unique addresses', async () => {
    // Create multiple wallets to ensure each has a unique address
    const hdwallet = require('../screens/wallet/hdwallet')
    const wallet1 = await hdwallet.createWallet()
    const wallet2 = await hdwallet.createWallet()

    // Addresses should be different for different wallets
    expect(wallet1.wallet.address).not.toBe(wallet2.wallet.address)
    expect(wallet1.wallet.privateKey).not.toBe(wallet2.wallet.privateKey)
  })

  it('should save and load wallets without circular dependency issues', async () => {
    const hdwallet = require('../screens/wallet/hdwallet')
    const {createWallet, saveKeyToFile, loadWallet} = hdwallet

    // Create a wallet
    const originalWallet = await createWallet()
    const password = 'testpassword123'

    // Save the wallet to encrypted string
    const encryptedString = await saveKeyToFile(originalWallet, password)

    // Verify that the encrypted string was created
    expect(encryptedString).toBeDefined()
    expect(typeof encryptedString).toBe('string')
    expect(encryptedString.length).toBeGreaterThan(0)

    // Load the wallet back from the encrypted string
    const loadedWallet = await loadWallet(encryptedString, password)

    // Verify that the loaded wallet has the correct structure
    expect(loadedWallet).toBeDefined()
    expect(loadedWallet.wallet).toBeDefined()
    expect(loadedWallet.credentials).toBeDefined()

    // The private key and credentials should be preserved
    expect(loadedWallet.wallet.privateKey).toBe(
      originalWallet.wallet.privateKey,
    )
    expect(loadedWallet.credentials.url).toBe(originalWallet.credentials.url)
    expect(loadedWallet.credentials.user).toBe(originalWallet.credentials.user)
    expect(loadedWallet.credentials.password).toBe(
      originalWallet.credentials.password,
    )
  })

  it('should handle invalid wallet data gracefully', async () => {
    const hdwallet = require('../screens/wallet/hdwallet')

    // Test with invalid data
    await expect(
      hdwallet.loadWallet('invalid json', 'password'),
    ).rejects.toThrow()

    // Test with empty data
    await expect(hdwallet.loadWallet('', 'password')).rejects.toThrow()
  })

  it('should allow importing hdwallet without errors', () => {
    // This test ensures that the require itself doesn't trigger the circular dependency error
    // In the original problematic code, just importing would cause the error
    const hdwallet = require('../screens/wallet/hdwallet')
    expect(hdwallet).toBeDefined()
    expect(typeof hdwallet.createWallet).toBe('function')
  })
})
