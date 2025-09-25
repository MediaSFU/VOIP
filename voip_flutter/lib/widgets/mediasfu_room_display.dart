import 'package:flutter/material.dart';
import 'package:collection/collection.dart';
import 'package:mediasfu_sdk/mediasfu_sdk.dart'
    show
        AudioGrid,
        AudioGridOptions,
        MediasfuParameters,
        confirmExit,
        ConfirmExitOptions,
        clickAudio,
        ClickAudioOptions;
import 'dart:async';
import 'dart:ui';
import '../utils/logger.dart';
import '../services/call_service.dart';
import 'mediasfu_handler.dart';
import 'advanced_controls_modal.dart';

// Enhanced button styles enum
enum ControlButtonStyle {
  primary,
  secondary,
  success,
  danger,
  warning,
  neutral,
}

/// MediaSFU Room Display Widget - Complete Flutter equivalent of React MediaSFURoomDisplay
/// Displays active MediaSFU room with full controls, agent management, and participant information
/// Mirrors ALL functionality from React MediaSFURoomDisplay.tsx
class MediaSFURoomDisplay extends StatefulWidget {
  final String roomName;
  final String? callId;
  final String? participantName;
  final bool isConnected;
  final void Function(bool)? onConnectionChange;
  final void Function(bool)? onMicrophoneChange;
  final void Function()? onDisconnect;
  final void Function(String)? onEndCall;
  final bool autoJoin;
  final bool isOutgoingCallSetup;
  final void Function(String)? onRoomNameUpdate;
  final Map<String, dynamic>? currentCall;
  final int? duration;
  final void Function(List<Map<String, dynamic>> participants)?
      onParticipantsUpdate;

  const MediaSFURoomDisplay({
    super.key,
    required this.roomName,
    this.callId,
    this.participantName,
    this.isConnected = false,
    this.onConnectionChange,
    this.onMicrophoneChange,
    this.onDisconnect,
    this.onEndCall,
    this.autoJoin = true,
    this.isOutgoingCallSetup = false,
    this.onRoomNameUpdate,
    this.currentCall,
    this.duration,
    this.onParticipantsUpdate,
  });

  @override
  State<MediaSFURoomDisplay> createState() => _MediaSFURoomDisplayState();
}

class _MediaSFURoomDisplayState extends State<MediaSFURoomDisplay> {
  // MediaSFU Parameters - following space_details pattern
  final ValueNotifier<MediasfuParameters?> mediasfuParams =
      ValueNotifier<MediasfuParameters?>(null);
  final ValueNotifier<bool> mediasfuChanged = ValueNotifier<bool>(false);

  // Room Audio and Video Components
  final ValueNotifier<List<Widget>> allRoomAudios =
      ValueNotifier<List<Widget>>([]);

  // Key MediaSFU State Tracking
  final ValueNotifier<double> audioLevel = ValueNotifier<double>(0.0);
  final ValueNotifier<bool> isConnected = ValueNotifier<bool>(false);
  final ValueNotifier<bool> isMicEnabled = ValueNotifier<bool>(false);
  final ValueNotifier<bool> isPlayToAll = ValueNotifier<bool>(false);
  final ValueNotifier<List<Map<String, dynamic>>> participants =
      ValueNotifier<List<Map<String, dynamic>>>([]);
  final ValueNotifier<String> alertMessage = ValueNotifier<String>('');

  // UI state variables
  bool _showRoomAudio = true;
  bool _isOnHold = false;
  bool _isPlayToAllLoading = false;
  bool _isHoldLoading = false;
  bool _isAgentLoading = false;
  bool _isTakeControlLoading = false;
  bool _isToAgentLoading = false;
  bool _showHoldModal = false;
  bool _showConfirmation = false;
  bool _hasHumanControl = false;
  bool _connectionFailed = false;
  String? _connectionFailureMessage;

  // Additional room state
  Map<String, dynamic> _roomState = {
    'roomStatus': 'active',
    'isPlayToAll': false,
    'currentCallData': null,
  };

  Map<String, dynamic>? _confirmationConfig;

  // Timers for continuous monitoring
  Timer? _callDataTimer;
  Timer? _sourceMonitoringTimer;
  Timer? _connectionTimeoutTimer;

  final CallService _callService = CallService();

  // MediaSFU Parameters Update - following space_details pattern
  void updateSourceParameters(MediasfuParameters? params) {
    Logger.debug(
        'updateSourceParameters called with params: ${params?.roomName}');

    // Add disposal safety check
    if (!mounted) {
      Logger.warn('updateSourceParameters called but widget is not mounted');
      return;
    }

    try {
      mediasfuParams.value = params;
      mediasfuChanged.value = !mediasfuChanged.value;
    } catch (e) {
      Logger.warn('Error calling widget.updateSourceParameters: $e');
    }
  }

  // Update state parameters from MediaSFU - following space_details pattern
  void _updateStateParameters(MediasfuParameters? params) {
    if (!mounted) return;
    if (params == null ||
        params.roomName.isEmpty ||
        params.roomName == 'none') {
      return;
    }

    Logger.debug(
        '_updateStateParameters called with roomName: ${params.roomName}');
    Logger.debug('Current isConnected.value: ${isConnected.value}');
    Logger.debug('params.roomName.isNotEmpty: ${params.roomName.isNotEmpty}');

    try {
      // Update connection status
      if (!isConnected.value && params.roomName.isNotEmpty) {
        Logger.debug('Setting isConnected to true');
        setState(() {
          isConnected.value = true;
          _roomState['isConnected'] = true;
        });

        // Call connection change callback
        widget.onConnectionChange?.call(true);

        // Cancel timeout timer since we're connected
        _connectionTimeoutTimer?.cancel();
        Logger.debug('Connection timeout timer cancelled');
      } else {
        Logger.debug(
            'Not updating connection - isConnected: ${isConnected.value}, roomName.isNotEmpty: ${params.roomName.isNotEmpty}');
      }

      // Update room name if needed - but be much more careful about room stability
      if (widget.onRoomNameUpdate != null &&
          params.roomName != widget.roomName &&
          params.roomName.isNotEmpty) {
        // CRITICAL: Only update room name in these specific cases:
        // 1. We're getting the FIRST real MediaSFU room name (our temp name -> real name)
        // 2. We're joining a completely different room for a different call

        final isInitialRoomCreation = widget.roomName.startsWith('outgoing_') &&
            (params.roomName.startsWith('s') ||
                params.roomName.startsWith('p'));

        final isJoiningDifferentRoom =
            !widget.roomName.startsWith('outgoing_') &&
                params.roomName != widget.roomName &&
                (params.roomName.startsWith('s') ||
                    params.roomName.startsWith('p'));

        // NEVER switch away from a stable MediaSFU room (s* or p*) to another room
        // unless explicitly joining a different call
        final isStableToStableSwitch = (widget.roomName.startsWith('s') ||
                widget.roomName.startsWith('p')) &&
            (params.roomName.startsWith('s') ||
                params.roomName.startsWith('p')) &&
            widget.roomName != params.roomName;

        if (isInitialRoomCreation || isJoiningDifferentRoom) {
          Logger.debug(
              'Updating room name from ${widget.roomName} to ${params.roomName} (valid transition)');
          widget.onRoomNameUpdate!(params.roomName);
        } else if (isStableToStableSwitch) {
          Logger.debug(
              'BLOCKING room name update from stable room ${widget.roomName} to ${params.roomName} (preserving room stability)');
          // Do NOT update - this prevents the unwanted room switching
          return;
        } else {
          Logger.debug(
              'Skipping room name update: ${widget.roomName} -> ${params.roomName} (no valid transition)');
        }
      }

      // Update audio streams if changed
      if (!const ListEquality<Widget>()
          .equals(params.audioOnlyStreams, allRoomAudios.value)) {
        allRoomAudios.value = params.audioOnlyStreams;
        setState(() {
          _roomState['allRoomAudios'] = allRoomAudios.value;
        });
      }

      // Update microphone status
      final newMicStatus = params.audioAlreadyOn;
      if (isMicEnabled.value != newMicStatus) {
        Logger.debug(
            'Updating isMicEnabled from ${isMicEnabled.value} to $newMicStatus');
        setState(() {
          isMicEnabled.value = newMicStatus;
          _roomState['isMicEnabled'] = newMicStatus;
        });

        // Call microphone change callback
        widget.onMicrophoneChange?.call(newMicStatus);
      }

      // Update audio level
      if (params.audioLevel != null && params.audioLevel != audioLevel.value) {
        audioLevel.value = params.audioLevel!;
        setState(() {
          _roomState['audioLevel'] = params.audioLevel!;
        });
      }

      // Update participants (always update since we need to convert from Participant to Map)
      final previousParticipants = participants.value;
      final newParticipants = params.participants
          .map((p) => {
                'id': p.id,
                'name': p.name,
                'muted': p.muted,
                // Remove audioLevel if not available in Participant type
              })
          .toList();

      final bool participantsChanged = !const DeepCollectionEquality.unordered()
          .equals(previousParticipants, newParticipants);

      participants.value = newParticipants;

      if (participantsChanged) {
        widget.onParticipantsUpdate
            ?.call(List<Map<String, dynamic>>.from(newParticipants));
      }

      setState(() {
        _roomState['participants'] = newParticipants;
      });

      // Update alert message and check for room end conditions
      if (params.alertMessage != alertMessage.value &&
          params.alertMessage.isNotEmpty) {
        alertMessage.value = params.alertMessage;
        setState(() {
          _roomState['alertMessage'] = params.alertMessage;
        });
      }

      // Enhanced room end/disconnect detection (matching React.js logic)
      final shouldDisconnect = _shouldDisconnectFromRoom(params);

      if (shouldDisconnect) {
        final disconnectReason = _determineDisconnectReason(params);
        Logger.info(
            'Room disconnection detected: ${disconnectReason['details']}');

        // Call disconnect with reason
        Timer(const Duration(milliseconds: 100), () {
          if (mounted) {
            widget.onDisconnect?.call();
          }
        });
      }
    } catch (e) {
      Logger.warn('Error in _updateStateParameters: $e');
      // Continue execution even if ValueNotifier access fails
    }
  }

