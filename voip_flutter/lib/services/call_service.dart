// Call service - Dart equivalent of TypeScript callService.ts
import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:http/http.dart' as http;
import 'http_client.dart';
import '../utils/logger.dart';
import '../types/call_types.dart';

class CallService {
  final HttpClient _httpClient;
  static const String _localStorageKey = 'voip_call_history';

  CallService() : _httpClient = HttpClient();

  /// Helper function to create a Call object with all required fields
  Call _createLocalCallEntry(
    String phoneNumber, {
    CallDirection direction = CallDirection.outgoing,
    CallStatus status = CallStatus.connecting,
  }) {
    final now = DateTime.now();
    return Call(
      // Core API fields
      sipCallId: 'local_${now.millisecondsSinceEpoch}',
      status: status,
      direction: direction,
      startTimeISO: now.toIso8601String(),
      durationSeconds: 0,
      roomName: 'room_${now.millisecondsSinceEpoch}',
      callerIdRaw:
          direction == CallDirection.outgoing ? 'voipuser' : phoneNumber,
      calledUri: direction == CallDirection.outgoing ? phoneNumber : 'voipuser',
      audioOnly: false,
      activeMediaSource: 'none',
      humanParticipantName: 'voipuser',
      playingMusic: false,
      playingPrompt: false,
      currentPromptType: null,
      pendingHumanIntervention: false,
      callbackState: 'none',
      callbackPin: null,
      activeSpeaker: null,
      callEnded: false,
      needsCallback: false,
      callbackHonored: false,
      calledBackRef: null,

      // Legacy compatibility fields
      id: 'call_${now.millisecondsSinceEpoch}',
      phoneNumber: phoneNumber,
      callerName: 'Call to $phoneNumber',
      startTime: now,
      duration: 0,
    );
  }

  /// Get all calls without filtering (recommended for polling)
  Future<ApiResponse<List<Call>>> getAllCalls() async {
    try {
      // GET /v1/sipcall/list - get all calls without filtering
      final response = await _httpClient.get<Map<String, dynamic>>('/list');

      if (response.success && response.data != null) {
        final data = response.data!;

        // Handle nested data structure - look in response.data.data for the calls array
        if (data['data'] != null) {
          final callsData = data['data'] as List<dynamic>;
          final calls = callsData
              .map((call) => Call.fromJson(call as Map<String, dynamic>))
              .toList();

          return ApiResponse.success(calls);
        }
      }

      return ApiResponse.error(response.error ?? 'Failed to fetch all calls');
    } catch (error) {
      Logger.error('Error fetching all calls: $error');
      return ApiResponse.error('Failed to fetch all calls: $error');
    }
  }

  /// Get calls by direction (incoming/outgoing)
  Future<ApiResponse<List<Call>>> getCallsByDirection(String direction) async {
    try {
      Logger.debug('Fetching $direction calls from /list?direction=$direction');
      // GET /v1/sipcall/list?direction=incoming or outgoing
      final response = await _httpClient
          .get<Map<String, dynamic>>('/list?direction=$direction');
      Logger.debug('$direction calls API response: ${response.success}');

      if (response.success && response.data != null) {
        final data = response.data!;

        // Handle nested data structure - look in response.data.data for the calls array
        if (data['data'] != null) {
          final callsData = data['data'] as List<dynamic>;
          final calls = callsData
              .map((call) => Call.fromJson(call as Map<String, dynamic>))
              .toList();

          return ApiResponse.success(calls);
        }
      }

      return ApiResponse.error(
          response.error ?? 'Failed to fetch $direction calls');
    } catch (error) {
      Logger.error('Error fetching $direction calls: $error');
      return ApiResponse.error('Failed to fetch $direction calls: $error');
    }
  }

