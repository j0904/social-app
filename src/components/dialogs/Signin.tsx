import React from 'react'
import {View} from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import {msg, Trans} from '@lingui/macro'
import {useLingui} from '@lingui/react'

import {
  createCredentialEntryForWallet,
  createWalletFromMnemonic,
  generateWalletMnemonic,
} from '#/lib/hdwallet'
import {isNative} from '#/platform/detection'
import {useLoggedOutViewControls} from '#/state/shell/logged-out'
import {useCloseAllActiveElements} from '#/state/util'
import {Logo} from '#/view/icons/Logo'
import {Logotype} from '#/view/icons/Logotype'
import {atoms as a, useBreakpoints, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Dialog from '#/components/Dialog'
import {useGlobalDialogsControlContext} from '#/components/dialogs/Context'
import {Text} from '#/components/Typography'

export function SigninDialog() {
  const {signinDialogControl: control} = useGlobalDialogsControlContext()
  return (
    <Dialog.Outer control={control}>
      <Dialog.Handle />
      <SigninDialogInner control={control} />
    </Dialog.Outer>
  )
}

function SigninDialogInner({}: {control: Dialog.DialogOuterProps['control']}) {
  const t = useTheme()
  const {_} = useLingui()
  const {gtMobile} = useBreakpoints()
  const {requestSwitchToAccount} = useLoggedOutViewControls()
  const closeAllActiveElements = useCloseAllActiveElements()

  const showSignIn = React.useCallback(() => {
    closeAllActiveElements()
    requestSwitchToAccount({requestedAccount: 'none'})
  }, [requestSwitchToAccount, closeAllActiveElements])

  const showCreateAccount = React.useCallback(() => {
    closeAllActiveElements()
    requestSwitchToAccount({requestedAccount: 'new'})
  }, [requestSwitchToAccount, closeAllActiveElements])

  // Wallet state for demo
  const [walletInfo, setWalletInfo] = React.useState<string | null>(null)
  const [showWalletPassword, setShowWalletPassword] = React.useState(false)
  const [walletPassword, setWalletPassword] = React.useState('')
  const [generatedMnemonic, setGeneratedMnemonic] = React.useState<
    string | null
  >(null)
  const [generatedFilename, setGeneratedFilename] = React.useState<
    string | null
  >(null)

  // Handler for generating a new wallet and saving to file
  const handleGenerateWallet = React.useCallback(() => {
    const mnemonic = generateWalletMnemonic()
    const filename = `wallet-${Date.now()}.txt`
    setGeneratedMnemonic(mnemonic)
    setGeneratedFilename(filename)
    setShowWalletPassword(true)
  }, [])

  // Handler for actually generating and saving wallet after password entry
  const handleConfirmGenerateWallet = React.useCallback(async () => {
    if (!generatedMnemonic || !generatedFilename) {
      setWalletInfo('Error: Wallet not generated yet.')
      setShowWalletPassword(false)
      setWalletPassword('')
      return
    }

    const mnemonic = generatedMnemonic
    const filename = generatedFilename
    const fileContent = mnemonic // For simplicity, saving just the mnemonic

    try {
      console.log('Attempting to save wallet file.')
      console.log('isNative:', isNative)

      if (isNative) {
        const fileUri = FileSystem.documentDirectory + filename
        console.log('Native: Saving to temporary URI:', fileUri)
        await FileSystem.writeAsStringAsync(fileUri, fileContent)
        console.log('Native: File written to temporary URI.')

        const sharingAvailable = await Sharing.isAvailableAsync()
        console.log('Native: Sharing available:', sharingAvailable)

        if (sharingAvailable) {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'text/plain',
            UTI: 'public.plain-text',
          })
          setWalletInfo('Wallet generated and ready to be shared/saved.')
          console.log('Native: Share sheet opened.')
        } else {
          setWalletInfo(
            `Wallet generated and saved to app's document directory: ${fileUri}. Sharing not available.`,
          )
          console.log('Native: Sharing not available.')
        }
      } else {
        // Web: Trigger file download
        console.log('Web: Attempting to trigger download.')
        const blob = new Blob([fileContent], {type: 'text/plain'})
        const url = URL.createObjectURL(blob)
        const downloadLink = document.createElement('a')
        downloadLink.href = url
        downloadLink.download = filename
        document.body.appendChild(downloadLink)
        downloadLink.click()
        document.body.removeChild(downloadLink)
        URL.revokeObjectURL(url)
        setWalletInfo('Wallet generated and downloaded.')
        console.log('Web: Download triggered.')
      }
    } catch (e: any) {
      console.error('Error generating/saving wallet:', e)
      setWalletInfo(
        `Failed to generate/save wallet: ${e.message || 'Unknown error'}`,
      )
      console.log(
        'Caught error during wallet save:',
        e.message || 'Unknown error',
      )
    }

    setShowWalletPassword(false)
    setWalletPassword('')
    setGeneratedMnemonic(null)
    setGeneratedFilename(null)
  }, [setWalletInfo, generatedMnemonic, generatedFilename])

  // Handler for loading a wallet from file
  const handleLoadWallet = React.useCallback(async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: 'text/plain', // Assuming wallet files are plain text
        copyToCacheDirectory: true,
      })

      if (res.canceled) {
        setWalletInfo('Wallet load cancelled.')
        return
      }

      const fileUri = res.assets[0].uri
      let fileContent = ''

      // Use fetch for both web and native, as expo-document-picker's URI should be readable
      const response = await fetch(fileUri)
      fileContent = await response.text()

      const mnemonic = fileContent.trim()
      if (!mnemonic) {
        setWalletInfo('Selected file is empty or invalid.')
        return
      }

      const wallet = createWalletFromMnemonic(mnemonic)
      const entry = createCredentialEntryForWallet(
        wallet,
        'https://example.com',
      )
      setWalletInfo(
        `Loaded wallet\nPublic Key: ${wallet.publicKey}\nUser: ${entry.user}\nPassword: ${entry.password}`,
      )
    } catch (e: any) {
      console.error('Error loading wallet:', e)
      setWalletInfo(`Failed to load wallet: ${e.message || 'Unknown error'}`)
    }
  }, [setWalletInfo])

  return (
    <Dialog.ScrollableInner
      label={_(msg`Sign in to Bluesky or create a new account`)}
      style={[gtMobile ? {width: 'auto', maxWidth: 420} : a.w_full]}>
      <View style={[!isNative && a.p_2xl]}>
        <View
          style={[
            a.flex_row,
            a.align_center,
            a.justify_center,
            a.gap_sm,
            a.pb_lg,
          ]}>
          <Logo width={36} />
          <View style={{paddingTop: 6}}>
            <Logotype width={120} fill={t.atoms.text.color} />
          </View>
        </View>

        <Text
          style={[
            a.text_lg,
            a.text_center,
            t.atoms.text,
            a.pb_2xl,
            a.leading_snug,
            a.mx_auto,
            {
              maxWidth: 300,
            },
          ]}>
          <Trans>
            Sign in or create your account to join the conversation!
          </Trans>
        </Text>

        <View style={[a.flex_col, a.gap_md]}>
          <Button
            variant="solid"
            color="primary"
            size="large"
            onPress={showCreateAccount}
            label={_(msg`Create an account`)}>
            <ButtonText>
              <Trans>Create an account</Trans>
            </ButtonText>
          </Button>

          <Button
            variant="outline"
            color="primary"
            size="large"
            onPress={handleLoadWallet}
            label={_(msg`Load Wallet`)}>
            <ButtonText>
              <Trans>Load Wallet</Trans>
            </ButtonText>
          </Button>

          <Button
            variant="outline"
            color="secondary"
            size="large"
            onPress={handleGenerateWallet}
            label={_(msg`Generate Wallet`)}>
            <ButtonText>
              <Trans>Generate Wallet</Trans>
            </ButtonText>
          </Button>

          <Button
            variant="solid"
            color="secondary"
            size="large"
            onPress={showSignIn}
            label={_(msg`Sign in`)}>
            <ButtonText>
              <Trans>Sign in</Trans>
            </ButtonText>
          </Button>
        </View>

        {walletInfo && (
          <Text style={[a.text_sm, a.text_center, a.mt_md]}>{walletInfo}</Text>
        )}

        {showWalletPassword && (
          <View style={[a.flex_col, a.gap_sm, a.mt_md]}>
            <Text style={[a.text_center]}>
              <Trans>Enter a password to protect your wallet file:</Trans>
            </Text>
            <input
              type="password"
              value={walletPassword}
              onChange={e => setWalletPassword(e.target.value)}
              style={{
                padding: 8,
                borderRadius: 4,
                border: '1px solid #ccc',
                width: '100%',
              }}
              placeholder="Wallet password"
              autoFocus
            />
            <Button
              variant="solid"
              color="primary"
              size="large"
              onPress={handleConfirmGenerateWallet}
              label={_(msg`Save Wallet`)}>
              <ButtonText>
                <Trans>Save Wallet</Trans>
              </ButtonText>
            </Button>
          </View>
        )}

        {isNative && <View style={{height: 10}} />}
      </View>

      <Dialog.Close />
    </Dialog.ScrollableInner>
  )
}
