import {useCallback, useState} from 'react'
import {Alert, TextInput, View} from 'react-native'
import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import {msg, Trans} from '@lingui/macro'
import {useLingui} from '@lingui/react'
import {type NativeStackScreenProps} from '@react-navigation/native-stack'

import {type CommonNavigatorParams} from '#/lib/routes/types'
import {isWeb} from '#/platform/detection'
import {useWallet} from '#/state/wallet'
import * as SettingsList from '#/screens/Settings/components/SettingsList'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Layout from '#/components/Layout'
import {Text} from '#/components/Typography'
import {
  createWallet,
  importPrivateKey,
  loadWallet,
  saveKeyToFile,
  type WalletFile as HDWalletFile,
} from './WalletHelper'

type CreateWalletStep = 'idle' | 'created' | 'enterPassword' | 'saving' | 'done'
type ImportKeyStep = 'idle' | 'enterKey' | 'enterPassword' | 'saving' | 'done'

export function KeysScreen(
  _props: Readonly<NativeStackScreenProps<CommonNavigatorParams, 'WalletKeys'>>,
) {
  const theme = useTheme()
  const {_} = useLingui()

  // Wallet state management - secure storage
  const {publicInfo, isUnlocked, storeEncryptedWallet, lockWallet} = useWallet()

  // Show existing wallet info if available
  const hasExistingWallet = !!publicInfo?.hasEncryptedWallet

  // State for wallet creation flow
  const [step, setStep] = useState<CreateWalletStep>('idle')
  const [newWallet, setNewWallet] = useState<HDWalletFile | null>(null)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [walletAddress, setWalletAddress] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  // State for loading existing wallet
  const [loadMode, setLoadMode] = useState(false)
  const [loadPassword, setLoadPassword] = useState('')
  const [loadedWallet, setLoadedWallet] = useState<HDWalletFile | null>(null)

  // State for import private key flow
  const [importStep, setImportStep] = useState<ImportKeyStep>('idle')
  const [privateKeyInput, setPrivateKeyInput] = useState('')
  const [importedWallet, setImportedWallet] = useState<HDWalletFile | null>(
    null,
  )

  // Create a new wallet
  const handleCreateWallet = useCallback(async () => {
    setIsLoading(true)
    setErrorMessage('')

    try {
      const wallet = await createWallet()
      setNewWallet(wallet)
      setWalletAddress(wallet.wallet.address)
      setStep('created')
    } catch (error) {
      console.error('Error creating wallet:', error)
      setErrorMessage(`Failed to create wallet: ${(error as Error).message}`)
      Alert.alert(
        'Error',
        `Failed to create wallet: ${(error as Error).message}`,
      )
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Proceed to password entry step
  const handleProceedToPassword = useCallback(() => {
    setStep('enterPassword')
  }, [])

  // Validate and save wallet with password
  const handleSaveWallet = useCallback(async () => {
    if (!newWallet) {
      setErrorMessage('No wallet to save')
      return
    }

    if (!password) {
      setErrorMessage('Please enter a password')
      return
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match')
      return
    }

    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters')
      return
    }

    setIsLoading(true)
    setErrorMessage('')
    setStep('saving')

    try {
      // Encrypt the wallet with the password
      const encryptedContent = await saveKeyToFile(newWallet, password)

      // Store encrypted wallet in secure state for app usage
      // Also store password in memory for session use (cleared on background/lock)
      await storeEncryptedWallet(
        encryptedContent,
        newWallet.wallet.address,
        password,
      )

      const fileName = `wallet_${newWallet.wallet.address.slice(0, 8)}_${Date.now()}.json`

      if (isWeb) {
        // For web, try to use File System Access API for directory selection
        // Falls back to regular download if not supported
        const blob = new Blob([encryptedContent], {type: 'application/json'})

        // Check if showSaveFilePicker is available (Chrome, Edge, Opera)
        if ('showSaveFilePicker' in globalThis) {
          try {
            const handle = await (globalThis as any).showSaveFilePicker({
              suggestedName: fileName,
              types: [
                {
                  description: 'JSON Wallet File',
                  accept: {'application/json': ['.json']},
                },
              ],
            })
            const writable = await handle.createWritable()
            await writable.write(blob)
            await writable.close()

            setStep('done')
            Alert.alert(
              'Success',
              'Wallet saved successfully. Keep your password safe!',
            )
          } catch (pickerError: any) {
            // User cancelled the picker or error occurred
            if (pickerError.name === 'AbortError') {
              // User cancelled - go back to password step
              setStep('enterPassword')
              setErrorMessage('Save cancelled. Please try again.')
              setIsLoading(false)
              return
            }
            // Other error - fall back to regular download
            throw pickerError
          }
        } else {
          // Fallback: trigger a file download
          const url = URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = url
          link.download = fileName
          document.body.appendChild(link)
          link.click()
          link.remove()
          URL.revokeObjectURL(url)

          setStep('done')
          Alert.alert(
            'Success',
            'Wallet created and downloaded successfully. Keep your password safe!',
          )
        }
      } else {
        // For native platforms, save to documents directory and use share sheet
        const documentsDir = FileSystem.documentDirectory
        if (!documentsDir) {
          throw new Error('Documents directory not available')
        }

        const filePath = `${documentsDir}${fileName}`

        // Write the encrypted wallet file
        await FileSystem.writeAsStringAsync(filePath, encryptedContent)

        // Check if sharing is available
        const sharingAvailable = await Sharing.isAvailableAsync()

        if (sharingAvailable) {
          // Show share sheet - on iOS this allows saving to Files app
          // On Android this allows saving to Downloads, Google Drive, etc.
          Alert.alert(
            'Wallet Created',
            'Your encrypted wallet file is ready. Use the share sheet to save it to your preferred location (Files, iCloud, Google Drive, etc.).',
            [
              {
                text: 'Save Wallet File',
                onPress: () => {
                  Sharing.shareAsync(filePath, {
                    mimeType: 'application/json',
                    dialogTitle: 'Save your encrypted wallet file',
                    UTI: 'public.json',
                  })
                    .then(() => {
                      setStep('done')
                    })
                    .catch(shareError => {
                      console.error('Share error:', shareError)
                      // File is still saved in app documents
                      setStep('done')
                    })
                },
              },
            ],
          )
        } else {
          // Sharing not available - file is saved in app's document directory
          setStep('done')
          Alert.alert(
            'Wallet Saved',
            `Your encrypted wallet has been saved to the app's internal storage as "${fileName}". Note: This location may not be easily accessible. For backup, please use a device that supports file sharing.`,
          )
        }
      }
    } catch (error) {
      console.error('Error saving wallet:', error)
      setErrorMessage(`Failed to save wallet: ${(error as Error).message}`)
      setStep('enterPassword')
      Alert.alert('Error', `Failed to save wallet: ${(error as Error).message}`)
    } finally {
      setIsLoading(false)
    }
  }, [newWallet, password, confirmPassword, storeEncryptedWallet])

  // Reset to start over
  const handleReset = useCallback(() => {
    setStep('idle')
    setNewWallet(null)
    setPassword('')
    setConfirmPassword('')
    setWalletAddress('')
    setErrorMessage('')
    setLoadMode(false)
    setLoadPassword('')
    setLoadedWallet(null)
    setImportStep('idle')
    setPrivateKeyInput('')
    setImportedWallet(null)
  }, [])

  // Start import private key flow
  const handleStartImport = useCallback(() => {
    setImportStep('enterKey')
    setErrorMessage('')
  }, [])

  // Validate and import private key
  const handleImportKey = useCallback(async () => {
    if (!privateKeyInput.trim()) {
      setErrorMessage('Please enter a private key')
      return
    }

    setIsLoading(true)
    setErrorMessage('')

    try {
      const wallet = await importPrivateKey(privateKeyInput)
      setImportedWallet(wallet)
      setWalletAddress(wallet.wallet.address)
      setImportStep('enterPassword')
    } catch (error) {
      console.error('Error importing private key:', error)
      setErrorMessage(`Failed to import key: ${(error as Error).message}`)
      Alert.alert('Error', `Failed to import key: ${(error as Error).message}`)
    } finally {
      setIsLoading(false)
    }
  }, [privateKeyInput])

  // Save imported wallet with password
  const handleSaveImportedWallet = useCallback(async () => {
    if (!importedWallet) {
      setErrorMessage('No wallet to save')
      return
    }

    if (!password) {
      setErrorMessage('Please enter a password')
      return
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match')
      return
    }

    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters')
      return
    }

    setIsLoading(true)
    setErrorMessage('')
    setImportStep('saving')

    try {
      // Encrypt the wallet with the password
      const encryptedContent = await saveKeyToFile(importedWallet, password)

      // Store encrypted wallet in secure state
      await storeEncryptedWallet(
        encryptedContent,
        importedWallet.wallet.address,
        password,
      )

      const fileName = `wallet_${importedWallet.wallet.address.slice(0, 8)}_${Date.now()}.json`

      if (isWeb) {
        const blob = new Blob([encryptedContent], {type: 'application/json'})

        if ('showSaveFilePicker' in globalThis) {
          try {
            const handle = await (globalThis as any).showSaveFilePicker({
              suggestedName: fileName,
              types: [
                {
                  description: 'JSON Wallet File',
                  accept: {'application/json': ['.json']},
                },
              ],
            })
            const writable = await handle.createWritable()
            await writable.write(blob)
            await writable.close()

            setImportStep('done')
            Alert.alert('Success', 'Imported wallet saved successfully!')
          } catch (pickerError: any) {
            if (pickerError.name === 'AbortError') {
              setImportStep('enterPassword')
              setErrorMessage('Save cancelled. Please try again.')
              setIsLoading(false)
              return
            }
            throw pickerError
          }
        } else {
          const url = URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = url
          link.download = fileName
          document.body.appendChild(link)
          link.click()
          link.remove()
          URL.revokeObjectURL(url)

          setImportStep('done')
          Alert.alert('Success', 'Imported wallet saved successfully!')
        }
      } else {
        const documentsDir = FileSystem.documentDirectory
        if (!documentsDir) {
          throw new Error('Documents directory not available')
        }

        const filePath = `${documentsDir}${fileName}`
        await FileSystem.writeAsStringAsync(filePath, encryptedContent)

        const sharingAvailable = await Sharing.isAvailableAsync()
        if (sharingAvailable) {
          Alert.alert(
            'Wallet Imported',
            'Your imported wallet is ready. Use the share sheet to save it.',
            [
              {
                text: 'Save Wallet File',
                onPress: () => {
                  Sharing.shareAsync(filePath, {
                    mimeType: 'application/json',
                    dialogTitle: 'Save your encrypted wallet file',
                    UTI: 'public.json',
                  })
                    .then(() => setImportStep('done'))
                    .catch(() => setImportStep('done'))
                },
              },
            ],
          )
        } else {
          setImportStep('done')
          Alert.alert('Wallet Saved', `Imported wallet saved as "${fileName}".`)
        }
      }
    } catch (error) {
      console.error('Error saving imported wallet:', error)
      setErrorMessage(`Failed to save wallet: ${(error as Error).message}`)
      setImportStep('enterPassword')
      Alert.alert('Error', `Failed to save wallet: ${(error as Error).message}`)
    } finally {
      setIsLoading(false)
    }
  }, [importedWallet, password, confirmPassword, storeEncryptedWallet])

  // Handle loading existing wallet (web)
  const handleLoadWalletWeb = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e: Event) => {
      const target = e.target as HTMLInputElement
      const file = target.files?.[0]
      if (file) {
        const content = await file.text()
        if (content) {
          setLoadMode(true)
          // Store the content temporarily
          ;(globalThis as any).__walletFileContent = content
        }
      }
    }
    input.click()
  }, [])

  // Decrypt and load wallet with password
  const handleDecryptWallet = useCallback(async () => {
    if (!loadPassword) {
      setErrorMessage('Please enter your password')
      return
    }

    setIsLoading(true)
    setErrorMessage('')

    try {
      const content = (globalThis as any).__walletFileContent
      if (!content) {
        throw new Error('No wallet file loaded')
      }

      const wallet = await loadWallet(content, loadPassword)
      setLoadedWallet(wallet)
      setWalletAddress(wallet.wallet.address)

      // Store the encrypted wallet in secure state for future use
      // This allows unlocking without re-loading the file
      await storeEncryptedWallet(content, wallet.wallet.address)

      // Clear the temporary content
      delete (globalThis as any).__walletFileContent

      Alert.alert('Success', 'Wallet loaded and stored securely!')
    } catch (error) {
      console.error('Error loading wallet:', error)
      setErrorMessage('Failed to decrypt wallet. Check your password.')
      Alert.alert('Error', 'Failed to decrypt wallet. Check your password.')
    } finally {
      setIsLoading(false)
    }
  }, [loadPassword, storeEncryptedWallet])

  // Render idle state - main menu
  const renderIdleState = () => (
    <>
      {/* Show existing wallet status if available */}
      {hasExistingWallet && (
        <>
          <View style={[a.px_lg, a.py_md]}>
            <View
              style={[
                a.p_md,
                a.rounded_sm,
                a.mb_sm,
                {backgroundColor: theme.atoms.bg_contrast_25.backgroundColor},
              ]}>
              <Text
                style={[
                  a.text_sm,
                  a.mb_xs,
                  {color: theme.atoms.text_contrast_medium.color},
                ]}>
                <Trans>Current Wallet:</Trans>
              </Text>
              <Text
                selectable
                style={[
                  a.text_md,
                  {color: theme.atoms.text.color, fontFamily: 'monospace'},
                ]}>
                {publicInfo?.address}
              </Text>
              <View style={[a.flex_row, a.align_center, a.mt_sm, a.gap_xs]}>
                <View
                  style={[
                    {
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: isUnlocked
                        ? theme.palette.positive_500
                        : theme.palette.contrast_400,
                    },
                  ]}
                />
                <Text
                  style={[
                    a.text_xs,
                    {color: theme.atoms.text_contrast_medium.color},
                  ]}>
                  {isUnlocked ? <Trans>Unlocked</Trans> : <Trans>Locked</Trans>}
                </Text>
              </View>
            </View>
            {isUnlocked && (
              <Button
                color="secondary"
                size="small"
                label={_(msg`Lock Wallet`)}
                onPress={lockWallet}
                style={[a.self_start]}>
                <ButtonText>
                  <Trans>Lock Wallet</Trans>
                </ButtonText>
              </Button>
            )}
          </View>
          <SettingsList.Divider />
        </>
      )}

      <View style={[a.pt_lg, a.px_lg, a.pb_md]}>
        <Text style={[a.text_md, a.leading_snug]}>
          <Trans>Create a new wallet or load an existing one.</Trans>
        </Text>
      </View>
      <SettingsList.Divider />
      <SettingsList.PressableItem
        onPress={handleCreateWallet}
        label={_(msg`Create New Wallet`)}
        disabled={isLoading}>
        <SettingsList.ItemText>
          <Trans>Create New Wallet</Trans>
        </SettingsList.ItemText>
        <SettingsList.Chevron />
      </SettingsList.PressableItem>
      <SettingsList.PressableItem
        onPress={handleStartImport}
        label={_(msg`Import Private Key`)}
        disabled={isLoading}>
        <SettingsList.ItemText>
          <Trans>Import Private Key</Trans>
        </SettingsList.ItemText>
        <SettingsList.Chevron />
      </SettingsList.PressableItem>
      {isWeb && (
        <SettingsList.PressableItem
          onPress={handleLoadWalletWeb}
          label={_(msg`Load Existing Wallet`)}
          disabled={isLoading}>
          <SettingsList.ItemText>
            <Trans>Load Existing Wallet</Trans>
          </SettingsList.ItemText>
          <SettingsList.Chevron />
        </SettingsList.PressableItem>
      )}
    </>
  )

  // Render wallet created state - show address and option to save
  const renderCreatedState = () => (
    <View style={[a.px_lg, a.py_lg]}>
      <Text
        style={[
          a.text_lg,
          a.font_bold,
          a.mb_md,
          {color: theme.atoms.text.color},
        ]}>
        <Trans>New Wallet Created!</Trans>
      </Text>

      <View
        style={[
          a.mb_lg,
          a.p_md,
          a.rounded_sm,
          {backgroundColor: theme.atoms.bg_contrast_25.backgroundColor},
        ]}>
        <Text
          style={[
            a.text_sm,
            a.mb_xs,
            {color: theme.atoms.text_contrast_medium.color},
          ]}>
          <Trans>Your wallet address:</Trans>
        </Text>
        <Text
          selectable
          style={[
            a.text_md,
            {color: theme.atoms.text.color, fontFamily: 'monospace'},
          ]}>
          {walletAddress}
        </Text>
      </View>

      <Text
        style={[
          a.text_sm,
          a.mb_lg,
          {color: theme.atoms.text_contrast_medium.color},
        ]}>
        <Trans>
          Important: You must save this wallet with a secure password. Without
          the password, you won't be able to access your funds.
        </Trans>
      </Text>

      <View style={[a.flex_row, a.gap_sm]}>
        <Button
          color="primary"
          label={_(msg`Save with Password`)}
          onPress={handleProceedToPassword}
          style={[a.flex_1]}>
          <ButtonText>
            <Trans>Save with Password</Trans>
          </ButtonText>
        </Button>
        <Button
          color="secondary"
          label={_(msg`Cancel`)}
          onPress={handleReset}
          style={[a.flex_1]}>
          <ButtonText>
            <Trans>Cancel</Trans>
          </ButtonText>
        </Button>
      </View>
    </View>
  )

  // Render password entry state
  const renderPasswordState = () => (
    <View style={[a.px_lg, a.py_lg]}>
      <Text
        style={[
          a.text_lg,
          a.font_bold,
          a.mb_md,
          {color: theme.atoms.text.color},
        ]}>
        <Trans>Set Wallet Password</Trans>
      </Text>

      <Text
        style={[
          a.text_sm,
          a.mb_lg,
          {color: theme.atoms.text_contrast_medium.color},
        ]}>
        <Trans>
          This password will encrypt your wallet file. Make sure to remember it
          - there is no way to recover your wallet without it!
        </Trans>
      </Text>

      <View style={[a.mb_md]}>
        <Text style={[a.text_sm, a.mb_xs, {color: theme.atoms.text.color}]}>
          <Trans>Password</Trans>
        </Text>
        <TextInput
          accessibilityLabel={_(msg`Password`)}
          accessibilityHint={_(msg`Enter a password to encrypt your wallet`)}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          style={[
            a.px_md,
            a.py_sm,
            a.rounded_sm,
            a.text_md,
            {
              borderWidth: 1,
              borderColor: theme.atoms.border_contrast_low.borderColor,
              backgroundColor: theme.atoms.bg.backgroundColor,
              color: theme.atoms.text.color,
            },
          ]}
          placeholder={_(msg`Enter password (min 6 characters)`)}
          placeholderTextColor={theme.atoms.text_contrast_low.color}
        />
      </View>

      <View style={[a.mb_lg]}>
        <Text style={[a.text_sm, a.mb_xs, {color: theme.atoms.text.color}]}>
          <Trans>Confirm Password</Trans>
        </Text>
        <TextInput
          accessibilityLabel={_(msg`Confirm password`)}
          accessibilityHint={_(msg`Re-enter your password to confirm`)}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          style={[
            a.px_md,
            a.py_sm,
            a.rounded_sm,
            a.text_md,
            {
              borderWidth: 1,
              borderColor: theme.atoms.border_contrast_low.borderColor,
              backgroundColor: theme.atoms.bg.backgroundColor,
              color: theme.atoms.text.color,
            },
          ]}
          placeholder={_(msg`Confirm password`)}
          placeholderTextColor={theme.atoms.text_contrast_low.color}
        />
      </View>

      {errorMessage ? (
        <Text style={[a.text_sm, a.mb_md, {color: theme.palette.negative_500}]}>
          {errorMessage}
        </Text>
      ) : null}

      <View style={[a.flex_row, a.gap_sm]}>
        <Button
          color="primary"
          label={_(msg`Save Wallet`)}
          onPress={handleSaveWallet}
          disabled={isLoading}
          style={[a.flex_1]}>
          <ButtonText>
            {isLoading ? <Trans>Saving...</Trans> : <Trans>Save Wallet</Trans>}
          </ButtonText>
        </Button>
        <Button
          color="secondary"
          label={_(msg`Back`)}
          onPress={() => setStep('created')}
          disabled={isLoading}
          style={[a.flex_1]}>
          <ButtonText>
            <Trans>Back</Trans>
          </ButtonText>
        </Button>
      </View>
    </View>
  )

  // Render done state
  const renderDoneState = () => (
    <View style={[a.px_lg, a.py_lg]}>
      <Text
        style={[
          a.text_lg,
          a.font_bold,
          a.mb_md,
          {color: theme.palette.positive_600},
        ]}>
        <Trans>Wallet Saved Successfully!</Trans>
      </Text>

      <View
        style={[
          a.mb_lg,
          a.p_md,
          a.rounded_sm,
          {backgroundColor: theme.atoms.bg_contrast_25.backgroundColor},
        ]}>
        <Text
          style={[
            a.text_sm,
            a.mb_xs,
            {color: theme.atoms.text_contrast_medium.color},
          ]}>
          <Trans>Wallet address:</Trans>
        </Text>
        <Text
          selectable
          style={[
            a.text_md,
            {color: theme.atoms.text.color, fontFamily: 'monospace'},
          ]}>
          {walletAddress}
        </Text>
      </View>

      <Text
        style={[
          a.text_sm,
          a.mb_lg,
          {color: theme.atoms.text_contrast_medium.color},
        ]}>
        <Trans>
          Your wallet has been encrypted and saved. Make sure to:{'\n'}• Keep
          your password safe{'\n'}• Backup your wallet file{'\n'}• Never share
          your password or wallet file
        </Trans>
      </Text>

      <Button
        color="primary"
        label={_(msg`Create Another Wallet`)}
        onPress={handleReset}
        style={[a.w_full]}>
        <ButtonText>
          <Trans>Create Another Wallet</Trans>
        </ButtonText>
      </Button>
    </View>
  )

  // Render load wallet mode (password entry for existing wallet)
  const renderLoadMode = () => (
    <View style={[a.px_lg, a.py_lg]}>
      <Text
        style={[
          a.text_lg,
          a.font_bold,
          a.mb_md,
          {color: theme.atoms.text.color},
        ]}>
        <Trans>Enter Wallet Password</Trans>
      </Text>

      <Text
        style={[
          a.text_sm,
          a.mb_lg,
          {color: theme.atoms.text_contrast_medium.color},
        ]}>
        <Trans>Enter the password to decrypt your wallet file.</Trans>
      </Text>

      <View style={[a.mb_lg]}>
        <Text style={[a.text_sm, a.mb_xs, {color: theme.atoms.text.color}]}>
          <Trans>Password</Trans>
        </Text>
        <TextInput
          accessibilityLabel={_(msg`Password`)}
          accessibilityHint={_(msg`Enter your wallet password`)}
          value={loadPassword}
          onChangeText={setLoadPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          style={[
            a.px_md,
            a.py_sm,
            a.rounded_sm,
            a.text_md,
            {
              borderWidth: 1,
              borderColor: theme.atoms.border_contrast_low.borderColor,
              backgroundColor: theme.atoms.bg.backgroundColor,
              color: theme.atoms.text.color,
            },
          ]}
          placeholder={_(msg`Enter wallet password`)}
          placeholderTextColor={theme.atoms.text_contrast_low.color}
        />
      </View>

      {errorMessage ? (
        <Text style={[a.text_sm, a.mb_md, {color: theme.palette.negative_500}]}>
          {errorMessage}
        </Text>
      ) : null}

      {loadedWallet ? (
        <View
          style={[
            a.mb_lg,
            a.p_md,
            a.rounded_sm,
            {backgroundColor: theme.atoms.bg_contrast_25.backgroundColor},
          ]}>
          <Text
            style={[
              a.text_sm,
              a.mb_xs,
              {color: theme.atoms.text_contrast_medium.color},
            ]}>
            <Trans>Wallet loaded! Address:</Trans>
          </Text>
          <Text
            selectable
            style={[
              a.text_md,
              {color: theme.atoms.text.color, fontFamily: 'monospace'},
            ]}>
            {loadedWallet.wallet.address}
          </Text>
        </View>
      ) : null}

      <View style={[a.flex_row, a.gap_sm]}>
        <Button
          color="primary"
          label={_(msg`Decrypt Wallet`)}
          onPress={handleDecryptWallet}
          disabled={isLoading}
          style={[a.flex_1]}>
          <ButtonText>
            {isLoading ? (
              <Trans>Loading...</Trans>
            ) : (
              <Trans>Decrypt Wallet</Trans>
            )}
          </ButtonText>
        </Button>
        <Button
          color="secondary"
          label={_(msg`Cancel`)}
          onPress={handleReset}
          disabled={isLoading}
          style={[a.flex_1]}>
          <ButtonText>
            <Trans>Cancel</Trans>
          </ButtonText>
        </Button>
      </View>
    </View>
  )

  // Render import key step - enter private key
  const renderImportEnterKeyState = () => (
    <View style={[a.px_lg, a.py_lg]}>
      <Text
        style={[
          a.text_lg,
          a.font_bold,
          a.mb_md,
          {color: theme.atoms.text.color},
        ]}>
        <Trans>Import Private Key</Trans>
      </Text>

      <Text
        style={[
          a.text_sm,
          a.mb_lg,
          {color: theme.atoms.text_contrast_medium.color},
        ]}>
        <Trans>
          Enter your private key in hex format (64 characters) or WIF format.
          Your key will be encrypted with a password before saving.
        </Trans>
      </Text>

      <View style={[a.mb_lg]}>
        <Text style={[a.text_sm, a.mb_xs, {color: theme.atoms.text.color}]}>
          <Trans>Private Key</Trans>
        </Text>
        <TextInput
          accessibilityLabel={_(msg`Private Key`)}
          accessibilityHint={_(
            msg`Enter your private key in hex or WIF format`,
          )}
          value={privateKeyInput}
          onChangeText={setPrivateKeyInput}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          multiline
          numberOfLines={3}
          style={[
            a.px_md,
            a.py_sm,
            a.rounded_sm,
            a.text_md,
            {
              borderWidth: 1,
              borderColor: theme.atoms.border_contrast_low.borderColor,
              backgroundColor: theme.atoms.bg.backgroundColor,
              color: theme.atoms.text.color,
              fontFamily: 'monospace',
              minHeight: 80,
            },
          ]}
          placeholder={_(msg`Enter private key (hex or WIF)`)}
          placeholderTextColor={theme.atoms.text_contrast_low.color}
        />
      </View>

      {errorMessage ? (
        <Text style={[a.text_sm, a.mb_md, {color: theme.palette.negative_500}]}>
          {errorMessage}
        </Text>
      ) : null}

      <View style={[a.flex_row, a.gap_sm]}>
        <Button
          color="primary"
          label={_(msg`Import Key`)}
          onPress={handleImportKey}
          disabled={isLoading}
          style={[a.flex_1]}>
          <ButtonText>
            {isLoading ? (
              <Trans>Importing...</Trans>
            ) : (
              <Trans>Import Key</Trans>
            )}
          </ButtonText>
        </Button>
        <Button
          color="secondary"
          label={_(msg`Cancel`)}
          onPress={handleReset}
          disabled={isLoading}
          style={[a.flex_1]}>
          <ButtonText>
            <Trans>Cancel</Trans>
          </ButtonText>
        </Button>
      </View>
    </View>
  )

  // Render import password step - enter password to encrypt
  const renderImportPasswordState = () => (
    <View style={[a.px_lg, a.py_lg]}>
      <Text
        style={[
          a.text_lg,
          a.font_bold,
          a.mb_md,
          {color: theme.atoms.text.color},
        ]}>
        <Trans>Set Wallet Password</Trans>
      </Text>

      <View
        style={[
          a.mb_lg,
          a.p_md,
          a.rounded_sm,
          {backgroundColor: theme.atoms.bg_contrast_25.backgroundColor},
        ]}>
        <Text
          style={[
            a.text_sm,
            a.mb_xs,
            {color: theme.atoms.text_contrast_medium.color},
          ]}>
          <Trans>Imported wallet address:</Trans>
        </Text>
        <Text
          selectable
          style={[
            a.text_md,
            {color: theme.atoms.text.color, fontFamily: 'monospace'},
          ]}>
          {walletAddress}
        </Text>
      </View>

      <Text
        style={[
          a.text_sm,
          a.mb_lg,
          {color: theme.atoms.text_contrast_medium.color},
        ]}>
        <Trans>
          Choose a strong password to encrypt your wallet. You will need this
          password to access your wallet.
        </Trans>
      </Text>

      <View style={[a.mb_md]}>
        <Text style={[a.text_sm, a.mb_xs, {color: theme.atoms.text.color}]}>
          <Trans>Password</Trans>
        </Text>
        <TextInput
          accessibilityLabel={_(msg`Password`)}
          accessibilityHint={_(msg`Enter a password to encrypt your wallet`)}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          style={[
            a.px_md,
            a.py_sm,
            a.rounded_sm,
            a.text_md,
            {
              borderWidth: 1,
              borderColor: theme.atoms.border_contrast_low.borderColor,
              backgroundColor: theme.atoms.bg.backgroundColor,
              color: theme.atoms.text.color,
            },
          ]}
          placeholder={_(msg`Enter password (min 6 characters)`)}
          placeholderTextColor={theme.atoms.text_contrast_low.color}
        />
      </View>

      <View style={[a.mb_lg]}>
        <Text style={[a.text_sm, a.mb_xs, {color: theme.atoms.text.color}]}>
          <Trans>Confirm Password</Trans>
        </Text>
        <TextInput
          accessibilityLabel={_(msg`Confirm Password`)}
          accessibilityHint={_(msg`Re-enter your password to confirm`)}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          style={[
            a.px_md,
            a.py_sm,
            a.rounded_sm,
            a.text_md,
            {
              borderWidth: 1,
              borderColor: theme.atoms.border_contrast_low.borderColor,
              backgroundColor: theme.atoms.bg.backgroundColor,
              color: theme.atoms.text.color,
            },
          ]}
          placeholder={_(msg`Confirm password`)}
          placeholderTextColor={theme.atoms.text_contrast_low.color}
        />
      </View>

      {errorMessage ? (
        <Text style={[a.text_sm, a.mb_md, {color: theme.palette.negative_500}]}>
          {errorMessage}
        </Text>
      ) : null}

      <View style={[a.flex_row, a.gap_sm]}>
        <Button
          color="primary"
          label={_(msg`Save Wallet`)}
          onPress={handleSaveImportedWallet}
          disabled={isLoading}
          style={[a.flex_1]}>
          <ButtonText>
            {isLoading ? <Trans>Saving...</Trans> : <Trans>Save Wallet</Trans>}
          </ButtonText>
        </Button>
        <Button
          color="secondary"
          label={_(msg`Cancel`)}
          onPress={handleReset}
          disabled={isLoading}
          style={[a.flex_1]}>
          <ButtonText>
            <Trans>Cancel</Trans>
          </ButtonText>
        </Button>
      </View>
    </View>
  )

  // Render import done state
  const renderImportDoneState = () => (
    <View style={[a.px_lg, a.py_lg]}>
      <Text
        style={[
          a.text_lg,
          a.font_bold,
          a.mb_md,
          {color: theme.palette.positive_500},
        ]}>
        <Trans>Wallet Imported Successfully!</Trans>
      </Text>

      <View
        style={[
          a.mb_lg,
          a.p_md,
          a.rounded_sm,
          {backgroundColor: theme.atoms.bg_contrast_25.backgroundColor},
        ]}>
        <Text
          style={[
            a.text_sm,
            a.mb_xs,
            {color: theme.atoms.text_contrast_medium.color},
          ]}>
          <Trans>Wallet address:</Trans>
        </Text>
        <Text
          selectable
          style={[
            a.text_md,
            {color: theme.atoms.text.color, fontFamily: 'monospace'},
          ]}>
          {walletAddress}
        </Text>
      </View>

      <Text
        style={[
          a.text_sm,
          a.mb_lg,
          {color: theme.atoms.text_contrast_medium.color},
        ]}>
        <Trans>
          Your imported wallet has been encrypted and saved. Make sure to:{'\n'}
          • Keep your password safe{'\n'}• Backup your wallet file{'\n'}• Never
          share your password or wallet file
        </Trans>
      </Text>

      <Button
        color="primary"
        label={_(msg`Done`)}
        onPress={handleReset}
        style={[a.w_full]}>
        <ButtonText>
          <Trans>Done</Trans>
        </ButtonText>
      </Button>
    </View>
  )

  return (
    <Layout.Screen testID="keysScreen">
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>
            <Trans>Manage Keys</Trans>
          </Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>
      <Layout.Content>
        <SettingsList.Container>
          {/* Import flow takes precedence */}
          {importStep === 'enterKey'
            ? renderImportEnterKeyState()
            : importStep === 'enterPassword' || importStep === 'saving'
              ? renderImportPasswordState()
              : importStep === 'done'
                ? renderImportDoneState()
                : loadMode
                  ? renderLoadMode()
                  : step === 'idle'
                    ? renderIdleState()
                    : step === 'created'
                      ? renderCreatedState()
                      : step === 'enterPassword' || step === 'saving'
                        ? renderPasswordState()
                        : step === 'done'
                          ? renderDoneState()
                          : null}
        </SettingsList.Container>
      </Layout.Content>
    </Layout.Screen>
  )
}

// Export with compatible names
export {KeysScreen as WalletScreen}
export default KeysScreen
