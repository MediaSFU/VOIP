// Call Manager Provider - Flutter equivalent of CallManagerContext
import 'package:flutter/foundation.dart';
import 'dart:async';
import '../utils/logger.dart';
import '../types/call_types.dart';
import '../services/call_service.dart';

class CallManagerProvider extends ChangeNotifier {
  final CallService _callService = CallService();

  final List<Call> _calls = [];
  List<Call> _callHistory = [];
  Call? _activeCall;
  bool _isLoading = false;
  String? _error;
  CallStats? _callStats;
  bool _isInitialized = false; // Add initialization flag

  // Getters
  List<Call> get calls => _calls;
  List<Call> get callHistory => _callHistory;
  Call? get activeCall => _activeCall;
  bool get isLoading => _isLoading;
  String? get error => _error;
  CallStats? get callStats => _callStats;

  // Computed getters
  bool get hasActiveCall => _activeCall != null;
  bool get isInCall => _activeCall?.status == CallStatus.active;
  List<Call> get activeCalls => _calls
      .where((call) =>
          call.status == CallStatus.active ||
          call.status == CallStatus.ringing ||
          call.status == CallStatus.connecting)
      .toList();

  int get totalCalls => _callHistory.length;
  int get totalCallDuration => _callHistory
      .where((call) => call.duration != null)
      .fold(0, (sum, call) => sum + (call.duration ?? 0));

  /// Initialize call manager
  Future<void> initialize() async {
    // Prevent multiple initializations
    if (_isInitialized) return;

    try {
      _isLoading = true;
      _error = null;

      await loadCallHistory();
      await refreshCallStats();

      _isInitialized = true;
      notifyListeners();
    } catch (e) {
      _error = 'Failed to initialize call manager: $e';
      notifyListeners();
    } finally {
      _isLoading = false;
    }
  }

  /// Load call history from storage
  Future<void> loadCallHistory() async {
    try {
      final response = await _callService.getCallHistory();
      if (response.success && response.data != null) {
        _callHistory = response.data!;
      } else {
        _callHistory = [];
      }
      notifyListeners();
    } catch (e) {
      _setError('Failed to load call history: $e');
    }
  }

  /// Add all fetched calls to history (like React version)
  Future<void> addCallsToHistory(List<Call> calls) async {
    try {
      for (final call in calls) {
        final sipId = call.sipCallId.trim().toLowerCase();
        final id = (call.id ?? '').trim().toLowerCase();
        final isProd = (sipId.isNotEmpty && sipId.startsWith('prod')) ||
            (id.isNotEmpty && id.startsWith('prod'));
        if (!isProd) continue; // Skip local_ or any non-prod entries

        await _callService.addCallToHistory(call);
      }
      // Reload history to reflect changes
      await loadCallHistory();
    } catch (e) {
      Logger.error('Failed to add calls to history: $e');
    }
  }

  /// Refresh call statistics from local call history
  Future<void> refreshCallStats() async {
    try {
      // Primary: Use local call history stats
      var historyStats = await _callService.getCallHistoryStats();

      // Fallback: If history is empty/zeroed, augment with API-derived stats
      if (historyStats.total == 0 &&
          historyStats.todaysCalls == 0 &&
          historyStats.connectionRate == 0 &&
          historyStats.averageDuration == 0) {
        final apiStatsResp = await _callService.getCallStats();
        if (apiStatsResp.success && apiStatsResp.data != null) {
          _callStats = apiStatsResp.data!;
        } else {
          _callStats = historyStats; // keep history stats if API fails
        }
      } else {
        _callStats = historyStats;
      }
      notifyListeners();
    } catch (e) {
      _setError('Failed to refresh call stats: $e');
    }
  }

  /// Make a new outbound call
  Future<bool> makeCall({
    required String phoneNumber,
    String? displayName,
    Map<String, String>? mediasfuOptions,
  }) async {
    try {
      _setLoading(true);
      _clearError();

      // Use the actual makeCall API with just the phone number
      final response = await _callService.makeCall(
        phoneNumber: phoneNumber,
        calleeDisplayName: displayName,
      );

      if (response.success) {
        // The service creates a local call entry, so refresh the call history
        await loadCallHistory();

        // Set the most recent call as active if it matches our phone number
        if (_callHistory.isNotEmpty) {
          final recentCall = _callHistory.first;
          if (recentCall.phoneNumber == phoneNumber) {
            _activeCall = recentCall;
          }
        }

        notifyListeners();
        return true;
      } else {
        _setError(response.error ?? 'Failed to make call');
        return false;
      }
    } catch (e) {
      _setError('Failed to make call: $e');
      return false;
    } finally {
      _setLoading(false);
    }
  }

  /// Hang up a call
  Future<bool> hangupCall(String callId) async {
    try {
      _setLoading(true);
      _clearError();

      final response = await _callService.hangupCall(callId);

      if (response.success) {
        // Clear active call if this was it
        if (_activeCall?.id == callId) {
          _activeCall = null;
        }

        // Refresh call data
        await loadCallHistory();

        notifyListeners();
        return true;
      } else {
        _setError(response.error ?? 'Failed to hang up call');
        return false;
      }
    } catch (e) {
      _setError('Failed to hang up call: $e');
      return false;
    } finally {
      _setLoading(false);
    }
  }

