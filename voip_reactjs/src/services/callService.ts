import { HttpClient } from './httpClient';
import { ApiResponse } from '../types/api.types';
import { Call, CallStats, CallStatus } from '../types/call.types';
import { apiLogger } from '../utils/logger';

export class CallService {
  private httpClient: HttpClient;
  private localStorageKey = 'voip_call_history';

  constructor() {
    this.httpClient = new HttpClient();
  }

  // Helper function to create a Call object with all required fields
  private createLocalCallEntry(
    phoneNumber: string, 
    direction: 'inbound' | 'outbound' = 'outbound',
    status: CallStatus = 'connecting'
  ): Call {
    const now = new Date();
    return {
      // Core API fields
      sipCallId: `local_${Date.now()}`,
      status: status,
      direction: direction,
      startTimeISO: now.toISOString(),
      durationSeconds: 0,
      roomName: `room_${Date.now()}`,
      callerIdRaw: direction === 'outbound' ? 'voipuser' : phoneNumber,
      calledUri: direction === 'outbound' ? phoneNumber : 'voipuser',
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
      id: `call_${Date.now()}`,
      phoneNumber: phoneNumber,
      callerName: `Call to ${phoneNumber}`,
      startTime: now,
      duration: 0
    };
  }

  // Get all calls without filtering (recommended for polling)
  async getAllCalls(): Promise<ApiResponse<Call[]>> {
    try {
      // GET /v1/sipcall/list - get all calls without filtering
      const response = await this.httpClient.get('/list');
      
      // Handle nested data structure - look in response.data.data for the calls array
      if (response.success && response.data && response.data.data) {
        return {
          success: true,
          data: response.data.data as Call[]
        };
      }
      
      return response;
    } catch (error: any) {
      apiLogger.error('Error fetching all calls:', error);
      return {
        success: false,
        error: error.message || 'Failed to fetch all calls'
      };
    }
  }

  // Get calls by direction (incoming/outgoing)
  async getCallsByDirection(direction: 'incoming' | 'outgoing'): Promise<ApiResponse<Call[]>> {
    try {
      apiLogger.debug(`Fetching ${direction} calls from /list?direction=${direction}`);
      // GET /v1/sipcall/list?direction=incoming or outgoing
      const response = await this.httpClient.get(`/list?direction=${direction}`);
      apiLogger.debug(`${direction} calls API response:`, response);
      
      // Handle nested data structure - look in response.data.data for the calls array
      if (response.success && response.data && response.data.data) {
        return {
          success: true,
          data: response.data.data as Call[]
        };
      }
      
      return response;
    } catch (error: any) {
      apiLogger.error(`Error fetching ${direction} calls:`, error);
      return {
        success: false,
        error: error.message || `Failed to fetch ${direction} calls`
      };
    }
  }

  // Get active calls using HTTP REST API (legacy method)
  async getActiveCalls(): Promise<ApiResponse<Call[]>> {
    try {
      // GET /v1/sipcall/list?status=connected - filter by active status
      const response = await this.httpClient.get('/list');
      apiLogger.debug('Active calls API response:', response);
      
      // Handle nested data structure - look in response.data.data for the calls array
      if (response.success && response.data && response.data.data) {
        return {
          success: true,
          data: response.data.data as Call[]
        };
      }
      
      return response;
    } catch (error: any) {
      apiLogger.error('Error fetching active calls:', error);
      return {
        success: false,
        error: error.message || 'Failed to fetch active calls'
      };
    }
  }

  // Get call history from localStorage (no HTTP endpoint available)
  async getCallHistory(limit: number = 50): Promise<ApiResponse<Call[]>> {
    try {
      const stored = localStorage.getItem(this.localStorageKey);
      let callHistory: Call[] = [];
      
      if (stored) {
        callHistory = JSON.parse(stored);
      }
      
      // Sort by newest first and limit results
      const sortedHistory = callHistory
        .sort((a, b) => {
          const aTime = a.startTimeISO ? new Date(a.startTimeISO).getTime() : (a.startTime ? new Date(a.startTime).getTime() : 0);
          const bTime = b.startTimeISO ? new Date(b.startTimeISO).getTime() : (b.startTime ? new Date(b.startTime).getTime() : 0);
          return bTime - aTime;
        })
        .slice(0, limit);
      
      return {
        success: true,
        data: sortedHistory
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to fetch call history'
      };
    }
  }

