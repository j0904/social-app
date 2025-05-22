import {Button, Alert} from 'react-native'
import {useWallet, saveHDWalletToFile} from '../../../lib/hdwallet'

export function ExportWallet() {
  const wallet = useWallet()
  
  const handleExport = () => {
    if (!wallet) return
    
    try {
      const _walletData = saveHDWalletToFile(wallet)
      Alert.alert('Wallet Exported', 'Wallet file saved successfully')
    } catch (e) {
      Alert.alert('Error', 'Failed to export wallet')
    }
  }

  return (
    <Button title="Export Wallet" onPress={handleExport} />
  )
}