  // Helper method to determine if room should disconnect (matching React.js logic)
  bool _shouldDisconnectFromRoom(MediasfuParameters params) {
    // Invalid room name indicates room no longer exists
    final isValidRoom = params.roomName.isNotEmpty && params.roomName != 'none';
    if (!isValidRoom) return true;

    // Check for socket disconnection
    final hasSocket = params.socket != null || params.localSocket != null;
    if (!hasSocket) return true;

    // Alert message indicators
    if (params.alertMessage.isNotEmpty) {
      final alertLower = params.alertMessage.toLowerCase();
      if (alertLower.contains("meeting has ended") ||
          alertLower.contains("ended") ||
          alertLower.contains("disconnected") ||
          alertLower.contains("room not found") ||
          alertLower.contains("invalid room") ||
          alertLower.contains("failed") ||
          alertLower.contains("error")) {
        return true;
      }
    }

    return false;
  }

  // Helper method to determine disconnect reason (matching React.js logic)
  Map<String, String> _determineDisconnectReason(MediasfuParameters params) {
    if (params.alertMessage.isNotEmpty) {
      final alertLower = params.alertMessage.toLowerCase();

      if (alertLower.contains("meeting has ended")) {
        return {
          'type': 'room-ended',
          'details': 'Room ended: ${params.alertMessage}'
        };
      } else if (alertLower.contains("disconnected")) {
        return {
          'type': 'socket-error',
          'details': 'Connection lost: ${params.alertMessage}'
        };
      } else if (alertLower.contains("room not found") ||
          alertLower.contains("invalid room")) {
        return {
          'type': 'room-ended',
          'details': 'Room invalid: ${params.alertMessage}'
        };
      }
    }

    // Check for socket disconnection
    final hasSocket = params.socket != null || params.localSocket != null;
    if (!hasSocket) {
      return {'type': 'socket-error', 'details': 'Socket disconnected'};
    }

    // Invalid room name
    final isValidRoom = params.roomName.isNotEmpty && params.roomName != 'none';
    if (!isValidRoom) {
      return {'type': 'room-ended', 'details': 'Invalid room name detected'};
    }

    return {'type': 'room-ended', 'details': 'Room ended: Unknown reason'};
  }

  // Start continuous source parameters monitoring for outgoing rooms (matching React.js)
  void _startSourceParametersMonitoring() {
    // Only monitor for outgoing call setup without active call
    if (!widget.isOutgoingCallSetup || (widget.callId?.isNotEmpty == true)) {
      return;
    }

    _sourceMonitoringTimer?.cancel();

    Logger.info(
        'Starting continuous sourceParameters monitoring for outgoing room');

    _sourceMonitoringTimer =
        Timer.periodic(const Duration(seconds: 5), (timer) {
      _monitorSourceParameters();
    });

    // Initial check
    _monitorSourceParameters();
  }

  // Monitor source parameters for room state changes (matching React.js logic)
  void _monitorSourceParameters() {
    final params = mediasfuParams.value;

    if (params != null) {
      // Force update of room state with current sourceParameters
      final isValidRoom =
          params.roomName.isNotEmpty && params.roomName != 'none';

      if (isValidRoom) {
        final hasSocket = params.socket != null || params.localSocket != null;
        final hasValidConnection = hasSocket && isValidRoom;
        final hasParticipants = params.participants.isNotEmpty;
        final noFailureMessage = params.alertMessage.isEmpty ||
            (!params.alertMessage.toLowerCase().contains("ended") &&
                !params.alertMessage.toLowerCase().contains("failed") &&
                !params.alertMessage.toLowerCase().contains("error"));

        final connected = isValidRoom &&
            (hasSocket || hasValidConnection || hasParticipants) &&
            noFailureMessage;

        // CRITICAL: If roomName has changed from our prop roomName, call onRoomNameUpdate
        if (params.roomName != widget.roomName &&
            widget.onRoomNameUpdate != null) {
          widget.onRoomNameUpdate!(params.roomName);
        }

        // Update connection state if changed
        if (connected != isConnected.value) {
          Logger.info(
              'Source monitoring detected connection change: ${isConnected.value} -> $connected');
          setState(() {
            isConnected.value = connected;
          });
          widget.onConnectionChange?.call(connected);
        }

        // Check for room closure or failure based on room name and socket state
        final shouldDisconnect = _shouldDisconnectFromRoom(params);

        if (shouldDisconnect) {
          final disconnectReason = _determineDisconnectReason(params);
          Logger.info(
              'Outgoing room closure detected during monitoring: ${disconnectReason['details']}');

          // Add a small delay to ensure MediaSFU cleanup completes
          Timer(const Duration(milliseconds: 100), () {
            if (mounted) {
              Logger.info(
                  'Executing onDisconnect callback for closed outgoing room');
              widget.onDisconnect?.call();
            }
          });
        }
      }
    }
  }

  @override
  void initState() {
    super.initState();
    _initializeRoom();
    _startCallDataFetching();
    _setupConnectionTimeout();

    // Add listener for MediaSFU parameter changes - following space_details pattern
    mediasfuChanged.addListener(() {
      _updateStateParameters(mediasfuParams.value);
    });

    // Start continuous source parameters monitoring for outgoing rooms (matching React.js)
    _startSourceParametersMonitoring();
  }

  @override
  void didUpdateWidget(MediaSFURoomDisplay oldWidget) {
    super.didUpdateWidget(oldWidget);

    // Only update call ID monitoring when callId changes
    if (widget.callId != oldWidget.callId) {
      // If callId changed from valid to null, clear call data immediately
      if (oldWidget.callId != null && widget.callId == null) {
        Logger.info('Call ID cleared - clearing call data immediately');
        _callDataTimer?.cancel();
        if (mounted) {
          setState(() {
            _roomState['currentCallData'] = null;
          });
        }
      } else {
        _startCallDataFetching();
      }
    }

    // Log room name changes but don't re-initialize
    if (widget.roomName != oldWidget.roomName) {
      Logger.info(
          'MediaSFURoomDisplay roomName changed from "${oldWidget.roomName}" to "${widget.roomName}" - continuing with existing connection');
    }
  }

  @override
  void dispose() {
    _callDataTimer?.cancel();
    _sourceMonitoringTimer?.cancel();
    _connectionTimeoutTimer?.cancel();

    // Dispose ValueNotifiers
    mediasfuParams.dispose();
    mediasfuChanged.dispose();
    allRoomAudios.dispose();
    audioLevel.dispose();
    isConnected.dispose();
    isMicEnabled.dispose();
    isPlayToAll.dispose();
    participants.dispose();
    alertMessage.dispose();

    super.dispose();
  }

  // Real-time call data fetching (following React pattern) - with 60s timeout
  void _startCallDataFetching() {
    _callDataTimer?.cancel();

    if (widget.callId == null || !widget.callId!.startsWith('prod')) {
      // Clear call data when no valid callId is available
      if (mounted) {
        setState(() {
          _roomState['currentCallData'] = null;
        });
      }
      return; // Only fetch for valid call IDs
    }

    // Initial fetch
    _fetchCallData();

    // Set up periodic fetching every 2 seconds (matching React)
    _callDataTimer = Timer.periodic(const Duration(seconds: 2), (_) {
      _fetchCallData();
    });
  }

  // Fetch current call data including activeMediaSource (React equivalent)
  Future<Map<String, dynamic>?> _fetchCallData() async {
    if (widget.callId == null || !widget.callId!.startsWith('prod')) {
      return null;
    }

    try {
      final result = await _callService.getCallState(widget.callId!);
      if (result.success && result.data != null) {
        final data = result.data!;
        final callData = {
          'activeMediaSource': data['activeMediaSource'],
          'status': data['status'],
          'onHold': data['onHold'],
          'durationSeconds': data['durationSeconds'],
          'calledUri': data['calledUri'],
          'callerIdRaw': data['callerIdRaw'],
          'direction': data['direction'],
          'humanName': data['humanName'],
        };

        // Check if call has ended - clear call data and stop fetching if so
        final status = data['status']?.toString().toLowerCase();
        if (status == 'ended' ||
            status == 'completed' ||
            status == 'failed' ||
            status == 'cancelled') {
          Logger.info(
              'Call ended with status "$status" - clearing call data and stopping fetching');
          _callDataTimer?.cancel();

          // Clear the call data to update the UI
          if (mounted) {
            setState(() {
              _roomState['currentCallData'] = null;
            });
          }

          return null; // Return null to indicate no active call
        }

        if (mounted) {
          setState(() {
            _roomState['currentCallData'] = callData;
          });
        }

        return callData;
      }
    } catch (error) {
      Logger.error('Error fetching call data: $error');
    }
    return null;
  }

