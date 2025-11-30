import {useEffect, useState} from 'react'
import {Text, View} from 'react-native'
import {Address, ECKey, Transaction} from '@bigtangle/bigtangle-ts'
import type React from 'react'

// Example React component using bigtangle-ts
const BigTangleExample: React.FC = () => {
  const [address, setAddress] = useState<string>('')
  const [transactionStatus, setTransactionStatus] = useState<string>('')

  useEffect(() => {
    try {
      // Example usage of bigtangle-ts
      const key = new ECKey()
      const addr = new Address(key)
      setAddress(addr.toString())

      // Example transaction creation
      const tx = new Transaction()
      setTransactionStatus(
        `Transaction initialized: ${tx.getHash?.() ? tx.getHash().toString() : 'no hash'}`,
      )
    } catch (error) {
      console.error('Error initializing bigtangle-ts:', error)
      setTransactionStatus('Error initializing')
    }
  }, [])

  return (
    <View>
      <Text>BigTangle Example</Text>
      <Text>Generated Address: {address}</Text>
      <Text>Transaction Status: {transactionStatus}</Text>
    </View>
  )
}

export default BigTangleExample
