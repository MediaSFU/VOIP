import { storage } from '../utils/storage';
import { AppConfig, DEFAULT_CONFIG } from '../types';
import { apiLogger } from '../utils/logger';

export class ConfigService {
  private static readonly STORAGE_KEY = 'mediaSFUCredentials'; // Same key as react_ref
  private static readonly CONFIG_KEY = 'voipAppConfig'; // New key for full config
  private config: AppConfig;
  private listeners: ((config: AppConfig) => void)[] = [];
  private initialized = false;

  constructor() {
    this.config = { ...DEFAULT_CONFIG };
    this.init();
  }

  // Initialize by loading config asynchronously
  private async init(): Promise<void> {
    if (this.initialized) return;
    this.config = await this.loadConfig();
    this.initialized = true;
    this.notifyListeners();
  }

  // Ensure initialization before operations
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }
  }

  // Load configuration from AsyncStorage (adapted from localStorage)
  private async loadConfig(): Promise<AppConfig> {
    try {
      // First try to load full config
      const fullConfig = await storage.getItem(ConfigService.CONFIG_KEY);
      if (fullConfig) {
        const parsed = JSON.parse(fullConfig);
        return { ...DEFAULT_CONFIG, ...parsed };
      }

      // Fallback to old credential format for backward compatibility
      const stored = await storage.getItem(ConfigService.STORAGE_KEY);
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
        apiLogger.warn('Failed to load config:', error);
    }
    return { ...DEFAULT_CONFIG };
  }

  // Save configuration to AsyncStorage (adapted from localStorage)
  private async saveConfig(): Promise<void> {
    try {
      // Save full config to new key
      await storage.setItem(ConfigService.CONFIG_KEY, JSON.stringify(this.config));

      // Also maintain backward compatibility with old format
      const credentials = {
        apiUserName: this.config.api.userName,
        apiKey: this.config.api.key
      };
      
      await storage.setItem(ConfigService.STORAGE_KEY, JSON.stringify(credentials));
      this.notifyListeners();
    } catch (error) {
      // Handle save error silently
        apiLogger.warn('Failed to save config:', error);
    }
  }

  // Get current configuration
  async getConfig(): Promise<AppConfig> {
    await this.ensureInitialized();
    return { ...this.config };
  }

  // Get current configuration synchronously (for components that need immediate access)
  getConfigSync(): AppConfig {
    return { ...this.config };
  }

  // Update configuration
  async updateConfig(updates: Partial<AppConfig>): Promise<void> {
    await this.ensureInitialized();
    this.config = { ...this.config, ...updates };
    await this.saveConfig();
  }

  // Update API configuration
  async updateApiConfig(apiConfig: Partial<AppConfig['api']>): Promise<void> {
    await this.ensureInitialized();
    this.config.api = { ...this.config.api, ...apiConfig };
    await this.saveConfig();
  }

  // Update realtime configuration
  async updateRealtimeConfig(realtimeConfig: Partial<AppConfig['realtime']>): Promise<void> {
    await this.ensureInitialized();
    this.config.realtime = { ...this.config.realtime, ...realtimeConfig };
    await this.saveConfig();
  }

  // Update UI configuration
  async updateUIConfig(uiConfig: Partial<AppConfig['ui']>): Promise<void> {
    await this.ensureInitialized();
    this.config.ui = { ...this.config.ui, ...uiConfig };
    await this.saveConfig();
  }

  // Update calls configuration
  async updateCallsConfig(callsConfig: Partial<AppConfig['calls']>): Promise<void> {
    await this.ensureInitialized();
    this.config.calls = { ...this.config.calls, ...callsConfig };
    await this.saveConfig();
  }

  // Check if API is configured
  async isApiConfigured(): Promise<boolean> {
    await this.ensureInitialized();
    return !!(this.config.api.key && this.config.api.userName && this.config.api.baseUrl);
  }

  // Check if API is configured synchronously
  isApiConfiguredSync(): boolean {
    return !!(this.config.api.key && this.config.api.userName && this.config.api.baseUrl);
  }

  // Get API credentials
  async getApiCredentials() {
    await this.ensureInitialized();
    return {
      apiKey: this.config.api.key,
      apiUserName: this.config.api.userName,
      baseUrl: this.config.api.baseUrl
    };
  }

  // Reset to defaults
  async resetConfig(): Promise<void> {
    this.config = { ...DEFAULT_CONFIG };
    await this.saveConfig();
  }

  // Export configuration as JSON
  async exportConfig(): Promise<string> {
    await this.ensureInitialized();
    return JSON.stringify(this.config, null, 2);
  }

  // Import configuration from JSON
  async importConfig(configJson: string): Promise<boolean> {
    try {
      const importedConfig = JSON.parse(configJson);
      // Validate the structure
      if (this.validateConfig(importedConfig)) {
        this.config = { ...DEFAULT_CONFIG, ...importedConfig };
        await this.saveConfig();
        return true;
      }
      return false;
    } catch (error) {
      // Handle import error silently
      apiLogger.warn('Failed to import config:', error);
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
        listener(this.getConfigSync());
      } catch (error) {
        // Handle listener error silently
          apiLogger.warn('Config listener error:', error);
      }
    });
  }

  // Get theme
  async getTheme(): Promise<'light' | 'dark'> {
    await this.ensureInitialized();
    return this.config.ui.theme;
  }

  // Toggle theme
  async toggleTheme(): Promise<void> {
    await this.ensureInitialized();
    this.config.ui.theme = this.config.ui.theme === 'light' ? 'dark' : 'light';
    await this.saveConfig();
  }

  // Get realtime settings
  async getRealtimeSettings() {
    await this.ensureInitialized();
    return {
      enabled: this.config.realtime.enabled,
      interval: this.config.realtime.interval
    };
  }

  // Get call settings
  async getCallSettings() {
    await this.ensureInitialized();
    return {
      autoAnswer: this.config.calls.autoAnswer,
      recordCalls: this.config.calls.recordCalls,
      defaultRingTime: this.config.calls.defaultRingTime
    };
  }

  // Reset configuration to defaults
  async resetToDefaults(): Promise<void> {
    this.config = { ...DEFAULT_CONFIG };
    await this.saveConfig();
    this.notifyListeners();
  }
}

export default ConfigService;
export const configService = new ConfigService();