  // Enhanced agent detection (React equivalent)
  bool _hasAgentInRoom() {
    final participantsList = participants.value;
    if (participantsList.isEmpty) {
      return false;
    }

    // Check for SIP agents: ID starts with 'sip_' and ends with '_agent'
    return participantsList.any((participant) {
      final id = (participant['id'] ?? '').toString().toLowerCase();
      return id.startsWith('sip_') && id.endsWith('_agent');
    });
  }

  // Enhanced active media source detection (React equivalent)
  bool _isActiveMediaSourceAgent() {
    // Check participants for currently active SIP agent
    final participantsList = participants.value;
    if (participantsList.isEmpty) {
      return false;
    }

    // Find currently speaking/active participant that is a SIP agent
    final activeParticipant = participantsList.where((participant) {
      final hasActiveMic = participant['muted'] == false;
      final hasActiveStream =
          participant['audioID'] != null && participant['muted'] == false;
      final id = (participant['id'] ?? '').toString().toLowerCase();

      return (hasActiveMic || hasActiveStream) &&
          id.startsWith('sip_') &&
          id.endsWith('_agent');
    }).firstOrNull;

    if (activeParticipant != null) {
      return true;
    }

    // If only one participant, check if they are a SIP agent
    if (participantsList.length == 1) {
      final id = (participantsList[0]['id'] ?? '').toString().toLowerCase();
      return id.startsWith('sip_') && id.endsWith('_agent');
    }

    return false;
  }

  // Agent status detection (React equivalent)
  String _getAgentStatus() {
    // Simplified version - check if agent participant is active
    if (_isActiveMediaSourceAgent()) {
      return 'active'; // Agent is active and speaking
    } else if (_hasAgentInRoom()) {
      return 'paused'; // Agent is in room but not active
    } else {
      return 'stopped'; // No agent in room
    }
  }

  // Helper methods for agent status display
  bool _shouldShowStartAgent() {
    final agentStatus = _getAgentStatus();
    return agentStatus ==
        'stopped'; // Only show start when agent is fully stopped
  }

  bool _shouldShowStopAgent() {
    final agentStatus = _getAgentStatus();
    return agentStatus == 'active' ||
        agentStatus == 'paused'; // Show stop when agent is active or paused
  }

  // Initialize room with clean state
  void _initializeRoom() {
    if (widget.roomName.isEmpty) return;

    setState(() {
      _roomState = {
        'roomStatus': 'active',
        'isPlayToAll': false,
        'currentCallData': widget.currentCall,
      };

      // Initialize ValueNotifiers
      isConnected.value = widget.isConnected;
      isMicEnabled.value = false;
      isPlayToAll.value = false;
      audioLevel.value = 0.0;
      participants.value = <Map<String, dynamic>>[];
      allRoomAudios.value = <Widget>[];
      alertMessage.value = '';
    });
  }

  // Setup connection timeout handling
  void _setupConnectionTimeout() {
    if (!isConnected.value && widget.autoJoin && widget.isOutgoingCallSetup) {
      // Set up a 30-second timeout for connection
      _connectionTimeoutTimer = Timer(const Duration(seconds: 30), () {
        if (mounted) {
          setState(() {
            alertMessage.value =
                'Connection timeout - unable to connect to room';
            _connectionFailed = true;
            _connectionFailureMessage = alertMessage.value;
          });
        }

        widget.onDisconnect?.call();
      });
    }
  }

  // Control methods - using ValueNotifier approach

  // Toggle microphone using MediaSFU's audio toggle
  Future<void> _toggleMicrophone() async {
    final mediasfuParams = this.mediasfuParams.value;
    if (mediasfuParams == null) {
      Logger.warn('Cannot toggle microphone: Not connected to MediaSFU room');
      return;
    }

    try {
      final options = ClickAudioOptions(parameters: mediasfuParams);
      await clickAudio(options);

      // State will be updated through the updateSourceParameters callback
      final currentMicState = isMicEnabled.value;
      widget.onMicrophoneChange?.call(currentMicState);
    } catch (error) {
      Logger.error('Error toggling microphone: $error');
      // State will be updated through MediaSFU callback anyway
    }
  }

  // Toggle room audio (show/hide AudioGrid)
  void _toggleRoomAudio() {
    setState(() {
      _showRoomAudio = !_showRoomAudio;
    });
  }

  // Hold/resume call functionality - updated for ValueNotifier approach
  Future<void> _toggleHold() async {
    final mediasfuParams = this.mediasfuParams.value;
    if (mediasfuParams == null) {
      Logger.warn('Cannot toggle hold: Not connected to MediaSFU room');
      return;
    }

    if (widget.callId == null || widget.callId!.isEmpty) {
      Logger.warn('Cannot toggle hold: Call ID is required for SIP operations');
      return;
    }

    if (_isOnHold) {
      // Resume call directly
      setState(() => _isHoldLoading = true);
      try {
        final result = await _callService.unholdCall(widget.callId!);
        if (result.success) {
          setState(() {
            _isOnHold = false;
            _isHoldLoading = false;
          });
          Logger.info('Call resumed from hold');
        } else {
          setState(() => _isHoldLoading = false);
          Logger.error('Failed to resume call: ${result.error}');
        }
      } catch (error) {
        setState(() => _isHoldLoading = false);
        Logger.error('Error resuming call: $error');
      }
    } else {
      // Show hold modal for options
      setState(() => _showHoldModal = true);
    }
  }

  // Handle hold with options from modal
  Future<void> _handleHoldWithOptions(
      String message, bool pauseRecording) async {
    setState(() {
      _isHoldLoading = true;
      _showHoldModal = false;
    });

    try {
      final result =
          await _callService.holdCall(widget.callId!, message, pauseRecording);
      if (result.success) {
        setState(() {
          _isOnHold = true;
          _isHoldLoading = false;
        });
        Logger.info('Call placed on hold');
      } else {
        setState(() => _isHoldLoading = false);
        Logger.error('Failed to hold call: ${result.error}');
      }
    } catch (error) {
      setState(() => _isHoldLoading = false);
      Logger.error('Error holding call: $error');
    }
  }

  // Switch source handlers - updated for ValueNotifier approach
  Future<void> _handleSwitchToAgent() async {
    final mediasfuParams = this.mediasfuParams.value;
    if (widget.callId == null || mediasfuParams == null) {
      Logger.warn(
          'Cannot switch source: Not connected to MediaSFU room or missing call ID');
      return;
    }

    try {
      setState(() => _isToAgentLoading = true);
      final result = await _callService.switchSource(widget.callId!, 'agent');

      if (result.success) {
        setState(() => _hasHumanControl = false); // Agent now has control
        Logger.info('Successfully switched to AI agent');
      } else {
        Logger.error('Failed to switch to agent: ${result.error}');
      }
    } catch (error) {
      Logger.error('Error switching to agent: $error');
    } finally {
      if (mounted) setState(() => _isToAgentLoading = false);
    }
  }

  // Start agent handler - updated for ValueNotifier approach
  Future<void> _handleStartAgent() async {
    final mediasfuParams = this.mediasfuParams.value;
    if (widget.callId == null || mediasfuParams == null) {
      Logger.warn(
          'Cannot start agent: Not connected to MediaSFU room or missing call ID');
      return;
    }

    setState(() => _isAgentLoading = true);
    try {
      final result = await _callService.startAgent(widget.callId!);

      if (result.success) {
        Logger.info('Successfully started agent');
      } else {
        Logger.error('Failed to start agent: ${result.error}');
      }
    } catch (error) {
      Logger.error('Error starting agent: $error');
    } finally {
      setState(() => _isAgentLoading = false);
    }
  }

  // Stop agent handler - updated for ValueNotifier approach
  Future<void> _handleStopAgent() async {
    final mediasfuParams = this.mediasfuParams.value;
    if (widget.callId == null || mediasfuParams == null) {
      Logger.warn(
          'Cannot stop agent: Not connected to MediaSFU room or missing call ID');
      return;
    }

    setState(() => _isAgentLoading = true);
    try {
      final result = await _callService.stopAgent(widget.callId!);

      if (result.success) {
        Logger.info('Successfully stopped agent');
      } else {
        Logger.error('Failed to stop agent: ${result.error}');
      }
    } catch (error) {
      Logger.error('Error stopping agent: $error');
    } finally {
      setState(() => _isAgentLoading = false);
    }
  }

