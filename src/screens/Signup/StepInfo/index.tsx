import React, {useRef} from 'react'
import {Platform, type TextInput, View} from 'react-native'
import {msg, Trans} from '@lingui/macro'
import {useLingui} from '@lingui/react'
import * as EmailValidator from 'email-validator'
import type tldts from 'tldts'

import {isEmailMaybeInvalid} from '#/lib/strings/email'
import {logger} from '#/logger'
import {is13, is18, useSignupContext} from '#/screens/Signup/state'
import {Policies} from '#/screens/Signup/StepInfo/Policies'
import {
  createWallet,
  loadWallet,
  saveKeyToFile,
} from '#/screens/wallet/WalletHelper'
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
import {usePreemptivelyCompleteActivePolicyUpdate} from '#/components/PolicyUpdateOverlay/usePreemptivelyCompleteActivePolicyUpdate'
import {Text} from '#/components/Typography'
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

  // Wallet state for loading
  const [walletInfo, setWalletInfo] = React.useState<string | null>(null)
  const [showLoadPassword, setShowLoadPassword] = React.useState(false)
  const [loadPassword, setLoadPassword] = React.useState('')
  const [loadedWalletData, setLoadedWalletData] = React.useState<any>(null)

  // Handler for loading an existing wallet file on web
  const handleLoadWalletWeb = React.useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e: Event) => {
      const target = e.target as HTMLInputElement
      const file = target.files?.[0]
      if (file) {
        try {
          const content = await file.text()
          if (content) {
            // Store the content temporarily
            ;(globalThis as any).__walletFileContent = content
            setShowLoadPassword(true) // Show password input to decrypt the wallet
            setWalletInfo('Wallet file loaded. Enter password to decrypt.')
          }
        } catch (error) {
          setWalletInfo(
            'Error loading wallet file: ' + (error as Error).message,
          )
        }
      }
    }
    input.click()
  }, [])

  // Handler for decrypting and using the loaded wallet after password entry
  const handleDecryptAndUseWallet = React.useCallback(async () => {
    if (!loadPassword) {
      setWalletInfo('Please enter your password')
      return
    }

    try {
      const content = (globalThis as any).__walletFileContent
      if (!content) {
        throw new Error('No wallet file loaded')
      }

      // Use the actual loadWallet function to decrypt the wallet file
      const walletData = await loadWallet(content, loadPassword)

      // Set email/password from the wallet in UI
      dispatch({type: 'setEmail', value: walletData.credentials?.user || ''})
      dispatch({
        type: 'setPassword',
        value: walletData.credentials?.password || '',
      })
      dispatch({type: 'clearError'}) // Clear any existing validation errors

      setWalletInfo('Wallet loaded successfully!')
      setShowLoadPassword(false)
      setLoadPassword('')
      setLoadedWalletData(walletData)
    } catch (error) {
      setWalletInfo(
        'Failed to decrypt wallet. Check your password: ' +
          (error as Error).message,
      )
    }
  }, [loadPassword, dispatch])

  const tldtsRef = React.useRef<typeof tldts>()
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
                color="secondary"
                size="large"
                onPress={handleLoadWalletWeb}
                label={_(msg`Load Key`)}>
                <ButtonText>
                  <Trans>Load Key</Trans>
                </ButtonText>
              </Button>
            </View>

            {walletInfo && (
              <Text style={[a.text_sm, a.text_center, a.mt_md]}>
                {walletInfo}
              </Text>
            )}

            {showLoadPassword && (
              <View style={[a.flex_col, a.gap_sm, a.mt_md]}>
                <Text style={[a.text_center]}>
                  <Trans>Enter password to decrypt your wallet:</Trans>
                </Text>
                <input
                  type="password"
                  value={loadPassword}
                  onChange={e => setLoadPassword(e.target.value)}
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
                  onPress={handleDecryptAndUseWallet}
                  label={_(msg`Decrypt Wallet`)}>
                  <ButtonText>
                    <Trans>Decrypt Wallet</Trans>
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
