// Call related types - Dart equivalent of TypeScript call.types.ts

enum CallStatus {
  ringing,
  active,
  onHold,
  ended,
  failed,
  connecting,
  connected,
  completed,
  rejected,
  terminated,
  terminating
}

enum CallType { inbound, outbound }

enum CallDirection { incoming, outgoing, inbound, outbound }

class Call {
  // Core fields from actual API response
  final String sipCallId;
  final CallStatus status;
  final CallDirection direction;
  final String startTimeISO;
  final int durationSeconds;
  final String roomName;
  final String callerIdRaw;
  final String calledUri;
  final bool audioOnly;
  final String activeMediaSource;
  final String? humanParticipantName;
  final bool playingMusic;
  final bool playingPrompt;
  final String? currentPromptType;
  final bool pendingHumanIntervention;
  final String callbackState;
  final String? callbackPin;
  final String? activeSpeaker;
  final bool callEnded;
  final bool needsCallback;
  final bool callbackHonored;
  final String? calledBackRef;

  // Additional properties for React parity
  final Map<String, dynamic>?
      extras; // For additional metadata like isOutgoingRoomSetup
  final String? endTimeISO; // For precise timestamp handling

  // Computed/legacy fields for compatibility
  final String? id; // Will be mapped from sipCallId
  final CallType? type;
  final String? from; // Parsed from callerIdRaw
  final String? to; // Parsed from calledUri
  final String? phoneNumber; // For compatibility
  final String? callerName; // Parsed from callerIdRaw
  final String? displayName; // Parsed from callerIdRaw
  final DateTime? startTime; // Converted from startTimeISO
  final DateTime? endTime;
  final int? duration; // Mapped from durationSeconds
  final String? recordingUrl;
  final String? mediasfuRoomId;
  final String? mediasfuEventType;
  final bool? onHold; // Derived from status
  final String? participantName; // Mapped from humanParticipantName

  const Call({
    required this.sipCallId,
    required this.status,
    required this.direction,
    required this.startTimeISO,
    required this.durationSeconds,
    required this.roomName,
    required this.callerIdRaw,
    required this.calledUri,
    required this.audioOnly,
    required this.activeMediaSource,
    this.humanParticipantName,
    required this.playingMusic,
    required this.playingPrompt,
    this.currentPromptType,
    required this.pendingHumanIntervention,
    required this.callbackState,
    this.callbackPin,
    this.activeSpeaker,
    required this.callEnded,
    required this.needsCallback,
    required this.callbackHonored,
    this.calledBackRef,
    this.extras,
    this.endTimeISO,
    this.id,
    this.type,
    this.from,
    this.to,
    this.phoneNumber,
    this.callerName,
    this.displayName,
    this.startTime,
    this.endTime,
    this.duration,
    this.recordingUrl,
    this.mediasfuRoomId,
    this.mediasfuEventType,
    this.onHold,
    this.participantName,
  });

