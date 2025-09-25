// MediaSFU service - Dart equivalent of TypeScript mediaSFUService.ts
import '../types/call_types.dart';

class MediaSFUService {
  /// Create MediaSFU room options for outbound calls
  Map<String, dynamic> createRoomOptions({
    required String roomName,
    required String userName,
    required String apiKey,
    required String apiUserName,
    int duration = 300, // Default 5 minutes
    int capacity = 2, // Default 2 participants
    String eventType = 'chat',
  }) {
    return {
      'roomName': roomName,
      'userName': userName,
      'apiKey': apiKey,
      'apiUserName': apiUserName,
      'duration': duration,
      'capacity': capacity,
      'eventType': eventType,
      'action': 'create',
    };
  }

  /// Create MediaSFU join options for existing rooms
  Map<String, dynamic> createJoinOptions({
    required String roomId,
    required String userName,
    required String apiKey,
    required String apiUserName,
    String eventType = 'chat',
    bool useLocalUIMode = false,
  }) {
    return {
      'roomId': roomId,
      'userName': userName,
      'apiKey': apiKey,
      'apiUserName': apiUserName,
      'eventType': eventType,
      'action': 'join',
      'useLocalUIMode': useLocalUIMode,
    };
  }

  /// Generate room name for outbound calls
  String generateRoomName(String phoneNumber) {
    final timestamp = DateTime.now().millisecondsSinceEpoch;
    final cleanNumber = phoneNumber.replaceAll(RegExp(r'[^\d]'), '');
    return 'call_${cleanNumber}_$timestamp';
  }

  /// Extract participant name for room display
  String getParticipantName(String phoneNumber, {String? displayName}) {
    if (displayName != null && displayName.isNotEmpty) {
      return displayName;
    }

    // Format phone number for display
    final cleanNumber = phoneNumber.replaceAll(RegExp(r'[^\d]'), '');
    if (cleanNumber.length == 11 && cleanNumber.startsWith('1')) {
      // US number format: +1 (XXX) XXX-XXXX
      final areaCode = cleanNumber.substring(1, 4);
      final prefix = cleanNumber.substring(4, 7);
      final suffix = cleanNumber.substring(7);
      return '+1 ($areaCode) $prefix-$suffix';
    } else if (cleanNumber.length == 10) {
      // US number without country code: (XXX) XXX-XXXX
      final areaCode = cleanNumber.substring(0, 3);
      final prefix = cleanNumber.substring(3, 6);
      final suffix = cleanNumber.substring(6);
      return '($areaCode) $prefix-$suffix';
    }

    // Default formatting for other numbers
    return phoneNumber;
  }

  /// Validate MediaSFU credentials
  bool validateCredentials(String apiUserName, String apiKey) {
    // API Username: alphanumeric, at least 6 characters
    if (apiUserName.length < 6 ||
        !RegExp(r'^[a-zA-Z0-9]+$').hasMatch(apiUserName)) {
      return false;
    }

    // API Key: exactly 64 hexadecimal characters
    if (apiKey.length != 64 || !RegExp(r'^[a-fA-F0-9]{64}$').hasMatch(apiKey)) {
      return false;
    }

    return true;
  }

  /// Create MediaSFU room for call
  MediaSFURoom createMediaSFURoom({
    required String roomId,
    required String userName,
    required String apiKey,
    required String apiUserName,
    MediaSFUEventType eventType = MediaSFUEventType.chat,
  }) {
    return MediaSFURoom(
      roomId: roomId,
      eventType: eventType,
      userName: userName,
      apiKey: apiKey,
      apiUserName: apiUserName,
    );
  }

  /// Create join options for MediaSFU
  MediaSFUJoinOptions createMediaSFUJoinOptions({
    required String roomId,
    required String userName,
    required String apiKey,
    required String apiUserName,
    String eventType = 'chat',
    bool useLocalUIMode = false,
  }) {
    return MediaSFUJoinOptions(
      roomId: roomId,
      eventType: eventType,
      userName: userName,
      apiKey: apiKey,
      apiUserName: apiUserName,
      useLocalUIMode: useLocalUIMode,
    );
  }

