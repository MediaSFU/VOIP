import { useState, useCallback, useEffect, useRef } from 'react';
import { Call, CallStatus, SIPConfig } from '../types/call.types';
import { callService } from '../services/callService';
import { Alert } from 'react-native';
import { callLogger } from '../utils/logger';

interface UseCallManagerReturn {
  calls: Call[];
  isOnCall: boolean;
  activeCall: Call | null;
  isLoading: boolean;
  error: string | null;
  makeCall: (toNumber: string) => void;
  makeCallWithConfig: (params: MakeCallParams) => Promise<CallResult>;
  endCall: (callId: string) => void;
  hangupCall: (callId: string) => void;
  answerCall: (callId: string) => void;
  rejectCall: (callId: string) => void;
  toggleMute: () => void;
  toggleHold: (callId: string, hold: boolean) => void;
  isCallMuted: boolean;
  refreshCalls: () => Promise<void>;
  startCallMonitoring: () => void;
  stopCallMonitoring: () => void;
  clearError: () => void;
}

interface MakeCallParams {
  phoneNumber: string;
  callerIdNumber: string;
  sipConfig?: SIPConfig;
  roomName?: string;
  useAutoAgent?: boolean;
  startWithAgent?: boolean;
}

interface CallResult {
  success: boolean;
  error?: string;
  callId?: string;
}

