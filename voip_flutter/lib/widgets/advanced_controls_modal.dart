import 'package:flutter/material.dart';
import '../services/call_service.dart';
import '../utils/logger.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:mediasfu_sdk/mediasfu_sdk.dart'
    show switchAudio, SwitchAudioOptions, MediasfuParameters;

/// Flutter equivalent of React's AdvancedControlsModal
/// Provides comprehensive call controls including agent management, audio playback, and participant controls
///
/// DEVICE ENUMERATION:
/// This implementation uses flutter_webrtc package for real device enumeration:
///
/// ```dart
/// // Flutter/Dart equivalent using flutter_webrtc:
/// final devices = await navigator.mediaDevices.enumerateDevices();
/// final audioInputs = devices.where((device) => device.kind == 'audioinput').toList();
/// ```
///
/// This directly calls the browser's MediaDevices API through flutter_webrtc's native interface,
/// providing real-time access to the user's audio input devices.
class AdvancedControlsModal extends StatefulWidget {
  final String callId;
  final List<Map<String, dynamic>> participants;
  final Map<String, dynamic> sourceParameters;
  final String currentParticipantName;
  final bool isMicrophoneEnabled;
  final VoidCallback? onClose;

  const AdvancedControlsModal({
    super.key,
    required this.callId,
    required this.participants,
    this.sourceParameters = const {},
    this.currentParticipantName = 'voipuser',
    this.isMicrophoneEnabled = false,
    this.onClose,
  });

  @override
  State<AdvancedControlsModal> createState() => _AdvancedControlsModalState();
}

class _AdvancedControlsModalState extends State<AdvancedControlsModal> {
  final CallService _callService = CallService();

  // Audio playback state
  String _audioType = 'tts'; // 'tts' or 'url'
  String _audioValue = '';
  bool _audioLoop = false;
  bool _audioImmediately = true;

  // Device state
  String _selectedMicrophone = '';
  List<String> _availableDevices = ['Loading devices...'];

  // UI state
  bool _isLoading = false;
  String _callSourceValue = '';
  bool _hasInitialized = false;

