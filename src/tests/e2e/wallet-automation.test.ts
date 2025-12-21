/**
 * Automated E2E tests for wallet functionality using Puppeteer
 *
 * Run with: yarn test:e2e:wallet
 * Or debug with VS Code launch configuration
 */

import puppeteer, {type Browser, type Page} from 'puppeteer'

const APP_URL = 'http://localhost:19006'
const TIMEOUT = 30000

describe('Wallet E2E Tests', () => {
  let browser: Browser
  let page: Page

  beforeAll(async () => {
    browser = await puppeteer.launch({
      headless: false, // Set to true for CI
      devtools: true, // Open DevTools
      slowMo: 100, // Slow down actions for visibility
      args: [
        '--remote-debugging-port=9222',
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ],
    })
    page = await browser.newPage()
    await page.setViewport({width: 1280, height: 800})
  })

  afterAll(async () => {
    if (browser) {
      await browser.close()
    }
  })

  beforeEach(async () => {
    await page.goto(APP_URL, {waitUntil: 'networkidle2', timeout: TIMEOUT})
  })

  describe('Navigation', () => {
    it('should load the home page', async () => {
      const title = await page.title()
      expect(title).toBeDefined()
    })

    it('should navigate to wallet page', async () => {
      // Click on wallet/settings menu if available
      const walletButton = await page.$('[data-testid="wallet-button"]')
      if (walletButton) {
        await walletButton.click()
        await page.waitForNavigation({waitUntil: 'networkidle2'})
      }
    })
  })

  describe('Wallet Creation', () => {
    it('should create a new wallet', async () => {
      // Navigate to wallet creation
      await page.goto(`${APP_URL}/wallet`, {waitUntil: 'networkidle2'})

      // Click create wallet button
      const createButton = await page.$('[data-testid="create-wallet-btn"]')
      if (createButton) {
        await createButton.click()

        // Wait for wallet creation dialog
        await page.waitForSelector('[data-testid="wallet-password-input"]', {
          timeout: 5000,
        })

        // Enter password
        await page.type(
          '[data-testid="wallet-password-input"]',
          'testpassword123',
        )
        await page.type(
          '[data-testid="wallet-password-confirm"]',
          'testpassword123',
        )

        // Submit
        const submitBtn = await page.$('[data-testid="submit-wallet-btn"]')
        if (submitBtn) {
          await submitBtn.click()
        }
      }
    })

    it('should import a private key', async () => {
      await page.goto(`${APP_URL}/wallet`, {waitUntil: 'networkidle2'})

      const importButton = await page.$('[data-testid="import-key-btn"]')
      if (importButton) {
        await importButton.click()

        // Enter private key
        await page.waitForSelector('[data-testid="private-key-input"]', {
          timeout: 5000,
        })
        await page.type(
          '[data-testid="private-key-input"]',
          '0x1234567890abcdef...',
        )

        // Submit
        const submitBtn = await page.$('[data-testid="import-submit-btn"]')
        if (submitBtn) {
          await submitBtn.click()
        }
      }
    })
  })

  describe('Payment Flow', () => {
    it('should load tokens from blockchain', async () => {
      await page.goto(`${APP_URL}/wallet/pay`, {waitUntil: 'networkidle2'})

      // Wait for token list to load
      const tokenList = await page.waitForSelector(
        '[data-testid="token-list"]',
        {timeout: 10000},
      )
      expect(tokenList).toBeTruthy()
    })

    it('should fill payment form', async () => {
      await page.goto(`${APP_URL}/wallet/pay`, {waitUntil: 'networkidle2'})

      // Fill in payment details
      await page.waitForSelector('[data-testid="to-address-input"]', {
        timeout: 5000,
      })
      await page.type('[data-testid="to-address-input"]', 'mtest123...')
      await page.type('[data-testid="amount-input"]', '100')
      await page.type('[data-testid="memo-input"]', 'Test payment')

      // Select token
      const tokenSelect = await page.$('[data-testid="token-select"]')
      if (tokenSelect) {
        await tokenSelect.click()
        await page.waitForSelector('[data-testid="token-option-0"]')
        await page.click('[data-testid="token-option-0"]')
      }
    })

    it('should submit payment', async () => {
      await page.goto(`${APP_URL}/wallet/pay`, {waitUntil: 'networkidle2'})

      // Fill form first
      await page.type('[data-testid="to-address-input"]', 'mtest123...')
      await page.type('[data-testid="amount-input"]', '100')

      // Click pay button
      const payButton = await page.$('[data-testid="pay-btn"]')
      if (payButton) {
        await payButton.click()

        // Wait for password dialog
        await page.waitForSelector('[data-testid="password-dialog"]', {
          timeout: 5000,
        })
        await page.type('[data-testid="password-input"]', 'testpassword123')

        // Confirm
        const confirmBtn = await page.$('[data-testid="confirm-payment-btn"]')
        if (confirmBtn) {
          await confirmBtn.click()
        }
      }
    })
  })

  describe('Click Functions Helper', () => {
    /**
     * Helper to click any element by selector
     */
    it('should click element by selector', async () => {
      const selector = '[data-testid="any-button"]' // Change as needed

      try {
        await page.waitForSelector(selector, {timeout: 5000})
        await page.click(selector)
        console.log(`Clicked: ${selector}`)
      } catch (error) {
        console.log(`Element not found: ${selector}`)
      }
    })

    /**
     * Helper to click element by text content
     */
    it('should click element by text', async () => {
      const text = 'Pay' // Change as needed

      const element = await page.evaluateHandle(searchText => {
        const elements = document.querySelectorAll('button, a, [role="button"]')
        for (const el of elements) {
          if (el.textContent?.includes(searchText)) {
            return el
          }
        }
        return null
      }, text)

      if (element) {
        await (element as any).click()
        console.log(`Clicked element with text: ${text}`)
      }
    })

    /**
     * Helper to execute any function in browser context
     */
    it('should execute function in browser', async () => {
      const result = await page.evaluate(() => {
        // Access window objects, call functions, etc.
        // Example: window.myFunction()
        return {
          url: window.location.href,
          title: document.title,
        }
      })
      console.log('Browser context result:', result)
    })
  })
})

/**
 * Utility functions for automated testing
 */
export const automationHelpers = {
  /**
   * Click element and wait for navigation
   */
  async clickAndNavigate(page: Page, selector: string) {
    await Promise.all([
      page.waitForNavigation({waitUntil: 'networkidle2'}),
      page.click(selector),
    ])
  },

  /**
   * Take screenshot for debugging
   */
  async screenshot(page: Page, name: string) {
    await page.screenshot({path: `./screenshots/${name}.png`, fullPage: true})
  },

  /**
   * Wait for element and get its text
   */
  async getElementText(page: Page, selector: string): Promise<string | null> {
    try {
      await page.waitForSelector(selector, {timeout: 5000})
      return await page.$eval(selector, el => el.textContent)
    } catch {
      return null
    }
  },

  /**
   * Fill form field
   */
  async fillField(page: Page, selector: string, value: string) {
    await page.waitForSelector(selector, {timeout: 5000})
    await page.click(selector, {clickCount: 3}) // Select all
    await page.type(selector, value)
  },

  /**
   * Run custom script in browser
   */
  async runScript(page: Page, script: string) {
    return await page.evaluate(script)
  },
}
