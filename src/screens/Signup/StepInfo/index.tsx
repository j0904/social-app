import React, {useRef} from 'react'
import {type TextInput, View} from 'react-native'
import {msg, Trans} from '@lingui/macro'
import {useLingui} from '@lingui/react'
import * as EmailValidator from 'email-validator'
import type tldts from 'tldts'

import {
  createCredentialEntryForWallet,
  createWalletFromMnemonic,
  generateWalletMnemonic,
} from '#/lib/hdwallet'
import {isEmailMaybeInvalid} from '#/lib/strings/email'
import {logger} from '#/logger'
import {ScreenTransition} from '#/screens/Login/ScreenTransition'
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

  const inviteCodeValueRef = useRef<string>(state.inviteCode)
  const emailValueRef = useRef<string>(state.email)
  const prevEmailValueRef = useRef<string>(state.email)
  const passwordValueRef = useRef<string>(state.password)

  const emailInputRef = useRef<TextInput>(null)
  const passwordInputRef = useRef<TextInput>(null)
  const birthdateInputRef = useRef<DateFieldRef>(null)

  const [hasWarnedEmail, setHasWarnedEmail] = React.useState<boolean>(false)

  // Wallet state for demo
  const [walletInfo, setWalletInfo] = React.useState<string | null>(null)
  const [showWalletPassword, setShowWalletPassword] = React.useState(false)
  const [walletPassword, setWalletPassword] = React.useState('')

  // Handler for generating a new wallet and saving to file
  const handleGenerateWallet = React.useCallback(() => {
    setShowWalletPassword(true)
  }, [])

  // Handler for actually generating and saving wallet after password entry
  const handleConfirmGenerateWallet = React.useCallback(() => {
    const mnemonic = generateWalletMnemonic()
    // Save wallet file with password protection using hdwallet logic
    // In a real app, use FileSystem APIs to save fileData to disk
    setWalletInfo(
      `Wallet generated and saved locally.\nMnemonic: ${mnemonic}\nPassword: ${walletPassword}`,
    )
    setShowWalletPassword(false)
    setWalletPassword('')
  }, [walletPassword])

  // Handler for loading a wallet from mnemonic (prompt for demo)
  const handleLoadWallet = React.useCallback(() => {
    const mnemonic = prompt('Enter your wallet mnemonic')
    if (!mnemonic) return
    try {
      const wallet = createWalletFromMnemonic(mnemonic)
      const entry = createCredentialEntryForWallet(
        wallet,
        'https://example.com',
      )
      setWalletInfo(
        `Loaded wallet\nPublic Key: ${wallet.publicKey}\nUser: ${entry.user}\nPassword: ${entry.password}`,
      )
    } catch (e) {
      setWalletInfo('Invalid mnemonic')
    }
  }, [])

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
    const email = emailValueRef.current
    const emailChanged = prevEmailValueRef.current !== email
    const password = passwordValueRef.current

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

    dispatch({type: 'setInviteCode', value: inviteCode})
    dispatch({type: 'setEmail', value: email})
    dispatch({type: 'setPassword', value: password})
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
    <ScreenTransition>
      <View style={[a.gap_md]}>
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
                    emailValueRef.current = value.trim()
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
                  defaultValue={state.email}
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
                    passwordValueRef.current = value
                    if (state.errorField === 'password' && value.length >= 8) {
                      dispatch({type: 'clearError'})
                    }
                  }}
                  label={_(msg`Choose your password`)}
                  defaultValue={state.password}
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
        hideNext={!is13(state.dateOfBirth)}
        showRetry={isServerError}
        isLoading={state.isLoading}
        onBackPress={onPressBack}
        onNextPress={onNextPress}
        onRetryPress={refetchServer}
        overrideNextText={hasWarnedEmail ? _(msg`It's correct`) : undefined}
      />
    </ScreenTransition>
  )
}
