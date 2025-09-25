import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  Dimensions,
  AppState,
  BackHandler,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useVoipConfig, useCallHistory } from '../../hooks';
import { useOutgoingCallRoomManager } from '../../hooks/useOutgoingCallRoomManager';
import { SIPConfig, Call } from '../../types/call.types';
import { callService } from '../../services/callService';
import DurationSelector from '../Common/DurationSelector';
import MediaSFURoomDisplay from '../MediaSFU/MediaSFURoomDisplay';
import NotificationModal from '../Common/NotificationModal';
import ConfirmationModal from '../Common/ConfirmationModal';
import { callLogger, roomLogger, apiLogger } from '../../utils/logger';
import { createErrorNotification } from '../../utils/errorUtils';
import {
  parseSipCaller,
  getCallerDisplayString,
  extractCleanIdentifier,
} from '../../utils/sipCallerParser';
import { parsePhoneNumber, isValidPhoneNumber, AsYouType } from 'libphonenumber-js';

// Screen dimensions and responsive breakpoints
const MOBILE_BREAKPOINT = 768;
// isMobileLayout removed; relying on responsive checks via screenData

// Helper function for duration calculation with fallback like react_ref
const formatDurationWithFallback = (
  call: {
    durationSeconds?: number;
    startTimeISO?: string;
    endTimeISO?: string;
    status?: string;
    sipCallId?: string;
    extras?: any;
  },
  liveTrigger?: number
): string => {
  // Skip duration for booth rooms without real SIP calls (dummy calls)
  if (
    call.extras?.isOutgoingRoomSetup &&
    (!call.sipCallId || call.sipCallId.startsWith("dummy_"))
  ) {
    return "—"; // Show dash instead of duration for booth rooms without active calls
  }

  // If we have a valid duration, use it
  if (call.durationSeconds && call.durationSeconds > 0) {
    return formatDuration(call.durationSeconds);
  }

  // For active calls with zero duration, calculate runtime duration
  if (
    call.startTimeISO &&
    call.status &&
    !["TERMINATED", "FAILED", "COMPLETED"].includes(call.status)
  ) {
    try {
      // Handle both ISO string format and timestamp formats
      const startTime = new Date(call.startTimeISO);
      const currentTime = new Date();

      // Validate the date was parsed correctly
      if (isNaN(startTime.getTime())) {
        // If ISO parsing failed, try as timestamp (fallback)
        const timestamp = parseInt(call.startTimeISO, 10);
        const startTimeFromTimestamp = new Date(
          timestamp < 10000000000 ? timestamp * 1000 : timestamp
        );
        if (!isNaN(startTimeFromTimestamp.getTime())) {
          const runtimeSeconds = Math.floor(
            (currentTime.getTime() - startTimeFromTimestamp.getTime()) / 1000
          );
          if (runtimeSeconds > 0) {
            return formatDuration(runtimeSeconds) + " (live)";
          }
        }
      } else {
        const runtimeSeconds = Math.floor(
          (currentTime.getTime() - startTime.getTime()) / 1000
        );
        if (runtimeSeconds > 0) {
          return formatDuration(runtimeSeconds) + " (live)";
        }
      }
    } catch {
      // Failed to calculate runtime duration - continue with fallback
    }
  }

  // For terminated calls with zero duration, try to calculate from start/end times
  if (
    call.startTimeISO &&
    ["TERMINATED", "COMPLETED"].includes(call.status || "")
  ) {
    try {
      // Handle both ISO string format and timestamp formats for start time
      let startTime: Date;
      const startTimeFromISO = new Date(call.startTimeISO);

      if (isNaN(startTimeFromISO.getTime())) {
        // If ISO parsing failed, try as timestamp
        const timestamp = parseInt(call.startTimeISO, 10);
        startTime = new Date(
          timestamp < 10000000000 ? timestamp * 1000 : timestamp
        );
      } else {
        startTime = startTimeFromISO;
      }

      // Handle end time similarly if available
      let estimatedEndTime: Date;
      if (call.endTimeISO) {
        const endTimeFromISO = new Date(call.endTimeISO);
        if (isNaN(endTimeFromISO.getTime())) {
          const timestamp = parseInt(call.endTimeISO, 10);
          estimatedEndTime = new Date(
            timestamp < 10000000000 ? timestamp * 1000 : timestamp
          );
        } else {
          estimatedEndTime = endTimeFromISO;
        }
      } else {
        estimatedEndTime = new Date();
      }

      if (!isNaN(startTime.getTime()) && !isNaN(estimatedEndTime.getTime())) {
        const estimatedSeconds = Math.floor(
          (estimatedEndTime.getTime() - startTime.getTime()) / 1000
        );

        if (estimatedSeconds > 0) {
          const suffix = call.endTimeISO ? "" : " (est.)";
          return formatDuration(estimatedSeconds) + suffix;
        }
      }
    } catch {
      // Failed to calculate estimated duration - continue with fallback
    }
  }

  return "00:00";
};

// Basic duration formatter
const formatDuration = (seconds?: number): string => {
  if (!seconds || seconds < 0) return "00:00";

  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hrs > 0) {
    return `${hrs.toString().padStart(2, "0")}:${mins
      .toString()
      .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins.toString().padStart(2, "0")}:${secs
    .toString()
    .padStart(2, "0")}`;
};

// Helper function to safely get status styles
const getStatusStyle = (status: string, styles: any) => {
  const statusKey = `status${status}`;
  return styles[statusKey] || {};
};

const normalizeToTimestamp = (
  value: Date | string | number | undefined | null
): number | null => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isNaN(time) ? null : time;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) {
      return null;
    }
    return value < 100000000000 ? value * 1000 : value;
  }

  if (typeof value === 'string') {
    const numeric = Number(value);
    if (!Number.isNaN(numeric) && numeric > 0) {
      return numeric < 100000000000 ? numeric * 1000 : numeric;
    }

    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
};

const getCallStartTimestamp = (call: Call): number => {
  const timestampFromStart = normalizeToTimestamp(call.startTime);

  if (timestampFromStart !== null) {
    return timestampFromStart;
  }

  const timestampFromIso = normalizeToTimestamp(call.startTimeISO);

  if (timestampFromIso !== null) {
    return timestampFromIso;
  }

  return 0;
};

interface CallsPageProps {
  onNavigate?: (page: string) => void;
  isApiConfigured: boolean;
}

