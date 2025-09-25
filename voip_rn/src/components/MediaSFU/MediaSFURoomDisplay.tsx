import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Modal,
  Dimensions,
  Platform,
  TextInput,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import MediaSFUHandler from './MediaSFUHandler';
import { AudioGrid } from 'mediasfu-reactnative';

import AdvancedControlsModal from './AdvancedControlsModal';
import { roomLogger } from '../../utils/logger';
import { callService } from '../../services/callService';
// import { extractCleanIdentifier } from '../../utils/sipCallerParser';

const { width: screenWidth } = Dimensions.get('window');
const isTablet = screenWidth >= 768;
const isDesktop = screenWidth >= 1024;

type ParticipantSnapshot = {
  id: string;
  name: string;
  muted: boolean;
};

const normalizeParticipants = (participants: any[] = []): ParticipantSnapshot[] => {
  return participants
    .map((participant) => {
      const rawId =
        participant?.id !== undefined && participant?.id !== null
          ? String(participant.id)
          : '';
      const fallbackName =
        participant?.name ?? participant?.displayName ?? participant?.participantName ?? '';
      const rawName = String(fallbackName);

      return {
        id: rawId.trim(),
        name: rawName.trim(),
        muted: Boolean(participant?.muted),
      };
    })
    .map((participant) => ({
      id: participant.id || participant.name,
      name: participant.name,
      muted: participant.muted,
    }))
    .sort((a, b) => {
      const leftKey = (a.id || a.name || '').toLowerCase();
      const rightKey = (b.id || b.name || '').toLowerCase();
      return leftKey.localeCompare(rightKey);
    });
};

const areParticipantSnapshotsEqual = (
  previous: ParticipantSnapshot[],
  next: ParticipantSnapshot[],
): boolean => {
  if (previous.length !== next.length) {
    return false;
  }

  for (let index = 0; index < previous.length; index += 1) {
    const prev = previous[index];
    const curr = next[index];

    if (prev.id !== curr.id || prev.name !== curr.name || prev.muted !== curr.muted) {
      return false;
    }
  }

  return true;
};

interface MediaSFURoomDisplayProps {
  roomName: string;
  callId?: string;
  participantName?: string;
  isConnected?: boolean;
  onConnectionChange?: (connected: boolean) => void;
  onMicrophoneChange?: (enabled: boolean) => void;
  onDisconnect?: (reason?: { type: 'user' | 'room-ended' | 'socket-error', details?: string }) => void;
  onEndCall?: (callId: string) => void;
  autoJoin?: boolean;
  isOutgoingCallSetup?: boolean;
  onRoomNameUpdate?: (realRoomName: string) => void;
  currentCall?: any;
  duration?: number;
  onParticipantsUpdate?: (participants: ParticipantSnapshot[]) => void;
}

interface MediaSFUState {
  isConnected: boolean;
  isMicEnabled: boolean;
  isAudioEnabled: boolean;
  audioLevel: number;
  participants: any[];
  roomAudio: any[];
  roomStatus: string;
  alertMessage: string;
  isPlayToAll: boolean;
  currentCallData?: any;
}

