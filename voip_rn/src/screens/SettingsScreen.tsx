import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Settings } from '../components/Settings/Settings';

export default function SettingsScreen() {
  return (
    <View style={styles.container}>
      <Settings />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
});
