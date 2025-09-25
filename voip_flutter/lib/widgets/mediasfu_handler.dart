import 'package:flutter/material.dart';
import 'package:mediasfu_sdk/mediasfu_sdk.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';
import '../utils/logger.dart';

/// MediaSFU Handler for Flutter - equivalent to React MediaSFUHandler
/// Handles room creation and joining with MediaSFU SDK
class MediaSFUHandler extends StatefulWidget {
  final String action; // "create" or "join"
  final int? duration;
  final int? capacity;
  final String name;
  final String? meetingID;
  final MediasfuParameters? sourceParameters;
  final void Function(MediasfuParameters? parameters)? updateSourceParameters;
  final void Function(String roomName, String meetingID)? onRoomCreated;
  final void Function(String roomName)? onRoomJoined;
  final void Function(String error)? onError;

  const MediaSFUHandler({
    super.key,
    required this.action,
    this.duration,
    this.capacity,
    required this.name,
    this.meetingID,
    this.sourceParameters,
    this.updateSourceParameters,
    this.onRoomCreated,
    this.onRoomJoined,
    this.onError,
  });

  @override
  State<MediaSFUHandler> createState() => _MediaSFUHandlerState();
}

class _MediaSFUHandlerState extends State<MediaSFUHandler> {
  bool _isProcessing = false;
  MediasfuGenericOptions? _mediasfuOptions;
  bool _shouldCreateMediaSFU = false;
  bool _isInitialized = false; // Track if MediaSFU has been initialized

  @override
  void initState() {
    super.initState();
    Logger.debug(
        'MediaSFUHandler initState() called with action: ${widget.action}');
    _initializeMediaSFU();
  }

  @override
  void didUpdateWidget(MediaSFUHandler oldWidget) {
    super.didUpdateWidget(oldWidget);
    Logger.debug('MediaSFUHandler didUpdateWidget() called');
    Logger.debug(
        'Old action: ${oldWidget.action}, New action: ${widget.action}');
    Logger.debug('Old name: ${oldWidget.name}, New name: ${widget.name}');
    Logger.debug(
        'Old meetingID: ${oldWidget.meetingID}, New meetingID: ${widget.meetingID}');

    // For room name updates during create action, don't re-initialize
    // This happens when MediaSFU returns the real room name
    if (widget.action == 'create' &&
        oldWidget.action == 'create' &&
        widget.name == oldWidget.name &&
        widget.duration == oldWidget.duration &&
        widget.capacity == oldWidget.capacity &&
        _isInitialized) {
      Logger.debug('Room name update during create - not re-initializing');
      return;
    }

    // Re-initialize only for significant changes
    if (widget.action != oldWidget.action || widget.name != oldWidget.name) {
      Logger.debug('Significant parameters changed, re-initializing MediaSFU');
      _initializeMediaSFU();
    }
  }

  Future<void> _initializeMediaSFU() async {
    Logger.debug('_initializeMediaSFU() called, _isProcessing: $_isProcessing');
    if (_isProcessing) return;

    setState(() {
      _isProcessing = true;
    });

    try {
      Logger.info('MediaSFUHandler initializing: ${widget.action}');

      if (widget.action == 'create') {
        await _createRoom();
      } else if (widget.action == 'join') {
        await _joinRoom();
      }

      setState(() {
        _isInitialized = true;
        _isProcessing = false;
      });
    } catch (error) {
      Logger.error('MediaSFU initialization failed: $error');
      setState(() {
        _isProcessing = false;
      });
      widget.onError?.call('Failed to initialize MediaSFU: $error');
    }
  }

  Future<void> _createRoom() async {
    try {
      // Get stored credentials
      final credentials = await _getStoredCredentials();

      // Create MediaSFU create options - EXACT React equivalent
      final createOptions = CreateMediaSFURoomOptions(
        action: "create",
        duration: widget.duration ?? 15,
        capacity: widget.capacity ?? 5,
        userName: widget.name,
        eventType: EventType.conference,
        recordOnly: false,
        dataBuffer: true,
        bufferType: "all",
        supportSIP: true,
        directionSIP: "both",
      );

      // Prepare MediaSFU options for widget creation - ensure auto-connect without UI
      _mediasfuOptions = MediasfuGenericOptions(
        credentials: credentials,
        connectMediaSFU:
            true, // Enable auto connection for Flutter headless usage
        returnUI: false,
        noUIPreJoinOptionsCreate: createOptions,
        sourceParameters: widget.sourceParameters,
        updateSourceParameters: widget.updateSourceParameters,
      );

      // Trigger widget rebuild to create MediaSFU widget
      setState(() {
        _shouldCreateMediaSFU = true;
      });
    } catch (error) {
      Logger.error('Failed to create room: $error');
      rethrow;
    }
  }