  factory Call.fromJson(Map<String, dynamic> json) {
    return Call(
      sipCallId: (json['sipCallId'] as String?) ?? '',
      status: _parseCallStatus(json['status'] as String?),
      direction: _parseCallDirection(json['direction'] as String?),
      startTimeISO: (json['startTimeISO'] as String?) ?? '',
      durationSeconds: (json['durationSeconds'] as int?) ?? 0,
      roomName: (json['roomName'] as String?) ?? '',
      callerIdRaw: (json['callerIdRaw'] as String?) ?? '',
      calledUri: (json['calledUri'] as String?) ?? '',
      audioOnly: (json['audioOnly'] as bool?) ?? true,
      activeMediaSource: (json['activeMediaSource'] as String?) ?? '',
      humanParticipantName: json['humanParticipantName'] as String?,
      playingMusic: (json['playingMusic'] as bool?) ?? false,
      playingPrompt: (json['playingPrompt'] as bool?) ?? false,
      currentPromptType: json['currentPromptType'] as String?,
      pendingHumanIntervention:
          (json['pendingHumanIntervention'] as bool?) ?? false,
      callbackState: (json['callbackState'] as String?) ?? '',
      callbackPin: json['callbackPin'] as String?,
      activeSpeaker: json['activeSpeaker'] as String?,
      callEnded: (json['callEnded'] as bool?) ?? false,
      needsCallback: (json['needsCallback'] as bool?) ?? false,
      callbackHonored: (json['callbackHonored'] as bool?) ?? false,
      calledBackRef: json['calledBackRef'] as String?,
      extras: json['extras'] as Map<String, dynamic>?,
      endTimeISO: json['endTimeISO'] as String?,
      id: (json['id'] as String?) ?? (json['sipCallId'] as String?),
      type:
          json['type'] != null ? _parseCallType(json['type'] as String?) : null,
      from: json['from'] as String?,
      to: json['to'] as String?,
      phoneNumber: json['phoneNumber'] as String?,
      callerName: json['callerName'] as String?,
      displayName: json['displayName'] as String?,
      startTime: json['startTime'] != null
          ? DateTime.tryParse(json['startTime'] as String)
          : DateTime.tryParse((json['startTimeISO'] as String?) ?? ''),
      endTime: json['endTime'] != null
          ? DateTime.tryParse(json['endTime'] as String)
          : null,
      duration: (json['duration'] as int?) ?? (json['durationSeconds'] as int?),
      recordingUrl: json['recordingUrl'] as String?,
      mediasfuRoomId: json['mediasfuRoomId'] as String?,
      mediasfuEventType: json['mediasfuEventType'] as String?,
      onHold: (json['onHold'] as bool?) ??
          ((json['status'] as String?) == 'on-hold'),
      participantName: (json['participantName'] as String?) ??
          (json['humanParticipantName'] as String?),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'sipCallId': sipCallId,
      'status': status.name,
      'direction': direction.name,
      'startTimeISO': startTimeISO,
      'durationSeconds': durationSeconds,
      'roomName': roomName,
      'callerIdRaw': callerIdRaw,
      'calledUri': calledUri,
      'audioOnly': audioOnly,
      'activeMediaSource': activeMediaSource,
      'humanParticipantName': humanParticipantName,
      'playingMusic': playingMusic,
      'playingPrompt': playingPrompt,
      'currentPromptType': currentPromptType,
      'pendingHumanIntervention': pendingHumanIntervention,
      'callbackState': callbackState,
      'callbackPin': callbackPin,
      'activeSpeaker': activeSpeaker,
      'callEnded': callEnded,
      'needsCallback': needsCallback,
      'callbackHonored': callbackHonored,
      'calledBackRef': calledBackRef,
      if (extras != null) 'extras': extras,
      if (endTimeISO != null) 'endTimeISO': endTimeISO,
      if (id != null) 'id': id,
      if (type != null) 'type': type?.name,
      if (from != null) 'from': from,
      if (to != null) 'to': to,
      if (phoneNumber != null) 'phoneNumber': phoneNumber,
      if (callerName != null) 'callerName': callerName,
      if (displayName != null) 'displayName': displayName,
      if (startTime != null) 'startTime': startTime?.toIso8601String(),
      if (endTime != null) 'endTime': endTime?.toIso8601String(),
      if (duration != null) 'duration': duration,
      if (recordingUrl != null) 'recordingUrl': recordingUrl,
      if (mediasfuRoomId != null) 'mediasfuRoomId': mediasfuRoomId,
      if (mediasfuEventType != null) 'mediasfuEventType': mediasfuEventType,
      if (onHold != null) 'onHold': onHold,
      if (participantName != null) 'participantName': participantName,
    };
  }

  static CallStatus _parseCallStatus(String? status) {
    switch (status?.toLowerCase()) {
      case 'ringing':
        return CallStatus.ringing;
      case 'active':
        return CallStatus.active;
      case 'on-hold':
      case 'onhold':
        return CallStatus.onHold;
      case 'ended':
        return CallStatus.ended;
      case 'failed':
        return CallStatus.failed;
      case 'connecting':
        return CallStatus.connecting;
      case 'connected':
        return CallStatus.connected;
      case 'completed':
        return CallStatus.completed;
      case 'rejected':
        return CallStatus.rejected;
      case 'terminated':
        return CallStatus.terminated;
      case 'terminating':
        return CallStatus.terminating;
      default:
        return CallStatus.ended;
    }
  }

  static CallDirection _parseCallDirection(String? direction) {
    switch (direction?.toLowerCase()) {
      case 'incoming':
        return CallDirection.incoming;
      case 'outgoing':
        return CallDirection.outgoing;
      case 'inbound':
        return CallDirection.inbound;
      case 'outbound':
        return CallDirection.outbound;
      default:
        return CallDirection.outgoing;
    }
  }

  static CallType _parseCallType(String? type) {
    switch (type?.toLowerCase()) {
      case 'inbound':
        return CallType.inbound;
      case 'outbound':
        return CallType.outbound;
      default:
        return CallType.outbound;
    }
  }

