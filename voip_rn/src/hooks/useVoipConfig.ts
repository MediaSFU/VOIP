import { useState, useEffect, useCallback } from 'react';
import { AppConfig } from '../types';
import { configService } from '../services/configService';
import { apiLogger } from '../utils/logger';

// Custom hook for managing application configuration (React Native version)
export const useVoipConfig = () => {
  const [config, setConfig] = useState<AppConfig>(configService.getConfigSync());
  const [isLoading, setIsLoading] = useState(true);
  const [isApiConfiguredState, setIsApiConfiguredState] = useState(false);

  // Initialize and subscribe to configuration changes
  useEffect(() => {
    let isMounted = true;

    const initializeConfig = async () => {
      try {
        const currentConfig = await configService.getConfig();
        if (isMounted) {
          setConfig(currentConfig);
          setIsLoading(false);
          // Initialize isApiConfigured state
          setIsApiConfiguredState(configService.isApiConfiguredSync());
        }
      } catch (error) {
        apiLogger.warn('Failed to initialize config:', error);
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    const unsubscribe = configService.subscribe((newConfig: AppConfig) => {
      if (isMounted) {
        setConfig(newConfig);
        // Update isApiConfigured state when config changes
        setIsApiConfiguredState(configService.isApiConfiguredSync());
      }
    });

    initializeConfig();

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  // Update configuration
  const updateConfig = useCallback(async (updates: Partial<AppConfig>) => {
    try {
      await configService.updateConfig(updates);
    } catch (error) {
      apiLogger.warn('Failed to update config:', error);
    }
  }, []);

  // Update API configuration
  const updateApiConfig = useCallback(async (apiConfig: Partial<AppConfig['api']>) => {
    try {
      await configService.updateApiConfig(apiConfig);
    } catch (error) {
      apiLogger.warn('Failed to update API config:', error);
    }
  }, []);

  // Update realtime configuration
  const updateRealtimeConfig = useCallback(async (realtimeConfig: Partial<AppConfig['realtime']>) => {
    try {
      await configService.updateRealtimeConfig(realtimeConfig);
    } catch (error) {
      apiLogger.warn('Failed to update realtime config:', error);
    }
  }, []);

  // Update UI configuration
  const updateUIConfig = useCallback(async (uiConfig: Partial<AppConfig['ui']>) => {
    try {
      await configService.updateUIConfig(uiConfig);
    } catch (error) {
      apiLogger.warn('Failed to update UI config:', error);
    }
  }, []);

  // Update calls configuration
  const updateCallsConfig = useCallback(async (callsConfig: Partial<AppConfig['calls']>) => {
    try {
      await configService.updateCallsConfig(callsConfig);
    } catch (error) {
      apiLogger.warn('Failed to update calls config:', error);
    }
  }, []);

  // Check if API is configured
  const isApiConfigured = useCallback(async () => {
    try {
      return await configService.isApiConfigured();
    } catch (error) {
      apiLogger.warn('Failed to check API config:', error);
      return false;
    }
  }, []);

  // Check if API is configured synchronously
  const isApiConfiguredSync = useCallback(() => {
    return configService.isApiConfiguredSync();
  }, []);

  // Get API credentials
  const getApiCredentials = useCallback(async () => {
    try {
      return await configService.getApiCredentials();
    } catch (error) {
      apiLogger.warn('Failed to get API credentials:', error);
      return { apiKey: '', apiUserName: '', baseUrl: '' };
    }
  }, []);

  // Reset configuration
  const resetConfig = useCallback(async () => {
    try {
      await configService.resetConfig();
    } catch (error) {
      apiLogger.warn('Failed to reset config:', error);
    }
  }, []);

  // Toggle theme
  const toggleTheme = useCallback(async () => {
    try {
      await configService.toggleTheme();
    } catch (error) {
      apiLogger.warn('Failed to toggle theme:', error);
    }
  }, []);

  // Export/Import configuration
  const exportConfig = useCallback(async () => {
    try {
      return await configService.exportConfig();
    } catch (error) {
      apiLogger.warn('Failed to export config:', error);
      return '';
    }
  }, []);

  const importConfig = useCallback(async (configJson: string) => {
    try {
      return await configService.importConfig(configJson);
    } catch (error) {
      apiLogger.warn('Failed to import config:', error);
      return false;
    }
  }, []);

  return {
    config,
    isLoading,
    isApiConfigured: isApiConfiguredState,
    updateConfig,
    updateApiConfig,
    updateRealtimeConfig,
    updateUIConfig,
    updateCallsConfig,
    isApiConfiguredAsync: isApiConfigured,
    isApiConfiguredSync,
    getApiCredentials,
    resetConfig,
    toggleTheme,
    exportConfig,
    importConfig,
  };
};
