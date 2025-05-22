import {Button, Alert} from 'react-native'
import {loadHDWalletFromFile} from '../../../lib/hdwallet'

export function LoadWallet() {
  const handleLoad = async () => {
    // TODO: Implement file picker integration
    const fileData = '' // Get from file system
    try {
      const _wallet = loadHDWalletFromFile(fileData)
      Alert.alert('Wallet Loaded', 'Wallet imported successfully')
    } catch (e) {
      Alert.alert('Error', 'Invalid wallet file')
    }
  }

  return (
    <Button title="Load Existing Wallet" onPress={handleLoad} />
  )
}
