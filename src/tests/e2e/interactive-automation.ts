/**
 * Interactive Browser Automation Script
 *
 * This script allows you to automate Chrome interactions programmatically.
 * Run with: npx ts-node src/tests/e2e/interactive-automation.ts
 * Or use VS Code "Interactive Browser Automation" launch config
 */

import puppeteer, {type Browser, type Page} from 'puppeteer'
import * as readline from 'readline'

const APP_URL = 'http://localhost:19006'

class BrowserAutomation {
  private browser: Browser | null = null
  private page: Page | null = null

  async start() {
    console.log('🚀 Starting browser automation...')

    this.browser = await puppeteer.launch({
      headless: false,
      devtools: true,
      slowMo: 50,
      args: [
        '--remote-debugging-port=9222',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--start-maximized',
      ],
      defaultViewport: null,
    })

    this.page = await this.browser.newPage()
    await this.page.goto(APP_URL, {waitUntil: 'networkidle2'})

    console.log('✅ Browser ready!')
    console.log(`📍 URL: ${APP_URL}`)
    console.log('')

    return this
  }

  async stop() {
    if (this.browser) {
      await this.browser.close()
    }
  }

  /**
   * Click element by CSS selector
   */
  async click(selector: string) {
    if (!this.page) throw new Error('Browser not started')

    try {
      await this.page.waitForSelector(selector, {timeout: 5000})
      await this.page.click(selector)
      console.log(`✅ Clicked: ${selector}`)
    } catch (error) {
      console.log(`❌ Element not found: ${selector}`)
    }
  }

  /**
   * Click element by text content
   */
  async clickByText(text: string) {
    if (!this.page) throw new Error('Browser not started')

    const clicked = await this.page.evaluate(searchText => {
      const elements = document.querySelectorAll(
        'button, a, [role="button"], span, div',
      )
      for (const el of elements) {
        if (el.textContent?.trim() === searchText) {
          ;(el as HTMLElement).click()
          return true
        }
      }
      return false
    }, text)

    if (clicked) {
      console.log(`✅ Clicked element with text: "${text}"`)
    } else {
      console.log(`❌ Element with text not found: "${text}"`)
    }
  }

  /**
   * Type text into an input
   */
  async type(selector: string, text: string) {
    if (!this.page) throw new Error('Browser not started')

    try {
      await this.page.waitForSelector(selector, {timeout: 5000})
      await this.page.click(selector, {clickCount: 3})
      await this.page.type(selector, text)
      console.log(`✅ Typed into ${selector}: "${text}"`)
    } catch (error) {
      console.log(`❌ Input not found: ${selector}`)
    }
  }

  /**
   * Navigate to URL
   */
  async goto(url: string) {
    if (!this.page) throw new Error('Browser not started')

    const fullUrl = url.startsWith('http') ? url : `${APP_URL}${url}`
    await this.page.goto(fullUrl, {waitUntil: 'networkidle2'})
    console.log(`✅ Navigated to: ${fullUrl}`)
  }

  /**
   * Take screenshot
   */
  async screenshot(name: string = 'screenshot') {
    if (!this.page) throw new Error('Browser not started')

    const path = `./screenshots/${name}-${Date.now()}.png`
    await this.page.screenshot({path, fullPage: true})
    console.log(`✅ Screenshot saved: ${path}`)
  }

  /**
   * Get all clickable elements
   */
  async listClickables() {
    if (!this.page) throw new Error('Browser not started')

    const elements = await this.page.evaluate(() => {
      const clickables = document.querySelectorAll(
        'button, a, [role="button"], input[type="submit"]',
      )
      return Array.from(clickables).map((el, i) => ({
        index: i,
        tag: el.tagName,
        text: el.textContent?.trim().slice(0, 50),
        testId: el.getAttribute('data-testid'),
        className: el.className.slice(0, 50),
      }))
    })

    console.log('\n📋 Clickable elements:')
    elements.forEach(el => {
      console.log(
        `  [${el.index}] ${el.tag} - "${el.text}" ${el.testId ? `(testId: ${el.testId})` : ''}`,
      )
    })
    console.log('')
  }

  /**
   * Click element by index from listClickables
   */
  async clickByIndex(index: number) {
    if (!this.page) throw new Error('Browser not started')

    const clicked = await this.page.evaluate(idx => {
      const clickables = document.querySelectorAll(
        'button, a, [role="button"], input[type="submit"]',
      )
      if (clickables[idx]) {
        ;(clickables[idx] as HTMLElement).click()
        return true
      }
      return false
    }, index)

    if (clicked) {
      console.log(`✅ Clicked element at index: ${index}`)
    } else {
      console.log(`❌ No element at index: ${index}`)
    }
  }

