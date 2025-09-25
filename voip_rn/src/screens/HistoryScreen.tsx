import React from 'react';
import { View, StyleSheet } from 'react-native';
import CallHistoryPage from '../components/History/CallHistoryPage';
import { useVoipConfig } from '../hooks/useVoipConfig';
import { apiLogger } from '../utils/logger';

export default function HistoryScreen() {
  const { config } = useVoipConfig();
  const apiConfigured = !!(config.api.key && config.api.userName && config.api.baseUrl);

  const handleNavigation = (page: string) => {
    apiLogger.info('Navigate to:', page);
  };

  return (
    <View style={styles.container}>
      <CallHistoryPage isApiConfigured={apiConfigured} onNavigate={handleNavigation} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
});
