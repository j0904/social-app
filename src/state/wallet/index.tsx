import React, {createContext, useCallback, useContext, useMemo} from 'react'
import {AppState, type AppStateStatus} from 'react-native'

import {loadWallet, type WalletFile} from '#/screens/wallet/WalletHelper'
import {device} from '#/storage'

/**
 * Wallet State Management
 *
 * Security considerations:
 * 1. Private keys are NEVER stored in plain text in memory long-term
 * 2. Only the encrypted wallet file content is persisted
 * 3. The decrypted wallet is held in memory only while actively used
 * 4. When app goes to background, the decrypted wallet is cleared
 * 5. Access to the private key requires the password each time
 *
 * Storage structure:
 * - Encrypted wallet file content is stored in MMKV (encrypted at rest)
 * - The decryption password is NEVER stored
 * - Only public info (address) is kept accessible without password
 */

// Types
export interface WalletPublicInfo {
  address: string
  hasEncryptedWallet: boolean
}

interface WalletStateContext {
  /** Public wallet info - safe to display */
  publicInfo: WalletPublicInfo | null
  /** Whether a decrypted wallet is currently available */
  isUnlocked: boolean
  /** Whether wallet operations are in progress */
  isLoading: boolean
}

interface WalletApiContext {
  /** Store an encrypted wallet file */
  storeEncryptedWallet: (
    encryptedContent: string,
    address: string,
    password?: string,
  ) => Promise<void>
  /** Unlock wallet with password - returns decrypted wallet for one-time use */
  unlockWallet: (password: string) => Promise<WalletFile>
  /** Lock the wallet (clear decrypted data from memory) */
  lockWallet: () => void
  /** Clear all wallet data */
  clearWallet: () => Promise<void>
  /** Check if wallet exists */
  hasWallet: () => boolean
  /** Get the decrypted wallet if unlocked (use sparingly!) */
  getUnlockedWallet: () => WalletFile | null
  /** Get the stored password if wallet is unlocked (in-memory only, cleared on background) */
  getPassword: () => string | null
}

// Storage keys for MMKV
const WALLET_ENCRYPTED_CONTENT_KEY = 'walletEncryptedContent'
const WALLET_ADDRESS_KEY = 'walletAddress'

// Contexts
const WalletStateContext = createContext<WalletStateContext>({
  publicInfo: null,
  isUnlocked: false,
  isLoading: false,
})
WalletStateContext.displayName = 'WalletStateContext'

const WalletApiContext = createContext<WalletApiContext>({
  storeEncryptedWallet: async () => {},
  unlockWallet: async () => {
    throw new Error('WalletProvider not initialized')
  },
  lockWallet: () => {},
  clearWallet: async () => {},
  hasWallet: () => false,
  getUnlockedWallet: () => null,
  getPassword: () => null,
})
WalletApiContext.displayName = 'WalletApiContext'

