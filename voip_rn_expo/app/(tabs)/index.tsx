import React from 'react';
import { View, StyleSheet } from 'react-native';
import Dashboard from '../../src/components/Dashboard/Dashboard';
import { useVoipConfig } from '../../src/hooks/useVoipConfig';
import { apiLogger } from '../../src/utils/logger';

export default function DashboardScreen() {
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
      <Dashboard 
        onNavigate={handleNavigation}
        isApiConfigured={apiConfigured}
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