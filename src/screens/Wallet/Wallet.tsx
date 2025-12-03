import React, { useEffect,useState } from 'react'
import { Alert, Linking, Platform,ScrollView, StyleSheet, Text, TextInput as RNTextInput, TouchableOpacity, View } from 'react-native'
import * as FileSystem from 'expo-file-system'
import { format } from 'date-fns'

import { useTheme } from '#/alf'
import { Button } from '#/components/Button'

// Define types for our wallet functionality
type WalletFile = {
  id: string
  name: string
  path: string
  dowloadURL: string
  createdAt: Date
}

type WalletData = {
  id: string
  addresses: string[]
  publickeys: string[]
  ethaddresses: string[]
  encrypted: boolean
  checkAddress: boolean
}

const WalletScreen = () => {
  const theme = useTheme()
  const [walletFiles, setWalletFiles] = useState<WalletFile[]>([]);
  const [walletData, setWalletData] = useState<WalletData | null>(null);
  const [isEncrypted, setIsEncrypted] = useState<boolean>(false)
  const [password, setPassword] = useState<string>('')
  const [privateKey, setPrivateKey] = useState<string>('')
  const [showPrivateKey, setShowPrivateKey] = useState<boolean>(false)
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [addKeyMode, setAddKeyMode] = useState<boolean>(false)

  // Load wallet files from documents directory on component mount
  useEffect(() => {
    loadWalletFiles();
  }, []);

  const loadWalletFiles = async () => {
    try {
      // Get the documents directory path
      const documentsDir = FileSystem.documentDirectory;
      if (!documentsDir) {
        console.error('Documents directory not available');
        return;
      }

      // List files in the documents directory
      const files = await FileSystem.readDirectoryAsync(documentsDir);
      
      // Filter for wallet files (json files that look like wallets)
      const walletFiles = files
        .filter(file => file.endsWith('.json') && file.includes('wallet'))
        .map((fileName, index) => {
          const filePath = `${documentsDir}${fileName}`;
          return {
            id: `${index + 1}`,
            name: fileName,
            path: filePath,
            dowloadURL: filePath,
            createdAt: new Date(), // In a real implementation, you'd get the actual creation time
          };
        });

      setWalletFiles(walletFiles);
    } catch (error) {
      console.error('Error loading wallet files:', error);
      Alert.alert('Error', 'Failed to load wallet files');
    }
  };

  const loadWalletData = async (walletPath: string, password?: string) => {
    try {
      const fileContent = await FileSystem.readAsStringAsync(walletPath);
      
      // Check if the content is encrypted
      let parsedContent;
      try {
        parsedContent = JSON.parse(fileContent);
        if (parsedContent.encrypted) {
          if (!password) {
            // If the wallet is encrypted and no password was provided,
            // we need to prompt for password or handle accordingly
            Alert.alert('Encrypted Wallet', 'This wallet is encrypted. Please provide the password.');
            setIsEncrypted(true); // Switch to password entry mode
            return;
          }
          
          // Decrypt the content
          const decryptedContent = decryptData(fileContent, password);
          if (decryptedContent === null) {
            Alert.alert('Error', 'Failed to decrypt wallet. Invalid password.');
            return;
          }
          
          parsedContent = JSON.parse(decryptedContent);
        }
      } catch (e) {
        // If it's not JSON, it might not be encrypted, so treat as regular content
        parsedContent = { addresses: [], publickeys: [], ethaddresses: [], encrypted: false, checkAddress: false };
      }
      
      // Update the wallet data state
      const newWalletData: WalletData = {
        id: '1',
        addresses: parsedContent.addresses || [],
        publickeys: parsedContent.publickeys || [],
        ethaddresses: parsedContent.ethaddresses || [],
        encrypted: parsedContent.encrypted || false,
        checkAddress: parsedContent.checkAddress || true,
      };
      
      setWalletData(newWalletData);
    } catch (error) {
      console.error('Error loading wallet data:', error);
      Alert.alert('Error', 'Failed to load wallet data');
    }
  };

  // Generate a more robust encryption key using a simple hash approach
  // Note: This is still a simplified approach for demonstration. A real implementation 
  // would use a proper cryptographic library like expo-crypto if available
  const generateEncryptionKey = (password: string): string => {
    // Simple hash approach - in a real app, use proper crypto like PBKDF2
    let hash = password;
    for (let i = 0; i < 1000; i++) { // Simulate multiple rounds for basic key stretching
      hash = Array.from(hash).reduce((acc, char) => acc + char.charCodeAt(0).toString(16), '');
      if (hash.length > 64) hash = hash.substring(0, 64); // Limit length
    }
    return hash;
  };

  // Encrypt data with a password using a basic XOR cipher (for demonstration only)
  // A production implementation would use proper AES encryption
  const encryptData = (data: string, password: string): string => {
    const key = generateEncryptionKey(password);
    const keyBytes = Array.from(key).map(c => c.charCodeAt(0));
    const dataBytes = Array.from(data).map(c => c.charCodeAt(0));
    
    const encryptedBytes = dataBytes.map((byte, i) => 
      byte ^ keyBytes[i % keyBytes.length]
    );
    
    // Convert to base64 for storage
    const encryptedString = String.fromCharCode(...encryptedBytes);
    const base64Encrypted = btoa(encodeURIComponent(encryptedString).replace(/%([0-9A-F]{2})/g, function(match, p1) {
      return String.fromCharCode(parseInt(p1, 16))
    }));
    
    return JSON.stringify({
      data: base64Encrypted,
      salt: key.substring(0, 16), // store part of key as salt equivalent
      encrypted: true,
      format: 'xor-encryption-v1'
    });
  };

  // Decrypt data with a password
  const decryptData = (encryptedDataStr: string, password: string): string | null => {
    try {
      const encryptedData = JSON.parse(encryptedDataStr);
      if (encryptedData.encrypted && encryptedData.format === 'xor-encryption-v1') {
        const key = generateEncryptionKey(password);
        const encryptedString = decodeURIComponent(escape(atob(encryptedData.data)));
        const encryptedBytes = Array.from(encryptedString).map(c => c.charCodeAt(0));
        const keyBytes = Array.from(key).map(c => c.charCodeAt(0));
        
        const decryptedBytes = encryptedBytes.map((byte, i) => 
          byte ^ keyBytes[i % keyBytes.length]
        );
        
        return String.fromCharCode(...decryptedBytes);
      }
      // If not encrypted or different format, return as is
      return encryptedDataStr;
    } catch (error) {
      console.error('Error decrypting data:', error);
      return null;
    }
  };

  // Load a specific wallet file
  const loadWalletDataFromPath = async (walletPath: string, password?: string) => {
    setIsLoading(true);
    await loadWalletData(walletPath, password);
    setIsEncrypted(false);
    setIsLoading(false);
  }

  // Show keys for a wallet
  const showKeys = (walletId: string) => {
    const walletFile = walletFiles.find(wf => wf.id === walletId);
    if (walletFile) {
      // Check if the file is encrypted by reading its content
      checkIfWalletEncrypted(walletFile.path, walletId);
    }
  }
  
  // Check if a wallet is encrypted and handle accordingly
  const checkIfWalletEncrypted = async (path: string, walletId: string) => {
    try {
      const fileContent = await FileSystem.readAsStringAsync(path);
      let isEncrypted = false;
      
      try {
        const parsed = JSON.parse(fileContent);
        isEncrypted = !!parsed.encrypted;
      } catch (e) {
        // Not JSON, so not encrypted
        isEncrypted = false;
      }
      
      if (isEncrypted) {
        // Show password dialog for encrypted wallet
        setSelectedWalletId(walletId);
        setIsEncrypted(true);
      } else {
        // Load the wallet directly if it's not encrypted
        setSelectedWalletId(walletId);
        await loadWalletDataFromPath(path);
      }
    } catch (error) {
      console.error('Error checking wallet encryption:', error);
      Alert.alert('Error', 'Failed to check wallet encryption status: ' + (error as Error).message);
    }
  }

  // Set password for encryption
  const toSetPwd = (walletId: string) => {
    setSelectedWalletId(walletId)
    setIsEncrypted(true)
  }
  
  // Handle password submission when opening an encrypted wallet
  const handlePasswordSubmit = async () => {
    if (!password) {
      Alert.alert('Error', 'Please enter a password');
      return;
    }
    
    if (!selectedWalletId) {
      Alert.alert('Error', 'No wallet selected');
      return;
    }
    
    const walletFile = walletFiles.find(wf => wf.id === selectedWalletId);
    if (!walletFile) {
      Alert.alert('Error', 'Wallet file not found');
      return;
    }
    
    if (addKeyMode) {
      // We're in add key mode
      try {
        const fileContent = await FileSystem.readAsStringAsync(walletFile.path);
        // Decrypt the content
        const decryptedContent = decryptData(fileContent, password);
        if (decryptedContent === null) {
          Alert.alert('Error', 'Failed to decrypt wallet. Invalid password.');
          return;
        }
        
        let walletData;
        try {
          walletData = JSON.parse(decryptedContent);
        } catch (e) {
          Alert.alert('Error', 'Invalid wallet format');
          return;
        }
        
        // Add a new key (in a real implementation, you would generate a proper key)
        const newKey = {
          address: `new_address_${Date.now()}`,
          publicKey: `new_public_key_${Date.now()}`,
          privateKey: `new_private_key_${Date.now()}`
        };
        
        if (!walletData.keys) {
          walletData.keys = [];
        }
        walletData.keys.push(newKey);
        
        // Encrypt the updated content
        const encryptedContent = encryptData(JSON.stringify(walletData), password);
        
        // Write the encrypted content back to the file
        await FileSystem.writeAsStringAsync(walletFile.path, encryptedContent);
        
        // Clear the addKeyMode
        setAddKeyMode(false);
        setIsEncrypted(false);
        setSelectedWalletId(null);
        setPassword('');
        
        // Reload the wallet files to reflect the changes
        loadWalletFiles();
        
        Alert.alert('Success', 'New key added to wallet');
      } catch (error) {
        console.error('Error adding key to encrypted wallet:', error);
        Alert.alert('Error', 'Failed to add key to encrypted wallet: ' + (error as Error).message);
      }
    } else {
      // We're just decrypting to view the wallet
      await loadWalletDataFromPath(walletFile.path, password);
      setPassword(''); // Clear password after use
    }
  }

  // Add encryption to wallet file
  const addPwdToWallet = async () => {
    if (!password) {
      Alert.alert('Error', 'Please enter a password')
      return
    }
    
    const walletFile = walletFiles.find(wf => wf.id === selectedWalletId);
    if (!walletFile) {
      Alert.alert('Error', 'Wallet file not found');
      return;
    }
    
    try {
      // Read the current wallet file
      const fileContent = await FileSystem.readAsStringAsync(walletFile.path);
      
      // Encrypt the content
      const encryptedContent = encryptData(fileContent, password);
      
      // Write the encrypted content back to the file
      await FileSystem.writeAsStringAsync(walletFile.path, encryptedContent);
      
      // Update the wallet file list to reflect it's now encrypted
      setWalletFiles(prev => 
        prev.map(wf => 
          wf.id === walletFile.id ? {...wf, name: wf.name.endsWith('.encrypted') ? wf.name : `${wf.name}.encrypted`} : wf
        )
      );
      
      setIsEncrypted(false); // Return to non-encrypted view
      setPassword('');
      Alert.alert('Success', 'Wallet encrypted successfully');
      
      // Reload the wallet files to update the UI
      loadWalletFiles();
    } catch (error) {
      console.error('Error encrypting wallet:', error);
      Alert.alert('Error', 'Failed to encrypt wallet: ' + (error as Error).message);
    }
  }

  // Function to set up adding a key after getting the password
  const addKeyAfterPassword = async (walletFile: WalletFile) => {
    setAddKeyMode(true);
    // The actual adding will happen in handlePasswordSubmit
  };

  // Add a new key to wallet
  const toAddEckey = async (walletId: string) => {
    const walletFile = walletFiles.find(wf => wf.id === walletId);
    if (!walletFile) {
      Alert.alert('Error', 'Wallet file not found');
      return;
    }
    
    try {
      // First, check if the file is encrypted
      const fileContent = await FileSystem.readAsStringAsync(walletFile.path);
      let walletData;
      let isEncrypted = false;
      
      try {
        const parsed = JSON.parse(fileContent);
        isEncrypted = !!parsed.encrypted;
      } catch (e) {
        // Not JSON, so not encrypted or not JSON format
      }
      
      let contentToUse = fileContent;
      
      // If it's encrypted, we need to get the password to decrypt
      if (isEncrypted) {
        // Set up state to add a key after getting the password
        setSelectedWalletId(walletId); // Remember which wallet we're working with
        setIsEncrypted(true); // Show password dialog
        // Set a flag to know we want to add a key after decryption
        // For this implementation, we'll use a simple state flag to indicate
        // that after password entry, we want to add a key instead of just showing data
        addKeyAfterPassword(walletFile);
        return;
      }
      
      // If not encrypted, process directly
      walletData = JSON.parse(contentToUse);
      
      // Add a new key (in a real implementation, you would generate a proper key)
      const newKey = {
        address: `new_address_${Date.now()}`,
        publicKey: `new_public_key_${Date.now()}`,
        privateKey: `new_private_key_${Date.now()}`
      };
      
      if (!walletData.keys) {
        walletData.keys = [];
      }
      walletData.keys.push(newKey);
      
      // Write the updated content back to the file
      await FileSystem.writeAsStringAsync(walletFile.path, JSON.stringify(walletData));
      
      // Reload the wallet files to reflect the changes
      loadWalletFiles();
      
      Alert.alert('Success', 'New key added to wallet');
    } catch (error) {
      console.error('Error adding key to wallet:', error);
      Alert.alert('Error', 'Failed to add key to wallet: ' + (error as Error).message);
    }
  }

  // Delete a wallet
  const deleteSelection = async (walletId: string) => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete this wallet?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            try {
              const walletFile = walletFiles.find(wf => wf.id === walletId);
              if (walletFile) {
                // Delete the file
                await FileSystem.deleteAsync(walletFile.path);
                
                // Update the state
                setWalletFiles(prev => prev.filter(wf => wf.id !== walletId));
                if (selectedWalletId === walletId) {
                  setWalletData(null);
                  setSelectedWalletId(null);
                }
              }
            } catch (error) {
              console.error('Error deleting wallet:', error);
              Alert.alert('Error', 'Failed to delete wallet: ' + (error as Error).message);
            }
          }
        }
      ]
    )
  }

  // File download (opening file)
  const downloadWallet = (path: string) => {
    Linking.openURL(`file://${path}`).catch(err => {
      Alert.alert('Error', 'Could not open wallet file: ' + err.message)
    })
  }
  
  // Function to import a new wallet file (not implemented without proper library)
  const importWalletFile = async () => {
    Alert.alert(
      'Import Wallet',
      'Wallet import functionality requires proper file access permissions. On a mobile device you can copy wallet files to the app\'s documents directory manually.',
      [
        { text: 'OK', style: 'cancel' }
      ]
    );
  }

  // Show private key in a dialog
  const showPrivateKeyHandler = () => {
    setPrivateKey('5KJvsngHeMpm884wtkJNzQGaCErckhHJBGFsvd3VyK5qMZXj3hS')
    setShowPrivateKey(true)
  }
  
  // Close the private key dialog
  const closePrivateKeyDialog = () => {
    setShowPrivateKey(false)
    setPrivateKey('')
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.atoms.bg.backgroundColor }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.atoms.text.color }]}>Wallet Management</Text>
      </View>

      {/* Load Wallet Section */}
      {!isEncrypted && (
        <View style={styles.section}>
          <View style={styles.walletActions}>
            <Button
              type="primary"
              label="Load Wallet"
              onPress={loadWalletFiles}
              style={styles.actionButton}
            />
            <Button
              type="default"
              label="Import Wallet"
              onPress={importWalletFile}
              style={styles.actionButton}
            />
          </View>
        </View>
      )}

      {/* Wallet Files List */}
      {!isEncrypted && walletFiles.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.atoms.text.color }]}>Wallet Files</Text>
          {walletFiles.map((walletFile) => (
            <View key={walletFile.id} style={styles.walletItem}>
              <View style={styles.walletInfo}>
                <Text style={{ color: theme.atoms.text.color }}>{walletFile.name}</Text>
                <Text style={[styles.smallText, { color: theme.atoms.textLight.color }]}>
                  {format(walletFile.createdAt, 'yyyy-MM-dd HH:mm')}
                </Text>
              </View>
              <View style={styles.walletActions}>
                <Button
                  type="default"
                  label="Download"
                  onPress={() => downloadWallet(walletFile.dowloadURL)}
                  style={styles.actionButton}
                />
                <Button
                  type="default"
                  label="Show Keys"
                  onPress={() => showKeys(walletFile.id)}
                  style={styles.actionButton}
                />
                <Button
                  type="default"
                  label="Set Password"
                  onPress={() => toSetPwd(walletFile.id)}
                  style={styles.actionButton}
                />
                <Button
                  type="primary"
                  label="Add Key"
                  onPress={() => toAddEckey(walletFile.id)}
                  style={styles.actionButton}
                />
                <Button
                  type="negative"
                  label="Delete"
                  onPress={() => deleteSelection(walletFile.id)}
                  style={styles.actionButton}
                />
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Show Keys Section */}
      {walletData && walletData.checkAddress && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.atoms.text.color }]}>Wallet Information</Text>
          
          {/* Addresses */}
          <View style={styles.infoSection}>
            <Text style={[styles.infoTitle, { color: theme.atoms.text.color }]}>Addresses</Text>
            {walletData.addresses.map((addr, index) => (
              <View key={index} style={styles.infoItem}>
                <Text style={{ color: theme.atoms.text.color }}>{addr}</Text>
                <TouchableOpacity accessibilityRole="button" 
                  onPress={showPrivateKeyHandler}
                  style={styles.linkButton}
                >
                  <Text style={[styles.linkText, { color: theme.atoms.textLink.color }]}>Private Key</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>

          {/* Public Keys */}
          <View style={styles.infoSection}>
            <Text style={[styles.infoTitle, { color: theme.atoms.text.color }]}>Public Keys</Text>
            {walletData.publickeys.map((pubkey, index) => (
              <Text key={index} style={[styles.infoValue, { color: theme.atoms.text.color }]}>{pubkey}</Text>
            ))}
          </View>

          {/* ETH Addresses */}
          <View style={styles.infoSection}>
            <Text style={[styles.infoTitle, { color: theme.atoms.text.color }]}>ETH Addresses</Text>
            {walletData.ethaddresses.map((ethaddr, index) => (
              <Text key={index} style={[styles.infoValue, { color: theme.atoms.text.color }]}>{ethaddr}</Text>
            ))}
          </View>
        </View>
      )}

      {/* Encryption Mode - used for both encrypting and decrypting */}
      {isEncrypted && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.atoms.text.color }]}>
            {selectedWalletId ? 'Enter Password to Unlock Wallet' : 'Encrypt Wallet'}
          </Text>
          <View style={styles.inputContainer}>
            <Text style={{ color: theme.atoms.text.color }}>Password</Text>
            <RNTextInput
              value={password}
              onChangeText={setPassword}
              style={[styles.input, { backgroundColor: theme.atoms.bg.backgroundColor, color: theme.atoms.text.color }]}
              autoCapitalize="none"
              autoCorrect="false"
              spellCheck={false}
              secureTextEntry={true}
            />
            <View style={styles.walletActions}>
              <Button
                type="primary"
                label="Submit"
                onPress={handlePasswordSubmit}
                style={styles.actionButton}
              />
              <Button
                type="default"
                label="Cancel"
                onPress={() => {
                  setIsEncrypted(false);
                  setSelectedWalletId(null);
                  setPassword('');
                }}
                style={styles.actionButton}
              />
            </View>
          </View>
        </View>
      )}

      {/* Private Key Dialog */}
      {showPrivateKey && (
        <View style={styles.dialog}>
          <Text style={[styles.dialogTitle, { color: theme.atoms.text.color }]}>Private Key</Text>
          <Text selectable={true} style={{ color: theme.atoms.text.color }}>{privateKey}</Text>
          <Button
            type="default"
            label="Close"
            onPress={closePrivateKeyDialog}
            style={styles.closeButton}
          />
        </View>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  section: {
    marginBottom: 20,
    padding: 16,
    borderRadius: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  loadButton: {
    backgroundColor: 'green',
    padding: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  walletItem: {
    marginBottom: 10,
    padding: 12,
    borderRadius: 6,
  },
  walletInfo: {
    marginBottom: 10,
  },
  smallText: {
    fontSize: 12,
  },
  walletActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  actionButton: {
    margin: 4,
  },
  infoSection: {
    marginBottom: 15,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  infoItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  infoValue: {
    marginBottom: 5,
  },
  inputContainer: {
    marginBottom: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    padding: 10,
    marginBottom: 10,
  },
  saveButton: {
    alignSelf: 'flex-start',
  },
  dialog: {
    position: 'absolute',
    top: 100,
    left: 20,
    right: 20,
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 8,
    zIndex: 1000,
    elevation: 5,
  },
  dialogTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  closeButton: {
    marginTop: 10,
  },
  smallButton: {
    padding: 4,
    minWidth: 80,
  },
  linkButton: {
    padding: 4,
  },
  linkText: {
    color: 'blue',
    textDecorationLine: 'underline',
  },
})

export {WalletScreen as default}