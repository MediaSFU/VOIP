import 'package:flutter/foundation.dart';

class NotificationState {
  final bool isOpen;
  final String title;
  final String message;
  final String type; // 'success', 'error', 'warning', 'info'

  NotificationState({
    required this.isOpen,
    required this.title,
    required this.message,
    required this.type,
  });

  NotificationState copyWith({
    bool? isOpen,
    String? title,
    String? message,
    String? type,
  }) {
    return NotificationState(
      isOpen: isOpen ?? this.isOpen,
      title: title ?? this.title,
      message: message ?? this.message,
      type: type ?? this.type,
    );
  }
}

class ConfirmationState {
  final bool isOpen;
  final VoidCallback? onConfirm;
  final VoidCallback? onCancel;

  ConfirmationState({
    required this.isOpen,
    required this.onConfirm,
    required this.onCancel,
  });

  ConfirmationState copyWith({
    bool? isOpen,
    VoidCallback? onConfirm,
    VoidCallback? onCancel,
  }) {
    return ConfirmationState(
      isOpen: isOpen ?? this.isOpen,
      onConfirm: onConfirm ?? this.onConfirm,
      onCancel: onCancel ?? this.onCancel,
    );
  }
}

class NavigationConfirmationState {
  final bool isOpen;
  final VoidCallback? onConfirm;
  final VoidCallback? onCancel;
  final String message;

  NavigationConfirmationState({
    required this.isOpen,
    required this.onConfirm,
    required this.onCancel,
    required this.message,
  });

  NavigationConfirmationState copyWith({
    bool? isOpen,
    VoidCallback? onConfirm,
    VoidCallback? onCancel,
    String? message,
  }) {
    return NavigationConfirmationState(
      isOpen: isOpen ?? this.isOpen,
      onConfirm: onConfirm ?? this.onConfirm,
      onCancel: onCancel ?? this.onCancel,
      message: message ?? this.message,
    );
  }
}

class OutgoingCallRoom {
  final String roomName;
  final String requestedRoomName;
  final String displayName;
  final DateTime createdAt;
  final bool isActive;
  final bool hasActiveSipCall;
  final bool isMediaSFUConnected;
  final String? sipCallId;
  final Map<String, dynamic>? callData;

  OutgoingCallRoom({
    required this.roomName,
    required this.requestedRoomName,
    required this.displayName,
    required this.createdAt,
    required this.isActive,
    required this.hasActiveSipCall,
    required this.isMediaSFUConnected,
    this.sipCallId,
    this.callData,
  });

  OutgoingCallRoom copyWith({
    String? roomName,
    String? requestedRoomName,
    String? displayName,
    DateTime? createdAt,
    bool? isActive,
    bool? hasActiveSipCall,
    bool? isMediaSFUConnected,
    String? sipCallId,
    Map<String, dynamic>? callData,
  }) {
    return OutgoingCallRoom(
      roomName: roomName ?? this.roomName,
      requestedRoomName: requestedRoomName ?? this.requestedRoomName,
      displayName: displayName ?? this.displayName,
      createdAt: createdAt ?? this.createdAt,
      isActive: isActive ?? this.isActive,
      hasActiveSipCall: hasActiveSipCall ?? this.hasActiveSipCall,
      isMediaSFUConnected: isMediaSFUConnected ?? this.isMediaSFUConnected,
      sipCallId: sipCallId ?? this.sipCallId,
      callData: callData ?? this.callData,
    );
  }
}
