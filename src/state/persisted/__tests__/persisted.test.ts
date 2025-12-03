// Mock localStorage first then import module
const localStorageMock = {
  store: {} as Record<string, string>,
  getItem(key: string) {
    return this.store[key] || null
  },
  setItem(key: string, value: string) {
    this.store[key] = value.toString()
  },
  clear() {
    this.store = {}
  },
}

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

const {init, read, write, defaults} = require('../../persisted')

describe('persisted store', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns defaults when no data exists', () => {
    expect(read()).toEqual(defaults)
  })

  it('reads and writes valid data', () => {
    const testData = {
      ...defaults,
      colorMode: 'dark',
      darkTheme: 'dim',
    }
    write(testData)
    expect(read()).toEqual(testData)
  })

  it('returns defaults when invalid data exists', () => {
    localStorage.setItem('persisted', 'invalid-json')
    expect(read()).toEqual(defaults)
  })

  it('initializes storage with defaults when empty', () => {
    localStorage.clear()
    init()
    expect(localStorage.getItem('persisted')).toBe(JSON.stringify(defaults))
  })
})
