// no React usage here
import { Alert } from 'react-native';
import { configService } from './configService';
import { callService } from './callService';
import { Call } from '../types/call.types';
import { roomLogger } from '../utils/logger';

export interface MediaSFUServiceOptions {
  roomName: string;
  userName: string;
  audioOnly?: boolean;
  onCallEnd?: () => void;
  onCallStart?: () => void;
  onCallStatusChange?: (status: string) => void;
}

export class MediaSFUService {
  private mediaSFUInstance: any = null;
  private isInitialized = false;
  private currentCall: Call | null = null;
  private options: MediaSFUServiceOptions | null = null;

  constructor() {
    this.mediaSFUInstance = null;
  }

  // Initialize MediaSFU with configuration
  async initialize(options: MediaSFUServiceOptions): Promise<boolean> {
    try {
      const config = await configService.getConfig();

      if (!config?.api?.baseUrl || !config?.api?.key) {
        Alert.alert('Configuration Error', 'Please configure API settings first');
        return false;
      }

      this.options = options;

      // For now, we'll simulate MediaSFU initialization
      // In a full implementation, this would initialize the actual MediaSFU SDK
  roomLogger.info('Initializing MediaSFU with config:', {
        apiUrl: config.api.baseUrl,
        apiKey: config.api.key.substring(0, 10) + '...',
        userName: config.api.userName,
        roomName: options.roomName,
        audioOnly: options.audioOnly,
      });

      this.isInitialized = true;

  roomLogger.info('MediaSFU initialized successfully');
      return true;
    } catch (error) {
      roomLogger.error('Failed to initialize MediaSFU:', error);
      Alert.alert('Initialization Error', 'Failed to initialize MediaSFU service');
      return false;
    }
  }

  // Join a room/call
  async joinCall(roomName: string, phoneNumber?: string): Promise<boolean> {
    try {
      if (!this.isInitialized) {
        roomLogger.error('MediaSFU not initialized');
        return false;
      }

      // Create call entry
      this.currentCall = {
        sipCallId: `mediasfu_${Date.now()}`,
        status: 'connecting',
        direction: 'outbound',
        startTimeISO: new Date().toISOString(),
        durationSeconds: 0,
        roomName: roomName,
        callerIdRaw: this.options?.userName || 'voipuser',
        calledUri: phoneNumber || roomName,
        audioOnly: this.options?.audioOnly || true,
        activeMediaSource: 'none',
        humanParticipantName: this.options?.userName || 'voipuser',
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

        // Legacy fields
        id: `call_${Date.now()}`,
        phoneNumber: phoneNumber || roomName,
        callerName: `Call to ${phoneNumber || roomName}`,
        startTime: new Date(),
        duration: 0,
      };

      // Save to call history
      await callService.saveCallToHistory(this.currentCall);

  roomLogger.info('Joining MediaSFU call:', roomName);

      // Simulate joining process
      setTimeout(() => {
        this.handleCallStart();
      }, 2000);

      return true;
    } catch (error) {
      roomLogger.error('Failed to join call:', error);
      return false;
    }
  }

  // Leave the current call
  async leaveCall(): Promise<boolean> {
    try {
      if (!this.mediaSFUInstance) {
        return false;
      }

  roomLogger.info('Leaving MediaSFU call');

      // The actual leave logic would be implemented here
      this.handleCallEnd();

      return true;
    } catch (error) {
      roomLogger.error('Failed to leave call:', error);
      return false;
    }
  }

  // Toggle audio mute
  async toggleAudio(): Promise<boolean> {
    try {
      if (!this.mediaSFUInstance) {
        return false;
      }

      // Implementation would go here
      roomLogger.debug('Toggling audio');
      return true;
    } catch (error) {
      roomLogger.error('Failed to toggle audio:', error);
      return false;
    }
  }

  // Toggle video
  async toggleVideo(): Promise<boolean> {
    try {
      if (!this.mediaSFUInstance) {
        return false;
      }

      // Implementation would go here
      roomLogger.debug('Toggling video');
      return true;
    } catch (error) {
      roomLogger.error('Failed to toggle video:', error);
      return false;
    }
  }

  // Get current call status
  getCurrentCall(): Call | null {
    return this.currentCall;
  }

  // Event handlers
  private handleCallStart(): void {
  roomLogger.info('Call started');
    if (this.currentCall) {
      this.currentCall.status = 'active';
    }
    this.options?.onCallStart?.();
  }

  private handleCallEnd(): void {
  roomLogger.info('Call ended');
    if (this.currentCall) {
      this.currentCall.status = 'completed';
      this.currentCall.callEnded = true;
      const endTime = new Date();
      const startTime = new Date(this.currentCall.startTimeISO);
      this.currentCall.durationSeconds = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);
      this.currentCall.duration = this.currentCall.durationSeconds;
    }
    this.options?.onCallEnd?.();
    this.currentCall = null;
  }

  private handleCallStatusChange(status: string): void {
  roomLogger.debug('Call status changed:', status);
    if (this.currentCall) {
      this.currentCall.status = status as any;
    }
    this.options?.onCallStatusChange?.(status);
  }

  // Cleanup
  async dispose(): Promise<void> {
    try {
      if (this.mediaSFUInstance) {
        await this.leaveCall();
        this.mediaSFUInstance = null;
      }
      this.isInitialized = false;
      this.currentCall = null;
      this.options = null;
    } catch (error) {
      roomLogger.error('Error disposing MediaSFU service:', error);
    }
  }
}

export default MediaSFUService;
export const mediaSFUService = new MediaSFUService();
