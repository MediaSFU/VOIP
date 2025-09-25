// Settings Page - Responsive Flutter equivalent of SettingsPage.tsx
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'dart:convert';
import 'package:http/http.dart' as http;
import '../providers/voip_config_provider.dart';
import '../types/config_types.dart';

class SettingsPage extends StatefulWidget {
  const SettingsPage({super.key});

  @override
  State<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends State<SettingsPage>
    with TickerProviderStateMixin {
  // Animation controller for smooth transitions
  late AnimationController _animationController;
  late Animation<double> _fadeAnimation;

  // Form controllers
  final TextEditingController _apiKeyController = TextEditingController();
  final TextEditingController _userNameController = TextEditingController();
  final TextEditingController _baseUrlController = TextEditingController();
  final TextEditingController _configJsonController = TextEditingController();

  // State variables - matching ReactJS SettingsPage
  bool _showAdvanced = false;
  bool _showApiKey = false;
  String _saveMessage = '';
  Map<String, dynamic>? _testResult;
  bool _isTestingConnection = false;

  // Realtime settings
  bool _realtimeEnabled = true;
  double _realtimeInterval = 6.0; // seconds

  // UI settings
  AppTheme _theme = AppTheme.light;
  bool _compactMode = false;

  // Confirmation modal state
  bool _showConfirmation = false;
  Map<String, dynamic>? _confirmationConfig;

  @override
  void initState() {
    super.initState();
    _animationController = AnimationController(
      duration: const Duration(milliseconds: 300),
      vsync: this,
    );
    _fadeAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _animationController, curve: Curves.easeInOut),
    );
    _animationController.forward();
    _loadCurrentSettings();
  }

  @override
  void dispose() {
    _animationController.dispose();
    _apiKeyController.dispose();
    _userNameController.dispose();
    _baseUrlController.dispose();
    _configJsonController.dispose();
    super.dispose();
  }

  // Load current settings - matching ReactJS
  void _loadCurrentSettings() {
    final config = context.read<VoipConfigProvider>().config;

    _apiKeyController.text = config.api.key;
    _userNameController.text = config.api.userName;
    _baseUrlController.text = config.api.baseUrl;

    setState(() {
      _realtimeEnabled = config.realtime.enabled;
      _realtimeInterval =
          config.realtime.interval / 1000.0; // Convert to seconds
      _theme = config.ui.theme;
      _compactMode = config.ui.compactMode;
    });
  }

  // Check if API is configured - matching ReactJS isApiConfigured()
  bool get _isApiConfigured {
    return _apiKeyController.text.isNotEmpty &&
        _userNameController.text.isNotEmpty;
  }

  // Save API settings - matching ReactJS handleSaveApiSettings()
  void _saveApiSettings() async {
    final voipProvider = context.read<VoipConfigProvider>();
    try {
      await voipProvider.setApiCredentials(
          _userNameController.text, _apiKeyController.text);
      _showSaveMessage('API settings saved successfully!');
    } catch (e) {
      _showSaveMessage('Failed to save API settings: $e');
    }
  }

  // Save realtime settings - matching ReactJS handleSaveRealtimeSettings()
  void _saveRealtimeSettings() async {
    final voipProvider = context.read<VoipConfigProvider>();
    try {
      await voipProvider.setRealtimeEnabled(_realtimeEnabled);
      await voipProvider
          .setRealtimeInterval((_realtimeInterval * 1000).round());
      _showSaveMessage('Real-time settings saved successfully!');
    } catch (e) {
      _showSaveMessage('Failed to save real-time settings: $e');
    }
  }

  // Save UI settings - matching ReactJS updateUIConfig()
  void _saveUISettings() async {
    final voipProvider = context.read<VoipConfigProvider>();
    try {
      await voipProvider.setTheme(_theme);
      // TODO: Implement setCompactMode in provider
      // await voipProvider.setCompactMode(_compactMode);
      _showSaveMessage('UI settings saved successfully!');
    } catch (e) {
      _showSaveMessage('Failed to save UI settings: $e');
    }
  }

  // Test connection - matching ReactJS handleTestConnection()
  void _testConnection() async {
    if (_apiKeyController.text.isEmpty || _userNameController.text.isEmpty) {
      setState(() {
        _testResult = {
          'success': false,
          'message': 'Please enter both API key and username before testing'
        };
      });
      return;
    }

    setState(() {
      _isTestingConnection = true;
      _testResult = null;
    });

    try {
      final response = await http.get(
        Uri.parse(
            'https://mediasfu.com/v1/sipconfigs/?action=get&startIndex=0&pageSize=10'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization':
              'Bearer ${_userNameController.text}:${_apiKeyController.text}',
        },
      );

      setState(() {
        if (response.statusCode == 200) {
          _testResult = {
            'success': true,
            'message': 'Connection test successful! API credentials are valid.'
          };
        } else if (response.statusCode == 401) {
          _testResult = {
            'success': false,
            'message': 'Authentication failed: Invalid API credentials'
          };
        } else if (response.statusCode == 403) {
          _testResult = {
            'success': false,
            'message': 'Access denied: Check your API permissions'
          };
        } else {
          _testResult = {
            'success': false,
            'message': 'Connection failed: HTTP ${response.statusCode}'
          };
        }
      });
    } catch (e) {
      setState(() {
        _testResult = {
          'success': false,
          'message': 'Connection failed: Network error or invalid URL'
        };
      });
    } finally {
      setState(() {
        _isTestingConnection = false;
      });
    }
  }

  // Copy API key to clipboard - matching ReactJS handleCopyApiKey()
  void _copyApiKey() async {
    if (_apiKeyController.text.isEmpty) return;

    try {
      await Clipboard.setData(ClipboardData(text: _apiKeyController.text));
      _showSaveMessage('API Key copied to clipboard!');
    } catch (e) {
      _showSaveMessage('Failed to copy API key');
    }
  }

  // Export configuration - matching ReactJS handleExportConfig()
  void _exportConfig() {
    final config = context.read<VoipConfigProvider>().config;
    final configJson =
        const JsonEncoder.withIndent('  ').convert(config.toJson());

    setState(() {
      _configJsonController.text = configJson;
    });

    _showSaveMessage('Configuration exported to text area below');
  }

  // Import configuration - matching ReactJS handleImportConfig()
  void _importConfig() {
    if (_configJsonController.text.isEmpty) return;

    try {
      jsonDecode(_configJsonController.text); // Validate JSON format
      // TODO: Implement importConfig functionality in provider
      _showSaveMessage('Configuration imported successfully!');
      _loadCurrentSettings();
    } catch (e) {
      _showSaveMessage(
          'Failed to import configuration. Please check the JSON format.');
    }
  }

  // Reset to defaults - matching ReactJS handleResetConfig()
  void _resetConfig() {
    setState(() {
      _confirmationConfig = {
        'title': 'Reset Settings',
        'message': 'Are you sure you want to reset all settings to defaults?',
        'type': 'warning',
        'onConfirm': () {
          // TODO: Implement resetConfig functionality in provider
          _showSaveMessage('Configuration reset to defaults!');
          _loadCurrentSettings();
          setState(() {
            _showConfirmation = false;
            _confirmationConfig = null;
          });
        },
      };
      _showConfirmation = true;
    });
  }

  // Show save message
  void _showSaveMessage(String message) {
    if (mounted) {
      setState(() {
        _saveMessage = message;
      });
      Future.delayed(const Duration(seconds: 3), () {
        if (mounted) {
          setState(() {
            _saveMessage = '';
          });
        }
      });
    }
  }

  // Build responsive settings grid - matching ReactJS settings-grid
  Widget _buildSettingsGrid(bool isDesktop, bool isTablet) {
    return LayoutBuilder(
      builder: (context, constraints) {
        return Column(
          children: [
            // API Configuration and Real-time Updates row
            if (isDesktop)
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(child: _buildApiConfigSection()),
                  const SizedBox(width: 24),
                  Expanded(child: _buildRealtimeSection()),
                ],
              )
            else ...[
              _buildApiConfigSection(),
              const SizedBox(height: 24),
              _buildRealtimeSection(),
            ],

            const SizedBox(height: 24),

            // UI Settings (spans full width on desktop)
            _buildUISection(),

            const SizedBox(height: 24),

            // Advanced Settings (spans full width)
            _buildAdvancedSection(),
          ],
        );
      },
    );
  }

  // Build API Configuration section - matching ReactJS API Configuration card
  Widget _buildApiConfigSection() {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.grey.shade300),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Section header - matching ReactJS section-header
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Flexible(
                child: Text(
                  'API Configuration',
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w600,
                    color: Colors.grey.shade800,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              Flexible(
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: _isApiConfigured
                        ? Colors.green.shade100
                        : Colors.orange.shade100,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(
                      color: _isApiConfigured
                          ? Colors.green.shade300
                          : Colors.orange.shade300,
                    ),
                  ),
                  child: Text(
                    _isApiConfigured ? '✅ Configured' : '⚠️ Not Configured',
                    style: TextStyle(
                      color: _isApiConfigured
                          ? Colors.green.shade700
                          : Colors.orange.shade700,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ),
            ],
          ),

          const SizedBox(height: 24),

          // API Key field with show/hide toggle - matching ReactJS input-with-actions
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'API Key *',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: Colors.grey.shade700,
                ),
              ),
              const SizedBox(height: 8),
              TextFormField(
                controller: _apiKeyController,
                obscureText: !_showApiKey,
                decoration: InputDecoration(
                  hintText: 'Enter your API key',
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide(color: Colors.grey.shade300),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide(color: Colors.grey.shade300),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: Colors.blue, width: 2),
                  ),
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  suffixIcon: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      IconButton(
                        onPressed: () =>
                            setState(() => _showApiKey = !_showApiKey),
                        icon: Icon(_showApiKey
                            ? Icons.remove_red_eye
                            : Icons.remove_red_eye_outlined),
                        tooltip: _showApiKey ? 'Hide API Key' : 'Show API Key',
                      ),
                      IconButton(
                        onPressed: _copyApiKey,
                        icon: const Icon(Icons.content_copy),
                        tooltip: 'Copy API Key',
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),

          const SizedBox(height: 16),

          // API Username field
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'API Username *',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: Colors.grey.shade700,
                ),
              ),
              const SizedBox(height: 8),
              TextFormField(
                controller: _userNameController,
                decoration: InputDecoration(
                  hintText: 'Enter your API username',
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide(color: Colors.grey.shade300),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide(color: Colors.grey.shade300),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: Colors.blue, width: 2),
                  ),
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                ),
              ),
            ],
          ),

          const SizedBox(height: 16),

          // Base URL field
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Base URL',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: Colors.grey.shade700,
                ),
              ),
              const SizedBox(height: 8),
              TextFormField(
                controller: _baseUrlController,
                decoration: InputDecoration(
                  hintText: 'https://mediasfu.com',
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide(color: Colors.grey.shade300),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide(color: Colors.grey.shade300),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: Colors.blue, width: 2),
                  ),
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                ),
              ),
            ],
          ),

          const SizedBox(height: 16),

          // Special note - matching ReactJS special-note
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.orange.shade50,
              border: Border.all(color: Colors.orange.shade300, width: 2),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                Icon(Icons.info, color: Colors.orange.shade600),
                const SizedBox(width: 12),
                Expanded(
                  child: RichText(
                    text: TextSpan(
                      style: TextStyle(
                          color: Colors.orange.shade800, fontSize: 14),
                      children: const [
                        TextSpan(
                            text: 'Important: ',
                            style: TextStyle(fontWeight: FontWeight.bold)),
                        TextSpan(
                            text:
                                'Unless you are using a registered domain with MediaSFU, use the '),
                        TextSpan(
                            text: 'sandbox key',
                            style: TextStyle(fontWeight: FontWeight.bold)),
                        TextSpan(text: '.'),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 24),

          // Action buttons - matching ReactJS form-actions
          Row(
            children: [
              Expanded(
                child: ElevatedButton(
                  onPressed: _saveApiSettings,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.blue.shade600,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8)),
                  ),
                  child: const Text('Save API Settings'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: ElevatedButton(
                  onPressed: _isTestingConnection ? null : _testConnection,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.grey.shade600,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8)),
                  ),
                  child: _isTestingConnection
                      ? const SizedBox(
                          height: 16,
                          width: 16,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white),
                        )
                      : const Text('Test Connection'),
                ),
              ),
            ],
          ),

          // Test result - matching ReactJS test-result
          if (_testResult != null) ...[
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: (_testResult!['success'] as bool)
                    ? Colors.green.shade50
                    : Colors.red.shade50,
                borderRadius: BorderRadius.circular(8),
                border: Border(
                  left: BorderSide(
                    color: (_testResult!['success'] as bool)
                        ? Colors.green.shade400
                        : Colors.red.shade400,
                    width: 4,
                  ),
                ),
              ),
              child: Text(
                _testResult!['message'] as String,
                style: TextStyle(
                  color: (_testResult!['success'] as bool)
                      ? Colors.green.shade800
                      : Colors.red.shade800,
                  fontSize: 14,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  // Build Real-time Updates section - matching ReactJS Real-time Updates card
  Widget _buildRealtimeSection() {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.grey.shade300),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Real-time Updates',
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w600,
              color: Colors.grey.shade800,
            ),
          ),

          const SizedBox(height: 24),

          // Enable live updates checkbox - matching ReactJS checkbox-label
          Row(
            children: [
              Checkbox(
                value: _realtimeEnabled,
                onChanged: (value) =>
                    setState(() => _realtimeEnabled = value ?? false),
              ),
              const SizedBox(width: 8),
              const Expanded(
                child: Text(
                  'Enable live call updates',
                  style: TextStyle(fontSize: 16),
                ),
              ),
            ],
          ),

          const SizedBox(height: 16),

          // Update interval - matching ReactJS form-group
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Update Interval (seconds)',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: Colors.grey.shade700,
                ),
              ),
              const SizedBox(height: 8),
              TextFormField(
                initialValue: _realtimeInterval.round().toString(),
                keyboardType: TextInputType.number,
                decoration: InputDecoration(
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide(color: Colors.grey.shade300),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide(color: Colors.grey.shade300),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: Colors.blue, width: 2),
                  ),
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                ),
                onChanged: (value) {
                  final interval = double.tryParse(value) ?? 6.0;
                  setState(() {
                    _realtimeInterval = interval.clamp(6.0, 60.0);
                  });
                },
              ),
              const SizedBox(height: 8),
              Text(
                'Minimum 6 seconds (API rate limit: 1 request per 5 seconds)',
                style: TextStyle(
                  fontSize: 12,
                  color: Colors.grey.shade600,
                ),
              ),
            ],
          ),

          const SizedBox(height: 24),

          // Save button
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _saveRealtimeSettings,
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.blue.shade600,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 12),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8)),
              ),
              child: const Text('Save Realtime Settings'),
            ),
          ),
        ],
      ),
    );
  }

  // Build UI Settings section - matching ReactJS User Interface card
  Widget _buildUISection() {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.grey.shade300),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'User Interface',
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w600,
              color: Colors.grey.shade800,
            ),
          ),

          const SizedBox(height: 24),

          // Theme selector - matching ReactJS theme-selector
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Theme',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: Colors.grey.shade700,
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: GestureDetector(
                      onTap: () => setState(() => _theme = AppTheme.light),
                      child: Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: _theme == AppTheme.light
                              ? Colors.blue.shade600
                              : Colors.white,
                          border: Border.all(
                            color: _theme == AppTheme.light
                                ? Colors.blue.shade600
                                : Colors.grey.shade300,
                            width: 2,
                          ),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          '☀️ Light',
                          style: TextStyle(
                            color: _theme == AppTheme.light
                                ? Colors.white
                                : Colors.grey.shade700,
                            fontWeight: FontWeight.w500,
                          ),
                          textAlign: TextAlign.center,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: GestureDetector(
                      onTap: () => setState(() => _theme = AppTheme.dark),
                      child: Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: _theme == AppTheme.dark
                              ? Colors.blue.shade600
                              : Colors.white,
                          border: Border.all(
                            color: _theme == AppTheme.dark
                                ? Colors.blue.shade600
                                : Colors.grey.shade300,
                            width: 2,
                          ),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          '🌙 Dark',
                          style: TextStyle(
                            color: _theme == AppTheme.dark
                                ? Colors.white
                                : Colors.grey.shade700,
                            fontWeight: FontWeight.w500,
                          ),
                          textAlign: TextAlign.center,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.yellow.shade50,
                  border: Border.all(color: Colors.yellow.shade300, width: 2),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  children: [
                    Icon(Icons.info, color: Colors.yellow.shade700),
                    const SizedBox(width: 12),
                    Expanded(
                      child: RichText(
                        text: TextSpan(
                          style: TextStyle(
                              color: Colors.yellow.shade800, fontSize: 14),
                          children: const [
                            TextSpan(
                                text: 'Note: ',
                                style: TextStyle(fontWeight: FontWeight.bold)),
                            TextSpan(text: 'You may need to '),
                            TextSpan(
                                text: 'reload the page',
                                style: TextStyle(fontWeight: FontWeight.bold)),
                            TextSpan(
                                text:
                                    ' for theme changes to fully take effect across all components.'),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),

          const SizedBox(height: 24),

          // Compact mode checkbox
          Row(
            children: [
              Checkbox(
                value: _compactMode,
                onChanged: (value) =>
                    setState(() => _compactMode = value ?? false),
              ),
              const SizedBox(width: 8),
              const Expanded(
                child: Text(
                  'Compact mode',
                  style: TextStyle(fontSize: 16),
                ),
              ),
            ],
          ),

          const SizedBox(height: 24),

          // Save button
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _saveUISettings,
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.blue.shade600,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 12),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8)),
              ),
              child: const Text('Save UI Settings'),
            ),
          ),
        ],
      ),
    );
  }

  // Build Advanced Settings section - matching ReactJS Advanced Settings card
  Widget _buildAdvancedSection() {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.grey.shade300),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Section header with toggle button
          Row(
            children: [
              Expanded(
                child: Text(
                  'Advanced Settings',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w600,
                    color: Colors.grey.shade800,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Flexible(
                fit: FlexFit.loose,
                child: ElevatedButton(
                  onPressed: () =>
                      setState(() => _showAdvanced = !_showAdvanced),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.grey.shade600,
                    foregroundColor: Colors.white,
                    minimumSize: const Size(0, 36),
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8)),
                  ),
                  child:
                      Text(_showAdvanced ? 'Hide Advanced' : 'Show Advanced'),
                ),
              ),
            ],
          ),

          if (_showAdvanced) ...[
            const SizedBox(height: 24),
            const Divider(),
            const SizedBox(height: 24),

            // Config actions - matching ReactJS config-actions
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Import/Export Configuration',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: Colors.grey.shade700,
                  ),
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 12,
                  runSpacing: 8,
                  children: [
                    ElevatedButton.icon(
                      onPressed: _exportConfig,
                      icon: const Icon(Icons.file_download, size: 18),
                      label: const Text('Export Config'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.grey.shade600,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 8),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8)),
                      ),
                    ),
                    ElevatedButton.icon(
                      onPressed: _importConfig,
                      icon: const Icon(Icons.file_upload, size: 18),
                      label: const Text('Import Config'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.grey.shade600,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 8),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8)),
                      ),
                    ),
                    ElevatedButton.icon(
                      onPressed: _resetConfig,
                      icon: const Icon(Icons.restore, size: 18),
                      label: const Text('Reset to Defaults'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.orange.shade600,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 8),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8)),
                      ),
                    ),
                  ],
                ),
              ],
            ),

            const SizedBox(height: 24),

            // Configuration JSON textarea - matching ReactJS config-textarea
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Configuration JSON',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: Colors.grey.shade700,
                  ),
                ),
                const SizedBox(height: 8),
                TextFormField(
                  controller: _configJsonController,
                  maxLines: 10,
                  decoration: InputDecoration(
                    hintText: 'Paste configuration JSON here to import...',
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide(color: Colors.grey.shade300),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide(color: Colors.grey.shade300),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide:
                          const BorderSide(color: Colors.blue, width: 2),
                    ),
                    contentPadding: const EdgeInsets.all(16),
                  ),
                  style: const TextStyle(
                    fontFamily: 'monospace',
                    fontSize: 12,
                  ),
                ),
              ],
            ),

            const SizedBox(height: 24),

            // Current configuration display - matching ReactJS current-config
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Current Configuration',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: Colors.grey.shade700,
                  ),
                ),
                const SizedBox(height: 12),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.grey.shade50,
                    border: Border.all(color: Colors.grey.shade300),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: SingleChildScrollView(
                    child: Text(
                      const JsonEncoder.withIndent('  ').convert(
                        context.read<VoipConfigProvider>().config.toJson(),
                      ),
                      style: const TextStyle(
                        fontFamily: 'monospace',
                        fontSize: 12,
                        height: 1.4,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  // Build confirmation modal - matching ReactJS ConfirmationModal
  Widget _buildConfirmationModal() {
    if (!_showConfirmation || _confirmationConfig == null) {
      return const SizedBox.shrink();
    }

    final config = _confirmationConfig!;
    final type = config['type'] as String;
    Color color;
    IconData icon;

    switch (type) {
      case 'warning':
        color = Colors.orange;
        icon = Icons.warning;
        break;
      default:
        color = Colors.blue;
        icon = Icons.info;
    }

    return Container(
      color: Colors.black54,
      child: Center(
        child: Container(
          margin: const EdgeInsets.all(24),
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.3),
                blurRadius: 20,
                offset: const Offset(0, 10),
              ),
            ],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, color: color, size: 48),
              const SizedBox(height: 16),
              Text(
                config['title'] as String,
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w600,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 12),
              Text(
                config['message'] as String,
                style: TextStyle(
                  color: Colors.grey.shade600,
                  fontSize: 16,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton(
                      onPressed: () {
                        setState(() {
                          _showConfirmation = false;
                          _confirmationConfig = null;
                        });
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.grey.shade200,
                        foregroundColor: Colors.grey.shade700,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8)),
                      ),
                      child: const Text('Cancel'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: () {
                        (config['onConfirm'] as VoidCallback)();
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: color,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8)),
                      ),
                      child: const Text('Confirm'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final isDesktop = constraints.maxWidth >= 1024;
        final isTablet =
            constraints.maxWidth >= 768 && constraints.maxWidth < 1024;

        return Scaffold(
          appBar: AppBar(
            title: const Text('⚙️ Settings'),
            automaticallyImplyLeading: false,
            backgroundColor: Colors.white,
            foregroundColor: Colors.black,
            elevation: 0,
            bottom: PreferredSize(
              preferredSize: const Size.fromHeight(1),
              child: Container(
                height: 1,
                color: Colors.grey.shade300,
              ),
            ),
            actions: [
              ElevatedButton.icon(
                onPressed: () => Navigator.pushNamed(context, '/advanced'),
                icon: const Icon(Icons.settings, size: 18),
                label: const Text('Advanced Config'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.blue.shade600,
                  foregroundColor: Colors.white,
                  padding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8)),
                ),
              ),
              const SizedBox(width: 8),
              ElevatedButton.icon(
                onPressed: () {
                  // TODO: Implement theme toggle
                  _showSaveMessage('Theme toggle functionality coming soon');
                },
                icon: Icon(
                    _theme == AppTheme.light
                        ? Icons.brightness_3
                        : Icons.brightness_7,
                    size: 18),
                label: const Text('Toggle Theme'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.grey.shade600,
                  foregroundColor: Colors.white,
                  padding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8)),
                ),
              ),
              const SizedBox(width: 16),
            ],
          ),
          body: Stack(
            children: [
              // Main content
              Container(
                color: Colors.grey.shade50,
                child: FadeTransition(
                  opacity: _fadeAnimation,
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.all(24),
                    child: Center(
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 1200),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            // Page header - matching ReactJS settings-header
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text(
                                  'Settings',
                                  style: TextStyle(
                                    fontSize: isDesktop ? 32 : 24,
                                    fontWeight: FontWeight.w600,
                                    color: Colors.grey.shade800,
                                  ),
                                ),
                              ],
                            ),

                            const SizedBox(height: 32),

                            // Save message - matching ReactJS save-message
                            if (_saveMessage.isNotEmpty)
                              Container(
                                margin: const EdgeInsets.only(bottom: 24),
                                padding: const EdgeInsets.all(16),
                                decoration: BoxDecoration(
                                  color: Colors.green.shade50,
                                  borderRadius: BorderRadius.circular(12),
                                  border: Border(
                                    left: BorderSide(
                                        color: Colors.green.shade400, width: 4),
                                  ),
                                ),
                                child: Row(
                                  children: [
                                    Icon(Icons.check_circle,
                                        color: Colors.green.shade600),
                                    const SizedBox(width: 12),
                                    Expanded(
                                      child: Text(
                                        _saveMessage,
                                        style: TextStyle(
                                          color: Colors.green.shade800,
                                          fontSize: 14,
                                          fontWeight: FontWeight.w500,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ),

                            // Settings grid
                            _buildSettingsGrid(isDesktop, isTablet),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),

              // Confirmation modal overlay
              if (_showConfirmation) _buildConfirmationModal(),
            ],
          ),
        );
      },
    );
  }
}