export const useCallManager = (): UseCallManagerReturn => {
  const [calls, setCalls] = useState<Call[]>([]);
  const [isCallMuted, setIsCallMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Monitoring state
  const monitoringInterval = useRef<NodeJS.Timeout | null>(null);
  const [isMonitoring, setIsMonitoring] = useState(false);

  const activeCall = calls.find(call => 
    call.status === 'active' || 
    call.status === 'connecting' || 
    call.status === 'ringing'
  ) || null;

  const isOnCall = activeCall !== null;

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Refresh calls from API
  const refreshCalls = useCallback(async () => {
    try {
      const response = await callService.getAllCalls();
      if (response.success && response.data) {
        // Filter for active calls only
        const activeCalls = response.data.filter(call => 
          !['ended', 'failed', 'completed', 'rejected', 'terminated'].includes(call.status) &&
          !call.callEnded
        );
        setCalls(activeCalls);
      }
    } catch (error: any) {
      callLogger.error('Failed to refresh calls:', error);
    }
  }, []);

  // Start call monitoring
  const startCallMonitoring = useCallback(() => {
    if (isMonitoring) return;
    
    setIsMonitoring(true);
    monitoringInterval.current = setInterval(() => {
      refreshCalls();
    }, 3000); // Poll every 3 seconds
  }, [isMonitoring, refreshCalls]);

  // Stop call monitoring
  const stopCallMonitoring = useCallback(() => {
    if (monitoringInterval.current) {
      clearInterval(monitoringInterval.current);
      monitoringInterval.current = null;
    }
    setIsMonitoring(false);
  }, []);

  // Basic make call (simple version)
  const makeCall = useCallback((toNumber: string) => {
    Alert.alert(
      'Make Call',
      `Would you like to call ${toNumber}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Call', 
          onPress: () => {
            // Create a placeholder call
            const newCall: Call = {
              // Core API fields
              sipCallId: `dummy_call_${Date.now()}`,
              status: 'connecting',
              direction: 'outgoing',
              startTimeISO: new Date().toISOString(),
              durationSeconds: 0,
              roomName: `room_${Date.now()}`,
              callerIdRaw: '',
              calledUri: toNumber,
              audioOnly: true,
              activeMediaSource: '',
              humanParticipantName: null,
              playingMusic: false,
              playingPrompt: false,
              currentPromptType: null,
              pendingHumanIntervention: false,
              callbackState: '',
              callbackPin: null,
              activeSpeaker: null,
              callEnded: false,
              needsCallback: false,
              callbackHonored: false,
              calledBackRef: null,
              
              // Legacy compatibility fields
              id: `call_${Date.now()}`,
              from: '',
              to: toNumber,
              phoneNumber: toNumber,
              startTime: new Date(),
              callerName: `Call to ${toNumber}`
            };
            setCalls(prev => [...prev, newCall]);
            
            // Start monitoring for real call updates
            startCallMonitoring();
          }
        },
      ]
    );
  }, [startCallMonitoring]);

  // Enhanced call making with SIP configuration support
  const makeCallWithConfig = useCallback(async (params: MakeCallParams): Promise<CallResult> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const roomName = params.roomName || `call_${Date.now()}`;
      
      const response = await callService.makeCall(
        params.phoneNumber,
        params.callerIdNumber
      );
      
      if (response.success) {
        const newCall: Call = {
          sipCallId: response.data?.sipCallId || `call_${Date.now()}`,
          status: 'connecting' as CallStatus,
          direction: 'outgoing',
          startTimeISO: new Date().toISOString(),
          durationSeconds: 0,
          roomName: roomName,
          callerIdRaw: params.callerIdNumber,
          calledUri: params.phoneNumber,
          audioOnly: true,
          activeMediaSource: '',
          humanParticipantName: 'voipuser',
          playingMusic: false,
          playingPrompt: false,
          currentPromptType: null,
          pendingHumanIntervention: false,
          callbackState: '',
          callbackPin: null,
          activeSpeaker: null,
          callEnded: false,
          needsCallback: false,
          callbackHonored: false,
          calledBackRef: null,
          
          id: `call_${Date.now()}`,
          from: params.callerIdNumber,
          to: params.phoneNumber,
          phoneNumber: params.phoneNumber,
          startTime: new Date(),
          callerName: `Call to ${params.phoneNumber}`
        };
        
        setCalls(prev => [...prev, newCall]);
        startCallMonitoring();
        
        return { success: true, callId: newCall.id };
      } else {
        const errorMsg = response.error || 'Failed to make call';
        setError(errorMsg);
        return { success: false, error: errorMsg };
      }
    } catch (error: any) {
      const errorMsg = error.message || 'Failed to make call';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setIsLoading(false);
    }
  }, [startCallMonitoring]);

  // Hangup call
  const hangupCall = useCallback(async (callId: string) => {
    try {
      const call = calls.find(c => c.id === callId || c.sipCallId === callId);
      if (!call) return;

      setIsLoading(true);
      
      if (call.sipCallId && !call.sipCallId.startsWith('dummy_')) {
        const response = await callService.hangupCall(call.sipCallId);
        if (!response.success) {
          Alert.alert('Error', response.error || 'Failed to hangup call');
          return;
        }
      }

      // Update local state
      setCalls(prev => prev.filter(c => c.id !== callId && c.sipCallId !== callId));
      
      Alert.alert('Call Ended', 'Call has been terminated');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to hangup call');
    } finally {
      setIsLoading(false);
    }
  }, [calls]);

  // End call
  const endCall = useCallback((callId: string) => {
    const call = calls.find(c => c.id === callId || c.sipCallId === callId);
    if (call) {
      hangupCall(callId);
    }
  }, [calls, hangupCall]);

  // Answer call
  const answerCall = useCallback(async (callId: string) => {
    try {
      const call = calls.find(c => c.id === callId || c.sipCallId === callId);
      if (!call) return;

      setIsLoading(true);
      
      if (call.sipCallId && !call.sipCallId.startsWith('dummy_')) {
        const response = await callService.answerCall(call.sipCallId);
        if (!response.success) {
          Alert.alert('Error', response.error || 'Failed to answer call');
          return;
        }
      }

      // Update call status
      setCalls(prev => prev.map(c => 
        (c.id === callId || c.sipCallId === callId) 
          ? { ...c, status: 'active' as CallStatus }
          : c
      ));
      
      startCallMonitoring();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to answer call');
    } finally {
      setIsLoading(false);
    }
  }, [calls, startCallMonitoring]);

  // Reject call
  const rejectCall = useCallback(async (callId: string) => {
    try {
      const call = calls.find(c => c.id === callId || c.sipCallId === callId);
      if (!call) return;

      setIsLoading(true);
      
      if (call.sipCallId && !call.sipCallId.startsWith('dummy_')) {
        const response = await callService.rejectCall(call.sipCallId);
        if (!response.success) {
          Alert.alert('Error', response.error || 'Failed to reject call');
          return;
        }
      }

      // Remove from local state
      setCalls(prev => prev.filter(c => c.id !== callId && c.sipCallId !== callId));
      
      Alert.alert('Call Rejected', 'Incoming call has been rejected');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to reject call');
    } finally {
      setIsLoading(false);
    }
  }, [calls]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    setIsCallMuted(prev => {
      const newMuteState = !prev;
      Alert.alert(
        'Microphone',
        newMuteState ? 'Microphone muted' : 'Microphone unmuted'
      );
      return newMuteState;
    });
  }, []);

  // Toggle hold
  const toggleHold = useCallback(async (callId: string, hold: boolean) => {
    try {
      const call = calls.find(c => c.id === callId || c.sipCallId === callId);
      if (!call) return;

      setIsLoading(true);
      
      if (call.sipCallId && !call.sipCallId.startsWith('dummy_')) {
        const response = hold 
          ? await callService.holdCall(call.sipCallId) 
          : await callService.unholdCall(call.sipCallId);
        if (!response.success) {
          Alert.alert('Error', response.error || `Failed to ${hold ? 'hold' : 'unhold'} call`);
          return;
        }
      }

      // Update call status
      setCalls(prev => prev.map(c => 
        (c.id === callId || c.sipCallId === callId) 
          ? { ...c, status: hold ? 'on-hold' as CallStatus : 'active' as CallStatus, onHold: hold }
          : c
      ));
      
      Alert.alert(
        'Call Status',
        hold ? 'Call placed on hold' : 'Call resumed'
      );
    } catch (error: any) {
      Alert.alert('Error', error.message || `Failed to ${hold ? 'hold' : 'unhold'} call`);
    } finally {
      setIsLoading(false);
    }
  }, [calls]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCallMonitoring();
    };
  }, [stopCallMonitoring]);

  return {
    calls,
    isOnCall,
    activeCall,
    isLoading,
    error,
    makeCall,
    makeCallWithConfig,
    endCall,
    hangupCall,
    answerCall,
    rejectCall,
    toggleMute,
    toggleHold,
    isCallMuted,
    refreshCalls,
    startCallMonitoring,
    stopCallMonitoring,
    clearError,
  };
};

export default useCallManager;