  // Get current human participant name from room participants
  String _getCurrentHumanParticipantName() {
    final participants =
        _roomState['participants'] as List<Map<String, dynamic>>?;

    if (participants != null && participants.isNotEmpty) {
      // First, try to find ourselves by matching the exact name we joined with
      final ourParticipant = participants.where((participant) {
        final id = (participant['id'] ?? '').toString().toLowerCase();
        // Must be non-SIP and match our participant name
        return !id.startsWith('sip_') &&
            participant['name'] == widget.participantName;
      }).firstOrNull;

      if (ourParticipant != null) {
        return ourParticipant['name']?.toString() ??
            widget.participantName ??
            'voipuser';
      }

      // If only one human in room, that must be us
      final humanParticipants = participants.where((participant) {
        final id = (participant['id'] ?? '').toString().toLowerCase();
        return !id.startsWith('sip_');
      }).toList();

      if (humanParticipants.length == 1) {
        return humanParticipants[0]['name']?.toString() ??
            widget.participantName ??
            'voipuser';
      }
    }

    return widget.participantName ?? 'voipuser';
  }

  // Take control flow - updated for ValueNotifier approach
  Future<void> _handleTakeControl() async {
    final mediasfuParams = this.mediasfuParams.value;
    if (widget.callId == null || mediasfuParams == null) {
      Logger.warn(
          'Cannot take control: Not connected to MediaSFU room or missing call ID');
      return;
    }

    // Internal function to perform the actual switch
    Future<void> performSwitch() async {
      try {
        setState(() => _isTakeControlLoading = true);
        final humanName = _getCurrentHumanParticipantName();
        final result =
            await _callService.switchSource(widget.callId!, 'human', humanName);

        if (result.success) {
          setState(
              () => _hasHumanControl = true); // Mark that we now have control
          Logger.info('Successfully took control of conversation');
        } else {
          Logger.error('Failed to take control: ${result.error}');
        }
      } catch (error) {
        Logger.error('Error taking control: $error');
      } finally {
        if (mounted) setState(() => _isTakeControlLoading = false);
      }
    }

    try {
      // Check if user's microphone is muted and prompt to unmute
      if (!isMicEnabled.value) {
        setState(() {
          _confirmationConfig = {
            'title': 'Unmute Microphone',
            'message':
                'Your microphone is currently muted. Would you like to unmute it before taking control of the conversation?',
            'type': 'warning',
            'onConfirm': () async {
              setState(() => _showConfirmation = false);
              await _toggleMicrophone();
              // Give a moment for the microphone to activate
              await Future<void>.delayed(const Duration(milliseconds: 500));
              // Continue with taking control
              await performSwitch();
            }
          };
          _showConfirmation = true;
        });
        return;
      }

      // If microphone is already enabled, proceed directly
      await performSwitch();
    } catch (error) {
      Logger.error('Error in take control flow: $error');
    }
  }

  // Smart source switching - updated for ValueNotifier approach
  Future<void> _handleSmartSourceSwitch() async {
    final mediasfuParams = this.mediasfuParams.value;
    if (widget.callId == null || mediasfuParams == null) {
      Logger.warn(
          'Cannot perform smart switch: Not connected to MediaSFU room or missing call ID');
      return;
    }

    try {
      if (_isActiveMediaSourceAgent()) {
        // Agent is active - offer to take control
        await _handleTakeControl();
      } else if (_hasAgentInRoom()) {
        // Human is active, agent available - switch to agent
        await _handleSwitchToAgent();
      } else {
        // No agent available - start agent
        await _handleStartAgent();
      }
    } catch (error) {
      Logger.error('Error in smart source switch: $error');
    }
  }

  // Handle play to all toggle - updated for ValueNotifier approach
  Future<void> _handlePlayToAllToggle() async {
    final mediasfuParams = this.mediasfuParams.value;
    if (widget.callId == null || mediasfuParams == null) {
      Logger.warn(
          'Cannot toggle play to all: Not connected to MediaSFU room or missing call ID');
      return;
    }

    setState(() => _isPlayToAllLoading = true);
    try {
      final newPlayToAll = !isPlayToAll.value;
      final result =
          await _callService.updatePlayToAll(widget.callId!, newPlayToAll);

      if (result.success) {
        setState(() {
          isPlayToAll.value = newPlayToAll;
          _roomState['isPlayToAll'] = newPlayToAll;
          _isPlayToAllLoading = false;
        });
        Logger.info('Successfully updated play to all');
      } else {
        setState(() => _isPlayToAllLoading = false);
        Logger.error('Failed to update play to all: ${result.error}');
      }
    } catch (error) {
      setState(() => _isPlayToAllLoading = false);
      Logger.error('Error updating play to all: $error');
    }
  }

  // End SIP call vs Close room functionality
  Future<void> _handleEndCall() async {
    if (widget.callId == null || widget.callId!.isEmpty) {
      Logger.warn('Cannot end call: No call ID available');
      return;
    }

    widget.onEndCall?.call(widget.callId!);
  }

  // Disconnect from room - updated for ValueNotifier approach
  Future<void> _handleDisconnect() async {
    Logger.info('Disconnecting from MediaSFU room...');

    try {
      // Use MediaSFU SDK to properly disconnect from room
      final mediasfuParams = this.mediasfuParams.value;

      if (mediasfuParams != null && mediasfuParams.roomName.isNotEmpty) {
        Logger.debug('Using MediasfuParameters for disconnect');
        final options = ConfirmExitOptions(
          member: mediasfuParams.member,
          socket: mediasfuParams.socket,
          localSocket: mediasfuParams.localSocket,
          roomName: mediasfuParams.roomName,
          ban: false,
        );

        await confirmExit(options);
        Logger.info('Successfully disconnected from MediaSFU room via SDK');
      } else {
        // Try fallback from widget.currentCall
        final fallbackParams =
            widget.currentCall?['mediasfuParameters'] as MediasfuParameters?;

        if (fallbackParams != null && fallbackParams.roomName.isNotEmpty) {
          Logger.info('Using fallback MediasfuParameters for disconnect');
          final options = ConfirmExitOptions(
            member: fallbackParams.member,
            socket: fallbackParams.socket,
            localSocket: fallbackParams.localSocket,
            roomName: fallbackParams.roomName,
            ban: false,
          );

          await confirmExit(options);
          Logger.info(
              'Successfully disconnected from MediaSFU room via SDK using fallback');
        } else {
          Logger.warning(
              'MediaSFU parameters not available, calling disconnect callback only');
        }
      }

      // Always call the disconnect callback to update parent state
      widget.onDisconnect?.call();
    } catch (error) {
      Logger.error('Error disconnecting from room: $error');
      // Still call disconnect callback even if SDK call fails
      widget.onDisconnect?.call();
    }
  }

  // Show Advanced Controls Modal
  void _showAdvancedControlsModal() {
    showDialog<void>(
      context: context,
      builder: (BuildContext context) {
        return AdvancedControlsModal(
          callId: widget.callId ?? '',
          participants: _getParticipantsList(),
          currentParticipantName: widget.participantName ?? 'voipuser',
          isMicrophoneEnabled: isMicEnabled.value,
        );
      },
    );
  }

  // Helper to extract participants list - updated for ValueNotifier approach
  List<Map<String, dynamic>> _getParticipantsList() {
    return participants.value;
  }

  // Helper function to check map equality
  bool mapEquals(Map<String, dynamic>? a, Map<String, dynamic>? b) {
    if (a == null && b == null) return true;
    if (a == null || b == null) return false;
    if (a.length != b.length) return false;

    for (final key in a.keys) {
      if (!b.containsKey(key) || a[key] != b[key]) return false;
    }
    return true;
  }

  // Build smart participants list showing first 3 names
  String _buildParticipantsList(List<Map<String, dynamic>> participants) {
    if (participants.isEmpty) return '0 participants';

    // Get participant names, filtering out empty/null names
    final names = participants
        .map((p) => (p['name'] ?? p['displayName'] ?? '').toString().trim())
        .where((name) => name.isNotEmpty)
        .toList();

    if (names.isEmpty) {
      return '${participants.length} participant${participants.length != 1 ? 's' : ''}';
    }

    if (names.length <= 3) {
      // Show all names if 3 or fewer
      return names.join(', ');
    } else {
      // Show first 3 + count of others
      final firstThree = names.take(3).join(', ');
      final others = names.length - 3;
      return '$firstThree +$others';
    }
  }

  // Get microphone status indicator - updated to use ValueNotifiers
  Map<String, dynamic> _getMicrophoneStatus() {
    if (!isConnected.value) {
      return {'text': 'Not connected', 'color': const Color(0xFF6c757d)};
    }
    if (isMicEnabled.value) {
      return {'text': 'Microphone active', 'color': const Color(0xFF28a745)};
    }
    return {'text': 'Microphone muted', 'color': const Color(0xFFdc3545)};
  }

