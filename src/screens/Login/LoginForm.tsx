import React, {useRef, useState} from 'react'
import {
  ActivityIndicator,
  Keyboard,
  LayoutAnimation,
  Platform,
  type TextInput,
  View,
} from 'react-native'
import {
  ComAtprotoServerCreateSession,
  type ComAtprotoServerDescribeServer,
} from '@atproto/api'
import {msg, Trans} from '@lingui/macro'
import {useLingui} from '@lingui/react'

import {
  createWallet,
  generateWalletMnemonic,
  loadWallet,
  saveHDWalletToFile,
} from '#/lib/hdwallet'
import {useRequestNotificationsPermission} from '#/lib/notifications/notifications'
import {isNetworkError} from '#/lib/strings/errors'
import {cleanError} from '#/lib/strings/errors'
import {createFullHandle} from '#/lib/strings/handles'
import {logger} from '#/logger'
import {useSetHasCheckedForStarterPack} from '#/state/preferences/used-starter-packs'
import {useSessionApi} from '#/state/session'
import {useLoggedOutViewControls} from '#/state/shell/logged-out'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import {FormError} from '#/components/forms/FormError'
import {HostingProvider} from '#/components/forms/HostingProvider'
import * as TextField from '#/components/forms/TextField'
import {At_Stroke2_Corner0_Rounded as At} from '#/components/icons/At'
import {Lock_Stroke2_Corner0_Rounded as Lock} from '#/components/icons/Lock'
import {Ticket_Stroke2_Corner0_Rounded as Ticket} from '#/components/icons/Ticket'
import {Loader} from '#/components/Loader'
import {Text} from '#/components/Typography'
import {FormContainer} from './FormContainer'

type ServiceDescription = ComAtprotoServerDescribeServer.OutputSchema

