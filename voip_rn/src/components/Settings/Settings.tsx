import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Switch,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Dimensions,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Clipboard from '@react-native-clipboard/clipboard';
import { useVoipConfig } from '../../hooks/useVoipConfig';

interface TestResult {
  success: boolean;
  message: string;
}

export const Settings: React.FC = () => {
  const {
    config,
    updateApiConfig,
    updateRealtimeConfig,
    updateUIConfig,
    updateCallsConfig,
    resetConfig,
    isApiConfiguredSync,
    toggleTheme,
    exportConfig,
    importConfig,
  } = useVoipConfig();

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [configJson, setConfigJson] = useState('');

  // Get screen dimensions for responsive layout
  const [screenDimensions, setScreenDimensions] = useState(Dimensions.get('window'));

  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setScreenDimensions(window);
    });

    return () => subscription?.remove();
  }, []);

  // Determine if we should use desktop layout
  const isDesktop = screenDimensions.width >= 768;
  const isLargeDesktop = screenDimensions.width >= 1200;

  // Check if API is configured
  const apiConfigured = isApiConfiguredSync();

  // Form states
  const [apiSettings, setApiSettings] = useState({
    key: config.api.key,
    userName: config.api.userName,
    baseUrl: config.api.baseUrl,
  });

  const [realtimeSettings, setRealtimeSettings] = useState({
    enabled: config.realtime.enabled,
    interval: config.realtime.interval / 1000, // Convert to seconds for UI
  });

  const [uiSettings, setUiSettings] = useState({
    theme: config.ui.theme,
    compactMode: config.ui.compactMode,
  });

  const [callsSettings, setCallsSettings] = useState({
    autoAnswer: config.calls.autoAnswer,
    recordCalls: config.calls.recordCalls,
    defaultRingTime: config.calls.defaultRingTime,
  });

  // Update form states when config changes
  useEffect(() => {
    setApiSettings({
      key: config.api.key,
      userName: config.api.userName,
      baseUrl: config.api.baseUrl,
    });
    setRealtimeSettings({
      enabled: config.realtime.enabled,
      interval: config.realtime.interval / 1000,
    });
    setUiSettings({
      theme: config.ui.theme,
      compactMode: config.ui.compactMode,
    });
    setCallsSettings({
      autoAnswer: config.calls.autoAnswer,
      recordCalls: config.calls.recordCalls,
      defaultRingTime: config.calls.defaultRingTime,
    });
  }, [config]);

  // Save API settings
  const handleSaveApiSettings = () => {
    updateApiConfig(apiSettings);
    setSaveMessage('API settings saved successfully!');
    setTimeout(() => setSaveMessage(''), 3000);
  };

  // Save realtime settings
  const handleSaveRealtimeSettings = () => {
    updateRealtimeConfig({
      enabled: realtimeSettings.enabled,
      interval: realtimeSettings.interval * 1000, // Convert back to milliseconds
    });
    setSaveMessage('Realtime settings saved successfully!');
    setTimeout(() => setSaveMessage(''), 3000);
  };

  // Save UI settings
  const handleSaveUISettings = () => {
    updateUIConfig(uiSettings);
    setSaveMessage('UI settings saved successfully!');
    setTimeout(() => setSaveMessage(''), 3000);
  };

  // Save calls settings
  const handleSaveCallsSettings = () => {
    updateCallsConfig(callsSettings);
    setSaveMessage('Call settings saved successfully!');
    setTimeout(() => setSaveMessage(''), 3000);
  };

  // Copy API key to clipboard
  const handleCopyApiKey = async () => {
    try {
      Clipboard.setString(apiSettings.key);
      setSaveMessage('API Key copied to clipboard!');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (error) {
      setSaveMessage('Failed to copy API key');
      setTimeout(() => setSaveMessage(''), 3000);
    }
  };

  // Handle theme toggle
  const handleToggleTheme = async () => {
    try {
      await toggleTheme();
      setSaveMessage('Theme toggled successfully!');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (error) {
      setSaveMessage('Failed to toggle theme');
      setTimeout(() => setSaveMessage(''), 3000);
    }
  };

  // Export configuration
  const handleExportConfig = async () => {
    try {
      const configData = await exportConfig();
      setConfigJson(configData);
      setSaveMessage('Configuration exported! You can copy the JSON below.');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (error) {
      setSaveMessage('Failed to export configuration');
      setTimeout(() => setSaveMessage(''), 3000);
    }
  };

  // Import configuration
  const handleImportConfig = async () => {
    if (!configJson) {
      setSaveMessage('Please paste configuration JSON first');
      setTimeout(() => setSaveMessage(''), 3000);
      return;
    }

    try {
      const success = await importConfig(configJson);
      if (success) {
        setSaveMessage('Configuration imported successfully!');
        setTimeout(() => setSaveMessage(''), 3000);
      } else {
        setSaveMessage('Failed to import configuration. Please check the JSON format.');
        setTimeout(() => setSaveMessage(''), 3000);
      }
    } catch (error) {
      setSaveMessage('Failed to import configuration');
      setTimeout(() => setSaveMessage(''), 3000);
    }
  };

  // Test API connection
  const handleTestConnection = async () => {
    if (!apiSettings.key || !apiSettings.userName) {
      setTestResult({
        success: false,
        message: 'Please provide both API Key and Username',
      });
      return;
    }

    // Validate credentials format
    if (apiSettings.key.length !== 64) {
      setTestResult({
        success: false,
        message: 'Invalid API Key: Must be exactly 64 characters',
      });
      return;
    }

    if (!/^[a-zA-Z0-9]{6,}$/.test(apiSettings.userName)) {
      setTestResult({
        success: false,
        message: 'Invalid API Username: Must be alphanumeric and at least 6 characters',
      });
      return;
    }

    setTestResult({ success: true, message: 'Testing connection...' });
    setIsLoading(true);

    try {
      // Test the connection by trying to fetch SIP configs
      const response = await fetch('https://mediasfu.com/v1/sipconfigs/?action=get&startIndex=0&pageSize=10', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiSettings.userName}:${apiSettings.key}`,
        },
      });

      if (response.ok) {
        await response.json(); // Parse response to ensure it's valid JSON
        setTestResult({
          success: true,
          message: 'Connection test successful! API credentials are valid.',
        });
      } else if (response.status === 401) {
        setTestResult({
          success: false,
          message: 'Authentication failed: Invalid API credentials',
        });
      } else if (response.status === 403) {
        setTestResult({
          success: false,
          message: 'Access denied: Check your API permissions',
        });
      } else {
        setTestResult({
          success: false,
          message: `Connection failed: HTTP ${response.status}`,
        });
      }
    } catch (error) {
      setTestResult({
        success: false,
        message: 'Connection failed: Network error or invalid URL',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Reset to defaults
  const handleResetConfig = () => {
    Alert.alert(
      'Reset Settings',
      'Are you sure you want to reset all settings to defaults?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            resetConfig();
            setSaveMessage('Configuration reset to defaults!');
            setTimeout(() => setSaveMessage(''), 3000);
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.container, isDesktop && styles.desktopContainer]}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          isDesktop && styles.desktopScrollContent,
          isLargeDesktop && styles.largeDesktopScrollContent,
        ]}
      >

        {/* Header with Actions */}
        <View style={[styles.header, isDesktop && styles.desktopHeader]}>
          <View style={styles.headerMain}>
            <Text style={[styles.title, isDesktop && styles.desktopTitle]}>Settings</Text>
            <View style={styles.headerActions}>
              <TouchableOpacity
                style={[styles.headerButton, isDesktop && styles.desktopHeaderButton]}
                onPress={handleToggleTheme}
              >
                <Ionicons
                  name={config.ui.theme === 'light' ? 'moon' : 'sunny'}
                  size={18}
                  color="#667eea"
                />
                <Text style={styles.headerButtonText}>
                  {config.ui.theme === 'light' ? 'Dark' : 'Light'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.headerButton, styles.advancedButton, isDesktop && styles.desktopHeaderButton]}
                onPress={() => setShowAdvanced(!showAdvanced)}
              >
                <Ionicons name="settings" size={18} color="#667eea" />
                <Text style={styles.headerButtonText}>Advanced</Text>
              </TouchableOpacity>
            </View>
          </View>
          {saveMessage ? (
            <View style={[styles.saveMessageContainer, isDesktop && styles.desktopSaveMessage]}>
              <Ionicons name="checkmark-circle" size={16} color="#155724" />
              <Text style={styles.saveMessage}>{saveMessage}</Text>
            </View>
          ) : null}
        </View>

        {/* Settings Grid - Responsive Layout */}
        <View style={[
          styles.settingsGrid,
          isDesktop && styles.desktopGrid,
          isLargeDesktop && styles.largeDesktopGrid,
        ]}>

          {/* Left Column or Top Sections */}
          <View style={[styles.gridColumn, isDesktop && styles.leftColumn]}>

            {/* API Configuration Section */}
            <View style={[styles.section, isDesktop && styles.desktopSection]}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, isDesktop && styles.desktopSectionTitle]}>API Configuration</Text>
                <View style={[
                  styles.statusBadge,
                  apiConfigured ? styles.statusConfigured : styles.statusNotConfigured,
                ]}>
                  <Ionicons
                    name={apiConfigured ? 'checkmark-circle' : 'warning'}
                    size={14}
                    color={apiConfigured ? '#48bb78' : '#ed8936'}
                  />
                  <Text style={[
                    styles.statusText,
                    apiConfigured ? styles.statusConfiguredText : styles.statusNotConfiguredText,
                  ]}>
                    {apiConfigured ? 'Configured' : 'Not Configured'}
                  </Text>
                </View>
              </View>

            {/* API Configuration Section Content */}
            <Text style={styles.sectionDescription}>
              Configure your MediaSFU API credentials to enable voice calling features.
            </Text>

            {/* API Key with Actions */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>API Key *</Text>
              <View style={styles.inputWithActions}>
                <TextInput
                  style={[styles.input, styles.inputWithActionsField]}
                  value={apiSettings.key}
                  onChangeText={(text) => setApiSettings({ ...apiSettings, key: text })}
                  placeholder="Enter your 64-character API key"
                  secureTextEntry={!showApiKey}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <View style={styles.inputActions}>
                  <TouchableOpacity
                    style={styles.inputActionButton}
                    onPress={() => setShowApiKey(!showApiKey)}
                  >
                    <Ionicons
                      name={showApiKey ? 'eye-off' : 'eye'}
                      size={18}
                      color="#666"
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.inputActionButton}
                    onPress={handleCopyApiKey}
                    disabled={!apiSettings.key}
                  >
                    <Ionicons
                      name="copy"
                      size={18}
                      color={apiSettings.key ? '#666' : '#ccc'}
                    />
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={styles.helpText}>
                Your 64-character MediaSFU API key
              </Text>
            </View>

            {/* API Username */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>API Username *</Text>
              <TextInput
                style={styles.input}
                value={apiSettings.userName}
                onChangeText={(text) => setApiSettings({ ...apiSettings, userName: text })}
                placeholder="Enter your API username"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={styles.helpText}>
                Your MediaSFU API username (alphanumeric, 6+ characters)
              </Text>
            </View>

            {/* Base URL */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Base URL</Text>
              <TextInput
                style={styles.input}
                value={apiSettings.baseUrl}
                onChangeText={(text) => setApiSettings({ ...apiSettings, baseUrl: text })}
                placeholder="https://mediasfu.com"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
              <Text style={styles.helpText}>
                MediaSFU API base URL (leave default unless instructed otherwise)
              </Text>
            </View>

            {/* Special Note */}
            <View style={styles.specialNote}>
              <Text style={styles.specialNoteText}>
                <Text style={styles.boldText}>Important:</Text> Unless you are using a registered domain with MediaSFU, use the <Text style={styles.boldText}>sandbox key</Text>.
              </Text>
            </View>

            {/* Form Actions */}
            <View style={[styles.formActions, isDesktop && styles.desktopFormActions]}>
              <TouchableOpacity
                style={[styles.button, styles.primaryButton]}
                onPress={handleSaveApiSettings}
              >
                <Text style={styles.primaryButtonText}>Save API Settings</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.secondaryButton, isLoading && styles.disabledButton]}
                onPress={handleTestConnection}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="#667eea" />
                ) : (
                  <Text style={styles.secondaryButtonText}>Test Connection</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Test Result */}
            {testResult && (
              <View style={[
                styles.testResult,
                testResult.success ? styles.testSuccess : styles.testError,
              ]}>
                <Ionicons
                  name={testResult.success ? 'checkmark-circle' : 'alert-circle'}
                  size={16}
                  color={testResult.success ? '#28a745' : '#dc3545'}
                />
                <Text style={[
                  styles.testResultText,
                  testResult.success ? styles.testSuccessText : styles.testErrorText,
                ]}>
                  {testResult.message}
                </Text>
              </View>
            )}
            </View>

            {/* Real-time Updates Section */}
            <View style={[styles.section, isDesktop && styles.desktopSection]}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, isDesktop && styles.desktopSectionTitle]}>Real-time Updates</Text>
              </View>
              <Text style={styles.sectionDescription}>
                Configure automatic polling for live call updates.
              </Text>

              <View style={styles.switchContainer}>
                <Text style={styles.switchLabel}>Enable Live Updates</Text>
                <Switch
                  value={realtimeSettings.enabled}
                  onValueChange={(value) => setRealtimeSettings({ ...realtimeSettings, enabled: value })}
                  trackColor={{ false: '#ccc', true: '#007bff' }}
                  thumbColor={realtimeSettings.enabled ? '#fff' : '#fff'}
                />
              </View>

              {realtimeSettings.enabled && (
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Update Interval (seconds)</Text>
                  <TextInput
                    style={styles.input}
                    value={realtimeSettings.interval.toString()}
                    onChangeText={(text) => setRealtimeSettings({
                      ...realtimeSettings,
                      interval: Math.max(6, parseInt(text) || 6),
                    })}
                    placeholder="6"
                    keyboardType="numeric"
                  />
                  <Text style={styles.helpText}>
                    Minimum 6 seconds (API rate limit: 1 request per 5 seconds)
                  </Text>
                </View>
              )}

              <View style={[styles.formActions, isDesktop && styles.desktopFormActions]}>
                <TouchableOpacity
                  style={[styles.button, styles.primaryButton]}
                  onPress={handleSaveRealtimeSettings}
                >
                  <Text style={styles.primaryButtonText}>Save Realtime Settings</Text>
                </TouchableOpacity>
              </View>
            </View>

          </View>

          {/* Right Column or Bottom Sections */}
          <View style={[styles.gridColumn, isDesktop && styles.rightColumn]}>

            {/* UI Preferences Section */}
            <View style={[styles.section, isDesktop && styles.desktopSection]}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, isDesktop && styles.desktopSectionTitle]}>User Interface</Text>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Theme</Text>
                <View style={styles.themeSelector}>
                  <TouchableOpacity
                    style={[
                      styles.themeOption,
                      config.ui.theme === 'light' && styles.themeOptionActive,
                    ]}
                    onPress={() => config.ui.theme !== 'light' && handleToggleTheme()}
                  >
                    <Ionicons name="sunny" size={16} color={config.ui.theme === 'light' ? '#fff' : '#667eea'} />
                    <Text style={[
                      styles.themeOptionText,
                      config.ui.theme === 'light' && styles.themeOptionActiveText,
                    ]}>Light</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.themeOption,
                      config.ui.theme === 'dark' && styles.themeOptionActive,
                    ]}
                    onPress={() => config.ui.theme !== 'dark' && handleToggleTheme()}
                  >
                    <Ionicons name="moon" size={16} color={config.ui.theme === 'dark' ? '#fff' : '#667eea'} />
                    <Text style={[
                      styles.themeOptionText,
                      config.ui.theme === 'dark' && styles.themeOptionActiveText,
                    ]}>Dark</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.helpText}>
                  You may need to restart the app for theme changes to fully take effect.
                </Text>
              </View>

              <View style={styles.switchContainer}>
                <Text style={styles.switchLabel}>Compact Mode</Text>
                <Switch
                  value={uiSettings.compactMode}
                  onValueChange={(value) => setUiSettings({ ...uiSettings, compactMode: value })}
                  trackColor={{ false: '#ccc', true: '#007bff' }}
                  thumbColor={uiSettings.compactMode ? '#fff' : '#fff'}
                />
              </View>

              <View style={[styles.formActions, isDesktop && styles.desktopFormActions]}>
                <TouchableOpacity
                  style={[styles.button, styles.primaryButton]}
                  onPress={handleSaveUISettings}
                >
                  <Text style={styles.primaryButtonText}>Save UI Settings</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Call Settings Section */}
            <View style={[styles.section, isDesktop && styles.desktopSection]}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, isDesktop && styles.desktopSectionTitle]}>Call Settings</Text>
              </View>

              <View style={styles.switchContainer}>
                <Text style={styles.switchLabel}>Auto-answer calls</Text>
                <Switch
                  value={callsSettings.autoAnswer}
                  onValueChange={(value) => setCallsSettings({ ...callsSettings, autoAnswer: value })}
                  trackColor={{ false: '#ccc', true: '#007bff' }}
                  thumbColor={callsSettings.autoAnswer ? '#fff' : '#fff'}
                />
              </View>

              <View style={styles.switchContainer}>
                <Text style={styles.switchLabel}>Record calls</Text>
                <Switch
                  value={callsSettings.recordCalls}
                  onValueChange={(value) => setCallsSettings({ ...callsSettings, recordCalls: value })}
                  trackColor={{ false: '#ccc', true: '#007bff' }}
                  thumbColor={callsSettings.recordCalls ? '#fff' : '#fff'}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Default Ring Time (seconds)</Text>
                <TextInput
                  style={styles.input}
                  value={callsSettings.defaultRingTime.toString()}
                  onChangeText={(text) => setCallsSettings({
                    ...callsSettings,
                    defaultRingTime: Math.max(10, parseInt(text) || 30),
                  })}
                  placeholder="30"
                  keyboardType="numeric"
                />
                <Text style={styles.helpText}>
                  How long calls should ring before timing out
                </Text>
              </View>

              <View style={[styles.formActions, isDesktop && styles.desktopFormActions]}>
                <TouchableOpacity
                  style={[styles.button, styles.primaryButton]}
                  onPress={handleSaveCallsSettings}
                >
                  <Text style={styles.primaryButtonText}>Save Call Settings</Text>
                </TouchableOpacity>
              </View>
            </View>

          </View>

        </View>

        {/* Advanced Section Toggle */}
        <TouchableOpacity
          style={[styles.advancedToggle, isDesktop && styles.desktopAdvancedToggle]}
          onPress={() => setShowAdvanced(!showAdvanced)}
        >
          <Text style={styles.advancedToggleText}>Advanced Settings</Text>
          <Ionicons
            name={showAdvanced ? 'chevron-up' : 'chevron-down'}
            size={20}
            color="#007bff"
          />
        </TouchableOpacity>

        {/* Advanced Section - Full Width */}
        {showAdvanced && (
          <View style={[styles.section, styles.fullWidth, isDesktop && styles.desktopSection, isDesktop && styles.desktopAdvancedSection]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, isDesktop && styles.desktopSectionTitle]}>Advanced Configuration</Text>
              <TouchableOpacity
                style={[styles.button, styles.secondaryButton]}
                onPress={() => setShowAdvanced(false)}
              >
                <Text style={styles.secondaryButtonText}>Hide Advanced</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.sectionDescription}>
              Advanced settings and configuration management.
            </Text>

            {/* Current Configuration Status */}
            <View style={styles.statusContainer}>
              <Text style={styles.statusLabel}>Configuration Status:</Text>
              <View style={[
                styles.statusBadge,
                apiConfigured ? styles.statusConfigured : styles.statusNotConfigured,
              ]}>
                <Text style={[
                  styles.statusText,
                  apiConfigured ? styles.statusConfiguredText : styles.statusNotConfiguredText,
                ]}>
                  {apiConfigured ? 'Configured' : 'Not Configured'}
                </Text>
              </View>
            </View>

            {/* Import/Export Actions */}
            <View style={[styles.configActions, isDesktop && styles.desktopConfigActions]}>
              <TouchableOpacity
                style={[styles.button, styles.secondaryButton, isDesktop && styles.desktopConfigButton]}
                onPress={handleExportConfig}
              >
                <Ionicons name="download" size={16} color="#667eea" />
                <Text style={styles.secondaryButtonText}>Export Config</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.secondaryButton, isDesktop && styles.desktopConfigButton]}
                onPress={handleImportConfig}
              >
                <Ionicons name="cloud-upload" size={16} color="#667eea" />
                <Text style={styles.secondaryButtonText}>Import Config</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.warningButton, isDesktop && styles.desktopConfigButton]}
                onPress={handleResetConfig}
              >
                <Ionicons name="refresh" size={16} color="#ed8936" />
                <Text style={styles.warningButtonText}>Reset to Defaults</Text>
              </TouchableOpacity>
            </View>

            {/* Configuration JSON */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Configuration JSON</Text>
              <TextInput
                style={[styles.input, styles.configTextarea, isDesktop && styles.desktopConfigTextarea]}
                value={configJson}
                onChangeText={setConfigJson}
                placeholder="Paste configuration JSON here to import..."
                multiline={true}
                numberOfLines={isDesktop ? 12 : 8}
                textAlignVertical="top"
              />
              <Text style={styles.helpText}>
                Paste exported configuration JSON here and tap Import Config
              </Text>
            </View>

            {/* Current Configuration Display */}
            <View style={styles.currentConfig}>
              <Text style={styles.currentConfigTitle}>Current Configuration</Text>
              <View style={[styles.configDisplay, isDesktop && styles.desktopConfigDisplay]}>
                <Text style={styles.configText}>
                  {JSON.stringify(config, null, 2)}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Footer Spacing */}
        <View style={styles.footer} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  // Desktop responsive container
  desktopContainer: {
    maxWidth: 1200,
    alignSelf: 'center',
    width: '100%',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  desktopScrollContent: {
    paddingHorizontal: 32,
    paddingVertical: 24,
  },
  largeDesktopScrollContent: {
    paddingHorizontal: 48,
    paddingVertical: 32,
  },
  header: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  desktopHeader: {
    paddingHorizontal: 32,
    paddingVertical: 20,
  },
  headerMain: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  desktopHeaderActions: {
    gap: 12,
  },
  headerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f7fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 6,
  },
  desktopHeaderButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  advancedButton: {
    backgroundColor: '#fff',
  },
  headerButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#667eea',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#2d3748',
  },
  desktopTitle: {
    fontSize: 32,
  },
  saveMessageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#d4edda',
    borderColor: '#c3e6cb',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    gap: 8,
  },
  desktopSaveMessage: {
    marginTop: 16,
    padding: 16,
  },
  saveMessage: {
    color: '#155724',
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  settingsGrid: {
    padding: 16,
    gap: 16,
  },
  // Desktop grid layout
  desktopGrid: {
    flexDirection: 'row',
    gap: 24,
    alignItems: 'flex-start',
    padding: 24,
  },
  largeDesktopGrid: {
    gap: 32,
  },
  gridColumn: {
    flex: 1,
  },
  leftColumn: {
    flex: 1,
    maxWidth: '48%',
  },
  rightColumn: {
    flex: 1,
    maxWidth: '48%',
  },
  section: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  desktopSection: {
    padding: 24,
    marginBottom: 24,
  },
  desktopAdvancedSection: {
    marginTop: 24,
  },
  fullWidth: {
    // For sections that should span full width in grid
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#2d3748',
    flex: 1,
  },
  desktopSectionTitle: {
    fontSize: 22,
  },
  sectionDescription: {
    fontSize: 14,
    color: '#4a5568',
    marginBottom: 20,
    lineHeight: 20,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  statusConfigured: {
    backgroundColor: '#d4edda',
  },
  statusNotConfigured: {
    backgroundColor: '#f8d7da',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusConfiguredText: {
    color: '#48bb78',
  },
  statusNotConfiguredText: {
    color: '#ed8936',
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    color: '#2d3748',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    backgroundColor: '#fff',
    color: '#2d3748',
  },
  inputWithActions: {
    position: 'relative',
  },
  inputWithActionsField: {
    paddingRight: 90,
  },
  inputActions: {
    position: 'absolute',
    right: 8,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  inputActionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f7fafc',
  },
  helpText: {
    fontSize: 12,
    color: '#4a5568',
    marginTop: 6,
    lineHeight: 16,
  },
  specialNote: {
    backgroundColor: '#fff5f5',
    borderColor: '#fed7d7',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  specialNoteText: {
    fontSize: 14,
    color: '#2d3748',
    lineHeight: 20,
  },
  boldText: {
    fontWeight: '600',
  },
  formActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  desktopFormActions: {
    gap: 16,
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    flex: 1,
  },
  primaryButton: {
    backgroundColor: '#48bb78',
  },
  secondaryButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  warningButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#fed7d7',
  },
  disabledButton: {
    backgroundColor: '#a0aec0',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButtonText: {
    color: '#667eea',
    fontSize: 16,
    fontWeight: '600',
  },
  warningButtonText: {
    color: '#ed8936',
    fontSize: 16,
    fontWeight: '600',
  },
  testResult: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
    gap: 8,
  },
  testSuccess: {
    backgroundColor: '#d4edda',
    borderColor: '#c3e6cb',
    borderWidth: 1,
  },
  testError: {
    backgroundColor: '#f8d7da',
    borderColor: '#f5c6cb',
    borderWidth: 1,
  },
  testResultText: {
    fontSize: 14,
    flex: 1,
  },
  testSuccessText: {
    color: '#155724',
  },
  testErrorText: {
    color: '#721c24',
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    padding: 16,
    backgroundColor: '#f7fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  switchLabel: {
    fontSize: 16,
    color: '#2d3748',
    flex: 1,
  },
  themeSelector: {
    flexDirection: 'row',
    gap: 8,
  },
  themeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
    gap: 8,
    flex: 1,
    justifyContent: 'center',
  },
  themeOptionActive: {
    backgroundColor: '#667eea',
    borderColor: '#667eea',
  },
  themeOptionText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#667eea',
  },
  themeOptionActiveText: {
    color: '#fff',
  },
  advancedToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    marginHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  desktopAdvancedToggle: {
    marginHorizontal: 0,
    marginBottom: 16,
    padding: 20,
  },
  advancedToggleText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#667eea',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    padding: 16,
    backgroundColor: '#f7fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 12,
  },
  statusLabel: {
    fontSize: 16,
    color: '#2d3748',
  },
  configActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  desktopConfigActions: {
    gap: 12,
  },
  desktopConfigButton: {
    minWidth: 140,
    justifyContent: 'center',
  },
  configTextarea: {
    height: 120,
    textAlignVertical: 'top',
  },
  desktopConfigTextarea: {
    height: 180,
  },
  currentConfig: {
    marginTop: 20,
  },
  currentConfigTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2d3748',
    marginBottom: 12,
  },
  configDisplay: {
    backgroundColor: '#f7fafc',
    borderColor: '#e2e8f0',
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    maxHeight: 300,
  },
  desktopConfigDisplay: {
    maxHeight: 400,
    padding: 20,
  },
  configText: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#2d3748',
    lineHeight: 16,
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderColor: '#f56565',
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    gap: 8,
  },
  resetButtonText: {
    color: '#f56565',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    height: 40,
  },
});
