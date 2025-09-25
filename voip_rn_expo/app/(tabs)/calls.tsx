import React from 'react';
import { View, StyleSheet } from 'react-native';
import CallsPage from '../../src/components/Calls/CallsPage';
import { useVoipConfig } from '../../src/hooks/useVoipConfig';
import { apiLogger } from '../../src/utils/logger';

export default function CallsScreen() {
  const { isApiConfigured } = useVoipConfig();
  
  const handleNavigation = (page: string) => {
    // In React Native Expo Router, we would use router.push() but for now just log
    apiLogger.info('Navigate to:', page);
    // TODO: Implement navigation to other tabs/screens
  };

  return (
    <View style={styles.container}>
      <CallsPage 
        onNavigate={handleNavigation} 
        isApiConfigured={isApiConfigured} 
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
});