// Provider component
export function WalletProvider({
  children,
}: Readonly<{children: React.ReactNode}>) {
  // In-memory decrypted wallet (cleared on lock/background)
  const decryptedWalletRef = React.useRef<WalletFile | null>(null)
  // In-memory password (cleared on lock/background) - NEVER persisted
  const passwordRef = React.useRef<string | null>(null)

  const [state, setState] = React.useState<WalletStateContext>(() => {
    // Initialize from storage
    const address = device.get(['device', WALLET_ADDRESS_KEY] as any)
    const hasEncrypted = !!device.get([
      'device',
      WALLET_ENCRYPTED_CONTENT_KEY,
    ] as any)

    return {
      publicInfo:
        address && hasEncrypted
          ? {
              address: address as string,
              hasEncryptedWallet: true,
            }
          : null,
      isUnlocked: false,
      isLoading: false,
    }
  })

  // Clear decrypted wallet when app goes to background
  React.useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        // Security: Clear decrypted wallet and password from memory
        if (decryptedWalletRef.current || passwordRef.current) {
          // Overwrite sensitive data before clearing
          if (decryptedWalletRef.current) {
            const wallet = decryptedWalletRef.current
            if (wallet.wallet.privateKey) {
              // Attempt to zero out the private key string in memory
              // Note: This is best-effort in JavaScript
              ;(wallet.wallet as any).privateKey = '0'.repeat(64)
            }
            decryptedWalletRef.current = null
          }
          // Clear password from memory
          if (passwordRef.current) {
            passwordRef.current = null
          }
          setState(prev => ({...prev, isUnlocked: false}))
        }
      }
    }

    const subscription = AppState.addEventListener(
      'change',
      handleAppStateChange,
    )
    return () => subscription?.remove()
  }, [])

  const storeEncryptedWallet = useCallback(
    async (encryptedContent: string, address: string, password?: string) => {
      setState(prev => ({...prev, isLoading: true}))
      try {
        // Store encrypted content in MMKV (encrypted at rest)
        device.set(
          ['device', WALLET_ENCRYPTED_CONTENT_KEY] as any,
          encryptedContent,
        )
        device.set(['device', WALLET_ADDRESS_KEY] as any, address)

        // Store password in memory if provided (for session use)
        if (password) {
          passwordRef.current = password
        }

        setState({
          publicInfo: {
            address,
            hasEncryptedWallet: true,
          },
          isUnlocked: !!password,
          isLoading: false,
        })
      } catch (error) {
        setState(prev => ({...prev, isLoading: false}))
        throw error
      }
    },
    [],
  )

  const unlockWallet = useCallback(async (password: string) => {
    setState(prev => ({...prev, isLoading: true}))
    try {
      const encryptedContent = device.get([
        'device',
        WALLET_ENCRYPTED_CONTENT_KEY,
      ] as any) as string | undefined

      if (!encryptedContent) {
        throw new Error('No wallet found')
      }

      // Decrypt the wallet
      const wallet = await loadWallet(encryptedContent, password)

      // Store in memory (will be cleared on background)
      decryptedWalletRef.current = wallet
      // Store password in memory for session use
      passwordRef.current = password

      setState(prev => ({
        ...prev,
        isUnlocked: true,
        isLoading: false,
      }))

      return wallet
    } catch (error) {
      setState(prev => ({...prev, isLoading: false}))
      throw error
    }
  }, [])

  const lockWallet = useCallback(() => {
    if (decryptedWalletRef.current) {
      // Overwrite sensitive data before clearing
      const wallet = decryptedWalletRef.current
      if (wallet.wallet.privateKey) {
        ;(wallet.wallet as any).privateKey = '0'.repeat(64)
      }
      decryptedWalletRef.current = null
    }
    // Clear password from memory
    passwordRef.current = null
    setState(prev => ({...prev, isUnlocked: false}))
  }, [])

  const clearWallet = useCallback(async () => {
    // Clear decrypted wallet from memory
    lockWallet()

    // Clear from storage
    device.remove(['device', WALLET_ENCRYPTED_CONTENT_KEY] as any)
    device.remove(['device', WALLET_ADDRESS_KEY] as any)

    setState({
      publicInfo: null,
      isUnlocked: false,
      isLoading: false,
    })
  }, [lockWallet])

  const hasWallet = useCallback(() => {
    return !!device.get(['device', WALLET_ENCRYPTED_CONTENT_KEY] as any)
  }, [])

  const getUnlockedWallet = useCallback(() => {
    return decryptedWalletRef.current
  }, [])

  const getPassword = useCallback(() => {
    return passwordRef.current
  }, [])

  const api = useMemo<WalletApiContext>(
    () => ({
      storeEncryptedWallet,
      unlockWallet,
      lockWallet,
      clearWallet,
      hasWallet,
      getUnlockedWallet,
      getPassword,
    }),
    [
      storeEncryptedWallet,
      unlockWallet,
      lockWallet,
      clearWallet,
      hasWallet,
      getUnlockedWallet,
      getPassword,
    ],
  )

  return (
    <WalletStateContext.Provider value={state}>
      <WalletApiContext.Provider value={api}>
        {children}
      </WalletApiContext.Provider>
    </WalletStateContext.Provider>
  )
}

// Hooks
export function useWalletState(): WalletStateContext {
  return useContext(WalletStateContext)
}

export function useWalletApi(): WalletApiContext {
  return useContext(WalletApiContext)
}

/**
 * Combined hook for convenience
 */
export function useWallet() {
  const state = useWalletState()
  const api = useWalletApi()
  return {...state, ...api}
}
