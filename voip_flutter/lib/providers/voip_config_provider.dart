// VoIP Configuration Provider - Flutter equivalent of VoipConfigContext
import 'package:flutter/foundation.dart';
import 'dart:convert';
import 'package:http/http.dart' as http;
import '../types/config_types.dart';
import '../types/sip_config_types.dart';
import '../services/config_service.dart';

class VoipConfigProvider extends ChangeNotifier {
  final ConfigService _configService = ConfigService();

  AppConfig _config = defaultConfig;
  SIPConfig? _sipConfig;
  bool _isLoading = false;
  String? _error;
  bool _hasApiCredentials = false;
  bool _isInitialized = false; // Add initialization flag

  // Getters
  AppConfig get config => _config;
  SIPConfig? get sipConfig => _sipConfig;
  bool get isLoading => _isLoading;
  String? get error => _error;
  bool get hasApiCredentials => _hasApiCredentials;

  // Computed getters
  bool get isDarkMode => _config.ui.theme == AppTheme.dark;
  bool get isConfigured => _hasApiCredentials && _sipConfig != null;
  String get themeDisplayName =>
      _config.ui.theme == AppTheme.dark ? 'Dark' : 'Light';

  /// Initialize provider by loading saved configuration
  Future<void> initialize() async {
    // Prevent multiple initializations
    if (_isInitialized) return;

    try {
      _isLoading = true;
      _error = null;

      // Load saved configuration
      _config = await _configService.loadConfig();

      // Check for API credentials
      await _checkApiCredentials();

      // Load SIP configuration if available
      if (_hasApiCredentials) {
        await loadSipConfig();
        return; // loadSipConfig already calls notifyListeners
      }

      _isInitialized = true;
      notifyListeners();
    } catch (e) {
      _error = 'Failed to initialize configuration: $e';
      notifyListeners();
    } finally {
      _isLoading = false;
    }
  }

  /// Update configuration
  Future<void> updateConfig(AppConfig newConfig) async {
    try {
      _setLoading(true);
      _clearError();

      await _configService.saveConfig(newConfig);
      _config = newConfig;

      notifyListeners();
    } catch (e) {
      _setError('Failed to update configuration: $e');
    } finally {
      _setLoading(false);
    }
  }

  /// Set MediaSFU API credentials
  Future<void> setApiCredentials(String apiUserName, String apiKey) async {
    try {
      _setLoading(true);
      _clearError();

      // Update API configuration using the service's updateApiConfig method
      await _configService.updateApiConfig(
        apiKey: apiKey,
        apiUserName: apiUserName,
      );

      // Reload configuration
      _config = await _configService.loadConfig();
      await _checkApiCredentials();

      // Load SIP config with new credentials
      if (_hasApiCredentials) {
        await loadSipConfig();
      }
    } catch (e) {
      _setError('Failed to set API credentials: $e');
    } finally {
      _setLoading(false);
    }
  }

  /// Clear API credentials
  Future<void> clearApiCredentials() async {
    try {
      _setLoading(true);
      _clearError();

      // Clear credentials by setting empty values
      await _configService.updateApiConfig(
        apiKey: '',
        apiUserName: '',
      );

      // Reload configuration
      _config = await _configService.loadConfig();
      _sipConfig = null;
      _hasApiCredentials = false;

      notifyListeners();
    } catch (e) {
      _setError('Failed to clear API credentials: $e');
    } finally {
      _setLoading(false);
    }
  }

  /// Load SIP configuration from API
  Future<void> loadSipConfig() async {
    if (!_hasApiCredentials) {
      _error = 'API credentials required';
      notifyListeners();
      return;
    }

    try {
      _isLoading = true;
      _error = null;

      // Make direct HTTP request to MediaSFU API (matching ReactJS implementation)
      final uri = Uri.parse('https://mediasfu.com/v1/sipconfigs/').replace(
        queryParameters: {
          'action': 'get',
          'startIndex': '0',
          'pageSize': '20',
        },
      );

      final response = await http.get(
        uri,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ${_config.api.userName}:${_config.api.key}',
        },
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body) as Map<String, dynamic>;
        if (data['sipConfigs'] != null && data['sipConfigs'] is List) {
          final sipConfigs = data['sipConfigs'] as List;
          if (sipConfigs.isNotEmpty) {
            // Take the first available SIP config
            _sipConfig =
                SIPConfig.fromJson(sipConfigs.first as Map<String, dynamic>);
          }
        } else {
          _error = 'No SIP configurations found';
        }
      } else if (response.statusCode == 401) {
        _error = 'Authentication failed: Invalid API credentials';
      } else if (response.statusCode == 403) {
        _error = 'Access denied: Check your API permissions';
      } else {
        _error =
            'Failed to load SIP configuration: HTTP ${response.statusCode}';
      }

