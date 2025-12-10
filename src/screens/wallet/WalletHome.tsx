import React from 'react'
import {ActivityIndicator, StyleSheet, View} from 'react-native'
import {msg} from '@lingui/macro'
import {useLingui} from '@lingui/react'
import {useFocusEffect} from '@react-navigation/native'

import {useNonReactiveCallback} from '#/lib/hooks/useNonReactiveCallback'
import {useSetTitle} from '#/lib/hooks/useSetTitle'
import {type CommonNavigatorParams} from '#/lib/routes/types'
import {logEvent} from '#/lib/statsig/statsig'
import {isWeb} from '#/platform/detection'
import {useSession} from '#/state/session'
import {useSetMinimalShellMode} from '#/state/shell'
import {useLoggedOutViewControls} from '#/state/shell/logged-out'
import {Button} from '#/components/Button'
import * as Layout from '#/components/Layout'
import {Text} from '#/components/Typography'
import {useDemoMode} from '#/storage/hooks/demo-mode'
import {KeysScreen} from './Keys'

type Props = {
  route: any
  navigation: any
}

export function WalletHomeScreen(props: Props) {
  const {setShowLoggedOut} = useLoggedOutViewControls()
  const {currentAccount} = useSession()
  const {_} = useLingui()
  const [showWallet, setShowWallet] = React.useState(false)

  React.useEffect(() => {
    if (isWeb && !currentAccount) {
      const getParams = new URLSearchParams(window.location.search)
      const splash = getParams.get('splash')
      if (splash === 'true') {
        setShowLoggedOut(true)
        return
      }
    }
  }, [currentAccount, setShowLoggedOut])

  useSetTitle(_(msg`Wallet`))

  const setMinimalShellMode = useSetMinimalShellMode()
  useFocusEffect(
    React.useCallback(() => {
      setMinimalShellMode(false)
    }, [setMinimalShellMode]),
  )

  useFocusEffect(
    useNonReactiveCallback(() => {
      logEvent('wallet:homeDisplayed', {
        reason: 'focus',
      })
    }),
  )

  if (showWallet) {
    // Display the actual wallet/keys functionality when user navigates there
    return (
      <Layout.Screen testID="WalletHomeScreen">
        <KeysScreen {...props} />
      </Layout.Screen>
    )
  }

  // Display wallet home screen with option to navigate to wallet functionality
  return (
    <Layout.Screen testID="WalletHomeScreen">
      <Layout.Content>
        <View style={styles.container}>
          <Text style={styles.title}>{_(msg`Wallet Home`)}</Text>
          <Text style={styles.description}>
            {_(msg`Manage your cryptocurrency wallets and keys.`)}
          </Text>

          <Button
            testID="viewWalletButton"
            variant="solid"
            color="primary"
            label={_(msg`View Wallet`)}
            onPress={() => setShowWallet(true)}
            style={styles.button}>
            <Text>{_(msg`View Wallet`)}</Text>
          </Button>
        </View>
      </Layout.Content>
    </Layout.Screen>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 32,
    color: '#666',
  },
  button: {
    marginTop: 16,
  },
})

// Export default for consistency
export default WalletHomeScreen
