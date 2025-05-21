import {useState} from 'react'
import {StyleSheet, Text, View} from 'react-native'
import {getDocumentAsync} from 'expo-document-picker'
import * as FileSystem from 'expo-file-system'
import type React from 'react'

import {Button, Error as ErrorComponent} from '../../components'
import {
  createWalletFromMnemonic,
  generateWalletMnemonic,
  type HDWallet,
  loadHDWalletFromFile,
  saveHDWalletToFile,
} from '../../lib/hdwallet'
import {useSession} from '../../state/session'

export const WalletLogin: React.FC = () => {
  const {loginWithWallet} = useSession()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const [wallet, setWallet] = useState<HDWallet | null>(null)
  const walletAddress = wallet?.publicKey || ''
  const [fileStatus, setFileStatus] = useState('')
  const [fileError, setFileError] = useState('')
  const [generateStatus, setGenerateStatus] = useState('')
  const [generateError, setGenerateError] = useState('')

  const handleGenerateWallet = async () => {
    try {
      setGenerateStatus('Generating new wallet...')
      const mnemonic = generateWalletMnemonic()
      const newWallet = createWalletFromMnemonic(mnemonic)
      setWallet(newWallet)
      setGenerateStatus('New wallet generated! Export to save it')
      setGenerateError('')
    } catch (e: unknown) {
      setGenerateError((e as Error)?.message || 'Failed to generate wallet')
      setGenerateStatus('')
    }
  }

  const handleImportWallet = async () => {
    try {
      setFileStatus('Importing...')
      const result = await getDocumentAsync()
      if (!result.assets || !result.assets[0]) return
      const walletData = await FileSystem.readAsStringAsync(
        result.assets[0].uri,
      )
      const importedWallet = loadHDWalletFromFile(walletData)
      setWallet(importedWallet)
      setFileStatus('Wallet imported successfully')
    } catch (e: unknown) {
      setFileError((e as Error)?.message || 'Failed to import wallet')
      setFileStatus('')
    }
  }

  const handleExportWallet = async () => {
    try {
      if (!walletAddress) {
        throw new Error('No wallet address to export')
      }

      setFileStatus('Exporting...')
      if (!wallet) throw new Error('No wallet to export')
      const walletData = saveHDWalletToFile(wallet)
      const path = FileSystem.documentDirectory + `wallet-${Date.now()}.dat`
      await FileSystem.writeAsStringAsync(path!, walletData)
      setFileStatus(`Wallet saved to ${path}`)
    } catch (e: unknown) {
      setFileError((e as Error)?.message || 'Failed to export wallet')
      setFileStatus('')
    }
  }

  const handleLogin = async () => {
    try {
      setLoading(true)
      setError('')
      await loginWithWallet(walletAddress)
    } catch (e: unknown) {
      setError((e as Error)?.message || 'Unknown error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      {error && (
        <ErrorComponent message={error} title="Wallet Connection Error" />
      )}
      {walletAddress && (
        <Text style={styles.addressText}>
          Connected wallet: {walletAddress.slice(0, 6)}...
          {walletAddress.slice(-4)}
        </Text>
      )}
      <View style={styles.buttonContainer}>
        <Button
          onPress={handleLogin}
          disabled={!walletAddress || loading}
          label={loading ? 'Connecting...' : 'Connect Wallet'}>
          <></>
        </Button>

        <Button
          onPress={handleGenerateWallet}
          disabled={loading}
          label="Generate New Wallet"
          variant="outline">
          <></>
        </Button>

        <Button
          onPress={handleImportWallet}
          disabled={loading}
          label="Import Wallet File"
          variant="outline">
          <></>
        </Button>

        <Button
          onPress={handleExportWallet}
          disabled={!walletAddress || loading}
          label="Export Wallet File"
          variant="outline">
          <></>
        </Button>
      </View>

      {(fileStatus || fileError || generateStatus || generateError) && (
        <View style={styles.statusContainer}>
          {fileStatus && <Text style={styles.statusText}>{fileStatus}</Text>}
          {fileError && <Text style={styles.errorText}>{fileError}</Text>}
          {generateStatus && (
            <Text style={styles.statusText}>{generateStatus}</Text>
          )}
          {generateError && (
            <Text style={styles.errorText}>{generateError}</Text>
          )}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  addressText: {
    fontSize: 16,
    marginBottom: 16,
  },
  buttonContainer: {
    gap: 12,
    marginTop: 20,
  },
  statusContainer: {
    marginTop: 20,
  },
  statusText: {
    color: 'green',
  },
  errorText: {
    color: 'red',
  },
})
