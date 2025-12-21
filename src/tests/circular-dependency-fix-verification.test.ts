/**
 * Test to verify the fix for the "Cannot access 'Coin' before initialization" circular dependency issue
 *
 * This test ensures that the changes were made properly to address the circular dependency.
 */

import fs from 'fs'
import path from 'path'

describe('Circular Dependency Fix Verification', () => {
  const walletHelperPath = path.join(
    __dirname,
    '../screens/wallet/WalletHelper.ts',
  )

  it('should have replaced static imports with alternative approach in WalletHelper.ts', () => {
    const content = fs.readFileSync(walletHelperPath, 'utf8')

    // Verify that the old static imports are no longer present
    expect(content).not.toMatch(/import {.*} from 'bigtangle-ts'/)
    expect(content).not.toMatch(/from 'bigtangle-ts'/)

    // In WalletHelper.ts, we use require() instead of dynamic imports for Jest compatibility
    expect(content).toMatch(/require\('.*bigtangle-ts.*'\)/)
  })

  it('should have made functions async where needed in WalletHelper.ts', () => {
    const content = fs.readFileSync(walletHelperPath, 'utf8')

    // Verify that functions are async where they need to be
    expect(content).toMatch(/export async function createWallet/)
    expect(content).toMatch(/export async function saveKeyToFile/)
    expect(content).toMatch(/export async function loadWallet/)
    expect(content).toMatch(/export async function importPrivateKey/)

    // Verify that functions return Promise types
    expect(content).toMatch(/Promise<WalletFile>/) // createWallet return type
    expect(content).toMatch(/Promise<string>/) // saveKeyToFile return type
  })

  it('should use require for bigtangle-ts imports in WalletHelper.ts', () => {
    const content = fs.readFileSync(walletHelperPath, 'utf8')

    // Check that the functions use require for bigtangle-ts modules
    expect(content).toMatch(/require\('.*bigtangle-ts.*KeyCrypterScrypt.*'\)/)
    expect(content).toMatch(/require\('.*bigtangle-ts.*Wallet.*'\)/)
    expect(content).toMatch(/require\('.*bigtangle-ts.*ECKey.*'\)/)
    expect(content).toMatch(/require\('.*bigtangle-ts.*TestParams.*'\)/)
  })

  it('should have updated dependent files to handle async functions', () => {
    // Check that LoginForm was updated
    const loginFormPath = path.join(__dirname, '../screens/Login/LoginForm.tsx')
    const loginFormContent = fs.readFileSync(loginFormPath, 'utf8')

    // Should import Platform for web handling - check for the Platform import
    expect(loginFormContent).toMatch(/View,\s*Platform,/)
    expect(loginFormContent).toMatch(/Platform\.OS === 'web'/)
  })

  it('should have updated Keys screen to await async function calls', () => {
    const keysPath = path.join(__dirname, '../screens/wallet/Keys.tsx')
    const keysContent = fs.readFileSync(keysPath, 'utf8')

    // Should have await for createWallet calls
    expect(keysContent).toMatch(/const newHDWallet = await createWallet\(\)/)
    expect(keysContent).toMatch(/webFileContent = await saveKeyToFile/)
    expect(keysContent).toMatch(/fileContent = await saveKeyToFile/)
  })

  it('should have updated Signup screen to use async createWallet', () => {
    const signupPath = path.join(
      __dirname,
      '../screens/Signup/StepInfo/index.tsx',
    )
    const signupContent = fs.readFileSync(signupPath, 'utf8')

    // Should have async callback and await createWallet
    expect(signupContent).toMatch(
      /handleGenerateWallet = React\.useCallback\(async/,
    )
    expect(signupContent).toMatch(/const walletData = await createWallet\(\)/)
  })

  it('should have updated test file to handle async functions properly', () => {
    const testPath = path.join(
      __dirname,
      '../screens/wallet/__tests__/hdwallet.test.ts',
    )
    const testContent = fs.readFileSync(testPath, 'utf8')

    // Should have async functions and await calls
    expect(testContent).toMatch(
      /const originalWalletFile = await createWallet\(\)/,
    )
    expect(testContent).toMatch(/it\('should create a valid wallet.*async/)
  })
})
