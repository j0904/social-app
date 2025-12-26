import {useCallback, useEffect, useMemo, useState} from 'react'
import {Modal, Pressable, TextInput, View} from 'react-native'
import {Utils} from '@bigtangle/bigtangle-ts'
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
const CONTEXT_ROOT =
  typeof window !== 'undefined' ? '/bigtangle/' : getDefaultContextRoot()

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
  const [selectedToken, _setSelectedToken] = useState<Token | null>(null)
  const [amount, setAmount] = useState('')
  const [price, setPrice] = useState('')
  const [baseCurrency, setBaseCurrency] = useState<BaseCurrency>('USD')
  const [total, setTotal] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  // Token list state - loaded from blockchain
  const [availableTokens, setAvailableTokens] = useState<Token[]>([])
  const [tokensLoaded, setTokensLoaded] = useState(false)

  // Token search state
  const [tokenSearchQuery, _setTokenSearchQuery] = useState('')

  // Password prompt state (if wallet is locked)
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false)
  const [passwordInput, setPasswordInput] = useState('')
  // Track what action triggered the password prompt: 'loadTokens' or 'confirm'
  const [passwordAction, setPasswordAction] =
    useState<'loadTokens'>('loadTokens')

  // Pure validation function: returns {valid, message}
  const validateForm = useCallback(() => {
    if (!selectedToken) {
      return {valid: false, message: 'Please select a token'}
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
    } else if (orderType === 'buy' && selectedToken) {
      // For buy orders, check if user has enough base currency (BIG) to buy the tokens
      // First, find the base currency (BIG) token in availableTokens
      const baseCurrencyToken = availableTokens.find(
        token => token.tokenid === 'bc',
      )

      if (baseCurrencyToken) {
        const baseBalance = Number.parseFloat(baseCurrencyToken.balance || '0')
        const totalCost = Number.parseFloat(total || '0')
        if (totalCost > baseBalance) {
          return {
            valid: false,
            message: `Insufficient base currency (BIG) balance. Available: ${baseCurrencyToken.balance} BIG`,
          }
        }
      } else {
        return {
          valid: false,
          message:
            'Base currency (BIG) not found in wallet. Cannot buy tokens.',
        }
      }
    }
    return {valid: true, message: ''}
  }, [orderType, selectedToken, amount, price, total, availableTokens])

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
            if (tokenIdHex === 'bc') {
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

  // Enhanced token search for buy order using bigtangle-ts wallet searchToken
  useEffect(() => {
    let cancelled = false
    const doSearch = async () => {
      if (orderType === 'buy' && isUnlocked) {
        try {
          const wallet = getUnlockedWallet()
          const password = getPassword()
          if (!wallet || !password) return
          const btWallet = await createBtWallet(wallet as WalletFile)
          // searchToken returns { tokenList, amountMap }
          const result = await btWallet.searchToken(tokenSearchQuery.trim())
          if (!cancelled && result && Array.isArray(result.tokenList)) {
            // Map tokenList to Token[] and include domainName, only distinct by tokenid
            const seen = new Set()
            const tokens: Token[] = result.tokenList
              .filter((t: any) => {
                if (seen.has(t.tokenid)) return false
                seen.add(t.tokenid)
                return true
              })
              .map((t: any) => ({
                tokenid: t.tokenid,
                tokenname: t.tokenname,
                decimals: t.decimals ?? 8,
                balance: undefined, // balance not available from search
              }))
            setFilteredTokens(tokens)
          } else if (!cancelled) {
            setFilteredTokens([])
          }
        } catch (e) {
          logger.error('Token search error', {safeMessage: e})
          if (!cancelled) setFilteredTokens([])
        }
      } else {
        // fallback to local filter for sell order or locked wallet
        const query = tokenSearchQuery.toLowerCase()
        setFilteredTokens(
          availableTokens.filter(
            token =>
              token.tokenname.toLowerCase().includes(query) ||
              token.tokenid.toLowerCase().includes(query),
          ),
        )
      }
    }
    doSearch()
    return () => {
      cancelled = true
    }
  }, [
    tokenSearchQuery,
    availableTokens,
    orderType,
    isUnlocked,
    getUnlockedWallet,
    getPassword,
    createBtWallet,
  ])

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

    setErrorMessage('')

    try {
      const wallet = getUnlockedWallet()
      const password = getPassword()

      if (!wallet || !password) {
        throw new Error('Wallet not unlocked')
      }

      // Create bigtangle wallet instance (fresh instance each time)
      const btWallet = await createBtWallet(wallet as WalletFile)

      // For buy orders: need to pay with base currency (BIG) to get tokens
      if (orderType === 'buy' && selectedToken) {
        // Calculate how much base currency (BIG) is needed
        const baseCurrencyAmount = BigInt(
          Math.floor(
            Number.parseFloat(total) * Math.pow(10, 8), // Base currency has 8 decimals
          ),
        )

        // For buying: we pay with base currency (BIG) to get tokens
        // This would typically involve interacting with an exchange smart contract
        // For now, we'll simulate this by sending the base currency amount to a special address
        const giveMoneyResult = new Map()

        // The destination would be the exchange contract or mechanism that gives us tokens
        // For simulation purposes, we'll just use the wallet's own address
        // In a real implementation, this would be an exchange contract address
        if (!publicInfo) {
          throw new Error('Wallet public info not available')
        }
        const exchangeAddress = publicInfo.address
        giveMoneyResult.set(exchangeAddress, baseCurrencyAmount)

        // Execute the buy transaction using bigtangle-ts wallet.payToList()
        const block = await btWallet.payToList(
          password,
          giveMoneyResult,
          Buffer.from(
            '0000000000000000000000000000000000000000000000000000000000000000',
            'hex',
          ), // Base currency (BIG) token ID
          `Buy ${amount} ${selectedToken.tokenname} for ${total} ${baseCurrency}`,
        )

        if (!block) {
          throw new Error('Failed to create buy transaction')
        }

        // Get the block hash as transaction ID
        const blockHash = block.getHash ? block.getHash() : block.hash
        const txHashStr = blockHash?.toString('hex') || `tx_${Date.now()}`

        logger.info('Buy order executed successfully', {
          from: (wallet as WalletFile).wallet.address,
          tokenId: selectedToken.tokenid,
          tokenName: selectedToken.tokenname,
          amount: amount,
          decimals: selectedToken.decimals,
          baseCurrencyAmount: total,
          baseCurrency: baseCurrency,
          memo: `Buy ${amount} ${selectedToken.tokenname}`,
          txHash: txHashStr,
        })

        setTxHash(txHashStr)
      }
      // For sell orders: need to send tokens to get base currency (BIG)
      else if (orderType === 'sell' && selectedToken) {
        // For selling: we send tokens to get base currency (BIG)
        // The destination would be the exchange contract or mechanism that pays us
        const giveMoneyResult = new Map()

        // The destination would be the exchange contract or mechanism that pays us
        // For simulation purposes, we'll just use the wallet's own address
        // In a real implementation, this would be an exchange contract address
        if (!publicInfo) {
          throw new Error('Wallet public info not available')
        }
        const exchangeAddress = publicInfo.address
        // Calculate how much tokens to sell in smallest unit
        const amountToSell = BigInt(
          Math.floor(
            Number.parseFloat(amount) * Math.pow(10, selectedToken.decimals),
          ),
        )
        giveMoneyResult.set(exchangeAddress, amountToSell)

        // Execute the sell transaction using bigtangle-ts wallet.payToList()
        const block = await btWallet.payToList(
          password,
          giveMoneyResult,
          Buffer.from(Utils.HEX.decode(selectedToken.tokenid)), // The token we're selling
          `Sell ${amount} ${selectedToken.tokenname} for ${total} ${baseCurrency}`,
        )

        if (!block) {
          throw new Error('Failed to create sell transaction')
        }

        // Get the block hash as transaction ID
        const blockHash = block.getHash ? block.getHash() : block.hash
        const txHashStr = blockHash?.toString('hex') || `tx_${Date.now()}`

        logger.info('Sell order executed successfully', {
          from: (wallet as WalletFile).wallet.address,
          tokenId: selectedToken.tokenid,
          tokenName: selectedToken.tokenname,
          amount: amount,
          decimals: selectedToken.decimals,
          baseCurrencyAmount: total,
          baseCurrency: baseCurrency,
          memo: `Sell ${amount} ${selectedToken.tokenname}`,
          txHash: txHashStr,
        })

        setTxHash(txHashStr)
      }

      setErrorMessage('')

      // Reset form after successful order
      setTimeout(() => {
        setAmount('')
        setPrice('')
        setTotal('')
        setErrorMessage('')
        setIsLoading(false)
      }, 1000)

      // Refresh token balances after transaction
      setTimeout(() => loadTokensFromBlockchain(), 2000)
    } catch (error) {
      logger.error('Order placement error:', {safeMessage: error})
      setErrorMessage(`Order failed: ${(error as Error).message}`)
      setIsLoading(false)
    }
  }, [
    orderType,
    selectedToken,
    amount,
    baseCurrency,
    total,
    validateForm,
    getUnlockedWallet,
    getPassword,
    createBtWallet,
    publicInfo,
    loadTokensFromBlockchain,
  ])

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

      {/* Token Selection (for both buy and sell orders) */}
      <>
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
              {orderType === 'sell' && selectedToken.balance && (
                <Text
                  style={[
                    a.text_xs,
                    {color: theme.atoms.text_contrast_medium.color},
                  ]}>
                  Balance: {selectedToken.balance}
                </Text>
              )}
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
        accessibilityHint={_(msg`Enter the amount of tokens`)}
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
