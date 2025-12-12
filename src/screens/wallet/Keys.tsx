/* eslint-disable simple-import-sort/imports */
import {type NativeStackScreenProps} from '@react-navigation/native-stack'
import {format} from 'date-fns'
import * as FileSystem from 'expo-file-system'
import {useEffect, useState} from 'react'
import {Alert, Linking, TextInput, View} from 'react-native'

import {useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Layout from '#/components/Layout'
import {Text} from '#/components/Typography'
import {type CommonNavigatorParams} from '#/lib/routes/types'
import {isWeb} from '#/platform/detection'
import * as SettingsList from '#/screens/Settings/components/SettingsList'
import {
  createWallet,
  saveKeyToFile,
  loadWallet,
  type WalletFile as HDWalletFile,
} from './hdwallet'

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
  // State for wallet operations

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

      // First check if this is a traditional wallet file (JSON format)
      try {
        const parsedContent = JSON.parse(fileContent)

        // If it contains wallet data in the old format, handle it
        if (parsedContent.addresses && Array.isArray(parsedContent.addresses)) {
          // This is an older wallet format
          const newWalletData: WalletData = {
            id: '1',
            addresses: parsedContent.addresses || [],
            publickeys: parsedContent.publickeys || [],
            ethaddresses: parsedContent.ethaddresses || [],
            encrypted: parsedContent.encrypted || false,
            checkAddress: parsedContent.checkAddress || true,
            keys: parsedContent.keys || [],
          }

          setWalletData(newWalletData)
          return
        }
      } catch (parseErr) {
        // It's not a JSON file, possibly an encrypted one from hdwallet
      }

      // Try to load as an hdwallet encrypted file
      try {
        // Try with provided password or empty string
        const pwdToUse = password || ''
        const walletFile: HDWalletFile = await loadWallet(fileContent, pwdToUse)

        // Update the wallet data state
        const newWalletData: WalletData = {
          id: '1',
          addresses: [walletFile.wallet.address],
          publickeys: [], // Need to extract from the private key if needed
          ethaddresses: [], // Add ETH addresses if available
          encrypted: !!pwdToUse, // Consider it encrypted if a password was provided/used
          checkAddress: true,
          keys: [
            {
              address: walletFile.wallet.address,
              publicKey: '', // Extract this from the private key if needed
              privateKey: walletFile.wallet.privateKey,
            },
          ],
        }

        setWalletData(newWalletData)
        return
      } catch (hdwalletError) {
        console.error(
          'Error loading wallet with hdwallet module:',
          hdwalletError,
        )
        // If it fails, show an alert to the user
        Alert.alert(
          'Error',
          'Failed to load wallet: ' + (hdwalletError as Error).message,
        )
      }
    } catch (error) {
      console.error('Error loading wallet data:', error)
      Alert.alert(
        'Error',
        'Failed to load wallet data: ' + (error as Error).message,
      )
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

  // Create a new wallet using the hdwallet module
  const createNewWallet = async () => {
    try {
      // Use the new hdwallet module to create a wallet
      const newHDWallet = await createWallet()

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

        // Prepare wallet data for storage
        const newWalletData: WalletData = {
          id,
          addresses: [newHDWallet.wallet.address],
          publickeys: [], // Could extract from the private key if needed
          ethaddresses: [], // Add ETH addresses if needed
          encrypted: password && password.length > 0,
          checkAddress: true,
          keys: [
            {
              address: newHDWallet.wallet.address,
              publicKey: '', // Could extract from the private key if needed
              privateKey: newHDWallet.wallet.privateKey,
            },
          ],
        }

        // For web, we need to encrypt differently since we can't use the native encryption directly
        // But we can still encrypt the HDWallet before storing
        let webFileContent: string
        if (password && password.length > 0) {
          // Encrypt the wallet file using the hdwallet module
          webFileContent = await saveKeyToFile(newHDWallet, password)
        } else {
          // Save as plain text if no encryption is needed
          webFileContent = JSON.stringify(newWalletData)
        }

        // On web, save to localStorage
        localStorage.setItem(fileName, webFileContent)

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

        // Prepare wallet data for storage
        const newWalletData: WalletData = {
          id,
          addresses: [newHDWallet.wallet.address],
          publickeys: [], // Could extract from the private key if needed
          ethaddresses: [], // Add ETH addresses if needed
          encrypted: false,
          checkAddress: true,
          keys: [
            {
              address: newHDWallet.wallet.address,
              publicKey: '', // Could extract from the private key if needed
              privateKey: newHDWallet.wallet.privateKey,
            },
          ],
        }

        // Check if we need to encrypt the wallet
        let fileContent: string
        if (password && password.length > 0) {
          // Encrypt the wallet file using the hdwallet module
          fileContent = await saveKeyToFile(newHDWallet, password)
        } else {
          // Save as plain text if no encryption is needed
          fileContent = JSON.stringify(newWalletData)
        }

        await FileSystem.writeAsStringAsync(filePath, fileContent)

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
      // We're in add key mode - load the encrypted wallet, add a new key, then save it back encrypted
      try {
        // Load the encrypted wallet file
        const fileContent = await FileSystem.readAsStringAsync(walletFile.path)

        // Try to load with the provided password using hdwallet
        let walletFileData: HDWalletFile
        try {
          walletFileData = await loadWallet(fileContent, password)
        } catch (e) {
          console.error('Error loading wallet with provided password:', e)
          Alert.alert('Error', 'Failed to decrypt wallet. Invalid password.')
          return
        }

        // Create a new wallet to add the key to
        const newHDWallet = await createWallet()

        // For now, we'll just add the new wallet's data to the current wallet
        // In a real scenario, we'd want to update the existing wallet file to include both wallets

        // Since we're not supporting multiple keys in the same wallet file with the hdwallet module,
        // we'll instead create a new wallet file for the new key
        const id = Math.random().toString(36).substring(2, 10)
        const now = new Date()
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

        // Prepare wallet data for storage
        const newWalletData: WalletData = {
          id,
          addresses: [newHDWallet.wallet.address],
          publickeys: [], // Could extract from the private key if needed
          ethaddresses: [], // Add ETH addresses if needed
          encrypted: password && password.length > 0,
          checkAddress: true,
          keys: [
            {
              address: newHDWallet.wallet.address,
              publicKey: '', // Could extract from the private key if needed
              privateKey: newHDWallet.wallet.privateKey,
            },
          ],
        }

        // Encrypt the new wallet file using the same password
        let newFileContent: string
        if (password && password.length > 0) {
          newFileContent = await saveKeyToFile(newHDWallet, password)
        } else {
          newFileContent = JSON.stringify(newWalletData)
        }

        await FileSystem.writeAsStringAsync(filePath, newFileContent)

        // Add the new wallet file to the list
        setWalletFiles(prev => [...prev, newWalletFile])

        // Clear the addKeyMode
        setAddKeyMode(false)
        setIsEncrypted(false)
        setSelectedWalletId(null)
        setPassword('')

        Alert.alert('Success', 'New key added as a separate wallet')
      } catch (error) {
        console.error('Error adding key to wallet:', error)
        Alert.alert(
          'Error',
          'Failed to add key to wallet: ' + (error as Error).message,
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
      let originalFileContent: string

      if (isWeb) {
        // On web, read from localStorage
        originalFileContent = localStorage.getItem(walletFile.path) || '{}'
      } else {
        // Native behavior - read the current wallet file
        originalFileContent = await FileSystem.readAsStringAsync(
          walletFile.path,
        )
      }

      // First try to load the existing wallet using our HDWallet functions
      let hdWallet: HDWalletFile
      try {
        // Try loading without a password first (assuming it's unencrypted)
        hdWallet = await loadWallet(originalFileContent, '')
      } catch {
        // If that fails, it might be a traditional JSON wallet, so we'll try to handle it
        try {
          // Try parsing as traditional JSON format
          const parsedContent = JSON.parse(originalFileContent)

          // If it contains addresses, it's likely a traditional format
          if (
            parsedContent.addresses &&
            Array.isArray(parsedContent.addresses) &&
            parsedContent.addresses.length > 0
          ) {
            // Create an HDWallet from this traditional format
            const address = parsedContent.addresses[0]
            const privateKey =
              parsedContent.keys && parsedContent.keys[0]
                ? parsedContent.keys[0].privateKey
                : ''

            hdWallet = {
              wallet: {
                address: address,
                privateKey: privateKey,
              },
              credentials: {
                url: 'https://wallet.bigt.ai',
                user: address + '@bigt.ai',
                password: password, // This is a temporary password for credentials
              },
            }
          } else {
            throw new Error('Invalid wallet format')
          }
        } catch (e) {
          console.error('Error parsing traditional wallet format:', e)
          throw new Error('Could not process wallet file for encryption')
        }
      }

      // Encrypt the wallet using the hdwallet module
      const encryptedContent = await saveKeyToFile(hdWallet, password)

      if (isWeb) {
        // On web, save the encrypted content to localStorage
        localStorage.setItem(walletFile.path, encryptedContent)
      } else {
        // Native behavior - write the encrypted content back to the file
        await FileSystem.writeAsStringAsync(walletFile.path, encryptedContent)
      }

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
      // Create a new HD wallet using our module
      const newHDWallet = await createWallet()

      // Since we're not designed to add multiple keys to the same wallet file with hdwallet module,
      // we'll create a new wallet file for the new key
      const id = Math.random().toString(36).substring(2, 10)
      const now = new Date()
      const fileName = `wallet_${now.getTime()}.json`

      if (isWeb) {
        // For web, path can be just the name
        const newWebWalletFile: WalletFile = {
          id,
          name: fileName,
          path: fileName,
          dowloadURL: fileName,
          createdAt: now,
        }

        // Prepare wallet data for storage
        const newWalletData: WalletData = {
          id,
          addresses: [newHDWallet.wallet.address],
          publickeys: [],
          ethaddresses: [],
          encrypted: false,
          checkAddress: true,
          keys: [
            {
              address: newHDWallet.wallet.address,
              publicKey: '',
              privateKey: newHDWallet.wallet.privateKey,
            },
          ],
        }

        // On web, save to localStorage
        localStorage.setItem(fileName, JSON.stringify(newWalletData))

        // Add the new wallet file to the list
        setWalletFiles(prev => [...prev, newWebWalletFile])

        Alert.alert(
          'Success',
          'New wallet with key created successfully (stored in browser)',
        )
      } else {
        // Native behavior
        const documentsDir = (FileSystem as any).documentDirectory
        if (!documentsDir) {
          throw new Error('Documents directory not available')
        }
        const filePath = `${documentsDir}${fileName}`

        const newNativeWalletFile: WalletFile = {
          id,
          name: fileName,
          path: filePath,
          dowloadURL: filePath,
          createdAt: now,
        }

        // Prepare wallet data for storage
        const newWalletData: WalletData = {
          id,
          addresses: [newHDWallet.wallet.address],
          publickeys: [],
          ethaddresses: [],
          encrypted: false,
          checkAddress: true,
          keys: [
            {
              address: newHDWallet.wallet.address,
              publicKey: '',
              privateKey: newHDWallet.wallet.privateKey,
            },
          ],
        }

        await FileSystem.writeAsStringAsync(
          filePath,
          JSON.stringify(newWalletData),
        )

        // Add the new wallet file to the list
        setWalletFiles(prev => [...prev, newNativeWalletFile])

        Alert.alert('Success', 'New wallet with key created successfully')
      }

      // Reload the wallet files to reflect the changes
      loadWalletFiles()

      Alert.alert('Success', 'New key added as separate wallet')
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