  Call copyWith({
    String? sipCallId,
    CallStatus? status,
    CallDirection? direction,
    String? startTimeISO,
    String? endTimeISO,
    int? durationSeconds,
    String? roomName,
    String? callerIdRaw,
    String? calledUri,
    bool? audioOnly,
    String? activeMediaSource,
    String? humanParticipantName,
    bool? playingMusic,
    bool? playingPrompt,
    String? currentPromptType,
    bool? pendingHumanIntervention,
    String? callbackState,
    String? callbackPin,
    String? activeSpeaker,
    bool? callEnded,
    bool? needsCallback,
    bool? callbackHonored,
    String? calledBackRef,
    String? id,
    CallType? type,
    String? from,
    String? to,
    String? phoneNumber,
    String? callerName,
    String? displayName,
    DateTime? startTime,
    DateTime? endTime,
    int? duration,
    String? recordingUrl,
    String? mediasfuRoomId,
    String? mediasfuEventType,
    bool? onHold,
    String? participantName,
  }) {
    return Call(
      sipCallId: sipCallId ?? this.sipCallId,
      status: status ?? this.status,
      direction: direction ?? this.direction,
      startTimeISO: startTimeISO ?? this.startTimeISO,
      endTimeISO: endTimeISO ?? this.endTimeISO,
      durationSeconds: durationSeconds ?? this.durationSeconds,
      roomName: roomName ?? this.roomName,
      callerIdRaw: callerIdRaw ?? this.callerIdRaw,
      calledUri: calledUri ?? this.calledUri,
      audioOnly: audioOnly ?? this.audioOnly,
      activeMediaSource: activeMediaSource ?? this.activeMediaSource,
      humanParticipantName: humanParticipantName ?? this.humanParticipantName,
      playingMusic: playingMusic ?? this.playingMusic,
      playingPrompt: playingPrompt ?? this.playingPrompt,
      currentPromptType: currentPromptType ?? this.currentPromptType,
      pendingHumanIntervention:
          pendingHumanIntervention ?? this.pendingHumanIntervention,
      callbackState: callbackState ?? this.callbackState,
      callbackPin: callbackPin ?? this.callbackPin,
      activeSpeaker: activeSpeaker ?? this.activeSpeaker,
      callEnded: callEnded ?? this.callEnded,
      needsCallback: needsCallback ?? this.needsCallback,
      callbackHonored: callbackHonored ?? this.callbackHonored,
      calledBackRef: calledBackRef ?? this.calledBackRef,
      id: id ?? this.id,
      type: type ?? this.type,
      from: from ?? this.from,
      to: to ?? this.to,
      phoneNumber: phoneNumber ?? this.phoneNumber,
      callerName: callerName ?? this.callerName,
      displayName: displayName ?? this.displayName,
      startTime: startTime ?? this.startTime,
      endTime: endTime ?? this.endTime,
      duration: duration ?? this.duration,
      recordingUrl: recordingUrl ?? this.recordingUrl,
      mediasfuRoomId: mediasfuRoomId ?? this.mediasfuRoomId,
      mediasfuEventType: mediasfuEventType ?? this.mediasfuEventType,
      onHold: onHold ?? this.onHold,
      participantName: participantName ?? this.participantName,
    );
  }
}

class CallStats {
  final int total;
  final Map<String, int> byStatus;
  final Map<String, int> byDirection;
  final int averageDuration;
  final int totalDuration;
  final int connectedCalls;
  final int connectionRate;
  final int todaysCalls;
  final int thisWeeksCalls;

  // Legacy fields for backward compatibility
  final int totalCalls;
  final int activeCalls;
  final int incomingCalls;
  final int outgoingCalls;
  final double avgDuration;
  final double successRate;

  CallStats({
    required this.total,
    required this.byStatus,
    required this.byDirection,
    required this.averageDuration,
    required this.totalDuration,
    required this.connectedCalls,
    required this.connectionRate,
    required this.todaysCalls,
    required this.thisWeeksCalls,
    // Legacy compatibility
    int? totalCalls,
    int? activeCalls,
    int? incomingCalls,
    int? outgoingCalls,
    double? avgDuration,
    double? successRate,
  })  : totalCalls = totalCalls ?? total,
        activeCalls = activeCalls ?? 0,
        incomingCalls = incomingCalls ??
            (byDirection['incoming'] ?? byDirection['inbound'] ?? 0),
        outgoingCalls = outgoingCalls ??
            (byDirection['outgoing'] ?? byDirection['outbound'] ?? 0),
        avgDuration = avgDuration ?? averageDuration.toDouble(),
        successRate = successRate ?? connectionRate.toDouble();

