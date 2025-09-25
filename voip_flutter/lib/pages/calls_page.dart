// ignore_for_file: prefer_const_constructors

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:async';
import 'dart:convert';
import '../providers/voip_config_provider.dart';
import '../providers/call_manager_provider.dart';
import '../services/call_service.dart';
import '../types/call_types.dart';
import '../types/api_types.dart';
import '../types/ui_state_types.dart';
import '../utils/logger.dart';
import '../widgets/mediasfu_room_display.dart';
import 'package:dlibphonenumber/dlibphonenumber.dart';

class CallsPage extends StatefulWidget {
  const CallsPage({super.key});

  @override
  State<CallsPage> createState() => _CallsPageState();
}

class _CallsPageState extends State<CallsPage>
    with TickerProviderStateMixin, WidgetsBindingObserver {
  final TextEditingController _phoneController = TextEditingController();
  final CallService _callService = CallService();
  // Removed unused dialer animation fields

  // Basic state variables from ReactJS - exact match
  String _phoneNumber = '+';
  bool _isDialing = false;
  String _selectedFromNumber = '';

  // MediaSFU Room State - Enhanced with outgoing call room management
  String _currentRoomName = '';
  String _requestedRoomName = '';
  String _currentParticipantName = 'voipuser';
  bool _isConnectedToRoom = false;
  bool _isMicrophoneEnabled = false;

  // Quick settings state
  int _selectedDuration = 15; // Default 15 minutes

  // Outgoing call room state (transitioning to hook - use hook as primary source)
  OutgoingCallRoom? _legacyOutgoingCallRoom;

  // Dialpad State
  bool _isDialpadCollapsed = true;

  // Notification State for toast messages
  NotificationState _notification = NotificationState(
    isOpen: false,
    title: '',
    message: '',
    type: 'info',
  );

  // Microphone confirmation state
  ConfirmationState _microphoneConfirmation = ConfirmationState(
    isOpen: false,
    onConfirm: null,
    onCancel: null,
  );

  // Flag to track if microphone confirmation was already given
  final bool _microphoneConfirmationGiven = false;

  // Navigation confirmation state
  NavigationConfirmationState _navigationConfirmation =
      NavigationConfirmationState(
        isOpen: false,
        onConfirm: null,
        onCancel: null,
        message: '',
      );

  Timer? _callStatusInterval;
  Timer? _botCallTimeoutRef;
  Timer? _uiTickTimer; // periodic UI refresh
  Timer? _monitoringTimeout; // call monitoring auto-stop
  Timer? _backoffTimer; // rate limit backoff delay
  String? _roomManuallyClosedRef;
  Timer? _callResolveTimeoutRef;

  // Cache for created rooms to avoid async calls in sync methods
  Set<String> _cachedCreatedRooms = <String>{};
  // Extended metadata for rooms we created: roomName -> { originalParticipantName, createdAt }
  Map<String, Map<String, dynamic>> _createdRoomsMeta =
      <String, Map<String, dynamic>>{};
  bool _isRoomSwitching = false;

  // All Current Calls (incoming + outgoing) - These are "active calls" that are not terminated
  List<Call> _currentCalls = [];

  // Shared API call cache to prevent rate limiting
  Map<String, dynamic>? _cachedCallsResponse;
  DateTime? _cacheTimestamp;
  final int _apiCallCacheTimeout = 3000; // 3 seconds cache

  // Enhanced outgoing call room management using reference pattern
  OutgoingCallRoom? _hookOutgoingCallRoom;

  Timer? _callsPollingInterval;
  final Set<String> _expandedCalls = {};
  final Set<String> _collapsedMetadata = {};
  // Removed unused live duration trigger counter
  bool _showDialer = false;

  // Room creation loading state
  bool _isCreatingRoom = false;
  // ignore: unused_field
  String? _roomCreationError;
  // Track when we're actively resolving a freshly placed outgoing call
  bool _isResolvingOutgoingCall = false;
  Timer? _roomCreationTimeoutRef;
  Timer? _roomValidationTimer;

  // Track SIP participant presence for outgoing call feedback
  final Set<String> _observedSipParticipants = <String>{};
  bool _hasDetectedSipParticipant = false;

  // Notification debounce - prevent duplicate call ended notifications
  // Removed unused call end notification tracking fields

  // Controlled outgoing call flow state
  String _callFlowStep =
      'closed'; // closed, select-number, enter-phone, choose-mode, connecting, connected

  // Call mode selection state
  String? _selectedCallMode; // 'bot' or 'voice' - null means no selection yet

  // SIP Configuration State
  List<SIPConfig> _sipConfigs = [];
  bool _sipLoading = false;

  // Use dummy call for outgoing room display (following reference pattern)
  // Enhanced current calls - ONLY real SIP calls, not dummy room setup calls
  List<Call> get _enhancedCurrentCalls {
    List<Call> calls = [..._currentCalls];

    // Don't add dummy calls to active calls list - room setup is separate from active calls
    // The room interface will be shown separately at the top of the page
    // Only real SIP calls should appear as "active calls"

    DateTime? extractStart(Call call) {
      if (call.startTime != null) return call.startTime;
      if (call.startTimeISO.isEmpty) return null;
      return DateTime.tryParse(call.startTimeISO);
    }

    calls.sort((a, b) {
      final DateTime? startA = extractStart(a);
      final DateTime? startB = extractStart(b);

      if (startA == null && startB == null) {
        return 0;
      } else if (startA == null) {
        return 1;
      } else if (startB == null) {
        return -1;
      }

      return startB.compareTo(startA);
    });

    return calls;
  }

  // Use hook's outgoing room as primary source, fallback to legacy
  OutgoingCallRoom? get _outgoingCallRoom =>
      _hookOutgoingCallRoom ?? _legacyOutgoingCallRoom;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);

    _phoneController.text = '+';
    _phoneController.addListener(_validatePhoneNumber);

    // Initialize animation controller
    // (Removed) Unused dialer animation setup

    // Load created rooms cache (equivalent to React.js getCreatedRooms)
    _loadCreatedRoomsCache();

    // Fetch SIP configurations
    _fetchSipConfigs();

    // Start continuous polling when component mounts
    _startContinuousCallsPolling();

    // Start background room validation (similar to React.js useEffect)
    _startRoomValidation();

    // Live duration updates for active calls
    _uiTickTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (mounted) {
        // Trigger a rebuild to refresh durations
        setState(() {});
      }
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _phoneController.dispose();
    _stopContinuousCallsPolling();
    _stopRoomValidation();
    _callStatusInterval?.cancel();
    _botCallTimeoutRef?.cancel();
    _uiTickTimer?.cancel();
    _monitoringTimeout?.cancel();
    _backoffTimer?.cancel();
    _roomCreationTimeoutRef?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Navigation protection - warn when leaving page with active MediaSFU room
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.detached) {
      final hasActiveMediaSFU =
          _isConnectedToRoom && _currentRoomName.isNotEmpty;
      final hasActiveCalls = _currentCalls.isNotEmpty;

      if (hasActiveMediaSFU || hasActiveCalls) {
        // App is being backgrounded with active connections
        Logger.info(
          'App backgrounded with active connections - hasActiveMediaSFU: $hasActiveMediaSFU, hasActiveCalls: $hasActiveCalls, currentRoomName: $_currentRoomName',
        );
      }
    }
  }

  // Helper function for duration calculation with fallback like react_ref
  String _formatDurationWithFallback(Call call) {
    // Skip duration for booth rooms without real SIP calls (dummy calls)
    if (call.extras?['isOutgoingRoomSetup'] == true &&
        (call.sipCallId.isEmpty || call.sipCallId.startsWith('dummy_'))) {
      return '—'; // Show dash instead of duration for booth rooms without active calls
    }

    // If we have a valid duration, use it
    if (call.durationSeconds > 0) {
      return _formatDuration(call.durationSeconds);
    }

    // For active calls with zero duration, calculate runtime duration
    if (call.startTimeISO.isNotEmpty &&
        ![
          'TERMINATED',
          'FAILED',
          'COMPLETED',
        ].contains(call.status.toString().toUpperCase())) {
      try {
        // Handle both ISO string format and timestamp formats
        DateTime startTime;
        final startTimeFromISO = DateTime.tryParse(call.startTimeISO);

        if (startTimeFromISO == null) {
          // If ISO parsing failed, try as timestamp (fallback)
          final timestamp = int.tryParse(call.startTimeISO);
          if (timestamp != null) {
            final timestampMs = timestamp < 10000000000
                ? timestamp * 1000
                : timestamp;
            startTime = DateTime.fromMillisecondsSinceEpoch(timestampMs);
          } else {
            throw const FormatException('Invalid timestamp format');
          }
        } else {
          startTime = startTimeFromISO;
        }

        final currentTime = DateTime.now();
        final runtimeSeconds = currentTime.difference(startTime).inSeconds;

        if (runtimeSeconds > 0) {
          return '${_formatDuration(runtimeSeconds)} (live)';
        }
      } catch (error) {
        // Failed to calculate runtime duration - continue with fallback
      }
    }

    // For terminated calls with zero duration, try to calculate from start/end times
    if (call.startTimeISO.isNotEmpty &&
        [
          'TERMINATED',
          'COMPLETED',
        ].contains(call.status.toString().toUpperCase())) {
      try {
        // Handle both ISO string format and timestamp formats for start time
        DateTime startTime;
        final startTimeFromISO = DateTime.tryParse(call.startTimeISO);

        if (startTimeFromISO == null) {
          // If ISO parsing failed, try as timestamp
          final timestamp = int.tryParse(call.startTimeISO);
          if (timestamp != null) {
            final timestampMs = timestamp < 10000000000
                ? timestamp * 1000
                : timestamp;
            startTime = DateTime.fromMillisecondsSinceEpoch(timestampMs);
          } else {
            throw const FormatException('Invalid start timestamp format');
          }
        } else {
          startTime = startTimeFromISO;
        }

        // Handle end time similarly if available
        DateTime estimatedEndTime;
        if (call.endTimeISO != null && call.endTimeISO!.isNotEmpty) {
          final endTimeFromISO = DateTime.tryParse(call.endTimeISO!);
          if (endTimeFromISO == null) {
            final timestamp = int.tryParse(call.endTimeISO!);
            if (timestamp != null) {
              final timestampMs = timestamp < 10000000000
                  ? timestamp * 1000
                  : timestamp;
              estimatedEndTime = DateTime.fromMillisecondsSinceEpoch(
                timestampMs,
              );
            } else {
              estimatedEndTime = call.endTime ?? DateTime.now();
            }
          } else {
            estimatedEndTime = endTimeFromISO;
          }
        } else if (call.endTime != null) {
          estimatedEndTime = call.endTime!;
        } else {
          estimatedEndTime = DateTime.now();
        }

        final estimatedSeconds = estimatedEndTime
            .difference(startTime)
            .inSeconds;
        if (estimatedSeconds > 0) {
          final suffix = (call.endTimeISO == null && call.endTime == null)
              ? ' (est.)'
              : '';
          return '${_formatDuration(estimatedSeconds)}$suffix';
        }
      } catch (error) {
        // Failed to calculate estimated duration - continue with fallback
      }
    }

    return '00:00';
  }

  // Basic duration formatter
  String _formatDuration(int seconds) {
    if (seconds < 0) return '00:00';

    final hrs = seconds ~/ 3600;
    final mins = (seconds % 3600) ~/ 60;
    final secs = seconds % 60;

    if (hrs > 0) {
      return '${hrs.toString().padLeft(2, '0')}:${mins.toString().padLeft(2, '0')}:${secs.toString().padLeft(2, '0')}';
    }
    return '${mins.toString().padLeft(2, '0')}:${secs.toString().padLeft(2, '0')}';
  }

  // Shared API call function to prevent rate limiting
  Future<Map<String, dynamic>> _getCallsWithCache() async {
    final now = DateTime.now();

    // Check if we have a recent cached response (within 3 seconds)
    if (_cachedCallsResponse != null &&
        _cacheTimestamp != null &&
        now.difference(_cacheTimestamp!).inMilliseconds <
            _apiCallCacheTimeout) {
      return {'success': true, 'data': _cachedCallsResponse!['data']};
    }

    // Make API call if cache is stale or doesn't exist
    try {
      final response = await _callService.getAllCalls();
      if (response.success && response.data != null) {
        // Cache the response
        _cachedCallsResponse = {'data': response.data};
        _cacheTimestamp = now;
        return {'success': true, 'data': response.data};
      }
      return {'success': false};
    } catch (error) {
      Logger.error('Error in shared API call: $error');
      return {'success': false};
    }
  }

  // Clear cache when appropriate to ensure fresh data for important events
  void _clearApiCache() {
    _cachedCallsResponse = null;
    _cacheTimestamp = null;
  }

  // Room origin tracking system - track which rooms we created via outgoing setup
  Future<void> _loadCreatedRoomsCache() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final stored = prefs.getString('mediasfu_created_rooms');
      final storedMeta = prefs.getString('mediasfu_created_rooms_meta');
      if (stored == null) {
        _cachedCreatedRooms = <String>{};
        // don't return yet; we may still have meta
      }

      final data = stored != null
          ? jsonDecode(stored) as Map<String, dynamic>
          : <String, dynamic>{};
      final meta = storedMeta != null
          ? (jsonDecode(storedMeta) as Map<String, dynamic>).map(
              (k, v) => MapEntry(k, Map<String, dynamic>.from(v as Map)),
            )
          : <String, Map<String, dynamic>>{};
      final now = DateTime.now().millisecondsSinceEpoch;

      // Filter out expired entries (older than 1 day)
      final validRooms = <String>{};
      final validMeta = <String, Map<String, dynamic>>{};
      for (final roomName in data.keys) {
        final timestamp = data[roomName] as int?;
        if (timestamp != null && now - timestamp < 24 * 60 * 60 * 1000) {
          validRooms.add(roomName);
        }
      }

      // Apply expiry to meta using createdAt with type-specific TTL
      // - bot rooms: 1 hour TTL
      // - other rooms (voice/outgoing setup): 24 hours TTL
      for (final entry in meta.entries) {
        final value = entry.value;
        final createdAt = value['createdAt'] as int?;
        final type = (value['type'] as String?)?.toLowerCase();
        final isBotLike = type == 'bot';
        final ttlMs = isBotLike ? (60 * 60 * 1000) : (24 * 60 * 60 * 1000);
        if (createdAt != null && now - createdAt < ttlMs) {
          validMeta[entry.key] = value;
          // Ensure meta rooms also appear in the valid set for quick lookup
          validRooms.add(entry.key);
        }
      }

      // Clean up SharedPreferences if we removed any expired entries
      if (stored != null && validRooms.length != data.length) {
        final cleanData = <String, int>{};
        for (final room in validRooms) {
          final ts = data[room] as int?;
          if (ts != null) cleanData[room] = ts;
        }
        await prefs.setString('mediasfu_created_rooms', jsonEncode(cleanData));
      }

      // Persist cleaned meta
      if (storedMeta != null) {
        await prefs.setString(
          'mediasfu_created_rooms_meta',
          jsonEncode(validMeta),
        );
      }

      setState(() {
        _cachedCreatedRooms = validRooms;
        _createdRoomsMeta = validMeta;
      });
    } catch (error) {
      // Error reading created rooms from SharedPreferences - use empty set
      setState(() {
        _cachedCreatedRooms = <String>{};
        _createdRoomsMeta = <String, Map<String, dynamic>>{};
      });
    }
  }

  Future<void> _markRoomAsCreated(
    String roomName, {
    String? originalParticipantName,
  }) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final existing = prefs.getString('mediasfu_created_rooms');
      final data = existing != null
          ? jsonDecode(existing) as Map<String, dynamic>
          : <String, dynamic>{};
      data[roomName] = DateTime.now().millisecondsSinceEpoch;
      await prefs.setString('mediasfu_created_rooms', jsonEncode(data));

      // Store extended metadata if available
      if (originalParticipantName != null &&
          originalParticipantName.isNotEmpty) {
        final existingMeta = prefs.getString('mediasfu_created_rooms_meta');
        final meta = existingMeta != null
            ? (jsonDecode(existingMeta) as Map<String, dynamic>).map(
                (k, v) => MapEntry(k, Map<String, dynamic>.from(v as Map)),
              )
            : <String, Map<String, dynamic>>{};
        meta[roomName] = {
          'originalParticipantName': _sanitizeParticipantName(
            originalParticipantName,
          ),
          'createdAt': DateTime.now().millisecondsSinceEpoch,
          // rooms marked via this method are regular (non-bot) by default
          'type': 'voice',
        };
        await prefs.setString('mediasfu_created_rooms_meta', jsonEncode(meta));
        _createdRoomsMeta[roomName] = meta[roomName]!;
      }

      // Update cache
      setState(() {
        _cachedCreatedRooms.add(roomName);
      });

      Logger.info('Marking room as created: $roomName');
    } catch (error) {
      // Error storing created room to SharedPreferences - continue without throwing
      Logger.warn('Failed to mark room as created: $error');
    }
  }

  // Specifically mark a real MediaSFU room created for a bot call.
  // We only store metadata with a 1-hour TTL (handled in _loadCreatedRoomsCache)
  Future<void> _markBotRoomMeta(
    String roomName,
    String originalParticipantName,
  ) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final existingMeta = prefs.getString('mediasfu_created_rooms_meta');
      final meta = existingMeta != null
          ? (jsonDecode(existingMeta) as Map<String, dynamic>).map(
              (k, v) => MapEntry(k, Map<String, dynamic>.from(v as Map)),
            )
          : <String, Map<String, dynamic>>{};

      meta[roomName] = {
        'originalParticipantName': _sanitizeParticipantName(
          originalParticipantName,
        ),
        'createdAt': DateTime.now().millisecondsSinceEpoch,
        'type': 'bot',
      };

      await prefs.setString('mediasfu_created_rooms_meta', jsonEncode(meta));

      // Update in-memory caches immediately
      setState(() {
        _createdRoomsMeta[roomName] = meta[roomName]!;
        _cachedCreatedRooms.add(roomName);
      });

      Logger.info('Marked bot-created room meta for: $roomName');
    } catch (error) {
      Logger.warn('Failed to mark bot room meta: $error');
    }
  }

  bool _isRoomCreatedByUs(String roomName) {
    // Quick check for obvious cases first
    if (roomName.startsWith('outgoing_') ||
        (_outgoingCallRoom?.roomName == roomName)) {
      return true;
    }

    // For real MediaSFU rooms, check our persistent cache
    return _cachedCreatedRooms.contains(roomName);
  }

  Map<String, dynamic>? _getRoomMeta(String roomName) {
    return _createdRoomsMeta[roomName];
  }

  // Determine if a room was created by us for voice (non-bot) usage
  bool _isVoiceRoomCreatedByUs(String roomName) {
    final meta = _getRoomMeta(roomName);
    final type = (meta?['type'] as String?)?.toLowerCase();
    if (type == 'bot') return false; // explicitly not voice
    if (type == 'voice') return true;

    // Fallback heuristics: legacy entries without 'type' but clearly our voice setup
    if (_isRoomCreatedByUs(roomName)) {
      if (roomName.startsWith('outgoing_')) return true;
      if (_hookOutgoingCallRoom?.roomName == roomName) return true;
    }
    return false;
  }

  bool _isActiveOutgoingSetupRoomName(String roomName) {
    return _hookOutgoingCallRoom?.isActive == true &&
        _hookOutgoingCallRoom?.roomName == roomName;
  }

  // Determine which room should be shown in the top section.
  // Priority:
  // 1) Active outgoing setup room (always shown at top)
  // 2) A 'voice' room we created (non-bot)
  // Returns null if no top room is available.
  String? _getTopRoomName() {
    if (_hookOutgoingCallRoom?.isActive == true) {
      return _hookOutgoingCallRoom!.roomName;
    }
    if (_currentRoomName.isNotEmpty &&
        _isVoiceRoomCreatedByUs(_currentRoomName)) {
      return _currentRoomName;
    }
    return null;
  }

  Future<void> _propagateRoomMeta(String fromRoom, String toRoom) async {
    if (fromRoom == toRoom) return;
    final meta = _getRoomMeta(fromRoom);
    if (meta == null) return;
    await _markRoomAsCreated(
      toRoom,
      originalParticipantName: meta['originalParticipantName'] as String?,
    );
  }

  String _sanitizeParticipantName(String raw) {
    var name = (raw.isNotEmpty ? raw : 'voipuser').replaceAll(
      RegExp(r'[^a-zA-Z0-9]'),
      '',
    );
    if (name.length < 2) name = 'user';
    if (name.length > 10) name = name.substring(0, 10);
    return name;
  }

  String _getParticipantNameForRoom(String roomName, String desiredOriginal) {
    final desired = _sanitizeParticipantName(desiredOriginal);
    final meta = _getRoomMeta(roomName);
    if (meta == null) return desired;
    final original = _sanitizeParticipantName(
      (meta['originalParticipantName'] as String?) ?? '',
    );
    if (original.isEmpty) return desired;
    if (desired.toLowerCase() == original.toLowerCase()) {
      final match = RegExp(r'^(.*?)(\d+)$').firstMatch(desired);
      String base;
      int nextNum;
      if (match != null) {
        base = match.group(1)!;
        nextNum = int.tryParse(match.group(2)!) ?? 1;
        nextNum += 1;
      } else {
        base = desired;
        nextNum = 2;
      }
      var variant = '$base$nextNum';
      if (variant.length > 10) {
        final suffix = nextNum.toString();
        final allowedBaseLen = 10 - suffix.length;
        base = base.substring(0, allowedBaseLen.clamp(1, base.length));
        variant = '$base$suffix';
      }
      return variant;
    }
    return desired;
  }

  // Step flow management
  void _startCallFlow() {
    setState(() {
      _callFlowStep = 'select-number';
      _showDialer = true;
    });
  }

  void _closeCallFlow() {
    setState(() {
      _callFlowStep = 'closed';
      _showDialer = false;
      // Reset form state when closing
      _phoneNumber = '+';
      _selectedFromNumber = '';
    });
  }

  void _nextStep() {
    setState(() {
      if (_callFlowStep == 'select-number' && _selectedFromNumber.isNotEmpty) {
        _callFlowStep = 'enter-phone';
      } else if (_callFlowStep == 'enter-phone' && _phoneNumber.isNotEmpty) {
        _callFlowStep = 'choose-mode';
        // Auto-select the best available call mode when entering Step 3
        _autoSelectCallMode();
      } else if (_callFlowStep == 'choose-mode') {
        _callFlowStep = 'dialing';
      }
    });
  }

  void _autoSelectCallMode() {
    final selectedConfig = _sipConfigs
        .where((config) => config.contactNumber == _selectedFromNumber)
        .firstOrNull;

    if (selectedConfig == null) return;

    final autoAgent = selectedConfig.autoAgent;

    // Check if bot mode is properly configured for outgoing calls
    final autoAgentAvailable =
        autoAgent?.enabled == true &&
        autoAgent?.type != null &&
        (autoAgent!.type == SIPAutoAgentType.ai ||
            autoAgent.type == SIPAutoAgentType.ivr ||
            autoAgent.type == SIPAutoAgentType.playback);

    final botModeAvailable =
        autoAgentAvailable && autoAgent.outgoingType == SIPAutoAgentType.ai;

    // Enhanced voice mode detection
    final hasExistingActiveRoom =
        (_isConnectedToRoom && _currentRoomName.isNotEmpty) ||
        (_hookOutgoingCallRoom?.isActive == true);
    final canCreateNewRoom =
        !_isConnectedToRoom &&
        _hookOutgoingCallRoom?.isActive != true &&
        _selectedFromNumber.isNotEmpty;

    final voiceModeAvailable = hasExistingActiveRoom || canCreateNewRoom;

    // Auto-select the best available option
    final shouldSelectBot =
        botModeAvailable && (!hasExistingActiveRoom || !_isMicrophoneEnabled);
    final shouldSelectVoice =
        voiceModeAvailable && hasExistingActiveRoom && _isMicrophoneEnabled;

    if (shouldSelectBot) {
      _selectedCallMode = 'bot';
    } else if (shouldSelectVoice) {
      _selectedCallMode = 'voice';
    } else if (botModeAvailable) {
      _selectedCallMode = 'bot';
    } else if (voiceModeAvailable) {
      _selectedCallMode = 'voice';
    } else {
      _selectedCallMode = null;
    }
  }

  void _prevStep() {
    setState(() {
      if (_callFlowStep == 'enter-phone') {
        _callFlowStep = 'select-number';
      } else if (_callFlowStep == 'choose-mode') {
        _callFlowStep = 'enter-phone';
      } else if (_callFlowStep == 'dialing' ||
          _callFlowStep == 'resolving' ||
          _callFlowStep == 'ringing' ||
          _callFlowStep == 'connecting') {
        _callFlowStep = 'choose-mode';
      }
    });
  }

  // Notification helper function
  void _showNotification(String title, String message, {String type = 'info'}) {
    setState(() {
      _notification = NotificationState(
        isOpen: true,
        title: title,
        message: message,
        type: type,
      );
    });
  }

  void _closeNotification() {
    setState(() {
      _notification = NotificationState(
        isOpen: false,
        title: '',
        message: '',
        type: 'info',
      );
    });
  }

  // (Removed) Unused navigation protection helper

  void _stopCallMonitoring() {
    _callStatusInterval?.cancel();
    _monitoringTimeout?.cancel();
  }

  void _updateResolvingOutgoingCall(bool value, {bool restartPolling = true}) {
    if (_isResolvingOutgoingCall == value && value) {
      // Already resolving; ensure timer is active
      return;
    }

    if (!mounted) {
      _isResolvingOutgoingCall = value;
      if (!value) {
        _callResolveTimeoutRef?.cancel();
        _callResolveTimeoutRef = null;
      }
      return;
    }

    void scheduleTimeout() {
      _callResolveTimeoutRef?.cancel();
      _callResolveTimeoutRef = Timer(const Duration(seconds: 105), () {
        if (!mounted) return;
        _callResolveTimeoutRef = null;
        if (_isResolvingOutgoingCall) {
          _updateResolvingOutgoingCall(false);
          _showNotification(
            'Call Timeout',
            'Call attempt timed out after 105 seconds',
            type: 'warning',
          );
          setState(() {
            if (_callFlowStep == 'dialing' ||
                _callFlowStep == 'resolving' ||
                _callFlowStep == 'ringing' ||
                _callFlowStep == 'connecting') {
              _callFlowStep = 'choose-mode';
            }
          });
        }
      });
    }

    setState(() {
      _isResolvingOutgoingCall = value;
    });

    if (value) {
      scheduleTimeout();
    } else {
      _callResolveTimeoutRef?.cancel();
      _callResolveTimeoutRef = null;
    }

    if (restartPolling) {
      _startContinuousCallsPolling();
    }
  }

  // Enhanced call monitoring with proper room state synchronization
  void _startCallMonitoring(String sipCallId, String roomName) {
    _stopCallMonitoring();

    Logger.info(
      '📡 Starting call monitoring for sipCallId: $sipCallId, roomName: $roomName',
    );

    // Track timeout to clear it when call is established
    _monitoringTimeout?.cancel();

    _callStatusInterval = Timer.periodic(const Duration(milliseconds: 2500), (
      timer,
    ) async {
      if (!mounted) {
        timer.cancel();
        return;
      }
      try {
        Logger.debug('🔍 Polling for specific call status...');
        // Capture provider before async gap to avoid context-after-await lint
        final callManager = Provider.of<CallManagerProvider>(
          context,
          listen: false,
        );
        final allCalls = await _getCallsWithCache();

        if (allCalls['success'] == true && allCalls['data'] != null) {
          final calls = (allCalls['data'] as List).map((callData) {
            // Handle both cases: already parsed Call objects and raw Map data
            if (callData is Call) {
              return callData; // Already a Call object
            } else {
              return Call.fromJson(
                callData as Map<String, dynamic>,
              ); // Raw data
            }
          }).toList();

          // Add ALL calls to history (like React version)
          if (calls.isNotEmpty) {
            await callManager.addCallsToHistory(calls);
          }

          // Enhanced call matching logic - match React strategy
          // First try to match by sipCallId, then by roomName
          final call = calls
              .where(
                (c) =>
                    c.id == sipCallId ||
                    c.roomName == roomName ||
                    c.sipCallId == sipCallId,
              )
              .firstOrNull;

          if (call != null) {
            Logger.debug('✅ Found matching call: ${call.sipCallId}');
            final backendStatus = call.status.toString().toLowerCase();

            // Update UI based on call status - matching React switch cases
            switch (backendStatus) {
              case 'ringing':
              case 'initiating':
              case 'connecting':
                final nextPhase = backendStatus == 'ringing'
                    ? 'ringing'
                    : backendStatus == 'initiating'
                    ? 'dialing'
                    : 'connecting';

                // Show progressive status in UI
                setState(() {
                  _callFlowStep = nextPhase;
                });

                // Update outgoing room with ringing call data
                if (_hookOutgoingCallRoom?.isActive == true) {
                  setState(() {
                    _hookOutgoingCallRoom = _hookOutgoingCallRoom!.copyWith(
                      hasActiveSipCall: true,
                      sipCallId: call.sipCallId.isNotEmpty
                          ? call.sipCallId
                          : call.id,
                      callData: <String, dynamic>{
                        'status': call.status.toString(),
                        'direction': call.direction.toString(),
                        'callerIdRaw': call.callerIdRaw,
                        'calledUri': call.calledUri,
                        'startTimeISO': call.startTimeISO,
                        'durationSeconds': call.durationSeconds,
                        'onHold': call.onHold,
                        'activeMediaSource': call.activeMediaSource,
                        'humanParticipantName': call.humanParticipantName,
                        'isRinging': nextPhase == 'ringing',
                      },
                    );
                  });
                }
                break;

              case 'connected':
              case 'answered':
              case 'active':
                Logger.info('🎉 Call connected successfully!');
                setState(() {
                  _callFlowStep = 'connected';
                });

                _updateResolvingOutgoingCall(false);

                // CRITICAL: Update outgoing room with established call data
                if (_hookOutgoingCallRoom?.isActive == true) {
                  setState(() {
                    _hookOutgoingCallRoom = _hookOutgoingCallRoom!.copyWith(
                      hasActiveSipCall: true,
                      sipCallId: call.sipCallId.isNotEmpty
                          ? call.sipCallId
                          : call.id,
                      callData: <String, dynamic>{
                        'status': call.status.toString(),
                        'direction': call.direction.toString(),
                        'callerIdRaw': call.callerIdRaw,
                        'calledUri': call.calledUri,
                        'startTimeISO': call.startTimeISO,
                        'durationSeconds': call.durationSeconds,
                        'onHold': call.onHold,
                        'activeMediaSource': call.activeMediaSource,
                        'humanParticipantName': call.humanParticipantName,
                        'isRinging': false,
                      },
                    );
                  });
                }

                // Auto-hide dialer with smooth transition (matching React timing)
                Timer(const Duration(seconds: 2), () {
                  if (mounted) {
                    setState(() {
                      _showDialer = false;
                      _callFlowStep = 'closed';
                    });
                  }
                });

                // Force UI update to reflect connected state (matching React)
                Timer(const Duration(milliseconds: 100), () {
                  if (mounted) {
                    setState(() {
                      // Trigger re-render to update UI
                    });
                  }
                });

                // Stop monitoring - call is established
                _monitoringTimeout?.cancel();

                // Clear bot call timeout if active (matching React pattern)
                _botCallTimeoutRef?.cancel();
                _botCallTimeoutRef = null;

                _stopCallMonitoring();
                break;

              case 'terminated':
              case 'failed':
              case 'declined':
              case 'busy':
              case 'ended':
                Logger.warn(
                  '📞 Call failed or ended: $backendStatus, callId: $sipCallId',
                );
                setState(() {
                  _callFlowStep = 'closed';
                });

                _updateResolvingOutgoingCall(false);

                // Clear call from outgoing room
                if (_hookOutgoingCallRoom?.isActive == true) {
                  _clearCallFromRoom();
                }

                // Clear bot call timeout if active (matching React pattern)
                _botCallTimeoutRef?.cancel();
                _botCallTimeoutRef = null;

                _stopCallMonitoring();
                break;

              default:
                Logger.debug('❓ Unknown call status: $backendStatus');
            }
          } else {
            Logger.debug(
              '🔍 No matching call found - may still be establishing',
            );
          }
        } else {
          Logger.error('❌ Failed to fetch all calls - cached response failed');
        }
      } catch (error) {
        Logger.error('💥 Error monitoring call status: $error');
      }
    });

    // Auto-stop monitoring after 105 seconds to prevent infinite polling
    _monitoringTimeout = Timer(const Duration(seconds: 105), () {
      Logger.warn('⏰ Call monitoring timeout - stopping after 105 seconds');
      _stopCallMonitoring();
      _updateResolvingOutgoingCall(false);
      if (mounted) {
        setState(() {
          _callFlowStep = 'closed';
        });
      }
    });
  }

  // Helper functions for expandable calls
  void _toggleCallExpansion(String callId) {
    // Find the call being toggled from enhancedCurrentCalls
    final call = _enhancedCurrentCalls
        .where(
          (c) =>
              (c.sipCallId.isNotEmpty
                  ? c.sipCallId
                  : 'call-${_enhancedCurrentCalls.indexOf(c)}') ==
              callId,
        )
        .firstOrNull;

    // Check if this call has an active MediaSFU connection that would be disrupted
    final hasActiveMediaSFU =
        call?.roomName.isNotEmpty == true &&
        _currentRoomName == call!.roomName &&
        _isConnectedToRoom;

    // Check if the MediaSFU interface is currently embedded/displayed for this call
    final isMediaSFUEmbedded =
        hasActiveMediaSFU &&
        _currentRoomName.isNotEmpty &&
        !_isRoomCreatedByUs(_currentRoomName) &&
        _isConnectedToRoom;

    setState(() {
      if (_expandedCalls.contains(callId)) {
        // Only prevent collapsing if MediaSFU is actively embedded for this call
        if (isMediaSFUEmbedded) {
          // Show notification instead of alert
          _showNotification(
            'Cannot Collapse Call',
            'Cannot collapse this call while MediaSFU room interface is active. Please disconnect from the room first using the "Close Room" or "End Call" button in the MediaSFU interface to maintain your connection stability.',
            type: 'warning',
          );
          return; // Don't change the state
        }
        _expandedCalls.remove(callId);
      } else {
        _expandedCalls.add(callId);
      }
    });
  }

  // Helper functions for metadata collapse/expand
  void _toggleMetadataCollapse(String callId) {
    setState(() {
      if (_collapsedMetadata.contains(callId)) {
        _collapsedMetadata.remove(callId);
      } else {
        _collapsedMetadata.add(callId);
      }
    });
  }

  bool _isMetadataCollapsed(String callId) {
    return _collapsedMetadata.contains(callId);
  }

  bool _isCallExpanded(String callId) {
    return _expandedCalls.contains(callId);
  }

  // Get dummy call for outgoing room display

  void _stopContinuousCallsPolling() {
    _callsPollingInterval?.cancel();
    _callsPollingInterval = null;
    _backoffTimer?.cancel();
    _backoffTimer = null;
  }

  // Continuous polling for all calls (incoming + outgoing)
  void _startContinuousCallsPolling() {
    // Clear any existing polling first
    _stopContinuousCallsPolling();

    int consecutiveErrors = 0;
    const maxErrors = 5;
    final pollingInterval = _isResolvingOutgoingCall
        ? const Duration(seconds: 4)
        : const Duration(seconds: 8);

    void pollCalls() async {
      try {
        final allCallsResponse = await _getCallsWithCache();
        if (!mounted) return;
        if (allCallsResponse['success'] == true &&
            allCallsResponse['data'] != null) {
          // Reset error count on successful response
          consecutiveErrors = 0;

          final allCalls = (allCallsResponse['data'] as List).map((callData) {
            // Handle both cases: already parsed Call objects and raw Map data
            if (callData is Call) {
              return callData; // Already a Call object
            } else {
              return Call.fromJson(
                callData as Map<String, dynamic>,
              ); // Raw data
            }
          }).toList();

          // Add ALL calls to history (like React version)
          final callManager = Provider.of<CallManagerProvider>(
            context,
            listen: false,
          );
          if (allCalls.isNotEmpty) {
            await callManager.addCallsToHistory(allCalls);
          }

          // Reconcile saved history: mark calls ended when missing from fetched set
          await _callService.reconcileHistoryWithFetched(allCalls);

          // Enhanced debugging for call visibility
          if (allCalls.isNotEmpty) {
            Logger.debug('📞 Polling found ${allCalls.length} total calls:');
            for (final call in allCalls.take(3)) {
              // Log first 3 calls
              Logger.debug(
                '  - Call ${call.sipCallId}: ${call.status} in room ${call.roomName}',
              );
            }
          }

          // Filter for active/current calls (anything not terminated/terminating)
          final activeCalls = allCalls.where((call) {
            final isActiveCall =
                call.status != CallStatus.ended &&
                call.status != CallStatus.failed &&
                call.status != CallStatus.completed &&
                call.status != CallStatus.rejected &&
                !call.callEnded;

            if (!isActiveCall) {
              Logger.debug(
                'Filtered out call ${call.sipCallId} with status: ${call.status}',
              );
            }
            return isActiveCall;
          }).toList();

          // Remove duplicates based on sipCallId as primary key, fallback to id
          final uniqueActiveCalls = <Call>[];
          for (final call in activeCalls) {
            final callId = call.sipCallId.isNotEmpty ? call.sipCallId : call.id;
            final existingCall = uniqueActiveCalls
                .where(
                  (existing) =>
                      (existing.sipCallId.isNotEmpty &&
                          existing.sipCallId == callId) ||
                      (existing.id?.isNotEmpty == true &&
                          existing.id == callId) ||
                      (existing.sipCallId == call.sipCallId &&
                          call.sipCallId.isNotEmpty) ||
                      (existing.id == call.id && call.id?.isNotEmpty == true),
                )
                .firstOrNull;

            if (existingCall == null) {
              uniqueActiveCalls.add(call);
            } else {
              Logger.debug('Filtered duplicate call: $callId');
            }
          }

          // Update state only if there are actual changes
          if (mounted) {
            setState(() {
              final hasChanges =
                  _currentCalls.length != uniqueActiveCalls.length ||
                  _currentCalls.asMap().entries.any((entry) {
                    final index = entry.key;
                    final prevCall = entry.value;
                    final newCall = index < uniqueActiveCalls.length
                        ? uniqueActiveCalls[index]
                        : null;
                    return newCall == null ||
                        prevCall.sipCallId != newCall.sipCallId ||
                        prevCall.status != newCall.status ||
                        prevCall.roomName != newCall.roomName;
                  });

              if (hasChanges) {
                _currentCalls = uniqueActiveCalls;
              }
            });
          }

          // Enhanced outgoing call room synchronization with establishment detection (following React pattern)
          if (_hookOutgoingCallRoom?.isActive == true) {
            // Look for active calls that match our outgoing room name
            final sipCallInRoom = uniqueActiveCalls
                .where(
                  (call) =>
                      (call.roomName == _hookOutgoingCallRoom!.roomName ||
                          call.roomName ==
                              _hookOutgoingCallRoom!.requestedRoomName) &&
                      ![
                        'ended',
                        'failed',
                        'completed',
                        'rejected',
                      ].contains(call.status.toString().toLowerCase()) &&
                      !call.callEnded,
                )
                .firstOrNull;

            if (sipCallInRoom != null &&
                (_hookOutgoingCallRoom?.hasActiveSipCall != true ||
                    _hookOutgoingCallRoom?.callData == null)) {
              // New call detected - establish connection to room
              // Clear bot call timeout if call is now connected
              if ([
                    'connected',
                    'active',
                  ].contains(sipCallInRoom.status.toString().toLowerCase()) &&
                  _botCallTimeoutRef != null) {
                _botCallTimeoutRef!.cancel();
                _botCallTimeoutRef = null;
                Logger.info('Call connected - cleared timeout');
              }

              // Sync call to room
              _syncCallToRoom(sipCallInRoom);

              // Update UI to reflect call establishment (case-insensitive)
              if (sipCallInRoom.status.toString().toLowerCase() ==
                  'connected') {
                setState(() {
                  _callFlowStep = 'connected';
                });
                _updateResolvingOutgoingCall(false);

                // Auto-hide dialer after call establishment
                Timer(const Duration(seconds: 2), () {
                  if (mounted) {
                    setState(() {
                      _showDialer = false;
                      _callFlowStep = 'closed';
                    });
                  }
                });
              }
            } else if (sipCallInRoom != null &&
                _hookOutgoingCallRoom?.hasActiveSipCall == true &&
                _hookOutgoingCallRoom?.callData != null) {
              // Update existing call data (status changes, duration updates, etc.)
              final currentCallData = _hookOutgoingCallRoom!.callData!;
              final hasStatusChange =
                  currentCallData['status'] != sipCallInRoom.status.toString();
              final hasDurationChange =
                  currentCallData['durationSeconds'] !=
                  sipCallInRoom.durationSeconds;

              if (hasStatusChange || hasDurationChange) {
                setState(() {
                  _hookOutgoingCallRoom = _hookOutgoingCallRoom!.copyWith(
                    callData: <String, dynamic>{
                      ...currentCallData,
                      'status': sipCallInRoom.status.toString(),
                      'durationSeconds': sipCallInRoom.durationSeconds,
                      'onHold': sipCallInRoom.onHold,
                      'activeMediaSource': sipCallInRoom.activeMediaSource,
                    },
                  );
                });

                if (hasStatusChange) {
                  Logger.info(
                    '📱 Call status changed to: ${sipCallInRoom.status} in room ${_hookOutgoingCallRoom!.roomName}',
                  );

                  // Check if call has ended (terminated, failed, completed)
                  final callEndedStatuses = [
                    'terminated',
                    'failed',
                    'completed',
                    'cancelled',
                  ];
                  if (callEndedStatuses.contains(
                    sipCallInRoom.status.toString().toLowerCase(),
                  )) {
                    // Mark outgoing room as no longer having active call but keep room active
                    Timer(const Duration(seconds: 1), () {
                      if (mounted) {
                        setState(() {
                          _hookOutgoingCallRoom = _hookOutgoingCallRoom?.copyWith(
                            hasActiveSipCall: false,
                            sipCallId: '',
                            callData: null,
                            // CRITICAL: Keep room active for next call (following React.js pattern)
                            isActive: true, // Changed from false to true
                          );
                        });
                      }
                    }); // Small delay to allow status display
                    _updateResolvingOutgoingCall(false);
                  }
                }
              }
            } else if (sipCallInRoom == null &&
                _hookOutgoingCallRoom?.hasActiveSipCall == true) {
              // Clear call from room but keep room alive for next call
              _clearCallFromRoom();

              // Check if there are other calls in the room
              final hasOtherCallsInRoom = uniqueActiveCalls.any(
                (call) =>
                    call.roomName == _hookOutgoingCallRoom!.roomName &&
                    call.sipCallId != _hookOutgoingCallRoom!.sipCallId,
              );

              // Only clear MediaSFU state if this was not a room we created for outgoing calls
              // and there are no other calls in the room
              final shouldClearMediaSFU =
                  !hasOtherCallsInRoom &&
                  !_isRoomCreatedByUs(_hookOutgoingCallRoom!.roomName);

              if (shouldClearMediaSFU) {
                _clearMediaSFUState(
                  reason: "outgoing call ended, no other calls in room",
                );
              }

              // Show appropriate notification based on room state
              if (hasOtherCallsInRoom) {
                _showNotification(
                  "Call Ended",
                  "The call has ended. The room is still active and ready for your next call.",
                  type: "info",
                );
              } else if (shouldClearMediaSFU) {
                _showNotification(
                  "Call Ended",
                  "The call has ended and the room has been closed.",
                  type: "info",
                );
              } else {
                _showNotification(
                  "Call Ended",
                  "The call has ended. The room remains active.",
                  type: "info",
                );
              }

              // Clear any dialpad state that might be showing
              setState(() {
                _isDialing = false;
                _phoneNumber = '+'; // Reset to + instead of empty
              });

              _updateResolvingOutgoingCall(false);
            }
          }
        } else {
          consecutiveErrors++;
          Logger.warn(
            'Failed to poll calls ($consecutiveErrors/$maxErrors) - cached response failed',
          );

          // Handle rate limiting differently from other errors
          if (_isRateLimitError(allCallsResponse)) {
            if (_isResolvingOutgoingCall) {
              Logger.warn(
                'Rate limiting detected during active call resolution - maintaining fast polling cadence',
              );
              consecutiveErrors = 0;
              return;
            }
            Logger.warn('Rate limiting detected - will retry after backoff');
            _handleRateLimitBackoff(consecutiveErrors);
            return; // Don't stop polling, just back off
          }

          // Stop polling after too many consecutive errors (non-rate limit)
          if (consecutiveErrors >= maxErrors) {
            Logger.warn('Too many consecutive errors, stopping polling');
            _stopContinuousCallsPolling();
          }
        }
      } catch (error) {
        consecutiveErrors++;
        Logger.error(
          'Error in continuous calls polling ($consecutiveErrors/$maxErrors): $error',
        );

        // Handle rate limiting differently from other errors
        if (_isRateLimitError({'error': error.toString()})) {
          if (_isResolvingOutgoingCall) {
            Logger.warn(
              'Rate limiting detected during active call resolution - maintaining fast polling cadence',
            );
            consecutiveErrors = 0;
            return;
          }
          Logger.warn('Rate limiting detected - will retry after backoff');
          _handleRateLimitBackoff(consecutiveErrors);
          return; // Don't stop polling, just back off
        }

        // Stop polling after too many consecutive errors (non-rate limit)
        if (consecutiveErrors >= maxErrors) {
          Logger.warn('Too many consecutive errors, stopping polling');
          _stopContinuousCallsPolling();
        }
      }
    }

    // Initial poll
    pollCalls();

    // Set up interval polling
    _callsPollingInterval = Timer.periodic(pollingInterval, (timer) {
      pollCalls();
    });
  }

  // Rate limiting detection helper
  bool _isRateLimitError(Map<String, dynamic> response) {
    final error = response['error']?.toString().toLowerCase() ?? '';
    return error.contains('429') ||
        error.contains('rate limit') ||
        error.contains('too many request') ||
        error.contains('quota exceeded');
  }

  // Determine if there are any active (non-terminated) calls for a given room
  bool _hasActiveCallsForRoom(String roomName) {
    if (roomName.isEmpty) return false;
    return _currentCalls.any((call) {
      final status = call.status.toString().toLowerCase();
      final isActive = ![
        'terminated',
        'failed',
        'declined',
        'busy',
        'ended',
        'completed',
      ].contains(status);
      return call.roomName == roomName && isActive;
    });
  }

  // Handle rate limiting with exponential backoff
  void _handleRateLimitBackoff(int consecutiveErrors) {
    if (_isResolvingOutgoingCall) {
      Logger.warn(
        'Skipping rate limit backoff because an outgoing call is still resolving',
      );
      return;
    }

    // Stop current polling
    _stopContinuousCallsPolling();

    // Calculate backoff delay: 2^consecutiveErrors * 30 seconds, max 10 minutes
    final backoffMinutes = (Duration(
      seconds: 30 * (1 << consecutiveErrors),
    ).inMinutes).clamp(1, 10);

    Logger.warn(
      'Rate limiting detected - backing off for $backoffMinutes minutes',
    );

    // Restart polling after backoff period
    _backoffTimer?.cancel();
    _backoffTimer = Timer(Duration(minutes: backoffMinutes), () {
      if (mounted) {
        Logger.info('Rate limit backoff completed - restarting polling');
        _startContinuousCallsPolling();
      }
    });
  }

  void _syncCallToRoom(Call sipCallInRoom) {
    if (mounted && _hookOutgoingCallRoom?.isActive == true) {
      setState(() {
        _hookOutgoingCallRoom = _hookOutgoingCallRoom?.copyWith(
          hasActiveSipCall: true,
          sipCallId: sipCallInRoom.sipCallId.isNotEmpty
              ? sipCallInRoom.sipCallId
              : sipCallInRoom.id,
          callData: <String, dynamic>{
            'status': sipCallInRoom.status.toString(),
            'direction': sipCallInRoom.direction.toString(),
            'callerIdRaw': sipCallInRoom.callerIdRaw,
            'calledUri': sipCallInRoom.calledUri,
            'startTimeISO': sipCallInRoom.startTimeISO,
            'durationSeconds': sipCallInRoom.durationSeconds,
            'onHold': sipCallInRoom.onHold,
            'activeMediaSource': sipCallInRoom.activeMediaSource,
            'humanParticipantName': sipCallInRoom.humanParticipantName,
          },
        );
      });

      Logger.info(
        '📞 Synced SIP call to outgoing room: ${sipCallInRoom.sipCallId.isNotEmpty ? sipCallInRoom.sipCallId : sipCallInRoom.id} in ${_hookOutgoingCallRoom!.roomName}',
      );

      // Handle call establishment for UI updates
      if (sipCallInRoom.status.toString().toLowerCase() == "connected") {
        // Auto-close dialer after call establishment with delay
        Future.delayed(const Duration(seconds: 2), () {
          if (mounted) {
            setState(() {
              _showDialer = false;
            });
          }
        });
      }
    }
  }

  void _createOutgoingRoom(String tempRoomName, String displayName) {
    setState(() {
      _hookOutgoingCallRoom = OutgoingCallRoom(
        roomName: tempRoomName,
        requestedRoomName: tempRoomName,
        displayName: displayName,
        createdAt: DateTime.now(),
        isActive: true,
        hasActiveSipCall: false,
        isMediaSFUConnected: false,
      );
    });
  }

  void _updateRoomName(String realRoomName) {
    if (mounted) {
      setState(() {
        _hookOutgoingCallRoom = _hookOutgoingCallRoom?.copyWith(
          roomName: realRoomName,
        );
      });
    }
  }

  void _clearCallFromRoom() {
    if (mounted && _hookOutgoingCallRoom?.isActive == true) {
      setState(() {
        _hookOutgoingCallRoom = _hookOutgoingCallRoom?.copyWith(
          hasActiveSipCall: false,
          sipCallId: '',
          callData: null,
        );
      });

      Logger.info(
        '🔄 Cleared call from outgoing room - keeping room alive for next call: ${_hookOutgoingCallRoom!.roomName}',
      );
    }

    _resetSipParticipantTracking();
  }

  void _clearOutgoingRoom() {
    if (mounted) {
      final roomName = _hookOutgoingCallRoom?.roomName;
      setState(() {
        _hookOutgoingCallRoom = null;
      });

      // CRITICAL: Clear MediaSFU state when outgoing room is cleared
      // This ensures the "Create Voice Room" button becomes available again
      if (roomName != null && _currentRoomName == roomName) {
        _clearMediaSFUState(reason: 'outgoing room cleared');
      }

      Logger.info('❌ Cleared outgoing call room: ${roomName ?? "unknown"}');
    }

    _resetSipParticipantTracking();
  }

  void _resetSipParticipantTracking() {
    _observedSipParticipants.clear();
    _hasDetectedSipParticipant = false;
  }

  void _handleRoomParticipantsUpdate(
    List<Map<String, dynamic>> updatedParticipants,
  ) {
    if (!mounted) return;

    final trackedPhases = {'dialing', 'resolving', 'ringing', 'connecting'};
    final localName = _currentParticipantName.toLowerCase();

    final Set<String> sipParticipants = <String>{};
    for (final participant in updatedParticipants) {
      final id = (participant['id'] ?? '').toString();
      final name = (participant['name'] ?? '').toString();
      final idLower = id.toLowerCase();
      final nameLower = name.toLowerCase();

      final bool isAgent =
          idLower.endsWith('_agent') || nameLower.endsWith('_agent');
      if (isAgent) continue;

      final bool looksSip =
          idLower.startsWith('sip_') || nameLower.startsWith('sip');
      final bool isSelf = idLower == localName || nameLower == localName;

      if (!isSelf && (looksSip || updatedParticipants.length > 1)) {
        final identifier = id.isNotEmpty
            ? idLower
            : nameLower.isNotEmpty
            ? nameLower
            : '';
        if (identifier.isNotEmpty) {
          sipParticipants.add(identifier);
        }
      }
    }

    final newJoins = sipParticipants.difference(_observedSipParticipants);
    final bool hasNewJoin = newJoins.isNotEmpty;
    final bool everyoneLeft =
        sipParticipants.isEmpty && _observedSipParticipants.isNotEmpty;

    _observedSipParticipants
      ..clear()
      ..addAll(sipParticipants);

    if (everyoneLeft) {
      _hasDetectedSipParticipant = false;

      if (_hookOutgoingCallRoom?.isActive == true) {
        final currentCallData = Map<String, dynamic>.from(
          _hookOutgoingCallRoom!.callData ?? {},
        );
        if (currentCallData.containsKey('isRinging')) {
          currentCallData['isRinging'] = false;
          setState(() {
            _hookOutgoingCallRoom = _hookOutgoingCallRoom!.copyWith(
              callData: currentCallData,
            );
          });
        }
      }
    }

    if (!trackedPhases.contains(_callFlowStep)) {
      return;
    }

    if (hasNewJoin && !_hasDetectedSipParticipant) {
      _hasDetectedSipParticipant = true;

      if (_callFlowStep == 'dialing' || _callFlowStep == 'resolving') {
        setState(() {
          _callFlowStep = 'ringing';
        });
      }

      if (_hookOutgoingCallRoom?.isActive == true) {
        final currentCallData = Map<String, dynamic>.from(
          _hookOutgoingCallRoom!.callData ?? {},
        );
        currentCallData['isRinging'] = true;
        setState(() {
          _hookOutgoingCallRoom = _hookOutgoingCallRoom!.copyWith(
            callData: currentCallData,
          );
        });
      }

      _showNotification(
        'Answered',
        'The remote participant has answered the call and is now connected.',
        type: 'info',
      );
    }
  }

  // Utility function to clear all MediaSFU room state
  void _clearMediaSFUState({String? reason}) {
    setState(() {
      _currentRoomName = '';
      _currentParticipantName = 'voipuser';
      _isConnectedToRoom = false;
      _isMicrophoneEnabled = false;
      _requestedRoomName = '';
      // CRITICAL: Clear loading states to close loading modal
      _isCreatingRoom = false;
      _roomCreationError = null;
    });

    _resetSipParticipantTracking();

    // Clear room creation timeout if active
    _roomCreationTimeoutRef?.cancel();
    _roomCreationTimeoutRef = null;
    _callResolveTimeoutRef?.cancel();
    _callResolveTimeoutRef = null;
    if (_isResolvingOutgoingCall) {
      _updateResolvingOutgoingCall(false, restartPolling: false);
    }

    Logger.info('MediaSFU state cleared: ${reason ?? "No reason provided"}');
  }

  bool get _isApiConfigured {
    try {
      final config = context.read<VoipConfigProvider>().config;
      return config.api.key.isNotEmpty && config.api.userName.isNotEmpty;
    } catch (e) {
      return false;
    }
  }

  // Check if a SIP config is eligible for outgoing calls
  bool _isEligibleForOutgoing(SIPConfig config) {
    // Check if config is eligible for outgoing calls
    return (config.enabled ?? config.supportSipActive ?? true) &&
        config.contactNumber.isNotEmpty &&
        (config.allowOutgoing ?? true);
  }

  // Validate E.164 format using dlibphonenumber
  bool _isValidE164(String phoneNumber) {
    try {
      // Remove any whitespace
      final cleanNumber = phoneNumber.trim();

      // Check if it starts with + (E.164 requirement)
      if (!cleanNumber.startsWith('+')) {
        return false;
      }

      // Use dlibphonenumber for validation
      return PhoneNumberUtil.instance.isValidNumber(
        PhoneNumberUtil.instance.parse(cleanNumber, null),
      );
    } catch (e) {
      return false;
    }
  }

  // Format phone number as user types with dlibphonenumber
  String _formatPhoneNumber(String value) {
    try {
      // Remove all non-digit and non-plus characters
      String cleaned = value.replaceAll(RegExp(r'[^\d+]'), '');

      // Ensure it starts with +
      if (!cleaned.startsWith('+')) {
        cleaned = '+${cleaned.replaceAll('+', '')}';
      } else {
        // Remove any additional + signs after the first one
        cleaned = '+${cleaned.substring(1).replaceAll('+', '')}';
      }

      // Limit to 16 characters (+ and up to 15 digits for E.164)
      cleaned = cleaned.length > 16 ? cleaned.substring(0, 16) : cleaned;

      // Try to format using dlibphonenumber for better formatting
      if (cleaned.length > 2) {
        try {
          final parsedNumber = PhoneNumberUtil.instance.parse(cleaned, null);
          if (PhoneNumberUtil.instance.isValidNumber(parsedNumber)) {
            return PhoneNumberUtil.instance.format(
              parsedNumber,
              PhoneNumberFormat.international,
            );
          }
        } catch (e) {
          // If formatting fails, continue with basic formatting
        }
      }

      return cleaned;
    } catch (e) {
      // Fallback to basic formatting if dlibphonenumber fails
      String cleaned = value.replaceAll(RegExp(r'[^\d+]'), '');
      if (!cleaned.startsWith('+')) {
        cleaned = '+${cleaned.replaceAll('+', '')}';
      } else {
        cleaned = '+${cleaned.substring(1).replaceAll('+', '')}';
      }
      return cleaned.length > 16 ? cleaned.substring(0, 16) : cleaned;
    }
  }

  // Format phone number for display using dlibphonenumber
  String _formatPhoneNumberForDisplay(String phoneNumber) {
    try {
      final cleanNumber = phoneNumber.trim();

      if (!cleanNumber.startsWith('+')) {
        return cleanNumber;
      }

      // Use dlibphonenumber to format in international format for display
      final parsedNumber = PhoneNumberUtil.instance.parse(cleanNumber, null);
      if (PhoneNumberUtil.instance.isValidNumber(parsedNumber)) {
        return PhoneNumberUtil.instance.format(
          parsedNumber,
          PhoneNumberFormat.international,
        );
      }

      return cleanNumber;
    } catch (e) {
      return phoneNumber;
    }
  }

  // Get eligibility reason for display
  String? _getEligibilityReason(SIPConfig config) {
    if (!(config.enabled ?? config.supportSipActive ?? true)) return 'Disabled';
    if (!config.contactNumber.isNotEmpty) return 'No phone number';
    if (!(config.allowOutgoing ?? true)) return 'Outgoing not allowed';
    return null; // Ready (eligible)
  }

  // Fetch SIP configurations from MediaSFU
  Future<void> _fetchSipConfigs() async {
    if (!_isApiConfigured) return;

    if (!mounted) return;
    setState(() {
      _sipLoading = true;
    });

    try {
      final response = await _callService.getSipConfigs();

      if (!mounted) return;
      if (response.success && response.data != null) {
        setState(() {
          _sipConfigs = response.data!
              .map((item) => SIPConfig.fromJson(item))
              .toList();
          // Auto-select first eligible number for outgoing calls
          if (_sipConfigs.isNotEmpty && _selectedFromNumber.isEmpty) {
            final eligibleConfig = _sipConfigs
                .where(
                  (config) =>
                      config.supportSipActive != false &&
                      config.allowOutgoing != false,
                )
                .firstOrNull;

            if (eligibleConfig != null) {
              _selectedFromNumber = eligibleConfig.contactNumber.isNotEmpty
                  ? eligibleConfig.contactNumber
                  : (eligibleConfig.phoneNumber ?? '');
            }
          }
        });
      }
    } catch (error) {
      Logger.error('Failed to fetch SIP configs: $error');
    } finally {
      if (mounted) {
        setState(() {
          _sipLoading = false;
        });
      }
    }
  }

  void _validatePhoneNumber() {
    // Sync controller text with _phoneNumber state
    if (_phoneController.text != _phoneNumber) {
      _phoneNumber = _phoneController.text;
    }

    if (mounted) {
      setState(() {
        // Update validation state if needed
      });
    }
  }

  // Join call function (for calls not yet joined) - Simplified for direct embedding
  Future<void> _handleJoinCall(Call call) async {
    if (call.roomName.isEmpty) {
      Logger.warn('No room name available for call');
      return;
    }

    try {
      // Check if already connected to this room
      if (_isConnectedToRoom && _currentRoomName == call.roomName) {
        Logger.debug(
          'Already connected to room: ${call.roomName}, not joining again',
        );
        return;
      }

      // Set room switching flag to prevent false "call ended" notifications
      setState(() {
        _isRoomSwitching = true;
      });

      // Disconnect from current room if connected to a different one
      if (_isConnectedToRoom &&
          _currentRoomName.isNotEmpty &&
          _currentRoomName != call.roomName) {
        // Properly disconnect from MediaSFU room first
        _clearMediaSFUState(reason: 'switching to different room');

        // Wait a moment for cleanup
        await Future<void>.delayed(const Duration(seconds: 1));
      }

      // Determine participant name using origin-aware logic
      final desiredRaw = _currentParticipantName.isNotEmpty
          ? _currentParticipantName
          : (call.humanParticipantName ?? 'voipuser');
      final participantName = _getParticipantNameForRoom(
        call.roomName,
        desiredRaw,
      );

      // Joining new room with computed participant name

      // IMPORTANT: If we're joining a room that's different from our outgoing room,
      // clear outgoing room state to show proper joined call UI
      if (_hookOutgoingCallRoom?.isActive == true &&
          _hookOutgoingCallRoom!.roomName != call.roomName) {
        _clearOutgoingRoom();
      }

      // Set up room state for joining and show the display
      setState(() {
        _currentRoomName = call.roomName;
        _currentParticipantName = participantName;
      });

      // Clear room switching flag after a delay
      Timer(const Duration(seconds: 2), () {
        if (mounted) {
          setState(() {
            _isRoomSwitching = false;
          });
        }
      });
    } catch (error) {
      Logger.error('Failed to join call room: $error');
      // Clear switching flag on error
      if (mounted) {
        setState(() {
          _isRoomSwitching = false;
        });
      }
    }
  }

  // End call function
  Future<void> _handleEndCall(Call call) async {
    final callId = call.sipCallId.isNotEmpty ? call.sipCallId : call.id;
    if (callId?.isEmpty ?? true) {
      Logger.error('No call ID available for ending call');
      return;
    }

    try {
      Logger.info('Ending call: $callId');

      // Call the hangup service
      final result = await _callService.hangupCall(callId!);

      if (result.success) {
        Logger.info('Call $callId ended successfully');

        // Update UI optimistically
        setState(() {
          _currentCalls.removeWhere(
            (c) => c.sipCallId == callId || c.id == callId,
          );
        });

        // Refresh calls list after a short delay
        Timer(const Duration(seconds: 1), () {
          // The continuous polling will update the list
        });
      } else {
        Logger.error('Failed to end call $callId: ${result.error}');
        _showNotification(
          'Call End Failed',
          'Failed to end call: ${result.error}',
          type: 'error',
        );
      }
    } catch (error) {
      Logger.error('Error ending call $callId: $error');
      _showNotification(
        'Call End Error',
        'Error ending call: ${error.toString()}',
        type: 'error',
      );
    }
  }

  // Handle room-initiated end call
  Future<void> _handleRoomEndCall(String callId) async {
    // Find the call by ID and use existing handleEndCall
    final call = _currentCalls
        .where((c) => c.sipCallId == callId || c.id == callId)
        .firstOrNull;
    if (call != null) {
      await _handleEndCall(call);
    } else {
      Logger.warn('Could not find call to end: $callId');
    }
  }

  // Hold call function
  Future<void> _handleHoldCall(Call call) async {
    final callId = call.sipCallId.isNotEmpty ? call.sipCallId : call.id;
    if (callId?.isEmpty ?? true) {
      Logger.error('No call ID available for holding call');
      return;
    }

    try {
      Logger.info('Holding call: $callId');
      // Note: Hold functionality would need to be implemented in callService
      _showNotification(
        'Feature Not Available',
        'Hold call functionality - to be implemented with SIP service',
      );
    } catch (error) {
      Logger.error('Error holding call $callId: $error');
    }
  }

  // Answer call function
  Future<void> _handleAnswerCall(Call call) async {
    final callId = call.sipCallId.isNotEmpty ? call.sipCallId : call.id;
    if (callId?.isEmpty ?? true) {
      Logger.error('No call ID available for answering call');
      return;
    }

    try {
      // For answering calls, we need to join the MediaSFU room
      if (call.roomName.isNotEmpty) {
        await _handleJoinCall(call);
      }

      // Note: Answer functionality would need to be implemented in callService
    } catch (error) {
      Logger.error('Error answering call $callId: $error');
    }
  }

  // Decline call function
  Future<void> _handleDeclineCall(Call call) async {
    final callId = call.sipCallId.isNotEmpty ? call.sipCallId : call.id;
    if (callId?.isEmpty ?? true) {
      Logger.error('No call ID available for declining call');
      return;
    }

    try {
      Logger.info('Declining call: $callId');

      // Use the reject call service
      final result = await _callService.rejectCall(callId!);

      if (result.success) {
        Logger.info('Call $callId declined successfully');

        // Update UI optimistically
        setState(() {
          _currentCalls.removeWhere(
            (c) => c.sipCallId == callId || c.id == callId,
          );
        });

        // Refresh calls list after a short delay
        Timer(const Duration(seconds: 1), () {
          // The continuous polling will update the list
        });
      } else {
        Logger.error('Failed to decline call $callId: ${result.error}');
        _showNotification(
          'Call Decline Failed',
          'Failed to decline call: ${result.error}',
          type: 'error',
        );
      }
    } catch (error) {
      Logger.error('Error declining call $callId: $error');
      _showNotification(
        'Call Decline Error',
        'Error declining call: ${error.toString()}',
        type: 'error',
      );
    }
  }

  Future<void> _handleMakeCall() async {
    // Update flow to connecting step
    setState(() {
      _callFlowStep = 'dialing';
    });

    _resetSipParticipantTracking();

    if (_phoneNumber.isEmpty || _selectedFromNumber.isEmpty) {
      // Reset call flow step and stop loading
      setState(() {
        _callFlowStep = 'choose-mode';
        _isDialing = false;
      });
      _updateResolvingOutgoingCall(false);
      return;
    }

    // Validate E.164 format
    if (!_isValidE164(_phoneNumber)) {
      Logger.error(
        'Invalid phone number format. Must be E.164 format (e.g., +15551234567)',
      );
      _showNotification(
        'Invalid Phone Number',
        'Please enter a valid phone number in E.164 format (e.g., +15551234567)',
        type: 'error',
      );
      setState(() {
        _callFlowStep = 'enter-phone';
        _isDialing = false;
      });
      _updateResolvingOutgoingCall(false);
      return;
    }

    // Check if selected number is eligible for outgoing calls
    final selectedConfig = _sipConfigs
        .where((config) => config.contactNumber == _selectedFromNumber)
        .firstOrNull;

    if (selectedConfig == null) {
      Logger.error('No SIP configuration found for selected number');
      _showNotification(
        'Configuration Error',
        'No SIP configuration found for the selected number. Please try a different number.',
        type: 'error',
      );
      setState(() {
        _callFlowStep = 'select-number';
        _isDialing = false;
      });
      _updateResolvingOutgoingCall(false);
      return;
    }

    if (!_isEligibleForOutgoing(selectedConfig)) {
      Logger.error('Selected number is not eligible for outgoing calls');
      _showNotification(
        'Number Not Eligible',
        'The selected number is not eligible for outgoing calls. Please select a different number.',
        type: 'error',
      );
      setState(() {
        _callFlowStep = 'select-number';
        _isDialing = false;
      });
      _updateResolvingOutgoingCall(false);
      return;
    }

    // Check if we're making a call from an outgoing setup room without microphone enabled
    final isInOutgoingSetupRoom =
        _hookOutgoingCallRoom?.isActive == true &&
        _isConnectedToRoom &&
        _currentRoomName == _hookOutgoingCallRoom!.roomName;
    final microphoneOffInOutgoingRoom =
        isInOutgoingSetupRoom && !_isMicrophoneEnabled;

    // If we're in an outgoing setup room but microphone is off, ask for confirmation (unless already given)
    if (microphoneOffInOutgoingRoom && !_microphoneConfirmationGiven) {
      Logger.warn(
        'Making call from outgoing setup room with microphone disabled - requesting user confirmation',
      );

      // Show confirmation dialog and wait for user decision
      setState(() {
        _microphoneConfirmation = ConfirmationState(
          isOpen: true,
          onConfirm: () {
            setState(() {
              _microphoneConfirmation = ConfirmationState(
                isOpen: false,
                onConfirm: null,
                onCancel: null,
              );
            });
            // Continue with the call after confirmation
            _updateResolvingOutgoingCall(true);
            _proceedWithCall();
          },
          onCancel: () {
            setState(() {
              _microphoneConfirmation = ConfirmationState(
                isOpen: false,
                onConfirm: null,
                onCancel: null,
              );
              // Reset call flow step and stop loading
              _callFlowStep = 'choose-mode';
              _isDialing = false;
            });
            _updateResolvingOutgoingCall(false);
          },
        );
      });

      // Exit early - wait for user decision
      return;
    }

    // If confirmation already given or not needed, proceed directly
    _updateResolvingOutgoingCall(true);
    await _proceedWithCall();
  }

  // Separated call logic for reuse after microphone confirmation
  Future<void> _proceedWithCall() async {
    setState(() {
      _isDialing = true;
      if (_callFlowStep != 'dialing') {
        _callFlowStep = 'dialing';
      }
    });

    // Clear API cache to ensure fresh data for call initiation
    _clearApiCache();

    // Reset call end notification flags (removed unused fields)

    // Auto-collapse dialpad when call starts
    setState(() {
      _isDialpadCollapsed = true;
    });

    try {
      String roomName;
      String participantName;

      // Step 1: Use outgoing call room if available, otherwise create one
      if (_outgoingCallRoom?.isActive == true &&
          _isConnectedToRoom &&
          _currentRoomName == _outgoingCallRoom!.roomName) {
        // Use the active outgoing call room
        roomName = _outgoingCallRoom!.roomName;
        participantName = _currentParticipantName;
      } else if (_isConnectedToRoom && _currentRoomName.isNotEmpty) {
        // User is connected to some other MediaSFU room - use it
        roomName = _currentRoomName;
        participantName = _currentParticipantName;
      } else {
        // No room available - need to create one
        final rawParticipantName = _currentParticipantName;
        final callParticipantName = rawParticipantName
            .replaceAll(' ', '_')
            .replaceAll(RegExp(r'[^\w_]'), '');

        // Check if this will be a bot call (no microphone/room connection)
        final startWithInitiatorAudio =
            _isConnectedToRoom && _isMicrophoneEnabled;

        if (!startWithInitiatorAudio) {
          // Bot call - create real MediaSFU room first (matching React.js logic)
          final roomCreationResult = await _callService.createMediaSFURoom(
            participantName: callParticipantName,
            duration: _selectedDuration,
          );

          if (roomCreationResult.success && roomCreationResult.data != null) {
            // Use the real MediaSFU room name returned by the API
            roomName = roomCreationResult.data!['roomName'] as String;
            participantName =
                roomCreationResult.data!['participantName'] as String;

            // Store bot room meta for 1 hour so name-collision logic can detect origin
            await _markBotRoomMeta(roomName, participantName);

            // CRITICAL FIX: Do NOT set _currentRoomName for bot calls!
            // The user is not connected to this room, so showing "Currently Active" would be misleading
            // Only update participantName for the call
            if (mounted) {
              setState(() {
                _currentParticipantName = participantName;
              });
            }

            Logger.info(
              'Created real MediaSFU room for bot call: $roomName (user not connected)',
            );
          } else {
            // Failed to create MediaSFU room - show error and abort
            final errorMessage =
                roomCreationResult.error ?? 'Failed to create MediaSFU room';
            Logger.error('MediaSFU room creation failed: $errorMessage');

            _showNotification(
              'Room Creation Failed',
              errorMessage,
              type: 'error',
            );

            if (mounted) {
              setState(() {
                _isDialing = false;
                _callFlowStep = 'choose-mode';
              });
            }
            _updateResolvingOutgoingCall(false);
            return;
          }
        } else {
          // Voice call - create temporary room name (MediaSFUHandler will create the actual room)
          final tempRoomName =
              'outgoing_call_${DateTime.now().millisecondsSinceEpoch}_${(DateTime.now().millisecond * 0.36).toInt().toString().padLeft(6, '0')}';
          final displayName = 'Outgoing Call Room ($callParticipantName)';

          // Use hook's createOutgoingRoom to setup room state
          _createOutgoingRoom(tempRoomName, displayName);

          // Set room state for MediaSFU - MediaSFUHandler will create the actual room
          setState(() {
            _requestedRoomName = tempRoomName;
            _currentRoomName = tempRoomName;
            _currentParticipantName = callParticipantName;
          });

          roomName = tempRoomName;
          participantName = callParticipantName;

          // Wait for room to be set up
          await Future<void>.delayed(const Duration(milliseconds: 1500));
        }
      }

      // Step 2: Make the call using the enhanced callService
      // remove and spaces or non-digit characters from phone numbers aside the leading +
      _phoneNumber = _phoneNumber.replaceAll(RegExp(r'[^\d+]'), '');
      _selectedFromNumber = _selectedFromNumber.replaceAll(
        RegExp(r'[^\d+]'),
        '',
      );

      final result = await _callService.makeCall(
        phoneNumber: _phoneNumber,
        callerIdNumber: _selectedFromNumber,
        roomName: roomName,
        initiatorName: participantName,
        startWithInitiatorAudio: _isConnectedToRoom && _isMicrophoneEnabled,
        calleeDisplayName: 'sipcallee',
        audioOnly: true,
        useBackupPeer: false,
      );

      if (result.success) {
        Logger.info('Call initiated successfully using room: $roomName');

        if (mounted) {
          setState(() {
            _callFlowStep = 'resolving';
          });
        }

        // Determine if this is a bot call (matching React logic)
        final startWithInitiatorAudio =
            _isConnectedToRoom && _isMicrophoneEnabled;

        // Start monitoring call status with the room name
        if (result.data?['sipCallId'] != null) {
          final sipCallId = result.data!['sipCallId'] as String;
          _startCallMonitoring(sipCallId, roomName);

          // For bot calls, set up timeout detection (extended to 105 seconds)
          if (!startWithInitiatorAudio) {
            _botCallTimeoutRef = Timer(const Duration(seconds: 105), () {
              // Check if call is still in waiting state after 105 seconds
              final currentCall = _currentCalls
                  .where(
                    (call) =>
                        call.sipCallId == sipCallId ||
                        call.roomName == roomName,
                  )
                  .firstOrNull;

              if (currentCall != null &&
                  (currentCall.status.toString().toLowerCase() ==
                          'connecting' ||
                      currentCall.status.toString().toLowerCase() ==
                          'ringing')) {
                Logger.warn(
                  'Bot call timeout after 105 seconds - marking as failed',
                );
                _showNotification(
                  'Call Timeout',
                  'Call attempt timed out after 105 seconds',
                  type: 'warning',
                );
                _updateResolvingOutgoingCall(false);
              }
            });
          }
        }

        if (mounted) {
          setState(() {
            _isDialing = false;
          });
        }

        // Auto-hide dialer
        Timer(const Duration(seconds: 2), () {
          if (mounted) {
            setState(() => _showDialer = false);
          }
        });
      } else {
        Logger.error(
          'Failed to initiate call - API returned success: false: ${result.error}',
        );
        if (mounted) {
          setState(() {
            _isDialing = false;
            _callFlowStep = 'choose-mode';
          });
        }

        _showNotification(
          'Call Failed',
          result.error ??
              'The outgoing call could not be initiated. Please try again.',
          type: 'error',
        );
        _updateResolvingOutgoingCall(false);
      }
    } catch (error) {
      Logger.error('Failed to make call: $error');
      if (mounted) {
        setState(() {
          _isDialpadCollapsed = false; // Expand dialpad on failure
          _callFlowStep = 'choose-mode';
        });
      }
      _updateResolvingOutgoingCall(false);
    } finally {
      if (mounted) {
        setState(() {
          _isDialing = false;
        });
      }
    }
  }

  void _handleMicrophoneChange(bool enabled) {
    setState(() {
      _isMicrophoneEnabled = enabled;
    });
  }

  void _handleConnectionChange(bool isConnected) {
    final wasConnected = _isConnectedToRoom; // Store previous state

    setState(() {
      _isConnectedToRoom = isConnected;

      // Clear room creation loading state when successfully connected
      if (isConnected && _isCreatingRoom) {
        _isCreatingRoom = false;
        _roomCreationTimeoutRef?.cancel();
        _roomCreationTimeoutRef = null;
      }
    });

    if (!isConnected) {
      // CRITICAL FIX: Only clear room name if we were previously connected
      // This prevents the immediate clearing that was breaking the join flow
      // Following React implementation pattern from MediaSFURoomDisplay.tsx
      if (wasConnected) {
        // Use the previous state, not current
        setState(() {
          _currentRoomName = '';
          _isCreatingRoom = false;
          _roomCreationError = null;
        });

        // Clear room creation timeout on disconnection
        _roomCreationTimeoutRef?.cancel();
        _roomCreationTimeoutRef = null;

        if (_roomManuallyClosedRef != null) {
          _roomManuallyClosedRef = null;
        }
      }
    } else {
      // Room successfully connected - clear loading states and timeout
      setState(() {
        _isCreatingRoom = false;
        _roomCreationError = null;
      });

      // Clear room creation timeout on successful connection
      _roomCreationTimeoutRef?.cancel();
      _roomCreationTimeoutRef = null;

      // Clear roomManuallyClosedRef when successfully connecting
      if (_roomManuallyClosedRef != null) {
        _roomManuallyClosedRef = null;
      }
    }
  }

  void _handleRoomNameUpdate(String realRoomName) {
    final previousRoomName = _currentRoomName;

    setState(() {
      _currentRoomName = realRoomName;
    });

    // If this is a real room name for a room we created, mark the new name as created by us too
    if (_requestedRoomName.isNotEmpty &&
        _isRoomCreatedByUs(_requestedRoomName) &&
        realRoomName != _requestedRoomName) {
      _markRoomAsCreated(realRoomName);
      // Propagate metadata (original participant name) from temp to real room
      _propagateRoomMeta(_requestedRoomName, realRoomName);
    }

    // Update outgoing call room with real MediaSFU room name
    if (_outgoingCallRoom?.isActive == true &&
        _outgoingCallRoom!.requestedRoomName.isNotEmpty &&
        (previousRoomName == _outgoingCallRoom!.requestedRoomName ||
            previousRoomName == _outgoingCallRoom!.roomName)) {
      _updateRoomName(realRoomName);
    }
  }

  void _handleRoomDisconnect({Map<String, dynamic>? reason}) {
    // Enhanced room disconnect with state preservation logic
    final roomEnded =
        reason?['type'] == 'room-ended' || reason?['type'] == 'socket-error';

    final isOurOutgoingRoom =
        _outgoingCallRoom?.isActive == true &&
        _currentRoomName == _outgoingCallRoom!.roomName;

    // CRITICAL: Don't show notifications or clear state if we're just switching rooms
    if (_isRoomSwitching) {
      Logger.info(
        'Room disconnect during room switching - suppressing notifications',
      );
      return;
    }

    // CRITICAL: If the MediaSFU room itself has ended, ALWAYS clear state
    if (roomEnded) {
      _clearMediaSFUState(
        reason:
            'MediaSFU room ended: ${reason?['details'] ?? "Unknown reason"}',
      );

      // Show notification for connection timeout or other socket errors
      if (reason?['type'] == 'socket-error' &&
          reason?['details']?.contains('timeout') == true) {
        _showNotification(
          'Connection Failed',
          'Room creation timed out. Please check your internet connection and try again.',
          type: 'error',
        );
      } else if (reason?['type'] == 'socket-error') {
        _showNotification(
          'Connection Error',
          reason?['details']?.toString() ??
              'Failed to connect to the media room. Please try again.',
          type: 'error',
        );
      }

      // Clear outgoing room state if this was our outgoing room
      if (isOurOutgoingRoom) {
        _clearOutgoingRoom();
        setState(() {
          _roomManuallyClosedRef = _currentRoomName;
        });

        _botCallTimeoutRef?.cancel();
        _botCallTimeoutRef = null;
      }
      return;
    }

    // Safe to disconnect
    _clearMediaSFUState(reason: 'manual room disconnect');

    // Clear outgoing room state when disconnecting
    if (isOurOutgoingRoom) {
      Logger.info(
        'Clearing outgoing room state on disconnect - room manually closed',
      );
      _clearOutgoingRoom();
      setState(() {
        _roomManuallyClosedRef = _currentRoomName;
      });

      _botCallTimeoutRef?.cancel();
      _botCallTimeoutRef = null;
    }

    Logger.info('Disconnected from MediaSFU room');
  }

  // Manual room connection for testing - Enhanced with outgoing call room pattern
  Future<void> _handleConnectToRoom() async {
    if (_selectedFromNumber.isEmpty) {
      Logger.warn('Please select a number first');
      return;
    }

    // Enhanced room validation - match React logic
    final hasActiveConnection =
        _isConnectedToRoom && _currentRoomName.isNotEmpty;
    final hasValidOutgoingRoom =
        _hookOutgoingCallRoom?.isActive == true &&
        _hookOutgoingCallRoom?.isMediaSFUConnected == true &&
        _isConnectedToRoom &&
        _currentRoomName == _hookOutgoingCallRoom?.roomName;

    // Check if current room name is a valid MediaSFU room
    final isCurrentRoomValidMediaSFU =
        _currentRoomName.isNotEmpty &&
        RegExp(r'^[sp][a-zA-Z0-9]+$').hasMatch(_currentRoomName);

    // If we have a valid MediaSFU room that's connected, don't create another one
    // Only block if this connected room is purposeful (active outgoing setup or has active calls)
    if (hasActiveConnection &&
        isCurrentRoomValidMediaSFU &&
        (hasValidOutgoingRoom || _hasActiveCallsForRoom(_currentRoomName))) {
      Logger.info(
        'Already connected to purposeful MediaSFU room: '
        'currentRoom=$_currentRoomName, isConnected=$_isConnectedToRoom, '
        'validOutgoing=$hasValidOutgoingRoom, hasActiveCalls=${_hasActiveCallsForRoom(_currentRoomName)}',
      );
      _showNotification(
        'Already Connected',
        'You\'re already connected to room: $_currentRoomName',
      );
      return;
    }

    // Check if room creation is already in progress
    if (_isCreatingRoom) {
      Logger.warn('Room creation already in progress');
      return;
    }

    // Only block if we have a VALID connection with actual purpose (calls or valid outgoing room)
    // Only block if we have a VALID connection with actual purpose (calls or valid outgoing room)
    // This matches React's shouldBlockForActiveRoom logic
    final shouldBlockForActiveRoom =
        hasValidOutgoingRoom ||
        (hasActiveConnection && _hasActiveCallsForRoom(_currentRoomName));

    if (shouldBlockForActiveRoom) {
      Logger.info(
        'Blocking room creation due to active room with ongoing calls',
      );
      _showNotification(
        'Room Active',
        'You\'re already connected to an active room with ongoing calls',
      );
      return;
    }

    // Clean up any stale connections before creating new room - match React logic
    // Clean up any stale connections before creating new room - match React logic
    // Consider a connection stale if connected but neither an active outgoing setup nor has active calls
    if (hasActiveConnection &&
        !hasValidOutgoingRoom &&
        !_hasActiveCallsForRoom(_currentRoomName)) {
      Logger.warn(
        'Detected stale room connection - cleaning up before creating new room: '
        'staleRoom=$_currentRoomName, isConnected=$_isConnectedToRoom, '
        'hasAssociatedActiveCalls=${_hasActiveCallsForRoom(_currentRoomName)}',
      );

      _clearMediaSFUState(reason: 'cleaning stale room before new creation');

      if (_hookOutgoingCallRoom?.isActive == true) {
        setState(() {
          _hookOutgoingCallRoom = null;
        });
      }

      // Wait a moment for cleanup
      await Future<void>.delayed(const Duration(milliseconds: 500));
    }

    final selectedConfig = _sipConfigs
        .where((config) => config.contactNumber == _selectedFromNumber)
        .firstOrNull;

    if (selectedConfig == null) {
      Logger.error('No SIP configuration found for selected number');
      return;
    }

    try {
      // Clear any previous error state and set loading
      setState(() {
        _roomCreationError = null;
        _isCreatingRoom = true;
      });

      // Generate participant name
      final participantName = _currentParticipantName;

      // Generate a temporary room name - MediaSFU will provide the real one
      final tempRoomName =
          'outgoing_${DateTime.now().millisecondsSinceEpoch}_${(DateTime.now().millisecond * 0.5).toInt()}';
      final displayName = 'Outgoing Call Room ($participantName)';

      // Create outgoing room state
      _createOutgoingRoom(tempRoomName, displayName);

      // Mark this room as created by us
      _markRoomAsCreated(tempRoomName);

      // Set room state for MediaSFU
      setState(() {
        _requestedRoomName = tempRoomName;
        _currentRoomName = tempRoomName;
        _currentParticipantName = participantName;
      });

      // Set up a timeout to handle creation failure
      _roomCreationTimeoutRef = Timer(const Duration(seconds: 60), () {
        if (mounted) {
          setState(() {
            _isCreatingRoom = false;
            _roomCreationError = 'Room creation timed out. Please try again.';
          });
        }
      });

      // Small delay to ensure state updates are processed
      await Future<void>.delayed(const Duration(milliseconds: 100));

      // Hide the dialer when room is created
      setState(() {
        _showDialer = false;
      });
    } catch (error) {
      setState(() {
        _isCreatingRoom = false;
        _roomCreationError = 'Failed to setup room: ${error.toString()}';
      });
      _roomCreationTimeoutRef?.cancel();
      _roomCreationTimeoutRef = null;
      Logger.error('Error setting up outgoing call room: $error');
      _showNotification(
        'Room Setup Failed',
        'Failed to setup voice room: ${error.toString()}',
        type: 'error',
      );
    }
  }

  void _handleDialpadClick(String digit) {
    final newValue = _formatPhoneNumber(_phoneNumber + digit);
    setState(() {
      _phoneNumber = newValue;
    });
    // Update controller text and set cursor to end
    _phoneController.value = TextEditingValue(
      text: newValue,
      selection: TextSelection.fromPosition(
        TextPosition(offset: newValue.length),
      ),
    );
  }

  // Create combined calls array including outgoing call room (simplified approach)
  List<Call> get _allDisplayCalls {
    // Use enhanced calls from hook which includes dummy calls
    return [
      ..._enhancedCurrentCalls,
    ]; // Simplified - just return enhanced calls
  }

  @override
  Widget build(BuildContext context) {
    if (!_isApiConfigured) {
      return Scaffold(
        body: Center(
          child: Container(
            constraints: const BoxConstraints(maxWidth: 600),
            margin: const EdgeInsets.all(24),
            child: _buildApiConfigurationPrompt(),
          ),
        ),
      );
    }

    // Check if already connected to an outgoing call room specifically - match React pattern
    final isConnectedToOutgoingRoom =
        _hookOutgoingCallRoom?.isActive == true &&
        _isConnectedToRoom &&
        _currentRoomName.isNotEmpty &&
        _currentRoomName == _hookOutgoingCallRoom!.roomName;

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      body: Stack(
        children: [
          Center(
            child: Container(
              constraints: const BoxConstraints(maxWidth: 1000),
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SizedBox(height: 24),

                    // Quick Settings Header
                    _buildQuickSettingsHeader(isConnectedToOutgoingRoom),

                    const SizedBox(height: 16),

                    // MediaSFU Room Display Section - Show ONLY for outgoing setup rooms we created
                    if (_currentRoomName.isNotEmpty &&
                        (_isConnectedToRoom || _isCreatingRoom) &&
                        _isRoomCreatedByUs(_currentRoomName)) ...[
                      // Use Stack to overlay loading on MediaSFU room
                      Stack(
                        children: [
                          _buildMediaSFURoomSection(),

                          // Loading overlay with higher z-index
                          if (_isCreatingRoom)
                            Positioned.fill(
                              child: Container(
                                decoration: BoxDecoration(
                                  color: Colors.white.withValues(alpha: 0.95),
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: _buildRoomCreationLoading(),
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: 16),
                    ],

                    // Make Call Section - matching React dialer structure
                    if (_showDialer) ...[
                      _buildMakeCallSection(),
                      const SizedBox(height: 16),
                    ],

                    // Active Calls Section
                    _buildActiveCallsSection(),

                    const SizedBox(height: 32),
                  ],
                ),
              ),
            ),
          ),

          // Notification Modal
          if (_notification.isOpen) _buildNotificationModal(),

          // Microphone Confirmation Modal
          if (_microphoneConfirmation.isOpen)
            _buildMicrophoneConfirmationModal(),

          // Navigation confirmation modal
          if (_navigationConfirmation.isOpen)
            _buildNavigationConfirmationModal(),
        ],
      ),
    );
  }

  // Build methods for UI components

  Widget _buildQuickSettingsHeader(bool isConnectedToOutgoingRoom) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: Theme.of(context).dividerColor.withValues(alpha: 0.2),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.1),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '📞 Outgoing Call Room',
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
              fontWeight: FontWeight.w600,
              color: Theme.of(context).brightness == Brightness.dark
                  ? const Color(0xFFE2E8F0)
                  : const Color(0xFF2D3748),
            ),
          ),
          const SizedBox(height: 16),

          // Quick Actions Row
          Wrap(
            alignment: WrapAlignment.start,
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: 16,
            runSpacing: 12,
            children: [
              // Create Voice Room Button
              ElevatedButton.icon(
                onPressed: _isCreatingRoom || isConnectedToOutgoingRoom
                    ? null
                    : _handleConnectToRoom,
                icon: _isCreatingRoom
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.mic, size: 16),
                label: Text(
                  _isCreatingRoom
                      ? 'Creating Room...'
                      : isConnectedToOutgoingRoom
                      ? 'Connected to Room'
                      : 'Create Voice Room',
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: isConnectedToOutgoingRoom
                      ? Colors.green
                      : Theme.of(context).colorScheme.secondary,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 12,
                  ),
                ),
              ),

              // Room Duration Setting
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    'Room Duration:',
                    style: Theme.of(context).textTheme.labelMedium?.copyWith(
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      border: Border.all(color: Colors.grey.shade300),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: DropdownButtonHideUnderline(
                      child: DropdownButton<int>(
                        value: _selectedDuration,
                        isDense: true,
                        items: const [
                          DropdownMenuItem(value: 5, child: Text('5 minutes')),
                          DropdownMenuItem(
                            value: 15,
                            child: Text('15 minutes'),
                          ),
                          DropdownMenuItem(
                            value: 30,
                            child: Text('30 minutes'),
                          ),
                          DropdownMenuItem(value: 60, child: Text('1 hour')),
                          DropdownMenuItem(
                            value: 90,
                            child: Text('90 minutes'),
                          ),
                        ],
                        onChanged: (value) {
                          if (value != null) {
                            setState(() => _selectedDuration = value);
                          }
                        },
                      ),
                    ),
                  ),
                ],
              ),

              // Current Room Info - Show when connected
              if (_currentRoomName.isNotEmpty &&
                  _isRoomCreatedByUs(_currentRoomName))
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 6,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.green.shade50,
                    border: Border.all(color: Colors.green.shade300),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.circle, size: 8, color: Colors.green.shade600),
                      const SizedBox(width: 6),
                      Text(
                        'Room: $_currentRoomName',
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          fontWeight: FontWeight.w500,
                          color: Colors.green.shade700,
                        ),
                      ),
                      const SizedBox(width: 4),
                      Icon(
                        _isMicrophoneEnabled ? Icons.mic : Icons.mic_off,
                        size: 14,
                        color: _isMicrophoneEnabled
                            ? Colors.green.shade600
                            : Colors.red.shade600,
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildRoomCreationLoading() {
    return Center(
      child: Container(
        margin: const EdgeInsets.all(24),
        padding: const EdgeInsets.all(32),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Colors.blue.shade300, width: 2),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.15),
              blurRadius: 20,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const CircularProgressIndicator(strokeWidth: 3),
            const SizedBox(height: 20),
            Text(
              'Creating Voice Room',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w600,
                color: Colors.blue.shade800,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Setting up your conference room...',
              style: Theme.of(
                context,
              ).textTheme.bodyMedium?.copyWith(color: Colors.grey.shade600),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMediaSFURoomSection() {
    final topRoomName = _getTopRoomName();

    return Column(
      children: [
        // Show progress indicator when creating room
        if (_isCreatingRoom)
          Container(
            margin: const EdgeInsets.only(bottom: 16),
            child: const SizedBox(height: 4, child: LinearProgressIndicator()),
          ),

        // Always show the main room section when we have a room name
        if (topRoomName != null)
          Column(
            children: [
              // Outgoing Call Setup Status - Show when room is active but no SIP call in progress
              if (_hookOutgoingCallRoom?.isActive == true &&
                  _hookOutgoingCallRoom!.hasActiveSipCall == false &&
                  _phoneNumber.isNotEmpty) ...[
                _buildOutgoingSetupStatus(),
                const SizedBox(height: 12),
              ],

              // Voice Room Header - Compact Design
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [Colors.blue.shade50, Colors.purple.shade50],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.blue.shade200),
                ),
                child: Column(
                  children: [
                    // Title and Primary Status Row
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(6),
                          decoration: BoxDecoration(
                            color: Colors.blue.shade600,
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: const Icon(
                            Icons.mic,
                            color: Colors.white,
                            size: 16,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Voice Room',
                                style: Theme.of(context).textTheme.titleMedium
                                    ?.copyWith(
                                      fontWeight: FontWeight.w600,
                                      color: Colors.blue.shade800,
                                    ),
                              ),
                              Text(
                                _currentRoomName,
                                style: Theme.of(context).textTheme.bodySmall
                                    ?.copyWith(color: Colors.blue.shade600),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ],
                          ),
                        ),
                        // Primary Status Badge
                        _buildCompactStatusBadge(
                          _isConnectedToRoom ? 'Connected' : 'Connecting...',
                          _isConnectedToRoom ? Icons.wifi : Icons.wifi_off,
                          _isConnectedToRoom ? Colors.green : Colors.orange,
                        ),
                      ],
                    ),

                    const SizedBox(height: 8),

                    // Quick Info Row - Single line with key info
                    Row(
                      children: [
                        Expanded(
                          child: _buildQuickInfo(
                            'From',
                            _selectedFromNumber.isNotEmpty
                                ? _selectedFromNumber
                                : 'Not selected',
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: _buildQuickInfo(
                            'Duration',
                            '$_selectedDuration min',
                          ),
                        ),
                        const SizedBox(width: 8),
                        _buildCompactStatusBadge(
                          _isMicrophoneEnabled ? 'Mic On' : 'Mic Off',
                          _isMicrophoneEnabled ? Icons.mic : Icons.mic_off,
                          _isMicrophoneEnabled ? Colors.green : Colors.red,
                        ),
                      ],
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 12),

              // MediaSFU Room Display - Top section shows outgoing setup or our voice room
              MediaSFURoomDisplay(
                roomName: topRoomName,
                participantName: _currentParticipantName,
                callId: _getActiveCallId(),
                duration: _selectedDuration,
                onRoomNameUpdate: _handleRoomNameUpdate,
                onConnectionChange: _handleConnectionChange,
                onMicrophoneChange: _handleMicrophoneChange,
                onDisconnect: _handleRoomDisconnect,
                onEndCall: _handleRoomEndCall,
                autoJoin: true,
                isOutgoingCallSetup:
                    _isActiveOutgoingSetupRoomName(topRoomName) ||
                    _isVoiceRoomCreatedByUs(topRoomName),
                currentCall: _getCurrentCallForRoom()?.toJson(),
                onParticipantsUpdate: _handleRoomParticipantsUpdate,
              ),
            ],
          ),
      ],
    );
  }

  Widget _buildCompactStatusBadge(String text, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        border: Border.all(color: color.withValues(alpha: 0.3)),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 10, color: color),
          const SizedBox(width: 3),
          Text(
            text,
            style: TextStyle(
              fontSize: 9,
              fontWeight: FontWeight.w500,
              color: color,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildQuickInfo(String label, String value) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
            fontSize: 10,
            fontWeight: FontWeight.w500,
            color: Colors.grey.shade600,
          ),
        ),
        Text(
          value,
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
            fontSize: 11,
            fontWeight: FontWeight.w600,
            color: Colors.blue.shade800,
          ),
          overflow: TextOverflow.ellipsis,
        ),
      ],
    );
  }

  Widget _buildOutgoingSetupStatus() {
    final bool isResolvingCall = _isResolvingOutgoingCall;
    final bool isCallActionDisabled =
        _phoneNumber.isEmpty ||
        !_isValidE164(_phoneNumber) ||
        _isDialing ||
        isResolvingCall;
    final IconData callActionIcon = _isDialing
        ? Icons.phone_disabled
        : isResolvingCall
        ? Icons.hourglass_bottom
        : Icons.phone;
    final String callActionLabel = _isDialing
        ? 'Calling...'
        : isResolvingCall
        ? 'Resolving...'
        : 'Call';

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.blue.shade50,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.blue.shade200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header with status info
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: Colors.orange.shade100,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.orange.shade300),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.sync, size: 12, color: Colors.orange.shade700),
                    const SizedBox(width: 4),
                    Text(
                      'SETTING UP CALL',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w600,
                        color: Colors.orange.shade700,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Preparing to call: $_phoneNumber',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Colors.blue.shade700,
                        fontWeight: FontWeight.w500,
                        fontSize: 12,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    if (_selectedFromNumber.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 6,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.blue.shade100,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: Colors.blue.shade300),
                        ),
                        child: Text(
                          'From: $_selectedFromNumber',
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(
                                color: Colors.blue.shade800,
                                fontSize: 10,
                                fontWeight: FontWeight.w500,
                              ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),

          const SizedBox(height: 12),

          if (isResolvingCall) ...[
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(
                color: Colors.deepPurple.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: Colors.deepPurple.withValues(alpha: 0.3),
                  width: 1.5,
                ),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const SizedBox(
                    width: 28,
                    height: 28,
                    child: CircularProgressIndicator(
                      strokeWidth: 3,
                      valueColor: AlwaysStoppedAnimation<Color>(
                        Colors.deepPurple,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Resolving your outgoing call…',
                          style: Theme.of(context).textTheme.titleSmall
                              ?.copyWith(
                                fontWeight: FontWeight.w700,
                                color: Colors.deepPurple.shade700,
                              ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'We’re matching the SIP bridge and verifying media routes. This can take up to 2 minutes. The call button stays disabled until we finish.',
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(
                                color: Colors.deepPurple.shade400,
                                height: 1.3,
                              ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
          ],

          // Quick call controls - compact phone input and call button
          Row(
            children: [
              Expanded(
                flex: 2,
                child: SizedBox(
                  height: 36, // Compact height
                  child: TextField(
                    controller: _phoneController,
                    decoration: InputDecoration(
                      hintText: '+1234567890',
                      hintStyle: TextStyle(
                        fontSize: 13,
                        color: Colors.grey.shade500,
                      ),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(6),
                        borderSide: BorderSide(color: Colors.grey.shade300),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(6),
                        borderSide: BorderSide(color: Colors.grey.shade300),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(6),
                        borderSide: BorderSide(color: Colors.blue.shade400),
                      ),
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 8,
                      ),
                      isDense: true,
                    ),
                    style: const TextStyle(fontSize: 13),
                    onChanged: (value) {
                      final formattedValue = _formatPhoneNumber(value);
                      setState(() {
                        _phoneNumber = formattedValue;
                      });
                      // Update controller text and set cursor to end
                      _phoneController.value = TextEditingValue(
                        text: formattedValue,
                        selection: TextSelection.fromPosition(
                          TextPosition(offset: formattedValue.length),
                        ),
                      );
                    },
                    maxLength: 16,
                    buildCounter:
                        (
                          context, {
                          required currentLength,
                          required isFocused,
                          maxLength,
                        }) => null, // Hide counter
                  ),
                ),
              ),
              const SizedBox(width: 8),
              SizedBox(
                height: 36, // Match input height
                child: ElevatedButton.icon(
                  onPressed: isCallActionDisabled ? null : _handleMakeCall,
                  icon: Icon(callActionIcon, size: 14),
                  label: Text(
                    callActionLabel,
                    style: const TextStyle(fontSize: 12),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.green,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                  ),
                ),
              ),
            ],
          ),

          // Validation message if phone number is invalid
          if (_phoneNumber.isNotEmpty &&
              _phoneNumber.length > 3 &&
              !_isValidE164(_phoneNumber)) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: Colors.red.shade50,
                borderRadius: BorderRadius.circular(4),
                border: Border.all(color: Colors.red.shade200),
              ),
              child: Row(
                children: [
                  Icon(Icons.warning, size: 12, color: Colors.red.shade600),
                  const SizedBox(width: 4),
                  Text(
                    'Invalid format. Use: +1234567890',
                    style: TextStyle(fontSize: 10, color: Colors.red.shade600),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  String? _getActiveCallId() {
    if (_currentRoomName.isEmpty) return null;

    // For outgoing call setup rooms, only return callId if there's a real SIP call
    if (_isRoomCreatedByUs(_currentRoomName) &&
        _hookOutgoingCallRoom?.isActive == true &&
        _hookOutgoingCallRoom!.roomName == _currentRoomName) {
      // Only return callId if there's an actual SIP call, not just dummy setup
      return _hookOutgoingCallRoom!.hasActiveSipCall
          ? _hookOutgoingCallRoom!.sipCallId
          : null;
    }

    final activeCall = _allDisplayCalls
        .where(
          (call) =>
              call.roomName == _currentRoomName &&
              ![
                'ended',
                'failed',
                'completed',
                'rejected',
              ].contains(call.status.toString().toLowerCase()) &&
              !call.callEnded &&
              !(call.extras?['isOutgoingRoomSetup'] == true),
        ) // Exclude dummy setup calls
        .firstOrNull;

    return activeCall?.sipCallId;
  }

  Call? _getCurrentCallForRoom() {
    if (_currentRoomName.isEmpty) return null;

    if (_isRoomCreatedByUs(_currentRoomName) &&
        _hookOutgoingCallRoom?.isActive == true &&
        _hookOutgoingCallRoom!.roomName == _currentRoomName) {
      return _hookOutgoingCallRoom!.hasActiveSipCall
          ? _convertCallDataToCall()
          : null;
    }

    return _allDisplayCalls
        .where(
          (call) =>
              call.roomName == _currentRoomName &&
              ![
                'ended',
                'failed',
                'completed',
                'rejected',
              ].contains(call.status.toString().toLowerCase()) &&
              !call.callEnded,
        )
        .firstOrNull;
  }

  Call? _convertCallDataToCall() {
    if (_hookOutgoingCallRoom?.callData == null) return null;

    final data = _hookOutgoingCallRoom!.callData!;
    return Call(
      id: _hookOutgoingCallRoom!.sipCallId ?? '',
      sipCallId: _hookOutgoingCallRoom!.sipCallId ?? '',
      status: _parseCallStatus(data['status']?.toString() ?? ''),
      direction: _parseCallDirection(data['direction']?.toString() ?? ''),
      startTimeISO: data['startTimeISO']?.toString() ?? '',
      durationSeconds: data['durationSeconds'] as int? ?? 0,
      roomName: _hookOutgoingCallRoom!.roomName,
      callerIdRaw: data['callerIdRaw']?.toString() ?? '',
      calledUri: data['calledUri']?.toString() ?? '',
      audioOnly: true,
      activeMediaSource: data['activeMediaSource']?.toString() ?? '',
      playingMusic: false,
      playingPrompt: false,
      pendingHumanIntervention: false,
      callbackState: '',
      callEnded: false,
      needsCallback: false,
      callbackHonored: false,
      extras: data['extras'] as Map<String, dynamic>?,
      endTimeISO: data['endTimeISO']?.toString(),
      from: data['callerIdRaw']?.toString() ?? '',
      to: data['calledUri']?.toString() ?? '',
      phoneNumber: data['calledUri']?.toString() ?? '',
      displayName: _hookOutgoingCallRoom!.displayName,
      humanParticipantName: data['humanParticipantName']?.toString(),
      onHold: data['onHold'] as bool? ?? false,
    );
  }

  CallStatus _parseCallStatus(String status) {
    switch (status.toLowerCase()) {
      case 'active':
      case 'connected':
        return CallStatus.active;
      case 'ringing':
        return CallStatus.ringing;
      case 'connecting':
        return CallStatus.connecting;
      case 'ended':
        return CallStatus.ended;
      case 'failed':
        return CallStatus.failed;
      default:
        return CallStatus.connecting;
    }
  }

  CallDirection _parseCallDirection(String direction) {
    switch (direction.toLowerCase()) {
      case 'incoming':
      case 'inbound':
        return CallDirection.incoming;
      case 'outgoing':
      case 'outbound':
        return CallDirection.outgoing;
      default:
        return CallDirection.outgoing;
    }
  }

  Widget _buildMakeCallSection() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: Theme.of(context).dividerColor.withValues(alpha: 0.2),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.1),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Make a Call',
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
              ),
              IconButton(
                onPressed: _closeCallFlow,
                icon: const Icon(Icons.close),
                tooltip: 'Hide Dialer',
              ),
            ],
          ),
          const SizedBox(height: 24),
          _buildCallFlowSteps(),
        ],
      ),
    );
  }

  Widget _buildCallFlowSteps() {
    switch (_callFlowStep) {
      case 'select-number':
        return _buildSelectNumberStep();
      case 'enter-phone':
        return _buildEnterPhoneStep();
      case 'choose-mode':
        return _buildChooseModeStep();
      case 'dialing':
      case 'resolving':
      case 'ringing':
      case 'connecting':
        return _buildConnectingStep();
      case 'connected':
        return _buildConnectedStep();
      default:
        return _buildSelectNumberStep();
    }
  }

  Widget _buildSelectNumberStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Step 1: Select a number to call from',
          style: Theme.of(
            context,
          ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 16),

        if (_sipLoading) ...[
          const Center(child: CircularProgressIndicator()),
          const SizedBox(height: 16),
          const Center(child: Text('Loading your phone numbers...')),
        ] else if (_sipConfigs.isNotEmpty) ...[
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            decoration: BoxDecoration(
              border: Border.all(color: Colors.grey.shade300),
              borderRadius: BorderRadius.circular(8),
            ),
            child: DropdownButtonHideUnderline(
              child: DropdownButton<String>(
                value: _selectedFromNumber.isNotEmpty
                    ? _selectedFromNumber
                    : null,
                hint: const Text('Select a number to call from'),
                isExpanded: true,
                items: _sipConfigs.map((config) {
                  final phoneNumber = config.contactNumber.isNotEmpty
                      ? config.contactNumber
                      : (config.phoneNumber ?? 'Unknown');
                  final provider = config.provider.isNotEmpty
                      ? config.provider
                      : 'Unknown Provider';
                  final isEligible = _isEligibleForOutgoing(config);
                  final eligibilityReason = _getEligibilityReason(config);

                  return DropdownMenuItem<String>(
                    value: phoneNumber,
                    enabled: isEligible,
                    child: Row(
                      children: [
                        Icon(
                          Icons.phone,
                          size: 16,
                          color: isEligible ? Colors.green : Colors.red,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            '${_formatPhoneNumberForDisplay(phoneNumber)} ($provider)',
                            style: TextStyle(
                              color: isEligible ? null : Colors.grey,
                            ),
                          ),
                        ),
                        if (isEligible)
                          const Icon(
                            Icons.check_circle,
                            size: 16,
                            color: Colors.green,
                          )
                        else
                          Text(
                            eligibilityReason ?? '',
                            style: const TextStyle(
                              fontSize: 10,
                              color: Colors.red,
                            ),
                          ),
                      ],
                    ),
                  );
                }).toList(),
                onChanged: (String? value) {
                  if (value != null) {
                    setState(() => _selectedFromNumber = value);
                  }
                },
              ),
            ),
          ),
        ] else ...[
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Colors.orange.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: Colors.orange.withValues(alpha: 0.3)),
            ),
            child: const Column(
              children: [
                Icon(Icons.warning, color: Colors.orange, size: 32),
                SizedBox(height: 12),
                Text(
                  'No SIP configurations found.',
                  style: TextStyle(fontWeight: FontWeight.w600),
                ),
                SizedBox(height: 8),
                Text('Set up your phone numbers in Settings first.'),
              ],
            ),
          ),
        ],

        const SizedBox(height: 24),

        // Continue button
        Row(
          mainAxisAlignment: MainAxisAlignment.end,
          children: [
            ElevatedButton.icon(
              onPressed: _selectedFromNumber.isNotEmpty ? _nextStep : null,
              icon: const Icon(Icons.arrow_forward, size: 16),
              label: const Text('Next: Enter Phone Number'),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.blue,
                foregroundColor: Colors.white,
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildEnterPhoneStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Step 2: Enter the phone number to call',
          style: Theme.of(
            context,
          ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 16),

        // Phone Number Input
        TextFormField(
          controller: _phoneController,
          decoration: const InputDecoration(
            labelText: 'Phone Number',
            hintText: '+1234567890',
            border: OutlineInputBorder(),
            prefixIcon: Icon(Icons.phone),
          ),
          keyboardType: TextInputType.phone,
          onChanged: (value) {
            setState(() {
              _phoneNumber = _formatPhoneNumber(value);
            });
          },
        ),

        // Validation Message
        if (_phoneNumber.length > 3 && !_isValidE164(_phoneNumber))
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              'Invalid phone number format. Use international format: +1234567890',
              style: TextStyle(color: Colors.red.shade600, fontSize: 12),
            ),
          ),

        const SizedBox(height: 16),

        // Dialpad Toggle
        ElevatedButton.icon(
          onPressed: () =>
              setState(() => _isDialpadCollapsed = !_isDialpadCollapsed),
          icon: Icon(_isDialpadCollapsed ? Icons.dialpad : Icons.keyboard_hide),
          label: Text(_isDialpadCollapsed ? 'Show Dialpad' : 'Hide Dialpad'),
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.blue.withValues(alpha: 0.1),
            foregroundColor: Colors.blue,
            elevation: 0,
          ),
        ),

        // Dialpad
        if (!_isDialpadCollapsed) ...[
          const SizedBox(height: 16),
          _buildDialpad(),
        ],

        const SizedBox(height: 24),

        // Step Actions
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            ElevatedButton.icon(
              onPressed: _prevStep,
              icon: const Icon(Icons.arrow_back, size: 16),
              label: const Text('Back'),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.grey.shade300,
              ),
            ),
            ElevatedButton.icon(
              onPressed: (_phoneNumber.isNotEmpty && _isValidE164(_phoneNumber))
                  ? _nextStep
                  : null,
              icon: const Icon(Icons.arrow_forward, size: 16),
              label: const Text('Next: Mode'),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.blue,
                foregroundColor: Colors.white,
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildChooseModeStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Step 3: Choose how to handle the call',
          style: Theme.of(
            context,
          ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 16),

        // Call Mode Options
        _buildCallModeOptions(),

        const SizedBox(height: 24),

        // Step Actions
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            ElevatedButton.icon(
              onPressed: _prevStep,
              icon: const Icon(Icons.arrow_back, size: 16),
              label: const Text('Back'),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.grey.shade300,
              ),
            ),
            ElevatedButton.icon(
              onPressed: _canMakeCall() ? _handleMakeCall : null,
              icon: const Icon(Icons.call, size: 16),
              label: const Text('Make Call'),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.green,
                foregroundColor: Colors.white,
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildConnectingStep() {
    final flowPhase = _callFlowStep;
    final currentCallData = _hookOutgoingCallRoom?.callData;
    final String? rawStatus = currentCallData?['status']
        ?.toString()
        .toLowerCase();
    final bool dataRinging = currentCallData?['isRinging'] == true;

    const allowedPhases = {
      'dialing',
      'resolving',
      'ringing',
      'connecting',
      'connected',
    };

    String currentPhase = allowedPhases.contains(flowPhase)
        ? flowPhase
        : 'dialing';

    if (rawStatus != null && rawStatus.isNotEmpty) {
      if (rawStatus.contains('ring')) {
        currentPhase = 'ringing';
      } else if (rawStatus == 'initiating') {
        currentPhase = 'dialing';
      } else if (rawStatus == 'connecting') {
        currentPhase = 'connecting';
      } else if (rawStatus == 'active' || rawStatus == 'connected') {
        currentPhase = 'connected';
      }
    }

    if (dataRinging) {
      currentPhase = 'ringing';
    }

    Color statusColor;
    IconData statusIcon;
    String displayStatus;
    String statusMessage;

    switch (currentPhase) {
      case 'dialing':
        statusColor = Colors.indigo;
        statusIcon = Icons.dialpad;
        displayStatus = 'DIALING';
        statusMessage = 'Dialing the MediaSFU bridge...';
        break;
      case 'resolving':
        statusColor = Colors.deepPurple;
        statusIcon = Icons.sync;
        displayStatus = 'RESOLVING';
        statusMessage =
            'Matching the call with your outgoing room and preparing media routes...';
        break;
      case 'ringing':
        statusColor = Colors.orange;
        statusIcon = Icons.ring_volume;
        displayStatus = 'RINGING';
        statusMessage = 'The callee is being alerted. Hang tight.';
        break;
      case 'connecting':
        statusColor = Colors.blue;
        statusIcon = Icons.phone_in_talk;
        displayStatus = 'CONNECTING';
        statusMessage = 'Negotiating media streams for the call...';
        break;
      case 'connected':
        statusColor = Colors.green;
        statusIcon = Icons.call;
        displayStatus = 'CONNECTED';
        statusMessage =
            'Call is live! Monitor the Active Calls section for controls.';
        break;
      default:
        statusColor = Colors.indigo;
        statusIcon = Icons.dialpad;
        displayStatus = 'DIALING';
        statusMessage = 'Dialing the MediaSFU bridge...';
    }

    return Column(
      children: [
        Text(
          'Step 4: Call in Progress',
          style: Theme.of(
            context,
          ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 24),

        // Enhanced status display with animated icon
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: statusColor.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: statusColor.withValues(alpha: 0.3)),
          ),
          child: Column(
            children: [
              // Animated status icon
              Icon(statusIcon, size: 36, color: statusColor),
              const SizedBox(height: 12),

              // Status text
              Text(
                displayStatus,
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: statusColor,
                ),
              ),
              const SizedBox(height: 8),

              Text(
                statusMessage,
                style: Theme.of(
                  context,
                ).textTheme.bodyMedium?.copyWith(color: Colors.grey.shade700),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),

        const SizedBox(height: 16),
        _buildCallProgressChips(currentPhase),

        const SizedBox(height: 20),

        // Call details
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.grey.shade50,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(
            children: [
              Row(
                children: [
                  const Icon(Icons.call_made, size: 16, color: Colors.blue),
                  const SizedBox(width: 8),
                  Text(
                    'Calling: ${_formatPhoneNumberForDisplay(_phoneNumber)}',
                    style: const TextStyle(fontWeight: FontWeight.w500),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  const Icon(Icons.phone, size: 16, color: Colors.green),
                  const SizedBox(width: 8),
                  Text(
                    'From: $_selectedFromNumber',
                    style: const TextStyle(fontWeight: FontWeight.w500),
                  ),
                ],
              ),
              if (currentCallData != null &&
                  currentCallData['startTimeISO'] != null) ...[
                const SizedBox(height: 8),
                Row(
                  children: [
                    const Icon(Icons.access_time, size: 16, color: Colors.grey),
                    const SizedBox(width: 8),
                    Text(
                      'Duration: ${_formatCallDuration(currentCallData['startTimeISO']?.toString())}',
                      style: const TextStyle(fontWeight: FontWeight.w500),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),

        const SizedBox(height: 16),

        // Loading indicator for non-connected states
        if (currentPhase != 'connected') ...[
          LinearProgressIndicator(
            value: {
              'dialing': 0.2,
              'resolving': 0.4,
              'ringing': 0.65,
              'connecting': 0.85,
            }[currentPhase],
          ),
          const SizedBox(height: 8),
          Text(
            currentPhase == 'ringing'
                ? 'Waiting for the calleé to answer...'
                : currentPhase == 'resolving'
                ? 'Confirming the SIP call on the network...'
                : 'Please wait while we connect your call...',
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(color: Colors.grey.shade600),
          ),
        ],
      ],
    );
  }

  Widget _buildCallProgressChips(String currentPhase) {
    final phases = [
      {'key': 'dialing', 'label': 'Dialing'},
      {'key': 'resolving', 'label': 'Resolving'},
      {'key': 'ringing', 'label': 'Ringing'},
      {'key': 'connecting', 'label': 'Connecting'},
      {'key': 'connected', 'label': 'Connected'},
    ];

    final currentIndex = phases.indexWhere(
      (phase) => phase['key'] == currentPhase,
    );
    final effectiveIndex = currentIndex >= 0 ? currentIndex : 0;

    return Wrap(
      spacing: 8,
      runSpacing: 8,
      alignment: WrapAlignment.center,
      children: [
        for (var i = 0; i < phases.length; i++)
          _buildPhaseChip(
            phases[i]['label']!,
            i <= effectiveIndex,
            i == effectiveIndex,
          ),
      ],
    );
  }

  Widget _buildPhaseChip(String label, bool reached, bool current) {
    final Color backgroundColor = current
        ? Colors.blue
        : reached
        ? Colors.blueGrey.shade400
        : Colors.grey.shade200;
    final Color textColor = current || reached
        ? Colors.white
        : Colors.grey.shade800;
    final IconData icon = current
        ? Icons.radio_button_checked
        : reached
        ? Icons.check_circle
        : Icons.radio_button_unchecked;

    return Chip(
      avatar: Icon(icon, size: 16, color: textColor),
      backgroundColor: backgroundColor,
      label: Text(
        label,
        style: TextStyle(
          color: textColor,
          fontWeight: current ? FontWeight.w600 : FontWeight.w400,
        ),
      ),
    );
  }

  Widget _buildConnectedStep() {
    return Column(
      children: [
        const Icon(Icons.check_circle, size: 64, color: Colors.green),
        const SizedBox(height: 16),
        Text(
          'Call initiated successfully!',
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.w600,
            color: Colors.green,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          'Your call to ${_formatPhoneNumberForDisplay(_phoneNumber)} has been set up.',
        ),
        const Text(
          'Monitor the call status in the Active Calls section above.',
        ),
      ],
    );
  }

  Widget _buildCallModeOptions() {
    // Get selected SIP config for autoAgent checking
    final selectedConfig = _sipConfigs
        .where((config) => config.contactNumber == _selectedFromNumber)
        .firstOrNull;

    final autoAgent = selectedConfig?.autoAgent;

    // Check if bot mode is properly configured for outgoing calls
    final autoAgentAvailable =
        autoAgent?.enabled == true &&
        autoAgent?.type != null &&
        (autoAgent!.type == SIPAutoAgentType.ai ||
            autoAgent.type == SIPAutoAgentType.ivr ||
            autoAgent.type == SIPAutoAgentType.playback);

    // CRITICAL: Check outgoingType is set to AI for bot outgoing calls
    final botModeAvailable =
        autoAgentAvailable && autoAgent.outgoingType == SIPAutoAgentType.ai;

    // Enhanced voice mode detection - check for existing rooms and ability to create new ones
    final hasExistingActiveRoom =
        (_isConnectedToRoom && _currentRoomName.isNotEmpty) ||
        (_hookOutgoingCallRoom?.isActive == true);
    final canCreateNewRoom =
        !_isConnectedToRoom &&
        _hookOutgoingCallRoom?.isActive != true &&
        _selectedFromNumber.isNotEmpty;

    // Voice mode is available if we have an active room OR can create one
    final voiceModeAvailable = hasExistingActiveRoom || canCreateNewRoom;

    // Auto-select the best available option
    final shouldSelectBot =
        botModeAvailable && (!hasExistingActiveRoom || !_isMicrophoneEnabled);
    final shouldSelectVoice =
        voiceModeAvailable && hasExistingActiveRoom && _isMicrophoneEnabled;

    return Column(
      children: [
        // Bot Call Mode Option
        _buildEnhancedCallModeOption(
          mode: 'bot',
          title: '🤖 Bot Call',
          subtitle: botModeAvailable
              ? "AI agent handles the call automatically"
              : autoAgentAvailable
              ? "Agent configured but outgoingType not set to AI"
              : "No AI agent configured for this number",
          isAvailable: botModeAvailable,
          isRecommended: shouldSelectBot,
          details: botModeAvailable
              ? [
                  "Agent Type: ${autoAgent.type?.name.toUpperCase() ?? 'Unknown'}",
                  "Outgoing Type: ${autoAgent.outgoingType?.name.toUpperCase() ?? 'Unknown'}",
                  "Perfect for automated calls, surveys, or information delivery",
                  "✅ No room connection required",
                ]
              : autoAgentAvailable
              ? [
                  "Agent Type: ${autoAgent.type?.name.toUpperCase() ?? 'Unknown'}",
                  "❌ Outgoing Type: ${autoAgent.outgoingType?.name.toUpperCase() ?? 'Not set'} (needs \"AI\")",
                  "The auto agent exists but outgoingType must be set to \"AI\" for bot calls",
                  "Configure outgoingType to \"AI\" in SIP settings to enable bot calls",
                ]
              : [
                  "❌ No auto agent configured",
                  "This number doesn't have AI/IVR/PLAYBACK agent setup",
                  "Configure auto agent in SIP settings to enable bot calls",
                ],
          onTap: botModeAvailable
              ? () {
                  setState(() {
                    _selectedCallMode = 'bot';
                  });
                }
              : null,
        ),

        const SizedBox(height: 16),

        // Voice Call Mode Option
        _buildEnhancedCallModeOption(
          mode: 'voice',
          title: '👤 Voice Call',
          subtitle: "You talk directly with the caller",
          isAvailable: voiceModeAvailable,
          isRecommended: shouldSelectVoice,
          details: _buildVoiceModeDetails(
            hasExistingActiveRoom,
            canCreateNewRoom,
          ),
          onTap: voiceModeAvailable
              ? () {
                  setState(() {
                    _selectedCallMode = 'voice';
                  });
                }
              : null,
          showCreateRoomButton: !hasExistingActiveRoom && canCreateNewRoom,
        ),
      ],
    );
  }

  List<String> _buildVoiceModeDetails(
    bool hasExistingActiveRoom,
    bool canCreateNewRoom,
  ) {
    List<String> details = ["Requires: Active MediaSFU room connection"];

    // Show current room status
    if (_isConnectedToRoom && _currentRoomName.isNotEmpty) {
      details.add("✅ Connected to room: $_currentRoomName");
      if (_isMicrophoneEnabled) {
        details.add("🎤 Microphone is active and ready");
      } else {
        details.add("🔇 Microphone is muted (you can still make the call)");
      }
    }

    // Show outgoing room status
    if (_hookOutgoingCallRoom?.isActive == true) {
      details.add(
        "✅ Outgoing call room ready: ${_hookOutgoingCallRoom!.displayName}",
      );
      if (_hookOutgoingCallRoom!.isMediaSFUConnected == true &&
          _isMicrophoneEnabled) {
        details.add("🎤 Microphone is active and ready");
      }
    }

    // Show option to create room if no existing room
    if (!hasExistingActiveRoom && canCreateNewRoom) {
      details.add("💡 You can create a voice room for this call");
      details.add("Duration: $_selectedDuration minutes");
    }

    return details;
  }

  bool _canMakeCall() {
    if (_isDialing || _isResolvingOutgoingCall) {
      return false;
    }

    // Must have a call mode selected
    if (_selectedCallMode == null) return false;

    final selectedConfig = _sipConfigs
        .where((config) => config.contactNumber == _selectedFromNumber)
        .firstOrNull;

    if (selectedConfig == null) return false;

    final autoAgent = selectedConfig.autoAgent;

    // Check if bot mode is properly configured for outgoing calls
    final autoAgentAvailable =
        autoAgent?.enabled == true &&
        autoAgent?.type != null &&
        (autoAgent!.type == SIPAutoAgentType.ai ||
            autoAgent.type == SIPAutoAgentType.ivr ||
            autoAgent.type == SIPAutoAgentType.playback);

    final botModeAvailable =
        autoAgentAvailable && autoAgent.outgoingType == SIPAutoAgentType.ai;

    // Enhanced voice mode detection
    final hasExistingActiveRoom =
        (_isConnectedToRoom && _currentRoomName.isNotEmpty) ||
        (_hookOutgoingCallRoom?.isActive == true);
    final canCreateNewRoom =
        !_isConnectedToRoom &&
        _hookOutgoingCallRoom?.isActive != true &&
        _selectedFromNumber.isNotEmpty;

    final voiceModeAvailable = hasExistingActiveRoom || canCreateNewRoom;

    // Call is valid if either:
    // 1. Bot mode is selected and available, OR
    // 2. Voice mode is selected and available
    if (_selectedCallMode == 'bot') {
      return botModeAvailable;
    } else if (_selectedCallMode == 'voice') {
      return voiceModeAvailable;
    }

    return false;
  }

  Widget _buildEnhancedCallModeOption({
    required String mode,
    required String title,
    required String subtitle,
    required bool isAvailable,
    required bool isRecommended,
    required List<String> details,
    required VoidCallback? onTap,
    bool showCreateRoomButton = false,
  }) {
    final isSelected = _selectedCallMode == mode;

    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          border: Border.all(
            color: isSelected
                ? Colors.blue
                : isAvailable
                ? Colors.grey.shade300
                : Colors.grey.shade200,
            width: isSelected ? 2 : 1,
          ),
          borderRadius: BorderRadius.circular(12),
          color: isSelected
              ? Colors.blue.withValues(alpha: 0.05)
              : isAvailable
              ? Colors.white
              : Colors.grey.shade50,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header Row
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(
                            title,
                            style: Theme.of(context).textTheme.titleMedium
                                ?.copyWith(
                                  fontWeight: FontWeight.w600,
                                  color: isAvailable ? null : Colors.grey,
                                ),
                          ),
                          const SizedBox(width: 8),
                          if (isRecommended)
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 8,
                                vertical: 2,
                              ),
                              decoration: BoxDecoration(
                                color: Colors.green.withValues(alpha: 0.1),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Text(
                                '✅ Recommended',
                                style: TextStyle(
                                  fontSize: 10,
                                  color: Colors.green.shade700,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ),
                          if (!isAvailable)
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 8,
                                vertical: 2,
                              ),
                              decoration: BoxDecoration(
                                color: Colors.red.withValues(alpha: 0.1),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Text(
                                '❌ Unavailable',
                                style: TextStyle(
                                  fontSize: 10,
                                  color: Colors.red.shade700,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        subtitle,
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: isAvailable
                              ? Colors.grey.shade600
                              : Colors.grey.shade400,
                        ),
                      ),
                    ],
                  ),
                ),
                if (isSelected)
                  const Icon(Icons.check_circle, color: Colors.blue, size: 24),
              ],
            ),

            const SizedBox(height: 12),

            // Details
            ...details.map(
              (detail) => Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Text(
                  detail,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: isAvailable
                        ? Colors.grey.shade600
                        : Colors.grey.shade400,
                    fontSize: 12,
                  ),
                ),
              ),
            ),

            // Create Room Button for Voice Mode
            if (showCreateRoomButton) ...[
              const SizedBox(height: 12),
              ElevatedButton.icon(
                onPressed: _isCreatingRoom ? null : _handleConnectToRoom,
                icon: _isCreatingRoom
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.mic, size: 16),
                label: Text(
                  _isCreatingRoom ? 'Creating Room...' : '🎤 Create Voice Room',
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.blue,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 8,
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildDialpad() {
    final buttons = [
      ['1', '2', '3'],
      ['4', '5', '6'],
      ['7', '8', '9'],
      ['*', '0', '#'],
    ];

    return Center(
      child: Container(
        constraints: const BoxConstraints(maxWidth: 300),
        child: Column(
          children: [
            // Regular rows
            ...buttons.map((row) {
              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(
                  children: row.map((digit) {
                    return Expanded(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 4),
                        child: _buildDialpadButton(digit),
                      ),
                    );
                  }).toList(),
                ),
              );
            }),
            // Special row for '+' button - centered, not full width
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  SizedBox(
                    width: 80, // Fixed width for '+' button
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      child: _buildDialpadButton('+'),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDialpadButton(String digit) {
    return AspectRatio(
      aspectRatio: 1.5,
      child: ElevatedButton(
        onPressed: () => _handleDialpadClick(digit),
        style: ElevatedButton.styleFrom(
          backgroundColor: Theme.of(
            context,
          ).colorScheme.surfaceContainerHighest,
          foregroundColor: Theme.of(context).colorScheme.onSurfaceVariant,
          elevation: 2,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
        child: Text(
          digit,
          style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w600),
        ),
      ),
    );
  }

  Widget _buildActiveCallsSection() {
    final filteredCalls = _allDisplayCalls
        .where((call) => !call.sipCallId.startsWith('dummy_outgoing_'))
        .toList();

    if (filteredCalls.isEmpty) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: Theme.of(context).cardColor,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.grey.shade300),
        ),
        child: Column(
          children: [
            const Icon(Icons.phone_disabled, size: 48, color: Colors.grey),
            const SizedBox(height: 16),
            Text(
              'No Active Calls',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                color: Colors.grey.shade600,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'There are currently no active calls. Click "Show Dialer" to begin a new call.',
              style: Theme.of(
                context,
              ).textTheme.bodyMedium?.copyWith(color: Colors.grey.shade500),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            ElevatedButton.icon(
              onPressed: () =>
                  _showDialer ? _closeCallFlow() : _startCallFlow(),
              icon: const Icon(Icons.phone),
              label: Text(_showDialer ? 'Hide Dialer' : 'Show Dialer'),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.blue,
                foregroundColor: Colors.white,
              ),
            ),
          ],
        ),
      );
    }

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.1),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Active Calls (${filteredCalls.length})',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Flexible(
                fit: FlexFit.loose,
                child: ElevatedButton.icon(
                  onPressed: () =>
                      _showDialer ? _closeCallFlow() : _startCallFlow(),
                  icon: const Icon(Icons.phone),
                  label: Text(_showDialer ? 'Hide Dialer' : 'Show Dialer'),
                  style: ElevatedButton.styleFrom(
                    minimumSize: const Size(0, 36),
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    backgroundColor: Colors.blue,
                    foregroundColor: Colors.white,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),

          // Active calls list
          ...filteredCalls.map((call) => _buildActiveCallItem(call)),
        ],
      ),
    );
  }

  Widget _buildActiveCallItem(Call call) {
    final callId = call.sipCallId.isNotEmpty
        ? call.sipCallId
        : 'call-${_allDisplayCalls.indexOf(call)}';
    final isExpanded = _isCallExpanded(callId);

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        border: Border.all(
          color: (call.direction == CallDirection.incoming)
              ? Colors.green.shade300
              : Colors.blue.shade300,
          width: isExpanded ? 2 : 1,
        ),
        borderRadius: BorderRadius.circular(8),
        color: isExpanded ? Colors.grey.shade50 : null,
      ),
      child: Column(
        children: [
          // Call Header
          InkWell(
            onTap: () => _toggleCallExpansion(callId),
            borderRadius: BorderRadius.circular(8),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  // Direction Icon
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: (call.direction == CallDirection.incoming)
                          ? Colors.green.withValues(alpha: 0.1)
                          : Colors.blue.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Icon(
                      (call.direction == CallDirection.incoming)
                          ? Icons.call_received
                          : Icons.call_made,
                      color: (call.direction == CallDirection.incoming)
                          ? Colors.green
                          : Colors.blue,
                      size: 16,
                    ),
                  ),
                  const SizedBox(width: 12),

                  // Call Details
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Builder(
                          builder: (context) {
                            final parsed = _extractCleanIdentifier(
                              call.direction == CallDirection.outgoing
                                  ? call.calledUri
                                  : call.callerIdRaw,
                            );
                            final title =
                                (call.direction == CallDirection.outgoing &&
                                    (parsed.isEmpty || parsed == 'Unknown'))
                                ? 'Unknown Caller'
                                : parsed;
                            return Text(
                              title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: Theme.of(context).textTheme.titleMedium
                                  ?.copyWith(fontWeight: FontWeight.w600),
                            );
                          },
                        ),
                        const SizedBox(height: 4),
                        Text(
                          call.humanParticipantName ?? 'Unknown Caller',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(color: Colors.grey.shade600),
                        ),
                      ],
                    ),
                  ),

                  // Call Status
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: _getCallStatusColor(
                            call.status,
                          ).withValues(alpha: 0.1),
                          border: Border.all(
                            color: _getCallStatusColor(
                              call.status,
                            ).withValues(alpha: 0.3),
                          ),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          call.status.name.toUpperCase(),
                          style: TextStyle(
                            color: _getCallStatusColor(call.status),
                            fontSize: 10,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      if (call.startTimeISO.isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text(
                          DateTime.parse(
                            call.startTimeISO,
                          ).toLocal().toString().substring(11, 19),
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(color: Colors.grey.shade500),
                        ),
                      ],
                    ],
                  ),

                  // Expand Icon
                  const SizedBox(width: 8),
                  Icon(
                    isExpanded ? Icons.expand_less : Icons.expand_more,
                    color: Colors.grey.shade600,
                  ),
                ],
              ),
            ),
          ),

          // Expanded Content
          if (isExpanded) ...[
            const Divider(height: 1),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Quick Actions
                  _buildCallQuickActions(call),

                  const SizedBox(height: 16),

                  // Critical Metadata
                  _buildCriticalMetadata(call),

                  const SizedBox(height: 16),

                  // Detailed Metadata Toggle
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          'Detailed Information',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context).textTheme.titleSmall
                              ?.copyWith(fontWeight: FontWeight.w600),
                        ),
                      ),
                      const SizedBox(width: 8),
                      TextButton.icon(
                        onPressed: () => _toggleMetadataCollapse(callId),
                        icon: Icon(
                          _isMetadataCollapsed(callId)
                              ? Icons.expand_more
                              : Icons.expand_less,
                          size: 16,
                        ),
                        label: Text(
                          _isMetadataCollapsed(callId) ? 'Show' : 'Hide',
                        ),
                      ),
                    ],
                  ),

                  // Detailed Metadata
                  if (!_isMetadataCollapsed(callId))
                    _buildDetailedMetadata(call),

                  // CRITICAL: Media Room Integration - FIXED to match React pattern
                  if (call.roomName.isNotEmpty) ...[
                    const SizedBox(height: 16),
                    _buildMediaRoomIntegration(call),
                  ],
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildCallQuickActions(Call call) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        // Join call action for non-joined calls
        if (call.roomName.isNotEmpty && _currentRoomName != call.roomName)
          ElevatedButton.icon(
            onPressed: () => _handleJoinCall(call),
            icon: const Icon(Icons.meeting_room, size: 16),
            label: Text(_isConnectedToRoom ? 'Switch Room' : 'Join Room'),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.blue,
              foregroundColor: Colors.white,
            ),
          ),

        // Answer/Decline for incoming calls
        if (call.direction == CallDirection.incoming &&
            (call.status == CallStatus.ringing ||
                call.status == CallStatus.connecting)) ...[
          ElevatedButton.icon(
            onPressed: () => _handleAnswerCall(call),
            icon: const Icon(Icons.call, size: 16),
            label: const Text('Answer'),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.green,
              foregroundColor: Colors.white,
            ),
          ),
          ElevatedButton.icon(
            onPressed: () => _handleDeclineCall(call),
            icon: const Icon(Icons.call_end, size: 16),
            label: const Text('Decline'),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.red,
              foregroundColor: Colors.white,
            ),
          ),
        ],

        // Hold/End for active calls
        if (call.status == CallStatus.active ||
            call.status.toString().toLowerCase() == 'connected') ...[
          ElevatedButton.icon(
            onPressed: () => _handleHoldCall(call),
            icon: const Icon(Icons.pause, size: 16),
            label: const Text('Hold'),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.orange,
              foregroundColor: Colors.white,
            ),
          ),
          ElevatedButton.icon(
            onPressed: () => _handleEndCall(call),
            icon: const Icon(Icons.call_end, size: 16),
            label: const Text('End Call'),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.red,
              foregroundColor: Colors.white,
            ),
          ),
        ],

        // End call for other statuses
        if (call.status != CallStatus.active &&
            call.status.toString().toLowerCase() != 'connected' &&
            call.status != CallStatus.ringing)
          ElevatedButton.icon(
            onPressed: () => _handleEndCall(call),
            icon: const Icon(Icons.call_end, size: 16),
            label: const Text('End Call'),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.red,
              foregroundColor: Colors.white,
            ),
          ),
      ],
    );
  }

  Widget _buildCriticalMetadata(Call call) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.grey.shade50,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.grey.shade200),
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          // Use 2-column layout for wide screens (>600px width)
          final useWideLayout = constraints.maxWidth > 600;

          final metadataItems = <Widget>[
            _buildMetadataRow('Status', call.status.name.toUpperCase()),
            _buildMetadataRow('Direction', call.direction.name.toUpperCase()),
            if (call.durationSeconds > 0 || call.startTimeISO.isNotEmpty)
              _buildMetadataRow('Duration', _formatDurationWithFallback(call)),
            if (call.startTimeISO.isNotEmpty)
              _buildMetadataRow(
                'Started',
                DateTime.parse(
                  call.startTimeISO,
                ).toLocal().toString().substring(11, 19),
              ),
            if (call.roomName.isNotEmpty)
              _buildMetadataRow('Room', call.roomName),
            if (call.pendingHumanIntervention)
              _buildMetadataRow(
                'Needs Attention',
                'Human intervention required',
                isWarning: true,
              ),
          ];

          if (useWideLayout) {
            // Group items into pairs for 2-column layout
            final rows = <Widget>[];
            for (int i = 0; i < metadataItems.length; i += 2) {
              if (i + 1 < metadataItems.length) {
                // Two items in a row
                rows.add(
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(child: metadataItems[i]),
                      const SizedBox(width: 16),
                      Expanded(child: metadataItems[i + 1]),
                    ],
                  ),
                );
              } else {
                // Single item (odd number)
                rows.add(metadataItems[i]);
              }
            }
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: rows,
            );
          } else {
            // Single column layout for narrow screens
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: metadataItems,
            );
          }
        },
      ),
    );
  }

  Widget _buildDetailedMetadata(Call call) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.blue.shade50,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.blue.shade200),
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          // Use 2-column layout for wide screens (>600px width)
          final useWideLayout = constraints.maxWidth > 600;

          final metadataItems = <Widget>[
            _buildMetadataRow(
              'Call ID',
              call.sipCallId.isNotEmpty ? call.sipCallId : 'N/A',
            ),
            _buildMetadataRow(
              'From',
              _extractCleanIdentifier(call.callerIdRaw),
            ),
            _buildMetadataRow('To', _extractCleanIdentifier(call.calledUri)),
            if (call.humanParticipantName?.isNotEmpty == true)
              _buildMetadataRow(
                'Human Participant',
                call.humanParticipantName!,
              ),
            if (call.startTimeISO.isNotEmpty)
              _buildMetadataRow(
                'Full Start Time',
                DateTime.parse(call.startTimeISO).toLocal().toString(),
              ),
          ];

          if (useWideLayout) {
            // Group items into pairs for 2-column layout
            final rows = <Widget>[];
            for (int i = 0; i < metadataItems.length; i += 2) {
              if (i + 1 < metadataItems.length) {
                // Two items in a row
                rows.add(
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(child: metadataItems[i]),
                      const SizedBox(width: 16),
                      Expanded(child: metadataItems[i + 1]),
                    ],
                  ),
                );
              } else {
                // Single item (odd number)
                rows.add(metadataItems[i]);
              }
            }
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: rows,
            );
          } else {
            // Single column layout for narrow screens
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: metadataItems,
            );
          }
        },
      ),
    );
  }

  Widget _buildMetadataRow(
    String label,
    String value, {
    bool isWarning = false,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 100,
            child: Text(
              '$label:',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                fontWeight: FontWeight.w600,
                color: Colors.grey.shade700,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: isWarning
                    ? Colors.orange.shade700
                    : Colors.grey.shade800,
                fontWeight: isWarning ? FontWeight.w600 : null,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMediaRoomIntegration(Call call) {
    // This is the SECOND MediaSFURoomDisplay instance for external room joining
    // PRIORITIZE showing the MediaSFU handler when the selected/current room matches this call,
    // regardless of whether the room was created by us. This mirrors the React behavior.

    // Suppress duplicate rendering when this call represents the same room
    // already shown in the top section AND it's our voice-created room or the
    // active outgoing setup room. This matches React where the top handler is
    // the single source of truth.
    final topRoomName = _getTopRoomName();
    final isSameAsTop = topRoomName != null && topRoomName == call.roomName;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Row(
        //   children: [
        //     const Icon(Icons.headset, size: 16, color: Colors.purple),
        //     const SizedBox(width: 8),
        //     Text(
        //       'Media Room Integration',
        //       style: Theme.of(context).textTheme.titleSmall?.copyWith(
        //             fontWeight: FontWeight.w600,
        //             color: Colors.purple.shade700,
        //           ),
        //     ),
        //   ],
        // ),
        // const SizedBox(height: 8),

        // CRITICAL: Show different UI based on whether this call's room
        // is the currently selected room. If it is, render the MediaSFU handler
        // so it can auto-join; otherwise show the join button.
        if (call.roomName.isNotEmpty && _currentRoomName == call.roomName) ...[
          if (isSameAsTop) ...[
            // Same room as the top section: show banner only (avoid duplicate UI)
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.green[50],
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.green[300]!),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: const [
                  Text(
                    '🎧 Media Room Integration (Shown Above)',
                    style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
                  ),
                  SizedBox(height: 6),
                  Text(
                    'This call uses the same room as the Voice Room section. Use the controls above.',
                    style: TextStyle(fontSize: 12, color: Colors.black87),
                  ),
                ],
              ),
            ),
          ] else ...[
            // Different from top room: embed a SECOND MediaSFURoomDisplay here to join this call
            MediaSFURoomDisplay(
              roomName: call.roomName,
              participantName: _currentParticipantName,
              callId: call.sipCallId.isNotEmpty ? call.sipCallId : call.id,
              duration: _selectedDuration,
              onRoomNameUpdate: _handleRoomNameUpdate,
              onConnectionChange: _handleConnectionChange,
              onMicrophoneChange: _handleMicrophoneChange,
              onDisconnect: _handleRoomDisconnect,
              onEndCall: _handleRoomEndCall,
              autoJoin: true,
              isOutgoingCallSetup: false,
              currentCall: call.toJson(),
            ),
          ],
        ] else ...[
          // Not selected - Show room details and join button
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Text(
                    '🎧 Media Room Integration',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 4,
                      vertical: 2,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.red[100],
                      borderRadius: BorderRadius.circular(4),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              // Not selected - Show room details and join button
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(color: Colors.grey[200]!),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            'Room: ${call.roomName}',
                            style: const TextStyle(fontWeight: FontWeight.w500),
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 4,
                          ),
                          decoration: BoxDecoration(
                            color: Colors.red[100],
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: const Text(
                            '🔴 Not Connected',
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.red,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Join the media room to participate in voice/video for this call',
                      style: TextStyle(fontSize: 14, color: Colors.grey),
                    ),
                    const SizedBox(height: 12),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: () {
                          _handleJoinCall(call);
                        },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.blue,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 12),
                        ),
                        child: const Text('🎯 Join Media Room'),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ],
    );
  }

  String _extractCleanIdentifier(String sipUri) {
    if (sipUri.isEmpty) return 'Unknown';

    // Remove SIP protocol prefix if present
    String cleanUri = sipUri.replaceFirst(
      RegExp(r'^sips?:', caseSensitive: false),
      '',
    );

    // Remove angle brackets if present
    cleanUri = cleanUri.replaceAll(RegExp(r'[<>]'), '');

    // Split at @ to get the user part
    final parts = cleanUri.split('@');
    final userPart = parts.isNotEmpty ? parts[0] : cleanUri;

    // Check if it's an IP address (IPv4 pattern)
    final ipv4Pattern = RegExp(r'^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$');
    if (ipv4Pattern.hasMatch(userPart)) {
      return userPart; // Return full IP address
    }

    // Check if it's an IPv6 address (simplified pattern)
    final ipv6Pattern = RegExp(r'^[0-9a-fA-F:]+$');
    if (ipv6Pattern.hasMatch(userPart) && userPart.contains(':')) {
      return userPart; // Return full IPv6 address
    }

    // Extract phone number from user part
    final phoneMatch = RegExp(r'(\+?\d+)').firstMatch(userPart);
    if (phoneMatch != null) {
      return phoneMatch.group(1)!;
    }

    // If no phone number found, return the user part (could be a username)
    return userPart.isNotEmpty ? userPart : sipUri;
  }

  Color _getCallStatusColor(CallStatus status) {
    switch (status) {
      case CallStatus.active:
        return Colors.green;
      case CallStatus.ringing:
      case CallStatus.connecting:
        return Colors.blue;
      case CallStatus.onHold:
        return Colors.orange;
      case CallStatus.ended:
      case CallStatus.completed:
        return Colors.grey;
      case CallStatus.failed:
      case CallStatus.rejected:
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  // API Configuration Prompt
  Widget _buildApiConfigurationPrompt() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(32),
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.1),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        children: [
          Icon(Icons.settings, size: 64, color: Colors.grey.shade400),
          const SizedBox(height: 16),
          Text(
            'API Not Configured',
            style: Theme.of(
              context,
            ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 8),
          Text(
            'Please configure your API settings to make calls.',
            style: Theme.of(context).textTheme.bodyLarge,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 16),
          ElevatedButton.icon(
            onPressed: () => Navigator.pushNamed(context, '/settings'),
            icon: const Icon(Icons.settings),
            label: const Text('Go to Settings'),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.blue,
              foregroundColor: Colors.white,
            ),
          ),
        ],
      ),
    );
  }

  // Modal Widgets
  Widget _buildNotificationModal() {
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
                _getNotificationIcon(_notification.type),
                size: 48,
                color: _getNotificationColor(_notification.type),
              ),
              const SizedBox(height: 16),
              Text(
                _notification.title,
                style: Theme.of(
                  context,
                ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w600),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              Text(
                _notification.message,
                style: Theme.of(context).textTheme.bodyMedium,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),
              ElevatedButton(
                onPressed: _closeNotification,
                child: const Text('OK'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildMicrophoneConfirmationModal() {
    return Container(
      color: Colors.black.withValues(alpha: 0.5),
      child: Center(
        child: Container(
          margin: const EdgeInsets.all(24),
          padding: const EdgeInsets.all(24),
          constraints: const BoxConstraints(
            maxWidth: 400,
          ), // Max width for large screens
          decoration: BoxDecoration(
            color: Theme.of(context).cardColor,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.mic_off, size: 48, color: Colors.orange),
              const SizedBox(height: 16),
              const Text(
                'Microphone Disabled',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              const Text(
                'You\'re making a call from your voice room but your microphone is disabled. The call will start without your audio participation. Do you want to proceed anyway?',
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton(
                      onPressed: () {
                        if (_microphoneConfirmation.onCancel != null) {
                          _microphoneConfirmation.onCancel!();
                        }
                        setState(
                          () => _microphoneConfirmation = ConfirmationState(
                            isOpen: false,
                            onConfirm: null,
                            onCancel: null,
                          ),
                        );
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.grey,
                      ),
                      child: const Text('Cancel'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: () {
                        if (_microphoneConfirmation.onConfirm != null) {
                          _microphoneConfirmation.onConfirm!();
                        }
                        setState(
                          () => _microphoneConfirmation = ConfirmationState(
                            isOpen: false,
                            onConfirm: null,
                            onCancel: null,
                          ),
                        );
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.orange,
                      ),
                      child: const Text('Proceed with Call'),
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

  Widget _buildNavigationConfirmationModal() {
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
              const Icon(Icons.warning, size: 48, color: Colors.orange),
              const SizedBox(height: 16),
              const Text(
                'Leave Page?',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              Text(
                _navigationConfirmation.message,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton(
                      onPressed: () {
                        if (_navigationConfirmation.onCancel != null) {
                          _navigationConfirmation.onCancel!();
                        }
                        setState(
                          () => _navigationConfirmation =
                              NavigationConfirmationState(
                                isOpen: false,
                                message: '',
                                onConfirm: null,
                                onCancel: null,
                              ),
                        );
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.grey,
                      ),
                      child: const Text('Stay Here'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: () {
                        if (_navigationConfirmation.onConfirm != null) {
                          _navigationConfirmation.onConfirm!();
                        }
                        setState(
                          () => _navigationConfirmation =
                              NavigationConfirmationState(
                                isOpen: false,
                                message: '',
                                onConfirm: null,
                                onCancel: null,
                              ),
                        );
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.orange,
                      ),
                      child: const Text('Leave Page'),
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

  IconData _getNotificationIcon(String type) {
    switch (type) {
      case 'success':
        return Icons.check_circle;
      case 'error':
        return Icons.error;
      case 'warning':
        return Icons.warning;
      default:
        return Icons.info;
    }
  }

  Color _getNotificationColor(String type) {
    switch (type) {
      case 'success':
        return Colors.green;
      case 'error':
        return Colors.red;
      case 'warning':
        return Colors.orange;
      default:
        return Colors.blue;
    }
  }

  String _formatCallDuration(String? startTimeISO) {
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

  // Room validation methods
  void _startRoomValidation() {
    _roomValidationTimer?.cancel();
    _roomValidationTimer = Timer.periodic(const Duration(seconds: 5), (timer) {
      _validateRoomStability();
    });
  }

  void _stopRoomValidation() {
    _roomValidationTimer?.cancel();
    _roomValidationTimer = null;
  }

  void _validateRoomStability() {
    final currentRoom = _outgoingCallRoom;
    if (currentRoom == null) return;

    // Check if we have an outgoing setup room that should remain stable
    if (currentRoom.roomName.isNotEmpty) {
      // Prevent switching away from stable outgoing setup rooms
      final isStableRoom = currentRoom.sipCallId?.isNotEmpty == true;

      if (isStableRoom && !currentRoom.isActive) {
        // Restore room to active state if it was incorrectly deactivated
        setState(() {
          if (_hookOutgoingCallRoom != null) {
            _hookOutgoingCallRoom = currentRoom.copyWith(isActive: true);
          } else if (_legacyOutgoingCallRoom != null) {
            _legacyOutgoingCallRoom = currentRoom.copyWith(isActive: true);
          }
        });
      }
    }
  }
}