  // Calculate call statistics locally (no HTTP endpoint available)
  async getCallStats(): Promise<ApiResponse<CallStats>> {
    try {
      // Get all calls for comprehensive real-time stats
      const allCallsResponse = await this.getAllCalls();
      const allCalls = allCallsResponse.success ? allCallsResponse.data || [] : [];
      
      // Filter active calls from all calls
      const activeCalls = allCalls.filter(call => 
        call.status === 'active' || call.status === 'connecting' || call.status === 'ringing'
      );
      
      // Get history for calculated stats
      const historyResponse = await this.getCallHistory(1000);
      const callHistory = historyResponse.success ? historyResponse.data || [] : [];
      
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      
      // Calculate statistics
      const todayCalls = callHistory.filter(call => {
        const startTimeString = call.startTimeISO || call.startTime?.toISOString();
        return startTimeString && new Date(startTimeString) >= startOfDay;
      });
      
      const connectedCalls = callHistory.filter(call => 
        call.status === 'connected' || call.status === 'completed'
      );
      
      const totalDuration = callHistory.reduce((sum, call) => 
        sum + (call.duration || 0), 0
      );
      
      const stats: CallStats = {
        totalCalls: callHistory.length,
        activeCalls: activeCalls.length,
        incomingCalls: callHistory.filter(call => call.direction === 'inbound').length,
        outgoingCalls: callHistory.filter(call => call.direction === 'outbound').length,
        avgDuration: callHistory.length > 0 ? Math.round(totalDuration / callHistory.length) : 0,
        successRate: callHistory.length > 0 ? (connectedCalls.length / callHistory.length) * 100 : 0,
        todaysCalls: todayCalls.length
      };
      
      return {
        success: true,
        data: stats
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to calculate call statistics'
      };
    }
  }

  // Option 1: Make call using MediaSFU SDK (createOutboundSIPCall)
  async makeCallViaSDK(phoneNumber: string, callerIdNumber: string, roomName: string): Promise<ApiResponse<any>> {
    // This would use MediaSFU SDK's createOutboundSIPCall method
    // Implementation depends on MediaSFU SDK integration
    return {
      success: false,
      error: 'SDK method not implemented yet - use makeCallViaHTTP instead'
    };
  }