  Future<void> _joinRoom() async {
    if (widget.meetingID == null || widget.meetingID!.isEmpty) {
      throw Exception('Meeting ID is required for joining a room');
    }

    try {
      // Get stored credentials
      final credentials = await _getStoredCredentials();

      // Create MediaSFU join options
      final joinOptions = JoinMediaSFURoomOptions(
        action: "join",
        userName: widget.name,
        meetingID: widget.meetingID!,
      );

      // Prepare MediaSFU options for widget creation - ensure auto-connect without UI
      _mediasfuOptions = MediasfuGenericOptions(
        credentials: credentials,
        connectMediaSFU:
            true, // Enable auto connection for Flutter headless usage
        returnUI: false,
        noUIPreJoinOptionsJoin: joinOptions,
        sourceParameters: widget.sourceParameters,
        updateSourceParameters: widget.updateSourceParameters,
      );

      // Trigger widget rebuild to create MediaSFU widget
      setState(() {
        _shouldCreateMediaSFU = true;
      });
    } catch (error) {
      Logger.error('Failed to join room: $error');
      rethrow;
    }
  }

  Future<Credentials> _getStoredCredentials() async {
    try {
      final prefs = await SharedPreferences.getInstance();

      // First try the new JSON format (matching HTTP client)
      final credentialsJson = prefs.getString('mediaSFUCredentials');

      if (credentialsJson != null && credentialsJson.isNotEmpty) {
        final credentials = Map<String, dynamic>.from(
            jsonDecode(credentialsJson) as Map<String, dynamic>);
        final apiUserName = credentials['apiUserName'] as String? ?? '';
        final apiKey = credentials['apiKey'] as String? ?? '';

        Logger.debug(
            'MediaSFU Handler loaded credentials - Username: $apiUserName, Key length: ${apiKey.length}');

        return Credentials(
          apiUserName: apiUserName,
          apiKey: apiKey,
        );
      }

      // Fallback to older keys and alternate naming for backward compatibility
      // Primary alternate keys written by ConfigService
      String apiUserName = prefs.getString('mediasfu_api_username') ?? '';
      String apiKey = prefs.getString('mediasfu_api_key') ?? '';

      // Older alternate keys
      if (apiUserName.isEmpty) {
        apiUserName = prefs.getString('mediasfu_username') ?? '';
      }

      Logger.debug(
          'MediaSFU Handler using fallback credentials - Username: $apiUserName, Key length: ${apiKey.length}');

      return Credentials(
        apiUserName: apiUserName,
        apiKey: apiKey,
      );
    } catch (error) {
      Logger.error('Error loading MediaSFU credentials: $error');
      return Credentials(
        apiUserName: '',
        apiKey: '',
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    // Return a headless MediaSFU widget that handles operations in the background
    // Similar to the React version, this component doesn't show UI but manages MediaSFU operations

    if (_isProcessing) {
      return const SizedBox(
        width: 0,
        height: 0,
        child: SizedBox.shrink(),
      );
    }

    // Create MediaSFU widget if options are ready and credentials are valid
    if (_shouldCreateMediaSFU && _mediasfuOptions != null) {
      try {
        // Validate credentials before creating MediaSFU widget
        final credentials = _mediasfuOptions!.credentials;

        Logger.debug('Validating MediaSFU credentials:');
        // Reduced verbose credential logs

        if (credentials == null ||
            credentials.apiUserName.isEmpty ||
            credentials.apiKey.isEmpty) {
          // Only check for presence; let the SDK/server validate details
          Logger.warn(
              'Invalid MediaSFU credentials - MediaSFU widget will not render');
          widget.onError?.call(
              'MediaSFU credentials not configured. Please set valid credentials in settings.');
          return const SizedBox(
            width: 0,
            height: 0,
            child: SizedBox.shrink(),
          );
        }

        Logger.info(
            'Creating MediasfuGeneric with valid credentials - Username: ${credentials.apiUserName}');
        Logger.info('Widget creation parameters:');
        Logger.info(
            '  - connectMediaSFU: ${_mediasfuOptions!.connectMediaSFU}');
        Logger.info('  - returnUI: ${_mediasfuOptions!.returnUI}');
        Logger.info(
            '  - sourceParameters provided: ${_mediasfuOptions!.sourceParameters != null}');
        Logger.info('  - Room name: ${widget.meetingID}');
        Logger.info('Starting MediaSFU widget creation...');

        return SizedBox(
          width: 0,
          height: 0,
          child: MediasfuGeneric(
            options: _mediasfuOptions!,
          ),
        );
      } catch (error) {
        Logger.error('Failed to create MediaSFU widget: $error');
        widget.onError?.call('MediaSFU widget creation failed: $error');
        return const SizedBox(
          width: 0,
          height: 0,
          child: SizedBox.shrink(),
        );
      }
    }

    return const SizedBox(
      width: 0,
      height: 0,
      child: SizedBox.shrink(),
    );
  }

  @override
  void dispose() {
    Logger.debug('MediaSFUHandler dispose() called');
    // Note: MediaSFU SDK doesn't provide explicit cleanup methods,
    // but the mounted check will prevent callbacks after disposal
    super.dispose();
  }
}
