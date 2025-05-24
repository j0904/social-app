import React, {useRef} from 'react'
import {Platform, type TextInput, View} from 'react-native'
import {msg, Trans} from '@lingui/macro'
import {useLingui} from '@lingui/react'
import * as EmailValidator from 'email-validator'
import type tldts from 'tldts'

import {
  createWallet,
  generateWalletMnemonic,
  loadWallet,
  saveHDWalletToFile,
} from '#/lib/hdwallet'
import {isEmailMaybeInvalid} from '#/lib/strings/email'
import {logger} from '#/logger'
import {is13, is18, useSignupContext} from '#/screens/Signup/state'
import {Policies} from '#/screens/Signup/StepInfo/Policies'
import {atoms as a, native} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as DateField from '#/components/forms/DateField'
import {type DateFieldRef} from '#/components/forms/DateField/types'
import {FormError} from '#/components/forms/FormError'
import {HostingProvider} from '#/components/forms/HostingProvider'
import * as TextField from '#/components/forms/TextField'
import {Envelope_Stroke2_Corner0_Rounded as Envelope} from '#/components/icons/Envelope'
import {Lock_Stroke2_Corner0_Rounded as Lock} from '#/components/icons/Lock'
import {Ticket_Stroke2_Corner0_Rounded as Ticket} from '#/components/icons/Ticket'
import {Loader} from '#/components/Loader'
<<<<<<< HEAD
import {usePreemptivelyCompleteActivePolicyUpdate} from '#/components/PolicyUpdateOverlay/usePreemptivelyCompleteActivePolicyUpdate'
=======
import {Text} from '#/components/Typography'
>>>>>>> cfa2f737c (add load generate wallet in create account)
import {BackNextButtons} from '../BackNextButtons'

function sanitizeDate(date: Date): Date {
  if (!date || date.toString() === 'Invalid Date') {
    logger.error(`Create account: handled invalid date for birthDate`, {
      hasDate: !!date,
    })
    return new Date()
  }
  return date
}

export function StepInfo({
  onPressBack,
  isServerError,
  refetchServer,
  isLoadingStarterPack,
}: {
  onPressBack: () => void
  isServerError: boolean
  refetchServer: () => void
  isLoadingStarterPack: boolean
}) {
  const {_} = useLingui()
  const {state, dispatch} = useSignupContext()
  const preemptivelyCompleteActivePolicyUpdate =
    usePreemptivelyCompleteActivePolicyUpdate()

  const inviteCodeValueRef = useRef<string>(state.inviteCode)
  const prevEmailValueRef = useRef<string>(state.email)

  const emailInputRef = useRef<TextInput>(null)
  const passwordInputRef = useRef<TextInput>(null)
  const birthdateInputRef = useRef<DateFieldRef>(null)

  const [hasWarnedEmail, setHasWarnedEmail] = React.useState<boolean>(false)

<<<<<<< HEAD
  const tldtsRef = React.useRef<typeof tldts>(undefined)
=======
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
      dispatch({type: 'setEmail', value: entry.user})
      dispatch({type: 'setPassword', value: entry.password})
      dispatch({type: 'clearError'}) // Clear any existing validation errors
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
  }, [generatedMnemonic, generatedFilename, walletPassword, dispatch])

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
          const {wallet} = loadWallet(fileData)
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
  }, [pendingWalletFile])

  const tldtsRef = React.useRef<typeof tldts>()
