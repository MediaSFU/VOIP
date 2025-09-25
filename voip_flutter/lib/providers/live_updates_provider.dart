// Live Updates Provider - Flutter equivalent of LiveUpdatesContext
import 'package:flutter/foundation.dart';
import 'dart:async';
import '../types/call_types.dart';
import '../types/config_types.dart';
import '../services/call_service.dart';
import '../utils/logger.dart';
import 'call_manager_provider.dart';

class LiveUpdatesProvider extends ChangeNotifier {
  final CallService _callService = CallService();
  CallManagerProvider? _callManagerProvider;

  Timer? _updateTimer;
  bool _isEnabled = true;
  int _intervalSeconds = 6; // Default 6 seconds
  bool _isUpdating = false;
  String? _error;
  DateTime? _lastUpdate;

  List<Call> _liveCalls = [];
  CallStats? _liveStats;

  // Inject CallManagerProvider for history management
  void setCallManagerProvider(CallManagerProvider provider) {
    _callManagerProvider = provider;
  }

  // Getters
  bool get isEnabled => _isEnabled;
  int get intervalSeconds => _intervalSeconds;
  bool get isUpdating => _isUpdating;
  String? get error => _error;
  DateTime? get lastUpdate => _lastUpdate;
  List<Call> get liveCalls => _liveCalls;
  CallStats? get liveStats => _liveStats;

  // Computed getters
  bool get isRunning => _updateTimer?.isActive == true;
  Duration get interval => Duration(seconds: _intervalSeconds);
  String get statusText {
    if (!_isEnabled) return 'Disabled';
    if (_isUpdating) return 'Updating...';
    if (_error != null) return 'Error';
    if (_lastUpdate != null) {
      final ago = DateTime.now().difference(_lastUpdate!);
      if (ago.inMinutes > 0) {
        return 'Updated ${ago.inMinutes}m ago';
      } else {
        return 'Updated ${ago.inSeconds}s ago';
      }
    }
    return 'Ready';
  }

  /// Initialize live updates with configuration
  void initialize(RealtimeConfig config) {
    _isEnabled = config.enabled;
    _intervalSeconds =
        (config.interval / 1000).round(); // Convert from milliseconds

    if (_isEnabled) {
      start();
    }
  }

  /// Start live updates
  void start() {
    if (_updateTimer?.isActive == true) {
      stop();
    }

    _isEnabled = true;
    _clearError();

    // Perform initial update
    _performUpdate();

    // Schedule recurring updates
    _updateTimer = Timer.periodic(interval, (timer) {
      if (_isEnabled) {
        _performUpdate();
      }
    });

    notifyListeners();
  }

  /// Stop live updates
  void stop() {
    _updateTimer?.cancel();
    _updateTimer = null;
    _isEnabled = false;
    _isUpdating = false;

    notifyListeners();
  }

  /// Pause live updates temporarily
  void pause() {
    _updateTimer?.cancel();
    _updateTimer = null;
    _isUpdating = false;

    notifyListeners();
  }

  /// Resume live updates
  void resume() {
    if (_isEnabled && (_updateTimer?.isActive != true)) {
      start();
    }
  }

  /// Update interval
  void setInterval(int seconds) {
    if (seconds < 1 || seconds > 60) {
      _setError('Interval must be between 1 and 60 seconds');
      return;
    }

    _intervalSeconds = seconds;

    // Restart timer with new interval if running
    if (isRunning) {
      stop();
      start();
    }

    notifyListeners();
  }

  /// Enable/disable live updates
  void setEnabled(bool enabled) {
    _isEnabled = enabled;

    if (enabled) {
      start();
    } else {
      stop();
    }
  }

  /// Force a manual update
  Future<void> forceUpdate() async {
    await _performUpdate();
  }

  /// Filter out dummy/pending calls - only keep valid production calls for history
  List<Call> _filterValidProductionCalls(List<Call> calls) {
    return calls.where((call) {
      // Valid production calls have sipCallId starting with 'prod'
      // Filter out dummy/pending calls with 'local_xxx' sipCallIds
      final sipCallId = call.sipCallId.trim();
      final isValidProdCall =
          sipCallId.isNotEmpty && sipCallId.startsWith('prod');

      if (!isValidProdCall && sipCallId.isNotEmpty) {
        Logger.debug(
            'LiveUpdates: Filtering out non-production call: ${call.sipCallId} (${call.status})');
      }

      return isValidProdCall;
    }).toList();
  }

  /// Perform the actual update
  Future<void> _performUpdate() async {
    if (_isUpdating) return; // Prevent concurrent updates

    try {
      _isUpdating = true;
      _clearError();

      bool hasDataChanged = false;

      // Fetch latest calls
      final callsResponse = await _callService.getAllCalls();
      if (callsResponse.success && callsResponse.data != null) {
        final newCalls = callsResponse.data!;

        // Add only valid production calls to history (filter out 'local_xxx' dummy calls)
        if (_callManagerProvider != null && newCalls.isNotEmpty) {
          final validCalls = _filterValidProductionCalls(newCalls);
          if (validCalls.isNotEmpty) {
            await _callManagerProvider!.addCallsToHistory(validCalls);
            Logger.debug(
                'LiveUpdates: Added ${validCalls.length} valid production calls to history');
          }
        }

        if (_liveCalls.length != newCalls.length ||
            !_areCallListsEqual(_liveCalls, newCalls)) {
          _liveCalls = newCalls;
          hasDataChanged = true;
        }
      }

      // Fetch latest stats
      final statsResponse = await _callService.getCallStats();
      if (statsResponse.success && statsResponse.data != null) {
        final newStats = statsResponse.data!;
        if (!_areStatsEqual(_liveStats, newStats)) {
          _liveStats = newStats;
          hasDataChanged = true;
        }
      }

      _lastUpdate = DateTime.now();

      // Only notify listeners if data actually changed
      if (hasDataChanged) {
        notifyListeners();
      }
    } catch (e) {
      _setError('Update failed: $e');
      notifyListeners(); // Only notify on error
    } finally {
      _isUpdating = false;
    }
  }

