import {View, StyleSheet} from 'react-native'
import {GenerateWallet} from './components/GenerateWallet'
import {LoadWallet} from './components/LoadWallet'

export function WalletScreen() {
  return (
    <View style={styles.container}>
      <GenerateWallet />
      <LoadWallet />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    gap: 12
  }
})