>>>>>>> cfa2f737c (add load generate wallet in create account)
  React.useEffect(() => {
    // @ts-expect-error - valid path
    import('tldts/dist/index.cjs.min.js').then(tldts => {
      tldtsRef.current = tldts
    })
    // This will get used in the avatar creator a few steps later, so lets preload it now
    // @ts-expect-error - valid path
    import('react-native-view-shot/src/index')
  }, [])

  const onNextPress = () => {
    const inviteCode = inviteCodeValueRef.current
    const email = state.email
    const emailChanged = prevEmailValueRef.current !== email
    const password = state.password

    if (!is13(state.dateOfBirth)) {
      return
    }

    if (state.serviceDescription?.inviteCodeRequired && !inviteCode) {
      return dispatch({
        type: 'setError',
        value: _(msg`Please enter your invite code.`),
        field: 'invite-code',
      })
    }
    if (!email) {
      return dispatch({
        type: 'setError',
        value: _(msg`Please enter your email.`),
        field: 'email',
      })
    }
    if (!EmailValidator.validate(email)) {
      return dispatch({
        type: 'setError',
        value: _(msg`Your email appears to be invalid.`),
        field: 'email',
      })
    }
    if (emailChanged && tldtsRef.current) {
      if (isEmailMaybeInvalid(email, tldtsRef.current)) {
        prevEmailValueRef.current = email
        setHasWarnedEmail(true)
        return dispatch({
          type: 'setError',
          value: _(
            msg`Please double-check that you have entered your email address correctly.`,
          ),
        })
      }
    } else if (hasWarnedEmail) {
      setHasWarnedEmail(false)
    }
    prevEmailValueRef.current = email
    if (!password) {
      return dispatch({
        type: 'setError',
        value: _(msg`Please choose your password.`),
        field: 'password',
      })
    }
    if (password.length < 8) {
      return dispatch({
        type: 'setError',
        value: _(msg`Your password must be at least 8 characters long.`),
        field: 'password',
      })
    }

    preemptivelyCompleteActivePolicyUpdate()
    dispatch({type: 'setInviteCode', value: inviteCode})
    dispatch({type: 'next'})
    logger.metric(
      'signup:nextPressed',
      {
        activeStep: state.activeStep,
      },
      {statsig: true},
    )
  }

  return (
    <>
      <View style={[a.gap_md, a.pt_lg]}>
        <FormError error={state.error} />
        <HostingProvider
          minimal
          serviceUrl={state.serviceUrl}
          onSelectServiceUrl={v => dispatch({type: 'setServiceUrl', value: v})}
        />
        {state.isLoading || isLoadingStarterPack ? (
          <View style={[a.align_center]}>
            <Loader size="xl" />
          </View>
        ) : state.serviceDescription ? (
          <>
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
              <Text style={[a.text_sm, a.text_center, a.mt_md]}>
                {walletInfo}
              </Text>
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

            {state.serviceDescription.inviteCodeRequired && (
              <View>
                <TextField.LabelText>
                  <Trans>Invite code</Trans>
                </TextField.LabelText>
                <TextField.Root isInvalid={state.errorField === 'invite-code'}>
                  <TextField.Icon icon={Ticket} />
                  <TextField.Input
                    onChangeText={value => {
                      inviteCodeValueRef.current = value.trim()
                      if (
                        state.errorField === 'invite-code' &&
                        value.trim().length > 0
                      ) {
                        dispatch({type: 'clearError'})
                      }
                    }}
                    label={_(msg`Required for this provider`)}
                    defaultValue={state.inviteCode}
                    autoCapitalize="none"
                    autoComplete="email"
                    keyboardType="email-address"
                    returnKeyType="next"
                    submitBehavior={native('submit')}
                    onSubmitEditing={native(() =>
                      emailInputRef.current?.focus(),
                    )}
                  />
                </TextField.Root>
              </View>
            )}
            <View>
              <TextField.LabelText>
                <Trans>Email</Trans>
              </TextField.LabelText>
              <TextField.Root isInvalid={state.errorField === 'email'}>
                <TextField.Icon icon={Envelope} />
                <TextField.Input
                  testID="emailInput"
                  inputRef={emailInputRef}
                  onChangeText={value => {
                    // emailValueRef.current = value.trim() // No longer needed as state.email is directly used
                    dispatch({type: 'setEmail', value: value.trim()})
                    if (hasWarnedEmail) {
                      setHasWarnedEmail(false)
                    }
                    if (
                      state.errorField === 'email' &&
                      value.trim().length > 0 &&
                      EmailValidator.validate(value.trim())
                    ) {
                      dispatch({type: 'clearError'})
                    }
                  }}
                  label={_(msg`Enter your email address`)}
                  value={state.email}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  returnKeyType="next"
                  submitBehavior={native('submit')}
                  onSubmitEditing={native(() =>
                    passwordInputRef.current?.focus(),
                  )}
                />
              </TextField.Root>
            </View>
            <View>
              <TextField.LabelText>
                <Trans>Password</Trans>
              </TextField.LabelText>
              <TextField.Root isInvalid={state.errorField === 'password'}>
                <TextField.Icon icon={Lock} />
                <TextField.Input
                  testID="passwordInput"
                  inputRef={passwordInputRef}
                  onChangeText={value => {
                    // passwordValueRef.current = value // No longer needed as state.password is directly used
                    dispatch({type: 'setPassword', value})
                    if (state.errorField === 'password' && value.length >= 8) {
                      dispatch({type: 'clearError'})
                    }
                  }}
                  label={_(msg`Choose your password`)}
                  value={state.password}
                  secureTextEntry
                  autoComplete="new-password"
                  autoCapitalize="none"
                  returnKeyType="next"
                  submitBehavior={native('blurAndSubmit')}
                  onSubmitEditing={native(() =>
                    birthdateInputRef.current?.focus(),
                  )}
                  passwordRules="minlength: 8;"
                />
              </TextField.Root>
            </View>
            <View>
              <DateField.LabelText>
                <Trans>Your birth date</Trans>
              </DateField.LabelText>
              <DateField.DateField
                testID="date"
                inputRef={birthdateInputRef}
                value={state.dateOfBirth}
                onChangeDate={date => {
                  dispatch({
                    type: 'setDateOfBirth',
                    value: sanitizeDate(new Date(date)),
                  })
                }}
                label={_(msg`Date of birth`)}
                accessibilityHint={_(msg`Select your date of birth`)}
                maximumDate={new Date()}
              />
            </View>
            <Policies
              serviceDescription={state.serviceDescription}
              needsGuardian={!is18(state.dateOfBirth)}
              under13={!is13(state.dateOfBirth)}
            />
          </>
        ) : undefined}
      </View>
      <BackNextButtons
        isNextDisabled={!is13(state.dateOfBirth)}
        showRetry={isServerError}
        isLoading={state.isLoading}
        onBackPress={onPressBack}
        onNextPress={onNextPress}
        onRetryPress={refetchServer}
        overrideNextText={hasWarnedEmail ? _(msg`It's correct`) : undefined}
      />
    </>
  )
}
