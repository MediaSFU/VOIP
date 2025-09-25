import { useState, useEffect, useCallback } from 'react';
import { AppConfig } from '../types';
import { ConfigService } from '../services';

// Custom hook for managing application configuration
export const useVoipConfig = () => {
  const [config, setConfig] = useState<AppConfig>(() => {
    const configService = new ConfigService();
    return configService.getConfig();
  });
  
  const [configService] = useState(() => new ConfigService());

  // Subscribe to configuration changes
  useEffect(() => {
    const unsubscribe = configService.subscribe((newConfig: any) => {
      setConfig(newConfig);
    });

    return unsubscribe;
  }, [configService]);

  // Update configuration
  const updateConfig = useCallback((updates: Partial<AppConfig>) => {
    configService.updateConfig(updates);
  }, [configService]);

  // Update API configuration
  const updateApiConfig = useCallback((apiConfig: Partial<AppConfig['api']>) => {
    configService.updateApiConfig(apiConfig);
  }, [configService]);

  // Update realtime configuration
  const updateRealtimeConfig = useCallback((realtimeConfig: Partial<AppConfig['realtime']>) => {
    configService.updateRealtimeConfig(realtimeConfig);
  }, [configService]);

  // Update UI configuration
  const updateUIConfig = useCallback((uiConfig: Partial<AppConfig['ui']>) => {
    configService.updateUIConfig(uiConfig);
  }, [configService]);

  // Update calls configuration
  const updateCallsConfig = useCallback((callsConfig: Partial<AppConfig['calls']>) => {
    configService.updateCallsConfig(callsConfig);
  }, [configService]);

  // Check if API is configured
  const isApiConfigured = useCallback(() => {
    return configService.isApiConfigured();
  }, [configService]);

  // Get API credentials
  const getApiCredentials = useCallback(() => {
    return configService.getApiCredentials();
  }, [configService]);

  // Reset configuration
  const resetConfig = useCallback(() => {
    configService.resetConfig();
  }, [configService]);

  // Toggle theme
  const toggleTheme = useCallback(() => {
    configService.toggleTheme();
  }, [configService]);

  // Export/Import configuration
  const exportConfig = useCallback(() => {
    return configService.exportConfig();
  }, [configService]);

  const importConfig = useCallback((configJson: string) => {
    return configService.importConfig(configJson);
  }, [configService]);

  return {
    config,
    updateConfig,
    updateApiConfig,
    updateRealtimeConfig,
    updateUIConfig,
    updateCallsConfig,
    isApiConfigured,
    getApiCredentials,
    resetConfig,
    toggleTheme,
    exportConfig,
    importConfig
  };
};