  /**
   * Execute JavaScript in browser context
   */
  async eval(script: string) {
    if (!this.page) throw new Error('Browser not started')

    try {
      const result = await this.page.evaluate(script)
      console.log('✅ Result:', result)
      return result
    } catch (error) {
      console.log('❌ Error:', error)
    }
  }

  /**
   * Wait for element
   */
  async waitFor(selector: string, timeout: number = 5000) {
    if (!this.page) throw new Error('Browser not started')

    try {
      await this.page.waitForSelector(selector, {timeout})
      console.log(`✅ Element found: ${selector}`)
    } catch (error) {
      console.log(`❌ Timeout waiting for: ${selector}`)
    }
  }

  /**
   * Press keyboard key
   */
  async press(key: string) {
    if (!this.page) throw new Error('Browser not started')

    await this.page.keyboard.press(key as any)
    console.log(`✅ Pressed: ${key}`)
  }

  /**
   * Scroll page
   */
  async scroll(direction: 'up' | 'down' = 'down', amount: number = 500) {
    if (!this.page) throw new Error('Browser not started')

    const y = direction === 'down' ? amount : -amount
    await this.page.evaluate(scrollY => window.scrollBy(0, scrollY), y)
    console.log(`✅ Scrolled ${direction} by ${amount}px`)
  }

  /**
   * Wait for specified time
   */
  async wait(ms: number) {
    await new Promise(resolve => setTimeout(resolve, ms))
    console.log(`✅ Waited ${ms}ms`)
  }

  /**
   * Run a test sequence
   */
  async runSequence(steps: Array<{action: string; args?: any[]}>) {
    console.log('\n🎬 Running automation sequence...\n')

    for (const step of steps) {
      console.log(`▶️ ${step.action}(${step.args?.join(', ') || ''})`)
      const method = (this as any)[step.action]
      if (method) {
        await method.apply(this, step.args || [])
      } else {
        console.log(`❌ Unknown action: ${step.action}`)
      }
      await this.wait(500) // Small delay between steps
    }

    console.log('\n✅ Sequence completed!')
  }
}

// Interactive REPL
async function interactiveMode(automation: BrowserAutomation) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  console.log('\n📝 Interactive Mode - Available commands:')
  console.log('  click <selector>     - Click element by CSS selector')
  console.log('  text <text>          - Click element by text content')
  console.log('  type <selector> <value> - Type into input')
  console.log('  goto <url>           - Navigate to URL')
  console.log('  list                 - List clickable elements')
  console.log('  idx <number>         - Click element by index')
  console.log('  eval <js>            - Execute JavaScript')
  console.log('  screenshot [name]    - Take screenshot')
  console.log('  wait <ms>            - Wait for milliseconds')
  console.log('  scroll [up|down]     - Scroll page')
  console.log('  quit                 - Exit')
  console.log('')

  const prompt = () => {
    rl.question('> ', async input => {
      const [cmd, ...args] = input.trim().split(' ')

      try {
        switch (cmd) {
          case 'click':
            await automation.click(args.join(' '))
            break
          case 'text':
            await automation.clickByText(args.join(' '))
            break
          case 'type':
            await automation.type(args[0], args.slice(1).join(' '))
            break
          case 'goto':
            await automation.goto(args[0])
            break
          case 'list':
            await automation.listClickables()
            break
          case 'idx':
            await automation.clickByIndex(parseInt(args[0]))
            break
          case 'eval':
            await automation.eval(args.join(' '))
            break
          case 'screenshot':
            await automation.screenshot(args[0])
            break
          case 'wait':
            await automation.wait(parseInt(args[0]) || 1000)
            break
          case 'scroll':
            await automation.scroll((args[0] as any) || 'down')
            break
          case 'quit':
          case 'exit':
            await automation.stop()
            rl.close()
            process.exit(0)
            return
          default:
            console.log('Unknown command. Type "quit" to exit.')
        }
      } catch (error) {
        console.log('Error:', error)
      }

      prompt()
    })
  }

  prompt()
}

// Example test sequence
const walletTestSequence = [
  {action: 'goto', args: ['/wallet']},
  {action: 'wait', args: [1000]},
  {action: 'listClickables'},
  {action: 'clickByText', args: ['Create Wallet']},
  {action: 'wait', args: [500]},
  {action: 'screenshot', args: ['wallet-create']},
]

// Main
async function main() {
  const automation = new BrowserAutomation()
  await automation.start()

  // Check command line args
  const args = process.argv.slice(2)

  if (args.includes('--sequence')) {
    // Run predefined sequence
    await automation.runSequence(walletTestSequence)
    await automation.stop()
  } else {
    // Interactive mode
    await interactiveMode(automation)
  }
}

main().catch(console.error)
