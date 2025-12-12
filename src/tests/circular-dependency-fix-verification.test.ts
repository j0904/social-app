/**
 * Test to verify the fix for the "Cannot access 'Coin' before initialization" circular dependency issue
 *
 * This test ensures that the changes were made properly to address the circular dependency.
 */

import fs from 'fs'
import path from 'path'

describe('Circular Dependency Fix Verification', () => {
  const hdwalletPath = path.join(__dirname, '../screens/wallet/hdwallet.ts')

  it('should have replaced static imports with dynamic imports in hdwallet.ts', () => {
    const content = fs.readFileSync(hdwalletPath, 'utf8')

    // Verify that the old static imports are no longer present
    expect(content).not.toMatch(/import {.*} from 'bigtangle-ts'/)
    expect(content).not.toMatch(/from 'bigtangle-ts'/)

    // Verify that dynamic imports are present
    expect(content).toMatch(/await import\('bigtangle-ts'\)/)
    expect(content).toMatch(/const bigtangle = await import\('bigtangle-ts'\)/)
  })

  it('should have made functions async to handle dynamic imports', () => {
    const content = fs.readFileSync(hdwalletPath, 'utf8')

    // Verify that functions are now async
    expect(content).toMatch(/export async function createWallet/)
    expect(content).toMatch(/export async function saveKeyToFile/)
    expect(content).toMatch(/export async function loadWallet/)

    // Verify that functions return Promise types
    expect(content).toMatch(/Promise<WalletFile>/) // createWallet return type
    expect(content).toMatch(/Promise<string>/) // saveKeyToFile return type
  })

  it('should use dynamic bigtangle-ts imports inside functions', () => {
    const content = fs.readFileSync(hdwalletPath, 'utf8')

    // Check that the functions now use dynamic imports internally
    expect(content).toMatch(/const bigtangle = await import\('bigtangle-ts'\)/)
    expect(content).toMatch(/bigtangle\.ECKey\.createNewKey\(\)/)
    expect(content).toMatch(/bigtangle\.Address\.fromKey/)
    expect(content).toMatch(/bigtangle\.TestNetParams\.get\(\)/)
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
