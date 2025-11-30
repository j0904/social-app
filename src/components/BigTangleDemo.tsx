import {useEffect, useState} from 'react'
import {Button, StyleSheet, Text, View} from 'react-native'
import type React from 'react'

import {Address, Block, ECKey, Transaction} from '../lib/bigtangle-mock'

const BigTangleDemo: React.FC = () => {
  const [address, setAddress] = useState<string>('')
  const [transactionInfo, setTransactionInfo] = useState<string>('')
  const [blockInfo, setBlockInfo] = useState<string>('')

  useEffect(() => {
    try {
      // Generate a new key pair and corresponding address
      const key = new ECKey()
      const addr = new Address(key)
      setAddress(addr.toString())
    } catch (error) {
      console.error('Error initializing BigTangle functions:', error)
      setAddress('Error initializing')
    }
  }, [])

  const handleCreateTransaction = () => {
    try {
      const tx = new Transaction()
      setTransactionInfo(
        `Transaction created with ID: ${tx.getHash ? tx.getHash().toString() : 'unavailable'}`,
      )
    } catch (error) {
      console.error('Error creating transaction:', error)
      setTransactionInfo('Error creating transaction')
    }
  }

  const handleCreateBlock = () => {
    try {
      const block = new Block()
      setBlockInfo(`Block created with height: ${block.height || 0}`)
    } catch (error) {
      console.error('Error creating block:', error)
      setBlockInfo('Error creating block')
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>BigTangle Demo</Text>

      <View style={styles.section}>
        <Text style={styles.label}>Generated Address:</Text>
        <Text style={styles.value}>{address}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Transaction Info:</Text>
        <Text style={styles.value}>{transactionInfo}</Text>
        <Button title="Create Transaction" onPress={handleCreateTransaction} />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Block Info:</Text>
        <Text style={styles.value}>{blockInfo}</Text>
        <Button title="Create Block" onPress={handleCreateBlock} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  section: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 5,
  },
  value: {
    fontSize: 14,
    marginBottom: 10,
    padding: 5,
    backgroundColor: '#ffffff',
  },
})

export default BigTangleDemo
