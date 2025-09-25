import React from 'react';
import { View, StyleSheet } from 'react-native';
import CallsPage from '../components/Calls/CallsPage';
import { useVoipConfig } from '../hooks/useVoipConfig';
import { apiLogger } from '../utils/logger';

export default function CallsScreen() {
  const { isApiConfigured } = useVoipConfig();

  const handleNavigation = (page: string) => {
    apiLogger.info('Navigate to:', page);
  };

  return (
    <View style={styles.container}>
      <CallsPage onNavigate={handleNavigation} isApiConfigured={isApiConfigured} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
});