  // Handle MediaSFU room created callback
  void _handleRoomCreated(String roomName, String meetingID) {
    Logger.debug('MediaSFUHandler onRoomCreated called');
    Logger.debug('onRoomCreated roomName: "$roomName"');
    Logger.debug('onRoomCreated meetingID: "$meetingID"');

    // Update connection status immediately
    if (mounted && !isConnected.value) {
      _connectionFailed = false;
      _connectionFailureMessage = null;
      setState(() {
        isConnected.value = true;
        _roomState['isConnected'] = true;
      });
      _connectionTimeoutTimer?.cancel();
      Logger.debug('Connection status updated to true in onRoomCreated');
    }

    // CRITICAL: Only update room name if this is the INITIAL creation
    // (temp outgoing_ name -> real MediaSFU name)
    if (roomName.isNotEmpty && roomName != widget.roomName) {
      final isInitialCreation = widget.roomName.startsWith('outgoing_') &&
          (roomName.startsWith('s') || roomName.startsWith('p'));

      if (isInitialCreation) {
        Logger.info(
            'DEBUG: Initial room creation - updating name: "${widget.roomName}" -> "$roomName"');
        widget.onRoomNameUpdate?.call(roomName);
      } else {
        Logger.info(
            'DEBUG: BLOCKING room update in onRoomCreated - not initial creation: ${widget.roomName} -> $roomName');
      }
    } else if (roomName.isEmpty) {
      Logger.warn('DEBUG: roomName is empty, not calling onRoomNameUpdate');
    } else {
      Logger.info(
          'DEBUG: roomName unchanged (${widget.roomName}), not calling onRoomNameUpdate');
    }

    Logger.info('DEBUG: Calling onConnectionChange(true)');
    widget.onConnectionChange?.call(true);
  }

  // Handle MediaSFU room joined callback
  void _handleRoomJoined(String meetingID) {
    Logger.info('DEBUG: MediaSFUHandler onRoomJoined called');
    _connectionFailed = false;
    _connectionFailureMessage = null;

    // Update connection status immediately
    if (mounted && !isConnected.value) {
      setState(() {
        isConnected.value = true;
        _roomState['isConnected'] = true;
      });
      _connectionTimeoutTimer?.cancel();
    }

    // DO NOT update room name in onRoomJoined - this should preserve existing room
    Logger.info(
        'DEBUG: Room joined - preserving existing room name: ${widget.roomName}');

    widget.onConnectionChange?.call(true);
  }