  factory CallStats.fromJson(Map<String, dynamic> json) {
    return CallStats(
      total: (json['total'] as int?) ?? (json['totalCalls'] as int?) ?? 0,
      byStatus: Map<String, int>.from(json['byStatus'] as Map? ?? {}),
      byDirection: Map<String, int>.from(json['byDirection'] as Map? ?? {}),
      averageDuration: (json['averageDuration'] as int?) ?? 0,
      totalDuration: (json['totalDuration'] as int?) ?? 0,
      connectedCalls: (json['connectedCalls'] as int?) ?? 0,
      connectionRate: (json['connectionRate'] as int?) ?? 0,
      todaysCalls: (json['todaysCalls'] as int?) ?? 0,
      thisWeeksCalls: (json['thisWeeksCalls'] as int?) ?? 0,
      // Legacy compatibility
      totalCalls: (json['totalCalls'] as int?) ?? (json['total'] as int?) ?? 0,
      activeCalls: (json['activeCalls'] as int?) ?? 0,
      incomingCalls: (json['incomingCalls'] as int?) ?? 0,
      outgoingCalls: (json['outgoingCalls'] as int?) ?? 0,
      avgDuration: ((json['avgDuration'] as num?) ??
              (json['averageDuration'] as num?) ??
              0)
          .toDouble(),
      successRate: ((json['successRate'] as num?) ??
              (json['connectionRate'] as num?) ??
              0)
          .toDouble(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'total': total,
      'byStatus': byStatus,
      'byDirection': byDirection,
      'averageDuration': averageDuration,
      'totalDuration': totalDuration,
      'connectedCalls': connectedCalls,
      'connectionRate': connectionRate,
      'todaysCalls': todaysCalls,
      'thisWeeksCalls': thisWeeksCalls,
      // Legacy compatibility
      'totalCalls': totalCalls,
      'activeCalls': activeCalls,
      'incomingCalls': incomingCalls,
      'outgoingCalls': outgoingCalls,
      'avgDuration': avgDuration,
      'successRate': successRate,
    };
  }
}

class CallRequest {
  final String to;
  final String? from;
  final String? displayName;
  final Map<String, dynamic>? customData;

  const CallRequest({
    required this.to,
    this.from,
    this.displayName,
    this.customData,
  });

  factory CallRequest.fromJson(Map<String, dynamic> json) {
    return CallRequest(
      to: (json['to'] as String?) ?? '',
      from: json['from'] as String?,
      displayName: json['displayName'] as String?,
      customData: json['customData'] as Map<String, dynamic>?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'to': to,
      if (from != null) 'from': from,
      if (displayName != null) 'displayName': displayName,
      if (customData != null) 'customData': customData,
    };
  }
}

class CallResponse {
  final bool success;
  final String? callId;
  final String? message;
  final String? error;

  const CallResponse({
    required this.success,
    this.callId,
    this.message,
    this.error,
  });

  factory CallResponse.fromJson(Map<String, dynamic> json) {
    return CallResponse(
      success: (json['success'] as bool?) ?? false,
      callId: json['callId'] as String?,
      message: json['message'] as String?,
      error: json['error'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'success': success,
      if (callId != null) 'callId': callId,
      if (message != null) 'message': message,
      if (error != null) 'error': error,
    };
  }
}

class ActiveCallInfo {
  final Call call;
  final MediaSFURoom? mediasfuRoom;

  const ActiveCallInfo({
    required this.call,
    this.mediasfuRoom,
  });

  factory ActiveCallInfo.fromJson(Map<String, dynamic> json) {
    return ActiveCallInfo(
      call: Call.fromJson(json['call'] as Map<String, dynamic>),
      mediasfuRoom: json['mediasfuRoom'] != null
          ? MediaSFURoom.fromJson(json['mediasfuRoom'] as Map<String, dynamic>)
          : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'call': call.toJson(),
      if (mediasfuRoom != null) 'mediasfuRoom': mediasfuRoom?.toJson(),
    };
  }
}

// MediaSFU integration types
enum MediaSFUEventType { chat, broadcast, webinar, conference }

class MediaSFURoom {
  final String roomId;
  final MediaSFUEventType eventType;
  final String userName;
  final String apiKey;
  final String apiUserName;
  final String? joinUrl;

  const MediaSFURoom({
    required this.roomId,
    required this.eventType,
    required this.userName,
    required this.apiKey,
    required this.apiUserName,
    this.joinUrl,
  });