export const LoginForm = ({
  error,
  serviceUrl,
  serviceDescription,
  initialHandle,
  setError,
  setServiceUrl,
  onPressRetryConnect,
  onPressBack,
  onPressForgotPassword,
  onAttemptSuccess,
  onAttemptFailed,
}: {
  error: string
  serviceUrl: string
  serviceDescription: ServiceDescription | undefined
  initialHandle: string
  setError: (v: string) => void
  setServiceUrl: (v: string) => void
  onPressRetryConnect: () => void
  onPressBack: () => void
  onPressForgotPassword: () => void
  onAttemptSuccess: () => void
  onAttemptFailed: () => void
}) => {
  const t = useTheme()
  const [isProcessing, setIsProcessing] = useState<boolean>(false)
  const [isAuthFactorTokenNeeded, setIsAuthFactorTokenNeeded] =
    useState<boolean>(false)
  const [isAuthFactorTokenValueEmpty, setIsAuthFactorTokenValueEmpty] =
    useState<boolean>(true)
  const [identifier, setIdentifier] = useState<string>(initialHandle || '')
  const [password, setPassword] = useState<string>('')
  const authFactorTokenValueRef = useRef<string>('')
  const passwordRef = useRef<TextInput>(null)
  const {_} = useLingui()
  const {login} = useSessionApi()
  const requestNotificationsPermission = useRequestNotificationsPermission()
  const {setShowLoggedOut} = useLoggedOutViewControls()
  const setHasCheckedForStarterPack = useSetHasCheckedForStarterPack()

  // Wallet state for demo
  const [walletInfo, setWalletInfo] = React.useState<string | null>(null)
  const [showWalletPassword, setShowWalletPassword] = React.useState(false)
  const [walletPassword, setWalletPassword] = React.useState('')
  const [showWalletLoadPassword, setShowWalletLoadPassword] =
    React.useState(false)
  const [pendingWalletFile, setPendingWalletFile] = React.useState<File | null>(
    null,
  )
  const [generatedMnemonic, setGeneratedMnemonic] = React.useState<
    string | null
  >(null)
  const [generatedFilename, setGeneratedFilename] = React.useState<
    string | null
  >(null)

  // Handler for generating a new wallet and saving to file
  const handleGenerateWallet = React.useCallback(() => {
    const mnemonic = generateWalletMnemonic()
    const filename = `bsky-wallet-${Date.now()}.txt` // Example filename
    setGeneratedMnemonic(mnemonic)
    setGeneratedFilename(filename)
    setShowWalletPassword(true)
  }, [])

  // Handler for actually generating and saving wallet after password entry
  const handleConfirmGenerateWallet = React.useCallback(async () => {
    if (!generatedMnemonic || !generatedFilename) {
      setWalletInfo('Error: Wallet not generated yet.')
      return
    }
    try {
      const {wallet, credentials: entry} = createWallet(generatedMnemonic)
      const fileContent = saveHDWalletToFile(
        {wallet, credentials: entry},
        walletPassword,
      )
      // Create a CredentialEntry for the wallet and set email/password in UI
      setIdentifier(entry.user)
      setPassword(entry.password)
      if (Platform.OS === 'web') {
        // Use File System Access API if available
        if ('showSaveFilePicker' in window) {
          try {
            const opts = {
              types: [
                {
                  description: 'Wallet Files',
                  accept: {'application/json': ['.json', '.wallet', '.txt']},
                },
              ],
              suggestedName: generatedFilename,
            }
            // @ts-ignore
            const handle = await window.showSaveFilePicker(opts)
            const writable = await handle.createWritable()
            await writable.write(fileContent)
            await writable.close()
            setWalletInfo(`Wallet generated and saved to: ${handle.name}`)
          } catch (e) {
            setWalletInfo('Wallet save cancelled or failed.')
          }
        } else {
          // fallback: download as file
          const walletBlob = new Blob([fileContent], {type: 'application/json'})
          const link = document.createElement('a')
          link.href = URL.createObjectURL(walletBlob)
          link.download = generatedFilename
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
          URL.revokeObjectURL(link.href)
          setWalletInfo(
            `Wallet generated and downloaded as: ${generatedFilename}`,
          )
        }
      } else {
        setWalletInfo(
          `File download triggered for native (simulated).\nFilename: ${generatedFilename}`,
        )
      }
    } catch (e: any) {
      setWalletInfo('Error saving wallet: ' + (e.message || e.toString()))
    }
    setShowWalletPassword(false)
    setWalletPassword('')
    setGeneratedMnemonic(null)
    setGeneratedFilename(null)
  }, [generatedMnemonic, generatedFilename, walletPassword])

  // Handler for loading a wallet from file (web only, native simulated)
  const handleLoadWallet = React.useCallback(async () => {
    if (Platform.OS === 'web') {
      try {
        // Create a hidden file input for wallet file selection
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.json,.wallet,.txt,application/json,text/plain'
        input.style.display = 'none'
        document.body.appendChild(input)
        input.click()
        input.onchange = async () => {
          if (!input.files || input.files.length === 0) {
            setWalletInfo('No file selected.')
            document.body.removeChild(input)
            return
          }
          setPendingWalletFile(input.files[0])
          setShowWalletLoadPassword(true)
          document.body.removeChild(input)
        }
      } catch (e: any) {
        setWalletInfo('Error loading wallet: ' + (e.message || e.toString()))
      }
    } else {
      setWalletInfo(
        'Wallet loading from file is not implemented for native (simulated).',
      )
    }
  }, [])

  // Handler for confirming wallet load with password
  const handleConfirmLoadWallet = React.useCallback(async () => {
    if (!pendingWalletFile) {
      setWalletInfo('No wallet file selected.')
      setShowWalletLoadPassword(false)
      return
    }
    try {
      const reader = new FileReader()
      reader.onload = () => {
        try {
          const fileData = reader.result as string
          const {wallet, credentials} = loadWallet(fileData)
          setIdentifier(credentials.user)
          setPassword(credentials.password)
          setWalletInfo(`Wallet loaded. Public Key: ${wallet.publicKey}`)
        } catch (e: any) {
          setWalletInfo('Failed to load wallet: ' + (e.message || e.toString()))
        }
        setShowWalletLoadPassword(false)
        setWalletPassword('')
        setPendingWalletFile(null)
      }
      reader.readAsText(pendingWalletFile)
    } catch (e: any) {
      setWalletInfo('Error reading wallet file: ' + (e.message || e.toString()))
      setShowWalletLoadPassword(false)
      setPendingWalletFile(null)
    }
  }, [pendingWalletFile]) // Removed walletPassword from dependency array

  const onPressSelectService = React.useCallback(() => {
    Keyboard.dismiss()
  }, [])

  const onPressNext = async () => {
    if (isProcessing) return
    Keyboard.dismiss()
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setError('')

    const authFactorToken = authFactorTokenValueRef.current

    if (!identifier) {
      setError(_(msg`Please enter your username`))
      return
    }

    if (!password) {
      setError(_(msg`Please enter your password`))
      return
    }

    setIsProcessing(true)

    try {
      // try to guess the handle if the user just gave their own username
      let fullIdent = identifier
      if (
        !identifier.includes('@') && // not an email
        !identifier.includes('.') && // not a domain
        serviceDescription &&
        serviceDescription.availableUserDomains.length > 0
      ) {
        let matched = false
        for (const domain of serviceDescription.availableUserDomains) {
          if (fullIdent.endsWith(domain)) {
            matched = true
          }
        }
        if (!matched) {
          fullIdent = createFullHandle(
            identifier,
            serviceDescription.availableUserDomains[0],
          )
        }
      }

      // TODO remove double login
      await login(
        {
          service: serviceUrl,
          identifier: fullIdent,
          password,
          authFactorToken: authFactorToken.trim(),
        },
        'LoginForm',
      )
      onAttemptSuccess()
      setShowLoggedOut(false)
      setHasCheckedForStarterPack(true)
      requestNotificationsPermission('Login')
    } catch (e: any) {
      const errMsg = e.toString()
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
      setIsProcessing(false)
      if (
        e instanceof ComAtprotoServerCreateSession.AuthFactorTokenRequiredError
      ) {
        setIsAuthFactorTokenNeeded(true)
      } else {
        onAttemptFailed()
        if (errMsg.includes('Token is invalid')) {
          logger.debug('Failed to login due to invalid 2fa token', {
            error: errMsg,
          })
          setError(_(msg`Invalid 2FA confirmation code.`))
        } else if (
          errMsg.includes('Authentication Required') ||
          errMsg.includes('Invalid identifier or password')
        ) {
          logger.debug('Failed to login due to invalid credentials', {
            error: errMsg,
          })
          setError(_(msg`Incorrect username or password`))
        } else if (isNetworkError(e)) {
          logger.warn('Failed to login due to network error', {error: errMsg})
          setError(
            _(
              msg`Unable to contact your service. Please check your Internet connection.`,
            ),
          )
        } else {
          logger.warn('Failed to login', {error: errMsg})
          setError(cleanError(errMsg))
        }
      }
    }
  }

  return (
    <FormContainer testID="loginForm" titleText={<Trans>Sign in</Trans>}>
      <View>
        <TextField.LabelText>
          <Trans>Hosting provider</Trans>
        </TextField.LabelText>
        <HostingProvider
          serviceUrl={serviceUrl}
          onSelectServiceUrl={setServiceUrl}
          onOpenDialog={onPressSelectService}
        />
      </View>

      <View style={[a.flex_col, a.gap_md]}>
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

      {showWalletLoadPassword && (
        <View style={[a.flex_col, a.gap_sm, a.mt_md]}>
          <Text style={[a.text_center]}>
            <Trans>Enter your wallet password to load the file:</Trans>
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
            onPress={handleConfirmLoadWallet}
            label={_(msg`Load Wallet`)}>
            <ButtonText>
              <Trans>Load Wallet</Trans>
            </ButtonText>
          </Button>
        </View>
      )}

      <View>
        <TextField.LabelText>
          <Trans>Account</Trans>
        </TextField.LabelText>
        <View style={[a.gap_sm]}>
          <TextField.Root>
            <TextField.Icon icon={At} />
            <TextField.Input
              testID="loginUsernameInput"
              label={_(msg`Username or email address`)}
              autoCapitalize="none"
              autoFocus
              autoCorrect={false}
              autoComplete="username"
              returnKeyType="next"
              textContentType="username"
              value={identifier}
              onChangeText={setIdentifier}
              onSubmitEditing={() => {
                passwordRef.current?.focus()
              }}
              blurOnSubmit={false} // prevents flickering due to onSubmitEditing going to next field
              editable={!isProcessing}
              accessibilityHint={_(
                msg`Enter the username or email address you used when you created your account`,
              )}
            />
          </TextField.Root>

          <TextField.Root>
            <TextField.Icon icon={Lock} />
            <TextField.Input
              testID="loginPasswordInput"
              inputRef={passwordRef}
              label={_(msg`Password`)}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="password"
              returnKeyType="done"
              enablesReturnKeyAutomatically={true}
              secureTextEntry={true}
              textContentType="password"
              clearButtonMode="while-editing"
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={onPressNext}
              blurOnSubmit={false} // HACK: https://github.com/facebook/react-native/issues/21911#issuecomment-558343069 Keyboard blur behavior is now handled in onSubmitEditing
              editable={!isProcessing}
              accessibilityHint={_(msg`Enter your password`)}
            />
            <Button
              testID="forgotPasswordButton"
              onPress={onPressForgotPassword}
              label={_(msg`Forgot password?`)}
              accessibilityHint={_(msg`Opens password reset form`)}
              variant="solid"
              color="secondary"
              style={[
                a.rounded_sm,
                // t.atoms.bg_contrast_100,
                {marginLeft: 'auto', left: 6, padding: 6},
                a.z_10,
              ]}>
              <ButtonText>
                <Trans>Forgot?</Trans>
              </ButtonText>
            </Button>
          </TextField.Root>
        </View>
      </View>
      {isAuthFactorTokenNeeded && (
        <View>
          <TextField.LabelText>
            <Trans>2FA Confirmation</Trans>
          </TextField.LabelText>
          <TextField.Root>
            <TextField.Icon icon={Ticket} />
            <TextField.Input
              testID="loginAuthFactorTokenInput"
              label={_(msg`Confirmation code`)}
              autoCapitalize="none"
              autoFocus
              autoCorrect={false}
              autoComplete="one-time-code"
              returnKeyType="done"
              textContentType="username"
              blurOnSubmit={false} // prevents flickering due to onSubmitEditing going to next field
              onChangeText={(v: string) => {
                setIsAuthFactorTokenValueEmpty(v === '')
                authFactorTokenValueRef.current = v
              }}
              onSubmitEditing={onPressNext}
              editable={!isProcessing}
              accessibilityHint={_(
                msg`Input the code which has been emailed to you`,
              )}
              style={[
                {
                  textTransform: isAuthFactorTokenValueEmpty
                    ? 'none'
                    : 'uppercase',
                },
              ]}
            />
          </TextField.Root>
          <Text style={[a.text_sm, t.atoms.text_contrast_medium, a.mt_sm]}>
            <Trans>
              Check your email for a sign in code and enter it here.
            </Trans>
          </Text>
        </View>
      )}
      <FormError error={error} />
      <View style={[a.flex_row, a.align_center, a.pt_md]}>
        <Button
          label={_(msg`Back`)}
          variant="solid"
          color="secondary"
          size="large"
          onPress={onPressBack}>
          <ButtonText>
            <Trans>Back</Trans>
          </ButtonText>
        </Button>
        <View style={a.flex_1} />
        {!serviceDescription && error ? (
          <Button
            testID="loginRetryButton"
            label={_(msg`Retry`)}
            accessibilityHint={_(msg`Retries signing in`)}
            variant="solid"
            color="secondary"
            size="large"
            onPress={onPressRetryConnect}>
            <ButtonText>
              <Trans>Retry</Trans>
            </ButtonText>
          </Button>
        ) : !serviceDescription ? (
          <>
            <ActivityIndicator />
            <Text style={[t.atoms.text_contrast_high, a.pl_md]}>
              <Trans>Connecting...</Trans>
            </Text>
          </>
        ) : (
          <Button
            testID="loginNextButton"
            label={_(msg`Next`)}
            accessibilityHint={_(msg`Navigates to the next screen`)}
            variant="solid"
            color="primary"
            size="large"
            onPress={onPressNext}>
            <ButtonText>
              <Trans>Next</Trans>
            </ButtonText>
            {isProcessing && <ButtonIcon icon={Loader} />}
          </Button>
        )}
      </View>
    </FormContainer>
  )
}
