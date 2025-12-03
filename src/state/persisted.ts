import {type Schema} from '#/state/persisted/schema'

// Basic localStorage implementation
export function read(): Schema {
  try {
    const json = localStorage.getItem('persisted')
    return json ? JSON.parse(json) : defaults
  } catch (e) {
    return defaults
  }
}

export function write(value: Schema) {
  localStorage.setItem('persisted', JSON.stringify(value))
}

export function init() {
  const stored = localStorage.getItem('persisted')
  if (stored === null) {
    write(defaults)
    return
  }
  try {
    JSON.parse(stored)
  } catch (e) {
    write(defaults)
  }
}

export const defaults: Schema = {
  colorMode: 'system',
  darkTheme: 'dim',
  session: {
    accounts: [],
    currentAccount: undefined,
  },
  reminders: {
    lastEmailConfirm: undefined,
  },
  languagePrefs: {
    primaryLanguage: 'en',
    contentLanguages: ['en'],
    postLanguage: 'en',
    postLanguageHistory: ['en'],
    appLanguage: 'en',
  },
  requireAltTextEnabled: false,
  largeAltBadgeEnabled: false,
  externalEmbeds: {},
  invites: {
    copiedInvites: [],
  },
  onboarding: {
    step: 'Home',
  },
  hiddenPosts: [],
  useInAppBrowser: undefined,
  lastSelectedHomeFeed: undefined,
  pdsAddressHistory: [],
  disableHaptics: false,
  disableAutoplay: false,
  kawaii: false,
  hasCheckedForStarterPack: false,
  subtitlesEnabled: true,
  mutedThreads: [],
  trendingDisabled: false,
  trendingVideoDisabled: false,
}

export * from './persisted/index.web'