  /// Get active calls using HTTP REST API
  Future<ApiResponse<List<Call>>> getActiveCalls() async {
    try {
      // GET /v1/sipcall/list - get all calls and filter active ones
      final response = await _httpClient.get<Map<String, dynamic>>('/list');
      Logger.debug('Active calls API response: ${response.success}');

      if (response.success && response.data != null) {
        final data = response.data!;

        // Handle nested data structure - look in response.data.data for the calls array
        if (data['data'] != null) {
          final callsData = data['data'] as List<dynamic>;
          final calls = callsData
              .map((call) => Call.fromJson(call as Map<String, dynamic>))
              .where((call) =>
                  call.status == CallStatus.active ||
                  call.status == CallStatus.connected)
              .toList();

          return ApiResponse.success(calls);
        }
      }

      return ApiResponse.error(
          response.error ?? 'Failed to fetch active calls');
    } catch (error) {
      Logger.error('Error fetching active calls: $error');
      return ApiResponse.error('Failed to fetch active calls: $error');
    }
  }

  /// Get call history from SharedPreferences (no HTTP endpoint available)
  Future<ApiResponse<List<Call>>> getCallHistory({int limit = 50}) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final stored = prefs.getString(_localStorageKey);
      List<Call> callHistory = [];

      if (stored != null) {
        final callsJson = jsonDecode(stored) as List<dynamic>;
        callHistory = callsJson
            .map((e) => Call.fromJson(e as Map<String, dynamic>))
            .toList();

        // Retroactively clean non-production entries (sipCallId starting with 'local_')
        final originalLen = callHistory.length;
        callHistory = callHistory.where((c) {
          final sipId = c.sipCallId.trim().toLowerCase();
          final id = (c.id ?? '').trim().toLowerCase();
          final isProd = (sipId.isNotEmpty && sipId.startsWith('prod')) ||
              (id.isNotEmpty && id.startsWith('prod'));
          return isProd;
        }).toList();

        // Persist cleaned history if anything was removed
        if (callHistory.length != originalLen) {
          final cleaned = callHistory.map((c) => c.toJson()).toList();
          await prefs.setString(_localStorageKey, jsonEncode(cleaned));
        }
      }

      // Sort by newest first and limit results
      final sortedHistory = callHistory.toList()
        ..sort((a, b) {
          final aTime =
              DateTime.tryParse(a.startTimeISO)?.millisecondsSinceEpoch ??
                  a.startTime?.millisecondsSinceEpoch ??
                  0;
          final bTime =
              DateTime.tryParse(b.startTimeISO)?.millisecondsSinceEpoch ??
                  b.startTime?.millisecondsSinceEpoch ??
                  0;
          return bTime.compareTo(aTime);
        });

      final limitedHistory = sortedHistory.take(limit).toList();