  @override
  void initState() {
    super.initState();
    // Don't call _loadAudioDevices here - move to didChangeDependencies
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Load audio devices after dependencies are available (Theme, etc.)
    if (!_hasInitialized) {
      _hasInitialized = true;
      // Defer audio device loading until after build is complete
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          _loadAudioDevices();
        }
      });
    }
  }

  // Load available audio devices with microphone status check
  Future<void> _loadAudioDevices() async {
    try {
      // Ensure widget is still mounted and context is available
      if (!mounted) return;

      // Check if microphone is currently active and enumerate devices
      await _enumerateAudioDevices();

      Logger.info(
          'Audio device enumeration completed - ${_availableDevices.length} devices found');
    } catch (error) {
      Logger.error('Failed to load audio devices: $error');

      // Only update state if widget is still mounted
      if (mounted) {
        // Defer snackbar to avoid showing during build
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) {
            _showErrorSnackBar('Failed to access audio devices: $error');
          }
        });

        // Fallback to minimal device list safely
        try {
          setState(() {
            _availableDevices = ['Default Microphone'];
            _selectedMicrophone = 'Default Microphone';
          });
        } catch (stateError) {
          // If setState fails, log but don't throw
          Logger.error('Failed to update device state: $stateError');
        }
      }
    }
  }

  // Enumerate available audio input devices
  Future<void> _enumerateAudioDevices() async {
    try {
      // Ensure widget is still mounted before proceeding
      if (!mounted) return;

      // Check if microphone is currently active via source parameters
      bool isMicrophoneOn = _checkMicrophoneStatus();

      if (!isMicrophoneOn) {
        // Only proceed with UI updates if still mounted
        if (!mounted) return;

        // Alert user to turn on microphone first (defer to avoid build issues)
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) {
            _showMicrophoneRequiredAlert();
          }
        });

        // Provide limited device list without actual enumeration
        try {
          setState(() {
            _availableDevices = [
              'Default Microphone (Turn on mic to see all devices)'
            ];
            _selectedMicrophone = _availableDevices[0];
          });
        } catch (stateError) {
          Logger.error(
              'Failed to update device state during mic check: $stateError');
        }
        return;
      }

      // Only proceed with device enumeration if still mounted
      if (!mounted) return;

      // Microphone is on - enumerate actual devices using flutter_webrtc
      // This directly calls: navigator.mediaDevices.enumerateDevices()
      // final devices = await navigator.mediaDevices.enumerateDevices();
      // final audioInputs = devices.where((device) => device.kind == 'audioinput').toList();

      final availableDevices = await _getAvailableAudioDevices();

      // Only update state if still mounted
      if (!mounted) return;

      try {
        setState(() {
          _availableDevices = availableDevices;
          _selectedMicrophone =
              _availableDevices.isNotEmpty ? _availableDevices[0] : '';
        });
      } catch (stateError) {
        Logger.error(
            'Failed to update device state after enumeration: $stateError');
      }

      // Show success message (defer to avoid build issues) - only if still mounted
      if (mounted) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) {
            _showSuccessSnackBar(
                'Microphone active - ${_availableDevices.length} devices enumerated');
          }
        });
      }
    } catch (error) {
      Logger.error('Error enumerating audio devices: $error');
      rethrow;
    }
  }

  // Check microphone status from source parameters and passed state
  bool _checkMicrophoneStatus() {
    try {
      // Primary check: use the passed microphone state (most reliable)
      bool microphoneActive = widget.isMicrophoneEnabled;

      // Fallback check: source parameters for microphone state
      if (!microphoneActive) {
        final micStatus = widget.sourceParameters['audioAlreadyOn'] ?? false;
        final isMuted = widget.sourceParameters['muted'] ?? true;

        // Consider mic "on" if it's enabled and not muted
        microphoneActive = micStatus == true && isMuted == false;
      }

      Logger.info(
          'Microphone status check: isMicrophoneEnabled=${widget.isMicrophoneEnabled}, audioAlreadyOn=${widget.sourceParameters['audioAlreadyOn']}, muted=${widget.sourceParameters['muted']}, final_active=$microphoneActive');

      return microphoneActive;
    } catch (error) {
      Logger.error('Error checking microphone status: $error');
      // Fallback to passed state
      return widget.isMicrophoneEnabled;
    }
  }

  // Get available audio devices (using flutter_webrtc)
  Future<List<String>> _getAvailableAudioDevices() async {
    try {
      // Use flutter_webrtc's navigator.mediaDevices.enumerateDevices()
      final devices = await navigator.mediaDevices.enumerateDevices();

      // Filter for audio input devices
      final audioInputs =
          devices.where((device) => device.kind == 'audioinput').toList();

      // Convert to user-friendly device names
      final List<String> audioInputDevices = audioInputs.map((device) {
        String deviceName = device.label.isNotEmpty
            ? device.label
            : 'Microphone ${device.deviceId.substring(0, device.deviceId.length > 8 ? 8 : device.deviceId.length)}';
        return deviceName;
      }).toList();

      // Fallback if no devices found
      if (audioInputDevices.isEmpty) {
        audioInputDevices.add('Default System Microphone');
      }

      Logger.info(
          'Enumerated ${audioInputDevices.length} audio input devices using flutter_webrtc');
      return audioInputDevices;
    } catch (error) {
      Logger.error(
          'Error calling navigator.mediaDevices.enumerateDevices(): $error');

      // Return fallback devices on error
      return [
        'Default System Microphone',
        'Built-in Microphone',
        'USB Headset Microphone',
      ];
    }
  }

  // Show alert when microphone needs to be turned on
  void _showMicrophoneRequiredAlert() {
    showDialog<void>(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          title: Row(
            mainAxisSize: MainAxisSize.max,
            children: [
              Icon(Icons.mic_off, color: Colors.orange.shade600),
              const SizedBox(width: 8),
              const Expanded(
                child: Text(
                  'Microphone Required',
                  overflow: TextOverflow.ellipsis,
                  maxLines: 1,
                ),
              ),
            ],
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Please turn on your microphone to access device enumeration:',
                style: TextStyle(fontWeight: FontWeight.w500),
              ),
              const SizedBox(height: 12),
              const Text('1. Click the microphone button in the main controls'),
              const SizedBox(height: 8),
              const Text('2. Allow microphone access when prompted'),
              const SizedBox(height: 8),
              const Text('3. Return here to see all available devices'),
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.blue.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.blue.withValues(alpha: 0.3)),
                ),
                child: Row(
                  children: [
                    Icon(Icons.info, color: Colors.blue.shade600, size: 16),
                    const SizedBox(width: 8),
                    const Expanded(
                      child: Text(
                        'Device enumeration requires an active microphone connection.',
                        style: TextStyle(fontSize: 12),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('OK'),
            ),
            ElevatedButton(
              onPressed: () {
                Navigator.of(context).pop();
                _loadAudioDevices(); // Retry after user potentially enables mic
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.blue.shade600,
                foregroundColor: Colors.white,
              ),
              child: const Text('Check Again'),
            ),
          ],
        );
      },
    );
  }

  // Agent detection logic (matching React)
  bool get _hasAgentInRoom {
    if (widget.participants.isEmpty) return false;

    return widget.participants.any((participant) {
      final name = (participant['name'] ?? '').toString().toLowerCase();
      final id = (participant['id'] ?? '').toString().toLowerCase();

      const agentKeywords = [
        'agent',
        'ai',
        'bot',
        'assistant',
        'mediasfu',
        'voice',
        'system'
      ];
      return agentKeywords
          .any((keyword) => name.contains(keyword) || id.contains(keyword));
    });
  }

  // Filter human participants (matching React logic)
  List<Map<String, dynamic>> get _humanParticipants {
    return widget.participants.where((participant) {
      final id = (participant['id'] ??
              participant['audioID'] ??
              participant['videoID'] ??
              '')
          .toString()
          .toLowerCase();
      final isSystemId = id.startsWith('sip_') || id.startsWith('sip-');
      final name = (participant['name'] ?? '').toString().toLowerCase();

      const agentKeywords = [
        'agent',
        'ai',
        'bot',
        'assistant',
        'mediasfu',
        'voice',
        'system'
      ];
      final isAgent = agentKeywords
          .any((keyword) => name.contains(keyword) || id.contains(keyword));

      return !isSystemId && !isAgent;
    }).toList();
  }

  // Play audio (TTS or URL)
  Future<void> _handlePlayAudio() async {
    if (_audioValue.trim().isEmpty) return;

    setState(() => _isLoading = true);

    try {
      final result = await _callService.playAudio(
        widget.callId,
        _audioType,
        _audioValue,
        _audioLoop,
        _audioImmediately,
      );

      if (result.success) {
        Logger.info('Successfully played audio: $_audioType - $_audioValue');
        setState(() => _audioValue = '');
      } else {
        Logger.error('Failed to play audio: ${result.error}');
        _showErrorSnackBar('Failed to play audio: ${result.error}');
      }
    } catch (error) {
      Logger.error('Error playing audio: $error');
      _showErrorSnackBar('Error playing audio: $error');
    } finally {
      setState(() => _isLoading = false);
    }
  }

  // Switch to human control
  Future<void> _handleSwitchToHuman() async {
    setState(() => _isLoading = true);

    try {
      // Pass the current participant name as required by the API
      final result = await _callService.switchSource(
          widget.callId, 'human', widget.currentParticipantName);

      if (result.success) {
        Logger.info('Successfully switched to human');
        _showSuccessSnackBar('Switched to human control');
      } else {
        Logger.error('Failed to switch to human: ${result.error}');
        _showErrorSnackBar('Failed to switch to human: ${result.error}');
      }
    } catch (error) {
      Logger.error('Error switching to human: $error');
      _showErrorSnackBar('Error switching to human: $error');
    } finally {
      setState(() => _isLoading = false);
    }
  }

  // Switch to agent control
  Future<void> _handleSwitchToAgent() async {
    setState(() => _isLoading = true);

    try {
      final result = await _callService.switchSource(widget.callId, 'agent');

      if (result.success) {
        Logger.info('Successfully switched to agent');
        _showSuccessSnackBar('Switched to agent control');
      } else {
        Logger.error('Failed to switch to agent: ${result.error}');
        _showErrorSnackBar('Failed to switch to agent: ${result.error}');
      }
    } catch (error) {
      Logger.error('Error switching to agent: $error');
      _showErrorSnackBar('Error switching to agent: $error');
    } finally {
      setState(() => _isLoading = false);
    }
  }

  // Start agent
  Future<void> _handleStartAgent() async {
    setState(() => _isLoading = true);

    try {
      final result = await _callService.startAgent(widget.callId);

      if (result.success) {
        Logger.info('Successfully started agent');
        _showSuccessSnackBar('Agent started');
      } else {
        Logger.error('Failed to start agent: ${result.error}');
        _showErrorSnackBar('Failed to start agent: ${result.error}');
      }
    } catch (error) {
      Logger.error('Error starting agent: $error');
      _showErrorSnackBar('Error starting agent: $error');
    } finally {
      setState(() => _isLoading = false);
    }
  }

  // Stop agent
  Future<void> _handleStopAgent() async {
    setState(() => _isLoading = true);

    try {
      final result = await _callService.stopAgent(widget.callId);

      if (result.success) {
        Logger.info('Successfully stopped agent');
        _showSuccessSnackBar('Agent stopped');
      } else {
        Logger.error('Failed to stop agent: ${result.error}');
        _showErrorSnackBar('Failed to stop agent: ${result.error}');
      }
    } catch (error) {
      Logger.error('Error stopping agent: $error');
      _showErrorSnackBar('Error stopping agent: $error');
    } finally {
      setState(() => _isLoading = false);
    }
  }

  // Handle microphone change - now with actual device switching using MediaSFU
  Future<void> _handleMicrophoneChange(String deviceId) async {
    if (deviceId.contains('Permission Required')) {
      Logger.warn('Attempted to select permission-required device');
      return;
    }

    setState(() => _selectedMicrophone = deviceId);
    Logger.info('Microphone selection changed to: $deviceId');

    // Attempt to switch audio device using MediaSFU if we have source parameters
    if (widget.sourceParameters.isNotEmpty) {
      try {
        Logger.info(
            'Attempting to switch audio device via MediaSFU to: $deviceId');

        final options = SwitchAudioOptions(
          audioPreference: deviceId,
          parameters: widget.sourceParameters as MediasfuParameters,
        );

        await switchAudio(options);

        Logger.info(
            'Successfully switched audio device via MediaSFU to: $deviceId');
        _showSuccessSnackBar(
            'Microphone device switched to: ${_getDeviceDisplayName(deviceId)}');
      } catch (error) {
        Logger.error('Failed to switch audio device via MediaSFU: $error');
        _showErrorSnackBar('Failed to switch microphone device: $error');

        // Revert selection on failure
        setState(() {
          if (_availableDevices.isNotEmpty) {
            _selectedMicrophone = _availableDevices[0];
          }
        });
      }
    } else {
      Logger.warn(
          'Cannot switch audio device: MediaSFU source parameters not available');
      _showErrorSnackBar(
          'Cannot switch device: Not connected to MediaSFU room');
    }
  }

  // Helper to get a user-friendly device name
  String _getDeviceDisplayName(String deviceId) {
    if (deviceId.length > 50) {
      return '${deviceId.substring(0, 47)}...';
    }
    return deviceId;
  }

  // Show success message
  void _showSuccessSnackBar(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: Colors.green,
        duration: const Duration(seconds: 2),
      ),
    );
  }

  // Show error message
  void _showErrorSnackBar(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: Colors.red,
        duration: const Duration(seconds: 3),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.all(16),
      child: Container(
        width: double.infinity,
        constraints: const BoxConstraints(maxHeight: 650, maxWidth: 550),
        decoration: BoxDecoration(
          color: Theme.of(context).scaffoldBackgroundColor,
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
            // Header with gradient
            Container(
              padding: const EdgeInsets.all(20),
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    Color(0xFF3498DB),
                    Color(0xFF2980B9),
                  ],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.only(
                  topLeft: Radius.circular(16),
                  topRight: Radius.circular(16),
                ),
              ),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.2),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Icon(Icons.settings,
                        color: Colors.white, size: 24),
                  ),
                  const SizedBox(width: 12),
                  const Expanded(
                    child: Text(
                      'Advanced Controls',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 20,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 0.5,
                      ),
                    ),
                  ),
                  Material(
                    color: Colors.transparent,
                    child: InkWell(
                      borderRadius: BorderRadius.circular(20),
                      onTap:
                          widget.onClose ?? () => Navigator.of(context).pop(),
                      child: Container(
                        padding: const EdgeInsets.all(8),
                        child: const Icon(Icons.close,
                            color: Colors.white, size: 24),
                      ),
                    ),
                  ),
                ],
              ),
            ),

            // Content
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(20),
                child: Column(
                  children: [
                    // Call Source Control
                    _buildCallSourceControlCard(),
                    const SizedBox(height: 20),

                    // Audio Playback Control
                    _buildAudioPlaybackCard(),
                    const SizedBox(height: 20),

                    // Agent Management
                    _buildAgentManagementCard(),
                    const SizedBox(height: 20),

                    // Device Management
                    _buildDeviceManagementCard(),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildControlCard({
    required String title,
    required IconData icon,
    required Widget content,
    String? description,
  }) {
    return Container(
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: Colors.grey.withValues(alpha: 0.2),
          width: 1,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: const Color(0xFF3498DB).withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(
                    icon,
                    color: const Color(0xFF3498DB),
                    size: 20,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    title,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      letterSpacing: 0.2,
                    ),
                  ),
                ),
              ],
            ),
            if (description != null) ...[
              const SizedBox(height: 12),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: Colors.grey.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  description,
                  style: TextStyle(
                    fontSize: 13,
                    color: Colors.grey[600],
                    height: 1.4,
                  ),
                ),
              ),
            ],
            const SizedBox(height: 16),
            content,
          ],
        ),
      ),
    );
  }

  Widget _buildCallSourceControlCard() {
    return _buildControlCard(
      title: 'Call Source Control',
      icon: Icons.phone,
      description:
          'Switch control between agent and human participants. Only human participants are shown.',
      content: Column(
        children: [
          DropdownButtonFormField<String>(
            initialValue: _callSourceValue.isEmpty ? null : _callSourceValue,
            decoration: const InputDecoration(
              labelText: 'Call Source Control',
              border: OutlineInputBorder(),
            ),
            isExpanded: true,
            items: [
              const DropdownMenuItem(
                value: '',
                child: Text(
                  'Choose who controls the call',
                  overflow: TextOverflow.ellipsis,
                  maxLines: 1,
                ),
              ),
              const DropdownMenuItem(
                value: 'agent',
                child: Text(
                  'Switch to Agent',
                  overflow: TextOverflow.ellipsis,
                  maxLines: 1,
                ),
              ),
              ..._humanParticipants.map((participant) {
                final id = participant['id']?.toString() ?? '';
                final name = participant['name']?.toString() ??
                    'Participant ${id.substring(0, id.length > 8 ? 8 : id.length)}';
                return DropdownMenuItem(
                  value: 'human-$id',
                  child: Container(
                    constraints: const BoxConstraints(maxWidth: 250),
                    child: Text(
                      name,
                      overflow: TextOverflow.ellipsis,
                      maxLines: 1,
                    ),
                  ),
                );
              }),
            ],
            onChanged: _isLoading
                ? null
                : (value) {
                    setState(() => _callSourceValue = value ?? '');
                    if (value == 'agent') {
                      _handleSwitchToAgent();
                    } else if (value?.startsWith('human-') == true) {
                      _handleSwitchToHuman();
                    }
                  },
          ),
        ],
      ),
    );
  }

  Widget _buildAudioPlaybackCard() {
    return _buildControlCard(
      title: 'Audio Playback',
      icon: Icons.volume_up,
      description:
          'Play text-to-speech or audio URL to all participants in the call.',
      content: Column(
        children: [
          // Audio type selection
          Row(
            children: [
              Expanded(
                child: RadioListTile<String>(
                  title: const Text('Text-to-Speech'),
                  value: 'tts',
                  // ignore: deprecated_member_use
                  groupValue: _audioType,
                  // ignore: deprecated_member_use
                  onChanged: _isLoading
                      ? null
                      : (value) {
                          setState(() => _audioType = value!);
                        },
                ),
              ),
              Expanded(
                child: RadioListTile<String>(
                  title: const Text('Audio URL'),
                  value: 'url',
                  // ignore: deprecated_member_use
                  groupValue: _audioType,
                  // ignore: deprecated_member_use
                  onChanged: _isLoading
                      ? null
                      : (value) {
                          setState(() => _audioType = value!);
                        },
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),

          // Audio input
          TextFormField(
            decoration: InputDecoration(
              labelText: _audioType == 'tts'
                  ? 'Enter text to speak'
                  : 'Enter audio URL',
              border: const OutlineInputBorder(),
            ),
            maxLines: _audioType == 'tts' ? 3 : 1,
            onChanged: (value) => setState(() => _audioValue = value),
            initialValue: _audioValue,
          ),
          const SizedBox(height: 8),

          // Options
          Row(
            children: [
              Expanded(
                child: CheckboxListTile(
                  title: const Text('Loop'),
                  value: _audioLoop,
                  onChanged: _isLoading
                      ? null
                      : (value) {
                          setState(() => _audioLoop = value!);
                        },
                ),
              ),
              Expanded(
                child: CheckboxListTile(
                  title: const Text('Play Immediately'),
                  value: _audioImmediately,
                  onChanged: _isLoading
                      ? null
                      : (value) {
                          setState(() => _audioImmediately = value!);
                        },
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),

          // Play button
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: _isLoading || _audioValue.trim().isEmpty
                  ? null
                  : _handlePlayAudio,
              icon: _isLoading
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.play_arrow),
              label: Text(_isLoading ? 'Playing...' : 'Play Audio'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAgentManagementCard() {
    return _buildControlCard(
      title: 'Agent Management',
      icon: Icons.smart_toy,
      description:
          'Start or stop AI agent for automated conversation handling.',
      content: Column(
        children: [
          if (_hasAgentInRoom) ...[
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: Colors.green.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.green.withValues(alpha: 0.3)),
              ),
              child: Row(
                children: [
                  Icon(Icons.check_circle,
                      color: Colors.green.shade600, size: 16),
                  const SizedBox(width: 8),
                  const Text(
                    'Agent detected in room',
                    style: TextStyle(
                      color: Colors.green,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
          ],
          Row(
            children: [
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: _isLoading ? null : _handleStartAgent,
                  icon: const Icon(Icons.play_arrow, size: 18),
                  label: const Text('Start Agent'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.green.shade600,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                    elevation: 2,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: _isLoading ? null : _handleStopAgent,
                  icon: const Icon(Icons.stop, size: 18),
                  label: const Text('Stop Agent'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.red.shade600,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                    elevation: 2,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _isLoading ? null : _handleSwitchToHuman,
                  icon: const Icon(Icons.person, size: 18),
                  label: const Text('Switch to Human'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.blue.shade600,
                    side: BorderSide(color: Colors.blue.shade600),
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _isLoading ? null : _handleSwitchToAgent,
                  icon: const Icon(Icons.smart_toy, size: 18),
                  label: const Text('Switch to Agent'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.purple.shade600,
                    side: BorderSide(color: Colors.purple.shade600),
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildDeviceManagementCard() {
    final hasDevices = _availableDevices.isNotEmpty;
    final firstDevice = hasDevices ? _availableDevices.first : 'No devices';
    final hasPermissionIssue =
        hasDevices && firstDevice.contains('Permission Required');

    return _buildControlCard(
      title: 'Device Management',
      icon: Icons.headphones,
      description: 'Select and configure audio input/output devices.',
      content: Column(
        children: [
          // Permission status indicator
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            margin: const EdgeInsets.only(bottom: 12),
            decoration: BoxDecoration(
              color: hasPermissionIssue
                  ? Colors.orange.withValues(alpha: 0.1)
                  : Colors.green.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(
                color: hasPermissionIssue
                    ? Colors.orange.withValues(alpha: 0.3)
                    : Colors.green.withValues(alpha: 0.3),
              ),
            ),
            child: Row(
              children: [
                Icon(
                  hasPermissionIssue ? Icons.warning : Icons.check_circle,
                  color: hasPermissionIssue
                      ? Colors.orange.shade600
                      : Colors.green.shade600,
                  size: 16,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    hasPermissionIssue
                        ? 'Microphone permission required for device enumeration'
                        : 'Microphone access granted - ${_availableDevices.length} devices available',
                    style: TextStyle(
                      color: hasPermissionIssue
                          ? Colors.orange.shade600
                          : Colors.green.shade600,
                      fontWeight: FontWeight.w500,
                      fontSize: 12,
                    ),
                  ),
                ),
                if (hasPermissionIssue)
                  TextButton(
                    onPressed: _loadAudioDevices,
                    child: const Text('Retry', style: TextStyle(fontSize: 12)),
                  ),
              ],
            ),
          ),

          // Device dropdown
          DropdownButtonFormField<String>(
            initialValue:
                _selectedMicrophone.isEmpty ? null : _selectedMicrophone,
            decoration: const InputDecoration(
              labelText: 'Microphone Device',
              border: OutlineInputBorder(),
              prefixIcon: Icon(Icons.mic),
            ),
            isExpanded: true, // Allow dropdown to expand to container width
            items: _availableDevices.map((device) {
              return DropdownMenuItem(
                value: device,
                child: Container(
                  constraints:
                      const BoxConstraints(maxWidth: 250), // Limit max width
                  child: Text(
                    device,
                    style: TextStyle(
                      color: device.contains('Permission Required')
                          ? Colors.grey
                          : null,
                    ),
                    overflow: TextOverflow.ellipsis, // Handle text overflow
                    maxLines: 1,
                  ),
                ),
              );
            }).toList(),
            onChanged: (value) {
              if (value != null && !value.contains('Permission Required')) {
                _handleMicrophoneChange(value);
              }
            },
          ),

          // Device info
          if (_selectedMicrophone.isNotEmpty &&
              !_selectedMicrophone.contains('Permission Required')) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.blue.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  Icon(Icons.info, color: Colors.blue.shade600, size: 16),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Selected: $_selectedMicrophone',
                      style: TextStyle(
                        color: Colors.blue.shade600,
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}
