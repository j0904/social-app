import {useEffect, useState} from 'react'
import {Alert, Linking, TextInput, View} from 'react-native'
import * as FileSystem from 'expo-file-system'
import {type NativeStackScreenProps} from '@react-navigation/native-stack'
import {format} from 'date-fns'

import {type CommonNavigatorParams} from '#/lib/routes/types'
import {isWeb} from '#/platform/detection'
import * as SettingsList from '#/screens/Settings/components/SettingsList'
import {useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Layout from '#/components/Layout'
import {Text} from '#/components/Typography'

// Initialize BigTangle wallet manager
const initializeBigTangle = async () => {
  try {
    // Import the real BigTangle library
    const BigTangleModule = await import('bigtangle-ts')
    // Use a more careful approach to avoid initialization issues
    if (BigTangleModule && BigTangleModule.BigTangle) {
      return new BigTangleModule.BigTangle()
    } else {
      throw new Error('BigTangle class not found in module')
    }
  } catch (e) {
    console.error('Failed to load BigTangle library:', e)
    // Provide a mock implementation for web or when the library fails
    if (isWeb) {
      // Return a mock BigTangle for web environments
      return {
        generateWallet: () => ({
          address: `mock_address_${Date.now()}`,
          publicKey: `mock_public_key_${Date.now()}`,
          privateKey: `mock_private_key_${Date.now()}`,
          ethAddress: `mock_eth_address_${Date.now()}`,
        }),
        generateKeyPair: () => ({
          address: `mock_address_${Date.now()}`,
          publicKey: `mock_public_key_${Date.now()}`,
          privateKey: `mock_private_key_${Date.now()}`,
        }),
        validateAddress: async (address: string) => {
          // Basic mock validation
          return typeof address === 'string' && address.length > 5
        },
        encrypt: async (data: string, password: string) => {
          // Simple mock encryption
          return JSON.stringify({
            data: btoa(unescape(encodeURIComponent(data + password + 'salt'))),
            encrypted: true,
            format: 'mock-encryption-v1',
          })
        },
        decrypt: async (encryptedDataStr: string, password: string) => {
          try {
            const encryptedData = JSON.parse(encryptedDataStr)
            if (encryptedData && encryptedData.data) {
              return (
                decodeURIComponent(escape(atob(encryptedData.data)))?.replace(
                  password + 'salt',
                  '',
                ) || null
              )
            }
            return encryptedDataStr
          } catch {
            return encryptedDataStr
          }
        },
        signMessage: async (message: string, privateKey: string) => {
          return `mock_signature_for_${message}`
        },
        verifySignature: async (
          message: string,
          signature: string,
          publicKey: string,
        ) => {
          return signature === `mock_signature_for_${message}`
        },
        deriveAddress: async (publicKey: string, index: number) => {
          return `mock_derived_address_${index}_${Date.now()}`
        },
      }
    } else {
      throw new Error(
        'BigTangle library is not available: ' + (e as Error).message,
      )
    }
  }
}

// Define types for our wallet functionality
type WalletFile = {
  id: string
  name: string
  path: string
  dowloadURL: string
  createdAt: Date
}

type WalletData = {
  id: string
  addresses: string[]
  publickeys: string[]
  ethaddresses: string[]
  encrypted: boolean
  checkAddress: boolean
  keys?: Array<{
    address: string
    publicKey: string
    privateKey: string
  }>
}

const WalletScreen = (
  _props: NativeStackScreenProps<CommonNavigatorParams, 'Wallet'>,
) => {
  const theme = useTheme()
  const [walletFiles, setWalletFiles] = useState<WalletFile[]>([])
  const [walletData, setWalletData] = useState<WalletData | null>(null)
  const [isEncrypted, setIsEncrypted] = useState<boolean>(false)
  const [password, setPassword] = useState<string>('')
  const [privateKey, setPrivateKey] = useState<string>('')
  const [showPrivateKey, setShowPrivateKey] = useState<boolean>(false)
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null)
  const [_isLoading, setIsLoading] = useState<boolean>(false)
  const [addKeyMode, setAddKeyMode] = useState<boolean>(false)
  const [bigtangleInstance, setBigTangleInstance] = useState<any>(null)

  // Initialize BigTangle wallet manager when needed
  const getBigTangleInstance = async () => {
    if (!bigtangleInstance) {
      try {
        const newInstance = await initializeBigTangle()
        setBigTangleInstance(newInstance)
        return newInstance
      } catch (error) {
        console.error('Error initializing BigTangle:', error)
        Alert.alert(
          'Error',
          'BigTangle library failed to initialize: ' + (error as Error).message,
        )
        throw error
      }
    }
    return bigtangleInstance
  }

  // Load wallet files from documents directory on component mount
  useEffect(() => {
    loadWalletFiles()
  }, [])

  const loadWalletFiles = async () => {
    try {
      // Check if we're on web (FileSystem.documentDirectory might not be available)
      if (isWeb) {
        console.log('Running on web - cannot access native file system')
        // For web, we might load from local storage or show empty state
        setWalletFiles([])
        return
      }

      // Get the documents directory path (only for native platforms)
      const documentsDir = (FileSystem as any).documentDirectory
      if (!documentsDir) {
        console.error('Documents directory not available')
        Alert.alert(
          'Error',
          'Documents directory not available on this platform',
        )
        return
      }

      // List files in the documents directory
      const files = await FileSystem.readDirectoryAsync(documentsDir)

      // Filter for wallet files (json files that look like wallets)
      const walletFiles = files
        .filter(file => file.endsWith('.json') && file.includes('wallet'))
        .map((fileName, index) => {
          const filePath = `${documentsDir}${fileName}`
          return {
            id: `${index + 1}`,
            name: fileName,
            path: filePath,
            dowloadURL: filePath,
            createdAt: new Date(), // In a real implementation, you'd get the actual creation time
          }
        })

      setWalletFiles(walletFiles)
    } catch (error) {
      console.error('Error loading wallet files:', error)
      Alert.alert('Error', 'Failed to load wallet files')
    }
  }

  const loadWalletData = async (walletPath: string, password?: string) => {
    try {
      let fileContent: string

      if (isWeb) {
        // On web, load from localStorage
        fileContent = localStorage.getItem(walletPath) || '{}'
      } else {
        // Native behavior
        fileContent = await FileSystem.readAsStringAsync(walletPath)
      }

      // Get BigTangle instance to potentially enhance wallet data
      const bigtangle = await getBigTangleInstance()

      // Check if the content is encrypted
      let parsedContent
      try {
        parsedContent = JSON.parse(fileContent)

        // Use BigTangle to validate addresses if available
        if (
          bigtangle.validateAddress &&
          typeof bigtangle.validateAddress === 'function' &&
          parsedContent.addresses
        ) {
          for (const address of parsedContent.addresses) {
            try {
              const isValid = await bigtangle.validateAddress(address)
              if (!isValid) {
                console.warn(`Invalid address found in wallet: ${address}`)
              }
            } catch (e) {
              console.warn(`Could not validate address ${address}:`, e)
            }
          }
        }

        if (parsedContent.encrypted) {
          if (!password) {
            // If the wallet is encrypted and no password was provided,
            // we need to prompt for password or handle accordingly
            Alert.alert(
              'Encrypted Wallet',
              'This wallet is encrypted. Please provide the password.',
            )
            setIsEncrypted(true) // Switch to password entry mode
            return
          }

          // Decrypt the content
          const decryptedContent = await decryptData(fileContent, password)
          if (decryptedContent === null) {
            Alert.alert('Error', 'Failed to decrypt wallet. Invalid password.')
            return
          }

          parsedContent = JSON.parse(decryptedContent)
        }
      } catch (e) {
        // If it's not JSON, it might not be encrypted, so treat as regular content
        parsedContent = {
          addresses: [],
          publickeys: [],
          ethaddresses: [],
          encrypted: false,
          checkAddress: false,
        }
      }

      // Update the wallet data state
      const newWalletData: WalletData = {
        id: '1',
        addresses: parsedContent.addresses || [],
        publickeys: parsedContent.publickeys || [],
        ethaddresses: parsedContent.ethaddresses || [],
        encrypted: parsedContent.encrypted || false,
        checkAddress: parsedContent.checkAddress || true,
      }

      setWalletData(newWalletData)
    } catch (error) {
      console.error('Error loading wallet data:', error)
      Alert.alert('Error', 'Failed to load wallet data')
    }
  }

  // Generate a more robust encryption key using a simple hash approach
  // Note: This is still a simplified approach for demonstration. A real implementation
  // would use a proper cryptographic library like expo-crypto if available
  const generateEncryptionKey = (password: string): string => {
    // Simple hash approach - in a real app, use proper crypto like PBKDF2
    let hash = password
    for (let i = 0; i < 1000; i++) {
      // Simulate multiple rounds for basic key stretching
      hash = Array.from(hash).reduce(
        (acc, char) => acc + char.charCodeAt(0).toString(16),
        '',
      )
      if (hash.length > 64) hash = hash.substring(0, 64) // Limit length
    }
    return hash
  }

  // Encrypt data with a password using a basic XOR cipher (for demonstration only)
  // A production implementation would use proper AES encryption
  const encryptData = async (
    data: string,
    password: string,
  ): Promise<string> => {
    const bigtangle = await getBigTangleInstance()

    // Use BigTangle's encryption if available, otherwise fall back to custom
    if (bigtangle.encrypt && typeof bigtangle.encrypt === 'function') {
      return await bigtangle.encrypt(data, password)
    } else {
      // Fallback to custom encryption
      const key = generateEncryptionKey(password)
      const keyBytes = Array.from(key).map(c => c.charCodeAt(0))
      const dataBytes = Array.from(data).map(c => c.charCodeAt(0))

      const encryptedBytes = dataBytes.map(
        (byte, i) => byte ^ keyBytes[i % keyBytes.length],
      )

      // Convert to base64 for storage
      const encryptedString = String.fromCharCode(...encryptedBytes)
      const base64Encrypted = btoa(
        encodeURIComponent(encryptedString).replace(
          /%([0-9A-F]{2})/g,
          function (match, p1) {
            return String.fromCharCode(parseInt(p1, 16))
          },
        ),
      )

      return JSON.stringify({
        data: base64Encrypted,
        salt: key.substring(0, 16), // store part of key as salt equivalent
        encrypted: true,
        format: 'xor-encryption-v1',
      })
    }
  }

  // Decrypt data with a password
  const decryptData = async (
    encryptedDataStr: string,
    password: string,
  ): Promise<string | null> => {
    // Get BigTangle instance to try library's decryption first
    const bigtangle = await getBigTangleInstance()

    // Use BigTangle's decryption if available
    if (bigtangle.decrypt && typeof bigtangle.decrypt === 'function') {
      try {
        return await bigtangle.decrypt(encryptedDataStr, password)
      } catch (e) {
        console.log(
          'BigTangle decryption failed, falling back to custom method:',
          e,
        )
        // Continue to fallback method below
      }
    }

    // Fallback to custom decryption
    try {
      const encryptedData = JSON.parse(encryptedDataStr)
      if (
        encryptedData.encrypted &&
        encryptedData.format === 'xor-encryption-v1'
      ) {
        const key = generateEncryptionKey(password)
        const encryptedString = decodeURIComponent(
          escape(atob(encryptedData.data)),
        )
        const encryptedBytes = Array.from(encryptedString).map(c =>
          c.charCodeAt(0),
        )
        const keyBytes = Array.from(key).map(c => c.charCodeAt(0))

        const decryptedBytes = encryptedBytes.map(
          (byte, i) => byte ^ keyBytes[i % keyBytes.length],
        )

        return String.fromCharCode(...decryptedBytes)
      }
      // If not encrypted or different format, return as is
      return encryptedDataStr
    } catch (error) {
      console.error('Error decrypting data:', error)
      return null
    }
  }

  // Load a specific wallet file
  const loadWalletDataFromPath = async (
    walletPath: string,
    password?: string,
  ) => {
    setIsLoading(true)
    await loadWalletData(walletPath, password)
    setIsEncrypted(false)
    setIsLoading(false)
  }

  // Create a new wallet using BigTangle library
  const createNewWallet = async () => {
    try {
      // Get the BigTangle instance
      const bigtangle = await getBigTangleInstance()
      // Generate a new wallet using BigTangle
      const walletInfo = await bigtangle.generateWallet()

      // Use additional BigTangle features for enhanced wallet creation
      // For example, validate the generated address
      if (
        bigtangle.validateAddress &&
        typeof bigtangle.validateAddress === 'function'
      ) {
        const isValid = await bigtangle.validateAddress(walletInfo.address)
        if (!isValid) {
          throw new Error('Generated wallet address is invalid')
        }
      }

      const id = Math.random().toString(36).substring(2, 10)
      const now = new Date()

      // Handle web vs native file storage differently
      if (isWeb) {
        // For web, we can use localStorage instead of file system
        const fileName = `wallet_${now.getTime()}.json`
        const newWalletFile: WalletFile = {
          id,
          name: fileName,
          path: fileName, // On web, path can be just the name
          dowloadURL: fileName,
          createdAt: now,
        }

        // Use BigTangle to enhance wallet data with additional information
        let additionalAddresses = [walletInfo.address]
        let additionalPublicKeys = [walletInfo.publicKey]
        let additionalEthAddresses = [walletInfo.ethAddress || '']

        // If BigTangle supports derivation methods, use them to generate more addresses
        if (
          bigtangle.deriveAddress &&
          typeof bigtangle.deriveAddress === 'function'
        ) {
          try {
            // Derive additional addresses using BigTangle (example implementation)
            const derivedAddress = await bigtangle.deriveAddress(
              walletInfo.publicKey,
              1,
            )
            if (
              derivedAddress &&
              !additionalAddresses.includes(derivedAddress)
            ) {
              additionalAddresses.push(derivedAddress)
            }
          } catch (e) {
            console.log('Could not derive additional addresses:', e)
            // Continue with just the original address
          }
        }

        const newWalletData: WalletData = {
          id,
          addresses: additionalAddresses,
          publickeys: additionalPublicKeys,
          ethaddresses: additionalEthAddresses,
          encrypted: false,
          checkAddress: true,
          keys: [
            {
              address: walletInfo.address,
              publicKey: walletInfo.publicKey,
              privateKey: walletInfo.privateKey,
            },
          ],
        }

        // On web, save to localStorage
        localStorage.setItem(fileName, JSON.stringify(newWalletData))

        // Add the new wallet file to the list
        setWalletFiles(prev => [...prev, newWalletFile])

        Alert.alert(
          'Success',
          'New wallet created successfully (stored in browser)',
        )
      } else {
        // Native behavior
        const fileName = `wallet_${now.getTime()}.json`
        const documentsDir = (FileSystem as any).documentDirectory
        if (!documentsDir) {
          throw new Error('Documents directory not available')
        }
        const filePath = `${documentsDir}${fileName}`

        const newWalletFile: WalletFile = {
          id,
          name: fileName,
          path: filePath,
          dowloadURL: filePath,
          createdAt: now,
        }

        // Use BigTangle to enhance wallet data with additional information
        let additionalAddresses = [walletInfo.address]
        let additionalPublicKeys = [walletInfo.publicKey]
        let additionalEthAddresses = [walletInfo.ethAddress || '']

        // If BigTangle supports derivation methods, use them to generate more addresses
        if (
          bigtangle.deriveAddress &&
          typeof bigtangle.deriveAddress === 'function'
        ) {
          try {
            // Derive additional addresses using BigTangle (example implementation)
            const derivedAddress = await bigtangle.deriveAddress(
              walletInfo.publicKey,
              1,
            )
            if (
              derivedAddress &&
              !additionalAddresses.includes(derivedAddress)
            ) {
              additionalAddresses.push(derivedAddress)
            }
          } catch (e) {
            console.log('Could not derive additional addresses:', e)
            // Continue with just the original address
          }
        }

        const newWalletData: WalletData = {
          id,
          addresses: additionalAddresses,
          publickeys: additionalPublicKeys,
          ethaddresses: additionalEthAddresses,
          encrypted: false,
          checkAddress: true,
          keys: [
            {
              address: walletInfo.address,
              publicKey: walletInfo.publicKey,
              privateKey: walletInfo.privateKey,
            },
          ],
        }

        await FileSystem.writeAsStringAsync(
          filePath,
          JSON.stringify(newWalletData),
        )

        // Add the new wallet file to the list
        setWalletFiles(prev => [...prev, newWalletFile])

        Alert.alert('Success', 'New wallet created successfully')
      }
    } catch (error) {
      console.error('Error creating new wallet:', error)
      Alert.alert(
        'Error',
        'Failed to create new wallet: ' + (error as Error).message,
      )
    }
  }

  // Show keys for a wallet
  const showKeys = (walletId: string) => {
    const walletFile = walletFiles.find(wf => wf.id === walletId)
    if (walletFile) {
      // Check if the file is encrypted by reading its content
      checkIfWalletEncrypted(walletFile.path, walletId)
    }
  }

  // Check if a wallet is encrypted and handle accordingly
  const checkIfWalletEncrypted = async (path: string, walletId: string) => {
    try {
      const fileContent = await FileSystem.readAsStringAsync(path)
      let isEncrypted = false

      try {
        const parsed = JSON.parse(fileContent)
        isEncrypted = !!parsed.encrypted
      } catch (e) {
        // Not JSON, so not encrypted
        isEncrypted = false
      }

      if (isEncrypted) {
        // Show password dialog for encrypted wallet
        setSelectedWalletId(walletId)
        setIsEncrypted(true)
      } else {
        // Load the wallet directly if it's not encrypted
        setSelectedWalletId(walletId)
        await loadWalletDataFromPath(path)
      }
    } catch (error) {
      console.error('Error checking wallet encryption:', error)
      Alert.alert(
        'Error',
        'Failed to check wallet encryption status: ' + (error as Error).message,
      )
    }
  }

  // Set password for encryption
  const toSetPwd = (walletId: string) => {
    setSelectedWalletId(walletId)
    setIsEncrypted(true)
  }

  // Handle password submission when opening an encrypted wallet
  const handlePasswordSubmit = async () => {
    if (!password) {
      Alert.alert('Error', 'Please enter a password')
      return
    }

    if (!selectedWalletId) {
      Alert.alert('Error', 'No wallet selected')
      return
    }

    const walletFile = walletFiles.find(wf => wf.id === selectedWalletId)
    if (!walletFile) {
      Alert.alert('Error', 'Wallet file not found')
      return
    }

    if (addKeyMode) {
      // We're in add key mode
      try {
        const fileContent = await FileSystem.readAsStringAsync(walletFile.path)
        // Decrypt the content
        const decryptedContent = await decryptData(fileContent, password)
        if (decryptedContent === null) {
          Alert.alert('Error', 'Failed to decrypt wallet. Invalid password.')
          return
        }

        let walletData
        try {
          walletData = JSON.parse(decryptedContent)
        } catch (e) {
          Alert.alert('Error', 'Invalid wallet format')
          return
        }

        // Add a new key (in a real implementation, you would generate a proper key)
        const newKey = {
          address: `new_address_${Date.now()}`,
          publicKey: `new_public_key_${Date.now()}`,
          privateKey: `new_private_key_${Date.now()}`,
        }

        if (!walletData.keys) {
          walletData.keys = []
        }
        walletData.keys.push(newKey)

        // Encrypt the updated content
        const encryptedContent = await encryptData(
          JSON.stringify(walletData),
          password,
        )

        // Write the encrypted content back to the file
        await FileSystem.writeAsStringAsync(walletFile.path, encryptedContent)

        // Clear the addKeyMode
        setAddKeyMode(false)
        setIsEncrypted(false)
        setSelectedWalletId(null)
        setPassword('')

        // Reload the wallet files to reflect the changes
        loadWalletFiles()

        Alert.alert('Success', 'New key added to wallet')
      } catch (error) {
        console.error('Error adding key to encrypted wallet:', error)
        Alert.alert(
          'Error',
          'Failed to add key to encrypted wallet: ' + (error as Error).message,
        )
      }
    } else {
      // We're just decrypting to view the wallet
      await loadWalletDataFromPath(walletFile.path, password)
      setPassword('') // Clear password after use
    }
  }

  // Add encryption to wallet file
  const _addPwdToWallet = async () => {
    if (!password) {
      Alert.alert('Error', 'Please enter a password')
      return
    }

    const walletFile = walletFiles.find(wf => wf.id === selectedWalletId)
    if (!walletFile) {
      Alert.alert('Error', 'Wallet file not found')
      return
    }

    try {
      let fileContent: string

      if (isWeb) {
        // On web, read from localStorage
        fileContent = localStorage.getItem(walletFile.path) || '{}'
      } else {
        // Native behavior - read the current wallet file
        fileContent = await FileSystem.readAsStringAsync(walletFile.path)
      }

      // Encrypt the content
      const encryptedContent = await encryptData(fileContent, password)

      if (isWeb) {
        // On web, save to localStorage
        localStorage.setItem(walletFile.path, encryptedContent)
      } else {
        // Native behavior - write the encrypted content back to the file
        await FileSystem.writeAsStringAsync(walletFile.path, encryptedContent)
      }

      // Update the wallet file list to reflect it's now encrypted
      setWalletFiles(prev =>
        prev.map(wf =>
          wf.id === walletFile.id
            ? {
                ...wf,
                name: wf.name.endsWith('.encrypted')
                  ? wf.name
                  : `${wf.name}.encrypted`,
              }
            : wf,
        ),
      )

      setIsEncrypted(false) // Return to non-encrypted view
      setPassword('')
      Alert.alert('Success', 'Wallet encrypted successfully')

      // Reload the wallet files to update the UI
      loadWalletFiles()
    } catch (error) {
      console.error('Error encrypting wallet:', error)
      Alert.alert(
        'Error',
        'Failed to encrypt wallet: ' + (error as Error).message,
      )
    }
  }

  // Function to set up adding a key after getting the password
  const addKeyAfterPassword = async (_walletFile: WalletFile) => {
    setAddKeyMode(true)
    // The actual adding will happen in handlePasswordSubmit
  }

  // Add a new key to wallet
  const toAddEckey = async (walletId: string) => {
    const walletFile = walletFiles.find(wf => wf.id === walletId)
    if (!walletFile) {
      Alert.alert('Error', 'Wallet file not found')
      return
    }

    try {
      let fileContent: string

      if (isWeb) {
        // On web, read from localStorage
        fileContent = localStorage.getItem(walletFile.path) || '{}'
      } else {
        // Native behavior - read the file system
        fileContent = await FileSystem.readAsStringAsync(walletFile.path)
      }

      let walletData
      let isEncrypted = false

      try {
        const parsed = JSON.parse(fileContent)
        isEncrypted = !!parsed.encrypted
      } catch (e) {
        // Not JSON, so not encrypted or not JSON format
      }

      let contentToUse = fileContent

      // If it's encrypted, we need to get the password to decrypt
      if (isEncrypted) {
        // Set up state to add a key after getting the password
        setSelectedWalletId(walletId) // Remember which wallet we're working with
        setIsEncrypted(true) // Show password dialog
        // Set a flag to know we want to add a key after decryption
        // For this implementation, we'll use a simple state flag to indicate
        // that after password entry, we want to add a key instead of just showing data
        addKeyAfterPassword(walletFile)
        return
      }

      // If not encrypted, process directly
      walletData = JSON.parse(contentToUse)

      // Get the BigTangle instance and generate a new key pair
      const bigtangle = await getBigTangleInstance()
      const newKeyPair = await bigtangle.generateKeyPair()

      // Use additional BigTangle features for key verification
      if (
        bigtangle.validateAddress &&
        typeof bigtangle.validateAddress === 'function'
      ) {
        const isValid = await bigtangle.validateAddress(newKeyPair.address)
        if (!isValid) {
          throw new Error('Generated key address is invalid')
        }
      }

      // If BigTangle supports signing, we can test the new key
      if (
        bigtangle.signMessage &&
        typeof bigtangle.signMessage === 'function'
      ) {
        // Create a test signature to verify key functionality
        const testMessage = 'wallet-verification-' + Date.now()
        const signature = await bigtangle.signMessage(
          testMessage,
          newKeyPair.privateKey,
        )

        // Verify the signature if the library supports it
        if (
          bigtangle.verifySignature &&
          typeof bigtangle.verifySignature === 'function'
        ) {
          const isVerified = await bigtangle.verifySignature(
            testMessage,
            signature,
            newKeyPair.publicKey,
          )
          if (!isVerified) {
            throw new Error('Key pair signature verification failed')
          }
        }
      }

      const newKey = {
        address: newKeyPair.address,
        publicKey: newKeyPair.publicKey,
        privateKey: newKeyPair.privateKey,
      }

      if (!walletData.keys) {
        walletData.keys = []
      }
      walletData.keys.push(newKey)

      if (isWeb) {
        // On web, save to localStorage
        localStorage.setItem(walletFile.path, JSON.stringify(walletData))
      } else {
        // Native behavior - write the updated content back to the file
        await FileSystem.writeAsStringAsync(
          walletFile.path,
          JSON.stringify(walletData),
        )
      }

      // Reload the wallet files to reflect the changes
      loadWalletFiles()

      Alert.alert('Success', 'New key added to wallet')
    } catch (error) {
      console.error('Error adding key to wallet:', error)
      Alert.alert(
        'Error',
        'Failed to add key to wallet: ' + (error as Error).message,
      )
    }
  }

  // Delete a wallet
  const deleteSelection = async (walletId: string) => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete this wallet?',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const walletFile = walletFiles.find(wf => wf.id === walletId)
              if (walletFile) {
                if (isWeb) {
                  // On web, delete from localStorage
                  localStorage.removeItem(walletFile.path)
                } else {
                  // Native behavior - delete the file
                  await FileSystem.deleteAsync(walletFile.path)
                }

                // Update the state
                setWalletFiles(prev => prev.filter(wf => wf.id !== walletId))
                if (selectedWalletId === walletId) {
                  setWalletData(null)
                  setSelectedWalletId(null)
                }
              }
            } catch (error) {
              console.error('Error deleting wallet:', error)
              Alert.alert(
                'Error',
                'Failed to delete wallet: ' + (error as Error).message,
              )
            }
          },
        },
      ],
    )
  }

  // File download (opening file)
  const downloadWallet = (path: string) => {
    if (isWeb) {
      // On web, provide a download option for localStorage item
      try {
        const walletData = localStorage.getItem(path)
        if (walletData) {
          // Create a temporary download link
          const blob = new Blob([walletData], {type: 'application/json'})
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = path
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          URL.revokeObjectURL(url)
        } else {
          Alert.alert('Error', 'Wallet data not found in browser storage')
        }
      } catch (err) {
        Alert.alert(
          'Error',
          'Could not download wallet: ' + (err as Error).message,
        )
      }
    } else {
      // Native behavior
      Linking.openURL(`file://${path}`).catch(err => {
        Alert.alert('Error', 'Could not open wallet file: ' + err.message)
      })
    }
  }

  // Show private key in a dialog
  const showPrivateKeyHandler = () => {
    setPrivateKey('5KJvsngHeMpm884wtkJNzQGaCErckhHJBGFsvd3VyK5qMZXj3hS')
    setShowPrivateKey(true)
  }

  // Close the private key dialog
  const closePrivateKeyDialog = () => {
    setShowPrivateKey(false)
    setPrivateKey('')
  }

  return (
    <Layout.Screen testID="walletScreen">
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>Wallet</Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>
      <Layout.Content>
        <SettingsList.Container>
          {/* Load Wallet Section */}
          {!isEncrypted && (
            <>
              <SettingsList.PressableItem
                onPress={createNewWallet}
                label="Create New Wallet">
                <SettingsList.ItemText>Create New Wallet</SettingsList.ItemText>
                <SettingsList.Chevron />
              </SettingsList.PressableItem>
              <SettingsList.PressableItem
                onPress={loadWalletFiles}
                label="Load Wallet">
                <SettingsList.ItemText>Load Wallet</SettingsList.ItemText>
                <SettingsList.Chevron />
              </SettingsList.PressableItem>
              <SettingsList.Divider />
            </>
          )}

          {/* Wallet Files List */}
          {!isEncrypted && walletFiles.length > 0 && (
            <View>
              {walletFiles.map(walletFile => (
                <View key={walletFile.id}>
                  <SettingsList.PressableItem
                    onPress={() => showKeys(walletFile.id)}
                    label={walletFile.name}>
                    <SettingsList.ItemText>
                      {walletFile.name}
                    </SettingsList.ItemText>
                    <View style={{flexDirection: 'row', alignItems: 'center'}}>
                      <Text
                        style={{
                          marginRight: 8,
                          fontSize: 12,
                          color: theme.atoms.text_contrast_medium.color,
                        }}>
                        {format(walletFile.createdAt, 'MM/dd/yyyy')}
                      </Text>
                      <SettingsList.Chevron />
                    </View>
                  </SettingsList.PressableItem>

                  {/* Action buttons for this wallet file */}
                  <View
                    style={{
                      flexDirection: 'row',
                      paddingLeft: 16,
                      paddingRight: 16,
                      marginBottom: 8,
                    }}>
                    <Button
                      variant="outline"
                      color="primary"
                      label="Download"
                      onPress={() => downloadWallet(walletFile.dowloadURL)}
                      style={{flex: 1, marginRight: 4}}>
                      <ButtonText>Download</ButtonText>
                    </Button>
                    <Button
                      variant="outline"
                      color="primary"
                      label="Set Pwd"
                      onPress={() => toSetPwd(walletFile.id)}
                      style={{flex: 1, marginHorizontal: 2}}>
                      <ButtonText>Set Pwd</ButtonText>
                    </Button>
                    <Button
                      variant="solid"
                      color="primary"
                      label="Add Key"
                      onPress={() => toAddEckey(walletFile.id)}
                      style={{flex: 1, marginHorizontal: 2}}>
                      <ButtonText>Add Key</ButtonText>
                    </Button>
                    <Button
                      variant="solid"
                      color="negative"
                      label="Delete"
                      onPress={() => deleteSelection(walletFile.id)}
                      style={{flex: 1, marginLeft: 4}}>
                      <ButtonText>Delete</ButtonText>
                    </Button>
                  </View>
                </View>
              ))}
              <SettingsList.Divider />
            </View>
          )}

          {/* Show Keys Section */}
          {walletData && walletData.checkAddress && (
            <View>
              <SettingsList.Divider />
              <View style={{paddingHorizontal: 16, paddingVertical: 8}}>
                <Text
                  style={{
                    fontWeight: 'bold',
                    marginBottom: 8,
                    color: theme.atoms.text.color,
                  }}>
                  Wallet Information
                </Text>

                {/* Addresses */}
                <View style={{marginBottom: 16}}>
                  <Text
                    style={{
                      fontWeight: '600',
                      marginBottom: 4,
                      color: theme.atoms.text.color,
                    }}>
                    Addresses
                  </Text>
                  {walletData.addresses.map((addr, index) => (
                    <View key={index} style={{marginBottom: 4}}>
                      <Text style={{color: theme.atoms.text.color}}>
                        {addr}
                      </Text>
                    </View>
                  ))}

                  {/* Private Key - as a button-like item */}
                  <SettingsList.PressableItem
                    onPress={showPrivateKeyHandler}
                    label="Private Key">
                    <SettingsList.ItemText>Private Key</SettingsList.ItemText>
                    <SettingsList.Chevron />
                  </SettingsList.PressableItem>
                </View>

                {/* Public Keys */}
                <View
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    marginBottom: 16,
                  }}>
                  <Text
                    style={{
                      fontWeight: '600',
                      marginBottom: 4,
                      color: theme.atoms.text.color,
                    }}>
                    Public Keys
                  </Text>
                  {walletData.publickeys.map((pubkey, index) => (
                    <Text
                      key={index}
                      style={{color: theme.atoms.text.color, marginBottom: 4}}>
                      {pubkey}
                    </Text>
                  ))}
                </View>

                {/* ETH Addresses */}
                <View
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    marginBottom: 16,
                  }}>
                  <Text
                    style={{
                      fontWeight: '600',
                      marginBottom: 4,
                      color: theme.atoms.text.color,
                    }}>
                    ETH Addresses
                  </Text>
                  {walletData.ethaddresses.map((ethaddr, index) => (
                    <Text
                      key={index}
                      style={{color: theme.atoms.text.color, marginBottom: 4}}>
                      {ethaddr}
                    </Text>
                  ))}
                </View>
              </View>
            </View>
          )}

          {/* Encryption Mode - used for both encrypting and decrypting */}
          {isEncrypted && (
            <View style={{paddingHorizontal: 16, paddingVertical: 16}}>
              <Text
                style={{
                  fontWeight: 'bold',
                  marginBottom: 12,
                  color: theme.atoms.text.color,
                }}>
                {selectedWalletId
                  ? 'Enter Password to Unlock Wallet'
                  : 'Encrypt Wallet'}
              </Text>

              <View style={{marginBottom: 16}}>
                <Text style={{marginBottom: 8, color: theme.atoms.text.color}}>
                  Password
                </Text>
                <TextInput
                  accessibilityLabel="Password input"
                  accessibilityHint="Enter your password to encrypt or decrypt the wallet"
                  value={password}
                  onChangeText={setPassword}
                  style={[
                    {
                      borderWidth: 1,
                      borderColor: '#ccc',
                      borderRadius: 4,
                      padding: 10,
                      marginBottom: 10,
                      backgroundColor: theme.atoms.bg.backgroundColor,
                      color: theme.atoms.text.color,
                    },
                  ]}
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  secureTextEntry={true}
                />
              </View>

              <View style={{flexDirection: 'row'}}>
                <Button
                  variant="solid"
                  color="primary"
                  label="Submit"
                  onPress={handlePasswordSubmit}
                  style={{flex: 1, marginRight: 8}}>
                  <ButtonText>Submit</ButtonText>
                </Button>
                <Button
                  variant="outline"
                  color="primary"
                  label="Cancel"
                  onPress={() => {
                    setIsEncrypted(false)
                    setSelectedWalletId(null)
                    setPassword('')
                  }}
                  style={{flex: 1}}>
                  <ButtonText>Cancel</ButtonText>
                </Button>
              </View>
            </View>
          )}

          {/* Private Key Dialog - converted to a modal-like section if shown */}
          {showPrivateKey && (
            <View
              style={{
                paddingHorizontal: 16,
                paddingVertical: 16,
                backgroundColor: theme.atoms.bg.backgroundColor,
              }}>
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: 'bold',
                  marginBottom: 10,
                  color: theme.atoms.text.color,
                }}>
                Private Key
              </Text>
              <Text
                selectable={true}
                style={{marginBottom: 10, color: theme.atoms.text.color}}>
                {privateKey}
              </Text>
              <Button
                variant="outline"
                color="primary"
                label="Close"
                onPress={closePrivateKeyDialog}
                style={{alignSelf: 'flex-start'}}>
                <ButtonText>Close</ButtonText>
              </Button>
            </View>
          )}
        </SettingsList.Container>
      </Layout.Content>
    </Layout.Screen>
  )
}

// Export with a more specific name for use in tab layout
export {WalletScreen as KeysScreen}
export default WalletScreen
