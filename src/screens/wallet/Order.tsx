import {useCallback, useEffect, useMemo, useState} from 'react'
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  TextInput,
  View,
} from 'react-native'
import {msg, Trans} from '@lingui/macro'
import {useLingui} from '@lingui/react'
import {type NativeStackScreenProps} from '@react-navigation/native-stack'

import {type CommonNavigatorParams} from '#/lib/routes/types'
import {deviceLocales} from '#/locale/deviceLocales'
import {logger} from '#/logger'
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

type OrderType = 'buy' | 'sell'
type BaseCurrency = 'bc' | 'USD' | 'YUAN'

export function OrderScreen(
  _props: Readonly<
    NativeStackScreenProps<CommonNavigatorParams, 'WalletOrder'>
  >,
) {
  const theme = useTheme()
  const {_} = useLingui()
  const {appLanguage} = deviceLocales[0]
    ? {appLanguage: deviceLocales[0].languageTag}
    : {appLanguage: 'en-US'}

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

  // Wallet state
  const {
    publicInfo,
    isUnlocked,
    getPassword,
    getUnlockedWallet,
    unlockWallet,
    hasWallet: checkHasWallet,
  } = useWallet()

  // ...existing code...
  // Order state
  const [orderType, setOrderType] = useState<OrderType>('buy')
  const [selectedToken, setSelectedToken] = useState<Token | null>(null)
  const [amount, setAmount] = useState('')
  const [price, setPrice] = useState('')
  const [baseCurrency, setBaseCurrency] = useState<BaseCurrency>('USD')
  const [total, setTotal] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [txHash, setTxHash] = useState('')

  // Token list state - loaded from blockchain
  const [availableTokens, setAvailableTokens] = useState<Token[]>([])
  const [isLoadingTokens, setIsLoadingTokens] = useState(false)
  const [tokensLoaded, setTokensLoaded] = useState(false)

  // Token search state
  const [showTokenPicker, setShowTokenPicker] = useState(false)
  const [tokenSearchQuery, setTokenSearchQuery] = useState('')
  const [filteredTokens, setFilteredTokens] = useState<Token[]>([])

  // Password prompt state (if wallet is locked)
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false)
  const [passwordInput, setPasswordInput] = useState('')
  // Track what action triggered the password prompt: 'loadTokens' or 'confirm'
  const [passwordAction, setPasswordAction] =
    useState<'loadTokens'>('loadTokens')

  // Pure validation function: returns {valid, message}
  const validateForm = useCallback(() => {
    if (orderType === 'sell' && !selectedToken) {
      return {valid: false, message: 'Please select a token to sell'}
    }
    if (!amount || Number.parseFloat(amount) <= 0) {
      return {valid: false, message: 'Please enter a valid amount'}
    }
    if (!price || Number.parseFloat(price) <= 0) {
      return {valid: false, message: 'Please enter a valid price'}
    }
    if (orderType === 'sell' && selectedToken) {
      // Check if user has enough balance
      const balance = Number.parseFloat(selectedToken.balance || '0')
      const requestedAmount = Number.parseFloat(amount)
      if (requestedAmount > balance) {
        return {
          valid: false,
          message: `Insufficient balance. Available: ${selectedToken.balance} ${selectedToken.tokenname}`,
        }
      }
    }
    return {valid: true, message: ''}
  }, [orderType, selectedToken, amount, price])

  // Create bigtangle wallet from wallet file (always create fresh instance)
  const createBtWallet = useCallback(
    async (walletFile: WalletFile): Promise<any> => {
      const btWallet = await createBigtangleWallet(walletFile, CONTEXT_ROOT)
      return btWallet
    },
    [],
  )

  // Check if wallet exists - check both state and storage
  const hasWallet = !!publicInfo?.hasEncryptedWallet || checkHasWallet()

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

  // Load tokens when wallet is unlocked (only once)
  useEffect(() => {
    if (isUnlocked && hasWallet && !tokensLoaded) {
      loadTokensFromBlockchain().then(() => {
        setTokensLoaded(true)
      })
    }
    // Only reset tokensLoaded if wallet is locked and tokensLoaded was true
    else if (!isUnlocked && tokensLoaded) {
      setTokensLoaded(false)
    }
  }, [isUnlocked, hasWallet, loadTokensFromBlockchain, tokensLoaded])

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

  // Calculate total when amount or price changes
  useEffect(() => {
    if (amount && price) {
      const amountNum = Number.parseFloat(amount)
      const priceNum = Number.parseFloat(price)
      if (!Number.isNaN(amountNum) && !Number.isNaN(priceNum)) {
        const calculatedTotal = (amountNum * priceNum).toFixed(2)
        setTotal(calculatedTotal)
      } else {
        setTotal('')
      }
    } else {
      setTotal('')
    }
  }, [amount, price])

  // Handle password submit
  const handlePasswordSubmit = useCallback(async () => {
    if (!passwordInput) {
      setErrorMessage('Please enter your password')
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
      }
    } catch (e) {
      logger.error('Failed to unlock wallet', {safeMessage: e})
      setErrorMessage('Invalid password. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }, [passwordInput, unlockWallet, passwordAction])

  // Handle place order
  const handlePlaceOrder = useCallback(async () => {
    if (!validateForm()) return

    // Check if wallet is unlocked
    if (!isUnlocked) {
      setErrorMessage('Wallet is locked. Please unlock to proceed.')
      return
    }

    setIsLoading(true)
    setErrorMessage('')

    try {
      // In a real implementation, this would connect to an exchange API
      // For now, we'll simulate the order placement
      logger.info('Placing order', {
        orderType,
        token: selectedToken?.tokenname,
        amount,
        price,
        baseCurrency,
        total,
      })

      // Simulate a successful transaction
      setTxHash(`tx_${Date.now()}`)
      setErrorMessage('')

      // Reset form after successful order
      setTimeout(() => {
        setAmount('')
        setPrice('')
        setTotal('')
        setErrorMessage('')
        setIsLoading(false)
      }, 1000)
    } catch (error) {
      logger.error('Order placement error:', {safeMessage: error})
      setErrorMessage(`Order failed: ${(error as Error).message}`)
      setIsLoading(false)
    }
  }, [
    orderType,
    selectedToken,
    amount,
    price,
    baseCurrency,
    total,
    validateForm,
    isUnlocked,
  ])

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
              <Trans>Select Token to Sell</Trans>
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
                  accessibilityHint={_(msg`Selects this token for order`)}
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
              order.
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

      {/* Order Type (Buy/Sell) */}
      <View style={[a.flex_row, a.gap_sm, a.mb_lg]}>
        <Button
          color={orderType === 'buy' ? 'primary' : 'secondary'}
          variant={orderType === 'buy' ? 'solid' : 'outline'}
          size="large"
          label={_(msg`BUY`)}
          onPress={() => setOrderType('buy')}
          style={[a.flex_1]}>
          <ButtonText>
            <Trans>BUY</Trans>
          </ButtonText>
        </Button>
        <Button
          color={orderType === 'sell' ? 'primary' : 'secondary'}
          variant={orderType === 'sell' ? 'solid' : 'outline'}
          size="large"
          label={_(msg`SELL`)}
          onPress={() => setOrderType('sell')}
          style={[a.flex_1]}>
          <ButtonText>
            <Trans>SELL</Trans>
          </ButtonText>
        </Button>
      </View>

      {/* Token Selection (only for sell orders) */}
      {orderType === 'sell' && (
        <>
          <Text
            style={[
              a.text_sm,
              a.font_bold,
              a.mb_xs,
              {color: theme.atoms.text.color},
            ]}>
            <Trans>Token to Sell</Trans>
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
                  Balance: {selectedToken.balance || '0'}
                </Text>
              </View>
            ) : (
              <Text style={[{color: theme.atoms.text_contrast_low.color}]}>
                <Trans>Select a token...</Trans>
              </Text>
            )}
            <Text style={[{color: theme.atoms.text_contrast_medium.color}]}>
              ▼
            </Text>
          </Pressable>
        </>
      )}

      {/* Amount */}
      <Text
        style={[
          a.text_sm,
          a.font_bold,
          a.mb_xs,
          {color: theme.atoms.text.color},
        ]}>
        <Trans>Amount</Trans>
      </Text>
      <TextInput
        accessibilityLabel={_(msg`Amount`)}
        accessibilityHint={_(msg`Enter the amount to ${orderType}`)}
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
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
      />

      {/* Price Limit */}
      <Text
        style={[
          a.text_sm,
          a.font_bold,
          a.mb_xs,
          {color: theme.atoms.text.color},
        ]}>
        <Trans>Price Limit</Trans>
      </Text>
      <TextInput
        accessibilityLabel={_(msg`Price limit`)}
        accessibilityHint={_(msg`Enter the price limit for your order`)}
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
        placeholder={_(msg`Enter price per token`)}
        placeholderTextColor={theme.atoms.text_contrast_low.color}
        value={price}
        onChangeText={setPrice}
        keyboardType="decimal-pad"
      />

      {/* Base Currency Selection */}
      <Text
        style={[
          a.text_sm,
          a.font_bold,
          a.mb_xs,
          {color: theme.atoms.text.color},
        ]}>
        <Trans>Base Currency</Trans>
      </Text>
      <View style={[a.flex_row, a.gap_sm, a.mb_lg]}>
        {(['bc', 'USD', 'YUAN'] as BaseCurrency[]).map(currency => (
          <Button
            key={currency}
            color={baseCurrency === currency ? 'primary' : 'secondary'}
            variant={baseCurrency === currency ? 'solid' : 'outline'}
            size="small"
            label={currency.toUpperCase()}
            onPress={() => setBaseCurrency(currency)}
            style={[a.flex_1]}>
            <ButtonText>
              <Trans>{currency.toUpperCase()}</Trans>
            </ButtonText>
          </Button>
        ))}
      </View>

      {/* Calculated Total */}
      <View
        style={[
          a.p_md,
          a.rounded_sm,
          a.mb_lg,
          {backgroundColor: theme.atoms.bg_contrast_25.backgroundColor},
        ]}>
        <Text style={[a.text_sm, a.font_bold, {color: theme.atoms.text.color}]}>
          <Trans>Total</Trans>
        </Text>
        <Text
          style={[a.text_2xl, a.font_bold, {color: theme.atoms.text.color}]}>
          {total
            ? `${formatNumber(total, 2)} ${baseCurrency.toUpperCase()}`
            : '--'}
        </Text>
      </View>

      {/* Error Message */}
      {errorMessage ? (
        <Text style={[a.text_sm, a.mb_md, {color: theme.palette.negative_500}]}>
          {errorMessage}
        </Text>
      ) : null}

      {/* Place Order Button */}
      <Button
        color="primary"
        size="large"
        label={_(msg`Place Order`)}
        onPress={handlePlaceOrder}
        disabled={isLoading || !publicInfo || !validateForm()}
        style={[a.w_full]}>
        <ButtonText>
          {isLoading ? (
            <Trans>Processing...</Trans>
          ) : (
            <Trans>Place Order</Trans>
          )}
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
          You need to create or import a wallet before you can place orders.
        </Trans>
      </Text>
    </View>
  )

  return (
    <Layout.Screen testID="orderScreen">
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>
            <Trans>Order</Trans>
          </Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>

      <Layout.Content>
        <SettingsList.Container>
          {hasWallet ? renderForm() : renderNoWallet()}
        </SettingsList.Container>
      </Layout.Content>

      {renderTokenPicker()}
      {renderPasswordPrompt()}
    </Layout.Screen>
  )
}

export default OrderScreen