  /// Get active calls from live data
  List<Call> getActiveCalls() {
    return _liveCalls
        .where((call) =>
            call.status == CallStatus.active ||
            call.status == CallStatus.ringing ||
            call.status == CallStatus.connecting)
        .toList();
  }

  /// Get incoming calls from live data
  List<Call> getIncomingCalls() {
    return _liveCalls
        .where((call) =>
            call.direction == CallDirection.incoming &&
            (call.status == CallStatus.ringing ||
                call.status == CallStatus.connecting))
        .toList();
  }

  /// Get outgoing calls from live data
  List<Call> getOutgoingCalls() {
    return _liveCalls
        .where((call) =>
            call.direction == CallDirection.outgoing &&
            (call.status == CallStatus.active ||
                call.status == CallStatus.connecting))
        .toList();
  }

  /// Check if there are any new calls since last check
  bool hasNewCalls(List<Call> previousCalls) {
    if (previousCalls.isEmpty && _liveCalls.isNotEmpty) {
      return true;
    }

    // Check for new call IDs
    final previousIds = previousCalls.map((call) => call.id).toSet();
    final currentIds = _liveCalls.map((call) => call.id).toSet();

    return currentIds.difference(previousIds).isNotEmpty;
  }

  /// Check if there are any status changes since last check
  bool hasStatusChanges(List<Call> previousCalls) {
    if (previousCalls.length != _liveCalls.length) {
      return true;
    }

    final previousMap = {for (var call in previousCalls) call.id: call.status};
    final currentMap = {for (var call in _liveCalls) call.id: call.status};

    for (var id in currentMap.keys) {
      if (previousMap[id] != currentMap[id]) {
        return true;
      }
    }

    return false;
  }

  /// Get calls that have changed status
  List<Call> getChangedCalls(List<Call> previousCalls) {
    final previousMap = {for (var call in previousCalls) call.id: call};
    final changedCalls = <Call>[];

    for (var currentCall in _liveCalls) {
      final previousCall = previousMap[currentCall.id];
      if (previousCall == null || previousCall.status != currentCall.status) {
        changedCalls.add(currentCall);
      }
    }

    return changedCalls;
  }

  /// Get time until next update
  Duration getTimeUntilNextUpdate() {
    if (!isRunning || _lastUpdate == null) {
      return Duration.zero;
    }

    final elapsed = DateTime.now().difference(_lastUpdate!);
    final remaining = interval - elapsed;

    return remaining.isNegative ? Duration.zero : remaining;
  }

  /// Update configuration
  void updateConfig(RealtimeConfig config) {
    final wasEnabled = _isEnabled;

    _isEnabled = config.enabled;
    _intervalSeconds = (config.interval / 1000).round();

    if (_isEnabled && !wasEnabled) {
      start();
    } else if (!_isEnabled && wasEnabled) {
      stop();
    } else if (_isEnabled && isRunning) {
      // Restart with new interval
      stop();
      start();
    }
  }

  /// Compare two call lists for equality
  bool _areCallListsEqual(List<Call> list1, List<Call> list2) {
    if (list1.length != list2.length) return false;

    // Sort both lists by sipCallId for comparison
    final sorted1 = List<Call>.from(list1)
      ..sort((a, b) => a.sipCallId.compareTo(b.sipCallId));
    final sorted2 = List<Call>.from(list2)
      ..sort((a, b) => a.sipCallId.compareTo(b.sipCallId));

    for (int i = 0; i < sorted1.length; i++) {
      final call1 = sorted1[i];
      final call2 = sorted2[i];

      if (call1.sipCallId != call2.sipCallId ||
          call1.status != call2.status ||
          call1.direction != call2.direction ||
          call1.durationSeconds != call2.durationSeconds) {
        return false;
      }
    }

    return true;
  }

  /// Compare two call stats for equality
  bool _areStatsEqual(CallStats? stats1, CallStats? stats2) {
    if (stats1 == null && stats2 == null) return true;
    if (stats1 == null || stats2 == null) return false;

    return stats1.totalCalls == stats2.totalCalls &&
        stats1.activeCalls == stats2.activeCalls &&
        stats1.incomingCalls == stats2.incomingCalls &&
        stats1.outgoingCalls == stats2.outgoingCalls &&
        stats1.todaysCalls == stats2.todaysCalls;
  }

  /// Set error message
  void _setError(String message) {
    _error = message;
    notifyListeners();
  }

  /// Clear error message
  void _clearError() {
    _error = null;
  }

  @override
  void dispose() {
    stop();
    super.dispose();
  }
}