  // Option 2: Make call using HTTP endpoint (POST /v1/sipcall/outgoingCall)
  async makeCallViaHTTP(phoneNumber: string, callerIdNumber: string, roomName: string, initiatorName?: string): Promise<ApiResponse<any>> {
    try {
      // Validate phone number format (E.164)
      if (!phoneNumber.match(/^\+?[1-9]\d{1,14}$/)) {
        return {
          success: false,
          error: 'Invalid phone number format. Must be E.164 format.'
        };
      }

      // Validate caller ID format (E.164)
      if (!callerIdNumber.match(/^\+?[1-9]\d{1,14}$/)) {
        return {
          success: false,
          error: 'Invalid caller ID number format. Must be E.164 format.'
        };
      }

      // POST /v1/sipcall/outgoingCall - as per SIPConfigGuide
      const response = await this.httpClient.post('/outgoingCall', {
        roomName: roomName,
        calledDid: phoneNumber,
        callerIdNumber: callerIdNumber,
        initiatorName: initiatorName || 'voipuser'
      });

      // Store call in local history if successful
      if (response.success) {
        this.addToLocalHistory(this.createLocalCallEntry(phoneNumber, 'outbound', 'connecting'));
      }

      return response;
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to make call via HTTP'
      };
    }
  }

  // Enhanced makeCall method with startWithInitiatorAudio support
  async makeCallWithOptions(
    phoneNumber: string, 
    callerIdNumber: string, 
    roomName: string, 
    initiatorName?: string,
    options?: {
      startWithInitiatorAudio?: boolean;
      calleeDisplayName?: string;
      useBackupPeer?: boolean;
    }
  ): Promise<ApiResponse<any>> {
    try {
      // Validate phone number format (E.164)
      if (!phoneNumber.match(/^\+?[1-9]\d{1,14}$/)) {
        return {
          success: false,
          error: 'Invalid phone number format. Must be E.164 format.'
        };
      }

      // Validate caller ID format (E.164)
      if (!callerIdNumber.match(/^\+?[1-9]\d{1,14}$/)) {
        return {
          success: false,
          error: 'Invalid caller ID number format. Must be E.164 format.'
        };
      }

      // Prepare request payload following MediaSFU outgoing call pattern
      const payload = {
        roomName: roomName,
        calledDid: phoneNumber,
        callerIdNumber: callerIdNumber,
        initiatorName: initiatorName || 'voipuser',
        // calleeDisplayName: options?.calleeDisplayName || 'sipcallee',
        ...(options?.startWithInitiatorAudio !== undefined && options?.startWithInitiatorAudio === true && {
          startWithInitiatorAudio: options.startWithInitiatorAudio 
        }),
        // ...(options?.useBackupPeer !== undefined && { 
        //   useBackupPeer: options.useBackupPeer 
        // })
      };

      apiLogger.info('Making call with payload:', {
        ...payload
      });

      // POST /v1/sipcall/outgoingCall - as per MediaSFU API specification
      const response = await this.httpClient.post('/outgoingCall', payload);
      apiLogger.info('Make call response:', response);
      
      // Enhanced logging to understand MediaSFU response structure
      if (response.success && response.data) {
        apiLogger.info('MediaSFU call response details:', {
          sipCallId: response.data.sipCallId || response.data.callId || response.data.id,
          roomName: response.data.roomName,
          sourceParameters: response.data.sourceParameters,
          allResponseFields: Object.keys(response.data),
          fullResponseData: response.data // Log the full response to see what's available
        });
      }

      // Store call in local history if successful
      if (response.success) {
        this.addToLocalHistory(this.createLocalCallEntry(phoneNumber, 'outbound', 'connecting'));
      }

      return response;
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to make call via HTTP'
      };
    }
  }

  // Default makeCall method (uses HTTP)
  async makeCall(phoneNumber: string, callerIdNumber: string, roomName: string, initiatorName?: string): Promise<ApiResponse<any>> {
    return this.makeCallWithOptions(phoneNumber, callerIdNumber, roomName, initiatorName);
  }

  // Hang up call - POST /v1/sipcall/{sipCallId}/end
  async hangupCall(callId: string): Promise<ApiResponse<any>> {
    try {
      const response = await this.httpClient.post(`/${callId}/end`, {
        reason: 'User initiated hangup'
      });
      
      // Update local history
      if (response.success) {
        this.updateLocalHistoryStatus(callId, 'completed');
      }
      
      return response;
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to hang up call'
      };
    }
  }

  // Answer call (no specific HTTP endpoint - handled by joining MediaSFU room)
  async answerCall(callId: string): Promise<ApiResponse<any>> {
    try {
      // For incoming calls, we typically join the MediaSFU room
      // This would be handled by MediaSFU integration
      this.updateLocalHistoryStatus(callId, 'connected');
      
      return {
        success: true,
        data: { message: 'Call answered successfully' }
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to answer call'
      };
    }
  }

  // Reject call - POST /v1/sipcall/{sipCallId}/end
  async rejectCall(callId: string): Promise<ApiResponse<any>> {
    try {
      const response = await this.httpClient.post(`/${callId}/end`, {
        reason: 'Call rejected'
      });
      
      // Update local history
      if (response.success) {
        this.updateLocalHistoryStatus(callId, 'rejected');
      }
      
      return response;
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to reject call'
      };
    }
  }

  // Hold call - POST /v1/sipcall/{sipCallId}/hold
  async holdCall(callId: string, withMessage?: string, pauseRecording?: boolean): Promise<ApiResponse<any>> {
    try {
      const response = await this.httpClient.post(`/${callId}/hold`, {
        withMessage: withMessage,
        pauseRecording: pauseRecording !== undefined ? pauseRecording : true // Default to true if not specified
      });
      
      return response;
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to hold call'
      };
    }
  }

  // Unhold call - POST /v1/sipcall/{sipCallId}/unhold
  async unholdCall(callId: string): Promise<ApiResponse<any>> {
    try {
      const response = await this.httpClient.post(`/${callId}/unhold`);
      return response;
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to unhold call'
      };
    }
  }

  // Combined hold/unhold toggle
  async toggleHold(callId: string, isHold: boolean): Promise<ApiResponse<any>> {
    return isHold ? this.holdCall(callId) : this.unholdCall(callId);
  }

  // Play media in call - POST /v1/sipcall/{sipCallId}/play
  // Play media with enhanced options (TTS or URL)
  async playAudio(
    callId: string, 
    type: 'tts' | 'url', 
    value: string, 
    loop: boolean = false, 
    immediately: boolean = true
  ): Promise<ApiResponse<any>> {
    try {
      const response = await this.httpClient.post(`/${callId}/play`, {
        sourceValue: value,
        loop,
        immediately
      });
      
      return response;
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to play audio'
      };
    }
  }

  // Transfer call (no direct endpoint - would need to be handled differently)
  async transferCall(callId: string, targetNumber: string): Promise<ApiResponse<any>> {
    // There's no direct transfer endpoint, would need to:
    // 1. Create new outgoing call to target
    // 2. Bridge the calls
    // This is more complex and may require MediaSFU SDK
    return {
      success: false,
      error: 'Call transfer requires advanced implementation - not available via simple HTTP'
    };
  }

  // Update play to all setting - controls whether bot audio plays to everyone or just SIP caller
  async updatePlayToAll(callId: string, playToAll: boolean): Promise<ApiResponse<any>> {
    try {
      const response = await this.httpClient.post(`/${callId}/update-play-to-all`, {
        playToAll: playToAll
      });
      
      return response;
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to update play to all setting'
      };
    }
  }

  // Switch call source using unified endpoint
  async switchSource(callId: string, sourceType: 'agent' | 'human', humanName?: string): Promise<ApiResponse<any>> {
    try {
      const payload: any = { targetType: sourceType };
      if (sourceType === 'human' && humanName) {
        payload.humanName = humanName;
      }
      
      const response = await this.httpClient.post(`/${callId}/switch-source`, payload);

      return response;
    } catch (error: any) {
      return {
        success: false,
        error: error.message || `Failed to switch to ${sourceType}`
      };
    }
  }

  // Start agent - POST /v1/sipcall/{sipCallId}/start-agent
  async startAgent(callId: string): Promise<ApiResponse<any>> {
    try {
      apiLogger.debug(`Starting agent for call: ${callId}`);
      const response = await this.httpClient.post(`/${callId}/start-agent`, {});
      
      if (response.success) {
        apiLogger.info('Agent started successfully', { callId });
      } else {
        apiLogger.error('Failed to start agent', { callId, error: response.error });
      }
      
      return response;
    } catch (error: any) {
      apiLogger.error('Error starting agent:', { error, callId });
      return {
        success: false,
        error: error.message || 'Failed to start agent'
      };
    }
  }

  // Stop agent - POST /v1/sipcall/{sipCallId}/stop-agent  
  async stopAgent(callId: string): Promise<ApiResponse<any>> {
    try {
      apiLogger.debug(`Stopping agent for call: ${callId}`);
      const response = await this.httpClient.post(`/${callId}/stop-agent`, {});
      
      if (response.success) {
        apiLogger.info('Agent stopped successfully', { callId });
      } else {
        apiLogger.error('Failed to stop agent', { callId, error: response.error });
      }
      
      return response;
    } catch (error: any) {
      apiLogger.error('Error stopping agent:', { error, callId });
      return {
        success: false,
        error: error.message || 'Failed to stop agent'
      };
    }
  }

  // Legacy methods for backward compatibility
  async switchToAgent(callId: string): Promise<ApiResponse<any>> {
    return this.switchSource(callId, 'agent');
  }

  async switchToHuman(callId: string, humanName?: string): Promise<ApiResponse<any>> {
    return this.switchSource(callId, 'human', humanName);
  }

  // Helper: Add call to local history
  private addToLocalHistory(call: Call): void {
    try {
      const stored = localStorage.getItem(this.localStorageKey);
      let history: Call[] = stored ? JSON.parse(stored) : [];
      
      // Add new call to beginning
      history.unshift(call);
      
      // Keep only last 1000 calls
      if (history.length > 1000) {
        history = history.slice(0, 1000);
      }
      
      localStorage.setItem(this.localStorageKey, JSON.stringify(history));
    } catch (error) {
      // Error saving to local history - continue without throwing
    }
  }

  // Helper: Update call status in local history
  private updateLocalHistoryStatus(callId: string, status: string): void {
    try {
      const stored = localStorage.getItem(this.localStorageKey);
      if (!stored) return;
      
      const history: Call[] = JSON.parse(stored);
      const callIndex = history.findIndex(call => call.id === callId);
      
      if (callIndex >= 0) {
        history[callIndex].status = status as any;
        if (status === 'completed' || status === 'rejected') {
          history[callIndex].endTime = new Date();
          const startTimeString = history[callIndex].startTimeISO || history[callIndex].startTime?.toISOString();
          if (startTimeString) {
            history[callIndex].duration = Math.floor(
              (new Date().getTime() - new Date(startTimeString).getTime()) / 1000
            );
          }
        }
        
        localStorage.setItem(this.localStorageKey, JSON.stringify(history));
      }
    } catch (error) {
      // Error updating local history - continue without throwing
    }
  }

  // Get specific call state - GET /v1/sipcall/{sipCallId} or find in list
  async getCallState(callId: string): Promise<ApiResponse<Call | null>> {
    try {
      // First, try to find the call in the list (more efficient and reliable)
      const allCallsResponse = await this.getAllCalls();
      
      if (allCallsResponse.success && allCallsResponse.data) {
        const call = allCallsResponse.data.find(c => 
          c.sipCallId === callId || c.id === callId
        );
        
        if (call) {
          return {
            success: true,
            data: call
          };
        }
      }
      
      // If not found in list, return null (call might not exist)
      return {
        success: true,
        data: null
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to get call state'
      };
    }
  }

  // Clear local call history
  async clearCallHistory(): Promise<ApiResponse<boolean>> {
    try {
      localStorage.removeItem(this.localStorageKey);
      return {
        success: true,
        data: true
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to clear call history'
      };
    }
  }
}

export const callService = new CallService();
