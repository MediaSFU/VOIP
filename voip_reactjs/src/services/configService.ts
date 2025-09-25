import { AppConfig, DEFAULT_CONFIG } from '../types';

export class ConfigService {
  private static readonly STORAGE_KEY = 'mediaSFUCredentials'; // Same key as react_ref
  private static readonly CONFIG_KEY = 'voipAppConfig'; // New key for full config
  private config: AppConfig;
  private listeners: Array<(config: AppConfig) => void> = [];

  constructor() {
    this.config = this.loadConfig();
  }

  // Load configuration from localStorage (same pattern as react_ref)
  private loadConfig(): AppConfig {
    try {
      // First try to load full config
      const fullConfig = localStorage.getItem(ConfigService.CONFIG_KEY);
      if (fullConfig) {
        const parsed = JSON.parse(fullConfig);
        return { ...DEFAULT_CONFIG, ...parsed };
      }

      // Fallback to old credential format for backward compatibility
      const stored = localStorage.getItem(ConfigService.STORAGE_KEY);
      if (stored) {
        const credentials = JSON.parse(stored);
        return {
          ...DEFAULT_CONFIG,
          api: {
            ...DEFAULT_CONFIG.api,
            key: credentials.apiKey || '',
            userName: credentials.apiUserName || ''
          }
        };
      }
    } catch (error) {
      // Handle config load error silently
    }
    return { ...DEFAULT_CONFIG };
  }

  // Save configuration to localStorage (same pattern as react_ref)
  private saveConfig(): void {
    try {
      // Save full config to new key
      localStorage.setItem(ConfigService.CONFIG_KEY, JSON.stringify(this.config));

      // Also maintain backward compatibility with old format
      const credentials = {
        apiUserName: this.config.api.userName,
        apiKey: this.config.api.key
      };
      
      localStorage.setItem(ConfigService.STORAGE_KEY, JSON.stringify(credentials));
      this.notifyListeners();
    } catch (error) {
      // Handle save error silently
    }
  }

  // Get current configuration
  getConfig(): AppConfig {
    return { ...this.config };
  }

  // Update configuration
  updateConfig(updates: Partial<AppConfig>): void {
    this.config = { ...this.config, ...updates };
    this.saveConfig();
  }

  // Update API configuration
  updateApiConfig(apiConfig: Partial<AppConfig['api']>): void {
    this.config.api = { ...this.config.api, ...apiConfig };
    this.saveConfig();
  }

  // Update realtime configuration
  updateRealtimeConfig(realtimeConfig: Partial<AppConfig['realtime']>): void {
    this.config.realtime = { ...this.config.realtime, ...realtimeConfig };
    this.saveConfig();
  }

  // Update UI configuration
  updateUIConfig(uiConfig: Partial<AppConfig['ui']>): void {
    this.config.ui = { ...this.config.ui, ...uiConfig };
    this.saveConfig();
  }

  // Update calls configuration
  updateCallsConfig(callsConfig: Partial<AppConfig['calls']>): void {
    this.config.calls = { ...this.config.calls, ...callsConfig };
    this.saveConfig();
  }

  // Check if API is configured
  isApiConfigured(): boolean {
    return !!(this.config.api.key && this.config.api.userName && this.config.api.baseUrl);
  }

  // Get API credentials
  getApiCredentials() {
    return {
      apiKey: this.config.api.key,
      apiUserName: this.config.api.userName,
      baseUrl: this.config.api.baseUrl
    };
  }

  // Reset to defaults
  resetConfig(): void {
    this.config = { ...DEFAULT_CONFIG };
    this.saveConfig();
  }

  // Export configuration as JSON
  exportConfig(): string {
    return JSON.stringify(this.config, null, 2);
  }

  // Import configuration from JSON
  importConfig(configJson: string): boolean {
    try {
      const importedConfig = JSON.parse(configJson);
      // Validate the structure
      if (this.validateConfig(importedConfig)) {
        this.config = { ...DEFAULT_CONFIG, ...importedConfig };
        this.saveConfig();
        return true;
      }
      return false;
    } catch (error) {
      // Handle import error silently
      return false;
    }
  }

  // Validate configuration structure
  private validateConfig(config: any): boolean {
    // Basic validation - ensure required properties exist
    return (
      config &&
      typeof config === 'object' &&
      config.api &&
      config.realtime &&
      config.ui &&
      config.calls
    );
  }

  // Subscribe to configuration changes
  subscribe(listener: (config: AppConfig) => void): () => void {
    this.listeners.push(listener);
    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  // Notify all listeners of configuration changes
  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener(this.getConfig());
      } catch (error) {
        // Handle listener error silently
      }
    });
  }

  // Get theme
  getTheme(): 'light' | 'dark' {
    return this.config.ui.theme;
  }

  // Toggle theme
  toggleTheme(): void {
    this.config.ui.theme = this.config.ui.theme === 'light' ? 'dark' : 'light';
    this.saveConfig();
  }

  // Get realtime settings
  getRealtimeSettings() {
    return {
      enabled: this.config.realtime.enabled,
      interval: this.config.realtime.interval
    };
  }

  // Get call settings
  getCallSettings() {
    return {
      autoAnswer: this.config.calls.autoAnswer,
      recordCalls: this.config.calls.recordCalls,
      defaultRingTime: this.config.calls.defaultRingTime
    };
  }
}

export default ConfigService;
export const configService = new ConfigService();
