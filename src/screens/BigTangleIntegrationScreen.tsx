import {ScrollView, StyleSheet, View} from 'react-native'

import {Text} from '#/view/com/util/text/Text'
import {BigTangleDemo} from '#/components/BigTangleDemo'
import {useTheme} from '#/ctx'

export const BigTangleIntegrationScreen = () => {
  const theme = useTheme()

  return (
    <ScrollView
      style={[styles.container, {backgroundColor: theme.color.bg}]}
      contentContainerStyle={styles.contentContainer}>
      <View style={styles.headerSection}>
        <Text style={[styles.title, {color: theme.color.text}]}>
          BigTangle Blockchain Integration
        </Text>
        <Text style={[styles.description, {color: theme.color.textLight}]}>
          Demonstrating the integration of BigTangle blockchain library
        </Text>
      </View>

      <View style={styles.demoSection}>
        <BigTangleDemo />
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: 24,
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  description: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  demoSection: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.18,
    shadowRadius: 1.0,
    elevation: 2,
  },
})
