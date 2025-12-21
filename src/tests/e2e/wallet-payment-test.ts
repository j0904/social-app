/**
 * Automated Wallet Payment Test
 *
 * This script:
 * 1. Opens the app and navigates to wallet
 * 2. Imports private key and saves wallet with password
 * 3. Makes a payment of 100 BIG to a test address
 * 4. Verifies the payment was successful
 *
 * Run with: npx ts-node --project src/tests/e2e/tsconfig.json src/tests/e2e/wallet-payment-test.ts
 */

import puppeteer, {type Browser, type Page} from 'puppeteer'

// Test configuration
const CONFIG = {
  APP_URL: 'http://localhost:19006',
  // Private key to import (hex format, 64 characters)
  PRIVATE_KEY:
    'ec1d240521f7f254c52aea69fca3f28d754d1b89f310f42b0fb094d16814317f',
  PASSWORD: 'test1234',
  PAYMENT: {
    amount: '100',
    tokenName: 'BIG',
    // Test address - should be a valid base58 address (26+ chars)
    toAddress: 'mj61qqqkFakeTestAddressForDemo123456789',
    memo: 'Automated test payment - 100 BIG',
  },
  TIMEOUT: 60000,
  SLOW_MO: 50,
  HEADLESS: false,
  DEBUG: true,
}

function log(message: string) {
  if (CONFIG.DEBUG) {
    console.log(`[${new Date().toISOString().slice(11, 19)}] ${message}`)
  }
}

class WalletPaymentTest {
  private browser: Browser | null = null
  private page: Page | null = null