      _isInitialized = true;
      notifyListeners();
    } catch (e) {
      _error = 'Failed to load SIP configuration: $e';
      notifyListeners();
    } finally {
      _isLoading = false;
    }
  }

  /// Toggle theme between light and dark
  Future<void> toggleTheme() async {
    final newTheme =
        _config.ui.theme == AppTheme.light ? AppTheme.dark : AppTheme.light;

    await _configService.updateUiConfig(theme: newTheme);
    _config = await _configService.loadConfig();
    notifyListeners();
  }

  /// Set specific theme
  Future<void> setTheme(AppTheme theme) async {
    if (_config.ui.theme != theme) {
      await _configService.updateUiConfig(theme: theme);
      _config = await _configService.loadConfig();
      notifyListeners();
    }
  }

  /// Update realtime interval
  Future<void> setRealtimeInterval(int milliseconds) async {
    if (milliseconds < 1000 || milliseconds > 60000) {
      _setError('Realtime interval must be between 1 and 60 seconds');
      return;
    }

    await _configService.updateRealtimeConfig(interval: milliseconds);
    _config = await _configService.loadConfig();
    notifyListeners();
  }

  /// Enable/disable realtime updates
  Future<void> setRealtimeEnabled(bool enabled) async {
    await _configService.updateRealtimeConfig(enabled: enabled);
    _config = await _configService.loadConfig();
    notifyListeners();
  }

  /// Export configuration to JSON
  Future<String> exportConfig() async {
    try {
      final exported = await _configService.exportConfig();
      return exported ?? '';
    } catch (e) {
      _setError('Failed to export configuration: $e');
      rethrow;
    }
  }

  /// Import configuration from JSON
  Future<void> importConfig(String configJson) async {
    try {
      _setLoading(true);
      _clearError();

      // Parse and validate the JSON
      final result = await _configService.importConfig(configJson);
      if (result) {
        // Reload configuration
        _config = await _configService.loadConfig();

        // Recheck credentials and reload SIP config
        await _checkApiCredentials();
        if (_hasApiCredentials) {
          await loadSipConfig();
        }

        notifyListeners();
      } else {
        _setError('Failed to import configuration: Invalid format');
      }
    } catch (e) {
      _setError('Failed to import configuration: $e');
    } finally {
      _setLoading(false);
    }
  }

  /// Reset configuration to defaults
  Future<void> resetToDefaults() async {
    try {
      _setLoading(true);
      _clearError();

      // Save default configuration
      await _configService.saveConfig(defaultConfig);
      _config = defaultConfig;
      _sipConfig = null;
      _hasApiCredentials = false;

      notifyListeners();
    } catch (e) {
      _setError('Failed to reset configuration: $e');
    } finally {
      _setLoading(false);
    }
  }

  /// Validate current configuration
  Future<bool> validateConfiguration() async {
    try {
      _clearError();

      // Check if API is configured
      final isConfigured = await _configService.isApiConfigured();
      if (!isConfigured) {
        _setError('MediaSFU API credentials are not properly configured');
        return false;
      }

      // Check SIP configuration
      if (_sipConfig == null) {
        _setError('SIP configuration not loaded');
        return false;
      }

      return true;
    } catch (e) {
      _setError('Configuration validation failed: $e');
      return false;
    }
  }

  /// Check if API credentials are available and valid
  Future<void> _checkApiCredentials() async {
    _hasApiCredentials = await _configService.isApiConfigured();
  }

  /// Set loading state
  void _setLoading(bool loading) {
    _isLoading = loading;
    notifyListeners();
  }

  /// Set error message
  void _setError(String message) {
    _error = message;
    notifyListeners();
  }

  /// Clear error message
  void _clearError() {
    _error = null;
    notifyListeners();
  }
}
