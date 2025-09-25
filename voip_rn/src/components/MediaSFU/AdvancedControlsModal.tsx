import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  Dimensions,
  Platform,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { Picker } from '@react-native-picker/picker';
import { callService } from '../../services/callService';
import { roomLogger } from '../../utils/logger';

const { width: screenWidth } = Dimensions.get('window');
const isTablet = screenWidth >= 768;
const isDesktop = screenWidth >= 1024;

interface AdvancedControlsProps {
  callId: string;
  participants: any[];
  sourceParameters?: Record<string, any>;
}

interface PlayAudioState {
  type: 'tts' | 'url';
  loop: boolean;
  immediately: boolean;
}

interface AudioDeviceState {
  selectedMicrophone: string;
  availableDevices: any[];
}

const AdvancedControlsModal: React.FC<AdvancedControlsProps> = React.memo(
  ({ callId, participants, sourceParameters = {} }) => {
    const [playAudioInput, setPlayAudioInput] = useState<PlayAudioState>({
      type: 'tts',
      loop: false,
      immediately: true,
    });
  const textInputRef = useRef<TextInput | null>(null);
  const currentInputValueRef = useRef<string>('');
    const [audioDevices, setAudioDevices] = useState<AudioDeviceState>({
      selectedMicrophone: '',
      availableDevices: [],
    });
    const [isLoading, setIsLoading] = useState(false);
    const [callSourceValue, setCallSourceValue] = useState('');
    const [isInitialized, setIsInitialized] = useState(false); // Track initialization to prevent layout shifts

    // Load available audio devices on component mount
    useEffect(() => {
      const loadAudioDevices = async () => {
        try {
          // Use MediaSFU's getMediaDevicesList method if available
          let devices: Array<{ deviceId: string; label: string; kind: string } | any> = [];

          if (sourceParameters?.getMediaDevicesList) {
            devices = await sourceParameters.getMediaDevicesList('audioinput');
            roomLogger.info('Loaded audio devices using MediaSFU method:', devices);
          } else {
            // Fallback to mock devices if MediaSFU method is not available
            roomLogger.warn('MediaSFU getMediaDevicesList not available, using mock devices');
            devices = [
              { deviceId: 'default', label: 'Default Microphone', kind: 'audioinput' },
              { deviceId: 'built-in', label: 'Built-in Microphone', kind: 'audioinput' },
              { deviceId: 'bluetooth', label: 'Bluetooth Microphone', kind: 'audioinput' },
              { deviceId: 'wired', label: 'Wired Headset', kind: 'audioinput' },
            ];
          }

          setAudioDevices((prev) => ({
            ...prev,
            availableDevices: devices,
          }));
        } catch (error) {
          roomLogger.error('Failed to load audio devices:', error);
          // Fallback to mock devices on error
          const mockDevices = [
            { deviceId: 'default', label: 'Default Microphone', kind: 'audioinput' },
            { deviceId: 'built-in', label: 'Built-in Microphone', kind: 'audioinput' },
          ];
          setAudioDevices((prev) => ({
            ...prev,
            availableDevices: mockDevices,
          }));
        } finally {
          // Mark as initialized to prevent layout shifts
          setIsInitialized(true);
        }
      };

      loadAudioDevices();
    }, [sourceParameters]);

    // Intelligent agent detection function
    const hasAgentInRoom = useCallback((): boolean => {
      if (!participants || participants.length === 0) {
        return false;
      }

      return participants.some((participant: any) => {
        const name = (participant.name || '').toLowerCase();
        const id = (participant.id || '').toLowerCase();

        const agentKeywords = [
          'agent',
          'ai',
          'bot',
          'assistant',
          'mediasfu',
          'voice',
          'system',
        ];

        return agentKeywords.some(
          (keyword) => name.includes(keyword) || id.includes(keyword)
        );
      });
    }, [participants]);

    // Memoize filtered participants to prevent re-renders
    const humanParticipants = useMemo(() => {
      return participants.filter((p: any) => {
        const id = (p.id || p.audioID || p.videoID || '').toLowerCase();
        const isSystemId = id.startsWith('sip_') || id.startsWith('sip-');
        const name = (p.name || '').toLowerCase();
        const agentKeywords = [
          'agent',
          'ai',
          'bot',
          'assistant',
          'mediasfu',
          'voice',
          'system',
        ];
        const isAgent = agentKeywords.some(
          (keyword) => name.includes(keyword) || id.includes(keyword)
        );

        return !isSystemId && !isAgent;
      });
    }, [participants]);

    const { type, loop, immediately } = playAudioInput;
    const handlePlayAudio = useCallback(async () => {
      const currentValue = currentInputValueRef.current.trim();
      if (!currentValue) {return;}

      setIsLoading(true);
      try {
        const result = await callService.playAudio(
          callId,
          type,
          currentValue,
          loop,
          immediately
        );

        if (result.success) {
          roomLogger.info('Successfully played audio', {
            callId,
            input: { type, loop, immediately, value: currentValue },
          });
          // Clear input without remounting to preserve focus behavior
          textInputRef.current?.clear();
          currentInputValueRef.current = '';
          Alert.alert('Success', 'Audio playback started successfully');
        } else {
          roomLogger.error('Failed to play audio', {
            callId,
            error: result.error,
            input: { type, loop, immediately, value: currentValue },
          });
          Alert.alert('Error', result.error || 'Failed to play audio');
        }
      } catch (error) {
        roomLogger.error('Error playing audio:', {
          error,
          callId,
          input: { type, loop, immediately, value: currentValue },
        });
        Alert.alert('Error', 'Error playing audio');
      } finally {
        setIsLoading(false);
      }
  }, [callId, type, loop, immediately]);

    const handleSwitchToHuman = useCallback(async () => {
      setIsLoading(true);
      try {
        const result = await callService.switchSource(callId, 'human');

        if (result.success) {
          roomLogger.info('Successfully switched to human', { callId });
          Alert.alert('Success', 'Call control switched to human successfully');
        } else {
          roomLogger.error('Failed to switch to human', {
            callId,
            error: result.error,
          });
          Alert.alert('Error', result.error || 'Failed to switch to human');
        }
      } catch (error) {
        roomLogger.error('Error switching to human:', { error, callId });
        Alert.alert('Error', 'Error switching to human');
      } finally {
        setIsLoading(false);
      }
    }, [callId]);

    const handleSwitchToAgent = useCallback(async () => {
      setIsLoading(true);
      try {
        const result = await callService.switchSource(callId, 'agent');

        if (result.success) {
          roomLogger.info('Successfully switched to agent', { callId });
          Alert.alert('Success', 'Call control switched to agent successfully');
        } else {
          roomLogger.error('Failed to switch to agent', {
            callId,
            error: result.error,
          });
          Alert.alert('Error', result.error || 'Failed to switch to agent');
        }
      } catch (error) {
        roomLogger.error('Error switching to agent:', { error, callId });
        Alert.alert('Error', 'Error switching to agent');
      } finally {
        setIsLoading(false);
      }
    }, [callId]);

    const handleStartAgent = useCallback(async () => {
      setIsLoading(true);
      try {
        const result = await callService.startAgent(callId);

        if (result.success) {
          roomLogger.info('Successfully started agent', { callId });
          Alert.alert('Success', 'Agent started successfully');
        } else {
          roomLogger.error('Failed to start agent', {
            callId,
            error: result.error,
          });
          Alert.alert('Error', result.error || 'Failed to start agent');
        }
      } catch (error) {
        roomLogger.error('Error starting agent:', { error, callId });
        Alert.alert('Error', 'Error starting agent');
      } finally {
        setIsLoading(false);
      }
    }, [callId]);

    const handleStopAgent = useCallback(async () => {
      setIsLoading(true);
      try {
        const result = await callService.stopAgent(callId);

        if (result.success) {
          roomLogger.info('Successfully stopped agent', { callId });
          Alert.alert('Success', 'Agent stopped successfully');
        } else {
          roomLogger.error('Failed to stop agent', {
            callId,
            error: result.error,
          });
          Alert.alert('Error', result.error || 'Failed to stop agent');
        }
      } catch (error) {
        roomLogger.error('Error stopping agent:', { error, callId });
        Alert.alert('Error', 'Error stopping agent');
      } finally {
        setIsLoading(false);
      }
    }, [callId]);

    const handleMicrophoneChange = useCallback(
      async (deviceId: string) => {
        setAudioDevices((prev) => ({ ...prev, selectedMicrophone: deviceId }));
        roomLogger.info('Microphone changed', { callId, deviceId });
        // In React Native, actual device switching would require platform-specific code
        Alert.alert('Info', 'Microphone selection updated');
      },
      [callId]
    );

    // Control card component for consistent styling
    const ControlCard = ({
      icon,
      title,
      children,
    }: {
      icon: string;
      title: string;
      children: React.ReactNode;
    }) => (
      <View style={styles.controlCard}>
        <View style={styles.controlCardHeader}>
          <Ionicons name={icon as any} size={20} color="#ffffff" style={styles.controlIcon} />
          <Text style={styles.controlCardTitle}>{title}</Text>
        </View>
        <View style={styles.controlCardContent}>
          {children}
        </View>
      </View>
    );

    // Input group component
    const InputGroup = ({
      label,
      children,
    }: {
      label: string;
      children: React.ReactNode;
    }) => (
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>{label}</Text>
        {children}
      </View>
    );

    // Checkbox component
    const CheckboxGroup = ({
      label,
      value,
      onValueChange,
    }: {
      label: string;
      value: boolean;
      onValueChange: (value: boolean) => void;
    }) => (
      <TouchableOpacity
        style={styles.checkboxContainer}
        onPress={() => onValueChange(!value)}
        disabled={isLoading}
      >
        <Ionicons
          name={value ? 'checkbox' : 'square-outline'}
          size={20}
          color="#007bff"
        />
        <Text style={styles.checkboxLabel}>{label}</Text>
      </TouchableOpacity>
    );

    // Action button component
    const ActionButton = ({
      title,
      onPress,
      variant = 'primary',
      disabled = false,
    }: {
      title: string;
      onPress: () => void;
      variant?: 'primary' | 'success' | 'warning' | 'info';
      disabled?: boolean;
    }) => (
      <TouchableOpacity
        style={[
          styles.actionButton,
          styles[`${variant}Button`],
          disabled && styles.disabledButton,
        ]}
        onPress={onPress}
        disabled={disabled || isLoading}
      >
        <Text style={[
          styles.actionButtonText,
          styles[`${variant}ButtonText`],
          disabled && styles.disabledButtonText,
        ]}>
          {title}
        </Text>
      </TouchableOpacity>
    );

    // Content component that displays all controls with responsive layout
    const AdvancedControlsContent = useMemo(() => {
      // Control cards array for easy management
      const controlCards = [
        {
          id: 'call-source',
          content: (
            <ControlCard icon="call" title="Call Source Control">
              <InputGroup label="Call Source Control">
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={callSourceValue}
                    onValueChange={(value) => {
                      setCallSourceValue(value);
                      if (value === 'agent') {
                        handleSwitchToAgent();
                      } else if (value.startsWith('human-')) {
                        handleSwitchToHuman();
                      }
                    }}
                    style={styles.picker}
                    enabled={!isLoading}
                    mode="dropdown" // Use dropdown mode for better interaction
                    dropdownIconColor="#667eea" // Match theme color
                  >
                    <Picker.Item label="Choose who controls the call" value="" />
                    <Picker.Item label="Switch to Agent" value="agent" />
                    {humanParticipants.map((participant: any) => (
                      <Picker.Item
                        key={participant.id}
                        label={participant.name || `Participant ${(participant.id || '').slice(0, 8)}`}
                        value={`human-${participant.id}`}
                      />
                    ))}
                  </Picker>
                </View>
              </InputGroup>
              <Text style={styles.controlDescription}>
                Switch control between agent and human participants. Only human participants are shown.
              </Text>
            </ControlCard>
          ),
        },
        {
          id: 'audio-playback',
          content: (
            <ControlCard icon="volume-high" title="Audio Playback">
              <InputGroup label="Audio Source">
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={playAudioInput.type}
                    onValueChange={(value) =>
                      setPlayAudioInput(prev => ({
                        ...prev,
                        type: value as 'url' | 'tts',
                      }))
                    }
                    style={styles.picker}
                    enabled={!isLoading}
                    mode="dropdown" // Use dropdown mode for better interaction
                    dropdownIconColor="#667eea" // Match theme color
                  >
                    <Picker.Item label="Text-to-Speech" value="tts" />
                    <Picker.Item label="Audio URL" value="url" />
                  </Picker>
                </View>
              </InputGroup>

              <InputGroup
                label={playAudioInput.type === 'tts' ? 'Text to Speak' : 'Audio URL'}
              >
                <TextInput
                  style={styles.textInput}
                  ref={textInputRef}
                  defaultValue={''}
                  onChangeText={(text) => {
                    currentInputValueRef.current = text;
                  }}
                  placeholder={
                    playAudioInput.type === 'tts'
                      ? 'Enter text to speak...'
                      : 'Enter audio URL...'
                  }
                  multiline={playAudioInput.type === 'tts'}
                  numberOfLines={playAudioInput.type === 'tts' ? 3 : 1}
                  editable={!isLoading}
                  returnKeyType={playAudioInput.type === 'tts' ? 'default' : 'done'}
                  blurOnSubmit={false} // Keep focus for better typing experience
                  keyboardType="default"
                  autoCorrect={playAudioInput.type === 'tts'}
                  autoCapitalize={playAudioInput.type === 'tts' ? 'sentences' : 'none'}
                  enablesReturnKeyAutomatically={false}
                  scrollEnabled={playAudioInput.type === 'tts'}
                  textBreakStrategy="simple" // Improve text wrapping performance
                  selectionColor="#667eea" // Match theme color for text selection
                  underlineColorAndroid="transparent" // Remove Android underline
                  contextMenuHidden={false} // Allow copy/paste
                  selectTextOnFocus={false} // Don't select all text on focus
                />
              </InputGroup>

              <View style={styles.checkboxGroup}>
                <CheckboxGroup
                  label="Loop Audio"
                  value={playAudioInput.loop}
                  onValueChange={(value) =>
                    setPlayAudioInput(prev => ({
                      ...prev,
                      loop: value,
                    }))
                  }
                />
                <CheckboxGroup
                  label="Play Immediately"
                  value={playAudioInput.immediately}
                  onValueChange={(value) =>
                    setPlayAudioInput(prev => ({
                      ...prev,
                      immediately: value,
                    }))
                  }
                />
              </View>

              <ActionButton
                title={isLoading ? 'Playing...' : 'Play Audio'}
                onPress={handlePlayAudio}
                variant="success"
                disabled={isLoading}
              />
            </ControlCard>
          ),
        },
        {
          id: 'audio-device',
          content: (
            <ControlCard icon="headset" title="Audio Device Settings">
              <InputGroup label="Microphone">
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={audioDevices.selectedMicrophone}
                    onValueChange={handleMicrophoneChange}
                    style={styles.picker}
                    enabled={!isLoading}
                    mode="dropdown" // Use dropdown mode for better interaction
                    dropdownIconColor="#667eea" // Match theme color
                  >
                    <Picker.Item label="Select Microphone" value="" />
                    {audioDevices.availableDevices
                      .filter((device) => device.kind === 'audioinput')
                      .map((device) => (
                        <Picker.Item
                          key={device.deviceId}
                          label={device.label || `Microphone ${device.deviceId.slice(0, 8)}`}
                          value={device.deviceId}
                        />
                      ))}
                  </Picker>
                </View>
              </InputGroup>

              <Text style={styles.controlDescription}>
                Select your preferred microphone device for the call.
              </Text>
            </ControlCard>
          ),
        },
        {
          id: 'agent-management',
          content: (
            <ControlCard icon="logo-android" title="Agent Management">
              <Text style={styles.controlDescription}>
                Start or stop the AI agent for automated call handling.
              </Text>

              {hasAgentInRoom() ? (
                <View style={styles.agentActions}>
                  <ActionButton
                    title={isLoading ? 'Starting...' : 'Start Agent'}
                    onPress={handleStartAgent}
                    variant="success"
                    disabled={isLoading}
                  />

                  <ActionButton
                    title={isLoading ? 'Stopping...' : 'Stop Agent'}
                    onPress={handleStopAgent}
                    variant="warning"
                    disabled={isLoading}
                  />

                  <View style={styles.agentStatus}>
                    <View style={styles.statusIndicator}>
                      <View style={styles.statusDot} />
                      <Text style={styles.statusText}>Agent is active</Text>
                    </View>
                  </View>
                </View>
              ) : (
                <View style={styles.noAgentMessage}>
                  <Text style={styles.noAgentText}>
                    No agent in room. Agent controls are only available when an agent is present.
                  </Text>
                </View>
              )}
            </ControlCard>
          ),
        },
      ];

      // Render cards in responsive grid layout
      const renderCards = () => {
        if (isDesktop) {
          // Desktop: 2 cards per row
          const rows = [];
          for (let i = 0; i < controlCards.length; i += 2) {
            rows.push(
              <View key={`row-${i}`} style={styles.cardRow}>
                <View style={styles.cardColumnHalf}>
                  {controlCards[i].content}
                </View>
                {controlCards[i + 1] && (
                  <View style={styles.cardColumnHalf}>
                    {controlCards[i + 1].content}
                  </View>
                )}
              </View>
            );
          }
          return rows;
        } else if (isTablet) {
          // Tablet: 2 cards per row for most, but audio playback can be full width
          const rows = [];
          for (let i = 0; i < controlCards.length; i++) {
            const card = controlCards[i];
            if (card.id === 'audio-playback') {
              // Audio playback gets full width on tablet due to complex controls
              rows.push(
                <View key={`single-${i}`} style={styles.cardRowSingle}>
                  {card.content}
                </View>
              );
            } else {
              // Try to pair with next card
              const nextCard = controlCards[i + 1];
              if (nextCard && nextCard.id !== 'audio-playback') {
                rows.push(
                  <View key={`row-${i}`} style={styles.cardRow}>
                    <View style={styles.cardColumnHalf}>
                      {card.content}
                    </View>
                    <View style={styles.cardColumnHalf}>
                      {nextCard.content}
                    </View>
                  </View>
                );
                i++; // Skip next card since we included it
              } else {
                rows.push(
                  <View key={`single-${i}`} style={styles.cardRowSingle}>
                    {card.content}
                  </View>
                );
              }
            }
          }
          return rows;
        } else {
          // Mobile: single column
          return controlCards.map((card, index) => (
            <View key={`mobile-${index}`} style={styles.cardRowSingle}>
              {card.content}
            </View>
          ));
        }
      };

      return (
        <ScrollView
          style={styles.controlsContainer}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.controlsContent}
          keyboardShouldPersistTaps="handled" // Allow picker interactions
          nestedScrollEnabled={true} // Enable nested scroll for pickers
          scrollEventThrottle={16} // Smooth scrolling
          automaticallyAdjustContentInsets={false} // Prevent content inset adjustments
          contentInsetAdjustmentBehavior="never" // iOS: prevent content adjustment
          bounces={true} // Allow bouncing but controlled
          overScrollMode="auto" // Android: controlled over-scroll
          removeClippedSubviews={false} // Keep all subviews for better interaction
        >
          {renderCards()}
        </ScrollView>
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      isLoading,
      callSourceValue,
      humanParticipants,
      playAudioInput,
      audioDevices,
      hasAgentInRoom,
      handleSwitchToAgent,
      handleSwitchToHuman,
      handlePlayAudio,
      handleStartAgent,
      handleStopAgent,
      handleMicrophoneChange,
      // isInitialized is intentionally excluded to prevent re-renders while typing
    ]);

    // Always render as inline component with initialization check
    return (
      <View style={styles.advancedControlsInline}>
        {!isInitialized ? (
          // Show placeholder content during initialization to prevent layout shifts
          <View style={styles.initializingContainer}>
            <Text style={styles.initializingText}>Loading advanced controls...</Text>
          </View>
        ) : (
          AdvancedControlsContent
        )}
      </View>
    );
  }
);