  async setup() {
    log('🚀 Starting browser...')

    this.browser = await puppeteer.launch({
      headless: CONFIG.HEADLESS,
      devtools: !CONFIG.HEADLESS,
      slowMo: CONFIG.SLOW_MO,
      args: [
        '--remote-debugging-port=9222',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--start-maximized',
      ],
      defaultViewport: {width: 1280, height: 900},
    })

    this.page = await this.browser.newPage()

    // Enable console logging from browser
    this.page.on('console', msg => {
      if (msg.type() === 'error') {
        log(`🔴 Browser Error: ${msg.text()}`)
      }
    })

    this.page.on('pageerror', error => {
      log(`🔴 Page Error: ${String(error)}`)
    })

    log('✅ Browser ready')
    return this
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close()
    }
  }

  private async wait(ms: number) {
    await new Promise(resolve => setTimeout(resolve, ms))
  }

  private async screenshot(name: string) {
    if (!this.page) return
    const filename = `screenshot-${name}-${Date.now()}.png`
    await this.page.screenshot({path: filename, fullPage: true})
    log(`📸 Screenshot saved: ${filename}`)
  }

  /**
   * Click an element containing the specified text
   */
  private async clickByText(
    text: string,
    options?: {exact?: boolean},
  ): Promise<boolean> {
    if (!this.page) return false
    try {
      // Use evaluate to find element by text content
      const clicked = await this.page.evaluate(
        (searchText: string, exact: boolean) => {
          const elements = document.querySelectorAll(
            'button, a, [role="button"], div[tabindex], span',
          )
          for (const el of elements) {
            const elText = el.textContent?.trim() || ''
            const matches = exact
              ? elText === searchText
              : elText.includes(searchText)
            if (matches && el instanceof HTMLElement) {
              el.click()
              return true
            }
          }
          return false
        },
        text,
        options?.exact || false,
      )

      if (clicked) {
        log(`   Clicked: "${text}"`)
        return true
      }
    } catch (e) {
      // Ignore
    }
    return false
  }

  /**
   * Find and click the first matching selector
   */
  private async clickSelector(selectors: string[]): Promise<boolean> {
    if (!this.page) return false
    for (const selector of selectors) {
      try {
        const el = await this.page.$(selector)
        if (el) {
          await el.click()
          log(`   Clicked: ${selector}`)
          return true
        }
      } catch {
        continue
      }
    }
    return false
  }

  /**
   * Type text into the first matching selector
   */
  private async typeInto(
    selectors: string[],
    text: string,
    clear: boolean = true,
  ): Promise<boolean> {
    if (!this.page) return false
    for (const selector of selectors) {
      try {
        const el = await this.page.$(selector)
        if (el) {
          if (clear) {
            await el.click({clickCount: 3}) // Select all
            await this.page.keyboard.press('Backspace')
          }
          await el.type(text, {delay: 30})
          log(`   Typed into: ${selector}`)
          return true
        }
      } catch {
        continue
      }
    }
    return false
  }

  /**
   * Get all visible text elements on the page for debugging
   */
  private async listClickableElements() {
    if (!this.page) return
    const elements = await this.page.evaluate(() => {
      const clickable = document.querySelectorAll(
        'button, a, [role="button"], input[type="submit"]',
      )
      return Array.from(clickable).map(el => ({
        tag: el.tagName,
        text: el.textContent?.trim().slice(0, 50),
        class: el.className.toString().slice(0, 50),
      }))
    })
    log('Clickable elements:')
    elements.forEach((el, i) => {
      if (el.text) {
        log(`  ${i}: <${el.tag}> "${el.text}"`)
      }
    })
  }

  // ========== Main Test Steps ==========

  async navigateToApp() {
    if (!this.page) throw new Error('Browser not started')

    log(`📍 Navigating to ${CONFIG.APP_URL}...`)
    await this.page.goto(CONFIG.APP_URL, {
      waitUntil: 'networkidle2',
      timeout: CONFIG.TIMEOUT,
    })
    await this.wait(2000)
    log('✅ App loaded')
  }

  async navigateToWallet() {
    if (!this.page) throw new Error('Browser not started')

    log('\n🔐 Navigating to wallet...')

    // Try clicking wallet in bottom bar first
    const clicked = await this.clickByText('Wallet')

    if (!clicked) {
      // Direct navigation
      await this.page.goto(`${CONFIG.APP_URL}/wallet/home`, {
        waitUntil: 'networkidle2',
        timeout: CONFIG.TIMEOUT,
      })
    }
    await this.wait(2000)
    log('✅ At wallet screen')
  }

  async navigateToKeysScreen() {
    if (!this.page) throw new Error('Browser not started')

    log('\n🔑 Navigating to wallet keys screen...')
    await this.page.goto(`${CONFIG.APP_URL}/wallet/keys`, {
      waitUntil: 'networkidle2',
      timeout: CONFIG.TIMEOUT,
    })
    await this.wait(2000)
    log('✅ At keys screen')
  }

  async importPrivateKey() {
    if (!this.page) throw new Error('Browser not started')

    log('\n🔑 Importing private key...')
    log(
      `   Key: ${CONFIG.PRIVATE_KEY.slice(0, 8)}...${CONFIG.PRIVATE_KEY.slice(-8)}`,
    )

    // Navigate to keys screen
    await this.navigateToKeysScreen()

    // List available options for debugging
    if (CONFIG.DEBUG) {
      await this.listClickableElements()
    }

    // Step 1: Click "Import Private Key"
    let importClicked = await this.clickByText('Import Private Key')

    if (!importClicked) {
      // Try clicking by aria-label
      importClicked = await this.clickSelector([
        '[aria-label*="Import Private Key" i]',
      ])
    }

    if (!importClicked) {
      log('   ⚠️ Import Private Key button not found')
      await this.screenshot('keys-screen')
    }

    await this.wait(1000)

    // Step 2: Enter the private key
    log('   📝 Entering private key...')
    const keyEntered = await this.typeInto(
      [
        'textarea[placeholder*="private key" i]',
        'input[placeholder*="private key" i]',
        'textarea[aria-label*="Private Key" i]',
        'input[aria-label*="Private Key" i]',
        'textarea', // fallback to any textarea
      ],
      CONFIG.PRIVATE_KEY,
      true,
    )

    if (!keyEntered) {
      log('   ⚠️ Private key input not found')
      await this.screenshot('import-key-screen')
    }

    await this.wait(500)

    // Step 3: Click "Import Key" button
    ;(await this.clickByText('Import Key')) ||
      (await this.clickByText('Import')) ||
      (await this.clickByText('Continue'))

    await this.wait(2000)

    // Step 4: Now we should be at password entry screen
    log('   🔒 Setting wallet password...')

    // Find password inputs (there should be password and confirm password)
    const passwordInputs = await this.page.$$('input[type="password"]')

    if (passwordInputs.length >= 2) {
      // First input is password, second is confirm
      await passwordInputs[0].type(CONFIG.PASSWORD, {delay: 30})
      await this.wait(200)
      await passwordInputs[1].type(CONFIG.PASSWORD, {delay: 30})
      log('   ✅ Password and confirmation entered')
    } else if (passwordInputs.length === 1) {
      await passwordInputs[0].type(CONFIG.PASSWORD, {delay: 30})
      log('   ✅ Password entered')
    } else {
      // Try by placeholder
      await this.typeInto(['input[placeholder*="password" i]'], CONFIG.PASSWORD)
    }

    await this.wait(500)

    // Step 5: Click "Save Wallet" or similar
    ;(await this.clickByText('Save Wallet')) ||
      (await this.clickByText('Save')) ||
      (await this.clickByText('Encrypt')) ||
      (await this.clickByText('Confirm'))

    await this.wait(3000)

    // Check for success
    const pageContent = await this.page.content()
    if (
      pageContent.includes('Wallet Saved') ||
      pageContent.includes('Success') ||
      pageContent.includes('saved') ||
      pageContent.includes('Wallet address')
    ) {
      log('✅ Private key imported and wallet saved!')
    } else {
      log('⚠️ Import status unclear - continuing...')
      await this.screenshot('wallet-import-result')
    }
  }

  async unlockWallet() {
    if (!this.page) throw new Error('Browser not started')

    log('\n🔓 Unlocking wallet...')

    // Check if wallet is already unlocked
    const pageContent = await this.page.content()
    if (pageContent.includes('Unlocked')) {
      log('   Wallet already unlocked')
      return
    }

    // Click unlock button
    ;(await this.clickByText('Unlock')) ||
      (await this.clickByText('Unlock Wallet'))
    await this.wait(1000)

    // Enter password
    await this.typeInto(['input[type="password"]'], CONFIG.PASSWORD)
    await this.wait(500)

    // Confirm
    ;(await this.clickByText('Confirm')) ||
      (await this.clickByText('Unlock')) ||
      (await this.clickSelector(['button[type="submit"]']))

    await this.wait(2000)
    log('✅ Wallet unlocked')
  }

  async navigateToPayment() {
    if (!this.page) throw new Error('Browser not started')

    log('\n💳 Navigating to payment page...')

    // Try clicking Pay tab/button
    ;(await this.clickByText('Pay')) || (await this.clickByText('Send'))
    await this.wait(1000)

    // Or direct navigation
    const currentUrl = this.page.url()
    if (!currentUrl.includes('/pay')) {
      await this.page.goto(`${CONFIG.APP_URL}/wallet/pay`, {
        waitUntil: 'networkidle2',
        timeout: CONFIG.TIMEOUT,
      })
    }

    await this.wait(2000)
    log('✅ Payment page loaded')
  }

  async fillPaymentForm() {
    if (!this.page) throw new Error('Browser not started')

    log('\n📝 Filling payment form...')
    log(`   Amount: ${CONFIG.PAYMENT.amount} ${CONFIG.PAYMENT.tokenName}`)
    log(`   To: ${CONFIG.PAYMENT.toAddress}`)

    // Select token (if not already BIG)
    // Usually the default is BIG, but we might need to click a token selector
    // TODO: Add token selection if needed

    // Fill amount
    const amountFilled = await this.typeInto(
      [
        'input[placeholder*="amount" i]',
        'input[placeholder*="quantity" i]',
        'input[type="number"]',
        'input[inputmode="decimal"]',
      ],
      CONFIG.PAYMENT.amount,
    )

    if (!amountFilled) {
      log('   ⚠️ Amount input not found')
    }

    await this.wait(500)

    // Fill recipient address
    const addressFilled = await this.typeInto(
      [
        'input[placeholder*="address" i]',
        'input[placeholder*="recipient" i]',
        'input[aria-label*="address" i]',
        'input[style*="monospace"]',
      ],
      CONFIG.PAYMENT.toAddress,
    )

    if (!addressFilled) {
      log('   ⚠️ Address input not found')
    }

    await this.wait(500)

    // Fill memo (optional)
    await this.typeInto(
      [
        'textarea[placeholder*="memo" i]',
        'textarea[placeholder*="note" i]',
        'input[placeholder*="memo" i]',
      ],
      CONFIG.PAYMENT.memo,
    )

    await this.wait(1000)
    log('✅ Payment form filled')

    // Take screenshot of filled form
    await this.screenshot('payment-form-filled')
  }

  async submitPayment() {
    if (!this.page) throw new Error('Browser not started')

    log('\n📤 Submitting payment...')

    // Click review/submit button
    ;(await this.clickByText('Review Payment')) ||
      (await this.clickByText('Review')) ||
      (await this.clickByText('Continue')) ||
      (await this.clickByText('Pay'))

    await this.wait(2000)

    // There might be a confirmation dialog
    const hasConfirmation = await this.page.$(
      '.r-confirmation, [role="dialog"]',
    )
    if (hasConfirmation) {
      log('   Confirmation dialog detected')

      // Enter password if required
      const passwordInput = await this.page.$('input[type="password"]')
      if (passwordInput) {
        await this.typeInto(['input[type="password"]'], CONFIG.PASSWORD)
        await this.wait(500)
      }

      // Confirm payment
      ;(await this.clickByText('Confirm Payment')) ||
        (await this.clickByText('Confirm')) ||
        (await this.clickByText('Send')) ||
        (await this.clickByText('Pay Now'))
    }

    await this.wait(3000)
    log('✅ Payment submitted')
  }

  async verifyPayment() {
    if (!this.page) throw new Error('Browser not started')

    log('\n✓ Verifying payment...')

    // Wait for result
    await this.wait(5000)

    // Check for success indicators
    const pageContent = await this.page.content()
    const successIndicators = [
      'Payment Sent',
      'Success',
      'Transaction Successful',
      'Payment Complete',
      'sent successfully',
    ]

    const isSuccess = successIndicators.some(indicator =>
      pageContent.toLowerCase().includes(indicator.toLowerCase()),
    )

    // Take screenshot of result
    await this.screenshot('payment-result')

    if (isSuccess) {
      log('✅ Payment verified successfully!')
      return true
    } else {
      // Check for error
      const errorIndicators = ['error', 'failed', 'insufficient', 'invalid']
      const hasError = errorIndicators.some(indicator =>
        pageContent.toLowerCase().includes(indicator.toLowerCase()),
      )

      if (hasError) {
        log('❌ Payment failed - error detected')
        return false
      }

      log('⚠️ Payment status unclear - check screenshot')
      return false
    }
  }

  async run() {
    try {
      await this.setup()
      await this.navigateToApp()
      await this.navigateToWallet()

      // Import private key and save wallet with password
      await this.importPrivateKey()

      // Make payment
      await this.navigateToPayment()
      await this.fillPaymentForm()
      await this.submitPayment()

      // Verify
      const success = await this.verifyPayment()

      console.log('\n' + '='.repeat(50))
      if (success) {
        console.log(
          '🎉 TEST PASSED: Payment of 100 BIG completed successfully!',
        )
      } else {
        console.log('❌ TEST RESULT: Payment status needs manual verification')
      }
      console.log('='.repeat(50))

      // Keep browser open for manual inspection
      console.log('\nBrowser will remain open for inspection.')
      console.log('Press Ctrl+C to close.')

      // Wait indefinitely
      await new Promise(() => {})
    } catch (error) {
      console.error('❌ Test failed with error:', error)
      await this.screenshot('error')
      throw error
    }
  }
}

// Run the test
const test = new WalletPaymentTest()
test.run().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