  @override
  Widget build(BuildContext context) {
    if (widget.roomName.isEmpty) {
      return const SizedBox.shrink();
    }

    Logger.info(
        'DEBUG: MediaSFURoomDisplay building with roomName: "${widget.roomName}"');

    final micStatus = _getMicrophoneStatus();
    final agentInRoom = _hasAgentInRoom();
    final activeSourceIsAgent = _isActiveMediaSourceAgent();
    final canControlAgent = widget.callId?.isNotEmpty == true;

    // Determine if handler UI should be rendered (debug logs removed)
    final shouldShowHandler = widget.autoJoin &&
        (!isConnected.value || widget.roomName.startsWith('outgoing_'));

    final bool showConnectingOverlay = widget.autoJoin &&
        widget.roomName.isNotEmpty &&
        !isConnected.value &&
        !_connectionFailed;

    return Stack(
      children: [
        Column(
          children: [
            // MediaSFU Handler (headless) - MATCH REACT VERSION LOGIC
            if (shouldShowHandler)
              MediaSFUHandler(
                action: widget.isOutgoingCallSetup &&
                        (widget.callId?.isEmpty ?? true)
                    ? 'create'
                    : 'join',
                meetingID: widget
                    .roomName, // ← CRITICAL: React passes roomName as meetingID for both create and join!
                duration: widget.duration ?? 30,
                capacity: 5,
                name: widget.participantName ?? 'voipuser',
                sourceParameters: null, // Pass null instead of empty Map
                updateSourceParameters: (MediasfuParameters? params) {
                  // Direct MediasfuParameters - no conversion needed
                  updateSourceParameters(params);
                },
                onRoomCreated: (roomName, meetingID) {
                  _handleRoomCreated(roomName, meetingID);
                },
                onRoomJoined: (meetingID) {
                  _handleRoomJoined(meetingID);
                },
                onError: (error) {
                  Logger.error('MediaSFU error: $error');
                },
              ),

            // Connection failure banner (if any)
            if (_connectionFailed &&
                (_connectionFailureMessage?.isNotEmpty ?? false))
              Container(
                width: double.infinity,
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.red.shade50,
                  border: Border.all(color: Colors.red.shade200),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  children: [
                    Icon(Icons.error_outline,
                        color: Colors.red.shade700, size: 18),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        _connectionFailureMessage!,
                        style: TextStyle(color: Colors.red.shade700),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ),

            // Complete Room Display UI matching React version
            _buildCompleteRoomDisplay(
                micStatus, agentInRoom, activeSourceIsAgent, canControlAgent),
          ],
        ),
        if (_showHoldModal)
          Positioned.fill(
            child: _buildHoldOptionsModal(),
          ),
        if (_showConfirmation && _confirmationConfig != null)
          Positioned.fill(
            child: _buildConfirmationModal(),
          ),
        if (showConnectingOverlay)
          Positioned.fill(
            child: AbsorbPointer(
              absorbing: true,
              child: ClipRect(
                child: BackdropFilter(
                  filter: ImageFilter.blur(sigmaX: 14, sigmaY: 14),
                  child: Container(
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.35),
                      borderRadius: BorderRadius.circular(0),
                    ),
                    child: Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Container(
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: Colors.black.withValues(alpha: 0.45),
                              borderRadius: BorderRadius.circular(16),
                              border: Border.all(
                                color: Colors.white.withValues(alpha: 0.1),
                              ),
                            ),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const SizedBox(
                                  width: 32,
                                  height: 32,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 3,
                                    valueColor: AlwaysStoppedAnimation<Color>(
                                      Colors.white,
                                    ),
                                  ),
                                ),
                                const SizedBox(height: 14),
                                Text(
                                  widget.isOutgoingCallSetup
                                      ? 'Creating room…'
                                      : 'Connecting…',
                                  style: Theme.of(context)
                                      .textTheme
                                      .bodyLarge
                                      ?.copyWith(
                                        color: Colors.white,
                                        fontWeight: FontWeight.w600,
                                      ),
                                  textAlign: TextAlign.center,
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  'Hang tight while we prepare your media streams.',
                                  style: Theme.of(context)
                                      .textTheme
                                      .bodySmall
                                      ?.copyWith(
                                        color: Colors.white
                                            .withValues(alpha: 0.75),
                                      ),
                                  textAlign: TextAlign.center,
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }

  Widget _buildCompleteRoomDisplay(Map<String, dynamic> micStatus,
      bool agentInRoom, bool activeSourceIsAgent, bool canControlAgent) {
    final isConnectedValue = isConnected.value;
    final participantsList = participants.value;

    return Container(
      width: double.infinity,
      margin: const EdgeInsets.symmetric(vertical: 8),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color:
              isConnectedValue ? Colors.green.shade300 : Colors.orange.shade300,
          width: 2,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          return SingleChildScrollView(
            physics: const ClampingScrollPhysics(),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Room Header - exact React equivalent
                _buildRoomHeader(
                    isConnectedValue, participantsList, agentInRoom),

                const SizedBox(height: 16),

                // Outgoing Call Setup Information - exact React equivalent
                if (widget.isOutgoingCallSetup) _buildOutgoingCallSetupInfo(),

                // Header Status Row - exact React equivalent
                _buildHeaderStatusRow(
                    isConnectedValue, participantsList, agentInRoom),

                const SizedBox(height: 16),

                // Room Controls - complete React equivalent
                _buildRoomControls(isConnectedValue, agentInRoom,
                    activeSourceIsAgent, canControlAgent),

                const SizedBox(height: 16),

                // Status Indicators - exact React equivalent
                _buildStatusIndicators(micStatus),

                // Hidden AudioGrid equivalent for functionality
                _buildHiddenAudioGrid(),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildRoomHeader(bool isConnected,
      List<Map<String, dynamic>> participants, bool agentInRoom) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(
              isConnected ? Icons.videocam : Icons.videocam_off,
              color:
                  isConnected ? Colors.green.shade600 : Colors.orange.shade600,
              size: 24,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                'MediaSFU Room',
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 4),
        Text(
          widget.roomName,
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Colors.grey.shade600,
              ),
          overflow: TextOverflow.ellipsis,
          maxLines: 1,
        ),
      ],
    );
  }

  Widget _buildOutgoingCallSetupInfo() {
    final isConnectedValue = isConnected.value;
    final currentCallData =
        _roomState['currentCallData'] as Map<String, dynamic>?;
    final hasActiveCall = currentCallData != null &&
        currentCallData.isNotEmpty &&
        _isCallStatusActive(currentCallData['status']?.toString());

    final String? rawStatus = currentCallData?['status']?.toString();
    final String statusLower = rawStatus?.toLowerCase() ?? '';
    final bool dataRinging = currentCallData?['isRinging'] == true;

    IconData statusIcon;
    Color statusColor;
    String statusHeadline;

    if ((rawStatus?.isNotEmpty ?? false) || dataRinging) {
      if (statusLower == 'active' || statusLower == 'connected') {
        statusIcon = Icons.call;
        statusColor = Colors.green.shade700;
        statusHeadline = 'Call Connected';
      } else if (dataRinging || statusLower.contains('ring')) {
        statusIcon = Icons.ring_volume;
        statusColor = Colors.orange.shade700;
        statusHeadline = 'Call Ringing (waiting for answer)';
      } else if ({'connecting', 'initiating', 'dialing', 'resolving'}
          .contains(statusLower)) {
        statusIcon = Icons.phone_in_talk;
        statusColor = Colors.blue.shade700;
        statusHeadline = 'Call Connecting…';
      } else if (statusLower.contains('hold')) {
        statusIcon = Icons.pause_circle_filled;
        statusColor = Colors.amber.shade700;
        statusHeadline = 'Call On Hold';
      } else {
        statusIcon = Icons.call;
        statusColor = Colors.green.shade700;
        statusHeadline = 'Active Call in Progress';
      }
    } else if (isConnectedValue) {
      statusIcon = Icons.phone_enabled;
      statusColor = Colors.blue.shade700;
      statusHeadline = 'Outgoing Call Setup Room';
    } else {
      statusIcon = Icons.error;
      statusColor = Colors.red.shade700;
      statusHeadline = 'Room Connection Lost';
    }

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: isConnectedValue ? Colors.blue.shade50 : Colors.red.shade50,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: isConnectedValue ? Colors.blue.shade300 : Colors.red.shade300,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                statusIcon,
                size: 16,
                color: statusColor,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  statusHeadline,
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w600,
                        color: statusColor,
                      ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          if (hasActiveCall) ...[
            // Call metadata display
            _buildCallMetadata(currentCallData),
          ] else ...[
            Text(
              _getSetupInstructions(isConnectedValue),
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Colors.grey.shade600,
                  ),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildCallMetadata(Map<String, dynamic> callData) {
    // Extract call information similar to React version
    final String status =
        callData['status']?.toString().toUpperCase() ?? 'UNKNOWN';
    final String direction = callData['direction']?.toString() ?? 'outgoing';
    final String phoneNumber = direction == 'outgoing'
        ? _extractCleanIdentifier(callData['calledUri']?.toString() ?? '')
        : _extractCleanIdentifier(callData['callerIdRaw']?.toString() ?? '');
    final String startTime = callData['startTimeISO']?.toString() ?? '';

    // Format duration
    final String duration = _formatDurationWithFallback(callData);

    return Wrap(
      spacing: 8,
      runSpacing: 4,
      children: [
        _buildMetadataChip(
          icon: Icons.call,
          label: direction == 'outgoing' ? 'Calling' : 'From',
          value: phoneNumber,
          color: Colors.blue,
        ),
        _buildMetadataChip(
          icon: _getStatusIcon(status),
          label: 'Status',
          value: status,
          color: _getStatusColor(status),
        ),
        if (startTime.isNotEmpty)
          _buildMetadataChip(
            icon: Icons.access_time,
            label: 'Duration',
            value: duration,
            color: Colors.green,
          ),
      ],
    );
  }

  Widget _buildMetadataChip({
    required IconData icon,
    required String label,
    required String value,
    required Color color,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: color),
          const SizedBox(width: 4),
          Text(
            '$label: $value',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w500,
              color: color.withValues(alpha: 0.8),
            ),
          ),
        ],
      ),
    );
  }

  String _extractCleanIdentifier(String identifier) {
    if (identifier.isEmpty) return '';

    // Remove sip: prefix and @domain suffix
    String clean = identifier.replaceAll(RegExp(r'^sip:'), '');
    clean = clean.split('@').first;
    return clean;
  }

  String _formatDurationWithFallback(Map<String, dynamic> callData) {
    final String? startTimeISO = callData['startTimeISO']?.toString();
    if (startTimeISO == null || startTimeISO.isEmpty) return '0:00';

    try {
      final startTime = DateTime.parse(startTimeISO);
      final duration = DateTime.now().difference(startTime);

      final minutes = duration.inMinutes;
      final seconds = duration.inSeconds % 60;

      return '${minutes.toString().padLeft(1, '0')}:${seconds.toString().padLeft(2, '0')}';
    } catch (e) {
      return '0:00';
    }
  }

  IconData _getStatusIcon(String status) {
    switch (status.toLowerCase()) {
      case 'active':
      case 'connected':
        return Icons.call;
      case 'ringing':
        return Icons.ring_volume;
      case 'connecting':
        return Icons.phone_in_talk;
      case 'ended':
      case 'completed':
        return Icons.call_end;
      default:
        return Icons.phone;
    }
  }

  Color _getStatusColor(String status) {
    switch (status.toLowerCase()) {
      case 'active':
      case 'connected':
        return Colors.green;
      case 'ringing':
        return Colors.orange;
      case 'connecting':
        return Colors.blue;
      case 'ended':
      case 'completed':
        return Colors.grey;
      default:
        return Colors.blue;
    }
  }

  // Helper method to determine if call status indicates an active call
  bool _isCallStatusActive(String? status) {
    if (status == null || status.isEmpty) return false;

    final lowerStatus = status.toLowerCase();
    const activeStatuses = {
      'active',
      'connected',
      'live',
    };
    const progressingStatuses = {
      'ringing',
      'connecting',
      'initiating',
      'dialing',
      'resolving',
    };

    if (activeStatuses.contains(lowerStatus)) return true;
    if (progressingStatuses.contains(lowerStatus)) return true;

    return false;
  }

  String _getSetupInstructions(bool isConnectedValue) {
    if (!isConnectedValue) {
      return 'The room connection was lost. Close this room and create a new one to make calls.';
    } else {
      final isMicEnabledValue = isMicEnabled.value;
      if (isMicEnabledValue) {
        return 'Microphone is ready. You can now make calls from this room.';
      } else {
        return 'Turn on your microphone before making calls. Click the microphone button below.';
      }
    }
  }

  Widget _buildHeaderStatusRow(bool isConnected,
      List<Map<String, dynamic>> participants, bool agentInRoom) {
    final bool showAudioIndicator =
        _showRoomAudio && allRoomAudios.value.isNotEmpty;
    final double width = MediaQuery.of(context).size.width;
    final bool isMobile = width < 480; // Responsive breakpoint for mobile

    // Shared widgets
    Widget connectionChip = Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: isConnected ? Colors.green.shade100 : Colors.red.shade100,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.circle,
            size: 8,
            color: isConnected ? Colors.green : Colors.red,
          ),
          const SizedBox(width: 4),
          Text(
            isConnected ? 'Connected' : 'Disconnected',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w500,
              color: isConnected ? Colors.green.shade700 : Colors.red.shade700,
            ),
          ),
        ],
      ),
    );

    Widget? audioChip = showAudioIndicator
        ? Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: Colors.orange.shade100,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.audiotrack, size: 14, color: Colors.orange.shade700),
                const SizedBox(width: 4),
                Text(
                  'Audio Active',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    color: Colors.orange.shade700,
                  ),
                ),
              ],
            ),
          )
        : null;

    Widget? participantsChip = participants.isNotEmpty
        ? Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color:
                  agentInRoom ? Colors.purple.shade100 : Colors.blue.shade100,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  Icons.people,
                  size: 14,
                  color: agentInRoom
                      ? Colors.purple.shade700
                      : Colors.blue.shade700,
                ),
                const SizedBox(width: 4),
                Expanded(
                  child: Text(
                    _buildParticipantsList(participants),
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w500,
                      color: agentInRoom
                          ? Colors.purple.shade700
                          : Colors.blue.shade700,
                    ),
                    overflow: TextOverflow.ellipsis,
                    maxLines: 1,
                  ),
                ),
              ],
            ),
          )
        : null;

    if (isMobile) {
      // Two-row layout for mobile: first row = connection + audio; second row = participants full-width
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              connectionChip,
              const Spacer(),
              if (audioChip != null) audioChip,
            ],
          ),
          if (participantsChip != null) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(child: participantsChip),
              ],
            ),
          ],
        ],
      );
    }

    // Desktop/tablet: original single-row layout with safer width handling
    return Row(
      children: [
        connectionChip,
        const SizedBox(width: 12),
        if (participantsChip != null) Expanded(child: participantsChip),
        const Spacer(),
        if (audioChip != null) audioChip,
      ],
    );
  }

  Widget _buildRoomControls(bool isConnected, bool agentInRoom,
      bool activeSourceIsAgent, bool canControlAgent) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Primary Controls
        LayoutBuilder(
          builder: (context, constraints) {
            // Adjust spacing based on available width
            final spacing = constraints.maxWidth < 400 ? 8.0 : 12.0;
            final runSpacing = constraints.maxWidth < 400 ? 6.0 : 8.0;

            return Wrap(
              spacing: spacing,
              runSpacing: runSpacing,
              children: [
                // Microphone Control - Always available
                _buildControlButton(
                  icon: isMicEnabled.value ? Icons.mic : Icons.mic_off,
                  label: isMicEnabled.value ? 'Mute' : 'Unmute',
                  onPressed: isConnected ? _toggleMicrophone : null,
                  backgroundColor:
                      isMicEnabled.value ? Colors.green : Colors.red,
                  tooltip: isMicEnabled.value
                      ? 'Mute microphone'
                      : 'Unmute microphone',
                ),

                // SIP Call Controls - Only show when we have a valid call ID
                if (widget.callId?.isNotEmpty == true) ...[
                  // End Call
                  _buildControlButton(
                    icon: Icons.call_end,
                    label: 'End Call',
                    onPressed: isConnected ? _handleEndCall : null,
                    backgroundColor: Colors.red,
                    tooltip: 'End SIP call',
                  ),

                  // Hold/Resume
                  _buildControlButton(
                    icon: _isHoldLoading
                        ? Icons.hourglass_bottom
                        : _isOnHold
                            ? Icons.play_arrow
                            : Icons.pause,
                    label: _isHoldLoading
                        ? 'Processing...'
                        : _isOnHold
                            ? 'Resume'
                            : 'Hold',
                    onPressed:
                        isConnected && !_isHoldLoading ? _toggleHold : null,
                    backgroundColor: _isOnHold ? Colors.green : Colors.orange,
                    tooltip: _isHoldLoading
                        ? 'Processing...'
                        : _isOnHold
                            ? 'Resume call'
                            : 'Hold call',
                    isLoading: _isHoldLoading,
                  ),

                  // Leave Room - For incoming calls (safe to leave without ending call)
                  if (!widget.isOutgoingCallSetup)
                    _buildControlButton(
                      icon: Icons.exit_to_app,
                      label: 'Leave Room',
                      onPressed: isConnected ? _handleDisconnect : null,
                      backgroundColor: Colors.grey.shade600,
                      tooltip:
                          'Leave MediaSFU room (call continues in background)',
                    ),

                  // Close Room for Outgoing Setups
                  if (widget.isOutgoingCallSetup)
                    _buildControlButton(
                      icon: Icons.close,
                      label: 'Close Room',
                      onPressed: () => _showCloseRoomConfirmation(true),
                      backgroundColor: Colors.orange,
                      tooltip: 'Close voice room (may end active calls)',
                    ),
                ] else ...[
                  // Close Room - When no active call
                  if (!widget.isOutgoingCallSetup)
                    _buildControlButton(
                      icon: Icons.close,
                      label: 'Close Room',
                      onPressed: isConnected ? _handleDisconnect : null,
                      backgroundColor: Colors.grey.shade600,
                      tooltip: 'Close room and disconnect',
                    )
                  else
                    _buildControlButton(
                      icon: Icons.close,
                      label: 'Close Room',
                      onPressed: () => _showCloseRoomConfirmation(false),
                      backgroundColor: Colors.orange,
                      tooltip: 'Close voice room',
                    ),
                ],
              ],
            );
          },
        ),

        const SizedBox(height: 16),

        // Secondary Controls - Conditional display based on call state
        if (widget.callId?.isNotEmpty == true)
          _buildSecondaryControls(
              isConnected, agentInRoom, activeSourceIsAgent, canControlAgent),

        const SizedBox(height: 16),

        // Audio Controls
        _buildAudioControls(),
      ],
    );
  }

  Widget _buildSecondaryControls(bool isConnected, bool agentInRoom,
      bool activeSourceIsAgent, bool canControlAgent) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: Colors.blue.withValues(alpha: 0.2),
          width: 1,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Section Header
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(
                  color: Colors.blue.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Icon(
                  Icons.tune,
                  color: Colors.blue.shade600,
                  size: 16,
                ),
              ),
              const SizedBox(width: 8),
              Text(
                'Advanced Controls',
                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w600,
                      color: Colors.blue.shade700,
                    ),
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Controls Grid - Enhanced spacing and button sizing to prevent accidental clicks
          Wrap(
            spacing: 12, // Increased from 8 to 12 for better separation
            runSpacing: 12, // Increased from 8 to 12 for better separation
            children: [
              // Advanced Controls Toggle - Opens Modal
              _buildEnhancedControlButton(
                icon: Icons.settings,
                label: 'Advanced',
                onPressed: isConnected ? _showAdvancedControlsModal : null,
                backgroundColor: Colors.blue.shade600,
                tooltip:
                    'Open Advanced Controls (TTS, Audio, Source Switching)',
                style: ControlButtonStyle.primary,
              ),

              // Take Control - Enhanced human takeover with better visibility
              // Show when: agent is active, user has control, or there's an agent in room
              if (activeSourceIsAgent || _hasHumanControl || agentInRoom)
                _buildEnhancedControlButton(
                  icon: Icons.person,
                  label: _isTakeControlLoading
                      ? 'Taking...'
                      : _hasHumanControl
                          ? 'You Have Control'
                          : activeSourceIsAgent
                              ? 'Take Control'
                              : 'Take Control',
                  onPressed: isConnected &&
                          canControlAgent &&
                          !_hasHumanControl &&
                          !_isTakeControlLoading &&
                          !_isAgentLoading
                      ? _handleTakeControl
                      : null,
                  backgroundColor: _hasHumanControl
                      ? Colors.green.shade600
                      : activeSourceIsAgent
                          ? Colors.blue.shade600
                          : Colors.orange.shade600,
                  tooltip: _hasHumanControl
                      ? 'You have control of the conversation'
                      : activeSourceIsAgent
                          ? 'Agent is currently active - take control to speak'
                          : agentInRoom
                              ? 'Agent is available - take control to manage conversation'
                              : 'Take control of conversation',
                  isLoading: _isTakeControlLoading,
                  style: _hasHumanControl
                      ? ControlButtonStyle.success
                      : activeSourceIsAgent
                          ? ControlButtonStyle.primary
                          : ControlButtonStyle.warning,
                ),

              // Smart Switch - Intelligent source switching
              if (!activeSourceIsAgent && agentInRoom)
                _buildEnhancedControlButton(
                  icon: Icons.smart_toy,
                  label: _isToAgentLoading ? 'Switching...' : 'To Agent',
                  onPressed: isConnected &&
                          canControlAgent &&
                          !_isToAgentLoading &&
                          !_isAgentLoading
                      ? _handleSmartSourceSwitch
                      : null,
                  backgroundColor: Colors.purple.shade600,
                  tooltip: 'Switch to AI agent',
                  isLoading: _isToAgentLoading,
                  style: ControlButtonStyle.secondary,
                ),

              // Show "Start Agent" option when no agent is in room
              if (!agentInRoom && !_hasHumanControl)
                _buildEnhancedControlButton(
                  icon: Icons.add_circle,
                  label: 'Start Agent',
                  onPressed:
                      isConnected && canControlAgent ? _handleStartAgent : null,
                  backgroundColor: Colors.teal.shade600,
                  tooltip: 'Start AI agent for this conversation',
                  style: ControlButtonStyle.secondary,
                ),

              // Start/Stop Agent - Show based on intelligent agent status
              if (agentInRoom) ...[
                if (_shouldShowStartAgent())
                  _buildEnhancedControlButton(
                    icon: _isAgentLoading
                        ? Icons.hourglass_bottom
                        : Icons.play_arrow,
                    label: _isAgentLoading ? 'Starting...' : 'Start Agent',
                    onPressed:
                        isConnected && canControlAgent && !_isAgentLoading
                            ? _handleStartAgent
                            : null,
                    backgroundColor: Colors.green.shade600,
                    tooltip: _isAgentLoading
                        ? 'Starting agent...'
                        : 'Start AI agent',
                    isLoading: _isAgentLoading,
                    style: ControlButtonStyle.success,
                  ),
                if (_shouldShowStopAgent())
                  _buildEnhancedControlButton(
                    icon: _isAgentLoading ? Icons.hourglass_bottom : Icons.stop,
                    label: _isAgentLoading ? 'Stopping...' : 'Stop Agent',
                    onPressed:
                        isConnected && canControlAgent && !_isAgentLoading
                            ? _handleStopAgent
                            : null,
                    backgroundColor: Colors.red.shade600,
                    tooltip:
                        _isAgentLoading ? 'Stopping agent...' : 'Stop AI agent',
                    isLoading: _isAgentLoading,
                    style: ControlButtonStyle.danger,
                  ),
              ],

              // Bot Audio Scope
              _buildEnhancedControlButton(
                icon: _isPlayToAllLoading
                    ? Icons.hourglass_bottom
                    : Icons.volume_up,
                label: _isPlayToAllLoading
                    ? 'Updating...'
                    : isPlayToAll.value
                        ? 'Bot Audio: ALL'
                        : 'Bot Audio: Caller',
                onPressed: isConnected && !_isPlayToAllLoading
                    ? _handlePlayToAllToggle
                    : null,
                backgroundColor: isPlayToAll.value
                    ? Colors.orange.shade600
                    : Colors.grey.shade600,
                tooltip: _isPlayToAllLoading
                    ? 'Updating bot audio scope...'
                    : isPlayToAll.value
                        ? 'Bot audio playing to ALL participants'
                        : 'Bot audio playing to SIP caller ONLY',
                isLoading: _isPlayToAllLoading,
                style: isPlayToAll.value
                    ? ControlButtonStyle.warning
                    : ControlButtonStyle.neutral,
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildAudioControls() {
    return Row(
      children: [
        // Room Audio Toggle
        _buildControlButton(
          icon: _showRoomAudio ? Icons.volume_up : Icons.volume_off,
          label: 'Room Audio',
          onPressed: _toggleRoomAudio,
          backgroundColor: _showRoomAudio ? Colors.blue : Colors.grey,
          tooltip: _showRoomAudio ? 'Hide room audio' : 'Show room audio',
        ),

        const SizedBox(width: 12),

        // Audio Status
        Expanded(
          child: Text(
            'Room Audio: ${_showRoomAudio ? 'Listening' : 'Muted'}',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: _showRoomAudio
                      ? Colors.blue.shade700
                      : Colors.grey.shade600,
                  fontWeight: FontWeight.w500,
                ),
          ),
        ),
      ],
    );
  }

  Widget _buildStatusIndicators(Map<String, dynamic> micStatus) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Microphone Status
        Row(
          children: [
            Icon(
              Icons.mic,
              size: 16,
              color: micStatus['color'] as Color?,
            ),
            const SizedBox(width: 8),
            Text(
              micStatus['text'] as String,
              style: TextStyle(
                color: micStatus['color'] as Color?,
                fontWeight: FontWeight.w500,
              ),
            ),
            if (isMicEnabled.value) ...[
              const SizedBox(width: 12),
              // Audio Level Meter
              Container(
                width: 60,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.grey.shade300,
                  borderRadius: BorderRadius.circular(2),
                ),
                child: FractionallySizedBox(
                  alignment: Alignment.centerLeft,
                  widthFactor: audioLevel.value.clamp(0.0, 1.0),
                  child: Container(
                    decoration: BoxDecoration(
                      color: Colors.green,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
              ),
            ],
          ],
        ),

        // Hold Status
        if (_isOnHold) ...[
          const SizedBox(height: 8),
          Row(
            children: [
              const Icon(Icons.pause, size: 16, color: Colors.orange),
              const SizedBox(width: 8),
              Text(
                'On Hold',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: Colors.orange,
                      fontWeight: FontWeight.w500,
                    ),
              ),
            ],
          ),
        ],
      ],
    );
  }

  Widget _buildControlButton({
    required IconData icon,
    required String label,
    required VoidCallback? onPressed,
    required Color backgroundColor,
    String? tooltip,
    bool isLoading = false,
  }) {
    return Tooltip(
      message: tooltip ?? label,
      child: ElevatedButton.icon(
        onPressed: onPressed,
        icon: isLoading
            ? const SizedBox(
                width: 16,
                height: 16,
                child: CircularProgressIndicator(
                    strokeWidth: 2, color: Colors.white),
              )
            : Icon(icon, size: 16),
        label: Text(label),
        style: ElevatedButton.styleFrom(
          backgroundColor: backgroundColor,
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          minimumSize: const Size(0, 36),
        ),
      ),
    );
  }

  // Enhanced control button with more styling options
  Widget _buildEnhancedControlButton({
    required IconData icon,
    required String label,
    required VoidCallback? onPressed,
    required Color backgroundColor,
    String? tooltip,
    bool isLoading = false,
    ControlButtonStyle style = ControlButtonStyle.primary,
  }) {
    Color? foregroundColor;
    Color? borderColor;
    bool isOutlined = false;

    switch (style) {
      case ControlButtonStyle.primary:
        foregroundColor = Colors.white;
        break;
      case ControlButtonStyle.secondary:
        foregroundColor = Colors.white;
        break;
      case ControlButtonStyle.success:
        foregroundColor = Colors.white;
        break;
      case ControlButtonStyle.danger:
        foregroundColor = Colors.white;
        break;
      case ControlButtonStyle.warning:
        foregroundColor = Colors.white;
        break;
      case ControlButtonStyle.neutral:
        foregroundColor = Colors.white;
        isOutlined = true;
        borderColor = backgroundColor;
        break;
    }

    return Tooltip(
      message: tooltip ?? label,
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(8),
          boxShadow: [
            BoxShadow(
              color: backgroundColor.withValues(alpha: 0.3),
              blurRadius: 4,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: isOutlined
            ? OutlinedButton.icon(
                onPressed: onPressed,
                icon: isLoading
                    ? SizedBox(
                        width: 14,
                        height: 14,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: backgroundColor,
                        ),
                      )
                    : Icon(icon, size: 16), // Increased from 14 to 16
                label: Text(
                  label,
                  style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w500), // Increased from 12 to 13
                ),
                style: OutlinedButton.styleFrom(
                  foregroundColor: backgroundColor,
                  side: BorderSide(color: borderColor ?? backgroundColor),
                  padding: const EdgeInsets.symmetric(
                      horizontal: 14, vertical: 15), // Increased padding
                  minimumSize: const Size(0, 40), // Increased from 32 to 40
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
              )
            : ElevatedButton.icon(
                onPressed: onPressed,
                icon: isLoading
                    ? const SizedBox(
                        width: 14,
                        height: 14,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : Icon(icon, size: 16), // Increased from 14 to 16
                label: Text(
                  label,
                  style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w500), // Increased from 12 to 13
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: backgroundColor,
                  foregroundColor: foregroundColor,
                  padding: const EdgeInsets.symmetric(
                      horizontal: 14, vertical: 15), // Increased padding
                  minimumSize: const Size(0, 40), // Increased from 32 to 40
                  elevation: 2,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
              ),
      ),
    );
  }

  // AudioGrid component - provides MediaSFU audio functionality
  Widget _buildHiddenAudioGrid() {
    if (!_showRoomAudio) return const SizedBox.shrink();

    // Hidden AudioGrid with MediaSFU functionality
    return SizedBox(
      height: 0,
      width: 0,
      child: AudioGrid(
        options: AudioGridOptions(componentsToRender: allRoomAudios.value),
      ),
    );
  }

  void _showCloseRoomConfirmation(bool hasActiveCall) {
    setState(() {
      _confirmationConfig = {
        'title': 'Close Voice Room',
        'message': hasActiveCall
            ? 'Closing this room may end any active calls. Are you sure you want to continue?'
            : 'Are you sure you want to close this voice room? You can create a new one anytime.',
        'type': 'warning',
        'onConfirm': () {
          setState(() => _showConfirmation = false);
          _handleDisconnect();
        }
      };
      _showConfirmation = true;
    });
  }

  // Hold Options Modal
  Widget _buildHoldOptionsModal() {
    String message = '';
    bool pauseRecording = true;

    return Container(
      color: Colors.black.withValues(alpha: 0.5),
      child: Center(
        child: Container(
          margin: const EdgeInsets.all(24),
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: Theme.of(context).cardColor,
            borderRadius: BorderRadius.circular(12),
          ),
          child: StatefulBuilder(
            builder: (context, setModalState) => Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Header
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'Hold Call Options',
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                    ),
                    IconButton(
                      onPressed: () => setState(() => _showHoldModal = false),
                      icon: const Icon(Icons.close),
                    ),
                  ],
                ),

                const SizedBox(height: 24),

                // Message input
                TextField(
                  decoration: const InputDecoration(
                    labelText: 'Optional Hold Message',
                    hintText: 'Message to play during hold',
                    border: OutlineInputBorder(),
                  ),
                  onChanged: (value) => message = value,
                ),

                const SizedBox(height: 16),

                // Pause recording checkbox
                CheckboxListTile(
                  value: pauseRecording,
                  onChanged: (value) =>
                      setModalState(() => pauseRecording = value ?? true),
                  title: const Text('Pause recording during hold'),
                  controlAffinity: ListTileControlAffinity.leading,
                ),

                const SizedBox(height: 24),

                // Actions
                Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    TextButton(
                      onPressed: () => setState(() => _showHoldModal = false),
                      child: const Text('Cancel'),
                    ),
                    const SizedBox(width: 12),
                    ElevatedButton(
                      onPressed: () =>
                          _handleHoldWithOptions(message, pauseRecording),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.orange,
                        foregroundColor: Colors.white,
                      ),
                      child: const Text('Hold Call'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  // Confirmation Modal
  Widget _buildConfirmationModal() {
    final config = _confirmationConfig!;

    return Container(
      color: Colors.black.withValues(alpha: 0.5),
      child: Center(
        child: Container(
          margin: const EdgeInsets.all(24),
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: Theme.of(context).cardColor,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                _getConfirmationIcon(config['type'] as String),
                size: 48,
                color: _getConfirmationColor(config['type'] as String),
              ),
              const SizedBox(height: 16),
              Text(
                config['title'] as String,
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              Text(
                config['message'] as String,
                style: Theme.of(context).textTheme.bodyMedium,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),
              Row(
                children: [
                  Expanded(
                    child: TextButton(
                      onPressed: () =>
                          setState(() => _showConfirmation = false),
                      child: const Text('Cancel'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: () => (config['onConfirm'] as VoidCallback)(),
                      style: ElevatedButton.styleFrom(
                        backgroundColor:
                            _getConfirmationColor(config['type'] as String),
                        foregroundColor: Colors.white,
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

  IconData _getConfirmationIcon(String type) {
    switch (type) {
      case 'warning':
        return Icons.warning;
      case 'danger':
        return Icons.error;
      default:
        return Icons.info;
    }
  }

  Color _getConfirmationColor(String type) {
    switch (type) {
      case 'warning':
        return Colors.orange;
      case 'danger':
        return Colors.red;
      default:
        return Colors.blue;
    }
  }
}