const styles = StyleSheet.create({
  advancedControlsInline: {
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#e1e5e9',
    padding: isTablet ? 20 : (screenWidth < 400 ? 8 : 16), // Reduced padding for small mobile screens
    width: '100%',
    backgroundColor: '#ffffff',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  controlsContainer: {
    flex: 1,
  },
  controlsContent: {
    gap: isTablet ? 16 : 12, // Reduced gap between control cards
    paddingBottom: isTablet ? 16 : 12, // Reduced bottom padding
  },
  // Responsive grid layout styles
  cardRow: {
    flexDirection: 'row',
    gap: isTablet ? 16 : 12,
    marginBottom: isTablet ? 16 : 12,
  },
  cardRowSingle: {
    marginBottom: isTablet ? 16 : 12,
  },
  cardColumnHalf: {
    flex: 1,
  },
  // Initialization loading styles
  initializingContainer: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 100,
  },
  initializingText: {
    fontSize: isTablet ? 16 : 14,
    color: '#666666',
    fontWeight: '500',
  },
  controlCard: {
    borderWidth: 2,
    borderColor: '#d1d5db',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  controlCardHeader: {
    backgroundColor: '#667eea',
    padding: isTablet ? 18 : (screenWidth < 400 ? 12 : 16), // Reduced padding for small mobile screens
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  controlIcon: {
    fontSize: isTablet ? 20 : 18,
  },
  controlCardTitle: {
    fontSize: isTablet ? 18 : 16,
    fontWeight: '600',
    color: '#ffffff',
    flex: 1,
  },
  controlCardContent: {
    padding: isTablet ? 20 : (screenWidth < 400 ? 12 : 16), // Reduced padding for small mobile screens
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: isTablet ? 16 : 14,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 6,
  },
  pickerContainer: {
    borderWidth: 2,
    borderColor: '#d1d5db',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
    elevation: 2, // Add elevation for Android to improve touch handling
    zIndex: 1, // Ensure picker is above other elements
  },
  picker: {
    height: isTablet ? 50 : 45,
    width: '100%',
    color: '#000000',
    backgroundColor: '#ffffff', // Explicit background for better rendering
  },
  textInput: {
    borderWidth: 2,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: isTablet ? 14 : 12,
    fontSize: isTablet ? 16 : 14,
    backgroundColor: '#ffffff',
    color: '#000000',
    textAlignVertical: 'top',
    minHeight: isTablet ? 80 : 70, // Fixed minimum height to prevent layout shifts
    maxHeight: isTablet ? 120 : 100, // Maximum height to prevent excessive expansion
  },
  checkboxGroup: {
    gap: 8,
    marginBottom: 16,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  checkboxLabel: {
    fontSize: isTablet ? 16 : 14,
    fontWeight: '500',
    color: '#000000',
    flex: 1,
  },
  actionButton: {
    paddingVertical: isTablet ? 16 : 14,
    paddingHorizontal: isTablet ? 20 : 16,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  actionButtonText: {
    fontSize: isTablet ? 16 : 14,
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: '#667eea',
  },
  primaryButtonText: {
    color: '#ffffff',
  },
  successButton: {
    backgroundColor: '#28a745',
  },
  successButtonText: {
    color: '#ffffff',
  },
  warningButton: {
    backgroundColor: '#ffc107',
  },
  warningButtonText: {
    color: '#212529',
  },
  infoButton: {
    backgroundColor: '#17a2b8',
  },
  infoButtonText: {
    color: '#ffffff',
  },
  disabledButton: {
    backgroundColor: '#e9ecef',
  },
  disabledButtonText: {
    color: '#6c757d',
  },
  controlDescription: {
    fontSize: isTablet ? 14 : 12,
    lineHeight: isTablet ? 20 : 18,
    color: '#666666',
    marginTop: 8,
    marginBottom: 12,
  },
  agentActions: {
    gap: 8,
  },
  agentStatus: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#d4edda',
    borderWidth: 1,
    borderColor: '#c3e6cb',
    borderRadius: 6,
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#155724',
  },
  statusText: {
    fontSize: isTablet ? 14 : 12,
    fontWeight: '500',
    color: '#155724',
  },
  noAgentMessage: {
    padding: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dee2e6',
  },
  noAgentText: {
    fontSize: isTablet ? 14 : 12,
    color: '#6c757d',
    textAlign: 'center',
    lineHeight: isTablet ? 20 : 18,
  },
});

export default AdvancedControlsModal;
AdvancedControlsModal.displayName = 'AdvancedControlsModal';
