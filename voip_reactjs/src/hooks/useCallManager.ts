import { useState, useCallback } from 'react';
import { Call, CallStatus, SIPConfig } from '../types/call.types';
import { callService } from '../services/callService';
import { 
  getMediaSFUParticipantName,
  storeCreatedOutgoingRoom
} from '../utils/outgoingCallUtils';

interface UseCallManagerReturn {
  calls: Call[];
  isOnCall: boolean;
  activeCall: Call | null;
  isLoading: boolean;
  error: string | null;
  makeCall: (toNumber: string) => void;
  makeCallWithConfig: (params: MakeCallParams) => Promise<CallResult>;
  createOrUseMediaRoom: (params: MediaRoomParams) => Promise<RoomResult>;
  endCall: (callId: string) => void;
  hangupCall: (callId: string) => void;
  answerCall: (callId: string) => void;
  rejectCall: (callId: string) => void;
  toggleMute: () => void;
  toggleHold: (callId: string, hold: boolean) => void;
  isCallMuted: boolean;
}

interface MakeCallParams {
  phoneNumber: string;
  callerIdNumber: string;
  sipConfig: SIPConfig;
  roomName?: string;
  useAutoAgent?: boolean;
  startWithAgent?: boolean;
}

interface CallResult {
  success: boolean;
  error?: string;
  callId?: string;
}

interface MediaRoomParams {
  sipConfig: SIPConfig;
  duration?: number;
  participantName?: string; // Add optional participant name override
}

interface RoomResult {
  success: boolean;
  error?: string;
  roomName?: string;
  participantName?: string;
}

