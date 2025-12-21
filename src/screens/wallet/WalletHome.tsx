import React from 'react'
import {View} from 'react-native'
import {msg, Trans} from '@lingui/macro'
import {useLingui} from '@lingui/react'
import {useFocusEffect} from '@react-navigation/native'

import {useNonReactiveCallback} from '#/lib/hooks/useNonReactiveCallback'
import {useSetTitle} from '#/lib/hooks/useSetTitle'
import {isWeb} from '#/platform/detection'
import {useSession} from '#/state/session'
import {useSetMinimalShellMode} from '#/state/shell'
import {useLoggedOutViewControls} from '#/state/shell/logged-out'
import * as SettingsList from '#/screens/Settings/components/SettingsList'
import {atoms as a} from '#/alf'
import {Key_Stroke2_Corner2_Rounded as KeyIcon} from '#/components/icons/Key'
import {PaperPlane_Stroke2_Corner0_Rounded as SendIcon} from '#/components/icons/PaperPlane'
import * as Layout from '#/components/Layout'
import {Text} from '#/components/Typography'

type Props = Readonly<{
  route: any
  navigation: any
}>

export function WalletHomeScreen(_props: Props) {
  const {setShowLoggedOut} = useLoggedOutViewControls()
  const {currentAccount} = useSession()
  const {_} = useLingui()

  React.useEffect(() => {
    if (isWeb && !currentAccount) {
      const getParams = new URLSearchParams(globalThis.location.search)
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
      // Wallet home displayed
    }),
  )

  return (
    <Layout.Screen testID="WalletHomeScreen">
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>
            <Trans>Wallet</Trans>
          </Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>
      <Layout.Content>
        <SettingsList.Container>
          <View style={[a.pt_lg, a.px_lg, a.pb_md]}>
            <Text style={[a.text_md, a.leading_snug]}>
              <Trans>Manage your cryptocurrency wallets and keys.</Trans>
            </Text>
          </View>
          <SettingsList.Divider />
          <SettingsList.LinkItem to="/wallet/keys" label={_(msg`Manage Keys`)}>
            <SettingsList.ItemIcon icon={KeyIcon} />
            <SettingsList.ItemText>
              <Trans>Manage Keys</Trans>
            </SettingsList.ItemText>
          </SettingsList.LinkItem>
          <SettingsList.LinkItem to="/wallet/pay" label={_(msg`Send Payment`)}>
            <SettingsList.ItemIcon icon={SendIcon} />
            <SettingsList.ItemText>
              <Trans>Send Payment</Trans>
            </SettingsList.ItemText>
          </SettingsList.LinkItem>
        </SettingsList.Container>
      </Layout.Content>
    </Layout.Screen>
  )
}

// Export default for consistency
export default WalletHomeScreen
