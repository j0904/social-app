import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  TextInput,
  View,
} from 'react-native'
import {Utils} from '@bigtangle/bigtangle-ts'
import {msg, Trans} from '@lingui/macro'
import {useLingui} from '@lingui/react'
import {useNavigation} from '@react-navigation/native'
import {type NativeStackScreenProps} from '@react-navigation/native-stack'

import {
  type CommonNavigatorParams,
  type NavigationProp,
} from '#/lib/routes/types'
import {deviceLocales} from '#/locale/deviceLocales'
import {logger} from '#/logger'
import {useLanguagePrefs} from '#/state/preferences'
import {useWallet} from '#/state/wallet'
import * as SettingsList from '#/screens/Settings/components/SettingsList'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Layout from '#/components/Layout'
import {Text} from '#/components/Typography'
import {
  createBigtangleWallet,
  getDefaultContextRoot,
  type WalletFile,
} from './WalletHelper'

// Token interface
interface Token {
  tokenid: string
  tokenname: string
  decimals: number
  balance?: string
}

// Default context root for blockchain API
const CONTEXT_ROOT = getDefaultContextRoot()

type PayStep = 'form' | 'confirm' | 'processing' | 'success' | 'error'

export function PayScreen(
  _props: Readonly<NativeStackScreenProps<CommonNavigatorParams, 'WalletPay'>>,
) {
  const theme = useTheme()
  const {_} = useLingui()
  const {appLanguage} = useLanguagePrefs()

  // Local number formatter based on user's locale
  const formatNumber = useMemo(() => {
    const locale = deviceLocales.at(0)
    const languageTag = locale?.languageTag || appLanguage || 'en-US'
    return (value: number | string, decimals?: number) => {
      const num = typeof value === 'string' ? Number.parseFloat(value) : value
      if (Number.isNaN(num)) return String(value)
      return new Intl.NumberFormat(languageTag, {
        minimumFractionDigits: decimals ?? 0,
        maximumFractionDigits: decimals ?? 8,
      }).format(num)
    }
  }, [appLanguage])

  // Navigation
  const navigation = useNavigation<NavigationProp>()

  // Wallet state
  const {
    publicInfo,
    isUnlocked,
    getPassword,
    getUnlockedWallet,
    unlockWallet,
    hasWallet: checkHasWallet,
  } = useWallet()

  // Check if wallet exists - check both state and storage
  const hasWallet = !!publicInfo?.hasEncryptedWallet || checkHasWallet()

  // Bigtangle wallet instance ref
  const btWalletRef = useRef<any>(null)

  // Form state
  const [step, setStep] = useState<PayStep>('form')
  const [selectedToken, setSelectedToken] = useState<Token | null>(null)
  const [quantity, setQuantity] = useState('')
  const [toAddress, setToAddress] = useState('')
  const [memo, setMemo] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [txHash, setTxHash] = useState('')

  // Token list state - loaded from blockchain
  const [availableTokens, setAvailableTokens] = useState<Token[]>([])
  const [isLoadingTokens, setIsLoadingTokens] = useState(false)

  // Token search state
  const [showTokenPicker, setShowTokenPicker] = useState(false)
  const [tokenSearchQuery, setTokenSearchQuery] = useState('')
  const [filteredTokens, setFilteredTokens] = useState<Token[]>([])

  // Password prompt state (if wallet is locked)
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false)
  const [passwordInput, setPasswordInput] = useState('')
  // Track what action triggered the password prompt: 'loadTokens' or 'confirm'
  const [passwordAction, setPasswordAction] = useState<
    'loadTokens' | 'confirm'
  >('loadTokens')

  // Create bigtangle wallet from wallet file
  const createBtWallet = useCallback(
    async (walletFile: WalletFile): Promise<any> => {
      if (btWalletRef.current) {
        return btWalletRef.current
      }
      const btWallet = await createBigtangleWallet(walletFile, CONTEXT_ROOT)
      btWalletRef.current = btWallet
      return btWallet
    },
    [],
  )

  // Load tokens from blockchain using bigtangle-ts wallet
  const loadTokensFromBlockchain = useCallback(async () => {
    if (!isUnlocked) {
      logger.debug('Wallet not unlocked, prompting for password')
      // Show password prompt to unlock wallet first
      setPasswordAction('loadTokens')
      setShowPasswordPrompt(true)
      return
    }

    setIsLoadingTokens(true)
    try {
      const wallet = getUnlockedWallet()
      const password = getPassword()

      if (!wallet || !password) {
        throw new Error('Wallet not available')
      }

      // Create bigtangle wallet instance
      const btWallet = await createBtWallet(wallet as WalletFile)

      // Get all UTXOs (Unspent Transaction Outputs) from the wallet
      const utxos = await btWallet.calculateAllSpendCandidatesUTXO(
        password,
        false,
      )

      // Extract unique tokens and their balances from UTXOs
      const tokenMap = new Map<
        string,
        {tokenid: string; balance: bigint; decimals: number; tokenname: string}
      >()

      for (const spendableOutput of utxos) {
        const utxo = spendableOutput.getUTXO
          ? spendableOutput.getUTXO()
          : spendableOutput
        const tokenIdHex = utxo.getTokenId ? utxo.getTokenId() : ''
        const value = utxo.getValue
          ? utxo.getValue()
          : spendableOutput.getValue()

        if (tokenIdHex) {
          const existing = tokenMap.get(tokenIdHex)
          const valueAmount = value.getValue ? value.getValue() : BigInt(0)

          if (existing) {
            existing.balance += valueAmount
          } else {
            // Try to get token info for name
            let tokenName = ''
            let decimals = 8

            // The base token (all zeros) is BIG
            if (
              tokenIdHex ===
              '0000000000000000000000000000000000000000000000000000000000000000'
            ) {
              tokenName = 'BIG'
              // decimals is already 8 (default), no change needed
            } else {
              // Try to fetch token info from blockchain
              try {
                const tokenInfo = await btWallet.checkTokenId(
                  Buffer.from(tokenIdHex, 'hex'),
                )
                if (tokenInfo && tokenInfo.getToken) {
                  const token = tokenInfo.getToken()
                  tokenName = token.getTokenname ? token.getTokenname() : ''
                  decimals = token.getDecimals ? token.getDecimals() : 8
                }
              } catch (e) {
                logger.debug('Could not fetch token info', {
                  tokenIdHex,
                  error: e,
                })
              }
            }

            tokenMap.set(tokenIdHex, {
              tokenid: tokenIdHex,
              balance: valueAmount,
              decimals,
              tokenname: tokenName,
            })
          }
        }
      }

      // Convert to Token array with formatted balances
      const tokens: Token[] = Array.from(tokenMap.values()).map(t => ({
        tokenid: t.tokenid,
        tokenname: t.tokenname,
        decimals: t.decimals,
        balance: (Number(t.balance) / Math.pow(10, t.decimals)).toFixed(
          t.decimals,
        ),
      }))

      setAvailableTokens(tokens)
      setFilteredTokens(tokens)
      logger.debug('Loaded tokens from blockchain', {count: tokens.length})
    } catch (error) {
      logger.error('Failed to load tokens from blockchain', {
        safeMessage: error,
      })
      // Set empty token list on error
      setAvailableTokens([])
      setFilteredTokens([])
      setErrorMessage('Failed to load tokens. Please check your connection.')
    } finally {
      setIsLoadingTokens(false)
    }
  }, [isUnlocked, getUnlockedWallet, getPassword, createBtWallet])

  // Load tokens when wallet is unlocked
  useEffect(() => {
    if (isUnlocked && hasWallet) {
      loadTokensFromBlockchain()
    }
  }, [isUnlocked, hasWallet, loadTokensFromBlockchain])

  // Filter tokens based on search query
  useEffect(() => {
    if (tokenSearchQuery.trim() === '') {
      setFilteredTokens(availableTokens)
    } else {
      const query = tokenSearchQuery.toLowerCase()
      setFilteredTokens(
        availableTokens.filter(
          token =>
            token.tokenname.toLowerCase().includes(query) ||
            token.tokenid.toLowerCase().includes(query),
        ),
      )
    }
  }, [tokenSearchQuery, availableTokens])

  // Validate form
  const validateForm = useCallback(() => {
    if (!selectedToken) {
      setErrorMessage('Please select a token')
      return false
    }
    if (!quantity || Number.parseFloat(quantity) <= 0) {
      setErrorMessage('Please enter a valid quantity')
      return false
    }
    if (!toAddress || toAddress.trim().length < 26) {
      setErrorMessage('Please enter a valid destination address')
      return false
    }
    // Validate address format (basic check for base58)
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/
    if (!base58Regex.test(toAddress.trim())) {
      setErrorMessage('Invalid address format')
      return false
    }
    setErrorMessage('')
    return true
  }, [selectedToken, quantity, toAddress])

  // Handle proceed to confirmation
  const handleProceedToConfirm = useCallback(() => {
    if (!validateForm()) return

    // Check if wallet is unlocked
    if (!isUnlocked) {
      setPasswordAction('confirm')
      setShowPasswordPrompt(true)
      return
    }

    setStep('confirm')
  }, [validateForm, isUnlocked])

  // Handle password submit
  const handlePasswordSubmit = useCallback(async () => {
    if (!passwordInput) {
      Alert.alert('Error', 'Please enter your password')
      return
    }

    setIsLoading(true)
    try {
      await unlockWallet(passwordInput)
      setShowPasswordPrompt(false)
      setPasswordInput('')

      // Execute the appropriate action based on what triggered the password prompt
      if (passwordAction === 'loadTokens') {
        // Load tokens after unlocking - will be triggered by useEffect
        // since isUnlocked will now be true
      } else {
        setStep('confirm')
      }
    } catch (e) {
      logger.error('Failed to unlock wallet', {safeMessage: e})
      Alert.alert('Error', 'Invalid password. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }, [passwordInput, unlockWallet, passwordAction])

  // Execute payment using bigtangle-ts wallet
  const handlePay = useCallback(async () => {
    if (!selectedToken || !quantity || !toAddress) return

    setStep('processing')
    setIsLoading(true)
    setErrorMessage('')

    try {
      const wallet = getUnlockedWallet()
      const password = getPassword()

      if (!wallet || !password) {
        throw new Error('Wallet not unlocked')
      }

      // Create bigtangle wallet instance
      const btWallet = await createBtWallet(wallet as WalletFile)

      // Import Address and TestParams from the installed package
      const {
        Address,
      } = require('@bigtangle/bigtangle-ts/dist/net/bigtangle/core/Address.js')
      const {
        TestParams,
      } = require('@bigtangle/bigtangle-ts/dist/net/bigtangle/params/TestParams.js')

      // Parse the amount - convert to smallest unit based on decimals
      const amountInSmallestUnit = BigInt(
        Math.floor(
          Number.parseFloat(quantity) * Math.pow(10, selectedToken.decimals),
        ),
      )

      // Create token ID buffer
      const tokenIdBuffer = Buffer.from(Utils.HEX.decode(selectedToken.tokenid))

      // Use payToList instead of pay to avoid Coin circular dependency
      // payToList(aesKey, giveMoneyResult: Map<Address, bigint>, tokenid: Buffer, memo: string)
      const giveMoneyResult = new Map()
      giveMoneyResult.set(toAddress.trim(), amountInSmallestUnit)

      // Execute the payment using bigtangle-ts wallet.payToList()
      const block = await btWallet.payToList(
        password,
        giveMoneyResult,
        tokenIdBuffer,
        memo || '',
      )

      if (!block) {
        throw new Error('Failed to create payment transaction')
      }

      // Get the block hash as transaction ID
      const blockHash = block.getHash ? block.getHash() : block.hash
      const txHashStr = blockHash?.toString('hex') || `tx_${Date.now()}`

      logger.info('Payment executed successfully', {
        from: (wallet as WalletFile).wallet.address,
        to: toAddress.trim(),
        tokenId: selectedToken.tokenid,
        tokenName: selectedToken.tokenname,
        amount: quantity,
        decimals: selectedToken.decimals,
        memo: memo,
        txHash: txHashStr,
      })

      setTxHash(txHashStr)
      setStep('success')

      // Refresh token balances after payment
      setTimeout(() => loadTokensFromBlockchain(), 2000)
    } catch (error) {
      logger.error('Payment error:', {safeMessage: error})
      setErrorMessage(`Payment failed: ${(error as Error).message}`)
      setStep('error')
    } finally {
      setIsLoading(false)
    }
  }, [
    selectedToken,
    quantity,
    toAddress,
    memo,
    getUnlockedWallet,
    getPassword,
    createBtWallet,
    loadTokensFromBlockchain,
  ])

  // Reset form
  const handleReset = useCallback(() => {
    setStep('form')
    setSelectedToken(null)
    setQuantity('')
    setToAddress('')
    setMemo('')
    setErrorMessage('')
    setTxHash('')
  }, [])

  // Render token picker modal
  const renderTokenPicker = () => (
    <Modal
      visible={showTokenPicker}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setShowTokenPicker(false)}>
      <View
        style={[a.flex_1, a.justify_end, {backgroundColor: 'rgba(0,0,0,0.5)'}]}>
        <View
          style={[
            a.rounded_md,
            a.p_lg,
            {
              backgroundColor: theme.atoms.bg.backgroundColor,
              maxHeight: '70%',
              borderBottomLeftRadius: 0,
              borderBottomRightRadius: 0,
            },
          ]}>
          <View
            style={[a.flex_row, a.justify_between, a.align_center, a.mb_md]}>
            <Text style={[a.text_lg, a.font_bold]}>
              <Trans>Select Token</Trans>
            </Text>
            <View style={[a.flex_row, a.gap_md, a.align_center]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={_(msg`Refresh tokens`)}
                accessibilityHint={_(msg`Reload tokens from blockchain`)}
                onPress={loadTokensFromBlockchain}
                disabled={isLoadingTokens}>
                <Text style={[{color: theme.palette.primary_500}]}>
                  {isLoadingTokens ? (
                    <Trans>Loading...</Trans>
                  ) : (
                    <Trans>Refresh</Trans>
                  )}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={_(msg`Close token picker`)}
                accessibilityHint={_(msg`Closes the token selection dialog`)}
                onPress={() => setShowTokenPicker(false)}>
                <Text style={[{color: theme.palette.primary_500}]}>
                  <Trans>Close</Trans>
                </Text>
              </Pressable>
            </View>
          </View>

          <TextInput
            accessibilityLabel={_(msg`Search tokens`)}
            accessibilityHint={_(msg`Enter token name or ID to search`)}
            style={[
              a.px_md,
              a.py_sm,
              a.rounded_sm,
              a.mb_md,
              a.text_md,
              {
                backgroundColor: theme.atoms.bg_contrast_25.backgroundColor,
                color: theme.atoms.text.color,
                borderWidth: 1,
                borderColor: theme.atoms.border_contrast_low.borderColor,
              },
            ]}
            placeholder={_(msg`Search by name or token ID...`)}
            placeholderTextColor={theme.atoms.text_contrast_low.color}
            value={tokenSearchQuery}
            onChangeText={setTokenSearchQuery}
            autoCapitalize="none"
          />

          {isLoadingTokens ? (
            <View style={[a.p_lg, a.align_center]}>
              <ActivityIndicator
                size="large"
                color={theme.palette.primary_500}
              />
              <Text
                style={[
                  a.mt_md,
                  {color: theme.atoms.text_contrast_medium.color},
                ]}>
                <Trans>Loading tokens from blockchain...</Trans>
              </Text>
            </View>
          ) : (
            <FlatList
              data={filteredTokens}
              keyExtractor={item => item.tokenid}
              renderItem={({item}) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={_(msg`Select ${item.tokenname} token`)}
                  accessibilityHint={_(msg`Selects this token for payment`)}
                  style={[
                    a.p_md,
                    a.rounded_sm,
                    a.mb_sm,
                    {
                      backgroundColor:
                        selectedToken?.tokenid === item.tokenid
                          ? theme.palette.primary_100
                          : theme.atoms.bg_contrast_25.backgroundColor,
                    },
                  ]}
                  onPress={() => {
                    setSelectedToken(item)
                    setShowTokenPicker(false)
                    setTokenSearchQuery('')
                  }}>
                  <View style={[a.flex_row, a.justify_between, a.align_center]}>
                    <View>
                      <Text style={[a.text_md, a.font_bold]}>
                        {item.tokenname}
                      </Text>
                      <Text
                        style={[
                          a.text_xs,
                          {color: theme.atoms.text_contrast_medium.color},
                        ]}
                        numberOfLines={1}>
                        {item.tokenid.substring(0, 16)}...
                      </Text>
                    </View>
                    <Text style={[a.text_md]}>
                      {item.balance
                        ? formatNumber(item.balance, item.decimals)
                        : '0'}
                    </Text>
                  </View>
                </Pressable>
              )}
              ListEmptyComponent={
                <View style={[a.p_lg, a.align_center]}>
                  <Text
                    style={[{color: theme.atoms.text_contrast_medium.color}]}>
                    {availableTokens.length === 0 ? (
                      <Trans>
                        No tokens found. Unlock your wallet to load tokens.
                      </Trans>
                    ) : (
                      <Trans>No tokens match your search</Trans>
                    )}
                  </Text>
                </View>
              }
            />
          )}
        </View>
      </View>
    </Modal>
  )

  // Render password prompt modal
  const renderPasswordPrompt = () => (
    <Modal
      visible={showPasswordPrompt}
      animationType="fade"
      transparent={true}
      onRequestClose={() => setShowPasswordPrompt(false)}>
      <View
        style={[
          a.flex_1,
          a.justify_center,
          a.align_center,
          a.px_lg,
          {backgroundColor: 'rgba(0,0,0,0.5)'},
        ]}>
        <View
          style={[
            a.w_full,
            a.rounded_md,
            a.p_lg,
            {backgroundColor: theme.atoms.bg.backgroundColor},
          ]}>
          <Text style={[a.text_lg, a.font_bold, a.mb_md]}>
            <Trans>Enter Wallet Password</Trans>
          </Text>
          <Text
            style={[
              a.text_sm,
              a.mb_md,
              {color: theme.atoms.text_contrast_medium.color},
            ]}>
            <Trans>
              Your wallet is locked. Enter your password to proceed with the
              payment.
            </Trans>
          </Text>

          <TextInput
            accessibilityLabel={_(msg`Wallet password`)}
            accessibilityHint={_(msg`Enter your wallet password to unlock`)}
            style={[
              a.px_md,
              a.py_sm,
              a.rounded_sm,
              a.mb_md,
              a.text_md,
              {
                backgroundColor: theme.atoms.bg_contrast_25.backgroundColor,
                color: theme.atoms.text.color,
                borderWidth: 1,
                borderColor: theme.atoms.border_contrast_low.borderColor,
              },
            ]}
            placeholder={_(msg`Password`)}
            placeholderTextColor={theme.atoms.text_contrast_low.color}
            value={passwordInput}
            onChangeText={setPasswordInput}
            secureTextEntry
          />

          <View style={[a.flex_row, a.gap_sm]}>
            <Button
              color="secondary"
              label={_(msg`Cancel`)}
              onPress={() => {
                setShowPasswordPrompt(false)
                setPasswordInput('')
              }}
              disabled={isLoading}
              style={[a.flex_1]}>
              <ButtonText>
                <Trans>Cancel</Trans>
              </ButtonText>
            </Button>
            <Button
              color="primary"
              label={_(msg`Unlock`)}
              onPress={handlePasswordSubmit}
              disabled={isLoading}
              style={[a.flex_1]}>
              <ButtonText>
                {isLoading ? (
                  <Trans>Unlocking...</Trans>
                ) : (
                  <Trans>Unlock</Trans>
                )}
              </ButtonText>
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  )

  // Render form
  const renderForm = () => (
    <View style={[a.px_lg, a.py_lg]}>
      {/* Wallet Status */}
      {publicInfo && (
        <View
          style={[
            a.p_md,
            a.rounded_sm,
            a.mb_lg,
            {backgroundColor: theme.atoms.bg_contrast_25.backgroundColor},
          ]}>
          <Text
            style={[
              a.text_xs,
              a.mb_xs,
              {color: theme.atoms.text_contrast_medium.color},
            ]}>
            <Trans>From Wallet:</Trans>
          </Text>
          <Text
            style={[
              a.text_sm,
              {color: theme.atoms.text.color, fontFamily: 'monospace'},
            ]}
            numberOfLines={1}>
            {publicInfo.address}
          </Text>
        </View>
      )}

      {/* Token Selection */}
      <Text
        style={[
          a.text_sm,
          a.font_bold,
          a.mb_xs,
          {color: theme.atoms.text.color},
        ]}>
        <Trans>Token</Trans>
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={_(msg`Select token`)}
        accessibilityHint={_(msg`Opens token picker`)}
        style={[
          a.px_md,
          a.py_md,
          a.rounded_sm,
          a.mb_lg,
          a.flex_row,
          a.justify_between,
          a.align_center,
          {
            backgroundColor: theme.atoms.bg_contrast_25.backgroundColor,
            borderWidth: 1,
            borderColor: theme.atoms.border_contrast_low.borderColor,
          },
        ]}
        onPress={() => setShowTokenPicker(true)}>
        {selectedToken ? (
          <View>
            <Text style={[a.text_md, {color: theme.atoms.text.color}]}>
              {selectedToken.tokenname}
            </Text>
            <Text
              style={[
                a.text_xs,
                {color: theme.atoms.text_contrast_medium.color},
              ]}>
              Balance:{' '}
              {selectedToken.balance
                ? formatNumber(selectedToken.balance, selectedToken.decimals)
                : '0'}
            </Text>
          </View>
        ) : (
          <Text style={[{color: theme.atoms.text_contrast_low.color}]}>
            <Trans>Select a token...</Trans>
          </Text>
        )}
        <Text style={[{color: theme.atoms.text_contrast_medium.color}]}>▼</Text>
      </Pressable>

      {/* Quantity */}
      <Text
        style={[
          a.text_sm,
          a.font_bold,
          a.mb_xs,
          {color: theme.atoms.text.color},
        ]}>
        <Trans>Quantity</Trans>
      </Text>
      <TextInput
        accessibilityLabel={_(msg`Quantity`)}
        accessibilityHint={_(msg`Enter the amount to send`)}
        style={[
          a.px_md,
          a.py_md,
          a.rounded_sm,
          a.mb_lg,
          a.text_md,
          {
            backgroundColor: theme.atoms.bg_contrast_25.backgroundColor,
            color: theme.atoms.text.color,
            borderWidth: 1,
            borderColor: theme.atoms.border_contrast_low.borderColor,
          },
        ]}
        placeholder={_(msg`Enter amount`)}
        placeholderTextColor={theme.atoms.text_contrast_low.color}
        value={quantity}
        onChangeText={setQuantity}
        keyboardType="decimal-pad"
      />

      {/* To Address */}
      <Text
        style={[
          a.text_sm,
          a.font_bold,
          a.mb_xs,
          {color: theme.atoms.text.color},
        ]}>
        <Trans>To Address</Trans>
      </Text>
      <TextInput
        accessibilityLabel={_(msg`Destination address`)}
        accessibilityHint={_(msg`Enter the recipient wallet address`)}
        style={[
          a.px_md,
          a.py_md,
          a.rounded_sm,
          a.mb_lg,
          a.text_md,
          {
            backgroundColor: theme.atoms.bg_contrast_25.backgroundColor,
            color: theme.atoms.text.color,
            borderWidth: 1,
            borderColor: theme.atoms.border_contrast_low.borderColor,
            fontFamily: 'monospace',
          },
        ]}
        placeholder={_(msg`Recipient wallet address`)}
        placeholderTextColor={theme.atoms.text_contrast_low.color}
        value={toAddress}
        onChangeText={setToAddress}
        autoCapitalize="none"
        autoCorrect={false}
      />

      {/* Memo */}
      <Text
        style={[
          a.text_sm,
          a.font_bold,
          a.mb_xs,
          {color: theme.atoms.text.color},
        ]}>
        <Trans>Memo (Optional)</Trans>
      </Text>
      <TextInput
        accessibilityLabel={_(msg`Memo`)}
        accessibilityHint={_(msg`Optional note for this payment`)}
        style={[
          a.px_md,
          a.py_md,
          a.rounded_sm,
          a.mb_lg,
          a.text_md,
          {
            backgroundColor: theme.atoms.bg_contrast_25.backgroundColor,
            color: theme.atoms.text.color,
            borderWidth: 1,
            borderColor: theme.atoms.border_contrast_low.borderColor,
            minHeight: 80,
          },
        ]}
        placeholder={_(msg`Add a note to this payment...`)}
        placeholderTextColor={theme.atoms.text_contrast_low.color}
        value={memo}
        onChangeText={setMemo}
        multiline
        numberOfLines={3}
      />

      {/* Error Message */}
      {errorMessage ? (
        <Text style={[a.text_sm, a.mb_md, {color: theme.palette.negative_500}]}>
          {errorMessage}
        </Text>
      ) : null}

      {/* Pay Button */}
      <Button
        color="primary"
        size="large"
        label={_(msg`Review Payment`)}
        onPress={handleProceedToConfirm}
        disabled={isLoading || !publicInfo}
        style={[a.w_full]}>
        <ButtonText>
          <Trans>Review Payment</Trans>
        </ButtonText>
      </Button>

      {!publicInfo && (
        <Text
          style={[
            a.text_sm,
            a.mt_md,
            a.text_center,
            {color: theme.atoms.text_contrast_medium.color},
          ]}>
          <Trans>Please create or load a wallet first.</Trans>
        </Text>
      )}
    </View>
  )

  // Render confirmation
  const renderConfirmation = () => (
    <View style={[a.px_lg, a.py_lg]}>
      <Text
        style={[
          a.text_xl,
          a.font_bold,
          a.mb_lg,
          a.text_center,
          {color: theme.atoms.text.color},
        ]}>
        <Trans>Confirm Payment</Trans>
      </Text>

      <View
        style={[
          a.p_lg,
          a.rounded_md,
          a.mb_lg,
          {backgroundColor: theme.atoms.bg_contrast_25.backgroundColor},
        ]}>
        {/* Amount */}
        <View style={[a.mb_md]}>
          <Text
            style={[
              a.text_xs,
              {color: theme.atoms.text_contrast_medium.color},
            ]}>
            <Trans>Amount</Trans>
          </Text>
          <Text
            style={[a.text_2xl, a.font_bold, {color: theme.atoms.text.color}]}>
            {formatNumber(quantity, selectedToken?.decimals)}{' '}
            {selectedToken?.tokenname}
          </Text>
        </View>

        <SettingsList.Divider />

        {/* From */}
        <View style={[a.my_md]}>
          <Text
            style={[
              a.text_xs,
              {color: theme.atoms.text_contrast_medium.color},
            ]}>
            <Trans>From</Trans>
          </Text>
          <Text
            style={[
              a.text_sm,
              {color: theme.atoms.text.color, fontFamily: 'monospace'},
            ]}
            numberOfLines={1}>
            {publicInfo?.address}
          </Text>
        </View>

        <SettingsList.Divider />

        {/* To */}
        <View style={[a.my_md]}>
          <Text
            style={[
              a.text_xs,
              {color: theme.atoms.text_contrast_medium.color},
            ]}>
            <Trans>To</Trans>
          </Text>
          <Text
            style={[
              a.text_sm,
              {color: theme.atoms.text.color, fontFamily: 'monospace'},
            ]}
            numberOfLines={1}>
            {toAddress}
          </Text>
        </View>

        {memo.length > 0 && (
          <>
            <SettingsList.Divider />
            <View style={[a.mt_md]}>
              <Text
                style={[
                  a.text_xs,
                  {color: theme.atoms.text_contrast_medium.color},
                ]}>
                <Trans>Memo</Trans>
              </Text>
              <Text style={[a.text_sm, {color: theme.atoms.text.color}]}>
                {memo}
              </Text>
            </View>
          </>
        )}
      </View>

      <View
        style={[
          a.p_md,
          a.rounded_sm,
          a.mb_lg,
          {backgroundColor: theme.palette.primary_50},
        ]}>
        <Text style={[a.text_sm, {color: theme.palette.primary_700}]}>
          <Trans>
            Please verify all details before confirming. Transactions cannot be
            reversed.
          </Trans>
        </Text>
      </View>

      <View style={[a.flex_row, a.gap_sm]}>
        <Button
          color="secondary"
          label={_(msg`Back`)}
          onPress={() => setStep('form')}
          style={[a.flex_1]}>
          <ButtonText>
            <Trans>Back</Trans>
          </ButtonText>
        </Button>
        <Button
          color="primary"
          label={_(msg`Confirm & Pay`)}
          onPress={handlePay}
          style={[a.flex_1]}>
          <ButtonText>
            <Trans>Confirm & Pay</Trans>
          </ButtonText>
        </Button>
      </View>
    </View>
  )

  // Render processing
  const renderProcessing = () => (
    <View style={[a.px_lg, a.py_xl, a.align_center]}>
      <ActivityIndicator size="large" color={theme.palette.primary_500} />
      <Text
        style={[
          a.text_lg,
          a.mt_lg,
          a.text_center,
          {color: theme.atoms.text.color},
        ]}>
        <Trans>Processing Payment...</Trans>
      </Text>
      <Text
        style={[
          a.text_sm,
          a.mt_sm,
          a.text_center,
          {color: theme.atoms.text_contrast_medium.color},
        ]}>
        <Trans>Please wait while your transaction is being processed.</Trans>
      </Text>
    </View>
  )

  // Render success
  const renderSuccess = () => (
    <View style={[a.px_lg, a.py_lg, a.align_center]}>
      <View
        style={[
          a.mb_lg,
          a.align_center,
          a.justify_center,
          {
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: theme.palette.positive_100,
          },
        ]}>
        <Text style={[{fontSize: 40}]}>✓</Text>
      </View>

      <Text
        style={[
          a.text_xl,
          a.font_bold,
          a.mb_sm,
          {color: theme.palette.positive_600},
        ]}>
        <Trans>Payment Successful!</Trans>
      </Text>

      <Text
        style={[
          a.text_md,
          a.mb_lg,
          a.text_center,
          {color: theme.atoms.text_contrast_medium.color},
        ]}>
        <Trans>
          Your payment of {formatNumber(quantity, selectedToken?.decimals)}{' '}
          {selectedToken?.tokenname} has been sent.
        </Trans>
      </Text>

      <View
        style={[
          a.p_md,
          a.rounded_sm,
          a.mb_lg,
          a.w_full,
          {backgroundColor: theme.atoms.bg_contrast_25.backgroundColor},
        ]}>
        <Text
          style={[
            a.text_xs,
            a.mb_xs,
            {color: theme.atoms.text_contrast_medium.color},
          ]}>
          <Trans>Transaction Hash:</Trans>
        </Text>
        <Text
          selectable
          style={[
            a.text_sm,
            {color: theme.atoms.text.color, fontFamily: 'monospace'},
          ]}>
          {txHash}
        </Text>
      </View>

      <Button
        color="primary"
        label={_(msg`Make Another Payment`)}
        onPress={handleReset}
        style={[a.w_full]}>
        <ButtonText>
          <Trans>Make Another Payment</Trans>
        </ButtonText>
      </Button>
    </View>
  )

  // Render error
  const renderError = () => (
    <View style={[a.px_lg, a.py_lg, a.align_center]}>
      <View
        style={[
          a.mb_lg,
          a.align_center,
          a.justify_center,
          {
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: theme.palette.negative_100,
          },
        ]}>
        <Text style={[{fontSize: 40}]}>✗</Text>
      </View>

      <Text
        style={[
          a.text_xl,
          a.font_bold,
          a.mb_sm,
          {color: theme.palette.negative_500},
        ]}>
        <Trans>Payment Failed</Trans>
      </Text>

      <Text
        style={[
          a.text_md,
          a.mb_lg,
          a.text_center,
          {color: theme.atoms.text_contrast_medium.color},
        ]}>
        {errorMessage || (
          <Trans>An error occurred while processing your payment.</Trans>
        )}
      </Text>

      <View style={[a.flex_row, a.gap_sm, a.w_full]}>
        <Button
          color="secondary"
          label={_(msg`Cancel`)}
          onPress={handleReset}
          style={[a.flex_1]}>
          <ButtonText>
            <Trans>Cancel</Trans>
          </ButtonText>
        </Button>
        <Button
          color="primary"
          label={_(msg`Try Again`)}
          onPress={() => setStep('form')}
          style={[a.flex_1]}>
          <ButtonText>
            <Trans>Try Again</Trans>
          </ButtonText>
        </Button>
      </View>
    </View>
  )

  // Render no wallet state
  const renderNoWallet = () => (
    <View style={[a.px_lg, a.py_xl, a.align_center]}>
      <Text
        style={[
          a.text_xl,
          a.font_bold,
          a.mb_md,
          a.text_center,
          {color: theme.atoms.text.color},
        ]}>
        <Trans>No Wallet Found</Trans>
      </Text>
      <Text
        style={[
          a.text_md,
          a.mb_lg,
          a.text_center,
          {color: theme.atoms.text_contrast_medium.color},
        ]}>
        <Trans>
          You need to create or import a wallet before you can send payments.
        </Trans>
      </Text>
      <Button
        color="primary"
        label={_(msg`Go to Manage Keys`)}
        onPress={() => navigation.navigate('WalletKeys')}
        style={[a.w_full]}>
        <ButtonText>
          <Trans>Create or Import Wallet</Trans>
        </ButtonText>
      </Button>
    </View>
  )

  return (
    <Layout.Screen testID="payScreen">
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>
            <Trans>Pay</Trans>
          </Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>

      <Layout.Content>
        <SettingsList.Container>
          {hasWallet ? (
            <>
              {step === 'form' && renderForm()}
              {step === 'confirm' && renderConfirmation()}
              {step === 'processing' && renderProcessing()}
              {step === 'success' && renderSuccess()}
              {step === 'error' && renderError()}
            </>
          ) : (
            renderNoWallet()
          )}
        </SettingsList.Container>
      </Layout.Content>

      {renderTokenPicker()}
      {renderPasswordPrompt()}
    </Layout.Screen>
  )
}