  factory MediaSFURoom.fromJson(Map<String, dynamic> json) {
    return MediaSFURoom(
      roomId: (json['roomId'] as String?) ?? '',
      eventType: _parseEventType(json['eventType'] as String?),
      userName: (json['userName'] as String?) ?? '',
      apiKey: (json['apiKey'] as String?) ?? '',
      apiUserName: (json['apiUserName'] as String?) ?? '',
      joinUrl: json['joinUrl'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'roomId': roomId,
      'eventType': eventType.name,
      'userName': userName,
      'apiKey': apiKey,
      'apiUserName': apiUserName,
      if (joinUrl != null) 'joinUrl': joinUrl,
    };
  }

  static MediaSFUEventType _parseEventType(String? eventType) {
    switch (eventType?.toLowerCase()) {
      case 'chat':
        return MediaSFUEventType.chat;
      case 'broadcast':
        return MediaSFUEventType.broadcast;
      case 'webinar':
        return MediaSFUEventType.webinar;
      case 'conference':
        return MediaSFUEventType.conference;
      default:
        return MediaSFUEventType.chat;
    }
  }
}

class MediaSFUJoinOptions {
  final String roomId;
  final String eventType;
  final String userName;
  final String apiKey;
  final String apiUserName;
  final bool? useLocalUIMode;

  const MediaSFUJoinOptions({
    required this.roomId,
    required this.eventType,
    required this.userName,
    required this.apiKey,
    required this.apiUserName,
    this.useLocalUIMode,
  });

  factory MediaSFUJoinOptions.fromJson(Map<String, dynamic> json) {
    return MediaSFUJoinOptions(
      roomId: (json['roomId'] as String?) ?? '',
      eventType: (json['eventType'] as String?) ?? '',
      userName: (json['userName'] as String?) ?? '',
      apiKey: (json['apiKey'] as String?) ?? '',
      apiUserName: (json['apiUserName'] as String?) ?? '',
      useLocalUIMode: json['useLocalUIMode'] as bool?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'roomId': roomId,
      'eventType': eventType,
      'userName': userName,
      'apiKey': apiKey,
      'apiUserName': apiUserName,
      if (useLocalUIMode != null) 'useLocalUIMode': useLocalUIMode,
    };
  }
}

// Parameters for creating outbound calls with human/agent control
class CreateCallParams {
  final String phoneNumber; // E.164 format (e.g., "+15559876543")
  final String roomName; // MediaSFU room to connect call to
  final String? callerIdNumber; // E.164 caller ID
  final String? initiatorName; // Name of person making the call
  final String? calleeDisplayName; // Display name for the callee
  final bool?
      startWithInitiatorAudio; // true = start with human audio, false = start with agent/bot
  final bool? audioOnly; // Audio-only call (no video)
  final bool? useBackupPeer; // Use backup SIP peer
  final String? sipConfigId; // SIP configuration ID (for SDK calls)

  const CreateCallParams({
    required this.phoneNumber,
    required this.roomName,
    this.callerIdNumber,
    this.initiatorName,
    this.calleeDisplayName,
    this.startWithInitiatorAudio,
    this.audioOnly,
    this.useBackupPeer,
    this.sipConfigId,
  });

  factory CreateCallParams.fromJson(Map<String, dynamic> json) {
    return CreateCallParams(
      phoneNumber: (json['phoneNumber'] as String?) ?? '',
      roomName: (json['roomName'] as String?) ?? '',
      callerIdNumber: json['callerIdNumber'] as String?,
      initiatorName: json['initiatorName'] as String?,
      calleeDisplayName: json['calleeDisplayName'] as String?,
      startWithInitiatorAudio: json['startWithInitiatorAudio'] as bool?,
      audioOnly: json['audioOnly'] as bool?,
      useBackupPeer: json['useBackupPeer'] as bool?,
      sipConfigId: json['sipConfigId'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'phoneNumber': phoneNumber,
      'roomName': roomName,
      if (callerIdNumber != null) 'callerIdNumber': callerIdNumber,
      if (initiatorName != null) 'initiatorName': initiatorName,
      if (calleeDisplayName != null) 'calleeDisplayName': calleeDisplayName,
      if (startWithInitiatorAudio != null)
        'startWithInitiatorAudio': startWithInitiatorAudio,
      if (audioOnly != null) 'audioOnly': audioOnly,
      if (useBackupPeer != null) 'useBackupPeer': useBackupPeer,
      if (sipConfigId != null) 'sipConfigId': sipConfigId,
    };
  }
}