  /// Get MediaSFU dashboard URL for configuration
  String getMediaSFUDashboardUrl() {
    return 'https://mediasfu.com/dashboard';
  }

  /// Get MediaSFU documentation URL
  String getMediaSFUDocsUrl() {
    return 'https://mediasfu.com/telephony';
  }

  /// Get MediaSFU signup URL
  String getMediaSFUSignupUrl() {
    return 'https://mediasfu.com/signup';
  }

  /// Parse room ID from MediaSFU response
  String? parseRoomId(Map<String, dynamic>? mediasfuResponse) {
    if (mediasfuResponse == null) return null;

    // Try various possible response structures
    if (mediasfuResponse['roomId'] != null) {
      return mediasfuResponse['roomId'] as String;
    }

    if (mediasfuResponse['data'] != null) {
      final data = mediasfuResponse['data'] as Map<String, dynamic>;
      if (data['roomId'] != null) {
        return data['roomId'] as String;
      }
    }

    if (mediasfuResponse['room'] != null) {
      final room = mediasfuResponse['room'] as Map<String, dynamic>;
      if (room['id'] != null) {
        return room['id'] as String;
      }
    }

    return null;
  }

  /// Create source parameters for MediaSFU SDK
  Map<String, dynamic> createSourceParameters({
    required String apiUserName,
    required String apiKey,
    String? roomName,
    String? meetingID,
    String userName = 'user',
    String eventType = 'chat',
    bool audioOnly = true,
    bool videoEnabled = false,
    bool screenshareEnabled = false,
    bool chatEnabled = true,
  }) {
    final parameters = <String, dynamic>{
      'apiUserName': apiUserName,
      'apiKey': apiKey,
      'userName': userName,
      'eventType': eventType,
      'audioOnly': audioOnly,
      'videoEnabled': videoEnabled,
      'screenshareEnabled': screenshareEnabled,
      'chatEnabled': chatEnabled,
    };

    if (roomName != null) {
      parameters['roomName'] = roomName;
    }

    if (meetingID != null) {
      parameters['meetingID'] = meetingID;
    }

    return parameters;
  }

  /// Update source parameters with new values
  Map<String, dynamic> updateSourceParameters(
    Map<String, dynamic> currentParameters,
    Map<String, dynamic> updates,
  ) {
    final updated = Map<String, dynamic>.from(currentParameters);
    updated.addAll(updates);
    return updated;
  }

  /// Create active call info with MediaSFU room
  ActiveCallInfo createActiveCallInfo(Call call, {MediaSFURoom? mediasfuRoom}) {
    return ActiveCallInfo(
      call: call,
      mediasfuRoom: mediasfuRoom,
    );
  }

  /// Extract event type from string
  MediaSFUEventType parseEventType(String? eventType) {
    switch (eventType?.toLowerCase()) {
      case 'broadcast':
        return MediaSFUEventType.broadcast;
      case 'webinar':
        return MediaSFUEventType.webinar;
      case 'conference':
        return MediaSFUEventType.conference;
      case 'chat':
      default:
        return MediaSFUEventType.chat;
    }
  }

  /// Generate meeting display name
  String generateMeetingDisplayName(String phoneNumber, {String? callerName}) {
    if (callerName != null && callerName.isNotEmpty) {
      return '$callerName ($phoneNumber)';
    }

    return getParticipantName(phoneNumber);
  }

  /// Check if MediaSFU room is active
  bool isRoomActive(Map<String, dynamic>? sourceParameters) {
    if (sourceParameters == null || sourceParameters.isEmpty) {
      return false;
    }

    // Check for required MediaSFU parameters
    return sourceParameters['apiUserName'] != null &&
        sourceParameters['apiKey'] != null &&
        (sourceParameters['roomName'] != null ||
            sourceParameters['meetingID'] != null);
  }

  /// Create default audio-only room configuration
  Map<String, dynamic> createAudioOnlyRoomConfig() {
    return {
      'audioOnly': true,
      'videoEnabled': false,
      'screenshareEnabled': false,
      'chatEnabled': true,
      'participantVideo': false,
      'hostVideo': false,
      'recordingEnabled': false,
      'eventType': 'chat',
    };
  }
}
