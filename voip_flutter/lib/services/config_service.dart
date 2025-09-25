// Config service - Dart equivalent of TypeScript configService.ts
import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import '../types/config_types.dart';
import '../utils/logger.dart';

class ConfigService {
  static const String _configKey = 'voip_app_config';
  static const String _credentialsKey = 'mediaSFUCredentials';

  /// Load app configuration from SharedPreferences
  Future<AppConfig> loadConfig() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final configJson = prefs.getString(_configKey);

      if (configJson != null) {
        final configMap = jsonDecode(configJson) as Map<String, dynamic>;
        return AppConfig.fromJson(configMap);
      }

      // Return default config if no saved config exists
      return defaultConfig;
    } catch (error) {
      Logger.error('Error loading config: $error');
      return defaultConfig;
    }
  }

  /// Save app configuration to SharedPreferences
  Future<bool> saveConfig(AppConfig config) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final configJson = jsonEncode(config.toJson());
      await prefs.setString(_configKey, configJson);

      // Also save MediaSFU credentials in the expected format
      final credentialsMap = {
        'apiUserName': config.api.userName,
        'apiKey': config.api.key,
      };
      await prefs.setString(_credentialsKey, jsonEncode(credentialsMap));

      // ALSO save individual credentials for MediaSFU handler compatibility
      await prefs.setString('mediasfu_api_username', config.api.userName);
      await prefs.setString('mediasfu_api_key', config.api.key);

      return true;
    } catch (error) {
      Logger.error('Error saving config: $error');
      return false;
    }
  }

  /// Get MediaSFU credentials from configuration
  Future<Map<String, String>?> getCredentials() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final credentialsJson = prefs.getString(_credentialsKey);

      if (credentialsJson != null) {
        final credentials = jsonDecode(credentialsJson) as Map<String, dynamic>;
        final apiUserName = credentials['apiUserName'] as String?;
        final apiKey = credentials['apiKey'] as String?;

        if (apiUserName != null &&
            apiKey != null &&
            apiUserName.isNotEmpty &&
            apiKey.isNotEmpty) {
          return {
            'apiUserName': apiUserName,
            'apiKey': apiKey,
          };
        }
      }
    } catch (error) {
      Logger.error('Error getting credentials: $error');
    }

    return null;
  }

  /// Check if API is properly configured
  Future<bool> isApiConfigured() async {
    final credentials = await getCredentials();
    if (credentials == null) return false;

    final apiUserName = credentials['apiUserName'];
    final apiKey = credentials['apiKey'];

    // Check if credentials meet the validation requirements
    return apiUserName != null &&
        apiKey != null &&
        apiUserName.length >= 6 &&
        apiKey.length == 64 &&
        RegExp(r'^[a-zA-Z0-9]+$').hasMatch(apiUserName) &&
        RegExp(r'^[a-fA-F0-9]{64}$').hasMatch(apiKey);
  }

  /// Update API configuration
  Future<bool> updateApiConfig({
    required String apiKey,
    required String apiUserName,
    String? baseUrl,
  }) async {
    try {
      final currentConfig = await loadConfig();
      final updatedConfig = currentConfig.copyWith(
        api: currentConfig.api.copyWith(
          key: apiKey,
          userName: apiUserName,
          baseUrl: baseUrl ?? currentConfig.api.baseUrl,
        ),
      );

      return await saveConfig(updatedConfig);
    } catch (error) {
      Logger.error('Error updating API config: $error');
      return false;
    }
  }

  /// Update realtime configuration
  Future<bool> updateRealtimeConfig({
    bool? enabled,
    int? interval,
  }) async {
    try {
      final currentConfig = await loadConfig();
      final updatedConfig = currentConfig.copyWith(
        realtime: currentConfig.realtime.copyWith(
          enabled: enabled ?? currentConfig.realtime.enabled,
          interval: interval ?? currentConfig.realtime.interval,
        ),
      );

      return await saveConfig(updatedConfig);
    } catch (error) {
      Logger.error('Error updating realtime config: $error');
      return false;
    }
  }

  /// Update UI configuration
  Future<bool> updateUiConfig({
    AppTheme? theme,
    bool? compactMode,
  }) async {
    try {
      final currentConfig = await loadConfig();
      final updatedConfig = currentConfig.copyWith(
        ui: currentConfig.ui.copyWith(
          theme: theme ?? currentConfig.ui.theme,
          compactMode: compactMode ?? currentConfig.ui.compactMode,
        ),
      );

      return await saveConfig(updatedConfig);
    } catch (error) {
      Logger.error('Error updating UI config: $error');
      return false;
    }
  }

  /// Update calls configuration
  Future<bool> updateCallsConfig({
    bool? autoAnswer,
    bool? recordCalls,
    int? defaultRingTime,
  }) async {
    try {
      final currentConfig = await loadConfig();
      final updatedConfig = currentConfig.copyWith(
        calls: currentConfig.calls.copyWith(
          autoAnswer: autoAnswer ?? currentConfig.calls.autoAnswer,
          recordCalls: recordCalls ?? currentConfig.calls.recordCalls,
          defaultRingTime:
              defaultRingTime ?? currentConfig.calls.defaultRingTime,
        ),
      );

      return await saveConfig(updatedConfig);
    } catch (error) {
      Logger.error('Error updating calls config: $error');
      return false;
    }
  }

  /// Export configuration as JSON string
  Future<String?> exportConfig() async {
    try {
      final config = await loadConfig();
      return jsonEncode(config.toJson());
    } catch (error) {
      Logger.error('Error exporting config: $error');
      return null;
    }
  }

  /// Import configuration from JSON string
  Future<bool> importConfig(String configJson) async {
    try {
      final configMap = jsonDecode(configJson) as Map<String, dynamic>;
      final config = AppConfig.fromJson(configMap);
      return await saveConfig(config);
    } catch (error) {
      Logger.error('Error importing config: $error');
      return false;
    }
  }

  /// Reset configuration to defaults
  Future<bool> resetConfig() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_configKey);
      await prefs.remove(_credentialsKey);
      return true;
    } catch (error) {
      Logger.error('Error resetting config: $error');
      return false;
    }
  }

  /// Validate API credentials format
  bool validateCredentials(String apiUserName, String apiKey) {
    // API Username validation: alphanumeric, at least 6 characters
    if (apiUserName.length < 6 ||
        !RegExp(r'^[a-zA-Z0-9]+$').hasMatch(apiUserName)) {
      return false;
    }

    // API Key validation: exactly 64 hexadecimal characters
    if (apiKey.length != 64 || !RegExp(r'^[a-fA-F0-9]{64}$').hasMatch(apiKey)) {
      return false;
    }

    return true;
  }

  /// Get current theme
  Future<AppTheme> getCurrentTheme() async {
    final config = await loadConfig();
    return config.ui.theme;
  }

  /// Toggle theme between light and dark
  Future<AppTheme> toggleTheme() async {
    final currentConfig = await loadConfig();
    final newTheme = currentConfig.ui.theme == AppTheme.light
        ? AppTheme.dark
        : AppTheme.light;

    await updateUiConfig(theme: newTheme);
    return newTheme;
  }

  /// Get live updates configuration
  Future<RealtimeConfig> getRealtimeConfig() async {
    final config = await loadConfig();
    return config.realtime;
  }

  /// Get calls configuration
  Future<CallsConfig> getCallsConfig() async {
    final config = await loadConfig();
    return config.calls;
  }
}
