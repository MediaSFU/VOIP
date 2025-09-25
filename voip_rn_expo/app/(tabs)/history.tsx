import React from 'react';
import { View, StyleSheet } from 'react-native';
import CallHistoryPage from '../../src/components/History/CallHistoryPage';
import { useVoipConfig } from '../../src/hooks/useVoipConfig';
import { apiLogger } from '../../src/utils/logger';

export default function HistoryScreen() {
  const { config } = useVoipConfig();
  
  // Calculate if API is configured based on current config state
  const apiConfigured = !!(config.api.key && config.api.userName && config.api.baseUrl);

  const handleNavigation = (page: string) => {
    // In React Native Expo Router, we would use router.push() but for now just log
    apiLogger.info('Navigate to:', page);
    // TODO: Implement navigation to other tabs/screens
  };

  return (
    <View style={styles.container}>
      <CallHistoryPage 
        isApiConfigured={apiConfigured}
        onNavigate={handleNavigation}
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