export const useCallManager = (): UseCallManagerReturn => {
  const [calls, setCalls] = useState<Call[]>([]);
  const [isCallMuted, setIsCallMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeCall = calls.find(call => 
    call.status === 'active' || call.status === 'connecting'
  ) || null;

  const isOnCall = activeCall !== null;

  const makeCall = useCallback((toNumber: string) => {
    // TODO: Implement actual call functionality with MediaSFU
    const newCall: Call = {
      // Core API fields
      sipCallId: `call_${Date.now()}`,
      status: 'connecting',
      direction: 'outgoing',
      startTimeISO: new Date().toISOString(),
      durationSeconds: 0,
      roomName: `room_${Date.now()}`,
      callerIdRaw: '+1234567890', // TODO: Get from user profile
      calledUri: toNumber,
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
      
      // Legacy compatibility fields (computed)
      id: `call_${Date.now()}`,
      from: '+1234567890',
      to: toNumber,
      phoneNumber: toNumber,
      startTime: new Date(),
      callerName: `Call to ${toNumber}`
    };
    setCalls(prev => [...prev, newCall]);
  }, []);

  // Enhanced call making with SIP configuration support
  const makeCallWithConfig = useCallback(async (params: MakeCallParams): Promise<CallResult> => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Generate room name if not provided
      const roomName = params.roomName || `call_${Date.now()}`;
      
      // Use the MediaSFU API via callService
      const response = await callService.makeCall(
        params.phoneNumber,
        params.callerIdNumber,
        roomName,
        'voipuser' // initiator name
      );
      
      if (response.success) {
        // Add to local call list
        const newCall: Call = {
          // Core API fields
          sipCallId: `call_${Date.now()}`,
          status: 'connecting' as CallStatus,
          direction: 'outgoing',
          startTimeISO: new Date().toISOString(),
          durationSeconds: 0,
          roomName: roomName,
          callerIdRaw: params.callerIdNumber,
          calledUri: params.phoneNumber,
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
          
          // Legacy compatibility fields (computed)
          id: `call_${Date.now()}`,
          from: params.callerIdNumber,
          to: params.phoneNumber,
          phoneNumber: params.phoneNumber,
          startTime: new Date(),
          callerName: `Call to ${params.phoneNumber}`
        };
        setCalls(prev => [...prev, newCall]);
        
        return { success: true, callId: newCall.id };
      } else {
        setError(response.error || 'Failed to make call');
        return { success: false, error: response.error || 'Failed to make call' };
      }
    } catch (error: any) {
      const errorMsg = error.message || 'Failed to make call';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Create or use existing MediaSFU room following proper MediaSFU patterns
  const createOrUseMediaRoom = useCallback(async (params: MediaRoomParams): Promise<RoomResult> => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Get MediaSFU credentials from localStorage
      const mediaSFUCredentials = localStorage.getItem('mediaSFUCredentials');
      if (!mediaSFUCredentials) {
        throw new Error('MediaSFU credentials not found. Please configure API credentials first.');
      }

      const credentials = JSON.parse(mediaSFUCredentials);
      if (!credentials.apiUserName || !credentials.apiKey) {
        throw new Error('Invalid MediaSFU credentials. Please reconfigure API credentials.');
      }

      // Get the proper MediaSFU participant name
      // Use provided participant name if available, otherwise format from credentials
      let participantName = params.participantName || getMediaSFUParticipantName(credentials.apiUserName);
      
      // Ensure the participant name is valid for MediaSFU (alphanumeric, max 10 chars)
      participantName = participantName.replace(/[^a-zA-Z0-9]/g, '').substring(0, 10);
      if (!participantName) {
        participantName = "voipuser";
      }

      // Create room using MediaSFU API endpoint pattern
      const payload = {
        action: "create",
        duration: params.duration || 30, // Default 30 minutes
        capacity: 5, // Max participants for SIP calls
        userName: participantName, // Use the proper formatted participant name
        eventType: "conference", // Conference type for call rooms
        recordOnly: false,
        dataBuffer: true,
        bufferType: "all"
      };

      const response = await fetch('https://mediasfu.com/v1/rooms/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${credentials.apiUserName}:${credentials.apiKey}`,
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! Status: ${response.status}`);
      }

      const data = await response.json();
      
      // Check if the response is successful and extract room name
      // MediaSFU API returns the room name directly in the data object
      if (data.success) {
        const roomName = data.roomName || data.meetingID || data.data?.roomName;
        if (roomName) {
          
          // Store the created room for outgoing call management
          storeCreatedOutgoingRoom(roomName, participantName);
          
          return { 
            success: true, 
            roomName: roomName,
            participantName: participantName // Return the participant name for use in MediaSFU handler
          };
        } else {
          // Room name not found in response
          throw new Error('Room name not found in MediaSFU response');
        }
      } else {
        throw new Error(data.error || data.message || 'Failed to create MediaSFU room');
      }
    } catch (error: any) {
      // Handle room creation error silently
      const errorMsg = error.message || 'Failed to create/access room';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const endCall = useCallback((callId: string) => {
    // TODO: Implement actual call termination with MediaSFU
    setCalls(prev => prev.map(call => 
      call.id === callId 
        ? { ...call, status: 'ended' as CallStatus, endTime: new Date() }
        : call
    ));
  }, []);

  const hangupCall = useCallback((callId: string) => {
    // Handle call hangup
    // TODO: Implement actual call hangup with MediaSFU
    setCalls(prev => prev.map(call => 
      call.id === callId 
        ? { ...call, status: 'ended' as CallStatus, endTime: new Date() }
        : call
    ));
  }, []);

  const answerCall = useCallback((callId: string) => {
    // Handle call answer
    // TODO: Implement actual call answering with MediaSFU
    setCalls(prev => prev.map(call => 
      call.id === callId 
        ? { ...call, status: 'active' as CallStatus }
        : call
    ));
  }, []);

  const rejectCall = useCallback((callId: string) => {
    // Handle call rejection
    // TODO: Implement actual call rejection with MediaSFU
    setCalls(prev => prev.map(call => 
      call.id === callId 
        ? { ...call, status: 'rejected' as CallStatus }
        : call
    ));
  }, []);

  const toggleHold = useCallback((callId: string, hold: boolean) => {
    // Handle call hold toggle
    // TODO: Implement actual hold functionality with MediaSFU
    setCalls(prev => prev.map(call => 
      call.id === callId 
        ? { ...call, status: hold ? 'on-hold' as CallStatus : 'active' as CallStatus, onHold: hold }
        : call
    ));
  }, []);

  const toggleMute = useCallback(() => {
    // Handle mute toggle
    // TODO: Implement actual mute functionality with MediaSFU
    setIsCallMuted(prev => !prev);
  }, []);

  return {
    calls,
    isOnCall,
    activeCall,
    isLoading,
    error,
    makeCall,
    makeCallWithConfig,
    createOrUseMediaRoom,
    endCall,
    hangupCall,
    answerCall,
    rejectCall,
    toggleMute,
    toggleHold,
    isCallMuted
  };
};