const CallsPage: React.FC<CallsPageProps> = ({ onNavigate, isApiConfigured }) => {
  const [phoneNumber, setPhoneNumber] = useState(""); // Start with empty string
  const [isDialing, setIsDialing] = useState(false);
  const [selectedFromNumber, setSelectedFromNumber] = useState<string>("");

  // Screen size detection for responsive design
  const [screenData, setScreenData] = useState(Dimensions.get('window'));
  const isTablet = screenData.width >= 768;
  const isDesktop = screenData.width >= 1024;
  
  useEffect(() => {
    const onChange = (result: any) => {
      setScreenData(result.window);
    };
    
    const subscription = Dimensions.addEventListener('change', onChange);
    return () => subscription?.remove();
  }, []);

  // MediaSFU Room State - Enhanced with outgoing call room management
  const [currentRoomName, setCurrentRoomName] = useState<string>(""); // Keep for backward compatibility
  const [requestedRoomName, setRequestedRoomName] = useState<string>(""); // Track what we requested vs what MediaSFU gives us
  const [currentParticipantName, setCurrentParticipantName] =
    useState<string>("voipuser");
  const [isConnectedToRoom, setIsConnectedToRoom] = useState(false);
  const [isMicrophoneEnabled, setIsMicrophoneEnabled] = useState(false);

  // Quick settings state
  const [selectedDuration, setSelectedDuration] = useState<number>(5); // Default 5 minutes

  // Outgoing call room state (transitioning to hook - use hook as primary source)
  const [legacyOutgoingCallRoom, setOutgoingCallRoom] = useState<{
    roomName: string;
    requestedRoomName: string;
    displayName: string;
    createdAt: Date;
    isActive: boolean;
    hasActiveSipCall: boolean;
    isMediaSFUConnected: boolean;
    sipCallId?: string;
    callData?: any;
  } | null>(null);

  // Dialpad State
  const [isDialpadCollapsed, setIsDialpadCollapsed] = useState(true);

  // Notification State for toast messages
  const [notification, setNotification] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: "success" | "error" | "warning" | "info";
  }>({
    isOpen: false,
    title: "",
    message: "",
    type: "info",
  });

  // Microphone confirmation state
  const [microphoneConfirmation, setMicrophoneConfirmation] = useState<{
    isOpen: boolean;
    onConfirm: (() => void) | null;
    onCancel: (() => void) | null;
  }>({
    isOpen: false,
    onConfirm: null,
    onCancel: null,
  });

  // Flag to track if microphone confirmation was already given
  const [microphoneConfirmationGiven, setMicrophoneConfirmationGiven] =
    useState(false);

  // Navigation confirmation state
  const [navigationConfirmation, setNavigationConfirmation] = useState<{
    isOpen: boolean;
    onConfirm: (() => void) | null;
    onCancel: (() => void) | null;
    message: string;
  }>({
    isOpen: false,
    onConfirm: null,
    onCancel: null,
    message: "",
  });

  const [callStatusInterval, setCallStatusInterval] =
    useState<NodeJS.Timeout | null>(null);

  // Bot call timeout handling
  const [botCallTimeoutRef, setBotCallTimeoutRef] =
    useState<NodeJS.Timeout | null>(null);

  // Flag to prevent auto-recreation of rooms after manual close
  const [roomManuallyClosedRef, setRoomManuallyClosedRef] = useState<
    string | null
  >(null);

  // Room switching state to prevent false "call ended" notifications
  const [isRoomSwitching, setIsRoomSwitching] = useState(false);

  // All Current Calls (incoming + outgoing) - These are "active calls" that are not terminated
  // Based on MediaSFU API: calls with status != 'ended', 'failed', 'completed', 'rejected'
  const [currentCalls, setCurrentCalls] = useState<Call[]>([]);

  // Shared API call cache to prevent rate limiting
  const [cachedCallsResponse, setCachedCallsResponse] = useState<{
    data: Call[];
    timestamp: number;
  } | null>(null);
  const apiCallCacheTimeout = 3000; // 3 seconds cache

  // Clear cache when appropriate to ensure fresh data for important events
  const clearApiCache = useCallback(() => {
    setCachedCallsResponse(null);
  }, []);

  // Enhanced outgoing call room management using reference pattern
  const {
    outgoingCallRoom: hookOutgoingCallRoom,
    createOutgoingRoom,
    updateRoomName,
    syncCallToRoom,
    clearCallFromRoom,
    clearOutgoingRoom,
    getDummyCallForOutgoingRoom,
  } = useOutgoingCallRoomManager({
    currentCalls,
    currentRoomName,
    currentParticipantName,
  });

  // Use dummy call for outgoing room display (following reference pattern)
  const dummyCallForOutgoingRoom = useMemo(() => {
    return getDummyCallForOutgoingRoom();
  }, [getDummyCallForOutgoingRoom]);

  // Enhanced current calls including dummy call for outgoing room (following reference pattern)
  const enhancedCurrentCalls = useMemo(() => {
    let calls = [...currentCalls];

    // Add dummy call for outgoing room ONLY when active but NO real SIP call yet
    if (
      dummyCallForOutgoingRoom &&
      hookOutgoingCallRoom?.isActive &&
      !hookOutgoingCallRoom.hasActiveSipCall
    ) {
      // Add dummy call at the beginning when we're in setup phase (no real call yet)
      calls = [dummyCallForOutgoingRoom, ...calls];
    }

    // When we have a real SIP call, keep it (don't filter it out)
    // The real call has the sipCallId that MediaSFU needs for proper controls

    calls.sort((a, b) => getCallStartTimestamp(b) - getCallStartTimestamp(a));

    return calls;
  }, [
    currentCalls,
    dummyCallForOutgoingRoom,
    hookOutgoingCallRoom?.isActive,
    hookOutgoingCallRoom?.hasActiveSipCall,
  ]);

  // Use hook's outgoing room as primary source, fallback to legacy
  const outgoingCallRoom = hookOutgoingCallRoom || legacyOutgoingCallRoom;
  const [callsPollingInterval, setCallsPollingInterval] =
    useState<NodeJS.Timeout | null>(null);
  const [expandedCalls, setExpandedCalls] = useState<Set<string>>(new Set());
  const [collapsedMetadata, setCollapsedMetadata] = useState<Set<string>>(
    new Set()
  );
  const [liveDurationUpdateTrigger, setLiveDurationUpdateTrigger] = useState(0);
  const [showDialer, setShowDialer] = useState(false);

  // Room creation loading state
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [roomCreationError, setRoomCreationError] = useState<string | null>(
    null
  );
  const [roomCreationTimeoutRef, setRoomCreationTimeoutRef] =
    useState<NodeJS.Timeout | null>(null);

  // Notification debounce - prevent duplicate call ended notifications
  const [lastCallEndNotificationId, setLastCallEndNotificationId] = useState<
    string | null
  >(null);

  // Flag to prevent repeated call end detection for the same call
  const [callEndProcessed, setCallEndProcessed] = useState<string | null>(null);

  // Controlled outgoing call flow state
  const [callFlowStep, setCallFlowStep] = useState<
    | "closed"
    | "select-number"
    | "enter-phone"
    | "choose-mode"
    | "connecting"
    | "connected"
  >("select-number");

  const observedSipParticipantsRef = useRef<Set<string>>(new Set());
  const hasDetectedSipParticipantRef = useRef(false);

  const resetSipParticipantTracking = useCallback(() => {
    observedSipParticipantsRef.current = new Set();
    hasDetectedSipParticipantRef.current = false;
  }, []);

  // Track latest room name in a ref for async waits
  const currentRoomNameRef = useRef(currentRoomName);
  useEffect(() => {
    currentRoomNameRef.current = currentRoomName;
  }, [currentRoomName]);

  // Previously used helper to wait for MediaSFU to replace temp roomName with real one
  // Removed in favor of explicit room creation via API for bot calls.

  // Utility function to clear all MediaSFU room state
  const clearMediaSFUState = useCallback(
    (reason?: string) => {
      setCurrentRoomName("");
      setCurrentParticipantName("voipuser");
      setIsConnectedToRoom(false);
      setIsMicrophoneEnabled(false);
      setRequestedRoomName("");
      // CRITICAL: Clear loading states to close loading modal
      setIsCreatingRoom(false);
      setRoomCreationError(null);
      resetSipParticipantTracking();
      // Clear room creation timeout if active
      if (roomCreationTimeoutRef) {
        clearTimeout(roomCreationTimeoutRef);
        setRoomCreationTimeoutRef(null);
      }
      roomLogger.info(
        `MediaSFU state cleared: ${reason || "No reason provided"}`
      );
    },
    [roomCreationTimeoutRef, resetSipParticipantTracking]
  );

  // Shared API call function to prevent rate limiting
  const getCallsWithCache = useCallback(async (): Promise<{
    success: boolean;
    data?: Call[];
  }> => {
    const now = Date.now();

    // Check if we have a recent cached response (within 3 seconds)
    if (
      cachedCallsResponse &&
      now - cachedCallsResponse.timestamp < apiCallCacheTimeout
    ) {
      return { success: true, data: cachedCallsResponse.data };
    }

    // Make API call if cache is stale or doesn't exist
    try {
      const response = await callService.getAllCalls();
      if (response.success && response.data) {
        // Upsert unique calls into local history on fresh responses (idempotent)
        try {
          response.data.forEach((call: any) => {
            const identifier = call?.sipCallId || call?.id;
            if (!identifier) return;
            const normalized: Call = {
              ...(call as Call),
              id: call?.id || call?.sipCallId || identifier,
              sipCallId: call?.sipCallId || call?.id || identifier,
              direction: (call as any).direction || (call as any).callDirection,
              startTimeISO:
                (call as any).startTimeISO ||
                ((call as any).startTime
                  ? new Date((call as any).startTime).toISOString()
                  : (call as any).startTimeISO),
              durationSeconds:
                (call as any).durationSeconds ??
                (typeof (call as any).duration === 'number'
                  ? (call as any).duration
                  : (call as any).durationSeconds),
            } as Call;
            addCallToHistoryRef.current?.(normalized);
          });
        } catch (persistErr) {
          callLogger.warn('History upsert from getAllCalls failed (non-fatal):', persistErr);
        }
        // Cache the response
        setCachedCallsResponse({
          data: response.data,
          timestamp: now,
        });
        return response;
      }
      return { success: false };
    } catch (error) {
      callLogger.error("Error in shared API call:", error);
      return { success: false };
    }
  }, [cachedCallsResponse, apiCallCacheTimeout]);

  // Room origin tracking system - track which rooms we created via outgoing setup
  const getCreatedRooms = useCallback(async (): Promise<Set<string>> => {
    try {
      const existingData = await AsyncStorage.getItem("mediasfu_created_rooms");
      if (existingData) {
        const data = JSON.parse(existingData);
        return new Set(Object.keys(data));
      }
      return new Set();
    } catch {
      return new Set();
    }
  }, []);

  // Synchronous version for immediate checks (uses state)
  const [createdRooms, setCreatedRooms] = useState<Set<string>>(new Set());

  // Load created rooms on mount
  useEffect(() => {
    const loadCreatedRooms = async () => {
      const rooms = await getCreatedRooms();
      setCreatedRooms(rooms);
    };
    loadCreatedRooms();
  }, [getCreatedRooms]);

  const markRoomAsCreated = useCallback(async (roomName: string) => {
    try {
      // Update local state immediately for immediate UI response
      setCreatedRooms(prev => new Set([...prev, roomName]));
      
      // Then update AsyncStorage in the background
      const existingData = await AsyncStorage.getItem("mediasfu_created_rooms");
      const data = existingData ? JSON.parse(existingData) : {};
      data[roomName] = Date.now();
      await AsyncStorage.setItem("mediasfu_created_rooms", JSON.stringify(data));
    } catch {
      // Error storing created room to AsyncStorage - continue without throwing
      // State is already updated so UI will still work
    }
  }, []);

  const isRoomCreatedByUs = useCallback(
    (roomName: string): boolean => {
      return createdRooms.has(roomName);
    },
    [createdRooms]
  );

  // Step flow management
  const startCallFlow = useCallback(() => {
    setCallFlowStep("select-number");
    setShowDialer(true);
  }, []);

  const closeCallFlow = useCallback(() => {
    setCallFlowStep("closed");
    setShowDialer(false);
    // Reset form state when closing
    setPhoneNumber("");
    setSelectedFromNumber("");
    setSelectedCallMode(null);
  }, []);

  const nextStep = useCallback(() => {
    if (callFlowStep === "select-number" && selectedFromNumber) {
      setCallFlowStep("enter-phone");
    } else if (callFlowStep === "enter-phone" && phoneNumber) {
      // We'll validate phone number in the UI, just check it exists here
      setCallFlowStep("choose-mode");
    } else if (callFlowStep === "choose-mode") {
      setCallFlowStep("connecting");
    }
  }, [callFlowStep, selectedFromNumber, phoneNumber]);

  const prevStep = useCallback(() => {
    if (callFlowStep === "enter-phone") {
      setCallFlowStep("select-number");
    } else if (callFlowStep === "choose-mode") {
      setCallFlowStep("enter-phone");
    } else if (callFlowStep === "connecting") {
      setCallFlowStep("choose-mode");
    }
  }, [callFlowStep]);

  // Default mode auto-selection effect moved below SIP config declarations

  // Call History Management (using custom hook)
  const { addCallToHistory, markCallsAsTerminated, markCallAsTerminated } = useCallHistory();
  // Ref wrapper to use inside stable callbacks without adding deps
  const addCallToHistoryRef = useRef(addCallToHistory);
  useEffect(() => {
    addCallToHistoryRef.current = addCallToHistory;
  }, [addCallToHistory]);

  // Notification helper function
  const showNotification = useCallback(
    (
      title: string,
      message: string,
      type: "success" | "error" | "warning" | "info" = "info"
    ) => {
      setNotification({
        isOpen: true,
        title,
        message,
        type,
      });
    },
    []
  );

  const closeNotification = useCallback(() => {
    setNotification((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const handleRoomParticipantsUpdate = useCallback(
    (updatedParticipants: { id?: string; name?: string; muted?: boolean }[]) => {
      if (!hookOutgoingCallRoom?.isActive) {
        return;
      }

      const localName = (currentParticipantName || "voipuser").toLowerCase();
      const sipParticipants = new Set<string>();

      updatedParticipants.forEach((participant) => {
        const id = (participant?.id ?? "").toString();
        const name = (participant?.name ?? "").toString();
        const idLower = id.toLowerCase();
        const nameLower = name.toLowerCase();

        const isAgent = idLower.endsWith("_agent") || nameLower.endsWith("_agent");
        if (isAgent) {
          return;
        }

        const looksSip = idLower.startsWith("sip_") || nameLower.startsWith("sip");
        const isSelf = idLower === localName || nameLower === localName;

        if (!isSelf && (looksSip || updatedParticipants.length > 1)) {
          const identifier = idLower || nameLower;
          if (identifier) {
            sipParticipants.add(identifier);
          }
        }
      });

      const previousParticipants = observedSipParticipantsRef.current;
      const newParticipants = Array.from(sipParticipants).filter(
        (identifier) => !previousParticipants.has(identifier)
      );
      const everyoneLeft =
        sipParticipants.size === 0 && previousParticipants.size > 0;

      observedSipParticipantsRef.current = sipParticipants;

      if (everyoneLeft) {
        hasDetectedSipParticipantRef.current = false;
      }

      const trackedPhases = new Set([
        "select-number",
        "enter-phone",
        "choose-mode",
        "connecting",
      ]);

      if (!trackedPhases.has(callFlowStep)) {
        return;
      }

      if (newParticipants.length > 0 && !hasDetectedSipParticipantRef.current) {
        hasDetectedSipParticipantRef.current = true;

        if (
          callFlowStep === "select-number" ||
          callFlowStep === "enter-phone" ||
          callFlowStep === "choose-mode"
        ) {
          setCallFlowStep("connecting");
        }

        showNotification(
          'Answered',
          'The remote participant has answered the call and is now connected.',
          "info"
        );
      }
    },
    [
      callFlowStep,
      currentParticipantName,
      hookOutgoingCallRoom,
      showNotification,
    ]
  );

  // Helper function to extract clean error messages
  const extractErrorMessage = useCallback((error: any): string => {
    if (typeof error === 'string') {
      // Extract just the error message part from HTTP error strings
      const match = error.match(/{"error":"([^"]+)"}/);
      if (match) {
        return match[1];
      }
      // Handle other common error patterns
      if (error.includes('HTTP')) {
        const cleanError = error.split(':').pop()?.trim();
        if (cleanError && cleanError !== error) {
          return cleanError;
        }
      }
      return error;
    }
    
    if (error?.error) {
      return typeof error.error === 'string' ? error.error : 'Call failed';
    }
    
    if (error?.message) {
      return error.message;
    }
    
    return 'Call failed. Please try again.';
  }, []);

  // Navigation protection helper removed (unused)

  // Removed unused handleNavigationWithProtection

  const stopCallMonitoring = useCallback(() => {
    if (callStatusInterval) {
      clearInterval(callStatusInterval);
      setCallStatusInterval(null);
    }
  }, [callStatusInterval]);

  // Enhanced call monitoring with proper room state synchronization
  const startCallMonitoring = useCallback(
    (sipCallId: string, roomName: string) => {
      if (callStatusInterval) {
        clearInterval(callStatusInterval);
      }

      // Track timeout to clear it when call is established
      let monitoringTimeout: NodeJS.Timeout | null = null;

      const interval = setInterval(async () => {
        try {
          callLogger.debug("Polling for specific call status...");
          const allCalls = await getCallsWithCache();
          callLogger.debug("Cached calls response:", allCalls);

          if (allCalls.success && allCalls.data) {
            // First try to match by sipCallId, then by roomName
            const call = allCalls.data.find(
              (c) =>
                c.id === sipCallId ||
                c.roomName === roomName ||
                c.sipCallId === sipCallId
            );

            if (call) {
              callLogger.debug("Found matching call:", call);
              const backendStatus = call.status as string;

              switch (backendStatus) {
                case "RINGING":
                case "INITIATING":
                case "CONNECTING":
                  break;
                case "CONNECTED":
                case "ANSWERED":
                case "connected":
                  setCallFlowStep("connected");

                  // CRITICAL: Update outgoing room with established call data
                  if (outgoingCallRoom?.isActive) {
                    setOutgoingCallRoom((prev) =>
                      prev
                        ? {
                            ...prev,
                            hasActiveSipCall: true,
                            sipCallId: call.sipCallId || call.id,
                            callData: {
                              status: call.status,
                              direction: call.direction,
                              callerIdRaw: call.callerIdRaw,
                              calledUri: call.calledUri,
                              startTimeISO: call.startTimeISO,
                              durationSeconds: call.durationSeconds,
                              onHold: call.onHold,
                              activeMediaSource: call.activeMediaSource,
                              humanParticipantName: call.humanParticipantName,
                            },
                          }
                        : null
                    );
                  }

                  // Auto-hide dialer with smooth transition
                  setTimeout(() => {
                    setShowDialer(false);
                    setCallFlowStep("closed");
                  }, 2000);

                  // Force UI update to reflect connected state
                  setTimeout(() => {
                    setCurrentCalls((prevCalls) => [...prevCalls]);
                  }, 100);

                  // Stop monitoring - call is established
                  if (monitoringTimeout) {
                    clearTimeout(monitoringTimeout);
                    monitoringTimeout = null;
                  }
                  stopCallMonitoring();
                  break;
                case "TERMINATED":
                case "FAILED":
                case "DECLINED":
                case "BUSY":
                  callLogger.warn("Call failed or ended:", {
                    status: backendStatus,
                    callId: sipCallId,
                  });
                  setCallFlowStep("closed");
                  stopCallMonitoring();
                  break;
                default:
                  callLogger.debug("Unknown call status:", backendStatus);
              }
            } else {
              callLogger.debug(
                "No matching call found - may still be establishing"
              );
            }
          } else {
            callLogger.error(
              "Failed to fetch all calls - cached response failed"
            );
          }
        } catch (error) {
          callLogger.error("Error monitoring call status:", error);
        }
      }, 5000); // Check every 5 seconds for faster response

      setCallStatusInterval(interval);

      // Auto-stop monitoring after 45 seconds
      monitoringTimeout = setTimeout(() => {
        setCallFlowStep("closed");
        stopCallMonitoring();
      }, 45 * 1000);
    },
    [
      callStatusInterval,
      stopCallMonitoring,
      outgoingCallRoom,
      getCallsWithCache,
    ]
  );

  // Helper functions for expandable calls
  const toggleCallExpansion = useCallback(
    (callId: string) => {
      // Find the call being toggled from enhancedCurrentCalls
      const call = enhancedCurrentCalls.find(
        (c) =>
          (c.sipCallId || `call-${enhancedCurrentCalls.indexOf(c)}`) === callId
      );

      // Check if this call has an active MediaSFU connection that would be disrupted
      // AND the MediaSFU room display is currently shown for this specific call
      const hasActiveMediaSFU =
        call?.roomName &&
        currentRoomName === call.roomName &&
        isConnectedToRoom;

      // Check if the MediaSFU interface is currently embedded/displayed for this call
      // MediaSFU is embedded when the call is NOT from our outgoing setup room
      const isMediaSFUEmbedded =
        hasActiveMediaSFU &&
        currentRoomName &&
        !isRoomCreatedByUs(currentRoomName) &&
        isConnectedToRoom;

      setExpandedCalls((prev) => {
        const newSet = new Set(prev);
        if (newSet.has(callId)) {
          // Only prevent collapsing if MediaSFU is actively embedded for this call
          if (isMediaSFUEmbedded) {
            // Show notification instead of alert
            showNotification(
              "Cannot Collapse Call",
              'Cannot collapse this call while MediaSFU room interface is active. Please disconnect from the room first using the "Close Room" or "End Call" button in the MediaSFU interface to maintain your connection stability.',
              "warning"
            );
            return prev; // Don't change the state
          }
          newSet.delete(callId);
        } else {
          newSet.add(callId);
        }
        return newSet;
      });
    },
    [
      enhancedCurrentCalls,
      currentRoomName,
      isConnectedToRoom,
      showNotification,
      isRoomCreatedByUs,
    ]
  );

  // Helper functions for metadata collapse/expand
  const toggleMetadataCollapse = useCallback((callId: string) => {
    setCollapsedMetadata((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(callId)) {
        newSet.delete(callId);
      } else {
        newSet.add(callId);
      }
      return newSet;
    });
  }, []);

  const isMetadataCollapsed = useCallback(
    (callId: string) => {
      return collapsedMetadata.has(callId);
    },
    [collapsedMetadata]
  );

  const isCallExpanded = useCallback(
    (callId: string) => {
      return expandedCalls.has(callId);
    },
    [expandedCalls]
  );

  // Room meta helpers (store original participantName per room to compute variants)
  type RoomMeta = { originalParticipantName?: string };

  const getRoomMetaMap = useCallback(async (): Promise<Record<string, RoomMeta>> => {
    try {
      const raw = await AsyncStorage.getItem('mediasfu_room_meta');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }, []);

  const setRoomMetaOriginal = useCallback(async (roomName: string, originalParticipantName: string) => {
    try {
      const meta = await getRoomMetaMap();
      meta[roomName] = { originalParticipantName };
      await AsyncStorage.setItem('mediasfu_room_meta', JSON.stringify(meta));
    } catch {
      // ignore storage errors
    }
  }, [getRoomMetaMap]);

  const getOriginalParticipantForRoom = useCallback(async (roomName: string): Promise<string | null> => {
    try {
      const meta = await getRoomMetaMap();
      return meta[roomName]?.originalParticipantName || null;
    } catch {
      return null;
    }
  }, [getRoomMetaMap]);

  const propagateRoomMeta = useCallback(async (fromRoom: string, toRoom: string) => {
    try {
      if (!fromRoom || !toRoom || fromRoom === toRoom) return;
      const meta = await getRoomMetaMap();
      if (meta[fromRoom]) {
        meta[toRoom] = { ...meta[fromRoom] };
        await AsyncStorage.setItem('mediasfu_room_meta', JSON.stringify(meta));
      }
    } catch {
      // ignore storage errors
    }
  }, [getRoomMetaMap]);

  const sanitizeParticipantName = useCallback((raw: string): string => {
    let name = (raw || 'voipuser').replace(/[^a-zA-Z0-9]/g, '');
    if (name.length < 2) name = 'user';
    if (name.length > 10) name = name.substring(0, 10);
    return name;
  }, []);

  const getVariantParticipantNameForRoom = useCallback(
    async (roomName: string, desiredOriginal: string): Promise<string> => {
      const desired = sanitizeParticipantName(desiredOriginal);
      const original = sanitizeParticipantName((await getOriginalParticipantForRoom(roomName)) || '');
      if (!original) return desired;

      if (desired.toLowerCase() === original.toLowerCase()) {
        const match = desired.match(/^(.*?)(\d+)$/);
        let base = desired;
        let nextNum = 2;
        if (match) {
          base = match[1];
          nextNum = (parseInt(match[2], 10) || 1) + 1;
        }
        const suffix = String(nextNum);
        const allowedBaseLen = Math.max(1, 10 - suffix.length);
        if (base.length > allowedBaseLen) {
          base = base.substring(0, allowedBaseLen);
        }
        return `${base}${suffix}`;
      }
      return desired;
    },
    [getOriginalParticipantForRoom, sanitizeParticipantName]
  );


  // Join call function (for calls not yet joined) - Simplified for direct embedding
  const handleJoinCall = useCallback(
    async (call: Call) => {
      if (!call.roomName) {
        callLogger.error("No room name available for call");
        return;
      }

      try {
        // Check if already connected to this room
        if (isConnectedToRoom && currentRoomName === call.roomName) {
          return;
        }

        // Set room switching flag to prevent false "call ended" notifications
        setIsRoomSwitching(true);

        // Disconnect from current room if connected to a different one
        if (
          isConnectedToRoom &&
          currentRoomName &&
          currentRoomName !== call.roomName
        ) {
          // Properly disconnect from MediaSFU room first
          setCurrentRoomName("");
          setCurrentParticipantName("voipuser");
          setIsConnectedToRoom(false);
          setIsMicrophoneEnabled(false);

          // Wait a moment for cleanup
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        // Determine participant name - use humanParticipantName from call or generate from config
        // Apply name variant if needed based on room metadata
        const desiredName =
          call.humanParticipantName || currentParticipantName || 'voipuser';
        const participantName = await getVariantParticipantNameForRoom(
          call.roomName,
          desiredName
        );

        // IMPORTANT: If we're joining a room that's different from our outgoing room,
        // clear outgoing room state to show proper joined call UI
        if (
          hookOutgoingCallRoom?.isActive &&
          hookOutgoingCallRoom.roomName !== call.roomName
        ) {
          // Clear outgoing room state to show proper joined call UI
          if (clearOutgoingRoom) {
            clearOutgoingRoom();
            resetSipParticipantTracking();
          }
        }

        // Set up room state for joining and show the display
        setCurrentRoomName(call.roomName);
        setCurrentParticipantName(participantName);

        // Clear room switching flag after a delay
        setTimeout(() => {
          setIsRoomSwitching(false);
        }, 2000);
      } catch (error) {
        callLogger.error("Failed to join call room:", error);
        // Clear switching flag on error
        setIsRoomSwitching(false);
      }
    },
    [
      isConnectedToRoom,
      currentRoomName,
      currentParticipantName,
      hookOutgoingCallRoom,
      clearOutgoingRoom,
      getVariantParticipantNameForRoom,
      resetSipParticipantTracking,
    ]
  );

  // End call function
  const handleEndCall = useCallback(
    async (call: Call) => {
      const callId = call.sipCallId || call.id;
      if (!callId) {
        callLogger.error("No call ID available for ending call");
        return;
      }

      try {
        callLogger.info(`Ending call: ${callId}`);

        // Call the hangup service
        const result = await callService.hangupCall(callId);

        if (result.success) {
          callLogger.info(`Call ${callId} ended successfully`);

          // Update UI optimistically
          setCurrentCalls((prev) =>
            prev.filter((c) => c.sipCallId !== callId && c.id !== callId)
          );

          // Immediately mark in history as terminated
          if (callId) {
            markCallAsTerminatedRef.current?.(callId);
          }

          // Refresh calls list after a short delay
          setTimeout(() => {
            // The continuous polling will update the list
          }, 1000);
        } else {
          callLogger.error(`Failed to end call ${callId}:`, result.error);
          const errorNotification = createErrorNotification(result.error, 'ending call');
          showNotification(
            errorNotification.title,
            errorNotification.message,
            "error"
          );
        }
      } catch (error) {
        callLogger.error(`Error ending call ${callId}:`, error);
        const errorNotification = createErrorNotification(error, 'ending call');
        showNotification(
          errorNotification.title,
          errorNotification.message,
          "error"
        );
      }
    },
  [showNotification]
  );

  // Handle room-initiated end call
  const handleRoomEndCall = useCallback(
    async (callId: string) => {
      // Find the call by ID and use existing handleEndCall
      const call = currentCalls.find(
        (c) => c.sipCallId === callId || c.id === callId
      );
      if (call) {
        await handleEndCall(call);
      } else {
        callLogger.warn("Could not find call to end:", callId);
      }
    },
    [currentCalls, handleEndCall]
  );

  // Hold call function
  const handleHoldCall = useCallback(
    async (call: Call) => {
      const callId = call.sipCallId || call.id;
      if (!callId) {
        callLogger.error("No call ID available for holding call");
        return;
      }

      const shouldHold = !(call.onHold ?? false);

      try {
        callLogger.info(
          `${shouldHold ? "Placing" : "Releasing"} call ${callId} ${
            shouldHold ? "on hold" : "from hold"
          }`
        );

        const response = await callService.toggleHold(callId, shouldHold);

        if (!response.success) {
          const message = response.error || "Unable to update hold state";
          showNotification(
            shouldHold ? "Could not hold call" : "Could not resume call",
            message,
            "error"
          );
          return;
        }

        setCurrentCalls((prevCalls) =>
          prevCalls.map((existingCall) =>
            existingCall.sipCallId === callId || existingCall.id === callId
              ? { ...existingCall, onHold: shouldHold }
              : existingCall
          )
        );

        showNotification(
          shouldHold ? "Call placed on hold" : "Call resumed",
          shouldHold
            ? "The participant is now hearing the configured hold experience."
            : "The participant has been returned to the live conversation.",
          "success"
        );
      } catch (error) {
        const message = extractErrorMessage(error);
        callLogger.error(`Error toggling hold for call ${callId}:`, error);
        showNotification(
          shouldHold ? "Could not hold call" : "Could not resume call",
          message,
          "error"
        );
      }
    },
    [extractErrorMessage, showNotification]
  );

  // Removed unused handleTransferCall

  // Answer call function
  const handleAnswerCall = useCallback(
    async (call: Call) => {
      const callId = call.sipCallId || call.id;
      if (!callId) {
        callLogger.error("No call ID available for answering call");
        return;
      }

      try {
        // For answering calls, we need to join the MediaSFU room
        if (call.roomName) {
          await handleJoinCall(call);
        }

        // Note: Answer functionality would need to be implemented in callService
        // For now, just join the room
      } catch (error) {
        callLogger.error(`Error answering call ${callId}:`, error);
      }
    },
    [handleJoinCall]
  );

  // Decline call function
  const handleDeclineCall = useCallback(
    async (call: Call) => {
      const callId = call.sipCallId || call.id;
      if (!callId) {
        callLogger.error("No call ID available for declining call");
        return;
      }

      try {
        callLogger.info(`Declining call: ${callId}`);

        // Use the reject call service
        const result = await callService.rejectCall(callId);

        if (result.success) {
          callLogger.info(`Call ${callId} declined successfully`);

          // Update UI optimistically
          setCurrentCalls((prev) =>
            prev.filter((c) => c.sipCallId !== callId && c.id !== callId)
          );

          // Immediately mark in history as terminated
          if (callId) {
            markCallAsTerminatedRef.current?.(callId);
          }

          // Refresh calls list after a short delay
          setTimeout(() => {
            // The continuous polling will update the list
          }, 1000);
        } else {
          callLogger.error(`Failed to decline call ${callId}:`, result.error);
          const errorNotification = createErrorNotification(result.error, 'declining call');
          showNotification(
            errorNotification.title,
            errorNotification.message,
            "error"
          );
        }
      } catch (error) {
        callLogger.error(`Error declining call ${callId}:`, error);
        const errorNotification = createErrorNotification(error, 'declining call');
        showNotification(
          errorNotification.title,
          errorNotification.message,
          "error"
        );
      }
    },
    [showNotification]
  );

  // Use refs to avoid circular dependencies
  const callsPollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const markCallAsTerminatedRef = useRef(markCallAsTerminated);
  useEffect(() => {
    markCallAsTerminatedRef.current = markCallAsTerminated;
  }, [markCallAsTerminated]);

  const stopContinuousCallsPolling = useCallback(() => {
    if (callsPollingIntervalRef.current) {
      clearInterval(callsPollingIntervalRef.current);
      callsPollingIntervalRef.current = null;
      setCallsPollingInterval(null);
    }
  }, []);

  // Stable values to prevent infinite re-renders
  const stableOutgoingCallRoom = useMemo(() => ({
    isActive: hookOutgoingCallRoom?.isActive,
    hasActiveSipCall: hookOutgoingCallRoom?.hasActiveSipCall,
    roomName: hookOutgoingCallRoom?.roomName,
    requestedRoomName: hookOutgoingCallRoom?.requestedRoomName,
    sipCallId: hookOutgoingCallRoom?.sipCallId,
    callData: hookOutgoingCallRoom?.callData
  }), [
    hookOutgoingCallRoom?.isActive,
    hookOutgoingCallRoom?.hasActiveSipCall,
    hookOutgoingCallRoom?.roomName,
    hookOutgoingCallRoom?.requestedRoomName,
    hookOutgoingCallRoom?.sipCallId,
    hookOutgoingCallRoom?.callData
  ]);

  // Continuous polling for all calls (incoming + outgoing)
  const startContinuousCallsPolling = useCallback(() => {
    // Clear any existing polling first
    stopContinuousCallsPolling();

    let consecutiveErrors = 0;
    const maxErrors = 3;

    const pollCalls = async () => {
      try {
        const allCallsResponse = await getCallsWithCache();
        if (allCallsResponse.success && allCallsResponse.data) {
          // Log the first call structure to understand API fields
          if (allCallsResponse.data.length > 0) {
          }

          // Reset error count on successful response
          consecutiveErrors = 0;

          // Add ALL calls to history (active and terminated) for record keeping
          allCallsResponse.data.forEach((call) => {
            // Use either sipCallId or id as identifier (API may vary)
            const identifier = (call as any).sipCallId || (call as any).id;
            if (!identifier) return;

            // Normalize fields for history resilience
            const normalized = {
              ...call,
              id: (call as any).id || (call as any).sipCallId || identifier,
              sipCallId: (call as any).sipCallId || (call as any).id || identifier,
              // Ensure canonical fields exist
              startTimeISO:
                (call as any).startTimeISO ||
                ((call as any).startTime ? new Date((call as any).startTime).toISOString() : undefined),
              durationSeconds:
                (call as any).durationSeconds ??
                (typeof (call as any).duration === 'number' ? (call as any).duration : undefined),
            } as Call;

            addCallToHistory(normalized);
          });

          // Filter for active/current calls (anything not terminated/terminating)
          // These are calls that should appear in the UI as "current calls"
          // Similar to reference implementation's "activeCalls" filtering
          const activeCalls = allCallsResponse.data.filter((call) => {
            const isActiveCall =
              call.status !== "ended" &&
              call.status !== "failed" &&
              call.status !== "completed" &&
              call.status !== "rejected" &&
              call.status !== "terminated" &&
              call.status !== "terminating" &&
              !call.callEnded;

            if (!isActiveCall) {
              callLogger.debug(
                `Filtered out call ${call.sipCallId} with status: ${call.status}`
              );
            }
            return isActiveCall;
          });

          // Mark any calls in history that are no longer in the active list as terminated
          const activeSipCallIds = activeCalls
            .map((call) => call.sipCallId)
            .filter(Boolean);
          markCallsAsTerminated(activeSipCallIds);

          // Remove duplicates based on sipCallId as primary key, fallback to id
          const uniqueActiveCalls = activeCalls.reduce(
            (unique: Call[], call: Call) => {
              const callId = call.sipCallId || call.id;
              const existingCall = unique.find(
                (existing) =>
                  (existing.sipCallId && existing.sipCallId === callId) ||
                  (existing.id && existing.id === callId) ||
                  (existing.sipCallId === call.sipCallId && call.sipCallId) ||
                  (existing.id === call.id && call.id)
              );

              if (!existingCall) {
                unique.push(call);
              } else {
                callLogger.debug(`Filtered duplicate call: ${callId}`, {
                  existing: existingCall,
                  duplicate: call,
                });
              }

              return unique;
            },
            []
          );

          // Update state and log for debugging room updates
          setCurrentCalls((prevCalls) => {
            // Only update if there are actual changes (deep comparison of critical fields)
            const hasChanges =
              prevCalls.length !== uniqueActiveCalls.length ||
              prevCalls.some((prevCall, index) => {
                const newCall = uniqueActiveCalls[index];
                return (
                  !newCall ||
                  prevCall.sipCallId !== newCall.sipCallId ||
                  prevCall.status !== newCall.status ||
                  prevCall.roomName !== newCall.roomName
                );
              });

            if (hasChanges) {
              return uniqueActiveCalls;
            }
            return prevCalls; // No changes, return same reference to prevent re-render
          });

          // Enhanced outgoing call room synchronization with establishment detection
          if (stableOutgoingCallRoom.isActive) {
            // CRITICAL: Use room-based discovery to find SIP calls
            // Look for active calls that match our outgoing room name (not terminated/failed)
            const sipCallInRoom = uniqueActiveCalls.find(
              (call) =>
                (call.roomName === stableOutgoingCallRoom.roomName ||
                  call.roomName === stableOutgoingCallRoom.requestedRoomName) &&
                call.status !== "ended" &&
                call.status !== "failed" &&
                call.status !== "completed" &&
                call.status !== "rejected" &&
                call.status !== "terminated" &&
                call.status !== "terminating" &&
                !call.callEnded
            );

            if (
              sipCallInRoom &&
              (!stableOutgoingCallRoom.hasActiveSipCall ||
                !stableOutgoingCallRoom.callData)
            ) {
              // Clear bot call timeout if call is now connected (case-insensitive)
              if (
                (sipCallInRoom.status?.toLowerCase() === "connected" ||
                  sipCallInRoom.status?.toLowerCase() === "active") &&
                botCallTimeoutRef
              ) {
                clearTimeout(botCallTimeoutRef);
                setBotCallTimeoutRef(null);
                callLogger.info("Call connected - cleared timeout");
              }

              // Use hook to sync call to room
              syncCallToRoom(sipCallInRoom);

              // Update UI to reflect call establishment (case-insensitive)
              if (sipCallInRoom.status?.toLowerCase() === "connected") {
                setCallFlowStep("connected");

                // Auto-hide dialer after call establishment
                setTimeout(() => {
                  setShowDialer(false);
                  setCallFlowStep("closed");
                }, 2000);
              }
            } else if (
              sipCallInRoom &&
              hookOutgoingCallRoom?.hasActiveSipCall &&
              stableOutgoingCallRoom.callData
            ) {
              // Update existing call data (status changes, duration updates, etc.)
              const hasStatusChange =
                stableOutgoingCallRoom.callData.status !== sipCallInRoom.status;
              const hasDurationChange =
                stableOutgoingCallRoom.callData.durationSeconds !==
                sipCallInRoom.durationSeconds;

              if (hasStatusChange || hasDurationChange) {
                setOutgoingCallRoom((prev) =>
                  prev
                    ? {
                        ...prev,
                        callData: {
                          ...prev.callData!,
                          status: sipCallInRoom.status,
                          durationSeconds: sipCallInRoom.durationSeconds,
                          onHold: sipCallInRoom.onHold,
                          activeMediaSource: sipCallInRoom.activeMediaSource,
                        },
                      }
                    : null
                );

                if (hasStatusChange) {
                  // Check if call has ended (terminated, failed, completed)
                  const callEndedStatuses = [
                    "TERMINATED",
                    "FAILED",
                    "COMPLETED",
                    "CANCELLED",
                  ];
                  if (
                    callEndedStatuses.includes(
                      sipCallInRoom.status?.toUpperCase() || ""
                    )
                  ) {
                    // Mark outgoing room as no longer having active call
                    setTimeout(() => {
                      setOutgoingCallRoom((prev) =>
                        prev
                          ? {
                              ...prev,
                              hasActiveSipCall: false,
                              sipCallId: undefined,
                              callData: undefined,
                              isActive: false,
                            }
                          : null
                      );
                    }, 1000); // Small delay to allow status display
                  }
                }
              }
            } else if (
              !sipCallInRoom &&
              stableOutgoingCallRoom.hasActiveSipCall
            ) {
              // CRITICAL: SIP call was found before but now disappeared - call ended by remote party
              // BUT: Only process if not already processed by fast detection
              const originalSipCallId = stableOutgoingCallRoom.sipCallId;
              // Use a stable fallback when SIP call ID is missing to avoid duplicate notifications
              const callNotificationId = originalSipCallId
                ? `${stableOutgoingCallRoom.roomName}_${originalSipCallId}`
                : `${stableOutgoingCallRoom.roomName}_noSip`;

              // Skip if already processed by fast detection
              if (callEndProcessed === callNotificationId) {
                return; // Already handled by fast detection, don't duplicate
              }

              // Mark as processed to prevent fast detection from duplicating
              setCallEndProcessed(callNotificationId);

              callLogger.warn(
                `SIP call ended in room ${stableOutgoingCallRoom.roomName} - call no longer in fetch results`,
                {
                  sipCallId: originalSipCallId,
                  roomName: stableOutgoingCallRoom.roomName,
                  totalActiveCalls: uniqueActiveCalls.length,
                  notificationId: callNotificationId,
                }
              );

              // Use hook method instead of legacy state management
              clearCallFromRoom();

              // Check if there are other calls in the room
              const hasOtherCallsInRoom = uniqueActiveCalls.some(
                (call) =>
                  call.roomName === stableOutgoingCallRoom.roomName &&
                  call.sipCallId !== stableOutgoingCallRoom.sipCallId
              );

              // Only clear MediaSFU state if this was not a room we created for outgoing calls
              // and there are no other calls in the room
              const shouldClearMediaSFU =
                !hasOtherCallsInRoom &&
                !isRoomCreatedByUs(stableOutgoingCallRoom.roomName!);

              if (shouldClearMediaSFU) {
                clearMediaSFUState(
                  "outgoing call ended, no other calls in room"
                );
              }

              // Show notification only if not already shown
              if (lastCallEndNotificationId !== callNotificationId) {
                showNotification(
                  "Call Ended",
                  hasOtherCallsInRoom
                    ? "The call has ended. The room is still active and ready for your next call."
                    : shouldClearMediaSFU
                    ? "The call has ended and the room has been closed."
                    : "The call has ended. The room remains active.",
                  "info"
                );
                setLastCallEndNotificationId(callNotificationId);
              }

              // Clear any dialpad state that might be showing
              setIsDialing(false);
              setPhoneNumber(""); // Clear the phone number for next call
            }
          }
        } else {
          consecutiveErrors++;
          callLogger.error(
            `Failed to poll calls (${consecutiveErrors}/${maxErrors}) - cached response failed`
          );

          // Stop polling after too many consecutive errors
          if (consecutiveErrors >= maxErrors) {
            callLogger.error("Too many consecutive errors, stopping polling");
            stopContinuousCallsPolling();
          }
        }
      } catch (error) {
        consecutiveErrors++;
        callLogger.error(
          `Error in continuous calls polling (${consecutiveErrors}/${maxErrors}):`,
          error
        );

        // Stop polling after too many consecutive errors
        if (consecutiveErrors >= maxErrors) {
          callLogger.error("Too many consecutive errors, stopping polling");
          stopContinuousCallsPolling();
        }
      }
    };

    // Initial poll
    pollCalls();

    // Set up interval polling every 6 seconds (reduced frequency due to caching)
    const interval = setInterval(pollCalls, 6000);
    callsPollingIntervalRef.current = interval;
    setCallsPollingInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    stopContinuousCallsPolling,
    getCallsWithCache,
    stableOutgoingCallRoom.isActive,
    stableOutgoingCallRoom.hasActiveSipCall,
    stableOutgoingCallRoom.roomName,
    stableOutgoingCallRoom.requestedRoomName,
    stableOutgoingCallRoom.sipCallId,
    // Remove unstable dependencies that change on every render
    // Keep only essential primitive values and stable functions
  ]);

  // Start continuous polling when component mounts
  useEffect(() => {
    startContinuousCallsPolling();

    return () => {
      stopContinuousCallsPolling();
    };
  }, [startContinuousCallsPolling, stopContinuousCallsPolling]);

    // Enhanced call end detection with faster monitoring for outgoing room calls
  useEffect(() => {
    // Only run enhanced monitoring if we have an active outgoing room with a call
    if (
      !stableOutgoingCallRoom.isActive ||
      !stableOutgoingCallRoom.hasActiveSipCall
    ) {
      return;
    }

    // Store the current call ID for tracking
    const currentSipCallId = stableOutgoingCallRoom.sipCallId;    // Use moderate polling for call end detection (4 seconds) since we have caching
    const interval = setInterval(async () => {
      try {
        // Quick call status check for the specific room using shared cache
        const allCallsResponse = await getCallsWithCache();
        if (allCallsResponse.success && allCallsResponse.data) {
          // Method 1: Check if our specific call still exists and is active by room name
          const currentCallInRoom = allCallsResponse.data.find(
            (call) =>
              (call.roomName === stableOutgoingCallRoom.roomName ||
                call.roomName === stableOutgoingCallRoom.requestedRoomName) &&
              call.status !== "ended" &&
              call.status !== "failed" &&
              call.status !== "completed" &&
              call.status !== "rejected" &&
              call.status !== "terminated" &&
              call.status !== "terminating" &&
              !call.callEnded
          );

          // Method 2: Also check by specific SIP call ID if we have one
          let specificCallExists = false;
          if (currentSipCallId) {
            specificCallExists = allCallsResponse.data.some(
              (call) =>
                call.sipCallId === currentSipCallId &&
                call.status !== "ended" &&
                call.status !== "failed" &&
                call.status !== "completed" &&
                call.status !== "rejected" &&
                call.status !== "terminated" &&
                call.status !== "terminating" &&
                !call.callEnded
            );
          }

          // Call ended if neither room-based nor ID-based detection finds it
          const callEnded =
            !currentCallInRoom &&
            (currentSipCallId ? !specificCallExists : true);

          // If call disappeared and we thought we had one, it ended
          if (callEnded && stableOutgoingCallRoom.hasActiveSipCall) {
            // Create a more reliable notification ID that includes the original SIP call ID from the room
            const originalSipCallId = stableOutgoingCallRoom.sipCallId;
            // Use a stable fallback when SIP call ID is missing to avoid duplicate notifications
            const callNotificationId = originalSipCallId
              ? `${stableOutgoingCallRoom.roomName}_${originalSipCallId}`
              : `${stableOutgoingCallRoom.roomName}_noSip`; // Stable fallback instead of timestamp

            // Prevent repeated processing of the same call end
            if (callEndProcessed === callNotificationId) {
              return; // Already processed this call end, skip
            }

            // Mark this call end as being processed
            setCallEndProcessed(callNotificationId);

            callLogger.warn(
              `Fast detection: Call ended in room ${stableOutgoingCallRoom.roomName}`,
              {
                method: currentSipCallId ? "room+id" : "room-only",
                sipCallId: currentSipCallId,
                originalSipCallId,
                roomCallFound: !!currentCallInRoom,
                specificCallFound: specificCallExists,
                totalActiveCalls: allCallsResponse.data.length,
                notificationId: callNotificationId,
              }
            );

            // Only show notification if we haven't already shown it for this specific call
            if (lastCallEndNotificationId !== callNotificationId) {
              showNotification(
                "Call Ended",
                "The call has ended. Your voice room is still available for making another call.",
                "info"
              );

              // Mark this notification as shown for this specific call
              setLastCallEndNotificationId(callNotificationId);
            }

            // Preserve the room but mark as no longer having active call
            clearCallFromRoom();

            // Clear call UI state
            setIsDialing(false);
            setPhoneNumber("");
          }
        }
      } catch (error) {
        callLogger.debug("Call monitoring error (non-critical):", error);
      }
    }, 4000); // Check every 4 seconds with caching

    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    stableOutgoingCallRoom.isActive,
    stableOutgoingCallRoom.hasActiveSipCall,
    stableOutgoingCallRoom.roomName,
    stableOutgoingCallRoom.requestedRoomName,
    stableOutgoingCallRoom.sipCallId,
    getCallsWithCache,
    // Remove unstable function dependencies that change on every render
  ]);

  // Background room state verification - clean up stale room state
  useEffect(() => {
    // Only run this check if we think we have an active room
    if (!currentRoomName || !isConnectedToRoom) {
      return;
    }

    const verifyRoomState = () => {
      // Check if room has any active calls associated with it
      const hasCallsInRoom = currentCalls.some(
        (call) => call.roomName === currentRoomName
      );

      // Check if this is our active outgoing setup room (valid even without calls)
      const isOurActiveOutgoingRoom =
        hookOutgoingCallRoom?.isActive &&
        hookOutgoingCallRoom.roomName === currentRoomName;

      // Check if this is a room we created ourselves (valid even without calls initially)
      const wasRoomCreatedByUs = currentRoomName
        ? isRoomCreatedByUs(currentRoomName)
        : false;

      // Room is valid if it has calls OR it's our outgoing setup room OR we created it
      // IMPORTANT: Be conservative about clearing outgoing setup rooms to prevent auto-hiding
      const isValidRoom =
        hasCallsInRoom || 
        isOurActiveOutgoingRoom || 
        wasRoomCreatedByUs ||
        // Additional protection: if this room was recently used for outgoing calls, keep it
        (hookOutgoingCallRoom?.roomName === currentRoomName);

      // If no calls associated with this room AND it's not our setup room, it might be stale
      if (!isValidRoom) {
        roomLogger.warn(
          "Background check: MediaSFU room has no associated calls and is not our setup room - potential stale state:",
          {
            roomName: currentRoomName,
            isConnected: isConnectedToRoom,
            totalActiveCalls: currentCalls.length,
            allCallRooms: currentCalls.map((c) => c.roomName),
            isOurActiveOutgoingRoom,
            wasRoomCreatedByUs,
            hasCallsInRoom,
            hookOutgoingCallRoom: hookOutgoingCallRoom
              ? {
                  isActive: hookOutgoingCallRoom.isActive,
                  roomName: hookOutgoingCallRoom.roomName,
                  hasActiveSipCall: hookOutgoingCallRoom.hasActiveSipCall,
                }
              : null,
            validation: {
              hasCallsInRoom,
              isOurActiveOutgoingRoom,
              wasRoomCreatedByUs,
              isValidRoom,
            },
          }
        );

        // Clear the stale room state
        clearMediaSFUState(
          "background verification - no associated calls and not our setup room"
        );

        // Clear any related outgoing room state
        if (
          hookOutgoingCallRoom?.isActive &&
          hookOutgoingCallRoom.roomName === currentRoomName
        ) {
          setOutgoingCallRoom(null);
          AsyncStorage.removeItem("outgoingCallRoom");
        }
      } else {
        // Room is valid - log for debugging
        roomLogger.debug("Background check: MediaSFU room is valid:", {
          roomName: currentRoomName,
          hasCallsInRoom,
          isOurActiveOutgoingRoom,
          wasRoomCreatedByUs,
          hookOutgoingCallRoom: hookOutgoingCallRoom
            ? {
                isActive: hookOutgoingCallRoom.isActive,
                roomName: hookOutgoingCallRoom.roomName,
                hasActiveSipCall: hookOutgoingCallRoom.hasActiveSipCall,
              }
            : null,
        });
      }
    };

    // Check immediately and then every 10 seconds
    verifyRoomState();
    const interval = setInterval(verifyRoomState, 10000);

    return () => clearInterval(interval);
  }, [
    currentRoomName,
    isConnectedToRoom,
    currentCalls,
    clearMediaSFUState,
    hookOutgoingCallRoom,
    isRoomCreatedByUs,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (callStatusInterval) {
        clearInterval(callStatusInterval);
      }
      if (callsPollingInterval) {
        clearInterval(callsPollingInterval);
      }
      if (roomCreationTimeoutRef) {
        clearTimeout(roomCreationTimeoutRef);
      }
    };
  }, [callStatusInterval, callsPollingInterval, roomCreationTimeoutRef]);

  // Live duration updates for active calls
  useEffect(() => {
    const interval = setInterval(() => {
      // Trigger re-render every second to update live durations
      setLiveDurationUpdateTrigger((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // React Native navigation protection - App state and back handler
  useEffect(() => {
    const hasActiveMediaSFU = isConnectedToRoom && currentRoomName;
    const hasActiveCalls = currentCalls.length > 0;
    const shouldProtect = hasActiveMediaSFU || hasActiveCalls;

    // Handle app state changes (background/foreground)
    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === 'background' && shouldProtect) {
        // App going to background - could warn user but not much we can do
        roomLogger.info('App going to background with active calls/room');
      }
    };

    // Handle back button press
    const handleBackPress = () => {
      if (shouldProtect) {
        const message = hasActiveMediaSFU
          ? `You have an active MediaSFU room connection${
              currentRoomName ? ` (${currentRoomName})` : ""
            }. Going back will disconnect you and may end any ongoing calls.`
          : "You have active calls. Going back may affect your call experience.";

        setNavigationConfirmation({
          isOpen: true,
          message,
          onConfirm: () => {
            setNavigationConfirmation({
              isOpen: false,
              onConfirm: null,
              onCancel: null,
              message: "",
            });
            // Clear MediaSFU state before navigation
            if (hasActiveMediaSFU) {
              clearMediaSFUState("back navigation from calls page");
            }
            // Allow back navigation by returning false
            return false;
          },
          onCancel: () => {
            setNavigationConfirmation({
              isOpen: false,
              onConfirm: null,
              onCancel: null,
              message: "",
            });
          },
        });
        return true; // Prevent default back action
      }
      return false; // Allow default back action
    };

    // Add listeners when protection is needed
    if (shouldProtect) {
      const appStateSubscription = AppState.addEventListener('change', handleAppStateChange);
      const backHandlerSubscription = BackHandler.addEventListener('hardwareBackPress', handleBackPress);

      // Log protection status for debugging
      roomLogger.info("Navigation protection enabled", {
        hasActiveMediaSFU,
        hasActiveCalls,
        currentRoomName,
        isConnectedToRoom,
      });

      return () => {
        appStateSubscription?.remove();
        backHandlerSubscription.remove();
      };
    }
  }, [isConnectedToRoom, currentRoomName, currentCalls.length, clearMediaSFUState]);

  const { config } = useVoipConfig();

  // SIP Configuration State
  const [sipConfigs, setSipConfigs] = useState<SIPConfig[]>([]);
  const [sipLoading, setSipLoading] = useState(false);

  // Check if a SIP config is eligible for outgoing calls
  const isEligibleForOutgoing = useCallback((config: SIPConfig) => {
    const isSipActive = config.supportSipActive !== false;
    const allowsOutgoing = config.allowOutgoing !== false;
    return isSipActive && allowsOutgoing;
  }, []);

  // Validate E.164 format
  const isValidE164 = useCallback((phoneNumber: string): boolean => {
    try {
      // Remove any whitespace
      const cleanNumber = phoneNumber.trim();
      
      // Check if it starts with + (E.164 requirement)
      if (!cleanNumber.startsWith('+')) {
        return false;
      }
      
      // Use libphonenumber-js for validation
      return isValidPhoneNumber(cleanNumber);
    } catch (error) {
      return false;
    }
  }, []);

  // Format phone number as user types
  const formatPhoneNumber = useCallback((value: string): string => {
    try {
      // Remove all non-digit and non-plus characters
      let cleaned = value.replace(/[^\d+]/g, "");

      // Ensure it starts with +
      if (!cleaned.startsWith("+")) {
        cleaned = "+" + cleaned.replace(/\+/g, "");
      } else {
        // Remove any additional + signs after the first one
        cleaned = "+" + cleaned.substring(1).replace(/\+/g, "");
      }

      // Limit to 16 characters (+ and up to 15 digits for E.164)
      cleaned = cleaned.substring(0, 16);

      // Try to format using libphonenumber-js for better formatting
      if (cleaned.length > 2) {
        const formatter = new AsYouType();
        const formatted = formatter.input(cleaned);
        // If the formatted version is valid and properly formatted, use it
        if (formatted && formatted.startsWith('+')) {
          return formatted;
        }
      }
      
      return cleaned;
    } catch (error) {
      // Fallback to basic formatting if libphonenumber-js fails
      let cleaned = value.replace(/[^\d+]/g, "");
      if (!cleaned.startsWith("+")) {
        cleaned = "+" + cleaned.replace(/\+/g, "");
      } else {
        cleaned = "+" + cleaned.substring(1).replace(/\+/g, "");
      }
      return cleaned.substring(0, 16);
    }
  }, []);

  // Format phone number for display (international format for readability)
  const formatPhoneNumberForDisplay = useCallback((phoneNumber: string): string => {
    try {
      const cleanNumber = phoneNumber.trim();
      
      if (!cleanNumber.startsWith('+')) {
        return cleanNumber;
      }
      
      const parsed = parsePhoneNumber(cleanNumber);
      if (parsed && parsed.isValid()) {
        // Return in international format for display
        return parsed.formatInternational();
      }
      
      return cleanNumber;
    } catch (error) {
      return phoneNumber;
    }
  }, []);

  // Get eligibility reason for display
  const getEligibilityReason = useCallback((config: SIPConfig) => {
    const isSipActive = config.supportSipActive !== false;
    const allowsOutgoing = config.allowOutgoing !== false;

    if (!isSipActive && !allowsOutgoing) {
      return "SIP inactive & outgoing disabled";
    } else if (!isSipActive) {
      return "SIP inactive";
    } else if (!allowsOutgoing) {
      return "Outgoing calls disabled";
    }
    return null;
  }, []);

  // Fetch SIP configurations from MediaSFU
  const fetchSipConfigs = useCallback(async () => {
    apiLogger.info('fetchSipConfigs called - checking API credentials...');
    
    if (!config.api.key || !config.api.userName) {
      apiLogger.warn('API not configured - missing credentials:', {
        hasApiKey: !!config.api.key,
        hasUserName: !!config.api.userName,
      });
      return;
    }

    setSipLoading(true);
    try {
      const configs = await callService.getSipConfigs();
      setSipConfigs(configs || []);
      
      // Auto-select first eligible number for outgoing calls
      if (configs && configs.length > 0 && !selectedFromNumber) {
        const eligibleConfig = configs.find(
          (config: SIPConfig) =>
            config.supportSipActive !== false &&
            config.allowOutgoing !== false
        );
        if (eligibleConfig) {
          const numberToUse = eligibleConfig.contactNumber || eligibleConfig.phoneNumber || "";
          setSelectedFromNumber(numberToUse);
        }
      }
    } catch (error) {
      callLogger.error("Failed to fetch SIP configs:", error);
    } finally {
      setSipLoading(false);
    }
  }, [config.api.key, config.api.userName, selectedFromNumber]);

  // Fetch SIP configs on mount - run once every time we visit this page
  useEffect(() => {
    // Always try to fetch SIP configs when page loads
    // The fetchSipConfigs function will handle API configuration checks internally
    fetchSipConfigs();
  }, [fetchSipConfigs]); // Only depend on fetchSipConfigs, not isApiConfigured

  // Auto-clear manually closed room flag after 30 seconds
  useEffect(() => {
    if (roomManuallyClosedRef) {
      const timeoutId = setTimeout(() => {
        setRoomManuallyClosedRef(null);
      }, 30000);

      return () => clearTimeout(timeoutId);
    }
  }, [roomManuallyClosedRef]);

  // Selected call mode state: 'bot' | 'voice' | null
  const [selectedCallMode, setSelectedCallMode] = useState<'bot' | 'voice' | null>(null);

  // Default mode auto-selection when entering choose-mode
  useEffect(() => {
    if (callFlowStep !== 'choose-mode' || selectedCallMode) return;

    const selectedConfig = sipConfigs.find(
      (config) => (config.contactNumber || config.phoneNumber) === selectedFromNumber
    );
    const autoAgent = selectedConfig?.autoAgent;
    const autoAgentAvailable =
      autoAgent?.enabled &&
      autoAgent.type &&
      (autoAgent.type === 'AI' || autoAgent.type === 'IVR' || autoAgent.type === 'PLAYBACK');
    const botModeAvailable = autoAgentAvailable && autoAgent?.outgoingType === 'AI';

    const hasExistingActiveRoom = (isConnectedToRoom && currentRoomName) || hookOutgoingCallRoom?.isActive;
    const canCreateNewRoom = !isConnectedToRoom && !hookOutgoingCallRoom?.isActive && !!selectedFromNumber;
    const voiceModeAvailable = !!(hasExistingActiveRoom || canCreateNewRoom);

    // Prefer bot when available and user mic/room not ready; otherwise choose voice if available
    if (botModeAvailable && (!hasExistingActiveRoom || !isMicrophoneEnabled)) {
      setSelectedCallMode('bot');
    } else if (voiceModeAvailable) {
      setSelectedCallMode('voice');
    }
  }, [
    callFlowStep,
    selectedCallMode,
    sipConfigs,
    selectedFromNumber,
    isConnectedToRoom,
    currentRoomName,
    hookOutgoingCallRoom?.isActive,
    isMicrophoneEnabled,
  ]);

  // Room meta helpers defined earlier in file

  const handleMakeCall = async () => {
    // Update flow to connecting step
    setCallFlowStep("connecting");

    if (!phoneNumber || !selectedFromNumber) {
      // Reset call flow step and stop loading
      setCallFlowStep("choose-mode");
      setIsDialing(false);
      return;
    }

    // Validate E.164 format
    if (!isValidE164(phoneNumber)) {
      callLogger.error(
        "Invalid phone number format. Must be E.164 format (e.g., +15551234567)"
      );
      showNotification(
        "Invalid Phone Number",
        "Please enter a valid phone number in E.164 format (e.g., +15551234567)",
        "error"
      );
      setCallFlowStep("enter-phone");
      setIsDialing(false);
      return;
    }

    // Check if selected number is eligible for outgoing calls
    const selectedConfig = sipConfigs.find(
      (config) =>
        (config.contactNumber || config.phoneNumber) === selectedFromNumber
    );

    if (!selectedConfig) {
      callLogger.error("No SIP configuration found for selected number");
      showNotification(
        "Configuration Error",
        "No SIP configuration found for the selected number. Please try a different number.",
        "error"
      );
      setCallFlowStep("select-number");
      setIsDialing(false);
      return;
    }

    // Check if we're trying to create a room that was manually closed
    if (roomManuallyClosedRef) {
      showNotification(
        "Room Closed",
        "The previous room was manually closed. Please wait or use a different approach.",
        "warning"
      );
      setCallFlowStep("choose-mode");
      setIsDialing(false);
      return;
    }

    if (!isEligibleForOutgoing(selectedConfig)) {
      callLogger.error("Selected number is not eligible for outgoing calls");
      showNotification(
        "Number Not Eligible",
        "The selected number is not eligible for outgoing calls. Please select a different number.",
        "error"
      );
      setCallFlowStep("select-number");
      setIsDialing(false);
      return;
    }

  // Check if room is required for this call
    const autoAgent = selectedConfig.autoAgent;
    const autoAgentAvailable =
      autoAgent?.enabled &&
      autoAgent.type &&
      (autoAgent.type === "AI" ||
        autoAgent.type === "IVR" ||
        autoAgent.type === "PLAYBACK");

    // CRITICAL: Check outgoingType is set to AI for bot outgoing calls
    const botModeValidForOutgoing =
      autoAgentAvailable && autoAgent?.outgoingType === "AI";

    // If no AI agent with proper outgoingType and user wants to talk, they must have an active room
  if (!botModeValidForOutgoing && (!isConnectedToRoom || !currentRoomName)) {
      callLogger.error(
        "Active MediaSFU room is required for calls without AI agent"
      );
      showNotification(
        "Room Required",
        "Please connect to a MediaSFU room first. An active room is required when you need to talk to the caller/callee.",
        "warning"
      );
      // Reset call flow step to stop the connecting spinner
      setCallFlowStep("choose-mode");
      setIsDialing(false);
      return;
    }

  setIsDialing(true);

    // Clear API cache to ensure fresh data for call initiation
    clearApiCache();

    // Reset call end notification ID when starting a new call
    setLastCallEndNotificationId(null);

    // Reset call end processing flag for new call
    setCallEndProcessed(null);

    // Auto-collapse dialpad when call starts
    setIsDialpadCollapsed(true);

    // Check if we're making a call from an outgoing setup room without microphone enabled
    const isInOutgoingSetupRoom =
      hookOutgoingCallRoom?.isActive &&
      isConnectedToRoom &&
      currentRoomName === hookOutgoingCallRoom.roomName;
    const microphoneOffInOutgoingRoom =
      isInOutgoingSetupRoom && !isMicrophoneEnabled;

    // If we're in an outgoing setup room but microphone is off, ask for confirmation (unless already given)
    if (microphoneOffInOutgoingRoom && !microphoneConfirmationGiven) {
      callLogger.warn(
        "Making call from outgoing setup room with microphone disabled - requesting user confirmation"
      );

      // Show confirmation dialog and wait for user decision
      setMicrophoneConfirmation({
        isOpen: true,
        onConfirm: () => {
          setMicrophoneConfirmation({
            isOpen: false,
            onConfirm: null,
            onCancel: null,
          });
          setMicrophoneConfirmationGiven(true);
          // Restart the call process with confirmation given
          handleMakeCall();
        },
        onCancel: () => {
          setMicrophoneConfirmation({
            isOpen: false,
            onConfirm: null,
            onCancel: null,
          });
          setMicrophoneConfirmationGiven(false);
          // Reset call flow on cancel
          setCallFlowStep("choose-mode");
          setIsDialing(false);
        },
      });

      // Exit early - wait for user decision
      return;
    }

    // Clear the confirmation flag after using it
    if (microphoneConfirmationGiven) {
      setMicrophoneConfirmationGiven(false);
    }

    try {
      let roomName: string;
      let participantName: string;

      // Step 1: Use outgoing call room if available, otherwise create one
      if (
        outgoingCallRoom?.isActive &&
        isConnectedToRoom &&
        currentRoomName === outgoingCallRoom.roomName
      ) {
        // Use the active outgoing call room - validate we're actually connected to it
        roomName = outgoingCallRoom.roomName; // This is the real MediaSFU room name
        participantName = currentParticipantName;
      } else if (isConnectedToRoom && currentRoomName) {
        // User is connected to some other MediaSFU room - use it
        roomName = currentRoomName;
        participantName = currentParticipantName;
      } else {
        // No room available - determine approach based on autoAgent configuration
        const autoAgent = selectedConfig.autoAgent;
        const autoAgentAvailable =
          autoAgent?.enabled &&
          autoAgent.type &&
          (autoAgent.type === "AI" ||
            autoAgent.type === "IVR" ||
            autoAgent.type === "PLAYBACK");
        const botModeValidForOutgoing =
          autoAgentAvailable && autoAgent?.outgoingType === "AI";

  if (botModeValidForOutgoing && selectedCallMode !== 'voice') {
          // Option 2: Using bot - explicitly create MediaSFU room via API to get a valid roomName

          // Ensure the participant name is properly formatted for MediaSFU
          const rawParticipantName = currentParticipantName || "voipuser";
          const callParticipantName =
            rawParticipantName.replace(/[^a-zA-Z0-9]/g, "").substring(0, 10) ||
            "voipuser";

          // Explicit POST to MediaSFU rooms API (align with voip_reactjs)
          const roomResp = await callService.createMediaRoom(callParticipantName, selectedDuration || 5);
          if (!roomResp.success || !roomResp.data?.roomName) {
            setIsDialing(false);
            setCallFlowStep("choose-mode");
            showNotification(
              "Room Creation Failed",
              roomResp.error || "Unable to create media room. Please try again.",
              "error"
            );
            callLogger.error("Failed to create MediaSFU room for bot call", {
              error: roomResp.error,
            });
            return;
          }

          roomName = roomResp.data.roomName;
          participantName = roomResp.data.participantName || callParticipantName;
          await setRoomMetaOriginal(roomName, participantName);

          callLogger.info("Created MediaSFU room for bot call:", {
            roomName,
            participantName,
            duration: selectedDuration || 5,
          });
        } else {
          // Option 1: Using own audio - create outgoing call room and render media room

          // CRITICAL FIX: Use the same participant name for both room creation and call making
          // Ensure the participant name is properly formatted for MediaSFU
          const rawParticipantName = currentParticipantName || "voipuser";
          const callParticipantName =
            rawParticipantName.replace(/[^a-zA-Z0-9]/g, "").substring(0, 10) ||
            "voipuser";

          // Generate temporary room name - MediaSFU will provide the real one
          const tempRoomName = `outgoing_call_${Date.now()}_${Math.random()
            .toString(36)
            .substr(2, 6)}`;
          const displayName = `Outgoing Call Room (${callParticipantName})`;

          // Use hook's createOutgoingRoom to setup room state
          createOutgoingRoom(tempRoomName, displayName);

          // Set room state for MediaSFU - MediaSFUHandler will create the actual room
          setRequestedRoomName(tempRoomName);
          setCurrentRoomName(tempRoomName);
          setCurrentParticipantName(callParticipantName);

          roomName = tempRoomName;
          participantName = callParticipantName;
          await setRoomMetaOriginal(tempRoomName, participantName);

          // Wait for room to be set up
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
      }

      // Step 2: Determine startWithInitiatorAudio based on MediaSFU room state and autoAgent configuration
      const autoAgent = selectedConfig.autoAgent;
      const autoAgentAvailable =
        autoAgent?.enabled &&
        autoAgent.type &&
        (autoAgent.type === "AI" ||
          autoAgent.type === "IVR" ||
          autoAgent.type === "PLAYBACK");
      const botModeValidForOutgoing =
        autoAgentAvailable && autoAgent?.outgoingType === "AI";

      // startWithInitiatorAudio: true if user is connected to MediaSFU room with microphone enabled,
      // or if no valid bot mode is available
      // This ensures the user has control over their audio participation
      const startWithInitiatorAudio =
        !botModeValidForOutgoing || (isConnectedToRoom && isMicrophoneEnabled);

      if (!startWithInitiatorAudio) {
        //wait for 250ms
        await new Promise((resolve) => setTimeout(resolve, 250));
      }

      // Step 3: Make the call using the enhanced callService with proper parameters
      const phoneNumberCleaned = phoneNumber.replace(/[^\d+]/g, "");
      const selectedFromNumberCleaned = selectedFromNumber.replace(/[^\d+]/g, "");
      const result = await callService.makeCallWithOptions(
        phoneNumberCleaned, // calledDid (E.164 format)
        selectedFromNumberCleaned, // callerIdNumber
        roomName, // roomName (MediaSFU room)
        participantName, // initiatorName
        {
          startWithInitiatorAudio, // Whether the initiator (user) starts with audio
          calleeDisplayName: "sipcallee",
          useBackupPeer: false,
        }
      );

      if (result.success) {
        const callType = botModeValidForOutgoing ? "AI agent" : "human";
        const roomSource =
          isConnectedToRoom && currentRoomName ? "existing" : "new";

        callLogger.info(
          `Call initiated successfully (${callType} mode) using ${roomSource} room: ${roomName}`
        );

        // Clear room manually closed flag on successful call initiation
        if (roomManuallyClosedRef) {
          roomLogger.info(
            "Clearing room manually closed flag after successful call initiation"
          );
          setRoomManuallyClosedRef(null);
        }

        // Start monitoring call status with the room name
        // The actual room name will be updated via onRoomNameUpdate callback from MediaSFU
        if (result.data?.sipCallId) {
          startCallMonitoring(result.data.sipCallId, roomName);

          // For bot calls, set up timeout detection (60 seconds) - no outgoing room state needed
          if (!startWithInitiatorAudio) {
            const timeoutId = setTimeout(() => {
              // Check if call is still in waiting state after 60 seconds
              const currentCall = currentCalls.find(
                (call) =>
                  call.sipCallId === result.data.sipCallId ||
                  call.roomName === roomName
              );

              if (
                currentCall &&
                (currentCall.status === "connecting" ||
                  currentCall.status === "ringing")
              ) {
                callLogger.warn(
                  "Bot call timeout after 60 seconds - marking as failed"
                );
                showNotification(
                  "Call Timeout",
                  "Call attempt timed out after 60 seconds",
                  "warning"
                );
              }
            }, 60000); // 60 seconds

            setBotCallTimeoutRef(timeoutId);
          }

          // Update outgoing call room with SIP call ID and initial call data (only for human calls)
          if (startWithInitiatorAudio && outgoingCallRoom?.isActive) {
            setOutgoingCallRoom((prev) =>
              prev
                ? {
                    ...prev,
                    hasActiveSipCall: true,
                    sipCallId: result.data.sipCallId,
                    callData: {
                      status: "CONNECTING",
                      direction: "OUTGOING",
                      calledUri: phoneNumber,
                      callerIdRaw: selectedFromNumber,
                      startTimeISO: new Date().toISOString(),
                      durationSeconds: 0,
                      onHold: false,
                      activeMediaSource: startWithInitiatorAudio
                        ? "human"
                        : "agent",
                      humanParticipantName: participantName,
                    },
                  }
                : null
            );
          }
        } else {
          // If no sipCallId returned immediately, wait for it to appear in call polling
          // This can happen with some SIP providers that return call ID after initial setup
          callLogger.warn(
            "No sipCallId returned immediately, will wait for call polling to detect it",
            {
              roomName,
              phoneNumber,
            }
          );

          // Start a short-term monitoring to detect when the call appears with a proper ID
          let attempts = 0;
          const maxAttempts = 10; // 10 attempts over 30 seconds

          const waitForCallId = setInterval(async () => {
            attempts++;
            try {
              const allCalls = await getCallsWithCache();
              if (allCalls.success && allCalls.data) {
                // Look for a call that matches our EXACT room name only
                // This ensures we only detect calls that are actually part of our current room
                const detectedCall = allCalls.data.find(
                  (c) => c.roomName === roomName
                );

                if (detectedCall && detectedCall.sipCallId) {
                  clearInterval(waitForCallId);
                  startCallMonitoring(
                    detectedCall.sipCallId,
                    detectedCall.roomName
                  );

                  // Update current room name if the call was created in a different room
                  if (detectedCall.roomName !== roomName) {
                    setCurrentRoomName(detectedCall.roomName);
                  }

                  // Update outgoing room with detected call data
                  if (outgoingCallRoom?.isActive) {
                    setOutgoingCallRoom((prev) =>
                      prev
                        ? {
                            ...prev,
                            hasActiveSipCall: true,
                            sipCallId: detectedCall.sipCallId,
                            roomName: detectedCall.roomName, // Use the actual room name
                            callData: {
                              status: detectedCall.status,
                              direction: detectedCall.direction,
                              calledUri: detectedCall.calledUri,
                              callerIdRaw: detectedCall.callerIdRaw,
                              startTimeISO: detectedCall.startTimeISO,
                              durationSeconds: detectedCall.durationSeconds,
                              onHold: detectedCall.onHold,
                              activeMediaSource: detectedCall.activeMediaSource,
                              humanParticipantName:
                                detectedCall.humanParticipantName,
                            },
                          }
                        : null
                    );
                  }
                  return;
                }
              }

              if (attempts >= maxAttempts) {
                clearInterval(waitForCallId);
                callLogger.warn(
                  "Failed to detect call with sipCallId after maximum attempts",
                  {
                    attempts,
                    roomName,
                  }
                );
              }
            } catch (error) {
              callLogger.error("Error while waiting for call ID:", error);
            }
          }, 3000); // Check every 3 seconds
        }

        setPhoneNumber(""); // Reset to + instead of empty

        // Move to connected step and auto-hide dialer
        setCallFlowStep("connected");
        setTimeout(() => {
          setShowDialer(false);
          setCallFlowStep("closed");
        }, 2000); // Hide after 2 seconds to show success
      } else {
        // Handle API response with success: false
        callLogger.error(
          "Failed to initiate call - API returned success: false:",
          result.error || result
        );
        setIsDialpadCollapsed(false); // Expand dialpad on failure

        // Show user-friendly notification for call failure
        showNotification(
          "Call Failed",
          extractErrorMessage(result.error) ||
            "The outgoing call could not be initiated. Please try again.",
          "error"
        );

        // Clean up outgoing room state on call failure (only for human calls with MediaSFU display)
        if (startWithInitiatorAudio && outgoingCallRoom?.isActive) {
          setOutgoingCallRoom(null);
          AsyncStorage.removeItem("outgoingCallRoom");
          clearOutgoingRoom();
          resetSipParticipantTracking();
        }

        // Return to choose-mode step on failure
        setCallFlowStep("choose-mode");
      }
    } catch (error) {
      callLogger.error("Failed to make call:", error);
      setIsDialpadCollapsed(false); // Expand dialpad on failure

      // Show clean error message to user
      showNotification(
        "Call Failed", 
        extractErrorMessage(error),
        "error"
      );

      // Return to choose-mode step on error
      setCallFlowStep("choose-mode");
    } finally {
      setIsDialing(false);
    }
  };

  const handleMicrophoneChange = useCallback((enabled: boolean) => {
    setIsMicrophoneEnabled(enabled);
  }, []);

  const handleRoomNameUpdate = useCallback(
    async (realRoomName: string) => {
      const previousRoomName = currentRoomName;
      setCurrentRoomName(realRoomName);

      // If this is a real room name for a room we created, mark the new name as created by us too
      if (
        requestedRoomName &&
        isRoomCreatedByUs(requestedRoomName) &&
        realRoomName !== requestedRoomName
      ) {
        markRoomAsCreated(realRoomName);
        try {
          await propagateRoomMeta(requestedRoomName, realRoomName);
        } catch {}
      }

      // Update outgoing call room with real MediaSFU room name using hook
      if (
        outgoingCallRoom?.isActive &&
        outgoingCallRoom.requestedRoomName &&
        (previousRoomName === outgoingCallRoom.requestedRoomName ||
          previousRoomName === outgoingCallRoom.roomName)
      ) {
        updateRoomName(realRoomName);
      }

      // Update any active call monitoring to use the real room name
      if (callStatusInterval && previousRoomName !== realRoomName) {
        // Don't restart monitoring here - let it continue with the current sipCallId
        // The monitoring will pick up calls by roomName automatically
      }
    },
    [
      currentRoomName,
      requestedRoomName,
      outgoingCallRoom,
      callStatusInterval,
      updateRoomName,
      isRoomCreatedByUs,
      markRoomAsCreated,
      propagateRoomMeta,
    ]
  );

  const handleRoomDisconnect = useCallback(
    (reason?: {
      type: "user" | "room-ended" | "socket-error";
      details?: string;
    }) => {
      // Enhanced room disconnect with state preservation logic based on actual disconnect reason
      const roomEnded =
        reason?.type === "room-ended" || reason?.type === "socket-error";

      // Auto-detect room ending if no reason provided (backward compatibility)
      let finalRoomEnded = roomEnded;
      if (!reason) {
        const appearsToBeRoomEnding = !isConnectedToRoom || !currentRoomName;
        if (appearsToBeRoomEnding) {
          finalRoomEnded = true;
        }
      }

      const hasActiveCalls = currentCalls.length > 0;
      const isOurOutgoingRoom =
        outgoingCallRoom?.isActive &&
        currentRoomName === outgoingCallRoom.roomName;

      // Determine if this room has active SIP calls that belong to it
      const roomHasActiveSipCalls = currentCalls.some(
        (call) => call.roomName === currentRoomName
      );

      // Check if this is specifically our media booth (outgoing room setup for voice calls)
      const isOurMediaBooth =
        isOurOutgoingRoom &&
        outgoingCallRoom?.displayName?.includes("Outgoing Call Room");

      // CRITICAL: Don't show notifications or clear state if we're just switching rooms
      if (isRoomSwitching) {
        roomLogger.info(
          "Room disconnect during room switching - suppressing notifications",
          {
            currentRoom: currentRoomName,
            reason: reason?.details || "Room switching in progress",
          }
        );
        return;
      }

      // CRITICAL: If the MediaSFU room itself has ended, ALWAYS clear state
      // The room no longer exists so there's no point in trying to preserve the connection
      if (finalRoomEnded) {
        clearMediaSFUState(
          `MediaSFU room ended: ${reason?.details || "Unknown reason"}`
        );

        // Show notification for connection timeout or other socket errors
        if (
          reason?.type === "socket-error" &&
          reason?.details?.includes("timeout")
        ) {
          showNotification(
            "Connection Failed",
            "Room creation timed out. Please check your internet connection and try again.",
            "error"
          );
        } else if (reason?.type === "socket-error") {
          showNotification(
            "Connection Error",
            reason?.details ||
              "Failed to connect to the media room. Please try again.",
            "error"
          );
        }

        // Clear outgoing room state if this was our outgoing room
        if (isOurOutgoingRoom) {
          setOutgoingCallRoom(null);
          AsyncStorage.removeItem("outgoingCallRoom");
          setRoomManuallyClosedRef(currentRoomName);

          // Clear bot call timeout if active
          if (botCallTimeoutRef) {
            clearTimeout(botCallTimeoutRef);
            setBotCallTimeoutRef(null);
          }
        }

        return;
      }

      // For user-initiated disconnects, use the existing logic:
      // 1. For incoming calls: Always allow disconnect (they can leave safely without ending call)
      // 2. For our media booth with active calls: Warn user as disconnecting might end the call
      // 3. For our media booth without active calls: Allow disconnect (setup cancellation)
      // 4. For other outgoing rooms: Use standard logic
      if (isOurMediaBooth && roomHasActiveSipCalls) {
        // This is OUR media booth with active calls - warn user as disconnecting might end the call
        roomLogger.warn(
          "Our media booth disconnect requested with active calls - may end call"
        );
        showNotification(
          "Disconnect Warning",
          'Disconnecting from this media booth may end the active call since you created it. Use "End Call" button to properly terminate the call first.',
          "warning"
        );
        return;
      }

      // Safe to disconnect in these cases:
      // - No active calls
      // - Incoming call room (safe to leave)
      // - Outgoing room without active calls (setup cancellation)
      clearMediaSFUState("manual room disconnect");

      // CRITICAL: Clear outgoing room state when disconnecting
      if (isOurOutgoingRoom) {
        roomLogger.info(
          "Clearing outgoing room state on disconnect - room manually closed"
        );
        setOutgoingCallRoom(null);
        // Also clear from AsyncStorage
        AsyncStorage.removeItem("outgoingCallRoom");

        // Set flag to prevent auto-recreation for bot calls
        setRoomManuallyClosedRef(currentRoomName);

        // Clear bot call timeout if active
        if (botCallTimeoutRef) {
          clearTimeout(botCallTimeoutRef);
          setBotCallTimeoutRef(null);
        }
      }

      roomLogger.info("Disconnected from MediaSFU room", {
        clearedOutgoingRoom: isOurOutgoingRoom,
        wasIncomingRoom: !isOurOutgoingRoom && hasActiveCalls,
      });
    },
    [
      currentCalls,
      currentRoomName,
      outgoingCallRoom,
      botCallTimeoutRef,
      showNotification,
      clearMediaSFUState,
      isConnectedToRoom,
      isRoomSwitching,
    ]
  );

  // Manual room connection for testing - Enhanced with outgoing call room pattern
  const handleConnectToRoom = useCallback(async () => {
    if (!selectedFromNumber) {
      callLogger.warn("Please select a number first");
      return;
    }

    // ENHANCED ROOM VALIDATION: Check for existing valid rooms more thoroughly
    const hasActiveConnection = isConnectedToRoom && currentRoomName;
    const hasValidOutgoingRoom =
      hookOutgoingCallRoom?.isActive &&
      hookOutgoingCallRoom?.isMediaSFUConnected &&
      isConnectedToRoom &&
      currentRoomName === hookOutgoingCallRoom?.roomName;

    // Check if current room name is a valid MediaSFU room (starts with 's' or 'p', alphanumeric)
    const isCurrentRoomValidMediaSFU =
      currentRoomName && /^[sp][a-zA-Z0-9]+$/.test(currentRoomName);

    // If we have a valid MediaSFU room that's connected, don't create another one
    if (hasActiveConnection && isCurrentRoomValidMediaSFU) {
      roomLogger.info(
        "Already connected to valid MediaSFU room, not creating new one:",
        {
          currentRoom: currentRoomName,
          isConnected: isConnectedToRoom,
          isValidMediaSFUFormat: isCurrentRoomValidMediaSFU,
        }
      );
      showNotification(
        "Already Connected",
        `You're already connected to room: ${currentRoomName}`,
        "info"
      );
      return;
    }

    // Check if room creation is already in progress (prevent spam clicking)
    if (isCreatingRoom) {
      roomLogger.warn("Room creation already in progress");
      return;
    }

    // Only block if we have a VALID connection with actual purpose (calls or valid outgoing room)
    const shouldBlockForActiveRoom =
      hasValidOutgoingRoom ||
      (hasActiveConnection &&
        currentCalls.some((call) => call.roomName === currentRoomName));

    if (shouldBlockForActiveRoom) {
      showNotification(
        "Room Active",
        "You're already connected to an active room with ongoing calls",
        "warning"
      );
      return;
    }

    // Clean up any stale connections before creating new room
    if (
      hasActiveConnection &&
      !hasValidOutgoingRoom &&
      !isCurrentRoomValidMediaSFU
    ) {
      roomLogger.warn(
        "Detected stale room connection - cleaning up before creating new room:",
        {
          staleRoom: currentRoomName,
          isConnected: isConnectedToRoom,
          hasAssociatedCalls: currentCalls.some(
            (call) => call.roomName === currentRoomName
          ),
        }
      );

      clearMediaSFUState("cleaning stale room before new creation");

      if (hookOutgoingCallRoom?.isActive) {
        setOutgoingCallRoom(null);
        AsyncStorage.removeItem("outgoingCallRoom");
      }
    }

    const selectedConfig = sipConfigs.find(
      (config) =>
        (config.contactNumber || config.phoneNumber) === selectedFromNumber
    );

    if (!selectedConfig) {
      callLogger.error("No SIP configuration found for selected number");
      return;
    }

    try {
      // Clear any previous error state and set loading
      setRoomCreationError(null);
      setIsCreatingRoom(true);

      roomLogger.info("Setting up outgoing call room for call preparation...");

      // Generate participant name
      const participantName = currentParticipantName || "voipuser";

      // Generate a temporary room name - MediaSFU will provide the real one via MediaSFUHandler
      const tempRoomName = `outgoing_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 6)}`;
      const displayName = `Outgoing Call Room (${participantName})`;

      // Use hook's createOutgoingRoom to setup room state
      createOutgoingRoom(tempRoomName, displayName);

      // Mark this room as created by us for proper UI display
      markRoomAsCreated(tempRoomName);

      // Set room state for MediaSFU - the MediaSFUHandler with action="create" will handle room creation
      setRequestedRoomName(tempRoomName);
      setCurrentRoomName(tempRoomName);
      setCurrentParticipantName(participantName);

      roomLogger.info("Outgoing call room setup initiated:", {
        tempRoomName,
        displayName,
        participantName,
        duration: selectedDuration || 5,
        note: "MediaSFUHandler with action='create' will create the actual room",
        currentRoomNameBeforeUpdate: currentRoomName,
        willSetCurrentRoomNameTo: tempRoomName,
      });

      // Set up a timeout to handle creation failure
      const creationTimeout = setTimeout(() => {
        setIsCreatingRoom(false);
        setRoomCreationError("Room creation timed out. Please try again.");
        setRoomCreationTimeoutRef(null); // Clear the timeout ref
        roomLogger.error("Room creation timed out after 60 seconds");
      }, 60000); // 60 second timeout (1 minute)

      // Store timeout ref for cleanup
      setRoomCreationTimeoutRef(creationTimeout);

      // CRITICAL FIX: Give React time to render the MediaSFURoomDisplay component
      // which will trigger the actual room creation via MediaSFU

      // Small delay to ensure state updates are processed
      await new Promise((resolve) => setTimeout(resolve, 100));

      // hide the dialer when room is created
      setShowDialer(false);
    } catch (error) {
      setIsCreatingRoom(false);
      setRoomCreationError(`Failed to setup room: ${(error as Error).message}`);
      // Clear timeout if it was set
      if (roomCreationTimeoutRef) {
        clearTimeout(roomCreationTimeoutRef);
        setRoomCreationTimeoutRef(null);
      }
      callLogger.error("Error setting up outgoing call room:", error);
      showNotification(
        "Room Setup Failed",
        `Failed to setup voice room: ${(error as Error).message}`,
        "error"
      );
    }
  }, [
    selectedFromNumber,
    sipConfigs,
    isConnectedToRoom,
    currentRoomName,
    isCreatingRoom,
    hookOutgoingCallRoom?.isActive,
    hookOutgoingCallRoom?.isMediaSFUConnected,
    hookOutgoingCallRoom?.roomName,
    currentParticipantName,
    createOutgoingRoom,
    selectedDuration,
    showNotification,
    markRoomAsCreated,
    roomCreationTimeoutRef,
    clearMediaSFUState,
    currentCalls,
  ]);

  const handleDialpadPress = (digit: string) => {
    if (digit === 'clear') {
      setPhoneNumber('');
    } else if (digit === 'delete') {
      setPhoneNumber(prev => prev.slice(0, -1));
    } else {
      setPhoneNumber(prev => formatPhoneNumber(prev + digit));
    }
  };

  // Create combined calls array including outgoing call room (simplified approach)
  const allDisplayCalls = useMemo(() => {
    // Use enhanced calls from hook which includes dummy calls
    return [...enhancedCurrentCalls]; // Simplified - just return enhanced calls
  }, [enhancedCurrentCalls]); // Reduced dependencies

  // Render dialpad
  const renderDialpad = () => {
    const dialpadNumbers = [
      ['1', '2', '3'],
      ['4', '5', '6'],
      ['7', '8', '9'],
      ['*', '0', '#'],
    ];

    return (
      <View style={styles.dialpad}>
        {dialpadNumbers.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.dialpadRow}>
            {row.map((digit) => (
              <TouchableOpacity
                key={digit}
                style={styles.dialpadButton}
                onPress={() => handleDialpadPress(digit)}
              >
                <Text style={styles.dialpadText}>{digit}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}
        <View style={styles.dialpadRow}>
          <TouchableOpacity
            style={styles.dialpadActionButton}
            onPress={() => handleDialpadPress('clear')}
          >
            <Text style={styles.dialpadActionText}>Clear</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.dialpadActionButton}
            onPress={() => handleDialpadPress('delete')}
          >
            <Text style={styles.dialpadActionText}>⌫</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (!isApiConfigured) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.centeredContent}>
          <View style={styles.configPrompt}>
            <Text style={styles.configTitle}>VoIP Calling</Text>
            <Text style={styles.configDescription}>
              Configure your API settings to start making and receiving calls.
            </Text>
            <TouchableOpacity 
              style={styles.configButton}
              onPress={() => onNavigate?.('settings')}
            >
              <Text style={styles.configButtonText}>Go to Settings</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Check if already connected to an outgoing call room specifically
  const isConnectedToOutgoingRoom = Boolean(
    isConnectedToRoom &&
    currentRoomName &&
    (currentRoomName.startsWith("outgoing_") ||
      isRoomCreatedByUs(currentRoomName) ||
      (outgoingCallRoom?.isActive &&
        currentRoomName === outgoingCallRoom.roomName))
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />
      
      {/* Main Container with responsive design */}
      <View style={[styles.mainContainer, isDesktop && styles.desktopContainer]}>
        
        {/* Quick Settings Header */}
        <View style={[styles.quickSettingsHeader, isTablet && styles.quickSettingsHeaderLarge]}>
          <View style={styles.quickSettingsContent}>
            <Text style={[styles.headerTitle, isTablet && styles.headerTitleLarge]}>
              Outgoing Call Room
            </Text>
            <View style={[styles.quickActions, isTablet && styles.quickActionsLarge]}>
              <TouchableOpacity
                style={[
                  styles.createRoomButton,
                  (sipLoading || !selectedFromNumber || isConnectedToOutgoingRoom || isCreatingRoom) && styles.buttonDisabled
                ]}
                onPress={handleConnectToRoom}
                disabled={
                  sipLoading ||
                  !selectedFromNumber ||
                  isConnectedToOutgoingRoom ||
                  isCreatingRoom
                }
              >
                {isCreatingRoom ? (
                  <View style={styles.buttonContent}>
                    <ActivityIndicator color="white" size="small" />
                    <Text style={styles.buttonText}>Creating Room...</Text>
                  </View>
                ) : (
                  <Text style={styles.buttonText}>
                    {isConnectedToOutgoingRoom ? 'Connected to Room' : 'Create Voice Room'}
                  </Text>
                )}
              </TouchableOpacity>

              <DurationSelector
                selectedDuration={selectedDuration}
                onDurationChange={setSelectedDuration}
                disabled={isCreatingRoom || isConnectedToOutgoingRoom}
                style={styles.roomDurationSetting}
                inline={true}
              />

              {currentRoomName && isRoomCreatedByUs(currentRoomName) && (
                <View style={styles.currentRoomInfo}>
                  <Text style={styles.roomIndicator}>
                    Room: {currentRoomName} {isMicrophoneEnabled ? '🎤' : '🔇'}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Room Creation Loading Modal */}
        <Modal
          visible={isCreatingRoom}
          transparent={true}
          animationType="fade"
        >
          <View style={styles.modalOverlay}>
            <View style={styles.loadingModal}>
              <ActivityIndicator size="large" color="#667eea" />
              <Text style={styles.loadingTitle}>Creating Voice Room</Text>
              <Text style={styles.loadingDescription}>
                Setting up your conference room. This will only take a moment.
              </Text>
              {roomCreationError && (
                <View style={styles.errorSection}>
                  <Text style={styles.errorMessage}>{roomCreationError}</Text>
                  <TouchableOpacity
                    style={styles.retryButton}
                    onPress={() => {
                      setRoomCreationError(null);
                      handleConnectToRoom();
                    }}
                  >
                    <Text style={styles.retryButtonText}>🔄 Retry</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </Modal>

        <ScrollView style={styles.scrollView}>
          {/* MediaSFU Room Display */}
          {(() => {
            const shouldRender = currentRoomName &&
              (isConnectedToRoom || isCreatingRoom) &&
              (isRoomCreatedByUs(currentRoomName) || 
               (isCreatingRoom && hookOutgoingCallRoom?.isActive && hookOutgoingCallRoom.roomName === currentRoomName));
            
            return shouldRender;
          })() && (
              <View style={[styles.mediaSFUSection, isCreatingRoom && styles.mediaSFUSectionHidden]}>
                {/* Enhanced Status Header for the room */}
                <View style={styles.voiceRoomHeader}>
                  <View style={styles.roomHeaderGradient}>
                    <View style={styles.roomHeaderContent}>
                      {/* Compact Room Title - Make room title and name inline */}
                      <View style={styles.roomTitleSectionCompact}>
                        <Text style={styles.roomIcon}>🎤</Text>
                        <Text style={styles.roomTitle}>Voice Room:</Text>
                        <Text style={styles.roomNameDisplayInline} numberOfLines={1} ellipsizeMode="tail">{currentRoomName}</Text>
                        
                        {/* Status badges inline with title */}
                        <View style={styles.roomStatusBadgesInline}>
                          {hookOutgoingCallRoom?.isActive ? (
                            hookOutgoingCallRoom.hasActiveSipCall ? (
                              <View style={[styles.statusBadgeCompact, styles.statusActive]}>
                                <Text style={styles.statusBadgeTextCompact}>📞 Active Call</Text>
                              </View>
                            ) : (
                              <View style={[styles.statusBadgeCompact, styles.statusReady]}>
                                <Text style={styles.statusBadgeTextCompact}>✅ Ready</Text>
                              </View>
                            )
                          ) : (
                            <View style={[styles.statusBadgeCompact, styles.statusConnecting]}>
                              <Text style={styles.statusBadgeTextCompact}>🔄 Setup</Text>
                            </View>
                          )}

                          <View style={[
                            styles.statusBadgeCompact,
                            isConnectedToRoom ? styles.statusConnected : styles.statusDisconnected
                          ]}>
                            <Text style={styles.statusBadgeTextCompact}>
                              {isConnectedToRoom ? '🟢' : '🔴'}
                            </Text>
                          </View>

                          <View style={[
                            styles.statusBadgeCompact,
                            isMicrophoneEnabled ? styles.statusMicOn : styles.statusMicOff
                          ]}>
                            <Text style={styles.statusBadgeTextCompact}>
                              {isMicrophoneEnabled ? '🎤' : '🔇'}
                            </Text>
                          </View>
                        </View>
                      </View>

                      {/* Compact Inline Call Metadata */}
                      {hookOutgoingCallRoom?.isActive &&
                        hookOutgoingCallRoom.hasActiveSipCall &&
                        hookOutgoingCallRoom.callData && (
                          <View style={styles.roomCallMetadataInline}>
                            <Text style={styles.metadataItem} numberOfLines={1} ellipsizeMode="tail">
                              📞 {hookOutgoingCallRoom.callData.direction === "outgoing"
                                ? extractCleanIdentifier(hookOutgoingCallRoom.callData.calledUri || "")
                                : extractCleanIdentifier(hookOutgoingCallRoom.callData.callerIdRaw || "")}
                            </Text>
                            <Text style={[styles.metadataItem, getStatusStyle(hookOutgoingCallRoom.callData.status, styles)]} numberOfLines={1} ellipsizeMode="tail">
                              {hookOutgoingCallRoom.callData.status}
                            </Text>
                            {hookOutgoingCallRoom.callData.startTimeISO && (
                              <Text style={styles.metadataItem} numberOfLines={1} ellipsizeMode="tail">
                               
                              </Text>
                            )}
                          </View>
                        )}
                    </View>

                    {/* Compact Room Info Grid */}
                    <View style={styles.roomInfoGridCompact}>
                      <View style={styles.roomInfoCardCompact}>
                        <Text style={styles.infoLabelCompact}>From:</Text>
                        <Text style={styles.infoValueCompact} numberOfLines={1} ellipsizeMode="tail">{selectedFromNumber || 'Not selected'}</Text>
                      </View>

                      {/* Use conditional rendering instead of complex IIFE to avoid React Native issues */}
                      {currentRoomName &&
                        isRoomCreatedByUs(currentRoomName) &&
                        hookOutgoingCallRoom?.isActive &&
                        hookOutgoingCallRoom.roomName === currentRoomName &&
                        hookOutgoingCallRoom.hasActiveSipCall &&
                        hookOutgoingCallRoom.callData && (
                          <>
                            <View style={styles.roomInfoCardCompact}>
                              <Text style={styles.infoLabelCompact}>Status:</Text>
                              <Text style={styles.infoValueCompact} numberOfLines={1} ellipsizeMode="tail">{hookOutgoingCallRoom.callData.status}</Text>
                            </View>
                            <View style={styles.roomInfoCardCompact}>
                              <Text style={styles.infoLabelCompact}>
                                {hookOutgoingCallRoom.callData.direction === "outgoing" ? "To:" : "From:"}
                              </Text>
                              <Text style={styles.infoValueCompact} numberOfLines={1} ellipsizeMode="tail">
                                {hookOutgoingCallRoom.callData.direction === "outgoing"
                                  ? extractCleanIdentifier(hookOutgoingCallRoom.callData.calledUri || "")
                                  : extractCleanIdentifier(hookOutgoingCallRoom.callData.callerIdRaw || "")}
                              </Text>
                            </View>
                            {hookOutgoingCallRoom.callData.startTimeISO && (
                              <View style={styles.roomInfoCardCompact}>
                                <Text style={styles.infoLabelCompact}>Duration:</Text>
                                <Text style={styles.infoValueCompact} numberOfLines={1} ellipsizeMode="tail">
                                  {formatDurationWithFallback(hookOutgoingCallRoom.callData, liveDurationUpdateTrigger)}
                                </Text>
                              </View>
                            )}

                            {/* Call control actions for active call */}
                            <View style={styles.roomInfoCardCompact}>
                              {hookOutgoingCallRoom.callData.status === "active" ? (
                                <TouchableOpacity
                                  style={styles.endCallButton}
                                  onPress={() => {
                                    if (hookOutgoingCallRoom.sipCallId) {
                                      const existingCall = currentCalls.find(
                                        (c) => c.sipCallId === hookOutgoingCallRoom.sipCallId
                                      );
                                      if (existingCall) {
                                        handleEndCall(existingCall);
                                      } else {
                                        callService.hangupCall(hookOutgoingCallRoom.sipCallId);
                                      }
                                    }
                                  }}
                                  disabled={!hookOutgoingCallRoom.sipCallId}
                                >
                                  <Text style={styles.endCallButtonText}>🔴 End Call</Text>
                                </TouchableOpacity>
                              ) : hookOutgoingCallRoom.callData.status === "ringing" && hookOutgoingCallRoom.callData.direction !== "outgoing" ? (
                                <View style={styles.callControlActions}>
                                  <TouchableOpacity
                                    style={styles.answerCallButton}
                                    onPress={() => {
                                      if (hookOutgoingCallRoom.sipCallId) {
                                        const existingCall = currentCalls.find(
                                          (c) => c.sipCallId === hookOutgoingCallRoom.sipCallId
                                        );
                                        if (existingCall) {
                                          handleAnswerCall(existingCall);
                                        }
                                      }
                                    }}
                                    disabled={!hookOutgoingCallRoom.sipCallId}
                                  >
                                    <Text style={styles.answerCallButtonText}>📞 Answer</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={styles.declineCallButton}
                                    onPress={() => {
                                      if (hookOutgoingCallRoom.sipCallId) {
                                        const existingCall = currentCalls.find(
                                          (c) => c.sipCallId === hookOutgoingCallRoom.sipCallId
                                        );
                                        if (existingCall) {
                                          handleDeclineCall(existingCall);
                                        }
                                      }
                                    }}
                                    disabled={!hookOutgoingCallRoom.sipCallId}
                                  >
                                    <Text style={styles.declineCallButtonText}>❌ Decline</Text>
                                  </TouchableOpacity>
                                </View>
                              ) : (
                                <View style={styles.callStatusInfo}>
                                  <Text style={styles.callStatusText}>
                                    {hookOutgoingCallRoom.callData.status === "ringing" && hookOutgoingCallRoom.callData.direction === "outgoing"
                                      ? "📞 Ringing..."
                                      : hookOutgoingCallRoom.callData.status === "connecting"
                                      ? "🔄 Connecting..."
                                      : `📞 ${hookOutgoingCallRoom.callData.status}`}
                                  </Text>
                                </View>
                              )}
                            </View>
                          </>
                        )}

                      {/* Show outgoing call setup UI when no active call */}
                      {(!currentRoomName ||
                        !isRoomCreatedByUs(currentRoomName) ||
                        !hookOutgoingCallRoom?.isActive ||
                        hookOutgoingCallRoom.roomName !== currentRoomName ||
                        !hookOutgoingCallRoom.hasActiveSipCall ||
                        !hookOutgoingCallRoom.callData) &&
                        hookOutgoingCallRoom?.isActive && (
                          <>
                            <View style={styles.roomInfoCardCompact}>
                              <Text style={styles.infoLabelCompact}>Type:</Text>
                              <Text style={styles.infoValueCompact} numberOfLines={1} ellipsizeMode="tail">Outgoing Setup</Text>
                            </View>
                            <View style={styles.roomInfoCardCompact}>
                              <Text style={styles.infoLabelCompact}>Duration:</Text>
                              <Text style={styles.infoValueCompact} numberOfLines={1} ellipsizeMode="tail">{selectedDuration}min</Text>
                            </View>

                            {/* To Number input integrated into info grid */}
                            {!hookOutgoingCallRoom.hasActiveSipCall && (
                              <View style={styles.roomInfoCardCompact}>
                                <Text style={styles.infoLabelCompact}>To:</Text>
                                <TextInput
                                  style={styles.roomPhoneInputCompact}
                                  value={phoneNumber}
                                  onChangeText={(text) => setPhoneNumber(formatPhoneNumber(text))}
                                  placeholder="+1234567890"
                                  placeholderTextColor="#999"
                                  keyboardType="phone-pad"
                                  maxLength={16}
                                />
                              </View>
                            )}

                            {/* Quick Actions integrated into info grid */}
                            {!hookOutgoingCallRoom.hasActiveSipCall && (
                              <View style={styles.roomInfoCardCompact}>
                                <TouchableOpacity
                                  style={[
                                    styles.makeCallButtonCompact,
                                    (!isConnectedToRoom || !phoneNumber || !isValidE164(phoneNumber) || isDialing) && styles.buttonDisabled
                                  ]}
                                  onPress={handleMakeCall}
                                  disabled={!isConnectedToRoom || !phoneNumber || !isValidE164(phoneNumber) || isDialing}
                                >
                                  <Text style={styles.makeCallButtonTextCompact}>
                                    {isDialing ? '📞 Calling...' : '📞 Call'}
                                  </Text>
                                </TouchableOpacity>
                              </View>
                            )}
                          </>
                        )}

                      {/* Show joined room info when not an outgoing setup room */}
                      {(!hookOutgoingCallRoom?.isActive ||
                        (currentRoomName && !isRoomCreatedByUs(currentRoomName))) && (
                          <>
                            <View style={styles.roomInfoCardCompact}>
                              <Text style={styles.infoLabelCompact}>Type:</Text>
                              <Text style={styles.infoValueCompact} numberOfLines={1} ellipsizeMode="tail">Joined Room</Text>
                            </View>
                            <View style={styles.roomInfoCardCompact}>
                              <Text style={styles.infoLabelCompact}>Status:</Text>
                              <Text style={styles.infoValueCompact} numberOfLines={1} ellipsizeMode="tail">
                                {isConnectedToRoom ? '✅ Connected' : '🔄 Connecting'}
                              </Text>
                            </View>
                            <View style={styles.roomInfoCardCompact}>
                              <Text style={styles.infoLabelCompact}>User:</Text>
                              <Text style={styles.infoValueCompact} numberOfLines={1} ellipsizeMode="tail">{currentParticipantName || 'voipuser'}</Text>
                            </View>
                            <View style={styles.roomInfoCardCompact}>
                              <View style={styles.callStatusInfo}>
                                <Text style={styles.callStatusTextCompact}>💬 Ready for calls</Text>
                              </View>
                            </View>
                          </>
                        )}
                    </View>
                  </View>
                </View>

                {/* Show connecting indicator until MediaSFU connects */}
                {!isConnectedToRoom && (
                  <View style={{ alignItems: 'center', paddingVertical: 16 }}>
                    <ActivityIndicator color="#667eea" size="small" />
                    <Text style={{ marginTop: 8, color: '#4a5568' }}>
                      Connecting to media room...
                    </Text>
                    {isCreatingRoom && (
                      <Text style={{ marginTop: 4, color: '#a0aec0', fontSize: 12 }}>
                        Preparing room resources
                      </Text>
                    )}
                    {roomCreationError && (
                      <Text style={{ marginTop: 8, color: '#e53e3e' }}>
                        {roomCreationError}
                      </Text>
                    )}
                  </View>
                )}

                <MediaSFURoomDisplay
                  roomName={currentRoomName}
                  participantName={currentParticipantName}
                  isConnected={isConnectedToRoom}
                  callId={(() => {
                    // CRITICAL: Find SIP call by room name matching first (regardless of status)
                    // This is the correct logic - we poll data, find calls with same roomName as current room,
                    // and match by roomName to get proper SIP call details (sipCallId)
                    let activeCall = null;

                    if (currentRoomName) {
                      // First, try to find any active call in the current room (not terminated/failed)
                      activeCall = allDisplayCalls.find(
                        (call) =>
                          call.roomName === currentRoomName &&
                          call.status !== "ended" &&
                          call.status !== "failed" &&
                          call.status !== "completed" &&
                          call.status !== "rejected" &&
                          call.status !== "terminated" &&
                          call.status !== "terminating" &&
                          !call.callEnded
                      );
                    }

                    // If no call found in current room, but we have an outgoing room active,
                    // try to find calls that match the outgoing room name (discovery mode)
                    if (!activeCall && hookOutgoingCallRoom?.isActive) {
                      // Look for calls in the outgoing room (either real or requested name)
                      activeCall = allDisplayCalls.find(
                        (call) =>
                          (call.roomName === hookOutgoingCallRoom.roomName ||
                            call.roomName ===
                              hookOutgoingCallRoom.requestedRoomName) &&
                          call.status !== "ended" &&
                          call.status !== "failed" &&
                          call.status !== "completed" &&
                          call.status !== "rejected" &&
                          call.status !== "terminated" &&
                          call.status !== "terminating" &&
                          !call.callEnded
                      );
                    }

                    // Return the discovered SIP call ID
                    return activeCall?.sipCallId;
                  })()}
                  onConnectionChange={(connected) => {
                    setIsConnectedToRoom(connected);
                    if (!connected) {
                      // Room disconnected - could be user action or room ended

                      setCurrentRoomName("");
                      // Reset loading states on disconnection
                      setIsCreatingRoom(false);
                      setRoomCreationError(null);
                      // Clear roomManuallyClosedRef when successfully disconnecting
                      if (roomManuallyClosedRef) {
                        setRoomManuallyClosedRef(null);
                        roomLogger.info(
                          "roomManuallyClosedRef cleared on disconnect"
                        );
                      }
                    } else {
                      // Room successfully connected - clear loading states and timeout
                      setIsCreatingRoom(false);
                      setRoomCreationError(null);
                      // Clear room creation timeout on successful connection
                      if (roomCreationTimeoutRef) {
                        clearTimeout(roomCreationTimeoutRef);
                        setRoomCreationTimeoutRef(null);
                      }
                      // Clear roomManuallyClosedRef when successfully connecting
                      if (roomManuallyClosedRef) {
                        setRoomManuallyClosedRef(null);
                        roomLogger.info("roomManuallyClosedRef cleared on connect");
                      }
                    }
                  }}
                  onMicrophoneChange={handleMicrophoneChange}
                  onRoomNameUpdate={handleRoomNameUpdate}
                  onDisconnect={handleRoomDisconnect}
                  onEndCall={handleRoomEndCall}
                  onParticipantsUpdate={handleRoomParticipantsUpdate}
                  autoJoin={true}
                  isOutgoingCallSetup={
                    currentRoomName ? isRoomCreatedByUs(currentRoomName) : false
                  }
                  currentCall={
                    // For outgoing setup rooms, use the room's call data state directly
                    currentRoomName &&
                    isRoomCreatedByUs(currentRoomName) &&
                    hookOutgoingCallRoom?.isActive &&
                    hookOutgoingCallRoom.roomName === currentRoomName
                      ? hookOutgoingCallRoom.hasActiveSipCall
                        ? hookOutgoingCallRoom.callData
                        : undefined
                      : // For other rooms, find active call in this room from all calls
                      currentRoomName
                      ? allDisplayCalls.find(
                          (call) =>
                            call.roomName === currentRoomName &&
                            call.status !== "ended" &&
                            call.status !== "failed" &&
                            call.status !== "completed" &&
                            call.status !== "rejected" &&
                            call.status !== "terminated" &&
                            call.status !== "terminating" &&
                            !call.callEnded
                        )
                      : undefined
                  }
                  duration={selectedDuration}
                />
              </View>
            )}

          {/* Make Call Section - Step Flow Dialer */}
          {showDialer && (
            <View style={[styles.dialerSection, callFlowStep !== 'closed' && styles.stepFlowActive]}>
              <View style={styles.dialerHeader}>
                <Text style={styles.dialerTitle}>📞 Make a Call</Text>
                <TouchableOpacity
                  style={styles.closeDialerButton}
                  onPress={closeCallFlow}
                >
                  <Text style={styles.closeDialerText}>🔼 Hide</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.dialerContent}>
                {/* Step 1: Select Number */}
                {callFlowStep === 'select-number' && (
                  <View style={styles.stepContent}>
                    <Text style={styles.stepTitle}>Step 1: Select a number to call from</Text>
                    <View style={styles.fromNumberSection}>
                      {sipLoading ? (
                        <View style={styles.loadingIndicator}>
                          <ActivityIndicator color="#667eea" size="small" />
                          <Text style={styles.loadingText}>Loading your phone numbers...</Text>
                        </View>
                      ) : sipConfigs.length > 0 ? (
                        <View style={styles.selectContainer}>
                          {sipConfigs.map((config, index) => {
                            const phoneNumber = config.contactNumber || config.phoneNumber || 'Unknown';
                            const provider = config.provider || 'Unknown Provider';
                            const isEligible = isEligibleForOutgoing(config);
                            const eligibilityReason = getEligibilityReason(config);

                            return (
                              <TouchableOpacity
                                key={config.id || `config-${index}`}
                                style={[
                                  styles.numberOption,
                                  selectedFromNumber === phoneNumber && styles.selectedOption,
                                  !isEligible && styles.disabledOption
                                ]}
                                onPress={() => isEligible && setSelectedFromNumber(phoneNumber)}
                                disabled={!isEligible}
                              >
                                <Text style={[styles.numberText, !isEligible && styles.disabledText]}>
                                  📞 {phoneNumber}
                                </Text>
                                <Text style={[styles.numberLabel, !isEligible && styles.disabledText]}>
                                  {provider} {isEligible ? '✅' : `❌ ${eligibilityReason}`}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      ) : (
                        <View style={styles.noNumbersContainer}>
                          <Text style={styles.noNumbersText}>
                            No phone numbers available. Please check your SIP configuration.
                          </Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.stepActions}>
                      <TouchableOpacity
                        style={[styles.nextButton, !selectedFromNumber && styles.buttonDisabled]}
                        onPress={nextStep}
                        disabled={!selectedFromNumber}
                      >
                        <Text style={styles.nextButtonText}>Next: Enter Phone Number</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* Step 2: Enter Phone Number */}
                {callFlowStep === 'enter-phone' && (
                  <View style={styles.stepContent}>
                    <Text style={styles.stepTitle}>Step 2: Enter the phone number to call</Text>
                    
                    <View style={styles.phoneInputSection}>
                      <Text style={styles.fromNumberDisplay}>
                        Calling from: {selectedFromNumber}
                      </Text>
                      
                      <TextInput
                        style={styles.phoneNumberInput}
                        value={phoneNumber}
                        onChangeText={(text) => setPhoneNumber(formatPhoneNumber(text))}
                        placeholder="+1234567890"
                        placeholderTextColor="#999"
                        keyboardType="phone-pad"
                        maxLength={16}
                        autoFocus
                      />
                      
                      {phoneNumber && phoneNumber.length > 3 && !isValidE164(phoneNumber) && (
                        <Text style={styles.validationError}>
                          Invalid phone number format. Use international format: +1234567890
                        </Text>
                      )}

                      {phoneNumber && phoneNumber.length > 3 && isValidE164(phoneNumber) && (
                        <Text style={styles.validationSuccess}>
                          ✓ Valid phone number
                        </Text>
                      )}
                    </View>

                    {/* Dialpad Toggle */}
                    <TouchableOpacity
                      style={styles.dialpadToggle}
                      onPress={() => setIsDialpadCollapsed(!isDialpadCollapsed)}
                    >
                      <Text style={styles.dialpadToggleText}>
                        {isDialpadCollapsed ? '🔢 Show Dialpad' : '🔢 Hide Dialpad'}
                      </Text>
                    </TouchableOpacity>

                    {/* Collapsible Dialpad */}
                    {!isDialpadCollapsed && renderDialpad()}

                    <View style={styles.stepActions}>
                      <TouchableOpacity
                        style={styles.backButton}
                        onPress={prevStep}
                      >
                        <Text style={styles.backButtonText}>← Back</Text>
                      </TouchableOpacity>
                      
                      <TouchableOpacity
                        style={[
                          styles.nextButton,
                          (!phoneNumber || !isValidE164(phoneNumber)) && styles.buttonDisabled
                        ]}
                        onPress={nextStep}
                        disabled={!phoneNumber || !isValidE164(phoneNumber)}
                      >
                        <Text style={styles.nextButtonText}>Next: Choose Mode →</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* Step 3: Choose Mode */}
                {callFlowStep === 'choose-mode' && (
                  <View style={styles.stepContent}>
                    <Text style={styles.stepTitle}>Step 3: Choose how to handle the call</Text>
                    
                    {/* Compact Call Summary with Inline Action */}
                    <View style={styles.callSummaryCompact}>
                      <View style={styles.callDetailsRow}>
                        <View style={styles.callDetailItem}>
                          <Text style={styles.callDetailLabel}>To:</Text>
                          <Text style={styles.callDetailValue}>{formatPhoneNumberForDisplay(phoneNumber)}</Text>
                        </View>
                        <View style={styles.callDetailItem}>
                          <Text style={styles.callDetailLabel}>From:</Text>
                          <Text style={styles.callDetailValue}>{formatPhoneNumberForDisplay(selectedFromNumber)}</Text>
                        </View>
                        <View style={styles.callDetailItem}>
                          <Text style={styles.callDetailLabel}>Duration:</Text>
                          <Text style={styles.callDetailValue}>{selectedDuration}min</Text>
                        </View>
                        <View style={styles.callDetailItem}>
                          <TouchableOpacity
                            style={[
                              styles.callButtonCompact,
                              (() => {
                                const selectedConfig = sipConfigs.find(
                                  (config) =>
                                    (config.contactNumber || config.phoneNumber) === selectedFromNumber
                                );
                                const autoAgent = selectedConfig?.autoAgent;
                                const autoAgentAvailable =
                                  autoAgent?.enabled &&
                                  autoAgent.type &&
                                  (autoAgent.type === "AI" ||
                                    autoAgent.type === "IVR" ||
                                    autoAgent.type === "PLAYBACK");
                                const botModeAvailable =
                                  autoAgentAvailable && autoAgent?.outgoingType === "AI";
                                const hasExistingActiveRoom =
                                  (isConnectedToRoom && currentRoomName) ||
                                  hookOutgoingCallRoom?.isActive;
                                const canCreateNewRoom =
                                  !isConnectedToRoom &&
                                  !hookOutgoingCallRoom?.isActive &&
                                  selectedFromNumber;
                                const voiceModeAvailable =
                                  hasExistingActiveRoom || canCreateNewRoom;
                                const canMakeCall = botModeAvailable || voiceModeAvailable;
                                return !canMakeCall && styles.buttonDisabled;
                              })()
                            ]}
                            onPress={handleMakeCall}
                            disabled={isDialing || (() => {
                              const selectedConfig = sipConfigs.find(
                                (config) =>
                                  (config.contactNumber || config.phoneNumber) === selectedFromNumber
                              );
                              const autoAgent = selectedConfig?.autoAgent;
                              const autoAgentAvailable =
                                autoAgent?.enabled &&
                                autoAgent.type &&
                                (autoAgent.type === "AI" ||
                                  autoAgent.type === "IVR" ||
                                  autoAgent.type === "PLAYBACK");
                              const botModeAvailable =
                                autoAgentAvailable && autoAgent?.outgoingType === "AI";
                              const hasExistingActiveRoom =
                                (isConnectedToRoom && currentRoomName) ||
                                hookOutgoingCallRoom?.isActive;
                              const canCreateNewRoom =
                                !isConnectedToRoom &&
                                !hookOutgoingCallRoom?.isActive &&
                                selectedFromNumber;
                              const voiceModeAvailable =
                                hasExistingActiveRoom || canCreateNewRoom;
                              const canMakeCall = botModeAvailable || voiceModeAvailable;
                              return !canMakeCall;
                            })()}
                          >
                            {isDialing ? (
                              <View style={styles.buttonContent}>
                                <ActivityIndicator size="small" color="#fff" />
                                <Text style={styles.callButtonCompactText}>Calling...</Text>
                              </View>
                            ) : (
                              <Text style={styles.callButtonCompactText}>📞 Call</Text>
                            )}
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                    
                    <View style={styles.callModeSection}>
                      {(() => {
                        const selectedConfig = sipConfigs.find(
                          (config) =>
                            (config.contactNumber || config.phoneNumber) === selectedFromNumber
                        );
                        const autoAgent = selectedConfig?.autoAgent;

                        const autoAgentAvailable =
                          autoAgent?.enabled &&
                          autoAgent.type &&
                          (autoAgent.type === "AI" ||
                            autoAgent.type === "IVR" ||
                            autoAgent.type === "PLAYBACK");

                        const botModeAvailable =
                          autoAgentAvailable && autoAgent?.outgoingType === "AI";

                        const hasExistingActiveRoom =
                          (isConnectedToRoom && currentRoomName) ||
                          hookOutgoingCallRoom?.isActive;
                        const canCreateNewRoom =
                          !isConnectedToRoom &&
                          !hookOutgoingCallRoom?.isActive &&
                          selectedFromNumber;

                        const voiceModeAvailable =
                          hasExistingActiveRoom || canCreateNewRoom;

                        const shouldSelectBot =
                          botModeAvailable &&
                          (!hasExistingActiveRoom || !isMicrophoneEnabled);
                        const shouldSelectVoice =
                          voiceModeAvailable &&
                          hasExistingActiveRoom &&
                          isMicrophoneEnabled;

                        return (
                          <View style={styles.modeOptions}>
                            {/* Bot Call Option */}
                            <TouchableOpacity
                              style={[
                                styles.modeOption,
                                styles.botMode,
                                (selectedCallMode === 'bot' || shouldSelectBot) && styles.autoSelected,
                                !botModeAvailable && styles.disabled
                              ]}
                              activeOpacity={0.8}
                              onPress={() => botModeAvailable && setSelectedCallMode('bot')}
                            >
                              {(selectedCallMode === 'bot') && (
                                <View style={styles.selectedMark}>
                                  <Ionicons name="checkmark-circle" size={20} color="#48bb78" />
                                </View>
                              )}
                              <View style={styles.modeHeader}>
                                <View style={styles.modeTitle}>
                                  <Text style={styles.modeTitleText}>🤖 Bot Call</Text>
                                  {shouldSelectBot && (
                                    <View style={styles.autoSelectedBadge}>
                                      <Text style={styles.autoSelectedText}>✅ Recommended</Text>
                                    </View>
                                  )}
                                  {!botModeAvailable && (
                                    <View style={styles.unavailableBadge}>
                                      <Text style={styles.unavailableText}>❌ Unavailable</Text>
                                    </View>
                                  )}
                                </View>
                                <Text style={styles.modeDescription}>
                                  {botModeAvailable
                                    ? "AI agent handles the call automatically"
                                    : autoAgentAvailable
                                    ? "Agent configured but outgoingType not set to AI"
                                    : "No AI agent configured for this number"}
                                </Text>
                              </View>
                              <View style={styles.modeDetails}>
                                {botModeAvailable ? (
                                  <>
                                    <Text style={styles.modeDetailText}>Agent Type: {autoAgent.type}</Text>
                                    <Text style={styles.modeDetailText}>Outgoing Type: {autoAgent.outgoingType}</Text>
                                    <Text style={styles.modeDetailText}>
                                      Perfect for automated calls, surveys, or information delivery
                                    </Text>
                                    <Text style={styles.modeDetailSuccess}>✅ No room connection required</Text>
                                  </>
                                ) : autoAgentAvailable ? (
                                  <>
                                    <Text style={styles.modeDetailText}>Agent Type: {autoAgent.type}</Text>
                                    <Text style={styles.modeDetailError}>
                                      ❌ Outgoing Type: {autoAgent.outgoingType || "Not set"} (needs "AI")
                                    </Text>
                                    <Text style={styles.modeDetailText}>
                                      The auto agent exists but outgoingType must be set to "AI" for bot calls
                                    </Text>
                                  </>
                                ) : (
                                  <>
                                    <Text style={styles.modeDetailError}>❌ No auto agent configured</Text>
                                    <Text style={styles.modeDetailText}>
                                      This number doesn't have AI/IVR/PLAYBACK agent setup
                                    </Text>
                                  </>
                                )}
                              </View>
                            </TouchableOpacity>

                            {/* Voice Call Option */}
                            <TouchableOpacity
                              style={[
                                styles.modeOption,
                                styles.userMode,
                                (selectedCallMode === 'voice' || shouldSelectVoice) && styles.autoSelected,
                                !voiceModeAvailable && styles.disabled
                              ]}
                              activeOpacity={0.8}
                              onPress={() => voiceModeAvailable && setSelectedCallMode('voice')}
                            >
                              {(selectedCallMode === 'voice') && (
                                <View style={styles.selectedMark}>
                                  <Ionicons name="checkmark-circle" size={20} color="#48bb78" />
                                </View>
                              )}
                              <View style={styles.modeHeader}>
                                <View style={styles.modeTitle}>
                                  <Text style={styles.modeTitleText}>👤 Voice Call</Text>
                                  {shouldSelectVoice && (
                                    <View style={styles.autoSelectedBadge}>
                                      <Text style={styles.autoSelectedText}>✅ Ready</Text>
                                    </View>
                                  )}
                                </View>
                                <Text style={styles.modeDescription}>
                                  You talk directly with the caller
                                </Text>
                              </View>
                              <View style={styles.modeDetails}>
                                <Text style={styles.modeDetailText}>Requires: Active MediaSFU room connection</Text>

                                {isConnectedToRoom && currentRoomName && (
                                  <>
                                    <Text style={styles.modeDetailSuccess}>
                                      ✅ Connected to room: {currentRoomName}
                                    </Text>
                                    {isMicrophoneEnabled ? (
                                      <Text style={styles.modeDetailSuccess}>
                                        🎤 Microphone is active and ready
                                      </Text>
                                    ) : (
                                      <Text style={styles.modeDetailWarning}>
                                        🔇 Microphone is muted (you can still make the call)
                                      </Text>
                                    )}
                                  </>
                                )}

                                {hookOutgoingCallRoom?.isActive && (
                                  <>
                                    <Text style={styles.modeDetailSuccess}>
                                      ✅ Outgoing call room ready: {hookOutgoingCallRoom.displayName}
                                    </Text>
                                    {hookOutgoingCallRoom.isMediaSFUConnected && isMicrophoneEnabled && (
                                      <Text style={styles.modeDetailSuccess}>
                                        🎤 Microphone is active and ready
                                      </Text>
                                    )}
                                  </>
                                )}

                                {!isConnectedToOutgoingRoom && !hookOutgoingCallRoom?.isActive && (
                                  <>
                                    <Text style={styles.modeDetailText}>
                                      💡 You can create a voice room for this call
                                    </Text>
                                    <TouchableOpacity
                                      style={styles.createRoomButtonInline}
                                      onPress={handleConnectToRoom}
                                      disabled={sipLoading || !selectedFromNumber || isCreatingRoom}
                                    >
                                      {isCreatingRoom ? (
                                        <View style={styles.buttonContent}>
                                          <ActivityIndicator size="small" color="#fff" />
                                          <Text style={styles.createRoomButtonText}>Creating Room...</Text>
                                        </View>
                                      ) : (
                                        <Text style={styles.createRoomButtonText}>🎤 Create Voice Room</Text>
                                      )}
                                    </TouchableOpacity>
                                    <DurationSelector
                                      selectedDuration={selectedDuration}
                                      onDurationChange={setSelectedDuration}
                                      disabled={sipLoading || !selectedFromNumber || isCreatingRoom}
                                      style={styles.inlineDurationSelector}
                                    />
                                  </>
                                )}
                              </View>
                            </TouchableOpacity>
                          </View>
                        );
                      })()}
                    </View>

                    <View style={styles.stepActions}>
                      <TouchableOpacity
                        style={styles.backButton}
                        onPress={prevStep}
                      >
                        <Text style={styles.backButtonText}>← Back</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* Step 4: Connecting */}
                {callFlowStep === 'connecting' && (
                  <View style={styles.stepContent}>
                    <Text style={styles.stepTitle}>Step 4: Connecting your call...</Text>
                    <View style={styles.connectingStatus}>
                      <ActivityIndicator size="large" color="#667eea" />
                      <Text style={styles.connectingText}>
                        Setting up your call to {phoneNumber}
                      </Text>
                      <Text style={styles.connectingSubtext}>
                        From: {selectedFromNumber}
                      </Text>
                      <Text style={styles.connectingSubtext}>Please wait...</Text>
                    </View>
                  </View>
                )}

                {/* Step 5: Connected */}
                {callFlowStep === 'connected' && (
                  <View style={styles.stepContent}>
                    <Text style={styles.stepTitle}>✅ Call initiated successfully!</Text>
                    <View style={styles.successStatus}>
                      <Text style={styles.successText}>
                        Your call to {phoneNumber} has been set up.
                      </Text>
                      <Text style={styles.successSubtext}>
                        Monitor the call status in the Active Calls section below.
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Calls Header */}
          <View style={styles.callsHeader}>
            <View style={styles.headerContent}>
              <Text style={styles.callsTitle}>Active Calls</Text>
              <TouchableOpacity
                style={styles.makeCallBtn}
                onPress={() => (showDialer ? closeCallFlow() : startCallFlow())}
              >
                <Text style={styles.makeCallBtnText}>
                  {showDialer ? '🔼 Hide Dialer' : '📞 Show Dialer'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Active Calls List */}
          {allDisplayCalls.filter(
            (call) => !call.sipCallId?.startsWith('dummy_outgoing_')
          ).length > 0 ? (
            <View style={styles.activeCallsMain}>
              <Text style={styles.activeCallsTitle}>
                {`📞 Current Active Calls (${allDisplayCalls?.filter(
                  (call) => !call.sipCallId?.startsWith('dummy_outgoing_')
                ).length ?? 0})`}
              </Text>
              
              <View style={styles.callsList}>
                {allDisplayCalls
                  .filter((call) => !call.sipCallId?.startsWith('dummy_outgoing_'))
                  .map((call, index) => {
                    const callId = call.sipCallId || `call-${index}`;
                    const isExpanded = isCallExpanded(callId);
                    // directionClass removed (unused)

                    return (
                      <View
                        key={callId}
                        style={[
                          styles.callItem,
                          call.direction === 'incoming' || call.direction === 'inbound'
                            ? styles.callItemIncoming
                            : styles.callItemOutgoing,
                          isExpanded && styles.callItemExpanded
                        ]}
                      >
                        <TouchableOpacity
                          style={styles.callHeader}
                          onPress={() => toggleCallExpansion(callId)}
                        >
                          {/* Responsive layout: Use single row on desktop, two rows on mobile */}
                          {screenData.width >= MOBILE_BREAKPOINT ? (
                            // Desktop: Single row layout
                            <View style={styles.callHeaderDesktop}>
                              <View style={styles.callDirection}>
                                <Text style={styles.directionIcon}>
                                  {call.direction === 'inbound' || call.direction === 'incoming' ? '📥' : '📤'}
                                </Text>
                                <Text style={styles.directionText}>
                                  {call.direction === 'inbound' || call.direction === 'incoming' ? 'Incoming' : 'Outgoing'}
                                </Text>
                              </View>
                              
                              <View style={styles.callDetailsDesktop}>
                                <Text style={styles.phoneNumberText}>
                                  {(() => {
                                    const sipUri = call.direction === 'outgoing' ? call.calledUri : call.callerIdRaw;
                                    return extractCleanIdentifier(sipUri || 'Unknown');
                                  })()}
                                </Text>
                                <Text style={styles.callerName}>
                                  {(() => {
                                    const callerIdRaw = call.callerIdRaw || '';
                                    const direction = 
                                      call.direction === 'inbound' || call.direction === 'incoming'
                                        ? 'INCOMING'
                                        : 'OUTGOING';
                                    const calledUri = call.calledUri || '';

                                    if (callerIdRaw) {
                                      const callerInfo = parseSipCaller(callerIdRaw, direction, calledUri);
                                      return getCallerDisplayString(callerInfo);
                                    }

                                    return call.humanParticipantName || 'Unknown Caller';
                                  })()}
                                </Text>
                              </View>

                              <View style={styles.callStatus}>
                                <View style={styles.statusBadge}>
                                  <Text style={[styles.statusText, getStatusStyle(call.status, styles)]}>{call.status}</Text>
                                </View>
                                {call.startTimeISO && (
                                  <Text style={styles.callTime}>
                                    {new Date(call.startTimeISO).toLocaleTimeString()}
                                  </Text>
                                )}
                              </View>

                              <View style={styles.expandControl}>
                                {!isExpanded && (
                                  <Text style={styles.expandHint}>
                                    tap to expand
                                  </Text>
                                )}
                                <Text style={styles.expandIcon}>
                                  {isExpanded ? '🔽' : '▶️'}
                                </Text>
                              </View>
                            </View>
                          ) : (
                            // Mobile: Two row layout
                            <>
                              {/* Row 1: Direction and Status */}
                              <View style={styles.callHeaderRow1}>
                                <View style={styles.callDirection}>
                                  <Text style={styles.directionIcon}>
                                    {call.direction === 'inbound' || call.direction === 'incoming' ? '📥' : '📤'}
                                  </Text>
                                  <Text style={styles.directionText}>
                                    {call.direction === 'inbound' || call.direction === 'incoming' ? 'Incoming' : 'Outgoing'}
                                  </Text>
                                </View>
                                
                                <View style={styles.callStatus}>
                                  <View style={styles.statusBadge}>
                                    <Text style={[styles.statusText, getStatusStyle(call.status, styles)]}>{call.status}</Text>
                                  </View>
                                  {call.startTimeISO && (
                                    <Text style={styles.callTime}>
                                      {new Date(call.startTimeISO).toLocaleTimeString()}
                                    </Text>
                                  )}
                                </View>
                              </View>
                              
                              {/* Row 2: Call Details and Expand Control */}
                              <View style={styles.callHeaderRow2}>
                                <View style={styles.callDetails}>
                                  <Text style={styles.phoneNumberText}>
                                    {(() => {
                                      const sipUri = call.direction === 'outgoing' ? call.calledUri : call.callerIdRaw;
                                      return extractCleanIdentifier(sipUri || 'Unknown');
                                    })()}
                                  </Text>
                                  <Text style={styles.callerName}>
                                    {(() => {
                                      const callerIdRaw = call.callerIdRaw || '';
                                      const direction = 
                                        call.direction === 'inbound' || call.direction === 'incoming'
                                          ? 'INCOMING'
                                          : 'OUTGOING';
                                      const calledUri = call.calledUri || '';

                                      if (callerIdRaw) {
                                        const callerInfo = parseSipCaller(callerIdRaw, direction, calledUri);
                                        return getCallerDisplayString(callerInfo);
                                      }

                                      return call.humanParticipantName || 'Unknown Caller';
                                    })()}
                                  </Text>
                                </View>
                                
                                <View style={styles.expandControl}>
                                  {!isExpanded && (
                                    <Text style={styles.expandHint}>
                                      tap to expand
                                    </Text>
                                  )}
                                  <Text style={styles.expandIcon}>
                                    {isExpanded ? '🔽' : '▶️'}
                                  </Text>
                                </View>
                              </View>
                            </>
                          )}
                        </TouchableOpacity>

                        {/* Expanded content */}
                        {isExpanded && (
                          <View style={styles.callExpandedDetails}>
                            {/* Quick actions for expanded calls */}
                            <View style={styles.callQuickActions}>
                              {call.roomName && currentRoomName !== call.roomName && (
                                <TouchableOpacity
                                  style={[styles.actionButton, styles.joinButton]}
                                  onPress={() => handleJoinCall(call)}
                                >
                                  <Text style={styles.actionButtonText}>
                                    🎯 {isConnectedToRoom ? 'Switch Room' : 'Join Room'}
                                  </Text>
                                </TouchableOpacity>
                              )}

                              {(call.direction === 'incoming' || call.direction === 'inbound') &&
                                (call.status === 'ringing' || call.status === 'connecting') && (
                                <>
                                  <TouchableOpacity
                                    style={[styles.actionButton, styles.answerButton]}
                                    onPress={() => handleAnswerCall(call)}
                                  >
                                    <Text style={styles.actionButtonText}>📞 Answer</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={[styles.actionButton, styles.declineButton]}
                                    onPress={() => handleDeclineCall(call)}
                                  >
                                    <Text style={styles.actionButtonText}>❌ Decline</Text>
                                  </TouchableOpacity>
                                </>
                              )}

                              {/* Advanced call control actions - show in expanded view */}
                              <TouchableOpacity
                                style={[styles.actionButton, styles.holdButton]}
                                onPress={() => handleHoldCall(call)}
                              >
                                <Text style={styles.actionButtonText}>⏸️ Hold</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[styles.actionButton, styles.endButton]}
                                onPress={() => handleEndCall(call)}
                              >
                                <Text style={styles.actionButtonText}>🔴 End Call</Text>
                              </TouchableOpacity>
                            </View>

                            {/* Critical metadata */}
                            <View style={styles.callMetadata}>
                              <View style={styles.metadataRow}>
                                <Text style={styles.metadataLabel}>Status:</Text>
                                <Text style={[styles.metadataValue, getStatusStyle(call.status, styles)]}>
                                  {call.status}
                                </Text>
                              </View>
                              <View style={styles.metadataRow}>
                                <Text style={styles.metadataLabel}>Direction:</Text>
                                <Text style={styles.metadataValue}>{call.direction}</Text>
                              </View>
                              {(call.durationSeconds || call.startTimeISO) && (
                                <View style={styles.metadataRow}>
                                  <Text style={styles.metadataLabel}>Duration:</Text>
                                  <Text style={styles.metadataValue}>
                                    {formatDurationWithFallback(call, liveDurationUpdateTrigger)}
                                  </Text>
                                </View>
                              )}
                              {call.startTimeISO && (
                                <View style={styles.metadataRow}>
                                  <Text style={styles.metadataLabel}>Started:</Text>
                                  <Text style={styles.metadataValue}>
                                    {new Date(call.startTimeISO).toLocaleTimeString()}
                                  </Text>
                                </View>
                              )}
                              {call.roomName && (
                                <View style={styles.metadataRow}>
                                  <Text style={styles.metadataLabel}>Room:</Text>
                                  <Text style={styles.metadataValue}>{call.roomName}</Text>
                                </View>
                              )}
                            </View>

                            {/* Detailed metadata toggle */}
                            <View style={styles.metadataSectionHeader}>
                              <Text style={styles.metadataSectionTitle}>Detailed Information</Text>
                              <TouchableOpacity
                                style={styles.metadataToggleBtn}
                                onPress={() => toggleMetadataCollapse(callId)}
                              >
                                <Text style={styles.metadataToggleText}>
                                  {isMetadataCollapsed(callId) ? '▶️ Show' : '🔽 Hide'}
                                </Text>
                              </TouchableOpacity>
                            </View>

                            {!isMetadataCollapsed(callId) && (
                              <View style={styles.callMetadataDetailed}>
                                <View style={styles.metadataRow}>
                                  <Text style={styles.metadataLabel}>Call ID:</Text>
                                  <Text style={styles.metadataValue}>{call.sipCallId || 'N/A'}</Text>
                                </View>
                                <View style={styles.metadataRow}>
                                  <Text style={styles.metadataLabel}>From:</Text>
                                  <Text style={styles.metadataValue}>
                                    {extractCleanIdentifier(call.callerIdRaw || '')}
                                  </Text>
                                </View>
                                <View style={styles.metadataRow}>
                                  <Text style={styles.metadataLabel}>To:</Text>
                                  <Text style={styles.metadataValue}>
                                    {extractCleanIdentifier(call.calledUri || '')}
                                  </Text>
                                </View>
                                {call.humanParticipantName && (
                                  <View style={styles.metadataRow}>
                                    <Text style={styles.metadataLabel}>Human Participant:</Text>
                                    <Text style={styles.metadataValue}>{call.humanParticipantName}</Text>
                                  </View>
                                )}
                                {call.startTimeISO && (
                                  <View style={styles.metadataRow}>
                                    <Text style={styles.metadataLabel}>Full Start Time:</Text>
                                    <Text style={styles.metadataValue}>
                                      {new Date(call.startTimeISO).toLocaleString()}
                                    </Text>
                                  </View>
                                )}
                              </View>
                            )}

                            {/* Media Room Integration */}
                            {call.roomName && isExpanded && currentRoomName !== call.roomName && (
                              <View style={styles.callRoomIntegration}>
                                <Text style={styles.roomIntegrationTitle}>🎧 Media Room Integration</Text>
                                <View style={styles.roomDetailsSimple}>
                                  <View style={styles.roomInfo}>
                                    <Text style={styles.roomNameText}>Room: {call.roomName}</Text>
                                    <View style={styles.statusIndicatorDisconnected}>
                                      <Text style={styles.statusIndicatorText}>🔴 Not Connected</Text>
                                    </View>
                                  </View>
                                  <Text style={styles.connectionHelp}>
                                    Join the media room to participate in voice/video for this call
                                  </Text>
                                  <TouchableOpacity
                                    style={[styles.actionButton, styles.joinRoomButton]}
                                    onPress={() => handleJoinCall(call)}
                                  >
                                    <Text style={styles.actionButtonText}>🎯 Join Media Room</Text>
                                  </TouchableOpacity>
                                </View>
                              </View>
                            )}

                            {/* Current Room Notice */}
                            {call.roomName && isExpanded && currentRoomName === call.roomName && (
                              <View style={styles.callRoomIntegration}>
                                <Text style={styles.roomIntegrationTitle}>🎧 Media Room Integration</Text>
                                <View style={styles.roomDetailsSimple}>
                                  <View style={styles.roomInfo}>
                                    <Text style={styles.roomNameText}>Room: {call.roomName}</Text>
                                    <View style={styles.statusIndicatorConnected}>
                                      <Text style={styles.statusIndicatorText}>🟢 Currently Active</Text>
                                    </View>
                                  </View>

                                  {!isRoomCreatedByUs(call.roomName) &&
                                    !(currentRoomName === call.roomName && isRoomCreatedByUs(currentRoomName)) && (
                                      <View style={styles.externalRoomMediasfu}>
                                        {!isConnectedToRoom && (
                                          <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                                            <ActivityIndicator color="#667eea" size="small" />
                                            <Text style={{ marginTop: 6, color: '#4a5568', fontSize: 12 }}>
                                              Connecting to media room...
                                            </Text>
                                          </View>
                                        )}
                                        <MediaSFURoomDisplay
                                          roomName={call.roomName}
                                          callId={call.sipCallId}
                                          participantName={currentParticipantName}
                                          isConnected={isConnectedToRoom}
                                          onConnectionChange={(connected) => {
                                            setIsConnectedToRoom(connected);
                                            if (!connected) {
                                              setCurrentRoomName("");
                                              setIsCreatingRoom(false);
                                              setRoomCreationError(null);
                                              if (roomManuallyClosedRef) {
                                                setRoomManuallyClosedRef(null);
                                              }
                                            } else {
                                              setIsCreatingRoom(false);
                                              setRoomCreationError(null);
                                              // Clear room creation timeout on successful connection
                                              if (roomCreationTimeoutRef) {
                                                clearTimeout(roomCreationTimeoutRef);
                                                setRoomCreationTimeoutRef(null);
                                              }
                                              if (roomManuallyClosedRef) {
                                                setRoomManuallyClosedRef(null);
                                              }
                                            }
                                          }}
                                          onMicrophoneChange={handleMicrophoneChange}
                                          onRoomNameUpdate={handleRoomNameUpdate}
                                          onDisconnect={handleRoomDisconnect}
                                          onEndCall={handleRoomEndCall}
                                          onParticipantsUpdate={handleRoomParticipantsUpdate}
                                          autoJoin={true}
                                          isOutgoingCallSetup={false}
                                          currentCall={call}
                                          duration={selectedDuration || 30}
                                        />
                                      </View>
                                    )}
                                </View>
                              </View>
                            )}
                          </View>
                        )}
                      </View>
                    );
                  })}
              </View>
            </View>
          ) : (
            <View style={styles.noCallsState}>
              <View style={styles.noCallsContent}>
                <Text style={styles.noCallsIcon}>📞</Text>
                <Text style={styles.noCallsTitle}>No Active Calls</Text>
                <Text style={styles.noCallsDescription}>
                  There are currently no active calls. Click "Make Call" to start a new call.
                </Text>
                <TouchableOpacity 
                  style={styles.noCallsButton}
                  onPress={() => startCallFlow()}
                >
                  <Text style={styles.noCallsButtonText}>
                    {showDialer ? '🔼 Hide Dialer' : '📞 Show Dialer'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>
      </View>

      {/* Notification Modal */}
      <NotificationModal
        visible={notification.isOpen}
        title={notification.title}
        message={notification.message}
        type={notification.type}
        onClose={closeNotification}
      />

      {/* Microphone Confirmation Modal */}
      <ConfirmationModal
        visible={microphoneConfirmation.isOpen}
        title="Microphone Disabled"
        message="You're making a call from your voice room but your microphone is disabled. The call will start without your audio participation. Do you want to proceed anyway?"
        confirmText="Proceed with Call"
        cancelText="Cancel"
        onConfirm={() => {
          if (microphoneConfirmation.onConfirm) {
            microphoneConfirmation.onConfirm();
          }
        }}
        onCancel={() => {
          if (microphoneConfirmation.onCancel) {
            microphoneConfirmation.onCancel();
          }
        }}
      />

      {/* Navigation confirmation modal */}
      <ConfirmationModal
        visible={navigationConfirmation.isOpen}
        title="Leave Page?"
        message={navigationConfirmation.message}
        confirmText="Leave Page"
        cancelText="Stay Here"
        onConfirm={() => {
          if (navigationConfirmation.onConfirm) {
            navigationConfirmation.onConfirm();
          }
        }}
        onCancel={() => {
          if (navigationConfirmation.onCancel) {
            navigationConfirmation.onCancel();
          }
        }}
      />

    </SafeAreaView>
  );
};


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  mainContainer: {
    flex: 1,
  },
  desktopContainer: {
    maxWidth: 1200,
    alignSelf: 'center',
    width: '100%',
  },
  scrollView: {
    flex: 1,
  },
  centeredContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },

  // Configuration prompt styles
  configPrompt: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 32,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  configTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
    textAlign: 'center',
  },
  configDescription: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  configButton: {
    backgroundColor: '#007bff',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 8,
  },
  configButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },

  // Quick Settings Header
  quickSettingsHeader: {
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  quickSettingsHeaderLarge: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  quickSettingsContent: {
    flexDirection: 'column',
    gap: 8,
    width: '100%',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2d3748',
    textAlign: 'center',
    marginBottom: 4,
  },
  headerTitleLarge: {
    fontSize: 22,
  },
  quickActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
    width: '100%',
  },
  quickActionsLarge: {
    gap: 16,
  },
  createRoomButton: {
    backgroundColor: '#667eea',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 2,
    flexShrink: 1,
    minWidth: 0,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
    opacity: 0.6,
  },
  roomDurationSetting: {
    marginVertical: 8,
  },
  durationLabel: {
    fontSize: 12,
    color: '#4a5568',
    marginBottom: 4,
  },
  durationSelect: {
    backgroundColor: '#f7fafc',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  durationValue: {
    fontSize: 12,
    color: '#2d3748',
    fontWeight: '500',
  },
  currentRoomInfo: {
    backgroundColor: '#f0f9ff',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#0ea5e9',
  },
  roomIndicator: {
    fontSize: 12,
    color: '#0369a1',
    fontWeight: '500',
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingModal: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    maxWidth: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  loadingTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#2d3748',
    marginTop: 16,
    marginBottom: 8,
  },
  loadingDescription: {
    fontSize: 16,
    color: '#4a5568',
    textAlign: 'center',
    lineHeight: 24,
  },
  errorSection: {
    marginTop: 16,
    alignItems: 'center',
  },
  errorMessage: {
    fontSize: 14,
    color: '#e53e3e',
    textAlign: 'center',
    marginBottom: 12,
  },
  retryButton: {
    backgroundColor: '#667eea',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },

  // MediaSFU Section
  mediaSFUSection: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  mediaSFUSectionHidden: {
    height: 10,
  },
  voiceRoomHeader: {
    padding: 12,
  },
  roomHeaderGradient: {
    backgroundColor: '#667eea',
    borderRadius: 12,
    padding: 12,
  },
  roomHeaderContent: {
    marginBottom: 8,
  },
  roomTitleSectionCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    flexWrap: 'wrap',
    gap: 8,
    width: '100%',
  },
  roomIcon: {
    fontSize: 18,
  },
  roomTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    flexShrink: 0,
  },
  roomNameDisplayInline: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '500',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    maxWidth: 120,
    overflow: 'hidden',
  },
  roomStatusBadgesInline: {
    flexDirection: 'row',
    gap: 3,
    marginLeft: 'auto',
    flexShrink: 1,
  },
  statusBadgeCompact: {
    paddingVertical: 2,
    paddingHorizontal: 4,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  statusBadgeTextCompact: {
    fontSize: 9,
    fontWeight: '500',
    color: '#fff',
    flexShrink: 1,
  },
  roomTitleSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  roomTitleInfo: {
    flex: 1,
    minWidth: 100,
  },
  roomNameDisplay: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 2,
  },
  roomCallMetadataInline: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6,
  },
  metadataItem: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.9)',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingVertical: 1,
    paddingHorizontal: 4,
    borderRadius: 3,
    flexShrink: 1,
  },
  roomStatusBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '500',
    color: '#fff',
  },
  statusActive: {
    backgroundColor: '#48bb78',
  },
  statusReady: {
    backgroundColor: '#48bb78',
  },
  statusConnecting: {
    backgroundColor: '#ed8936',
  },
  statusConnected: {
    backgroundColor: '#48bb78',
  },
  statusDisconnected: {
    backgroundColor: '#f56565',
  },
  statusMicOn: {
    backgroundColor: '#4299e1',
  },
  statusMicOff: {
    backgroundColor: '#a0aec0',
  },
  roomInfoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  roomInfoGridCompact: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    width: '100%',
  },
  roomInfoCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  roomInfoCardCompact: {
    flex: 1,
    minWidth: '45%',
    maxWidth: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 6,
    padding: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  infoLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '500',
    marginBottom: 4,
  },
  infoLabelCompact: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '500',
    minWidth: 30,
    flexShrink: 0,
  },
  infoValue: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
  },
  infoValueCompact: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '500',
    flex: 1,
  },
  roomPhoneInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#2d3748',
  },
  roomPhoneInputCompact: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 4,
    paddingVertical: 3,
    paddingHorizontal: 6,
    fontSize: 11,
    color: '#2d3748',
    flex: 1,
    minWidth: 0,
  },
  makeCallButton: {
    backgroundColor: '#48bb78',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
  },
  makeCallButtonCompact: {
    backgroundColor: '#48bb78',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  makeCallButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  makeCallButtonTextCompact: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  endCallButton: {
    backgroundColor: '#f56565',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  endCallButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  callControlActions: {
    flexDirection: 'row',
    gap: 8,
  },
  answerCallButton: {
    backgroundColor: '#48bb78',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 4,
    alignItems: 'center',
    flex: 1,
  },
  answerCallButtonText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  declineCallButton: {
    backgroundColor: '#f56565',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 4,
    alignItems: 'center',
    flex: 1,
  },
  declineCallButtonText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  callStatusInfo: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  callStatusText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '500',
  },
  callStatusTextCompact: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '500',
  },

  // Dialer Section
  dialerSection: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  stepFlowActive: {
    borderColor: '#667eea',
    borderWidth: 2,
  },
  dialerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  dialerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#2d3748',
  },
  closeDialerButton: {
    backgroundColor: '#6c757d',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  closeDialerText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  dialerContent: {
    flex: 1,
  },
  stepContent: {
    paddingVertical: 16,
  },
  stepTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2d3748',
    marginBottom: 16,
  },
  fromNumberSection: {
    backgroundColor: '#f7fafc',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  loadingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  loadingText: {
    marginLeft: 12,
    color: '#4a5568',
    fontSize: 14,
  },
  selectContainer: {
    gap: 8,
  },
  numberOption: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    borderWidth: 2,
    borderColor: '#e2e8f0',
  },
  selectedOption: {
    borderColor: '#667eea',
    backgroundColor: '#e3f2fd',
  },
  disabledOption: {
    opacity: 0.5,
  },
  numberText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2d3748',
  },
  numberLabel: {
    fontSize: 14,
    color: '#4a5568',
    marginTop: 4,
  },
  disabledText: {
    color: '#a0aec0',
  },
  noNumbersContainer: {
    padding: 16,
    alignItems: 'center',
  },
  noNumbersText: {
    color: '#4a5568',
    textAlign: 'center',
    fontSize: 14,
  },
  stepActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
    gap: 12,
  },
  nextButton: {
    backgroundColor: '#667eea',
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  nextButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  backButton: {
    backgroundColor: '#6c757d',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    minWidth: 100,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  callButton: {
    backgroundColor: '#48bb78',
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  callButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  
  // Compact call summary styles
  callSummaryCompact: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  callDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
  },
  callDetailItem: {
    alignItems: 'center',
    minWidth: 60,
    // For mobile 2x2 grid layout: take roughly half width minus gap
    flexBasis: '45%',
    flexGrow: 0,
    flexShrink: 0,
  },
  callDetailLabel: {
    fontSize: 12,
    color: '#718096',
    fontWeight: '500',
    marginBottom: 4,
  },
  callDetailValue: {
    fontSize: 14,
    color: '#2d3748',
    fontWeight: '600',
  },
  callButtonCompact: {
    backgroundColor: '#48bb78',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    minWidth: 80,
  },
  callButtonCompactText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  phoneInputSection: {
    marginBottom: 16,
  },
  fromNumberDisplay: {
    fontSize: 14,
    color: '#4a5568',
    marginBottom: 12,
    textAlign: 'center',
  },
  phoneNumberInput: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingVertical: 16,
    paddingHorizontal: 16,
    fontSize: 18,
    textAlign: 'center',
    color: '#2d3748',
  },
  validationError: {
    fontSize: 14,
    color: '#e53e3e',
    marginTop: 8,
    textAlign: 'center',
  },
  validationSuccess: {
    fontSize: 14,
    color: '#48bb78',
    marginTop: 8,
    textAlign: 'center',
  },
  dialpadToggle: {
    backgroundColor: '#4299e1',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginVertical: 16,
  },
  dialpadToggleText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  dialpad: {
    alignItems: 'center',
    marginVertical: 16,
  },
  dialpadRow: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 12,
  },
  dialpadButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#f1f3f4',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dialpadText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#2d3748',
  },
  dialpadActionButton: {
    width: 70,
    height: 35,
    borderRadius: 17,
    backgroundColor: '#6c757d',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dialpadActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },

  // Call Mode Section
  callModeSection: {
    marginBottom: 24,
  },
  modeOptions: {
    gap: 16,
  },
  modeOption: {
    backgroundColor: '#f7fafc',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  selectedMark: {
    position: 'absolute',
    right: 12,
    top: 12,
  },
  botMode: {
    // Additional styling for bot mode
  },
  userMode: {
    // Additional styling for user mode
  },
  autoSelected: {
    borderColor: '#667eea',
    backgroundColor: '#e3f2fd',
  },
  disabled: {
    opacity: 0.5,
  },
  modeHeader: {
    marginBottom: 12,
  },
  modeTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  modeTitleText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2d3748',
  },
  autoSelectedBadge: {
    backgroundColor: '#48bb78',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    marginLeft: 8,
  },
  autoSelectedText: {
    fontSize: 10,
    color: '#fff',
    fontWeight: '600',
  },
  unavailableBadge: {
    backgroundColor: '#f56565',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    marginLeft: 8,
  },
  unavailableText: {
    fontSize: 10,
    color: '#fff',
    fontWeight: '600',
  },
  modeDescription: {
    fontSize: 14,
    color: '#4a5568',
    lineHeight: 20,
  },
  modeDetails: {
    gap: 8,
  },
  modeDetailText: {
    fontSize: 14,
    color: '#4a5568',
  },
  modeDetailSuccess: {
    fontSize: 14,
    color: '#48bb78',
    fontWeight: '500',
  },
  modeDetailWarning: {
    fontSize: 14,
    color: '#ed8936',
    fontWeight: '500',
  },
  modeDetailError: {
    fontSize: 14,
    color: '#f56565',
    fontWeight: '500',
  },
  createRoomButtonInline: {
    backgroundColor: '#667eea',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
    marginTop: 8,
  },
  createRoomButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  durationInfo: {
    fontSize: 12,
    color: '#4a5568',
    marginTop: 4,
  },
  connectingStatus: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  connectingText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2d3748',
    marginTop: 16,
    textAlign: 'center',
  },
  connectingSubtext: {
    fontSize: 14,
    color: '#4a5568',
    marginTop: 8,
    textAlign: 'center',
  },
  successStatus: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  successText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#48bb78',
    textAlign: 'center',
    marginBottom: 12,
  },
  successSubtext: {
    fontSize: 14,
    color: '#4a5568',
    textAlign: 'center',
  },

  // Calls Header
  callsHeader: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  callsTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#2d3748',
  },
  makeCallBtn: {
    backgroundColor: '#667eea',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  makeCallBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },

  // Active Calls
  activeCallsMain: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  activeCallsTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#2d3748',
    marginBottom: 16,
  },
  callsList: {
    gap: 12,
  },
  callItem: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  callItemIncoming: {
    borderLeftWidth: 4,
    borderLeftColor: '#48bb78',
  },
  callItemOutgoing: {
    borderLeftWidth: 4,
    borderLeftColor: '#4299e1',
  },
  callItemExpanded: {
    backgroundColor: '#fff',
  },
  callHeader: {
    flexDirection: 'column',
    padding: 16,
    gap: 8,
  },
  callHeaderDesktop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
  },
  callHeaderRow1: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  callHeaderRow2: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  callDirection: {
    alignItems: 'center',
    minWidth: 80,
  },
  directionIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  directionText: {
    fontSize: 12,
    color: '#4a5568',
    fontWeight: '500',
  },
  callDetails: {
    flex: 1,
    marginRight: 12,
  },
  callDetailsDesktop: {
    flex: 2,
    marginRight: 16,
  },
  expandControl: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 60,
  },
  phoneNumberText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2d3748',
    marginBottom: 4,
  },
  callerName: {
    fontSize: 14,
    color: '#4a5568',
  },
  callStatus: {
    alignItems: 'flex-end',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#fff',
  },
  callTime: {
    fontSize: 12,
    color: '#4a5568',
    marginTop: 4,
  },
  expandHint: {
    fontSize: 10,
    color: '#a0aec0',
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: 2,
  },
  expandIcon: {
    fontSize: 16,
    color: '#4a5568',
  },
  callExpandedDetails: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  callQuickActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
    minWidth: 80,
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  joinButton: {
    backgroundColor: '#4299e1',
  },
  answerButton: {
    backgroundColor: '#48bb78',
  },
  declineButton: {
    backgroundColor: '#f56565',
  },
  holdButton: {
    backgroundColor: '#ed8936',
  },
  endButton: {
    backgroundColor: '#f56565',
  },
  callMetadata: {
    backgroundColor: '#f7fafc',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  metadataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  metadataLabel: {
    fontSize: 14,
    color: '#4a5568',
    fontWeight: '500',
  },
  metadataValue: {
    fontSize: 14,
    color: '#2d3748',
    fontWeight: '600',
  },
  metadataSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  metadataSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2d3748',
  },
  metadataToggleBtn: {
    backgroundColor: '#e2e8f0',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  metadataToggleText: {
    fontSize: 12,
    color: '#4a5568',
    fontWeight: '500',
  },
  callMetadataDetailed: {
    backgroundColor: '#f7fafc',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  callRoomIntegration: {
    backgroundColor: '#f0f9ff',
    borderRadius: 8,
    padding: 16,
    marginTop: 16,
  },
  roomIntegrationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2d3748',
    marginBottom: 12,
  },
  roomDetailsSimple: {
    gap: 8,
  },
  roomInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  roomNameText: {
    fontSize: 14,
    color: '#2d3748',
    fontWeight: '500',
  },
  statusIndicatorDisconnected: {
    backgroundColor: '#f56565',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  statusIndicatorConnected: {
    backgroundColor: '#48bb78',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  statusIndicatorText: {
    fontSize: 10,
    color: '#fff',
    fontWeight: '500',
  },
  connectionHelp: {
    fontSize: 14,
    color: '#4a5568',
    marginBottom: 12,
  },
  joinRoomButton: {
    backgroundColor: '#4299e1',
  },
  externalRoomMediasfu: {
    marginTop: 12,
  },

  // Status badge variations for calls
  statusringing: {
    color: '#ed8936',
  },
  statusactive: {
    color: '#48bb78',
  },
  statusconnected: {
    color: '#48bb78',
  },
  statusconnecting: {
    color: '#4299e1',
  },
  statusterminated: {
    color: '#f56565',
  },
  statusfailed: {
    color: '#f56565',
  },
  statusended: {
    color: '#4a5568',
  },
  statuscompleted: {
    color: '#48bb78',
  },
  statusrejected: {
    color: '#f56565',
  },
  statusterminating: {
    color: '#f56565',
  },
  statusmissed: {
    color: '#ed8936',
  },
  'statuson-hold': {
    color: '#4299e1',
  },

  // No Calls State
  noCallsState: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 16,
    padding: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  noCallsContent: {
    alignItems: 'center',
  },
  noCallsIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  noCallsTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#2d3748',
    marginBottom: 12,
  },
  noCallsDescription: {
    fontSize: 16,
    color: '#4a5568',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  noCallsButton: {
    backgroundColor: '#667eea',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 8,
  },
  noCallsButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  inlineDurationSelector: {
    marginTop: 12,
  },
});

export default CallsPage;