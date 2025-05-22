import {useState} from 'react'
import {Button, Alert, Text} from 'react-native'
import {
  generateWalletMnemonic,
  saveHDWalletToFile,
  createWalletFromMnemonic
} from '../../../lib/hdwallet'

export function GenerateWallet() {
  const [mnemonic, setMnemonic] = useState('')
  
  const handleGenerate = () => {
    const newMnemonic = generateWalletMnemonic()
    setMnemonic(newMnemonic)
    
    try {
      const _walletData = saveHDWalletToFile(createWalletFromMnemonic(newMnemonic))
      Alert.alert('Wallet Created', 'New wallet generated and saved successfully')
    } catch (e) {
      Alert.alert('Error', 'Failed to save wallet')
    }
  }

  return (
    <>
      <Button title="Generate New Wallet" onPress={handleGenerate} />
      {mnemonic && <Text style={{marginTop: 10}}>{mnemonic}</Text>}
    </>
  )
}
