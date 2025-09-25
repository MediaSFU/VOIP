import { HttpClient } from './httpClient';
import { ApiResponse } from '../types/api.types';
import { Call, CallStats, CallStatus, SIPConfig } from '../types/call.types';
import { storage } from '../utils/storage';
import { apiLogger, callLogger } from '../utils/logger';
import { formatErrorMessage } from '../utils/errorUtils';

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

  // Update a call's status in local history by sipCallId or id
  private async updateLocalHistoryStatus(callId: string, status: CallStatus): Promise<void> {
    try {
      const historyJson = await storage.getItem(this.localStorageKey);
      if (!historyJson) return;

      const history: Call[] = JSON.parse(historyJson);
      const idx = history.findIndex(
        (c) => c.sipCallId === callId || c.id === callId
      );
      if (idx === -1) return;

      const now = new Date();
      const startTimeMs = history[idx].startTimeISO ? new Date(history[idx].startTimeISO).getTime() : undefined;
      const endMs = now.getTime();
      const durationSeconds = startTimeMs && endMs > startTimeMs
        ? Math.floor((endMs - startTimeMs) / 1000)
        : history[idx].durationSeconds || 0;

      history[idx] = {
        ...history[idx],
        status,
        endTime: now,
        durationSeconds,
      } as Call;

      await storage.setItem(this.localStorageKey, JSON.stringify(history.slice(0, 1000)));
    } catch (error) {
      callLogger.warn('Failed to update local history status:', error);
    }
  }

  // Get all calls without filtering (recommended for polling)
  async getAllCalls(): Promise<ApiResponse<Call[]>> {
    try {
      // GET /v1/sipcall/list - get all calls without filtering
      const response = await this.httpClient.get<any>('/list');
      
      // Handle nested data structure - look in response.data.data for the calls array
      if (response.success && response.data) {
        // Check if data has nested structure
        const calls = response.data.data || response.data;
        return {
          success: true,
          data: Array.isArray(calls) ? calls as Call[] : []
        };
      }
      
      return {
        success: false,
        error: response.error || 'Failed to fetch calls'
      };
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
      const response = await this.httpClient.get<any>(`/list?direction=${direction}`);
  apiLogger.debug(`${direction} calls API response:`, response);
      
      // Handle nested data structure - look in response.data.data for the calls array
      if (response.success && response.data) {
        const calls = response.data.data || response.data;
        return {
          success: true,
          data: Array.isArray(calls) ? calls as Call[] : []
        };
      }
      
      return {
        success: false,
        error: response.error || `Failed to fetch ${direction} calls`
      };
    } catch (error: any) {
      apiLogger.error(`Error fetching ${direction} calls:`, error);
      return {
        success: false,
        error: error.message || `Failed to fetch ${direction} calls`
      };
    }
  }

  // Get active calls
  async getActiveCalls(): Promise<ApiResponse<Call[]>> {
    try {
      const response = await this.httpClient.get<any>('/active');
      
      if (response.success && response.data) {
        const calls = response.data.data || response.data;
        return {
          success: true,
          data: Array.isArray(calls) ? calls as Call[] : []
        };
      }
      
      return {
        success: false,
        error: response.error || 'Failed to fetch active calls'
      };
    } catch (error: any) {
      apiLogger.error('Error fetching active calls:', error);
      return {
        success: false,
        error: error.message || 'Failed to fetch active calls'
      };
    }
  }

  // Make an outbound call (legacy method)
  async makeCall(phoneNumber: string, callerIdNumber?: string): Promise<ApiResponse<any>> {
    try {
      const callData = {
        phoneNumber,
        callerIdNumber,
        roomName: `room_${Date.now()}`,
        audioOnly: true
      };

  apiLogger.info('Making call with data:', callData);
      const response = await this.httpClient.post('/outbound', callData);
  apiLogger.debug('Make call API response:', response);
      
      return response;
    } catch (error: any) {
      apiLogger.error('Error making call:', error);
      return {
        success: false,
        error: error.message || 'Failed to make call'
      };
    }
  }

  // Enhanced makeCall method with proper MediaSFU parameters
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

      apiLogger.info('Making call with enhanced payload:', {
        ...payload,
        note: 'All parameters should be actual values, not dummy data'
      });

  // POST /v1/sipcall/outgoingCall - as per MediaSFU API specification
  const response = await this.httpClient.post('/outgoingCall', payload);
  apiLogger.debug('Enhanced make call API response:', response);
      
      // Enhanced logging to understand MediaSFU response structure
      if (response.success && response.data) {
        apiLogger.debug('MediaSFU call response details:', {
          sipCallId: (response.data as any).sipCallId || (response.data as any).callId || (response.data as any).id,
          roomName: (response.data as any).roomName,
          sourceParameters: (response.data as any).sourceParameters,
          allResponseFields: Object.keys(response.data),
          fullResponseData: response.data // Log the full response to see what's available
        });
      }

      // Write a local placeholder to history for immediate UX (like voip_reactjs)
      if (response.success) {
        try {
          const localEntry = this.createLocalCallEntry(phoneNumber, 'outbound', 'connecting');
          // Align fields with our payload for better UI details
          (localEntry as any).roomName = roomName;
          (localEntry as any).humanParticipantName = initiatorName || 'voipuser';
          (localEntry as any).calledUri = phoneNumber;
          (localEntry as any).callerIdRaw = callerIdNumber;
          await this.saveCallToHistory(localEntry);
        } catch (e) {
          callLogger.warn('Failed to write local placeholder call to history:', e);
        }
      }

      return response;
    } catch (error: any) {
      apiLogger.error('Error making call with options:', error);
      return {
        success: false,
        error: error.message || 'Failed to make call with options'
      };
    }
  }

  // Hangup a call - POST /v1/sipcall/{sipCallId}/end
  async hangupCall(sipCallId: string): Promise<ApiResponse<any>> {
    try {
      const response = await this.httpClient.post(`/${sipCallId}/end`, { 
        reason: 'User initiated hangup' 
      });
  apiLogger.info('Hangup call API response:', response);
      // Update local history on success
      if (response.success) {
        await this.updateLocalHistoryStatus(sipCallId, 'completed');
      }
      return response;
    } catch (error: any) {
      apiLogger.error('Error hanging up call:', error);
      return {
        success: false,
        error: formatErrorMessage(error) || 'Failed to hangup call'
      };
    }
  }

  // Hold a call - POST /v1/sipcall/{sipCallId}/hold
  async holdCall(sipCallId: string, withMessage?: string, pauseRecording?: boolean): Promise<ApiResponse<any>> {
    try {
      const response = await this.httpClient.post(`/${sipCallId}/hold`, {
        withMessage: withMessage,
        pauseRecording: pauseRecording !== undefined ? pauseRecording : true
      });
      apiLogger.info('Hold call API response:', response);
      return response;
    } catch (error: any) {
      apiLogger.error('Error holding call:', error);
      return {
        success: false,
        error: formatErrorMessage(error) || 'Failed to hold call'
      };
    }
  }

  // Unhold a call - POST /v1/sipcall/{sipCallId}/unhold
  async unholdCall(sipCallId: string): Promise<ApiResponse<any>> {
    try {
      const response = await this.httpClient.post(`/${sipCallId}/unhold`, {});
      apiLogger.info('Unhold call API response:', response);
      return response;
    } catch (error: any) {
      apiLogger.error('Error unholding call:', error);
      return {
        success: false,
        error: formatErrorMessage(error) || 'Failed to unhold call'
      };
    }
  }

  // Combined hold/unhold toggle
  async toggleHold(sipCallId: string, hold: boolean, withMessage?: string, pauseRecording?: boolean): Promise<ApiResponse<any>> {
    return hold ? this.holdCall(sipCallId, withMessage, pauseRecording) : this.unholdCall(sipCallId);
  }

  // Answer an incoming call - handled by joining MediaSFU room
  async answerCall(sipCallId: string): Promise<ApiResponse<any>> {
    try {
      // For incoming calls, we typically join the MediaSFU room
      // This would be handled by MediaSFU integration
  callLogger.info('Answer call - joining MediaSFU room for:', sipCallId);
      
      // Update local history to connected if present
      await this.updateLocalHistoryStatus(sipCallId, 'connected');

      return {
        success: true,
        data: { message: 'Call answered successfully' }
      };
    } catch (error: any) {
      callLogger.error('Error answering call:', error);
      return {
        success: false,
        error: formatErrorMessage(error) || 'Failed to answer call'
      };
    }
  }

  // Reject an incoming call - POST /v1/sipcall/{sipCallId}/end
  async rejectCall(sipCallId: string): Promise<ApiResponse<any>> {
    try {
      const response = await this.httpClient.post(`/${sipCallId}/end`, { 
        reason: 'Call rejected' 
      });
  apiLogger.info('Reject call API response:', response);
      // Update local history on success
      if (response.success) {
        await this.updateLocalHistoryStatus(sipCallId, 'rejected');
      }
      return response;
    } catch (error: any) {
      apiLogger.error('Error rejecting call:', error);
      return {
        success: false,
        error: formatErrorMessage(error) || 'Failed to reject call'
      };
    }
  }

  // Get call statistics
  async getCallStats(): Promise<ApiResponse<CallStats>> {
    try {
      const allCallsResponse = await this.getAllCalls();
      
      if (!allCallsResponse.success || !allCallsResponse.data) {
        return {
          success: false,
          error: 'Failed to fetch calls for statistics'
        };
      }

      const calls = allCallsResponse.data;
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const stats: CallStats = {
        totalCalls: calls.length,
        activeCalls: calls.filter(call => ['active', 'connecting', 'ringing'].includes(call.status)).length,
        incomingCalls: calls.filter(call => call.direction === 'incoming' || call.direction === 'inbound').length,
        outgoingCalls: calls.filter(call => call.direction === 'outgoing' || call.direction === 'outbound').length,
        avgDuration: calls.length > 0 ? calls.reduce((sum, call) => sum + (call.durationSeconds || 0), 0) / calls.length : 0,
        successRate: calls.length > 0 ? (calls.filter(call => call.status === 'completed').length / calls.length) * 100 : 0,
        todaysCalls: calls.filter(call => {
          const callDate = new Date(call.startTimeISO);
          return callDate >= todayStart;
        }).length
      };

      return {
        success: true,
        data: stats
      };
    } catch (error: any) {
      apiLogger.error('Error calculating call stats:', error);
      return {
        success: false,
        error: error.message || 'Failed to calculate call statistics'
      };
    }
  }

  // Save call to local history
  async saveCallToHistory(call: Call): Promise<void> {
    try {
      const historyJson = await storage.getItem(this.localStorageKey);
      const history: Call[] = historyJson ? JSON.parse(historyJson) : [];
      
      // Add new call to beginning of history
      history.unshift(call);
      
      // Keep only last 100 calls
      const limitedHistory = history.slice(0, 100);
      
      await storage.setItem(this.localStorageKey, JSON.stringify(limitedHistory));
    } catch (error) {
      callLogger.warn('Failed to save call to local history:', error);
    }
  }

  // Get call history (combines local and remote if available)
  async getCallHistory(): Promise<Call[]> {
    try {
      // For now, just return local history
      // In a real implementation, you might also fetch from the server
      return await this.getLocalCallHistory();
    } catch (error) {
      callLogger.warn('Failed to get call history:', error);
      return [];
    }
  }

  // Get local call history
  async getLocalCallHistory(): Promise<Call[]> {
    try {
      const historyJson = await storage.getItem(this.localStorageKey);
      return historyJson ? JSON.parse(historyJson) : [];
    } catch (error) {
      callLogger.warn('Failed to load local call history:', error);
      return [];
    }
  }

  // Clear local call history
  async clearLocalCallHistory(): Promise<void> {
    try {
      await storage.removeItem(this.localStorageKey);
    } catch (error) {
      callLogger.warn('Failed to clear local call history:', error);
    }
  }

  // Get SIP configurations for dialing options
  async getSipConfigs(): Promise<SIPConfig[]> {
    try {
  apiLogger.info('Fetching SIP configurations from MediaSFU API...');
      
      // Get API credentials from storage (same way HttpClient does)
      const mediaSFUCredentials = await storage.getItem('mediaSFUCredentials');
      
      if (!mediaSFUCredentials) {
        apiLogger.warn('Missing MediaSFU credentials for SIP configs fetch');
        return [];
      }
      
      const credentials = JSON.parse(mediaSFUCredentials);
      const { apiKey, apiUserName } = credentials;
      
      apiLogger.debug('SIP configs - Found credentials:', {
        hasApiKey: !!apiKey,
        hasUserName: !!apiUserName,
        apiKeyLength: apiKey?.length || 0,
        userNameLength: apiUserName?.length || 0
      });
      
      if (!apiKey || !apiUserName) {
        apiLogger.warn('Missing API key or username in MediaSFU credentials');
        return [];
      }
      
      // Direct fetch to MediaSFU sipconfigs endpoint (following voip_reactjs pattern)
      const url = new URL("https://mediasfu.com/v1/sipconfigs/");
      url.searchParams.append("action", "get");
      url.searchParams.append("startIndex", "0");
      url.searchParams.append("pageSize", "20");

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiUserName}:${apiKey}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
  apiLogger.debug('SIP configs API response:', data);
        
        if (data.sipConfigs) {
          const configs = data.sipConfigs as SIPConfig[];
          apiLogger.info('Successfully fetched SIP configs:', configs.length, 'configs');
          return configs;
        }
      } else {
        apiLogger.error('SIP configs API request failed:', response.status, response.statusText);
      }
      
      apiLogger.warn('SIP configs API call succeeded but no sipConfigs in response');
      return [];
    } catch (error) {
      apiLogger.error('Error fetching SIP configs:', error);
      // Return empty array instead of mock data when API fails
      return [];
    }
  }

  // Explicitly create a MediaSFU room via REST API (used for bot/agent-driven calls)
  async createMediaRoom(participantName: string, durationMinutes: number = 30): Promise<ApiResponse<{ roomName: string; participantName: string }>> {
    try {
      // Get API credentials from storage
      const mediaSFUCredentials = await storage.getItem('mediaSFUCredentials');
      if (!mediaSFUCredentials) {
        return { success: false, error: 'MediaSFU credentials not found. Please configure API credentials first.' };
      }

      const credentials = JSON.parse(mediaSFUCredentials);
      const { apiKey, apiUserName } = credentials || {};
      if (!apiKey || !apiUserName) {
        return { success: false, error: 'Invalid MediaSFU credentials. Missing apiUserName or apiKey.' };
      }

      // Ensure participant name is alphanumeric and <= 10 chars
      const safeParticipantName = (participantName || 'voipuser').replace(/[^a-zA-Z0-9]/g, '').substring(0, 10) || 'voipuser';

      const payload = {
        action: 'create',
        duration: durationMinutes || 30,
        capacity: 5,
        userName: safeParticipantName,
        eventType: 'conference',
        recordOnly: false,
        dataBuffer: true,
        bufferType: 'all',
      };

      const response = await fetch('https://mediasfu.com/v1/rooms/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiUserName}:${apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let errorMessage = `HTTP error ${response.status}`;
        try {
          const err = await response.json();
          errorMessage = err?.error || err?.message || errorMessage;
        } catch {
          // ignore parse error
        }
        return { success: false, error: errorMessage };
      }

      const data = await response.json();
      if (!data || data.success === false) {
        const errorMessage = data?.error || data?.message || 'Failed to create MediaSFU room';
        return { success: false, error: errorMessage };
      }

      const roomName = data.roomName || data.meetingID || data?.data?.roomName;
      if (!roomName) {
        return { success: false, error: 'Room name not found in MediaSFU response' };
      }

      return { success: true, data: { roomName, participantName: safeParticipantName } };
    } catch (error: any) {
      return { success: false, error: error?.message || 'Failed to create MediaSFU room' };
    }
  }

  // Advanced Control Methods

  // Play audio on a call (TTS or URL)
  async playAudio(
    callId: string,
    type: 'tts' | 'url',
    content: string,
    loop: boolean = false,
    immediately: boolean = true
  ): Promise<ApiResponse<any>> {
    try {
      callLogger.info('Playing audio on call:', { callId, type, contentLength: content?.length, loop, immediately });
      
      const payload = {
        sourceValue: content,
        loop,
        immediately
      };

      const response = await this.httpClient.post(`/${callId}/play`, payload);
      
      if (response.success) {
        callLogger.info('Successfully played audio on call:', callId);
        return {
          success: true,
          data: response.data
        };
      }
      
      return {
        success: false,
        error: response.error || 'Failed to play audio'
      };
    } catch (error: any) {
      callLogger.error('Error playing audio:', error);
      return {
        success: false,
        error: error.message || 'Failed to play audio'
      };
    }
  }

  // Switch call source control (agent/human)
  async switchSource(callId: string, source: 'agent' | 'human', humanName?: string): Promise<ApiResponse<any>> {
    try {
      callLogger.info('Switching call source:', { callId, source, humanName });
      
      const payload: any = { targetType: source };
      if (source === 'human' && humanName) {
        payload.humanName = humanName;
      }
      
      const response = await this.httpClient.post(`/${callId}/switch-source`, payload);
      
      if (response.success) {
        callLogger.info('Successfully switched call source:', callId, 'to', source);
        return {
          success: true,
          data: response.data
        };
      }
      
      return {
        success: false,
        error: response.error || 'Failed to switch source'
      };
    } catch (error: any) {
      callLogger.error('Error switching source:', error);
      return {
        success: false,
        error: error.message || 'Failed to switch source'
      };
    }
  }

  // Start agent on a call
  async startAgent(callId: string): Promise<ApiResponse<any>> {
    try {
      callLogger.info('Starting agent on call:', callId);
      
      const response = await this.httpClient.post(`/${callId}/start-agent`, {});
      
      if (response.success) {
        callLogger.info('Successfully started agent on call:', callId);
        return {
          success: true,
          data: response.data
        };
      }
      
      return {
        success: false,
        error: response.error || 'Failed to start agent'
      };
    } catch (error: any) {
      callLogger.error('Error starting agent:', error);
      return {
        success: false,
        error: error.message || 'Failed to start agent'
      };
    }
  }

  // Stop agent on a call
  async stopAgent(callId: string): Promise<ApiResponse<any>> {
    try {
      callLogger.info('Stopping agent on call:', callId);
      
      const response = await this.httpClient.post(`/${callId}/stop-agent`, {});
      
      if (response.success) {
        callLogger.info('Successfully stopped agent on call:', callId);
        return {
          success: true,
          data: response.data
        };
      }
      
      return {
        success: false,
        error: response.error || 'Failed to stop agent'
      };
    } catch (error: any) {
      callLogger.error('Error stopping agent:', error);
      return {
        success: false,
        error: error.message || 'Failed to stop agent'
      };
    }
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
}

export default CallService;
export const callService = new CallService();