const MediaSFURoomDisplay: React.FC<MediaSFURoomDisplayProps> = ({
  roomName,
  callId,
  participantName = 'voipuser',
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isConnected = false,
  onConnectionChange,
  onMicrophoneChange,
  onDisconnect,
  onEndCall,
  autoJoin = true,
  isOutgoingCallSetup = false,
  onRoomNameUpdate,
  currentCall,
  duration = 30,
  onParticipantsUpdate,
}) => {
  const [roomState, setRoomState] = useState<MediaSFUState>({
    isConnected: false,
    isMicEnabled: false,
    isAudioEnabled: true,
    audioLevel: 0,
    participants: [],
    roomAudio: [],
    roomStatus: 'active',
    alertMessage: '',
    isPlayToAll: false,
    currentCallData: null,
  });

  const [sourceChanged, setSourceChanged] = useState(0);
  const [showRoomAudio, setShowRoomAudio] = useState(true);
  const [isOnHold, setIsOnHold] = useState(false);
  const [showAdvancedControls, setShowAdvancedControls] = useState(false);
  const [isPlayToAllLoading, setIsPlayToAllLoading] = useState(false);
  const [isHoldLoading, setIsHoldLoading] = useState(false);
  const [isAgentLoading, setIsAgentLoading] = useState(false);
  const [isEndCallLoading, setIsEndCallLoading] = useState(false);
  const [isTakeControlLoading, setIsTakeControlLoading] = useState(false);
  const [isSmartSwitchLoading, setIsSmartSwitchLoading] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [showHoldModal, setShowHoldModal] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [confirmationConfig, setConfirmationConfig] = useState<{
    title: string;
    message: string;
    type: 'warning' | 'danger' | 'info';
    onConfirm: () => void;
  } | null>(null);
  const [hasHumanControl, setHasHumanControl] = useState(false);
  const sourceParameters = useRef<Record<string, any>>({});
  const previousParamsRef = useRef<Record<string, any>>({});

  // (moved) confirmCloseRoom is defined after handleDisconnect to avoid TDZ

  // Inline notification banner (non-blocking, web-friendly)
  const [banner, setBanner] = useState<{
    title: string;
    message?: string;
    type: 'success' | 'error' | 'info' | 'warning';
    id?: string;
  } | null>(null);
  const [bannerVisible, setBannerVisible] = useState(false);
  const bannerTimeoutRef = useRef<any>(null);
  const lastBannerIdRef = useRef<string | null>(null);

  const hideNotification = useCallback(() => {
    setBannerVisible(false);
    if (bannerTimeoutRef.current) {
      clearTimeout(bannerTimeoutRef.current);
      bannerTimeoutRef.current = null;
    }
  }, []);

  const showNotification = useCallback((
    title: string,
    message: string,
    type: 'success' | 'error' | 'info' | 'warning' = 'info',
    id?: string,
    durationMs: number = 3500
  ) => {
    if (id && lastBannerIdRef.current === id && bannerVisible) {
      return; // de-dupe same visible id
    }
    if (bannerTimeoutRef.current) {
      clearTimeout(bannerTimeoutRef.current);
      bannerTimeoutRef.current = null;
    }
    setBanner({ title, message, type, id });
    setBannerVisible(true);
    if (id) {lastBannerIdRef.current = id;}
    bannerTimeoutRef.current = setTimeout(() => {
      setBannerVisible(false);
      bannerTimeoutRef.current = null;
    }, durationMs);
  }, [bannerVisible]);

  // Cross-platform notify helpers
  const notifySuccess = useCallback((message: string, title: string = 'Success') => {
    showNotification(title, message, 'success');
  }, [showNotification]);

  const notifyInfo = useCallback((message: string, title: string = 'Info') => {
    showNotification(title, message, 'info');
  }, [showNotification]);

  const notifyError = useCallback((message: string, title: string = 'Error') => {
    if (Platform.OS === 'web') {
      showNotification(title, message, 'error');
    } else {
      Alert.alert(title, message);
    }
  }, [showNotification]);

  // Fetch current call data including activeMediaSource
  const fetchCallData = useCallback(async () => {
    if (!callId || !callId.startsWith('prod')) {
      return null;
    }

    try {
      const result = await callService.getCallStats();
      if (result.success && result.data) {
        const callData = {
          activeMediaSource: 'none', // Default fallback
          status: 'active',
          onHold: false,
          durationSeconds: 0,
          calledUri: '',
          callerIdRaw: '',
          direction: 'outgoing',
        };

        setRoomState(prev => ({ ...prev, currentCallData: callData }));
        return callData;
      }
  } catch {
    roomLogger.error('Error fetching call data');
    }
    return null;
  }, [callId]);

  // Agent detection functions
  const hasAgentInRoom = useCallback(() => {
    if (!roomState.participants || roomState.participants.length === 0) {
      return false;
    }
    return roomState.participants.some((participant: any) => {
      const id = (participant.id || '').toLowerCase();
      return id.startsWith('sip_') && id.endsWith('_agent');
    });
  }, [roomState.participants]);

  const isActiveMediaSourceAgent = useCallback(() => {
    const activeSource = roomState.currentCallData?.activeMediaSource?.toLowerCase();
    if (activeSource === 'agent') {
      return true;
    }

    if (!roomState.participants || roomState.participants.length === 0) {
      return false;
    }

    const activeParticipant = roomState.participants.find((participant: any) => {
      const hasActiveMic = participant.muted === false;
      const hasActiveStream = participant.audioID && !participant.muted;
      return (hasActiveMic || hasActiveStream) && participant.id.startsWith('sip_') && participant.id.endsWith('_agent');
    });

    if (activeParticipant) {
      const id = (activeParticipant.id || '').toLowerCase();
      return id.startsWith('sip_') && id.endsWith('_agent');
    }

    if (roomState.participants.length === 1) {
      const singleParticipant = roomState.participants[0];
      const id = (singleParticipant.id || '').toLowerCase();
      return id.startsWith('sip_') && id.endsWith('_agent');
    }

    if (roomState.currentCallData?.direction === 'outgoing') {
      if (!activeSource || (activeSource && activeSource !== 'human') || (activeSource === 'human' && !roomState.currentCallData?.humanName)) {
        if (!isOutgoingCallSetup) {
          return true;
        }
      }
    }

    return false;
  }, [roomState.participants, roomState.currentCallData, isOutgoingCallSetup]);

  const getAgentStatus = useCallback(() => {
    const activeSource = roomState.currentCallData?.activeMediaSource?.toLowerCase();

    if (!activeSource || activeSource === 'none') {
      return 'stopped';
    } else if (activeSource === 'agent') {
      return 'active';
    } else if (activeSource === 'human') {
      return 'paused';
    }

    return 'unknown';
  }, [roomState.currentCallData]);

  const shouldShowStartAgent = useCallback(() => {
    const agentStatus = getAgentStatus();
    return agentStatus === 'stopped';
  }, [getAgentStatus]);

  const shouldShowStopAgent = useCallback(() => {
    const agentStatus = getAgentStatus();
    return agentStatus === 'active' || agentStatus === 'paused';
  }, [getAgentStatus]);

  const agentInRoom = hasAgentInRoom();
  const activeSourceIsAgent = isActiveMediaSourceAgent();
  const canControlAgent = !!callId;

  // Fetch call data periodically
  useEffect(() => {
    if (!callId) {return;}

    fetchCallData();
    const interval = setInterval(fetchCallData, 2000);
    return () => clearInterval(interval);
  }, [callId, fetchCallData]);

  // Continuous sourceParameters monitoring for outgoing room setup
  useEffect(() => {
    if (!isOutgoingCallSetup || (callId && callId.trim())) {return;}

    const monitorSourceParameters = () => {
      const params = sourceParameters.current;

      if (Object.keys(params).length > 0) {
        const isValidRoom = !!(params.roomName && params.roomName.trim());

        if (isValidRoom) {
          const hasSocket = !!(params.socket || params.localSocket);
          const hasValidConnection = hasSocket && isValidRoom;
          const hasParticipants = params.participants && params.participants.length > 0;
          const noFailureMessage = !params.alertMessage ||
                                   (!params.alertMessage.includes('ended') &&
                                    !params.alertMessage.includes('failed') &&
                                    !params.alertMessage.includes('error'));

          const connected = isValidRoom && (hasSocket || hasValidConnection || hasParticipants) && noFailureMessage;

          if (params.roomName !== roomName && onRoomNameUpdate) {
            onRoomNameUpdate(params.roomName);
          }

          // Optimized state update for outgoing call setup
          setRoomState(prev => ({
            ...prev,
            isConnected: connected,
            isMicEnabled: params.audioAlreadyOn || false,
            audioLevel: params.audioLevel || 0,
            participants: params.participants || [],
            roomAudio: params.audioOnlyStreams || [],
            roomStatus: '',
            alertMessage: params.alertMessage || '',
          }));

          const shouldDisconnect =
            !isValidRoom ||
            !hasSocket ||
            (params.alertMessage &&
             (params.alertMessage.includes('meeting has ended') ||
              params.alertMessage.includes('ended') ||
              params.alertMessage.includes('disconnected') ||
              params.alertMessage.includes('room not found') ||
              params.alertMessage.includes('invalid room')));

          if (shouldDisconnect) {
            let disconnectReason: { type: 'user' | 'room-ended' | 'socket-error', details?: string };

            if (params.alertMessage && params.alertMessage.includes('meeting has ended')) {
              disconnectReason = { type: 'room-ended', details: `Room ended: ${params.alertMessage}` };
            } else if (params.alertMessage && params.alertMessage.includes('disconnected')) {
              disconnectReason = { type: 'socket-error', details: `Connection lost: ${params.alertMessage}` };
            } else if (params.alertMessage &&
                      (params.alertMessage.includes('room not found') || params.alertMessage.includes('invalid room'))) {
              disconnectReason = { type: 'room-ended', details: `Room invalid: ${params.alertMessage}` };
            } else if (!hasSocket) {
              disconnectReason = { type: 'socket-error', details: 'Socket disconnected' };
            } else {
              disconnectReason = { type: 'room-ended', details: 'Room ended: Unknown reason' };
            }

            setTimeout(() => {
              roomLogger.info('Executing onDisconnect callback for closed outgoing room with reason:', disconnectReason);
              onDisconnect?.(disconnectReason);
            }, 100);
          }
        }
      }
    };

    monitorSourceParameters();
    const monitoringInterval = setInterval(monitorSourceParameters, 5000);

    return () => {
      clearInterval(monitoringInterval);
    };
  }, [isOutgoingCallSetup, callId, roomName, onDisconnect, onRoomNameUpdate]);

  // Update sourceParameters and trigger re-render
  const updateSourceParameters = useCallback((params: Record<string, any>) => {
    if (params !== sourceParameters.current) {
      // Debug: Log what MediaSFU is providing
      roomLogger.info('MediaSFU sourceParameters updated:', {
        hasSocket: !!(params.socket || params.localSocket),
        hasParticipants: !!(params.participants && params.participants.length > 0),
        participantCount: params.participants?.length || 0,
        roomName: params.roomName,
        alertMessage: params.alertMessage,
        audioAlreadyOn: params.audioAlreadyOn,
        socketType: params.socket ? 'socket' : params.localSocket ? 'localSocket' : 'none',
        keys: Object.keys(params).join(', '),
      });

      sourceParameters.current = params;
      setTimeout(() => {
        setSourceChanged((prev) => prev + 1);
      }, 0);
    }
  }, []);

  // Handle sourceParameters changes with enhanced room validation and optimized updates
  useEffect(() => {
    if (Object.keys(sourceParameters.current).length > 0) {
      const params = sourceParameters.current;
      const previousParams = previousParamsRef.current;

      const isValidRoom = !!(params.roomName && params.roomName.trim());

      if (isValidRoom && params.roomName !== roomName && params.roomName.trim() !== roomName.trim()) {
        setTimeout(() => {
          onRoomNameUpdate?.(params.roomName);
        }, 0);
      }

      const hasSocket = !!(params.socket || params.localSocket);
  // const hasValidConnection = hasSocket && isValidRoom;
      const hasParticipants = params.participants && params.participants.length > 0;
      const noFailureMessage = !params.alertMessage ||
                               (!params.alertMessage.includes('ended') &&
                                !params.alertMessage.includes('failed') &&
                                !params.alertMessage.includes('error'));

      // More nuanced connection logic
      let connected = false;

      if (isValidRoom && noFailureMessage) {
        if (isOutgoingCallSetup) {
          // For outgoing call setup, we're connected if we have a valid room and socket
          connected = hasSocket;
        } else {
          // For regular rooms, we're connected if we have a socket OR participants
          connected = hasSocket || hasParticipants;
        }
      }

      // Debug logging to understand why connection might be failing
      if (!connected) {
        roomLogger.warn('Connection failed - debugging conditions:', {
          isValidRoom,
          hasSocket,
          hasParticipants,
          noFailureMessage,
          roomName: params.roomName,
          socketExists: !!(params.socket),
          localSocketExists: !!(params.localSocket),
          participantCount: params.participants?.length || 0,
          alertMessage: params.alertMessage,
          callId,
          isOutgoingCallSetup,
          connectionLogic: isOutgoingCallSetup ? 'outgoing (needs socket)' : 'regular (needs socket OR participants)',
        });
      } else {
        roomLogger.info('Connection successful:', {
          isValidRoom,
          hasSocket,
          hasParticipants,
          noFailureMessage,
          connectionType: isOutgoingCallSetup ? 'outgoing call setup' : 'regular room',
        });
      }

      const normalizedParticipants = normalizeParticipants(params.participants || []);
      const previousNormalizedParticipants = normalizeParticipants(previousParams.participants || []);
      const participantsChanged = !areParticipantSnapshotsEqual(
        previousNormalizedParticipants,
        normalizedParticipants,
      );

      // Optimized state updates - avoid setTimeout for better performance
      setRoomState(prev => {
        const updates: Partial<typeof prev> = {};

        if (connected !== prev.isConnected) {
          updates.isConnected = connected;
        }

        if ((params.audioAlreadyOn || false) !== prev.isMicEnabled) {
          updates.isMicEnabled = params.audioAlreadyOn || false;
        }

        if (params.audioLevel !== undefined &&
            params.audioLevel !== (previousParams.audioLevel)) {
          updates.audioLevel = params.audioLevel || 0;
        }

        if (params.audioOnlyStreams !== previousParams.audioOnlyStreams) {
          updates.roomAudio = params.audioOnlyStreams || [];
        }

        if (participantsChanged) {
          updates.participants = params.participants || [];
        }

        const currentRoomStatus = (hasSocket && isValidRoom) ? 'active' : '';
        if (currentRoomStatus !== prev.roomStatus) {
          updates.roomStatus = currentRoomStatus;
        }

        if ((params.alertMessage || '') !== prev.alertMessage) {
          updates.alertMessage = params.alertMessage || '';
        }

        return Object.keys(updates).length > 0 ? { ...prev, ...updates } : prev;
      });

      if (participantsChanged) {
        onParticipantsUpdate?.(normalizedParticipants);
      }

      previousParamsRef.current = params;

      if (connected !== roomState.isConnected) {
        setTimeout(() => onConnectionChange?.(connected), 0);
      }

      const micEnabled = params.audioAlreadyOn || false;
      if (micEnabled !== roomState.isMicEnabled) {
        setTimeout(() => onMicrophoneChange?.(micEnabled), 0);
      }

      const shouldDisconnect =
        !isValidRoom ||
        (params.alertMessage &&
         (params.alertMessage.includes('meeting has ended') ||
          params.alertMessage.includes('ended') ||
          params.alertMessage.includes('disconnected') ||
          params.alertMessage.includes('room not found') ||
          params.alertMessage.includes('invalid room')));

      if (shouldDisconnect) {
        let disconnectReason: { type: 'user' | 'room-ended' | 'socket-error', details?: string };

        if (params.alertMessage && params.alertMessage.includes('meeting has ended')) {
          disconnectReason = { type: 'room-ended', details: `Room ended: ${params.alertMessage}` };
        } else if (params.alertMessage && params.alertMessage.includes('disconnected')) {
          disconnectReason = { type: 'socket-error', details: `Connection lost: ${params.alertMessage}` };
        } else if (params.alertMessage &&
                  (params.alertMessage.includes('room not found') || params.alertMessage.includes('invalid room'))) {
          disconnectReason = { type: 'room-ended', details: `Room invalid: ${params.alertMessage}` };
        } else if (!isValidRoom) {
          disconnectReason = { type: 'room-ended', details: 'Invalid room name detected' };
        } else {
          disconnectReason = { type: 'room-ended', details: `Room ended: ${params.alertMessage || 'Unknown reason'}` };
        }

        setTimeout(() => {
          onDisconnect?.(disconnectReason);
        }, 0);
      }
    }
  }, [
    sourceChanged,
    roomState.isConnected,
    onConnectionChange,
    onMicrophoneChange,
    onDisconnect,
    roomState.isMicEnabled,
    onRoomNameUpdate,
    roomName,
    isOutgoingCallSetup,
    callId,
    onParticipantsUpdate,
  ]);

  // Sync hasHumanControl with activeSourceIsAgent state
  useEffect(() => {
    if (activeSourceIsAgent) {
      setTimeout(() => {
        setHasHumanControl(false);
      }, 0);
    } else if (agentInRoom && roomState.isConnected) {
      setTimeout(() => {
        setHasHumanControl(true);
      }, 0);
    } else {
      setTimeout(() => {
        setHasHumanControl(false);
      }, 0);
    }
  }, [activeSourceIsAgent, agentInRoom, roomState.isConnected]);

  // Connection timeout effect
  useEffect(() => {
    if (!roomState.isConnected && autoJoin && isOutgoingCallSetup) {
      const connectionTimeout = setTimeout(() => {
        onDisconnect?.({
          type: 'socket-error',
          details: 'Connection timeout - room creation took too long',
        });
      }, 30000);

      return () => clearTimeout(connectionTimeout);
    }
  }, [roomState.isConnected, autoJoin, isOutgoingCallSetup, onDisconnect]);

  // Toggle microphone using MediaSFU's audio toggle
  const toggleMicrophone = useCallback(async () => {
    if (Object.keys(sourceParameters.current).length === 0) {
      notifyError('Cannot toggle microphone: Not connected to MediaSFU room');
      return;
    }

    try {
      // Use MediaSFU's built-in audio toggle functionality
      if (sourceParameters.current.clickAudio) {
        await sourceParameters.current.clickAudio({
          parameters: sourceParameters.current,
        });
      } else {
        notifyInfo('Audio toggle not available - please use MediaSFU interface');
      }
    } catch {
      notifyError('Failed to toggle microphone');
    }
  }, [notifyError, notifyInfo]);

  // Toggle room audio
  const toggleRoomAudio = useCallback(() => {
    setShowRoomAudio(prev => !prev);
  }, []);

  // Hold/resume call functionality
  const toggleHold = useCallback(async () => {
    if (!callId) {
      notifyError('Call ID is required for SIP operations');
      return;
    }

    if (isOnHold) {
      setIsHoldLoading(true);
      try {
        const result = await callService.unholdCall(callId);
        if (result.success) {
          setIsOnHold(false);
        } else {
          notifyError('Failed to resume call');
        }
      } catch {
        notifyError('Error resuming call');
      } finally {
        setIsHoldLoading(false);
      }
    } else {
      setShowHoldModal(true);
    }
  }, [isOnHold, callId, notifyError]);

  // Handle hold with options from modal
  const handleHoldWithOptions = useCallback(async (message: string, pauseRecording: boolean) => {
    setIsHoldLoading(true);
    setShowHoldModal(false);

    try {
      const result = await callService.holdCall(callId!, message, pauseRecording);
      if (result.success) {
        setIsOnHold(true);
        notifySuccess('Call placed on hold');
      } else {
        notifyError('Failed to hold call');
      }
    } catch {
      notifyError('Error holding call');
    } finally {
      setIsHoldLoading(false);
    }
  }, [callId, notifyError, notifySuccess]);

  // Agent control functions
  const handleSwitchToAgent = useCallback(async () => {
    if (!callId) {return;}

    try {
      setIsSmartSwitchLoading(true);
      const result = await callService.switchSource(callId, 'agent');

      if (result.success) {
        setHasHumanControl(false);
        // Optimistically update currentCallData for immediate UI feedback
        setRoomState(prev => ({
          ...prev,
          currentCallData: {
            ...(prev.currentCallData || {}),
            activeMediaSource: 'agent',
          },
        }));
        notifySuccess('Switched to agent control');
      } else {
        notifyError(result.error || 'Failed to switch to agent');
      }
    } catch {
      notifyError('Error switching to agent');
    } finally {
      setIsSmartSwitchLoading(false);
    }
  }, [callId, notifyError, notifySuccess]);

  const handleStartAgent = useCallback(async () => {
    if (!callId) {return;}

    setIsAgentLoading(true);
    try {
      const result = await callService.startAgent(callId);

      if (result.success) {
        // Optimistically reflect agent as active
        setRoomState(prev => ({
          ...prev,
          currentCallData: {
            ...(prev.currentCallData || {}),
            activeMediaSource: 'agent',
          },
        }));
        notifySuccess('Agent started successfully');
      } else {
        notifyError(result.error || 'Failed to start agent');
      }
    } catch {
      notifyError('Error starting agent');
    } finally {
      setIsAgentLoading(false);
    }
  }, [callId, notifyError, notifySuccess]);

  const handleStopAgent = useCallback(async () => {
    if (!callId) {return;}

    setIsAgentLoading(true);
    try {
      const result = await callService.stopAgent(callId);

      if (result.success) {
        // Optimistically reflect agent as stopped; fall back to 'none' or 'human' based on mic state
        setRoomState(prev => ({
          ...prev,
          currentCallData: {
            ...(prev.currentCallData || {}),
            activeMediaSource: prev.isMicEnabled ? 'human' : 'none',
          },
        }));
        notifySuccess('Agent stopped successfully');
      } else {
        notifyError(result.error || 'Failed to stop agent');
      }
    } catch {
      notifyError('Error stopping agent');
    } finally {
      setIsAgentLoading(false);
    }
  }, [callId, notifyError, notifySuccess]);

  // Get current human participant name
  const getCurrentHumanParticipantName = useCallback(() => {
    if (roomState.participants && roomState.participants.length > 0) {
      const ourParticipant = roomState.participants.find((participant: any) => {
        const id = (participant.id || '').toLowerCase();
        return !id.startsWith('sip_') && participant.name === participantName;
      });

      if (ourParticipant) {
        return ourParticipant.name;
      }

      const humanParticipants = roomState.participants.filter((participant: any) => {
        const id = (participant.id || '').toLowerCase();
        return !id.startsWith('sip_');
      });

      if (humanParticipants.length === 1) {
        return humanParticipants[0].name || participantName;
      }
    }

    return participantName;
  }, [roomState.participants, participantName]);

  // Take control flow
  const handleTakeControl = useCallback(async () => {
    if (!callId) {return;}

    const performSwitch = async () => {
      try {
        const humanName = getCurrentHumanParticipantName();
        const result = await callService.switchSource(callId, 'human', humanName);

        if (result.success) {
          setHasHumanControl(true);
          // Optimistically update currentCallData for immediate UI feedback
          setRoomState(prev => ({
            ...prev,
            currentCallData: {
              ...(prev.currentCallData || {}),
              activeMediaSource: 'human',
              humanName,
            },
          }));
          notifySuccess('You now have control of the conversation');
        } else {
          notifyError(result.error || 'Failed to take control');
        }
      } catch {
        notifyError('Error taking control');
      }
    };

    try {
      setIsTakeControlLoading(true);
      if (!roomState.isMicEnabled) {
        setConfirmationConfig({
          title: 'Unmute Microphone',
          message: 'Your microphone is currently muted. Would you like to unmute it before taking control of the conversation?',
          type: 'warning',
          onConfirm: async () => {
            // Close the confirmation before proceeding
            setShowConfirmation(false);
            setConfirmationConfig(null);
            await toggleMicrophone();
            await new Promise(resolve => setTimeout(resolve, 500));
            await performSwitch();
          },
        });
        setShowConfirmation(true);
        return;
      }

      await performSwitch();
    } catch {
      notifyError('Error in take control flow');
    } finally {
      setIsTakeControlLoading(false);
    }
  }, [callId, roomState.isMicEnabled, getCurrentHumanParticipantName, toggleMicrophone, notifyError, notifySuccess]);

  // Smart source switching (currently unused)
  // const handleSmartSourceSwitch = useCallback(async () => {
  //   if (!callId) return;
  //   try {
  //     if (activeSourceIsAgent) {
  //       await handleTakeControl();
  //     } else if (agentInRoom) {
  //       await handleSwitchToAgent();
  //     } else {
  //       await handleStartAgent();
  //     }
  //   } catch {
  //     Alert.alert('Error', 'Error in smart source switch');
  //   }
  // }, [callId, activeSourceIsAgent, agentInRoom, handleTakeControl, handleSwitchToAgent, handleStartAgent]);

  // Handle play to all toggle
  const handlePlayToAllToggle = useCallback(async () => {
    if (!callId) {return;}

    setIsPlayToAllLoading(true);
    try {
      const newPlayToAll = !roomState.isPlayToAll;
      const result = await callService.updatePlayToAll(callId, newPlayToAll);

      if (result.success) {
        setRoomState(prev => ({ ...prev, isPlayToAll: newPlayToAll }));
        notifySuccess(`Bot audio will now play to ${newPlayToAll ? 'ALL participants' : 'caller only'}`);
      } else {
        notifyError(result.error || 'Failed to update play to all setting');
      }
    } catch {
      notifyError('Error updating play to all');
    } finally {
      setIsPlayToAllLoading(false);
    }
  }, [callId, roomState.isPlayToAll, notifyError, notifySuccess]);

  // End call
  const handleEndCall = useCallback(async () => {
    // Immediate end call with visual feedback and no confirmation
    if (!callId) {
      notifyError('Cannot end call: No call ID available');
      return;
    }

    setIsEndCallLoading(true);
    try {
      if (onEndCall) {
        await Promise.resolve(onEndCall(callId));
      } else {
  roomLogger.warn('No onEndCall handler provided');
      }
    } catch {
      notifyError('Error ending call');
    } finally {
      setIsEndCallLoading(false);
    }
  }, [callId, onEndCall, notifyError]);

  // Disconnect from room
  const handleDisconnect = useCallback(async () => {
    try {
      setIsDisconnecting(true);
      // Use MediaSFU's built-in disconnect functionality if available
      if (sourceParameters.current.localSocket) {
        sourceParameters.current.localSocket.disconnect();
      }

      onDisconnect?.({ type: 'user', details: 'User manually disconnected from room' });
    } catch {
      notifyError('Error disconnecting from room');
    } finally {
      setIsDisconnecting(false);
    }
  }, [onDisconnect, notifyError]);

  // Centralized confirm helper for closing/leaving room
  const confirmCloseRoom = useCallback(() => {
    const title = isOutgoingCallSetup ? 'Close Voice Room' : 'Leave Voice Room';
    const message = (callId || currentCall)
      ? 'Closing this room may end any active calls. Are you sure you want to continue?'
      : 'Are you sure you want to close this voice room? You can create a new one anytime.';

    setConfirmationConfig({
      title,
      message,
      type: 'danger',
      onConfirm: () => {
        // Close modal then disconnect
        setShowConfirmation(false);
        setConfirmationConfig(null);
        handleDisconnect();
      },
    });
    setShowConfirmation(true);
  }, [isOutgoingCallSetup, callId, currentCall, handleDisconnect]);

  // Responsive control button component
  const ControlButton = ({
    icon,
    label,
    onPress,
    isActive = false,
    isLoading = false,
    style = {},
    disabled = false,
    color = '#007bff',
  }: {
    icon: string;
    label: string;
    onPress: () => void;
    isActive?: boolean;
    isLoading?: boolean;
    style?: any;
    disabled?: boolean;
    color?: string;
  }) => (
    <TouchableOpacity
      style={[
        styles.controlButton,
        isActive && styles.controlButtonActive,
        disabled && !isActive && styles.controlButtonDisabled, // Only apply disabled style if not active
        style,
        { opacity: isLoading || (disabled && !isActive) ? 0.6 : 1 }, // Maintain full opacity for active disabled buttons
      ]}
      onPress={onPress}
      disabled={isLoading || disabled}
    >
      <Ionicons
        name={icon as any}
        size={isTablet ? 28 : 24}
        color={isActive ? '#ffffff' : color}
      />
      <Text style={[
        styles.controlButtonText,
        isActive && styles.controlButtonTextActive,
        { fontSize: isTablet ? 12 : 10, color: isActive ? '#ffffff' : '#202124' }, // Better contrast
      ]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  // Memoize AdvancedControlsModal props to prevent unnecessary re-renders
  const memoizedParticipants = useMemo(() => roomState.participants, [roomState.participants]);

  const memoizedSourceParameters = useMemo(() => sourceParameters.current, []);

  // Connection screen
  if (!roomState.isConnected && !isOutgoingCallSetup) {
    return (
      <View style={styles.container}>
        <MediaSFUHandler
          action="join"
          duration={duration}
          capacity={5}
          name={participantName}
          meetingID={roomName}
          sourceParameters={sourceParameters.current}
          updateSourceParameters={updateSourceParameters}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Notification Banner */}
      {banner && bannerVisible && (
        <View
          style={{
            position: 'absolute',
            top: 10,
            left: 10,
            right: 10,
            zIndex: 1000,
            borderRadius: 8,
            paddingVertical: 10,
            paddingHorizontal: 12,
            flexDirection: 'row',
            alignItems: 'center',
            shadowColor: '#000',
            shadowOpacity: 0.18,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 4 },
            elevation: 4,
            backgroundColor:
              banner.type === 'success' ? '#16a34a' :
              banner.type === 'error' ? '#dc2626' :
              banner.type === 'warning' ? '#d97706' : '#2563eb',
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>{banner.title}</Text>
            {!!banner.message && (
              <Text style={{ color: '#fff', opacity: 0.95, marginTop: 2 }}>{banner.message}</Text>
            )}
          </View>
          <TouchableOpacity onPress={hideNotification} accessibilityRole="button" style={{ padding: 4, marginLeft: 8 }}>
            <Ionicons name="close" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      )}
      <MediaSFUHandler
        action={isOutgoingCallSetup && !callId ? 'create' : 'join'}
        meetingID={roomName}
        name={participantName}
        duration={duration}
        sourceParameters={sourceParameters.current}
        updateSourceParameters={updateSourceParameters}
      />

      {/* Room Header */}
      <View style={styles.roomHeader}>
        <View style={styles.roomHeaderTop}>
          <Text style={styles.roomTitle}>MediaSFU Room</Text>
          <Text style={styles.roomName}>{roomName}</Text>
        </View>

        {/* Connection Status and Participants Info */}
        <View style={styles.roomHeaderInfo}>
          <View style={[
            styles.connectionStatus,
            roomState.isConnected ? styles.connected : {},
          ]}>
            <Text style={styles.connectionStatusText}>
              {roomState.isConnected ? '🟢 Connected' : '🔴 Connecting...'}
            </Text>
          </View>

          {roomState.isConnected && roomState.participants.length > 0 && (
            <View style={[
              styles.participantsRow,
              roomState.participants.some(p => p.name?.includes('agent') || p.name?.includes('sip')) && styles.hasAgent,
            ]}>
              <Text style={styles.participantsCount}>
                👥 {roomState.participants.length}:
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.participantsList}
                contentContainerStyle={styles.participantsListContent}
              >
                {roomState.participants.map((participant, index) => (
                  <View key={participant.id || index} style={styles.participantChip}>
                    <Text style={styles.participantName} numberOfLines={1}>
                      {participant.name || participant.id || `User ${index + 1}`}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}
        </View>

        {/* Outgoing Call Setup Information */}
        {isOutgoingCallSetup && (
          <View style={[
            styles.outgoingCallSetupInfo,
            !roomState.isConnected && !currentCall && styles.disconnected,
          ]}>
            {currentCall ? (
              <View style={styles.setupInfoRow}>
                <Text style={[styles.setupMessage, styles.successMessage]}>📞 Ready</Text>
                <Text style={styles.setupInstructions}>
                  {roomState.isMicEnabled ? '🎤 Can call' : '🔇 Enable mic'}
                </Text>
              </View>
            ) : !roomState.isConnected ? (
              <View style={styles.setupInfoRow}>
                <Text style={[styles.setupMessage, styles.errorMessage]}>🔴 Disconnected</Text>
                <Text style={styles.setupInstructions}>Create new room</Text>
              </View>
            ) : (
              <View style={styles.setupInfoRow}>
                <Text style={[styles.setupMessage, styles.successMessage]}>📞 Voice Room</Text>
                <Text style={styles.setupInstructions}>
                  {roomState.isMicEnabled ? '🎤 Ready' : '🔇 Enable mic'}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Room Controls */}
      <ScrollView style={styles.controlsContainer} showsVerticalScrollIndicator={false}>
        {/* Primary Controls */}
        <View style={styles.primaryControls}>
          <ControlButton
            icon={roomState.isMicEnabled ? 'mic' : 'mic-off'}
            label={roomState.isMicEnabled ? 'Mute' : 'Unmute'}
            onPress={toggleMicrophone}
            isActive={roomState.isMicEnabled}
            disabled={!roomState.isConnected}
            color={roomState.isMicEnabled ? '#28a745' : '#dc3545'}
          />

          {callId ? (
            <>
              <ControlButton
                icon="call"
                label={isEndCallLoading ? 'Ending…' : 'End Call'}
                onPress={handleEndCall}
                isLoading={isEndCallLoading}
                disabled={isEndCallLoading}
                color="#dc3545"
                style={styles.endCallButton}
              />

              <ControlButton
                icon={isOnHold ? 'play' : 'pause'}
                label={isOnHold ? 'Resume' : 'Hold'}
                onPress={toggleHold}
                isActive={isOnHold}
                isLoading={isHoldLoading}
                disabled={!roomState.isConnected}
                color="#ffc107"
              />

              {!isOutgoingCallSetup && (
                <ControlButton
                  icon="exit"
                  label={isDisconnecting ? 'Leaving…' : 'Leave Room'}
                  onPress={handleDisconnect}
                  isLoading={isDisconnecting}
                  disabled={!roomState.isConnected || isDisconnecting}
                  color="#5f6368" // Better contrast gray
                />
              )}

              {isOutgoingCallSetup && (
                <ControlButton
                  icon="close"
                  label={isDisconnecting ? 'Closing…' : 'Close Room'}
                  onPress={confirmCloseRoom}
                  isLoading={isDisconnecting}
                  color="#dc3545"
                />
              )}
            </>
          ) : (
            !isOutgoingCallSetup ? (
              <ControlButton
                icon="close"
                label="Close Room"
                onPress={handleDisconnect}
                disabled={!roomState.isConnected}
                color="#dc3545"
              />
            ) : (
              <ControlButton
                icon="close"
                label="Close Room"
                onPress={confirmCloseRoom}
                color="#dc3545"
              />
            )
          )}
        </View>

        {/* Secondary Controls - SIP call features */}
        {callId && (
          <View style={styles.secondaryControls}>
            <ControlButton
              icon="settings"
              label={showAdvancedControls ? 'Hide Advanced' : 'Advanced'}
              onPress={() => setShowAdvancedControls(prev => !prev)}
              isActive={showAdvancedControls}
              disabled={!roomState.isConnected}
              color="#6610f2"
            />

            {(activeSourceIsAgent || hasHumanControl) && (
              <ControlButton
                icon="person"
                label={hasHumanControl ? 'You Have Control' : (isTakeControlLoading ? 'Taking…' : 'Take Control')}
                onPress={hasHumanControl ? () => {} : handleTakeControl}
                isActive={hasHumanControl}
                isLoading={isTakeControlLoading}
                disabled={!roomState.isConnected || !canControlAgent || hasHumanControl || isTakeControlLoading}
                color={hasHumanControl ? '#28a745' : '#FFA500'}
              />
            )}

            {(!activeSourceIsAgent && agentInRoom) && (
              <ControlButton
                icon="logo-android"
                  label={isSmartSwitchLoading ? 'Switching…' : 'To Agent'}
                onPress={handleSwitchToAgent}
                  isLoading={isSmartSwitchLoading}
                  disabled={!roomState.isConnected || !canControlAgent || isSmartSwitchLoading}
                color="#20c997"
              />
            )}

            {agentInRoom && shouldShowStartAgent() && (
              <ControlButton
                icon="play"
                label="Start Agent"
                onPress={handleStartAgent}
                isLoading={isAgentLoading}
                disabled={!roomState.isConnected || !canControlAgent}
                color="#28a745"
              />
            )}

            {agentInRoom && shouldShowStopAgent() && (
              <ControlButton
                icon="stop"
                label="Stop Agent"
                onPress={handleStopAgent}
                isLoading={isAgentLoading}
                disabled={!roomState.isConnected || !canControlAgent}
                color="#dc3545"
              />
            )}

            <ControlButton
              icon={roomState.isPlayToAll ? 'volume-high' : 'volume-low'}
              label={roomState.isPlayToAll ? 'Bot Audio: To ALL' : 'Bot Audio: Caller Only'}
              onPress={handlePlayToAllToggle}
              isActive={roomState.isPlayToAll}
              isLoading={isPlayToAllLoading}
              disabled={!roomState.isConnected}
              color={roomState.isPlayToAll ? '#4CAF50' : '#ffc107'}
            />
          </View>
        )}

        {/* Audio Controls */}
        <View style={styles.audioControls}>
          <ControlButton
            icon={showRoomAudio ? 'volume-high' : 'volume-mute'}
            label="Room Audio"
            onPress={toggleRoomAudio}
            isActive={showRoomAudio}
            color={showRoomAudio ? '#137333' : '#5f6368'} // Better contrast colors
          />
        </View>

        {/* AudioGrid contains all the audio-only streams from MediaSFU */}
        {showRoomAudio && (
          <AudioGrid
            componentsToRender={(roomState.roomAudio as any[]) || []}
          />
        )}

        {/* Status Indicators */}
        <View style={styles.statusIndicators}>
          <View style={styles.micStatus}>
            <Text style={[
              styles.micStatusText,
              { color: roomState.isMicEnabled ? '#28a745' : '#dc3545' },
            ]}>
              {roomState.isMicEnabled ? 'Microphone active' : 'Microphone muted'}
            </Text>
            {roomState.isMicEnabled && (
              <View style={styles.audioLevelMeter}>
                <View
                  style={[
                    styles.audioLevelBar,
                    { width: `${Math.min(roomState.audioLevel * 100, 100)}%` },
                  ]}
                />
              </View>
            )}
          </View>

          {isOnHold && (
            <View style={styles.holdStatus}>
              <Text style={styles.holdIndicator}>⏸️ On Hold</Text>
            </View>
          )}
        </View>

        {/* Advanced Controls Section */}
        {showAdvancedControls && callId && (
          <View style={styles.advancedControlsSection}>
            <View style={styles.advancedControlsHeader}>
              <Text style={styles.advancedControlsTitle}>Advanced SIP Controls</Text>
              {!callId && (
                <Text style={styles.warningMessage}>
                  Call ID required for full SIP functionality
                </Text>
              )}
            </View>

            <View style={styles.advancedControlsSection}>
              <View style={styles.advancedControlsHeader}>
                <Text style={styles.advancedControlsTitle}>Advanced SIP Controls</Text>
                {!callId && (
                  <Text style={styles.warningMessage}>
                    Call ID required for full SIP functionality
                  </Text>
                )}
              </View>

              {callId ? (
                <AdvancedControlsModal
                  callId={callId}
                  participants={memoizedParticipants}
                  sourceParameters={memoizedSourceParameters}
                />
              ) : (
                <Text style={styles.warningMessage}>
                  Advanced controls require an active call
                </Text>
              )}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Hold Options Modal */}
      <Modal
        visible={showHoldModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowHoldModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Hold Call Options</Text>
              <TouchableOpacity onPress={() => setShowHoldModal(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <HoldOptionsModal
              isOpen={showHoldModal}
              onConfirm={handleHoldWithOptions}
              onCancel={() => setShowHoldModal(false)}
            />
          </View>
        </View>
      </Modal>

      {/* Confirmation Modal */}
      {confirmationConfig && (
        <Modal
          visible={showConfirmation}
          transparent
          animationType="fade"
          onRequestClose={() => setShowConfirmation(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.confirmationModal}>
              <Text style={styles.confirmationTitle}>{confirmationConfig.title}</Text>
              <Text style={styles.confirmationMessage}>{confirmationConfig.message}</Text>
              <View style={styles.confirmationButtons}>
                <TouchableOpacity
                  style={styles.confirmationButton}
                  onPress={() => {
                    setShowConfirmation(false);
                    setConfirmationConfig(null);
                  }}
                >
                  <Text style={styles.confirmationButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.confirmationButton, styles.confirmationButtonPrimary]}
                  onPress={confirmationConfig.onConfirm}
                >
                  <Text style={[styles.confirmationButtonText, styles.confirmationButtonTextPrimary]}>
                    Confirm
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
};

// Hold Options Modal Component
interface HoldOptionsModalProps {
  isOpen: boolean;
  onConfirm: (message: string, pauseRecording: boolean) => void;
  onCancel: () => void;
}

const HoldOptionsModal: React.FC<HoldOptionsModalProps> = ({ isOpen, onConfirm, onCancel }) => {
  const [message, setMessage] = useState('');
  const [pauseRecording, setPauseRecording] = useState(true);

  if (!isOpen) {return null;}

  return (
    <View style={styles.holdModalContent}>
      <Text style={styles.holdModalLabel}>Optional Hold Message (to play before hold):</Text>
      <TextInput
        style={styles.holdModalInput}
        value={message}
        onChangeText={setMessage}
        placeholder="Message to play during hold"
        multiline
      />

      <View style={styles.holdModalCheckbox}>
        <TouchableOpacity
          style={styles.checkboxContainer}
          onPress={() => setPauseRecording(!pauseRecording)}
        >
          <Ionicons
            name={pauseRecording ? 'checkbox' : 'square-outline'}
            size={20}
            color="#007bff"
          />
          <Text style={styles.checkboxLabel}>Pause recording during hold</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.holdModalButtons}>
        <TouchableOpacity
          style={[styles.holdModalButton, styles.holdModalButtonSecondary]}
          onPress={onCancel}
        >
          <Text style={styles.holdModalButtonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.holdModalButton, styles.holdModalButtonPrimary]}
          onPress={() => onConfirm(message, pauseRecording)}
        >
          <Text style={[styles.holdModalButtonText, styles.holdModalButtonTextPrimary]}>
            Hold Call
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    maxWidth: isDesktop ? 1200 : '100%',
    alignSelf: 'center',
    width: '100%',
  },
  roomHeader: {
    backgroundColor: '#667eea',
    padding: 16,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  roomTitle: {
    fontSize: isTablet ? 20 : 18,
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 8,
  },
  roomName: {
    fontSize: isTablet ? 16 : 14,
    color: '#ffffff',
    textAlign: 'center',
    opacity: 0.9,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: 'center',
    marginBottom: 5,
  },
  roomHeaderTop: {
    alignItems: 'center',
    marginBottom: 12,
  },
  roomHeaderInfo: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  outgoingCallSetupInfo: {
    backgroundColor: 'rgba(255, 193, 7, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 193, 7, 0.4)',
    borderRadius: 8,
    padding: 8,
    marginVertical: 6,
    alignItems: 'center',
  },
  disconnected: {
    backgroundColor: 'rgba(220, 53, 69, 0.15)',
    borderColor: 'rgba(220, 53, 69, 0.4)',
  },
  setupMessage: {
    fontSize: isTablet ? 16 : 14,
    fontWeight: '600',
    marginBottom: 4,
    color: '#fff3cd',
    textAlign: 'center',
  },
  errorMessage: {
    color: '#f8d7da',
  },
  successMessage: {
    color: '#d4edda',
  },
  setupInstructions: {
    fontSize: isTablet ? 14 : 12,
    opacity: 0.9,
    color: '#fff3cd',
    textAlign: 'center',
    lineHeight: 18,
  },
  setupInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    width: '100%',
  },
  headerStatusRow: {
    alignItems: 'center',
    gap: 10,
  },
  connectionStatus: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'center',
    marginBottom: 10,
  },
  connected: {
    backgroundColor: 'rgba(40, 167, 69, 0.2)',
    borderWidth: 1,
    borderColor: '#28a745',
  },
  connectionStatusText: {
    fontSize: isTablet ? 14 : 12,
    fontWeight: '500',
    color: '#ffffff',
  },
  participantsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
    alignSelf: 'center',
  },
  hasAgent: {
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.5)',
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
  },
  participantsCount: {
    fontSize: isTablet ? 14 : 12,
    fontWeight: '500',
    color: '#ffffff',
  },
  participantsList: {
    flexDirection: 'row',
    flex: 1,
  },
  participantsListContent: {
    paddingHorizontal: 4,
    gap: 6,
  },
  participantChip: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginHorizontal: 2,
  },
  participantName: {
    fontSize: isTablet ? 12 : 10,
    color: '#ffffff',
    fontWeight: '500',
    maxWidth: 80, // Prevent very long names from making chips too wide
  },
  agentParticipant: {
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.3)',
    color: '#4CAF50',
    fontWeight: '600',
  },
  sipParticipant: {
    backgroundColor: 'rgba(102, 126, 234, 0.2)',
    borderWidth: 1,
    borderColor: '#667eea',
  },
  moreParticipants: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    fontSize: isTablet ? 12 : 10,
    color: '#ffffff',
    fontStyle: 'italic',
  },
  controlsContainer: {
    flex: 1,
    padding: 20,
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderTopColor: '#e6e6e6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  primaryControls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    flexWrap: 'wrap',
    gap: 15,
    marginBottom: 20,
  },
  secondaryControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  audioControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 15,
    marginBottom: 15,
  },
  controlButton: {
    backgroundColor: '#ffffff',
    borderWidth: 2, // Increased border width for better definition
    borderColor: '#d1d5db', // Darker border for better contrast
    borderRadius: 8,
    minWidth: isTablet ? 100 : 80,
    paddingVertical: isTablet ? 12 : 10,
    paddingHorizontal: isTablet ? 16 : 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, // Increased shadow for better depth
    shadowRadius: 4,
    elevation: 3, // Increased elevation for Android
  },
  controlButtonActive: {
    backgroundColor: '#1a73e8', // Changed to a more accessible blue
    borderColor: '#1a73e8',
    shadowOpacity: 0.25,
    elevation: 4,
  },
  controlButtonDisabled: {
    opacity: 0.4, // Reduced opacity to make disabled state more obvious
    backgroundColor: '#f1f3f4',
    borderColor: '#e8eaed',
  },
  controlButtonText: {
    fontSize: isTablet ? 12 : 10,
    fontWeight: '700', // Increased font weight for better readability
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#202124', // Darker text color for better contrast
    textAlign: 'center',
    marginTop: 2,
  },
  controlButtonTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  endCallButton: {
    backgroundColor: '#ea4335', // Better red color for accessibility
    borderColor: '#ea4335',
    shadowOpacity: 0.25,
    elevation: 4,
  },
  statusIndicators: {
    alignItems: 'center',
    gap: 20,
    marginBottom: 20,
  },
  micStatus: {
    alignItems: 'center',
  },
  micStatusText: {
    fontSize: isTablet ? 16 : 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  audioLevelMeter: {
    width: 100,
    height: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  audioLevelBar: {
    height: '100%',
    backgroundColor: '#28a745',
    borderRadius: 3,
  },
  holdStatus: {
    alignItems: 'center',
  },
  holdIndicator: {
    backgroundColor: 'rgba(255, 193, 7, 0.2)',
    borderWidth: 1,
    borderColor: '#ffc107',
    color: '#ffc107',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    fontSize: isTablet ? 14 : 12,
    fontWeight: '500',
  },
  advancedControlsSection: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 8,
    marginTop: 2, // Reduced from 16 to 2 for less gap
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  advancedControlsHeader: {
    marginBottom: 12, // Reduced from 16 to 12
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.2)',
    paddingBottom: 6, // Reduced from 8 to 6
  },
  advancedControlsTitle: {
    fontSize: isTablet ? 18 : 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 6, // Reduced from 8 to 6
  },
  warningMessage: {
    fontSize: isTablet ? 14 : 12,
    color: '#ffd700',
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.3)',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '90%',
    maxWidth: 400,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#dee2e6',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#343a40',
  },
  confirmationModal: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    width: '90%',
    maxWidth: 350,
  },
  confirmationTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#343a40',
    marginBottom: 12,
    textAlign: 'center',
  },
  confirmationMessage: {
    fontSize: 14,
    color: '#6c757d',
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 20,
  },
  confirmationButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  confirmationButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#dee2e6',
  },
  confirmationButtonPrimary: {
    backgroundColor: '#007bff',
    borderColor: '#007bff',
  },
  confirmationButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6c757d',
  },
  confirmationButtonTextPrimary: {
    color: '#fff',
  },
  holdModalContent: {
    padding: 20,
  },
  holdModalLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#343a40',
    marginBottom: 8,
  },
  holdModalInput: {
    borderWidth: 1,
    borderColor: '#dee2e6',
    borderRadius: 6,
    padding: 12,
    fontSize: 14,
    textAlignVertical: 'top',
    height: 80,
    marginBottom: 16,
  },
  holdModalCheckbox: {
    marginBottom: 20,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkboxLabel: {
    fontSize: 14,
    color: '#343a40',
  },
  holdModalButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  holdModalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  holdModalButtonSecondary: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#dee2e6',
  },
  holdModalButtonPrimary: {
    backgroundColor: '#007bff',
  },
  holdModalButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6c757d',
  },
  holdModalButtonTextPrimary: {
    color: '#fff',
  },
});

export default MediaSFURoomDisplay;
