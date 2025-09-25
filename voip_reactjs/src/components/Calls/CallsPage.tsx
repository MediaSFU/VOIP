import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useCallManager, useVoipConfig, useCallHistory } from "../../hooks";
import { useOutgoingCallRoomManager } from "../../hooks/useOutgoingCallRoomManager";
import { SIPConfig, Call } from "../../types/call.types";
import { callService } from "../../services/callService";
import LoadingSpinner from "../Common/LoadingSpinner";
import MediaSFURoomDisplay from "../MediaSFU/MediaSFURoomDisplay";
import NotificationModal from "../Common/NotificationModal";
import ConfirmationModal from "../Common/ConfirmationModal";
import { callLogger, roomLogger } from "../../utils/logger";
import {
  parseSipCaller,
  getCallerDisplayString,
  extractCleanIdentifier,
} from "../../utils/sipCallerParser";
import { parsePhoneNumber, isValidPhoneNumber, AsYouType } from "libphonenumber-js";
import "./CallsPage.css";
import "./CallFlowSteps.css";

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
    } catch (error) {
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
    } catch (error) {
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

  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) {
      return null;
    }
    return value < 100000000000 ? value * 1000 : value;
  }

  if (typeof value === "string") {
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
  isApiConfigured: boolean;
}

const CallsPage: React.FC<CallsPageProps> = ({ isApiConfigured }) => {
  const [phoneNumber, setPhoneNumber] = useState(""); // Start with empty string
  const [isDialing, setIsDialing] = useState(false);
  const [selectedFromNumber, setSelectedFromNumber] = useState<string>("");

  // MediaSFU Room State - Enhanced with outgoing call room management
  const [currentRoomName, setCurrentRoomName] = useState<string>(""); // Keep for backward compatibility
  const [requestedRoomName, setRequestedRoomName] = useState<string>(""); // Track what we requested vs what MediaSFU gives us
  const [currentParticipantName, setCurrentParticipantName] =
    useState<string>("voipuser");
  const [isConnectedToRoom, setIsConnectedToRoom] = useState(false);
  const [isMicrophoneEnabled, setIsMicrophoneEnabled] = useState(false);

  // Quick settings state
  const [selectedDuration, setSelectedDuration] = useState<number>(15); // Default 15 minutes

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
  const getCreatedRooms = useCallback((): Set<string> => {
    try {
      const stored = localStorage.getItem("mediasfu_created_rooms");
      if (!stored) return new Set();
      const data = JSON.parse(stored);
      const now = Date.now();

      // Filter out expired entries (older than 1 day)
      const validRooms = new Set<string>();
      for (const roomName in data) {
        if (data[roomName] && now - data[roomName] < 24 * 60 * 60 * 1000) {
          validRooms.add(roomName);
        }
      }

      // Clean up localStorage if we removed any expired entries
      if (validRooms.size !== Object.keys(data).length) {
        const cleanData: Record<string, number> = {};
        validRooms.forEach((room) => {
          cleanData[room] = data[room];
        });
        localStorage.setItem(
          "mediasfu_created_rooms",
          JSON.stringify(cleanData)
        );
      }

      return validRooms;
    } catch (error) {
      // Error reading created rooms from localStorage - return empty set
      return new Set();
    }
  }, []);

  const markRoomAsCreated = useCallback((roomName: string) => {
    try {
      const existingData = localStorage.getItem("mediasfu_created_rooms");
      const data = existingData ? JSON.parse(existingData) : {};
      data[roomName] = Date.now();
      localStorage.setItem("mediasfu_created_rooms", JSON.stringify(data));
    } catch (error) {
      // Error storing created room to localStorage - continue without throwing
    }
  }, []);

  const isRoomCreatedByUs = useCallback(
    (roomName: string): boolean => {
      const createdRooms = getCreatedRooms();
      return createdRooms.has(roomName);
    },
    [getCreatedRooms]
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

  // Call History Management (using custom hook)
  const { addCallToHistory, markCallsAsTerminated } = useCallHistory();

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

  // Helper function to extract clean error messages
  const extractErrorMessage = useCallback((error: any): string => {
    if (typeof error === "string") {
      const match = error.match(/\{"error":"([^"]+)"\}/);
      if (match) {
        return match[1];
      }
      if (error.includes("HTTP")) {
        const cleanError = error.split(":").pop()?.trim();
        if (cleanError && cleanError !== error) {
          return cleanError;
        }
      }
      return error;
    }

    if (error?.error) {
      return typeof error.error === "string" ? error.error : "Call failed";
    }

    if (error?.message) {
      return error.message;
    }

    return "Call failed. Please try again.";
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
        (identifier) => !previousParticipants.has(identifier),
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

  // Navigation protection helper
  const checkNavigationSafety = useCallback(() => {
    const hasActiveMediaSFU = isConnectedToRoom && currentRoomName;
    const hasActiveCalls = currentCalls.length > 0;
    return {
      hasActiveMediaSFU,
      hasActiveCalls,
      shouldProtect: hasActiveMediaSFU || hasActiveCalls,
    };
  }, [isConnectedToRoom, currentRoomName, currentCalls.length]);

  // Handle navigation with confirmation if needed
  const navigate = useNavigate();
  const location = useLocation();

  // Navigation protection function (currently unused but may be needed for future features)
  // const handleNavigationWithProtection = useCallback(
  //   (targetPath: string) => {
  //     const { hasActiveMediaSFU, shouldProtect } = checkNavigationSafety();

  //     if (shouldProtect) {
  //       const message = hasActiveMediaSFU
  //         ? `You have an active MediaSFU room connection${
  //             currentRoomName ? ` (${currentRoomName})` : ""
  //           }. Navigating away will disconnect you and may end any ongoing calls.`
  //         : "You have active calls. Navigating away may affect your call experience.";

  //       setNavigationConfirmation({
  //         isOpen: true,
  //         message,
  //         onConfirm: () => {
  //           setNavigationConfirmation({
  //             isOpen: false,
  //             onConfirm: null,
  //             onCancel: null,
  //             message: "",
  //           });
  //           // Clear MediaSFU state before navigation to clean up properly
  //           if (hasActiveMediaSFU) {
  //             clearMediaSFUState("navigation away from calls page");
  //           }
  //           navigate(targetPath);
  //         },
  //         onCancel: () => {
  //           setNavigationConfirmation({
  //             isOpen: false,
  //             onConfirm: null,
  //             onCancel: null,
  //             message: "",
  //           });
  //         },
  //       });
  //     } else {
  //       // Safe to navigate without confirmation
  //       navigate(targetPath);
  //     }
  //   },
  //   [checkNavigationSafety, currentRoomName, navigate, clearMediaSFUState]
  // );

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
        const participantName =
          call.humanParticipantName || currentParticipantName || "voipuser";

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

          // Refresh calls list after a short delay
          setTimeout(() => {
            // The continuous polling will update the list
          }, 1000);
        } else {
          callLogger.error(`Failed to end call ${callId}:`, result.error);
          showNotification(
            "Call End Failed",
            `Failed to end call: ${result.error}`,
            "error"
          );
        }
      } catch (error) {
        callLogger.error(`Error ending call ${callId}:`, error);
        showNotification(
          "Call End Error",
          `Error ending call: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
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
          const message =
            response.error || "Unable to update the call's hold state.";
          showNotification(
            shouldHold ? "Could not hold call" : "Could not resume call",
            message,
            "error"
          );
          return;
        }

        setCurrentCalls((previousCalls) =>
          previousCalls.map((existingCall) =>
            existingCall.sipCallId === callId || existingCall.id === callId
              ? { ...existingCall, onHold: shouldHold }
              : existingCall
          )
        );

        showNotification(
          shouldHold ? "Call placed on hold" : "Call resumed",
          shouldHold
            ? "The caller now hears your configured hold experience."
            : "The caller has been returned to the conversation.",
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
    [extractErrorMessage, showNotification, setCurrentCalls]
  );

  // Transfer call function
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleTransferCall = useCallback(
    async (call: Call) => {
      const callId = call.sipCallId || call.id;
      if (!callId) {
        callLogger.error("No call ID available for transferring call");
        return;
      }

      try {
        callLogger.info(`Transfer call: ${callId}`);
        // Note: Transfer functionality would need to be implemented in callService
        // For now, just log the action
        showNotification(
          "Feature Not Available",
          "Transfer call functionality - to be implemented with SIP service",
          "info"
        );
      } catch (error) {
        callLogger.error(`Error transferring call ${callId}:`, error);
      }
    },
    [showNotification]
  );

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

          // Refresh calls list after a short delay
          setTimeout(() => {
            // The continuous polling will update the list
          }, 1000);
        } else {
          callLogger.error(`Failed to decline call ${callId}:`, result.error);
          showNotification(
            "Call Decline Failed",
            `Failed to decline call: ${result.error}`,
            "error"
          );
        }
      } catch (error) {
        callLogger.error(`Error declining call ${callId}:`, error);
        showNotification(
          "Call Decline Error",
          `Error declining call: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
          "error"
        );
      }
    },
    [showNotification]
  );

  // Use refs to avoid circular dependencies
  const callsPollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const stopContinuousCallsPolling = useCallback(() => {
    if (callsPollingIntervalRef.current) {
      clearInterval(callsPollingIntervalRef.current);
      callsPollingIntervalRef.current = null;
      setCallsPollingInterval(null);
    }
  }, []);

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
            if (call.sipCallId) {
              // Only add calls with valid sipCallId
              addCallToHistory(call);
            }
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
          if (hookOutgoingCallRoom?.isActive) {
            // CRITICAL: Use room-based discovery to find SIP calls
            // Look for active calls that match our outgoing room name (not terminated/failed)
            const sipCallInRoom = uniqueActiveCalls.find(
              (call) =>
                (call.roomName === hookOutgoingCallRoom.roomName ||
                  call.roomName === hookOutgoingCallRoom.requestedRoomName) &&
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
              (!hookOutgoingCallRoom.hasActiveSipCall ||
                !hookOutgoingCallRoom.callData)
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
              hookOutgoingCallRoom.hasActiveSipCall &&
              hookOutgoingCallRoom.callData
            ) {
              // Update existing call data (status changes, duration updates, etc.)
              const hasStatusChange =
                hookOutgoingCallRoom.callData.status !== sipCallInRoom.status;
              const hasDurationChange =
                hookOutgoingCallRoom.callData.durationSeconds !==
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
              hookOutgoingCallRoom.hasActiveSipCall
            ) {
              // CRITICAL: SIP call was found before but now disappeared - call ended by remote party
              // BUT: Only process if not already processed by fast detection
              const originalSipCallId = hookOutgoingCallRoom.sipCallId;
              const callNotificationId = originalSipCallId
                ? `${hookOutgoingCallRoom.roomName}_${originalSipCallId}`
                : `${hookOutgoingCallRoom.roomName}_${Date.now()}`;

              // Skip if already processed by fast detection
              if (callEndProcessed === callNotificationId) {
                return; // Already handled by fast detection, don't duplicate
              }

              // Mark as processed to prevent fast detection from duplicating
              setCallEndProcessed(callNotificationId);

              // Use hook method instead of legacy state management
              clearCallFromRoom();

              // Check if there are other calls in the room
              const hasOtherCallsInRoom = uniqueActiveCalls.some(
                (call) =>
                  call.roomName === hookOutgoingCallRoom.roomName &&
                  call.sipCallId !== hookOutgoingCallRoom.sipCallId
              );

              // Only clear MediaSFU state if this was not a room we created for outgoing calls
              // and there are no other calls in the room
              const shouldClearMediaSFU =
                !hasOtherCallsInRoom &&
                !isRoomCreatedByUs(hookOutgoingCallRoom.roomName);

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

    // Set up interval polling every 8 seconds (reduced frequency due to caching)
    const interval = setInterval(pollCalls, 8000);
    callsPollingIntervalRef.current = interval;
    setCallsPollingInterval(interval);
  }, [
    stopContinuousCallsPolling,
    addCallToHistory,
    markCallsAsTerminated,
    hookOutgoingCallRoom?.isActive,
    hookOutgoingCallRoom?.hasActiveSipCall,
    hookOutgoingCallRoom?.roomName,
    hookOutgoingCallRoom?.requestedRoomName,
    hookOutgoingCallRoom?.sipCallId,
    hookOutgoingCallRoom?.callData,
    botCallTimeoutRef,
    setBotCallTimeoutRef,
    syncCallToRoom,
    showNotification,
    clearMediaSFUState,
    callEndProcessed,
    setCallEndProcessed,
    clearCallFromRoom,
    lastCallEndNotificationId,
    setLastCallEndNotificationId,
    getCallsWithCache,
    isRoomCreatedByUs,
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
      !hookOutgoingCallRoom?.isActive ||
      !hookOutgoingCallRoom.hasActiveSipCall
    ) {
      return;
    }

    // Store the current call ID for tracking
    const currentSipCallId = hookOutgoingCallRoom.sipCallId;

    // Use moderate polling for call end detection (4 seconds) since we have caching
    const interval = setInterval(async () => {
      try {
        // Quick call status check for the specific room using shared cache
        const allCallsResponse = await getCallsWithCache();
        if (allCallsResponse.success && allCallsResponse.data) {
          // Method 1: Check if our specific call still exists and is active by room name
          const currentCallInRoom = allCallsResponse.data.find(
            (call) =>
              (call.roomName === hookOutgoingCallRoom.roomName ||
                call.roomName === hookOutgoingCallRoom.requestedRoomName) &&
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
          if (callEnded && hookOutgoingCallRoom.hasActiveSipCall) {
            // Create a more reliable notification ID that includes the original SIP call ID from the room
            const originalSipCallId = hookOutgoingCallRoom.sipCallId;
            const callNotificationId = originalSipCallId
              ? `${hookOutgoingCallRoom.roomName}_${originalSipCallId}`
              : `${hookOutgoingCallRoom.roomName}_${Date.now()}`; // Fallback with timestamp

            // Prevent repeated processing of the same call end
            if (callEndProcessed === callNotificationId) {
              return; // Already processed this call end, skip
            }

            // Mark this call end as being processed
            setCallEndProcessed(callNotificationId);

            callLogger.warn(
              `Fast detection: Call ended in room ${hookOutgoingCallRoom.roomName}`,
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
  }, [
    hookOutgoingCallRoom?.isActive,
    hookOutgoingCallRoom?.hasActiveSipCall,
    hookOutgoingCallRoom?.roomName,
    hookOutgoingCallRoom?.requestedRoomName,
    hookOutgoingCallRoom?.sipCallId,
    currentRoomName,
    showNotification,
    lastCallEndNotificationId,
    setLastCallEndNotificationId,
    clearMediaSFUState,
    clearCallFromRoom,
    callEndProcessed,
    setCallEndProcessed,
    getCallsWithCache,
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
      const isValidRoom =
        hasCallsInRoom || isOurActiveOutgoingRoom || wasRoomCreatedByUs;

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
          localStorage.removeItem("outgoingCallRoom");
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

  // Navigation protection - warn when leaving page with active MediaSFU room
  useEffect(() => {
    const hasActiveMediaSFU = isConnectedToRoom && currentRoomName;
    const hasActiveCalls = currentCalls.length > 0;
    const shouldProtect = hasActiveMediaSFU || hasActiveCalls;

    // Browser beforeunload event for page refresh/close
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (shouldProtect) {
        const message = hasActiveMediaSFU
          ? "You have an active MediaSFU room connection. Leaving this page will disconnect you."
          : "You have active calls. Leaving this page may affect your call experience.";

        event.preventDefault();
        event.returnValue = message; // Legacy support
        return message;
      }
    };

    // Add event listener when protection is needed
    if (shouldProtect) {
      window.addEventListener("beforeunload", handleBeforeUnload);

      // Log protection status for debugging
      roomLogger.info("Navigation protection enabled", {
        hasActiveMediaSFU,
        hasActiveCalls,
        currentRoomName,
        isConnectedToRoom,
      });
    }

    // Cleanup
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isConnectedToRoom, currentRoomName, currentCalls.length]);

  // React Router navigation protection
  useEffect(() => {
    const currentPath = location.pathname;
    const isOnCallsPage = currentPath === "/calls";

    // Only protect when we're actually on the calls page
    if (!isOnCallsPage) return;

    const { shouldProtect } = checkNavigationSafety();

    // Store original pushState and replaceState methods
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;

    const handleHistoryChange = (method: "pushState" | "replaceState") => {
      return function (
        this: History,
        ...args: Parameters<typeof originalPushState>
      ) {
        const [, , url] = args;
        const targetPath = url?.toString() || "";

        // Check if navigation is away from calls page and we need protection
        if (shouldProtect && targetPath && !targetPath.includes("/calls")) {
          // Prevent the navigation
          return;
        }

        // Allow the navigation
        if (method === "pushState") {
          originalPushState.apply(this, args);
        } else {
          originalReplaceState.apply(this, args);
        }
      };
    };

    if (shouldProtect) {
      // Override history methods
      window.history.pushState = handleHistoryChange("pushState");
      window.history.replaceState = handleHistoryChange("replaceState");

      // Handle popstate (back/forward buttons)
      const handlePopState = (event: PopStateEvent) => {
        const targetPath = window.location.pathname;
        if (targetPath !== "/calls") {
          // User is trying to navigate away, show confirmation
          const { hasActiveMediaSFU } = checkNavigationSafety();
          const message = hasActiveMediaSFU
            ? `You have an active MediaSFU room connection${
                currentRoomName ? ` (${currentRoomName})` : ""
              }. Navigating away will disconnect you.`
            : "You have active calls. Navigating away may affect your call experience.";

          // Push current state back to prevent navigation
          window.history.pushState(null, "", "/calls");

          // Show confirmation modal
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
              clearMediaSFUState("navigation away from calls page");
              // Now allow the navigation
              navigate(targetPath);
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
        }
      };

      window.addEventListener("popstate", handlePopState);

      return () => {
        // Restore original methods
        window.history.pushState = originalPushState;
        window.history.replaceState = originalReplaceState;
        window.removeEventListener("popstate", handlePopState);
      };
    }
  }, [
    location.pathname,
    checkNavigationSafety,
    currentRoomName,
    clearMediaSFUState,
    navigate,
  ]);

  const callManager = useCallManager();
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
    if (!config.api.key || !config.api.userName) return;

    setSipLoading(true);
    try {
      const url = new URL("https://mediasfu.com/v1/sipconfigs/");
      url.searchParams.append("action", "get");
      url.searchParams.append("startIndex", "0");
      url.searchParams.append("pageSize", "20");

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.api.userName}:${config.api.key}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.sipConfigs) {
          setSipConfigs(data.sipConfigs);
          // Auto-select first eligible number for outgoing calls
          if (data.sipConfigs.length > 0 && !selectedFromNumber) {
            const eligibleConfig = data.sipConfigs.find(
              (config: SIPConfig) =>
                config.supportSipActive !== false &&
                config.allowOutgoing !== false
            );
            if (eligibleConfig) {
              setSelectedFromNumber(
                eligibleConfig.contactNumber || eligibleConfig.phoneNumber || ""
              );
            }
          }
        }
      }
    } catch (error) {
      callLogger.error("Failed to fetch SIP configs:", error);
    } finally {
      setSipLoading(false);
    }
  }, [config.api.key, config.api.userName, selectedFromNumber]);

  // Fetch SIP configs on mount
  useEffect(() => {
    if (isApiConfigured) {
      fetchSipConfigs();
    }
  }, [isApiConfigured, fetchSipConfigs]);

  // Auto-clear manually closed room flag after 30 seconds
  useEffect(() => {
    if (roomManuallyClosedRef) {
      const timeoutId = setTimeout(() => {
        setRoomManuallyClosedRef(null);
      }, 30000);

      return () => clearTimeout(timeoutId);
    }
  }, [roomManuallyClosedRef]);

  const handleMakeCall = async () => {
    // Update flow to connecting step
    setCallFlowStep("connecting");

    if (!phoneNumber || !callManager || !selectedFromNumber) {
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

        if (botModeValidForOutgoing) {
          // Option 2: Using bot - create room via API to get valid room name

          // CRITICAL FIX: Use the same participant name for both room creation and call making
          // Ensure the participant name is properly formatted for MediaSFU
          const rawParticipantName = currentParticipantName || "voipuser";
          const callParticipantName =
            rawParticipantName.replace(/[^a-zA-Z0-9]/g, "").substring(0, 10) ||
            "voipuser";

          // For bot calls, create a real MediaSFU room via direct API call
          const roomResult = await callManager.createOrUseMediaRoom({
            sipConfig: selectedConfig,
            participantName: callParticipantName,
            duration: selectedDuration || 30
          });

          if (!roomResult.success || !roomResult.roomName) {
            throw new Error(roomResult.error || "Failed to create MediaSFU room for bot call");
          }

          roomName = roomResult.roomName;
          participantName = roomResult.participantName || callParticipantName;

          callLogger.info("Created MediaSFU room for bot call:", {
            roomName,
            participantName,
            duration: selectedDuration || 30
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
      // remove any spaces and characters from phone number aside the leading +
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
          result.error ||
            "The outgoing call could not be initiated. Please try again.",
          "error"
        );

        // Clean up outgoing room state on call failure (only for human calls with MediaSFU display)
        if (startWithInitiatorAudio && outgoingCallRoom?.isActive) {
          setOutgoingCallRoom(null);
          localStorage.removeItem("outgoingCallRoom");
          clearOutgoingRoom();
          resetSipParticipantTracking();
        }

        // Return to choose-mode step on failure
        setCallFlowStep("choose-mode");
      }
    } catch (error) {
      callLogger.error("Failed to make call:", error);
      setIsDialpadCollapsed(false); // Expand dialpad on failure

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
    (realRoomName: string) => {
      const previousRoomName = currentRoomName;
      setCurrentRoomName(realRoomName);

      // If this is a real room name for a room we created, mark the new name as created by us too
      if (
        requestedRoomName &&
        isRoomCreatedByUs(requestedRoomName) &&
        realRoomName !== requestedRoomName
      ) {
        markRoomAsCreated(realRoomName);
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
          localStorage.removeItem("outgoingCallRoom");
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
        // Also clear from localStorage
        localStorage.removeItem("outgoingCallRoom");

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
        localStorage.removeItem("outgoingCallRoom");
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
        duration: selectedDuration || 30,
        note: "MediaSFUHandler with action='create' will create the actual room",
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

      roomLogger.info(
        "Room setup complete - MediaSFURoomDisplay should now be visible and connecting...",
        {
          currentRoomName,
          isConnectedToRoom,
          tempRoomName,
        }
      );

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

  const dialpadButtons = [
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "*",
    "0",
    "#",
    "+", // Added + for international dialing
  ];

  const handleDialpadClick = (digit: string) => {
    const newValue = formatPhoneNumber(phoneNumber + digit);
    setPhoneNumber(newValue);
  };

  // Create combined calls array including outgoing call room (simplified approach)
  const allDisplayCalls = useMemo(() => {
    // Use enhanced calls from hook which includes dummy calls
    return [...enhancedCurrentCalls]; // Simplified - just return enhanced calls
  }, [enhancedCurrentCalls]); // Reduced dependencies

  if (!isApiConfigured) {
    return (
      <div className="calls-page">
        <div className="not-configured card">
          <h2>API Not Configured</h2>
          <p>Please configure your API settings to make calls.</p>
          <button
            className="btn btn-primary"
            onClick={() => (window.location.href = "/settings")}
          >
            Go to Settings
          </button>
        </div>
      </div>
    );
  }

  // Check if already connected to an outgoing call room specifically
  const isConnectedToOutgoingRoom =
    isConnectedToRoom &&
    currentRoomName &&
    (currentRoomName.startsWith("outgoing_") ||
      isRoomCreatedByUs(currentRoomName) ||
      (outgoingCallRoom?.isActive &&
        currentRoomName === outgoingCallRoom.roomName));

  return (
    <div className="calls-page">
      {/* Quick Settings Header */}
      <div className="quick-settings-header">
        <div className="quick-settings-content">
          <h2>📞 Outgoing Call Room</h2>
          <div className="quick-actions">
            <button
              className="btn btn-secondary quick-action-btn"
              onClick={handleConnectToRoom}
              disabled={
                sipLoading ||
                !selectedFromNumber ||
                isConnectedToOutgoingRoom ||
                isCreatingRoom
              }
              title={
                isConnectedToOutgoingRoom
                  ? "Already connected to outgoing call room"
                  : isCreatingRoom
                  ? "Creating room..."
                  : "Create a voice room for calls"
              }
            >
              {isCreatingRoom ? (
                <>
                  <LoadingSpinner size="small" />
                  Creating Room...
                </>
              ) : (
                <>
                  🎤{" "}
                  {isConnectedToOutgoingRoom
                    ? "Connected to Room"
                    : "Create Voice Room"}
                </>
              )}
            </button>

            <div className="room-duration-setting">
              <label htmlFor="roomDuration" className="duration-label">
                Room Duration:
              </label>
              <select
                id="roomDuration"
                className="duration-select"
                value={selectedDuration || 30}
                onChange={(e) => setSelectedDuration(Number(e.target.value))}
                title="Default duration for new voice rooms"
              >
                <option value={5}>5 minutes</option>
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={60}>1 hour</option>
                <option value={90}>90 minutes</option>
              </select>
            </div>

            {currentRoomName && isRoomCreatedByUs(currentRoomName) && (
              <div className="current-room-info">
                <span className="room-indicator">
                  🟢 Room: {currentRoomName}
                  {isMicrophoneEnabled ? " 🎤" : " 🔇"}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Room Creation Loading Spinner */}
      {isCreatingRoom && (
        <div className="room-creation-loading-overlay">
          <div className="loading-content">
            <div className="loading-header">
              <LoadingSpinner size="medium" />
              <h3>Creating Voice Room</h3>
            </div>
            <p>
              Setting up your conference room. This will only take a moment.
            </p>

            {roomCreationError && (
              <div className="error-section">
                <span className="error-message">{roomCreationError}</span>
                <button
                  className="btn btn-sm btn-outline retry-btn"
                  onClick={() => {
                    setRoomCreationError(null);
                    handleConnectToRoom();
                  }}
                  title="Retry room creation"
                >
                  🔄 Retry
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MediaSFU Room Display - Show ONLY for outgoing setup rooms we created */}
      {/* give almost no height if isCreatingRoom to avoid layout shift */}
      {currentRoomName &&
        (isConnectedToRoom || isCreatingRoom) &&
        isRoomCreatedByUs(currentRoomName) && (
          <div className="mediasfu-section" style={{ position: "relative", height: isCreatingRoom ? 10 : "auto" }}>
            {/* Enhanced Status Header for the room */}
            <div className="voice-room-header">
              <div className="room-header-gradient">
                <div className="room-header-content">
                  <div className="room-title-section">
                    <div className="room-icon">🎤</div>
                    <div className="room-title-info">
                      <h3>Voice Room</h3>
                      <span className="room-name-display">
                        {currentRoomName}
                      </span>
                    </div>

                    {/* Compact Inline Call Metadata - Show as part of title section */}
                    {hookOutgoingCallRoom?.isActive &&
                      hookOutgoingCallRoom.hasActiveSipCall &&
                      hookOutgoingCallRoom.callData && (
                        <div className="room-call-metadata-inline">
                          <span className="metadata-item">
                            📞{" "}
                            {hookOutgoingCallRoom.callData.direction ===
                            "outgoing"
                              ? extractCleanIdentifier(
                                  hookOutgoingCallRoom.callData.calledUri || ""
                                )
                              : extractCleanIdentifier(
                                  hookOutgoingCallRoom.callData.callerIdRaw ||
                                    ""
                                )}
                          </span>
                          <span
                            className={`metadata-item status-${hookOutgoingCallRoom.callData.status}`}
                          >
                            {hookOutgoingCallRoom.callData.status}
                          </span>
                          {hookOutgoingCallRoom.callData.startTimeISO && (
                            <span className="metadata-item">
                              {formatDurationWithFallback(
                                hookOutgoingCallRoom.callData,
                                liveDurationUpdateTrigger
                              )}
                            </span>
                          )}
                        </div>
                      )}
                  </div>

                  <div className="room-status-badges">
                    {hookOutgoingCallRoom?.isActive ? (
                      hookOutgoingCallRoom.hasActiveSipCall ? (
                        <span className="status-badge status-active">
                          <span className="badge-icon">📞</span>
                          Call in Progress
                        </span>
                      ) : (
                        <span className="status-badge status-ready">
                          <span className="badge-icon">✅</span>
                          Ready for Calls
                        </span>
                      )
                    ) : (
                      <span className="status-badge status-connecting">
                        <span className="badge-icon">🔄</span>
                        Setting up...
                      </span>
                    )}

                    {/* Connection Status */}
                    <span
                      className={`status-badge ${
                        isConnectedToRoom
                          ? "status-connected"
                          : "status-disconnected"
                      }`}
                    >
                      <span className="badge-icon">
                        {isConnectedToRoom ? "🟢" : "🔴"}
                      </span>
                      {isConnectedToRoom ? "Connected" : "Connecting..."}
                    </span>

                    {/* Microphone Status */}
                    <span
                      className={`status-badge ${
                        isMicrophoneEnabled ? "status-mic-on" : "status-mic-off"
                      }`}
                    >
                      <span className="badge-icon">
                        {isMicrophoneEnabled ? "🎤" : "🔇"}
                      </span>
                      {isMicrophoneEnabled ? "Mic On" : "Mic Off"}
                    </span>

                    {/* Active Call Status - Show when we have an active call in this room */}
                    {currentRoomName &&
                      isRoomCreatedByUs(currentRoomName) &&
                      hookOutgoingCallRoom?.isActive &&
                      hookOutgoingCallRoom.roomName === currentRoomName &&
                      hookOutgoingCallRoom.hasActiveSipCall &&
                      hookOutgoingCallRoom.callData && (
                        <span
                          className={`status-badge status-${hookOutgoingCallRoom.callData.status}`}
                        >
                          <span className="badge-icon">
                            {hookOutgoingCallRoom.callData.status === "active"
                              ? "📞"
                              : hookOutgoingCallRoom.callData.status ===
                                "ringing"
                              ? "🔔"
                              : "🔄"}
                          </span>
                          Call {hookOutgoingCallRoom.callData.status}
                        </span>
                      )}
                  </div>
                </div>

                {/* Room Info Row */}
                <div className="room-info-grid">
                  <div className="room-info-card">
                    <div className="info-label">From Number</div>
                    <div className="info-value">
                      {selectedFromNumber || "Not selected"}
                    </div>
                  </div>

                  {(() => {
                    // For outgoing setup rooms, use the room's call data directly
                    if (
                      currentRoomName &&
                      isRoomCreatedByUs(currentRoomName) &&
                      hookOutgoingCallRoom?.isActive &&
                      hookOutgoingCallRoom.roomName === currentRoomName &&
                      hookOutgoingCallRoom.hasActiveSipCall &&
                      hookOutgoingCallRoom.callData
                    ) {
                      // Show active call metadata in room info using outgoing room data
                      const callData = hookOutgoingCallRoom.callData;
                      return (
                        <>
                          <div className="room-info-card">
                            <div className="info-label">Call Status</div>
                            <div className="info-value">{callData.status}</div>
                          </div>
                          <div className="room-info-card">
                            <div className="info-label">
                              {callData.direction === "outgoing"
                                ? "Calling"
                                : "From"}
                            </div>
                            <div className="info-value">
                              {callData.direction === "outgoing"
                                ? extractCleanIdentifier(
                                    callData.calledUri || ""
                                  )
                                : extractCleanIdentifier(
                                    callData.callerIdRaw || ""
                                  )}
                            </div>
                          </div>
                          {callData.startTimeISO && (
                            <div className="room-info-card">
                              <div className="info-label">Duration</div>
                              <div className="info-value">
                                {formatDurationWithFallback(
                                  callData,
                                  liveDurationUpdateTrigger
                                )}
                              </div>
                            </div>
                          )}

                          {/* Call control actions for active call */}
                          <div className="room-info-card room-action-card">
                            {callData.status === "active" ? (
                              <button
                                className="btn btn-danger btn-compact"
                                onClick={() => {
                                  if (hookOutgoingCallRoom.sipCallId) {
                                    // Find the actual call in currentCalls or create minimal call object
                                    const existingCall = currentCalls.find(
                                      (c) =>
                                        c.sipCallId ===
                                        hookOutgoingCallRoom.sipCallId
                                    );
                                    if (existingCall) {
                                      handleEndCall(existingCall);
                                    } else {
                                      // Call service directly if we can't find the full call object
                                      callService.hangupCall(
                                        hookOutgoingCallRoom.sipCallId
                                      );
                                    }
                                  }
                                }}
                                title="End the active call"
                                disabled={!hookOutgoingCallRoom.sipCallId}
                              >
                                🔴 End Call
                              </button>
                            ) : callData.status === "ringing" &&
                              callData.direction !== "outgoing" ? (
                              <>
                                <button
                                  className="btn btn-success btn-compact"
                                  onClick={() => {
                                    if (hookOutgoingCallRoom.sipCallId) {
                                      const existingCall = currentCalls.find(
                                        (c) =>
                                          c.sipCallId ===
                                          hookOutgoingCallRoom.sipCallId
                                      );
                                      if (existingCall) {
                                        handleAnswerCall(existingCall);
                                      }
                                    }
                                  }}
                                  title="Answer the incoming call"
                                  style={{ marginRight: "0.5rem" }}
                                  disabled={!hookOutgoingCallRoom.sipCallId}
                                >
                                  📞 Answer
                                </button>
                                <button
                                  className="btn btn-danger btn-compact"
                                  onClick={() => {
                                    if (hookOutgoingCallRoom.sipCallId) {
                                      const existingCall = currentCalls.find(
                                        (c) =>
                                          c.sipCallId ===
                                          hookOutgoingCallRoom.sipCallId
                                      );
                                      if (existingCall) {
                                        handleDeclineCall(existingCall);
                                      }
                                    }
                                  }}
                                  title="Decline the incoming call"
                                  disabled={!hookOutgoingCallRoom.sipCallId}
                                >
                                  ❌ Decline
                                </button>
                              </>
                            ) : (
                              <span className="call-status-info">
                                {callData.status === "ringing" &&
                                callData.direction === "outgoing"
                                  ? "📞 Ringing..."
                                  : callData.status === "connecting"
                                  ? "🔄 Connecting..."
                                  : `📞 ${callData.status}`}
                              </span>
                            )}
                          </div>
                        </>
                      );
                    }

                    // No active call - show outgoing call setup OR joined room info
                    return hookOutgoingCallRoom?.isActive ? (
                      <>
                        <div className="room-info-card">
                          <div className="info-label">Room Type</div>
                          <div className="info-value">Outgoing Call Setup</div>
                        </div>
                        <div className="room-info-card">
                          <div className="info-label">Duration</div>
                          <div className="info-value">
                            {selectedDuration} minutes
                          </div>
                        </div>

                        {/* To Number input integrated into info grid */}
                        {!hookOutgoingCallRoom.hasActiveSipCall && (
                          <div className="room-info-card room-input-card">
                            <div className="info-label">To Number</div>
                            <input
                              type="text"
                              className="room-phone-input"
                              value={phoneNumber}
                              onChange={(e) =>
                                setPhoneNumber(
                                  formatPhoneNumber(e.target.value)
                                )
                              }
                              placeholder="+1234567890"
                              maxLength={16}
                              title="Enter phone number to call"
                            />
                          </div>
                        )}

                        {/* Quick Actions integrated into info grid */}
                        {!hookOutgoingCallRoom.hasActiveSipCall && (
                          <div className="room-info-card room-action-card">
                            <button
                              className="btn btn-success btn-compact"
                              onClick={handleMakeCall}
                              disabled={
                                !isConnectedToRoom ||
                                !phoneNumber ||
                                !isValidE164(phoneNumber) ||
                                isDialing
                              }
                              title={
                                !isConnectedToRoom
                                  ? "Wait for room connection"
                                  : !phoneNumber
                                  ? "Enter a phone number first"
                                  : !isValidE164(phoneNumber)
                                  ? "Enter a valid phone number"
                                  : isDialing
                                  ? "Call in progress..."
                                  : "Make a call using this room"
                              }
                            >
                              {isDialing ? "📞 Calling..." : "📞 Make Call"}
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      // Joined room - show basic room info
                      <>
                        <div className="room-info-card">
                          <div className="info-label">Room Type</div>
                          <div className="info-value">Joined Call Room</div>
                        </div>
                        <div className="room-info-card">
                          <div className="info-label">Status</div>
                          <div className="info-value">
                            {isConnectedToRoom
                              ? "✅ Connected"
                              : "🔄 Connecting"}
                          </div>
                        </div>
                        <div className="room-info-card">
                          <div className="info-label">Participant</div>
                          <div className="info-value">
                            {currentParticipantName || "voipuser"}
                          </div>
                        </div>
                        <div className="room-info-card room-action-card">
                          <span className="call-status-info">
                            💬 Ready for call activity
                          </span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* Outgoing Call Setup Status - Show when room is being set up */}
            {hookOutgoingCallRoom?.isActive &&
              !hookOutgoingCallRoom.hasActiveSipCall &&
              phoneNumber && (
                <div className="outgoing-setup-status">
                  <div className="setup-status-header">
                    <div className="setup-info">
                      <span className="status-badge status-setup">
                        🔄 SETTING UP CALL
                      </span>
                      <span className="setup-details">
                        Preparing to call: {phoneNumber}
                      </span>
                    </div>

                    {/* Quick call controls in setup */}
                    <div className="setup-quick-controls">
                      <input
                        type="text"
                        className="phone-number-input compact"
                        value={phoneNumber}
                        onChange={(e) =>
                          setPhoneNumber(formatPhoneNumber(e.target.value))
                        }
                        placeholder="+1234567890"
                        maxLength={16}
                      />
                      <button
                        className="btn btn-success btn-xs"
                        onClick={handleMakeCall}
                        disabled={
                          !phoneNumber || !isValidE164(phoneNumber) || isDialing
                        }
                        title="Call this number using the room"
                        style={{
                          padding: "4px 8px",
                          fontSize: "12px",
                          minHeight: "28px",
                        }}
                      >
                        {isDialing ? "📞 Calling..." : "📞 Call"}
                      </button>
                      {phoneNumber &&
                        phoneNumber.length > 3 &&
                        !isValidE164(phoneNumber) && (
                          <div className="validation-message error compact">
                            Invalid format. Use: +1234567890
                          </div>
                        )}
                    </div>
                  </div>
                </div>
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
              autoJoin={true}
              isOutgoingCallSetup={
                currentRoomName ? isRoomCreatedByUs(currentRoomName) : false
              }
              onParticipantsUpdate={handleRoomParticipantsUpdate}
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
          </div>
        )}

      {/* Make Call Section */}
      {showDialer && (
        <div
          className={`dialer-section card ${
            callFlowStep !== "closed" ? "step-flow-active" : ""
          }`}
        >
          <div className="dialer-header">
            <h3>📞 Make a Call</h3>
            <button
              className="btn btn-secondary close-dialer"
              onClick={() => closeCallFlow()}
              aria-label="Hide Dialer"
            >
              🔼 Hide
            </button>
          </div>

          <div className="dialer-content">
            {/* Step 1: Select Number */}
            {callFlowStep === "select-number" && (
              <div className="step-content">
                <h4>Step 1: Select a number to call from</h4>
                <div className="from-number-section">
                  {sipLoading ? (
                    <div className="loading-indicator">
                      <LoadingSpinner size="small" />
                      Loading your phone numbers...
                    </div>
                  ) : sipConfigs.length > 0 ? (
                    <select
                      id="fromNumber"
                      className="from-number-select"
                      value={selectedFromNumber}
                      onChange={(e) => setSelectedFromNumber(e.target.value)}
                    >
                      <option value="">Select a number to call from</option>
                      {sipConfigs.map((config, index) => {
                        const phoneNumber =
                          config.contactNumber ||
                          config.phoneNumber ||
                          "Unknown";
                        const provider = config.provider || "Unknown Provider";
                        const isEligible = isEligibleForOutgoing(config);
                        const eligibilityReason = getEligibilityReason(config);

                        return (
                          <option
                            key={config.id || `config-${index}`}
                            value={phoneNumber}
                            disabled={!isEligible}
                          >
                            📞 {formatPhoneNumberForDisplay(phoneNumber)} ({provider}){" "}
                            {isEligible ? "✅" : `❌ ${eligibilityReason}`}
                          </option>
                        );
                      })}
                    </select>
                  ) : (
                    <div className="no-numbers-message">
                      <p>
                        No SIP configurations found. Set up your phone numbers
                        in Settings first.
                      </p>
                    </div>
                  )}
                </div>
                <div className="step-actions">
                  <button
                    className="btn btn-primary"
                    onClick={nextStep}
                    disabled={!selectedFromNumber}
                  >
                    Next: Enter Phone Number →
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Enter Phone Number */}
            {callFlowStep === "enter-phone" && (
              <div className="step-content">
                <h4>Step 2: Enter the phone number to call</h4>
                <div className="phone-number-section">
                  <label htmlFor="phoneNumber">Phone Number:</label>
                  <input
                    id="phoneNumber"
                    type="text"
                    className="phone-number-input"
                    value={phoneNumber}
                    onChange={(e) =>
                      setPhoneNumber(formatPhoneNumber(e.target.value))
                    }
                    placeholder="+1234567890"
                    maxLength={16}
                  />
                  {phoneNumber &&
                    phoneNumber.length > 1 &&
                    !isValidE164(phoneNumber) && (
                      <div className="validation-message error">
                        Invalid phone number format. Use international format:
                        +1234567890
                      </div>
                    )}

                  {/* Dialpad Toggle */}
                  <div className="input-controls" style={{ marginTop: "1rem" }}>
                    <button
                      className="btn btn-info dialpad-toggle"
                      onClick={() => setIsDialpadCollapsed(!isDialpadCollapsed)}
                      title={
                        isDialpadCollapsed ? "Show Dialpad" : "Hide Dialpad"
                      }
                    >
                      {isDialpadCollapsed
                        ? "🔢 Show Dialpad"
                        : "🔢 Hide Dialpad"}
                    </button>
                  </div>

                  {/* Collapsible Dialpad */}
                  {!isDialpadCollapsed && (
                    <div className="dialpad" style={{ marginTop: "1rem" }}>
                      {dialpadButtons.map((digit, index) => (
                        <button
                          key={digit}
                          className={`dialpad-btn ${
                            digit === "+" ? "dialpad-plus" : ""
                          }`}
                          onClick={() => handleDialpadClick(digit)}
                          disabled={isDialing}
                          style={index === 12 ? { gridColumn: "2" } : {}} // Center the + button
                        >
                          {digit}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="step-actions">
                  <button className="btn btn-secondary" onClick={prevStep}>
                    ← Back
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={nextStep}
                    disabled={!phoneNumber || !isValidE164(phoneNumber)}
                  >
                    Next: Choose Mode →
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Choose Call Mode */}
            {callFlowStep === "choose-mode" && (
              <div className="step-content">
                <h4>Step 3: Choose how to handle the call</h4>
                <div className="call-mode-section">
                  {(() => {
                    const selectedConfig = sipConfigs.find(
                      (config) =>
                        (config.contactNumber || config.phoneNumber) ===
                        selectedFromNumber
                    );
                    const autoAgent = selectedConfig?.autoAgent;

                    // Check if bot mode is properly configured for outgoing calls
                    const autoAgentAvailable =
                      autoAgent?.enabled &&
                      autoAgent.type &&
                      (autoAgent.type === "AI" ||
                        autoAgent.type === "IVR" ||
                        autoAgent.type === "PLAYBACK");

                    // CRITICAL: Check outgoingType is set to AI for bot outgoing calls
                    const botModeAvailable =
                      autoAgentAvailable && autoAgent?.outgoingType === "AI";

                    // Enhanced voice mode detection - check for existing rooms and ability to create new ones
                    const hasExistingActiveRoom =
                      (isConnectedToRoom && currentRoomName) ||
                      hookOutgoingCallRoom?.isActive;
                    const canCreateNewRoom =
                      !isConnectedToRoom &&
                      !hookOutgoingCallRoom?.isActive &&
                      selectedFromNumber;

                    // Voice mode is available if we have an active room OR can create one
                    const voiceModeAvailable =
                      hasExistingActiveRoom || canCreateNewRoom;

                    // Auto-select the best available option
                    const shouldSelectBot =
                      botModeAvailable &&
                      (!hasExistingActiveRoom || !isMicrophoneEnabled);
                    const shouldSelectVoice =
                      voiceModeAvailable &&
                      hasExistingActiveRoom &&
                      isMicrophoneEnabled;

                    return (
                      <div className="mode-options">
                        {/* Bot Call Option */}
                        <div
                          className={`mode-option bot-mode ${
                            shouldSelectBot ? "auto-selected" : ""
                          } ${!botModeAvailable ? "disabled" : ""}`}
                        >
                          <div className="mode-header">
                            <div className="mode-title">
                              <h5>🤖 Bot Call</h5>
                              {shouldSelectBot && (
                                <span className="auto-selected-badge">
                                  ✅ Recommended
                                </span>
                              )}
                              {!botModeAvailable && (
                                <span className="unavailable-badge">
                                  ❌ Unavailable
                                </span>
                              )}
                            </div>
                            <span className="mode-description">
                              {botModeAvailable
                                ? "AI agent handles the call automatically"
                                : autoAgentAvailable
                                ? "Agent configured but outgoingType not set to AI"
                                : "No AI agent configured for this number"}
                            </span>
                          </div>
                          <div className="mode-details">
                            {botModeAvailable ? (
                              <>
                                <p>Agent Type: {autoAgent.type}</p>
                                <p>Outgoing Type: {autoAgent.outgoingType}</p>
                                <p>
                                  Perfect for automated calls, surveys, or
                                  information delivery
                                </p>
                                <p>✅ No room connection required</p>
                              </>
                            ) : autoAgentAvailable ? (
                              <>
                                <p>Agent Type: {autoAgent.type}</p>
                                <p>
                                  ❌ Outgoing Type:{" "}
                                  {autoAgent.outgoingType || "Not set"} (needs
                                  "AI")
                                </p>
                                <p>
                                  The auto agent exists but outgoingType must be
                                  set to "AI" for bot calls
                                </p>
                                <p>
                                  Configure outgoingType to "AI" in SIP settings
                                  to enable bot calls
                                </p>
                              </>
                            ) : (
                              <>
                                <p>❌ No auto agent configured</p>
                                <p>
                                  This number doesn't have AI/IVR/PLAYBACK agent
                                  setup
                                </p>
                                <p>
                                  Configure auto agent in SIP settings to enable
                                  bot calls
                                </p>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Voice Call Option */}
                        <div
                          className={`mode-option user-mode ${
                            shouldSelectVoice ? "auto-selected" : ""
                          } ${!voiceModeAvailable ? "disabled" : ""}`}
                        >
                          <div className="mode-header">
                            <div className="mode-title">
                              <h5>👤 Voice Call</h5>
                              {shouldSelectVoice && (
                                <span className="auto-selected-badge">
                                  ✅ Ready
                                </span>
                              )}
                            </div>
                            <span className="mode-description">
                              You talk directly with the caller
                            </span>
                          </div>
                          <div className="mode-details">
                            <p>Requires: Active MediaSFU room connection</p>

                            {/* Show current room status */}
                            {isConnectedToRoom && currentRoomName && (
                              <>
                                <p
                                  style={{
                                    color: "var(--success-color, #28a745)",
                                    fontWeight: "bold",
                                  }}
                                >
                                  ✅ Connected to room: {currentRoomName}
                                </p>
                                {isMicrophoneEnabled && (
                                  <p
                                    style={{
                                      color: "var(--success-color, #28a745)",
                                      fontWeight: "bold",
                                    }}
                                  >
                                    🎤 Microphone is active and ready
                                  </p>
                                )}
                                {!isMicrophoneEnabled && (
                                  <p
                                    style={{
                                      color: "var(--warning-color, #ffc107)",
                                      fontWeight: "bold",
                                    }}
                                  >
                                    🔇 Microphone is muted (you can still make
                                    the call)
                                  </p>
                                )}
                              </>
                            )}

                            {/* Show outgoing room status */}
                            {hookOutgoingCallRoom?.isActive && (
                              <>
                                <p
                                  style={{
                                    color: "var(--success-color, #28a745)",
                                    fontWeight: "bold",
                                  }}
                                >
                                  ✅ Outgoing call room ready:{" "}
                                  {hookOutgoingCallRoom.displayName}
                                </p>
                                {hookOutgoingCallRoom.isMediaSFUConnected &&
                                  isMicrophoneEnabled && (
                                    <p
                                      style={{
                                        color: "var(--success-color, #28a745)",
                                        fontWeight: "bold",
                                      }}
                                    >
                                      🎤 Microphone is active and ready
                                    </p>
                                  )}
                              </>
                            )}

                            {/* Show option to create room if no existing room */}
                            {!isConnectedToOutgoingRoom &&
                              !hookOutgoingCallRoom?.isActive && (
                                <>
                                  <p className="requirement-info">
                                    💡 You can create a voice room for this call
                                  </p>
                                  <button
                                    className="btn btn-primary"
                                    onClick={handleConnectToRoom}
                                    disabled={
                                      sipLoading ||
                                      !selectedFromNumber ||
                                      isCreatingRoom
                                    }
                                    style={{ marginTop: "0.5rem" }}
                                  >
                                    {isCreatingRoom ? (
                                      <>
                                        <LoadingSpinner size="small" />
                                        Creating Room...
                                      </>
                                    ) : (
                                      "🎤 Create Voice Room"
                                    )}
                                  </button>
                                  <p
                                    style={{
                                      fontSize: "0.875rem",
                                      color: "var(--text-muted, #6b7280)",
                                      marginTop: "0.5rem",
                                    }}
                                  >
                                    Duration: {selectedDuration} minutes
                                  </p>
                                </>
                              )}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
                <div className="step-actions">
                  <button className="btn btn-secondary" onClick={prevStep}>
                    ← Back
                  </button>
                  <button
                    className="btn btn-success"
                    onClick={handleMakeCall}
                    disabled={(() => {
                      const selectedConfig = sipConfigs.find(
                        (config) =>
                          (config.contactNumber || config.phoneNumber) ===
                          selectedFromNumber
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

                      // Enhanced room availability check
                      const hasExistingActiveRoom =
                        (isConnectedToRoom && currentRoomName) ||
                        hookOutgoingCallRoom?.isActive;
                      const canCreateNewRoom =
                        !isConnectedToRoom &&
                        !hookOutgoingCallRoom?.isActive &&
                        selectedFromNumber;
                      const voiceModeAvailable =
                        hasExistingActiveRoom || canCreateNewRoom;

                      // Call is valid if either:
                      // 1. Bot mode is available (has auto agent AND outgoingType is AI), OR
                      // 2. Voice mode is available (has active room OR can create one)
                      const canMakeCall =
                        botModeAvailable || voiceModeAvailable;

                      return !canMakeCall;
                    })()}
                    title="Make a call with the selected options"
                  >
                    📞 Make Call
                  </button>
                </div>
              </div>
            )}

            {/* Step 4: Connecting */}
            {callFlowStep === "connecting" && (
              <div className="step-content">
                <h4>Step 4: Connecting your call...</h4>
                <div className="connecting-status">
                  <LoadingSpinner size="medium" />
                  <p>Setting up your call to {phoneNumber}</p>
                  <p>From: {selectedFromNumber}</p>
                  <p>Please wait...</p>
                </div>
              </div>
            )}

            {/* Step 5: Connected */}
            {callFlowStep === "connected" && (
              <div className="step-content">
                <h4>✅ Call initiated successfully!</h4>
                <div className="success-status">
                  <p>Your call to {phoneNumber} has been set up.</p>
                  <p>
                    Monitor the call status in the Active Calls section above.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      <br />

      <div className="calls-header">
        <div className="header-content">
          <h1>Active Calls</h1>
          <button
            className="btn btn-primary make-call-btn"
            onClick={() => (showDialer ? closeCallFlow() : startCallFlow())}
          >
            {showDialer ? "🔼 Hide Dialer" : "📞 Show Dialer"}
          </button>
        </div>
      </div>

      {/* Active Calls - Full width main content */}
      {allDisplayCalls.filter(
        (call) => !call.sipCallId?.startsWith("dummy_outgoing_")
      ).length > 0 ? (
        <div className="active-calls-main card">
          <h3>
            📞 Current Active Calls (
            {
              allDisplayCalls.filter(
                (call) => !call.sipCallId?.startsWith("dummy_outgoing_")
              ).length
            }
            )
          </h3>
          {/* <p className="call-status-info">
            Showing all non-terminated calls (ringing, connecting, active, on-hold)
          </p> */}
          <div className="calls-list">
            {allDisplayCalls
              .filter((call) => !call.sipCallId?.startsWith("dummy_outgoing_"))
              .map((call, index) => {
                const callId = call.sipCallId || `call-${index}`;
                const isExpanded = isCallExpanded(callId);

                // Determine direction class for styling
                const directionClass =
                  call.direction === "inbound" || call.direction === "incoming"
                    ? "incoming"
                    : "outgoing";

                return (
                  <div
                    key={callId}
                    className={`call-item ${directionClass} ${
                      isExpanded ? "expanded" : ""
                    }`}
                  >
                    <div
                      className="call-header"
                      onClick={() => toggleCallExpansion(callId)}
                    >
                      <div
                        className={`call-direction ${
                          call.direction === "inbound" ||
                          call.direction === "incoming"
                            ? "incoming"
                            : "outgoing"
                        }`}
                      >
                        {call.direction === "inbound" ||
                        call.direction === "incoming"
                          ? "📥"
                          : "📤"}
                        <span className="direction-text">
                          {call.direction === "inbound" ||
                          call.direction === "incoming"
                            ? "Incoming"
                            : "Outgoing"}
                        </span>
                      </div>
                      <div className="call-details">
                        <span className="phone-number">
                          {(() => {
                            const sipUri =
                              call.direction === "outgoing"
                                ? call.calledUri
                                : call.callerIdRaw;
                            return extractCleanIdentifier(sipUri || "Unknown");
                          })()}
                        </span>
                        <span className="caller-name">
                          {(() => {
                            // Use callerIdRaw for proper parsing like the reference implementation
                            const callerIdRaw = call.callerIdRaw || "";
                            const direction =
                              call.direction === "inbound" ||
                              call.direction === "incoming"
                                ? "INCOMING"
                                : "OUTGOING";
                            const calledUri = call.calledUri || "";

                            if (callerIdRaw) {
                              const callerInfo = parseSipCaller(
                                callerIdRaw,
                                direction,
                                calledUri
                              );
                              return getCallerDisplayString(callerInfo);
                            }

                            return (
                              call.humanParticipantName || "Unknown Caller"
                            );
                          })()}
                        </span>
                      </div>
                      <div className="call-status">
                        <span className={`status-badge status-${call.status}`}>
                          {call.status}
                        </span>
                        {call.startTimeISO && (
                          <span className="call-time">
                            {new Date(call.startTimeISO).toLocaleTimeString()}
                          </span>
                        )}
                      </div>
                      {!isExpanded && (
                        <span className="expand-hint">
                          click to expand for details
                        </span>
                      )}
                      <div className="expand-icon">
                        {isExpanded ? "🔽" : "▶️"}
                      </div>
                    </div>
                    <br />

                    {/* Auto-expand for expanded calls and show expanded content when expanded */}
                    {isExpanded && (
                      <div className="call-quick-actions">
                        {/* Join call action for non-joined calls */}
                        {call.roomName && currentRoomName !== call.roomName && (
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleJoinCall(call);
                            }}
                            title={
                              isConnectedToRoom
                                ? "Switch to this call's room"
                                : "Join MediaSFU room for this call"
                            }
                          >
                            🎯 {isConnectedToRoom ? "Switch Room" : "Join Room"}
                          </button>
                        )}

                        {/* Answer/Decline for incoming calls */}
                        {(call.direction === "incoming" ||
                          call.direction === "inbound") &&
                          (call.status === "ringing" ||
                            call.status === "connecting") && (
                            <>
                              <button
                                className="btn btn-success btn-sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAnswerCall(call);
                                }}
                                title="Answer Call"
                              >
                                📞 Answer
                              </button>
                              <button
                                className="btn btn-danger btn-sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeclineCall(call);
                                }}
                                title="Decline Call"
                              >
                                ❌ Decline
                              </button>
                            </>
                          )}

                        {/* Hold/End for active calls */}
                        {(call.status === "active" ||
                          call.status?.toLowerCase() === "connected") && (
                          <>
                            <button
                              className="btn btn-warning btn-sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleHoldCall(call);
                              }}
                              title="Hold Call"
                            >
                              ⏸️ Hold
                            </button>
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEndCall(call);
                              }}
                              title="End Call"
                            >
                              🔴 End Call
                            </button>
                          </>
                        )}
                      </div>
                    )}

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="call-expanded-details">
                        {/* Critical metadata - always visible when expanded */}
                        <div className="call-metadata critical">
                          <div className="metadata-row">
                            <strong>Status:</strong>{" "}
                            <span
                              className={`status-badge status-${call.status}`}
                            >
                              {call.status}
                            </span>
                          </div>
                          <div className="metadata-row">
                            <strong>Direction:</strong>{" "}
                            <span className="capitalize">{call.direction}</span>
                          </div>
                          {(call.durationSeconds || call.startTimeISO) && (
                            <div className="metadata-row">
                              <strong>Duration:</strong>{" "}
                              <span>
                                {formatDurationWithFallback(
                                  call,
                                  liveDurationUpdateTrigger
                                )}
                              </span>
                            </div>
                          )}
                          {call.startTimeISO && (
                            <div className="metadata-row">
                              <strong>Started:</strong>{" "}
                              <span>
                                {new Date(
                                  call.startTimeISO
                                ).toLocaleTimeString()}
                              </span>
                            </div>
                          )}
                          {call.roomName && (
                            <div className="metadata-row">
                              <strong>Room:</strong>{" "}
                              <span>{call.roomName}</span>
                            </div>
                          )}
                          {call.pendingHumanIntervention && (
                            <div className="metadata-row">
                              <strong>Needs Attention:</strong>{" "}
                              <span className="status-warning">
                                Human intervention required
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Detailed metadata toggle header */}
                        <div className="metadata-section-header">
                          <h4>Detailed Information</h4>
                          <button
                            className="metadata-toggle-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleMetadataCollapse(callId);
                            }}
                            title={
                              isMetadataCollapsed(callId)
                                ? "Show detailed metadata"
                                : "Hide detailed metadata"
                            }
                          >
                            {isMetadataCollapsed(callId)
                              ? "▶️ Show"
                              : "🔽 Hide"}
                          </button>
                        </div>

                        {/* Detailed metadata - additional technical details */}
                        {!isMetadataCollapsed(callId) && (
                          <div className="call-metadata detailed">
                            <div className="metadata-row">
                              <strong>Call ID:</strong>{" "}
                              <span>{call.sipCallId || "N/A"}</span>
                            </div>
                            <div className="metadata-row">
                              <strong>From:</strong>{" "}
                              <span>
                                {extractCleanIdentifier(call.callerIdRaw || "")}
                              </span>
                            </div>
                            <div className="metadata-row">
                              <strong>To:</strong>{" "}
                              <span>
                                {extractCleanIdentifier(call.calledUri || "")}
                              </span>
                            </div>
                            {call.humanParticipantName && (
                              <div className="metadata-row">
                                <strong>Human Participant:</strong>{" "}
                                <span>{call.humanParticipantName}</span>
                              </div>
                            )}
                            {call.startTimeISO && (
                              <div className="metadata-row">
                                <strong>Full Start Time:</strong>{" "}
                                <span>
                                  {new Date(call.startTimeISO).toLocaleString()}
                                </span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Advanced actions in expanded view */}
                        <div className="call-advanced-actions">
                          {call.roomName &&
                            currentRoomName !== call.roomName && (
                              <button
                                className="btn btn-primary btn-sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleJoinCall(call);
                                }}
                                title={
                                  isConnectedToRoom
                                    ? "Switch to this call's room"
                                    : "Join MediaSFU room for this call"
                                }
                              >
                                🎯{" "}
                                {isConnectedToRoom
                                  ? "Switch Room"
                                  : "Join Room"}
                              </button>
                            )}

                          {/* Call Control Buttons */}
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEndCall(call);
                            }}
                            title="End Call"
                          >
                            🔴 End Call
                          </button>

                          <button
                            className="btn btn-warning btn-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleHoldCall(call);
                            }}
                            title="Hold Call"
                          >
                            ⏸️ Hold Call
                          </button>
                        </div>

                        {/* Media Room Integration - Show when expanded and NOT currently connected to this room */}
                        {call.roomName &&
                          isExpanded &&
                          currentRoomName !== call.roomName && (
                            <div className="call-room-integration">
                              <h4>🎧 Media Room Integration</h4>

                              {/* Not connected - Show room details and join button */}
                              <div className="room-details-simple">
                                <div className="room-info">
                                  <span className="room-name">
                                    Room: {call.roomName}
                                  </span>
                                  <span className="status-indicator disconnected">
                                    🔴 Not Connected
                                  </span>
                                </div>
                                <p className="connection-help">
                                  Join the media room to participate in
                                  voice/video for this call
                                </p>
                                <button
                                  className="btn btn-primary"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleJoinCall(call);
                                  }}
                                  title="Join MediaSFU room for this call"
                                >
                                  🎯 Join Media Room
                                </button>
                              </div>
                            </div>
                          )}

                        {/* Current Room Notice - Show when this call is in the currently active room */}
                        {call.roomName &&
                          isExpanded &&
                          currentRoomName === call.roomName && (
                            <div className="call-room-integration">
                              <h4>🎧 Media Room Integration</h4>
                              <div className="room-details-simple">
                                <div className="room-info">
                                  <span className="room-name">
                                    Room: {call.roomName}
                                  </span>
                                  <span className="status-indicator connected">
                                    🟢 Currently Active
                                  </span>
                                </div>

                                {/* Show MediaSFU display for external rooms (rooms we didn't create) */}
                                {/* CRITICAL: Don't render MediaSFURoomDisplay here if this is our active outgoing setup room */}
                                {!isRoomCreatedByUs(call.roomName) &&
                                  !(
                                    currentRoomName === call.roomName &&
                                    isRoomCreatedByUs(currentRoomName)
                                  ) && (
                                    <div className="external-room-mediasfu">
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
                                              clearTimeout(
                                                roomCreationTimeoutRef
                                              );
                                              setRoomCreationTimeoutRef(null);
                                            }
                                            if (roomManuallyClosedRef) {
                                              setRoomManuallyClosedRef(null);
                                            }
                                          }
                                        }}
                                        onMicrophoneChange={
                                          handleMicrophoneChange
                                        }
                                        onRoomNameUpdate={handleRoomNameUpdate}
                                        onDisconnect={handleRoomDisconnect}
                                        onEndCall={handleRoomEndCall}
                                        autoJoin={true}
                                        isOutgoingCallSetup={false}
                                        currentCall={call}
                                        duration={30}
                                      />
                                    </div>
                                  )}
                              </div>
                            </div>
                          )}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      ) : (
        <div className="no-calls-state card">
          <div className="no-calls-content">
            <div className="no-calls-icon">📞</div>
            <h3>No Active Calls</h3>
            <p>
              There are currently no active calls. Click "Make Call" to start a
              new call.
            </p>
            <button className="btn btn-primary" onClick={() => startCallFlow()}>
              {showDialer ? "🔼 Hide Dialer" : "📞 Show Dialer"}
            </button>
          </div>
        </div>
      )}
      <br />

      {/* Notification Modal for toast messages */}
      <NotificationModal
        isOpen={notification.isOpen}
        title={notification.title}
        message={notification.message}
        type={notification.type}
        onClose={closeNotification}
      />

      {/* Microphone Confirmation Modal */}
      <ConfirmationModal
        isOpen={microphoneConfirmation.isOpen}
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
        type="warning"
      />

      {/* Navigation confirmation modal */}
      <ConfirmationModal
        isOpen={navigationConfirmation.isOpen}
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
        type="warning"
      />
    </div>
  );
};

export default CallsPage;