      return ApiResponse.success(limitedHistory);
    } catch (error) {
      Logger.error('Error fetching call history: $error');
      return ApiResponse.error('Failed to fetch call history: $error');
    }
  }

  /// Add a call to history and save to SharedPreferences
  Future<void> addCallToHistory(Call call) async {
    try {
      // Skip non-production entries
      final sipId = call.sipCallId.trim().toLowerCase();
      final id = (call.id ?? '').trim().toLowerCase();
      final isProd = (sipId.isNotEmpty && sipId.startsWith('prod')) ||
          (id.isNotEmpty && id.startsWith('prod'));
      if (!isProd) return;

      final prefs = await SharedPreferences.getInstance();
      final stored = prefs.getString(_localStorageKey);
      List<Map<String, dynamic>> callHistory = [];

      if (stored != null) {
        final existingCalls = jsonDecode(stored) as List<dynamic>;
        callHistory = existingCalls.cast<Map<String, dynamic>>();
      }

      // Check if call with same sipCallId already exists
      final existingIndex = callHistory.indexWhere(
          (existingCall) => existingCall['sipCallId'] == call.sipCallId);

      if (existingIndex != -1) {
        // Update existing call (replace with newer data)
        callHistory[existingIndex] = call.toJson();
      } else {
        // Add new call to the beginning
        callHistory.insert(0, call.toJson());
      }

      // Keep only last 100 calls to prevent storage bloat
      if (callHistory.length > 100) {
        callHistory = callHistory.take(100).toList();
      }

      // Save back to SharedPreferences
      await prefs.setString(_localStorageKey, jsonEncode(callHistory));
    } catch (error) {
      Logger.error('Error adding call to history: $error');
    }
  }

  /// Clear call history from SharedPreferences
  Future<void> clearCallHistory() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_localStorageKey);
    } catch (error) {
      Logger.error('Error clearing call history: $error');
    }
  }

  /// Reconcile saved history with the latest fetched calls.
  /// If a call in history appears active (ringing/connecting/active/connected)
  /// but is missing from the latest fetch, mark it as ended and set end time/duration.
  Future<void> reconcileHistoryWithFetched(List<Call> fetchedCalls) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final stored = prefs.getString(_localStorageKey);
      if (stored == null) return;

      final fetchedIds = <String>{};
      for (final c in fetchedCalls) {
        final id = (c.sipCallId.isNotEmpty ? c.sipCallId : (c.id ?? '')).trim();
        if (id.isNotEmpty) fetchedIds.add(id);
      }

      final list = (jsonDecode(stored) as List)
          .map((e) => Call.fromJson(e as Map<String, dynamic>))
          .toList();

      bool changed = false;
      final updated = <Call>[];
      final now = DateTime.now();

      for (final c in list) {
        final id = (c.sipCallId.isNotEmpty ? c.sipCallId : (c.id ?? '')).trim();
        final isProd = id.toLowerCase().startsWith('prod');
        if (!isProd) {
          // Keep but they should already be filtered elsewhere
          updated.add(c);
          continue;
        }

        final isPotentiallyActive = c.status == CallStatus.ringing ||
            c.status == CallStatus.connecting ||
            c.status == CallStatus.connected ||
            c.status == CallStatus.active;

        if (isPotentiallyActive && !fetchedIds.contains(id)) {
          // Mark as ended and set end time/duration based on startTimeISO
          int durationSec = c.durationSeconds;
          if (c.startTimeISO.isNotEmpty) {
            final start = DateTime.tryParse(c.startTimeISO) ?? c.startTime;
            if (start != null) {
              durationSec = now.difference(start).inSeconds.abs();
            }
          }
          updated.add(c.copyWith(
            status: CallStatus.ended,
            endTimeISO: now.toIso8601String(),
            durationSeconds: durationSec,
            duration: durationSec,
            // also flag as ended if present
            callEnded: true,
          ));
          changed = true;
        } else {
          updated.add(c);
        }
      }

      if (changed) {
        await prefs.setString(_localStorageKey,
            jsonEncode(updated.map((e) => e.toJson()).toList()));
      }
    } catch (e) {
      Logger.error('Error reconciling call history: $e');
    }
  }

  /// Get call history statistics from local storage - matching React useCallHistory
  Future<CallStats> getCallHistoryStats() async {
    try {
      final response = await getCallHistory();
      final callHistory = response.data ?? [];

      if (callHistory.isEmpty) {
        return CallStats(
          total: 0,
          byStatus: {},
          byDirection: {},
          averageDuration: 0,
          totalDuration: 0,
          connectedCalls: 0,
          connectionRate: 0,
          todaysCalls: 0,
          thisWeeksCalls: 0,
        );
      }

      int totalDurationSeconds = 0;
      int connectedCallsCount = 0;
      int todaysCallsCount = 0;
      int thisWeeksCallsCount = 0;
      final today = DateTime.now();
      final todayStart = DateTime(today.year, today.month, today.day);
      final weekStart = today.subtract(const Duration(days: 7));

      final byStatus = <String, int>{};
      final byDirection = <String, int>{};

      for (final call in callHistory) {
        // Count by status
        final status = call.status.toString().split('.').last;
        byStatus[status] = (byStatus[status] ?? 0) + 1;

        // Count by direction
        final direction = call.direction.toString().split('.').last;
        byDirection[direction] = (byDirection[direction] ?? 0) + 1;

        // Calculate duration stats
        final duration = call.durationSeconds;
        totalDurationSeconds += duration;

        // Count connected calls (calls that actually connected, not just attempted)
        final connectedStatuses = [
          'active',
          'completed',
          'ended',
          'terminated'
        ];
        if (connectedStatuses.contains(status) && duration > 0) {
          connectedCallsCount++;
        }

        // Count today's calls
        final callDate = DateTime.tryParse(call.startTimeISO) ?? call.startTime;
        if (callDate != null && callDate.isAfter(todayStart)) {
          todaysCallsCount++;
        }

        // Count this week's calls
        if (callDate != null && callDate.isAfter(weekStart)) {
          thisWeeksCallsCount++;
        }
      }

      final avgDuration = connectedCallsCount > 0
          ? (totalDurationSeconds / connectedCallsCount).round()
          : 0;
      final connectionRate = callHistory.isNotEmpty
          ? ((connectedCallsCount / callHistory.length) * 100).round()
          : 0;

      return CallStats(
        total: callHistory.length,
        byStatus: byStatus,
        byDirection: byDirection,
        averageDuration: avgDuration,
        totalDuration: totalDurationSeconds,
        connectedCalls: connectedCallsCount,
        connectionRate: connectionRate,
        todaysCalls: todaysCallsCount,
        thisWeeksCalls: thisWeeksCallsCount,
      );
    } catch (error) {
      Logger.error('Error calculating call history stats: $error');
      return CallStats(
        total: 0,
        byStatus: {},
        byDirection: {},
        averageDuration: 0,
        totalDuration: 0,
        connectedCalls: 0,
        connectionRate: 0,
        todaysCalls: 0,
        thisWeeksCalls: 0,
      );
    }
  }

  /// Make an outbound call
  Future<ApiResponse<Map<String, dynamic>>> makeCall({
    required String phoneNumber,
    String? roomName,
    String? callerIdNumber,
    String? initiatorName,
    String? calleeDisplayName,
    bool? startWithInitiatorAudio,
    bool? audioOnly,
    bool? useBackupPeer,
    String? sipConfigId,
  }) async {
    try {
      // Validate phone number format (E.164)
      if (!RegExp(r'^\+?[1-9]\d{1,14}$').hasMatch(phoneNumber)) {
        return ApiResponse.error(
            'Invalid phone number format. Must be E.164 format.');
      }

      // Validate caller ID format (E.164) if provided
      if (callerIdNumber != null &&
          !RegExp(r'^\+?[1-9]\d{1,14}$').hasMatch(callerIdNumber)) {
        return ApiResponse.error(
            'Invalid caller ID number format. Must be E.164 format.');
      }

      // Prepare request payload following MediaSFU outgoing call pattern (matching React)
      final callData = {
        'roomName': roomName ?? '',
        'calledDid': phoneNumber, // React uses 'calledDid' not 'phoneNumber'
        'callerIdNumber': callerIdNumber ?? '',
        'initiatorName': initiatorName ?? 'voipuser',
        // Only add startWithInitiatorAudio if startWithInitiatorAudio is explicitly true
        if (startWithInitiatorAudio == true)
          'startWithInitiatorAudio': startWithInitiatorAudio,
        // Note: calleeDisplayName and other options are commented out in React, so we omit them too
      };

      Logger.debug('Making call with data: $callData');

      // Create local call entry for immediate UI feedback
      final localCall = _createLocalCallEntry(phoneNumber);
      await addCallToHistory(localCall);

      // POST /v1/sipcall/outgoingCall - matching React endpoint
      final response = await _httpClient
          .post<Map<String, dynamic>>('/outgoingCall', data: callData);

      if (response.success) {
        Logger.debug('Call initiated successfully: ${response.data}');
        return response;
      } else {
        Logger.error('Call failed: ${response.error}');
        return response;
      }
    } catch (error) {
      Logger.error('Error making call: $error');
      return ApiResponse.error('Failed to make call: $error');
    }
  }

  /// Hangup a call
  Future<ApiResponse<Map<String, dynamic>>> hangupCall(String callId) async {
    try {
      Logger.info('Hanging up call: $callId');

      // POST /v1/sipcall/{callId}/end
      final response =
          await _httpClient.post<Map<String, dynamic>>('/$callId/end', data: {
        'reason': 'User initiated hangup',
      });

      if (response.success) {
        Logger.debug('Call hung up successfully: ${response.data}');
        return response;
      } else {
        Logger.error('Hangup failed: ${response.error}');
        return response;
      }
    } catch (error) {
      Logger.error('Error hanging up call: $error');
      return ApiResponse.error('Failed to hangup call: $error');
    }
  }

  /// Reject a call (same as hangup for most SIP systems)
  Future<ApiResponse<Map<String, dynamic>>> rejectCall(String callId) async {
    try {
      Logger.info('Rejecting call: $callId');

      // POST /v1/sipcall/{callId}/end (same endpoint as hangup for reject)
      final response =
          await _httpClient.post<Map<String, dynamic>>('/$callId/end', data: {
        'reason': 'Call rejected by user',
      });

      if (response.success) {
        Logger.debug('Call rejected successfully: ${response.data}');
        return response;
      } else {
        Logger.error('Reject failed: ${response.error}');
        return response;
      }
    } catch (error) {
      Logger.error('Error rejecting call: $error');
      return ApiResponse.error('Failed to reject call: $error');
    }
  }

  /// Get detailed call state including activeMediaSource for real-time monitoring
  Future<ApiResponse<Map<String, dynamic>>> getCallState(String callId) async {
    try {
      Logger.debug('Getting call state for: $callId');

      // Get all calls and find the specific one (matching React implementation)
      final response = await _httpClient.get<Map<String, dynamic>>('/list');

      if (response.success && response.data != null) {
        final data = response.data!;
        List<dynamic> calls = [];

        // Handle nested data structure
        if (data['data'] != null) {
          calls = data['data'] as List<dynamic>;
        } else if (data['calls'] != null) {
          calls = data['calls'] as List<dynamic>;
        }

        // Find the specific call
        final call = calls.cast<Map<String, dynamic>>().where((call) {
          final sipCallId = call['sipCallId']?.toString() ?? '';
          final id = call['id']?.toString() ?? '';
          return sipCallId == callId || id == callId;
        }).firstOrNull;

        if (call != null) {
          return ApiResponse.success(call);
        } else {
          Logger.error('Call not found in list: $callId');
          return ApiResponse.error('Call not found');
        }
      } else {
        Logger.error('Failed to get calls list: ${response.error}');
        return ApiResponse.error(response.error ?? 'Failed to get call state');
      }
    } catch (error) {
      Logger.error('Error getting call state: $error');
      return ApiResponse.error('Failed to get call state: $error');
    }
  }

  /// Hold a call with message and recording options
  Future<ApiResponse<Map<String, dynamic>>> holdCall(
      String callId, String message, bool pauseRecording) async {
    try {
      Logger.debug(
          'Holding call: $callId with message: $message, pauseRecording: $pauseRecording');

      // POST /v1/sipcall/{callId}/hold
      final response =
          await _httpClient.post<Map<String, dynamic>>('/$callId/hold', data: {
        'withMessage': message,
        'pauseRecording': pauseRecording,
      });

      if (response.success) {
        Logger.debug('Call held successfully: ${response.data}');
        return response;
      } else {
        Logger.error('Hold failed: ${response.error}');
        return response;
      }
    } catch (error) {
      Logger.error('Error holding call: $error');
      return ApiResponse.error('Failed to hold call: $error');
    }
  }

  /// Transfer a call
  Future<ApiResponse<Map<String, dynamic>>> transferCall(
      String callId, String transferTo) async {
    try {
      Logger.debug('Transferring call $callId to $transferTo');

      // POST /v1/sipcall/transfer
      final response =
          await _httpClient.post<Map<String, dynamic>>('/transfer', data: {
        'callId': callId,
        'transferTo': transferTo,
      });

      if (response.success) {
        Logger.debug('Call transferred successfully: ${response.data}');
        return response;
      } else {
        Logger.error('Transfer failed: ${response.error}');
        return response;
      }
    } catch (error) {
      Logger.error('Error transferring call: $error');
      return ApiResponse.error('Failed to transfer call: $error');
    }
  }

  /// Get call statistics
  Future<ApiResponse<CallStats>> getCallStats() async {
    try {
      // Get all calls to calculate stats
      final allCallsResponse = await getAllCalls();
      final historyResponse = await getCallHistory();

      if (allCallsResponse.success && historyResponse.success) {
        final allCalls = allCallsResponse.data ?? [];
        final history = historyResponse.data ?? [];

        // Calculate stats
        final activeCalls = allCalls
            .where((call) =>
                call.status == CallStatus.active ||
                call.status == CallStatus.connected ||
                call.status == CallStatus.ringing)
            .length;

        final incomingCalls = history
            .where((call) =>
                call.direction == CallDirection.incoming ||
                call.direction == CallDirection.inbound)
            .length;

        final outgoingCalls = history
            .where((call) =>
                call.direction == CallDirection.outgoing ||
                call.direction == CallDirection.outbound)
            .length;

        // Calculate average duration (in seconds)
        final callsWithDuration =
            history.where((call) => call.durationSeconds > 0);
        final avgDuration = callsWithDuration.isNotEmpty
            ? callsWithDuration
                    .map((call) => call.durationSeconds)
                    .reduce((a, b) => a + b) /
                callsWithDuration.length
            : 0.0;

        // Calculate success rate (calls that completed vs all calls)
        final completedCalls = history
            .where((call) =>
                call.status == CallStatus.completed ||
                call.status == CallStatus.ended)
            .length;
        final successRate =
            history.isNotEmpty ? (completedCalls / history.length) * 100 : 0.0;

        // Today's calls
        final today = DateTime.now();
        final todayStart = DateTime(today.year, today.month, today.day);
        final todaysCalls = history.where((call) {
          final callDate =
              DateTime.tryParse(call.startTimeISO) ?? call.startTime;
          return callDate != null && callDate.isAfter(todayStart);
        }).length;

        final stats = CallStats(
          total: history.length,
          byStatus: {
            'active': activeCalls,
            'completed': completedCalls,
          },
          byDirection: {
            'incoming': incomingCalls,
            'outgoing': outgoingCalls,
          },
          averageDuration: avgDuration.round(),
          totalDuration: callsWithDuration.fold(
              0, (sum, call) => sum + call.durationSeconds),
          connectedCalls: completedCalls,
          connectionRate: successRate.round(),
          todaysCalls: todaysCalls,
          thisWeeksCalls: todaysCalls, // Simplified for legacy compatibility
          // Legacy compatibility
          totalCalls: history.length,
          activeCalls: activeCalls,
          incomingCalls: incomingCalls,
          outgoingCalls: outgoingCalls,
          avgDuration: avgDuration,
          successRate: successRate,
        );

        return ApiResponse.success(stats);
      } else {
        return ApiResponse.error('Failed to fetch calls for statistics');
      }
    } catch (error) {
      Logger.error('Error calculating call stats: $error');
      return ApiResponse.error('Failed to calculate call statistics: $error');
    }
  }

  /// Get SIP configurations for dialer - fetches real data from MediaSFU API
  Future<ApiResponse<List<Map<String, dynamic>>>> getSipConfigs() async {
    try {
      // Create a separate HTTP client for SIP configs with correct base URL
      final sipConfigClient = HttpClient(
        customBaseUrl: 'https://mediasfu.com/v1/sipconfigs',
      );

      // GET /v1/sipconfigs/?action=get&startIndex=0&pageSize=20
      // This matches the React.js implementation exactly
      final response = await sipConfigClient
          .get<Map<String, dynamic>>('/?action=get&startIndex=0&pageSize=20');

      // Dispose the temporary client
      sipConfigClient.dispose();

      if (response.success && response.data != null) {
        final data = response.data!;

        // Extract sipConfigs from response
        if (data['sipConfigs'] != null) {
          final sipConfigs = data['sipConfigs'] as List<dynamic>;
          final configList = sipConfigs
              .map((config) => config as Map<String, dynamic>)
              .toList();

          return ApiResponse.success(configList);
        } else {
          // No sipConfigs found
          return ApiResponse.success(<Map<String, dynamic>>[]);
        }
      }

      return ApiResponse.error(
          response.error ?? 'Failed to fetch SIP configurations');
    } catch (error) {
      Logger.error('Error fetching SIP configs: $error');
      return ApiResponse.error('Failed to fetch SIP configurations: $error');
    }
  }

  /// Unhold a call
  Future<ApiResponse<Map<String, dynamic>>> unholdCall(String callId) async {
    try {
      Logger.debug('Unholding call: $callId');

      // POST /v1/sipcall/{callId}/unhold
      final response = await _httpClient
          .post<Map<String, dynamic>>('/$callId/unhold', data: {});

      if (response.success) {
        Logger.debug('Call unheld successfully: ${response.data}');
        return response;
      } else {
        Logger.error('Unhold failed: ${response.error}');
        return response;
      }
    } catch (error) {
      Logger.error('Error unholding call: $error');
      return ApiResponse.error('Failed to unhold call: $error');
    }
  }

  /// Switch active media source to match React implementation
  Future<ApiResponse<Map<String, dynamic>>> switchSource(
      String callId, String sourceType,
      [String? humanName]) async {
    try {
      Logger.debug('Switching source for call $callId to $sourceType');

      final data = <String, dynamic>{
        'targetType': sourceType,
      };

      if (sourceType == 'human' && humanName != null) {
        data['humanName'] = humanName;
      }

      // POST /v1/sipcall/{callId}/switch-source (matching React implementation)
      final response = await _httpClient
          .post<Map<String, dynamic>>('/$callId/switch-source', data: data);

      if (response.success) {
        Logger.debug('Source switched successfully: ${response.data}');
        return response;
      } else {
        Logger.error('Switch source failed: ${response.error}');
        return response;
      }
    } catch (error) {
      Logger.error('Error switching source: $error');
      return ApiResponse.error('Failed to switch source: $error');
    }
  }

  /// Start agent for a call
  Future<ApiResponse<Map<String, dynamic>>> startAgent(String callId) async {
    try {
      Logger.debug('Starting agent for call: $callId');

      // POST /v1/sipcall/{callId}/start-agent (matching React implementation)
      final response = await _httpClient
          .post<Map<String, dynamic>>('/$callId/start-agent', data: {});

      if (response.success) {
        Logger.debug('Agent started successfully: ${response.data}');
        return response;
      } else {
        Logger.error('Start agent failed: ${response.error}');
        return response;
      }
    } catch (error) {
      Logger.error('Error starting agent: $error');
      return ApiResponse.error('Failed to start agent: $error');
    }
  }

  /// Stop agent for a call
  Future<ApiResponse<Map<String, dynamic>>> stopAgent(String callId) async {
    try {
      Logger.debug('Stopping agent for call: $callId');

      // POST /v1/sipcall/{callId}/stop-agent (matching React implementation)
      final response = await _httpClient
          .post<Map<String, dynamic>>('/$callId/stop-agent', data: {});

      if (response.success) {
        Logger.debug('Agent stopped successfully: ${response.data}');
        return response;
      } else {
        Logger.error('Stop agent failed: ${response.error}');
        return response;
      }
    } catch (error) {
      Logger.error('Error stopping agent: $error');
      return ApiResponse.error('Failed to stop agent: $error');
    }
  }

  /// Play audio (TTS or URL) to call participants
  Future<ApiResponse<Map<String, dynamic>>> playAudio(
    String callId,
    String type,
    String value,
    bool loop,
    bool immediately,
  ) async {
    try {
      Logger.debug('Playing audio to call $callId: $type - $value');

      // POST /v1/sipcall/{callId}/play (matching React implementation)
      final response =
          await _httpClient.post<Map<String, dynamic>>('/$callId/play', data: {
        'sourceValue': value,
        'loop': loop,
        'immediately': immediately,
      });

      if (response.success) {
        Logger.debug('Audio played successfully: ${response.data}');
        return response;
      } else {
        Logger.error('Play audio failed: ${response.error}');
        return response;
      }
    } catch (error) {
      Logger.error('Error playing audio: $error');
      return ApiResponse.error('Failed to play audio: $error');
    }
  }

  /// Update play-to-all setting for a call
  Future<ApiResponse<Map<String, dynamic>>> updatePlayToAll(
      String callId, bool playToAll) async {
    try {
      Logger.debug('Updating play-to-all for call $callId to $playToAll');

      // POST /v1/sipcall/{callId}/update-play-to-all - matching React implementation
      final response = await _httpClient
          .post<Map<String, dynamic>>('/$callId/update-play-to-all', data: {
        'playToAll': playToAll,
      });

      if (response.success) {
        Logger.debug('Play-to-all updated successfully: ${response.data}');
        return response;
      } else {
        Logger.error('Update play-to-all failed: ${response.error}');
        return response;
      }
    } catch (error) {
      Logger.error('Error updating play-to-all: $error');
      return ApiResponse.error('Failed to update play-to-all: $error');
    }
  }

  /// Create MediaSFU room for bot calls (equivalent to React useCallManager.createOrUseMediaRoom)
  Future<ApiResponse<Map<String, dynamic>>> createMediaSFURoom({
    required String participantName,
    required int duration,
  }) async {
    try {
      // Get MediaSFU credentials from shared preferences
      final prefs = await SharedPreferences.getInstance();
      final credentialsJson = prefs.getString('mediaSFUCredentials');

      if (credentialsJson == null) {
        return const ApiResponse<Map<String, dynamic>>(
          success: false,
          error:
              'MediaSFU credentials not found. Please configure API credentials first.',
        );
      }

      final credentials = jsonDecode(credentialsJson);
      if (credentials['apiUserName'] == null || credentials['apiKey'] == null) {
        return const ApiResponse<Map<String, dynamic>>(
          success: false,
          error:
              'Invalid MediaSFU credentials. Please reconfigure API credentials.',
        );
      }

      // Ensure the participant name is valid for MediaSFU (alphanumeric, max 10 chars)
      String validParticipantName = participantName
          .replaceAll(RegExp(r'[^a-zA-Z0-9]'), '')
          .substring(
              0, participantName.length > 10 ? 10 : participantName.length);

      if (validParticipantName.isEmpty) {
        validParticipantName = "voipuser";
      }

      // Create room using direct HTTP call to MediaSFU API (external endpoint)
      final payload = {
        'action': 'create',
        'duration': duration, // Duration in minutes
        'capacity': 5, // Max participants for SIP calls
        'userName':
            validParticipantName, // Use the proper formatted participant name
        'eventType': 'conference', // Conference type for call rooms
        'recordOnly': false,
        'dataBuffer': true,
        'bufferType': 'all'
      };

      // Use direct HTTP client for external MediaSFU API
      final client = http.Client();
      final uri = Uri.parse('https://mediasfu.com/v1/rooms/');
      final headers = {
        'Content-Type': 'application/json',
        'Authorization':
            'Bearer ${credentials['apiUserName']}:${credentials['apiKey']}',
      };

      final response = await client
          .post(
            uri,
            headers: headers,
            body: jsonEncode(payload),
          )
          .timeout(const Duration(seconds: 30));

      client.close();

      if (response.statusCode >= 200 && response.statusCode < 300) {
        final data = jsonDecode(response.body);

        // Check if the response is successful and extract room name
        // MediaSFU API returns the room name directly in the data object
        if (data['success'] == true) {
          final roomName = data['roomName'] ??
              data['meetingID'] ??
              data['data']?['roomName'];
          if (roomName != null) {
            return ApiResponse<Map<String, dynamic>>(
              success: true,
              data: {
                'roomName': roomName.toString(),
                'participantName': validParticipantName,
              },
            );
          } else {
            // Room name not found in response
            return const ApiResponse<Map<String, dynamic>>(
              success: false,
              error: 'Room name not found in MediaSFU response',
            );
          }
        } else {
          return ApiResponse<Map<String, dynamic>>(
            success: false,
            error: (data['error'] ??
                    data['message'] ??
                    'Failed to create MediaSFU room')
                .toString(),
          );
        }
      } else {
        final errorBody = response.body.isNotEmpty
            ? response.body
            : 'HTTP ${response.statusCode}';
        return ApiResponse<Map<String, dynamic>>(
          success: false,
          error: 'MediaSFU API error: $errorBody',
        );
      }
    } catch (error) {
      return ApiResponse<Map<String, dynamic>>(
        success: false,
        error: 'Failed to create MediaSFU room: $error',
      );
    }
  }

  /// Dispose the service
  void dispose() {
    _httpClient.dispose();
  }
}