  /// Put a call on hold
  Future<bool> holdCall(String callId) async {
    try {
      _setLoading(true);
      _clearError();

      final response =
          await _callService.holdCall(callId, 'Call placed on hold', true);

      if (response.success) {
        // Refresh call data
        await loadCallHistory();

        // Update active call if this is it
        if (_activeCall?.id == callId && _callHistory.isNotEmpty) {
          final updatedCall = _callHistory.firstWhere(
            (call) => call.id == callId,
            orElse: () => _activeCall!,
          );
          _activeCall = updatedCall;
        }

        notifyListeners();
        return true;
      } else {
        _setError(response.error ?? 'Failed to hold call');
        return false;
      }
    } catch (e) {
      _setError('Failed to hold call: $e');
      return false;
    } finally {
      _setLoading(false);
    }
  }

  /// Resume a held call
  Future<bool> resumeCall(String callId) async {
    try {
      _setLoading(true);
      _clearError();

      final response = await _callService.unholdCall(callId);

      if (response.success) {
        // Refresh call data
        await loadCallHistory();

        // Update active call if this is it
        if (_activeCall?.id == callId && _callHistory.isNotEmpty) {
          final updatedCall = _callHistory.firstWhere(
            (call) => call.id == callId,
            orElse: () => _activeCall!,
          );
          _activeCall = updatedCall;
        }

        notifyListeners();
        return true;
      } else {
        _setError(response.error ?? 'Failed to resume call');
        return false;
      }
    } catch (e) {
      _setError('Failed to resume call: $e');
      return false;
    } finally {
      _setLoading(false);
    }
  }

  /// Transfer a call
  Future<bool> transferCall(String callId, String targetNumber) async {
    try {
      _setLoading(true);
      _clearError();

      final response = await _callService.transferCall(callId, targetNumber);

      if (response.success) {
        // Refresh call data
        await loadCallHistory();

        notifyListeners();
        return true;
      } else {
        _setError(response.error ?? 'Failed to transfer call');
        return false;
      }
    } catch (e) {
      _setError('Failed to transfer call: $e');
      return false;
    } finally {
      _setLoading(false);
    }
  }

  /// Get call by ID
  Call? getCallById(String callId) {
    try {
      return _calls.firstWhere((call) => call.id == callId);
    } catch (e) {
      try {
        return _callHistory.firstWhere((call) => call.id == callId);
      } catch (e2) {
        return null;
      }
    }
  }

  /// Clear call history
  Future<void> clearCallHistory() async {
    try {
      _setLoading(true);
      _clearError();

      await _callService.clearCallHistory();
      _callHistory.clear();

      notifyListeners();
    } catch (e) {
      _setError('Failed to clear call history: $e');
    } finally {
      _setLoading(false);
    }
  }

  /// Filter call history
  List<Call> filterCallHistory({
    CallDirection? direction,
    CallStatus? status,
    DateTime? fromDate,
    DateTime? toDate,
    String? searchQuery,
  }) {
    var filtered = _callHistory.toList();

    if (direction != null) {
      filtered = filtered.where((call) => call.direction == direction).toList();
    }

    if (status != null) {
      filtered = filtered.where((call) => call.status == status).toList();
    }

    if (fromDate != null) {
      filtered = filtered
          .where((call) => call.startTime?.isAfter(fromDate) ?? false)
          .toList();
    }

    if (toDate != null) {
      filtered = filtered
          .where((call) => call.startTime?.isBefore(toDate) ?? false)
          .toList();
    }

    if (searchQuery != null && searchQuery.isNotEmpty) {
      final query = searchQuery.toLowerCase();
      filtered = filtered
          .where((call) =>
              call.phoneNumber?.toLowerCase().contains(query) ??
              false ||
                  (call.callerName?.toLowerCase().contains(query) ?? false))
          .toList();
    }

    return filtered;
  }

  /// Set active call manually (for testing or external integrations)
  void setActiveCall(Call call) {
    _activeCall = call;
    notifyListeners();
  }

  /// Clear active call
  void clearActiveCall() {
    _activeCall = null;
    notifyListeners();
  }

  /// Add a call to active calls list
  void addCall(Call call) {
    _calls.add(call);
    if (_activeCall == null || call.status == CallStatus.active) {
      _activeCall = call;
    }
    notifyListeners();
  }

  /// Remove a call from both active calls and history
  void removeCall(String callId) {
    _calls.removeWhere((call) => call.id == callId || call.sipCallId == callId);
    _callHistory
        .removeWhere((call) => call.id == callId || call.sipCallId == callId);

    // Clear active call if this was it
    if (_activeCall?.id == callId || _activeCall?.sipCallId == callId) {
      _activeCall = null;
    }

    notifyListeners();
  }

  /// End/hangup a call by ID
  Future<bool> endCall(String callId) async {
    return await hangupCall(callId);
  }

  /// Clear all calls (active and history)
  void clearAllCalls() {
    _calls.clear();
    _callHistory.clear();
    _activeCall = null;
    notifyListeners();
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
