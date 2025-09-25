import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVoipConfig, useCallManager, useCallHistory } from '../../hooks';
import { SIPConfig, CallStatus, CallDirection, CallType } from '../../types/call.types';
import { callService } from '../../services/callService';
import LoadingSpinner from '../Common/LoadingSpinner';
import MediaSFURoomDisplay from '../MediaSFU/MediaSFURoomDisplay';
import { callLogger, roomLogger } from '../../utils/logger';
import './MakeCallPage.css';

interface MakeCallPageProps {
  isApiConfigured: boolean;
}

type FlowStep = 'number_input' | 'voice_preference' | 'room_setup' | 'ready_to_call' | 'calling';

const MakeCallPage: React.FC<MakeCallPageProps> = ({ isApiConfigured }) => {
  const navigate = useNavigate();
  const callManager = useCallManager();
  const { config } = useVoipConfig();
  const { addCallToHistory } = useCallHistory();

  // Form state from CallsPage
  const [phoneNumber, setPhoneNumber] = useState('+'); // Start with + sign
  const [selectedFromNumber, setSelectedFromNumber] = useState<string>('');
  const [sipConfigs, setSipConfigs] = useState<SIPConfig[]>([]);
  const [sipLoading, setSipLoading] = useState(false);

  // MediaSFU Room State from CallsPage
  const [currentRoomName, setCurrentRoomName] = useState<string>('');
  const [currentParticipantName] = useState<string>('voipuser');
  const [isConnectedToRoom, setIsConnectedToRoom] = useState(false);
  const [isMicrophoneEnabled, setIsMicrophoneEnabled] = useState(false);
  const [showRoomDisplay, setShowRoomDisplay] = useState(false);

  // Dialpad State from CallsPage
  const [isDialpadCollapsed, setIsDialpadCollapsed] = useState(false);

  // Call Status from CallsPage
  const [isDialing, setIsDialing] = useState(false);
  const [callStatus, setCallStatus] = useState<'idle' | 'initiating' | 'ringing' | 'connected' | 'failed'>('idle');

  // Flow control
  const [currentStep, setCurrentStep] = useState<FlowStep>('number_input');

  // Functions from CallsPage
  const isEligibleForOutgoing = useCallback((config: SIPConfig) => {
    const isSipActive = config.supportSipActive !== false;
    const allowsOutgoing = config.allowOutgoing !== false;
    return isSipActive && allowsOutgoing;
  }, []);

  const isValidE164 = useCallback((phoneNumber: string): boolean => {
    const e164Regex = /^\+[1-9]\d{1,14}$/;
    return e164Regex.test(phoneNumber);
  }, []);

  const formatPhoneNumber = useCallback((value: string): string => {
    let cleaned = value.replace(/[^\d+]/g, '');
    
    if (!cleaned.startsWith('+')) {
      cleaned = '+' + cleaned.replace(/\+/g, '');
    } else {
      cleaned = '+' + cleaned.substring(1).replace(/\+/g, '');
    }
    
    return cleaned.substring(0, 16);
  }, []);

  const getEligibilityReason = useCallback((config: SIPConfig) => {
    const isSipActive = config.supportSipActive !== false;
    const allowsOutgoing = config.allowOutgoing !== false;
    
    if (!isSipActive && !allowsOutgoing) {
      return 'SIP inactive & outgoing disabled';
    } else if (!isSipActive) {
      return 'SIP inactive';
    } else if (!allowsOutgoing) {
      return 'Outgoing calls disabled';
    }
    return null;
  }, []);

  const fetchSipConfigs = useCallback(async () => {
    if (!config.api.key || !config.api.userName) return;

    setSipLoading(true);
    try {
      const url = new URL('https://mediasfu.com/v1/sipconfigs/');
      url.searchParams.append('action', 'get');
      url.searchParams.append('startIndex', '0');
      url.searchParams.append('pageSize', '20');

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.api.userName}:${config.api.key}`,
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.sipConfigs) {
          setSipConfigs(data.sipConfigs);
          if (data.sipConfigs.length > 0 && !selectedFromNumber) {
            const eligibleConfig = data.sipConfigs.find((config: SIPConfig) => 
              (config.supportSipActive !== false) && (config.allowOutgoing !== false)
            );
            if (eligibleConfig) {
              setSelectedFromNumber(eligibleConfig.contactNumber || eligibleConfig.phoneNumber || '');
            }
          }
        }
      }
    } catch (error) {
      callLogger.error('Failed to fetch SIP configs:', error);
    } finally {
      setSipLoading(false);
    }
  }, [config.api.key, config.api.userName, selectedFromNumber]);

  useEffect(() => {
    if (isApiConfigured) {
      fetchSipConfigs();
    }
  }, [isApiConfigured, fetchSipConfigs]);

  // Dialpad logic from CallsPage
  const dialpadButtons = [
    '1', '2', '3',
    '4', '5', '6',
    '7', '8', '9',
    '*', '0', '#',
    '+'
  ];

  const handleDialpadClick = (digit: string) => {
    const newValue = formatPhoneNumber(phoneNumber + digit);
    setPhoneNumber(newValue);
  };

  const handlePhoneNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formattedValue = formatPhoneNumber(e.target.value);
    setPhoneNumber(formattedValue);
  };

  const handleClearNumber = () => {
    setPhoneNumber('+');
  };

  const handleBackspace = () => {
    if (phoneNumber.length > 1) {
      setPhoneNumber(prev => prev.slice(0, -1));
    } else {
      setPhoneNumber('+');
    }
  };

  // Room connection logic from CallsPage
  const handleConnectToRoom = useCallback(async () => {
    if (!selectedFromNumber || !callManager) return;

    const selectedConfig = sipConfigs.find(config => 
      (config.contactNumber || config.phoneNumber) === selectedFromNumber
    );

    if (!selectedConfig) return;

    try {
      roomLogger.info('Connecting to MediaSFU room for outgoing call...');
      const roomName = `room_${selectedFromNumber.replace(/[^a-zA-Z0-9]/g, '')}_${Date.now()}`;
      setCurrentRoomName(roomName);
      setShowRoomDisplay(true);
    } catch (error) {
      callLogger.error('Error connecting to MediaSFU room:', error);
    }
  }, [selectedFromNumber, sipConfigs, callManager]);

  // Make call logic from CallsPage (simplified for flow)
  const handleStartCall = async () => {
    if (!phoneNumber || !callManager || !selectedFromNumber) return;

    if (!isValidE164(phoneNumber)) {
      callLogger.error('Invalid phone number format. Must be E.164 format (e.g., +15551234567)');
      return;
    }

    setIsDialing(true);
    setCallStatus('initiating');
    setCurrentStep('calling');

    try {
      // Get selected SIP config
      const selectedConfig = sipConfigs.find(config => 
        (config.contactNumber || config.phoneNumber) === selectedFromNumber
      );

      if (!selectedConfig) {
        throw new Error('Selected SIP configuration not found');
      }

      // Make the call using the enhanced callService
      const result = await callService.makeCallWithOptions(
        phoneNumber,
        selectedFromNumber,
        currentRoomName || '',
        undefined // autoAgent config - will be properly typed later
      );

      if (result.success) {
        callLogger.info('Call initiated successfully:', result);
        
        // Add to call history
        addCallToHistory({
          id: result.data?.id || Date.now().toString(),
          sipCallId: result.data?.sipCallId || Date.now().toString(),
          status: 'connecting' as CallStatus,
          direction: 'outgoing' as CallDirection,
          startTimeISO: new Date().toISOString(),
          durationSeconds: 0,
          roomName: result.data?.roomName || currentRoomName || '',
          callerIdRaw: selectedFromNumber,
          calledUri: phoneNumber,
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
          type: 'outbound' as CallType,
          from: selectedFromNumber,
          to: phoneNumber,
          startTime: new Date(),
          duration: 0
        });

        // Navigate back to calls page to monitor the call
        navigate('/calls');
      } else {
        throw new Error(result.error || 'Failed to initiate call');
      }
    } catch (error) {
      callLogger.error('Failed to make call:', error);
      setCallStatus('failed');
    } finally {
      setIsDialing(false);
    }
  };

  if (!isApiConfigured) {
    return (
      <div className="make-call-page">
        <div className="page-header">
          <button className="back-btn" onClick={() => navigate('/calls')}>
            ← Back to Calls
          </button>
          <h2>Make a Call</h2>
        </div>
        
        <div className="api-not-configured">
          <h3>⚙️ API Configuration Required</h3>
          <p>Please configure your API settings to make calls.</p>
          <button 
            className="btn btn-primary"
            onClick={() => navigate('/settings')}
          >
            Go to Settings
          </button>
        </div>
      </div>
    );
  }

  const selectedConfig = sipConfigs.find(config => 
    (config.contactNumber || config.phoneNumber) === selectedFromNumber
  );
  const isSelectedEligible = selectedConfig ? isEligibleForOutgoing(selectedConfig) : true;
  const isPhoneValid = phoneNumber && phoneNumber.length > 1 ? isValidE164(phoneNumber) : false;
  const hasPhoneNumber = phoneNumber && phoneNumber.length > 1;

  // Check room requirement
  const autoAgent = selectedConfig?.autoAgent;
  const autoAgentAvailable = autoAgent?.enabled && 
                            autoAgent.type && 
                            (autoAgent.type === 'AI' || autoAgent.type === 'IVR' || autoAgent.type === 'PLAYBACK');
  const needsRoom = !autoAgentAvailable && (!isConnectedToRoom || !currentRoomName);

  return (
    <div className="make-call-page">
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate('/calls')}>
          ← Back to Calls
        </button>
        <h2>Make a Call</h2>
      </div>

      <div className="call-flow-container">
        {/* Step 1: Number Input */}
        {currentStep === 'number_input' && (
          <div className="step-container">
            <div className="step-header">
              <h3>📞 Enter Phone Number</h3>
              <p>Enter the number you want to call</p>
            </div>

            <div className="phone-display">
              <input
                type="tel"
                className={`phone-input ${phoneNumber && phoneNumber.length > 1 && !isValidE164(phoneNumber) ? 'invalid' : ''}`}
                value={phoneNumber}
                onChange={handlePhoneNumberChange}
                placeholder="Enter phone number (+1234567890)"
              />
              {phoneNumber && phoneNumber.length > 1 && !isValidE164(phoneNumber) && (
                <div className="phone-validation-error">
                  ⚠️ Please enter a valid international format (+1234567890)
                </div>
              )}
              <div className="input-controls">
                <button 
                  className="btn btn-secondary"
                  onClick={handleBackspace}
                  disabled={phoneNumber.length <= 1}
                >
                  ⌫
                </button>
                <button 
                  className="btn btn-secondary"
                  onClick={handleClearNumber}
                  disabled={phoneNumber.length <= 1}
                >
                  Clear
                </button>
                <button 
                  className="btn btn-info dialpad-toggle"
                  onClick={() => setIsDialpadCollapsed(!isDialpadCollapsed)}
                  title={isDialpadCollapsed ? 'Show Dialpad' : 'Hide Dialpad'}
                >
                  {isDialpadCollapsed ? '🔢 Show' : '🔢 Hide'}
                </button>
              </div>
            </div>

            {!isDialpadCollapsed && (
              <div className="dialpad">
                {dialpadButtons.map((digit, index) => (
                  <button
                    key={digit}
                    className={`dialpad-btn ${digit === '+' ? 'dialpad-plus' : ''}`}
                    onClick={() => handleDialpadClick(digit)}
                    style={index === 12 ? { gridColumn: '2' } : {}}
                  >
                    {digit}
                  </button>
                ))}
              </div>
            )}

            <div className="step-actions">
              <button
                className="btn btn-primary"
                onClick={() => setCurrentStep('voice_preference')}
                disabled={!hasPhoneNumber || !isPhoneValid}
              >
                Next: Choose Calling Number →
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Voice Preference */}
        {currentStep === 'voice_preference' && (
          <div className="step-container">
            <div className="step-header">
              <h3>📱 Choose Your Number</h3>
              <p>Select which number to call from</p>
            </div>

            <div className="from-number-section">
              <label htmlFor="fromNumber">Call From:</label>
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
                    const phoneNumber = config.contactNumber || config.phoneNumber || 'Unknown';
                    const provider = config.provider || 'Unknown Provider';
                    const isEligible = isEligibleForOutgoing(config);
                    const eligibilityReason = getEligibilityReason(config);
                    
                    return (
                      <option
                        key={config.id || `config-${index}`}
                        value={phoneNumber}
                        disabled={!isEligible}
                      >
                        📞 {phoneNumber} ({provider}) {isEligible ? '✅' : `❌ ${eligibilityReason}`}
                      </option>
                    );
                  })}
                </select>
              ) : (
                <div className="no-numbers-message">
                  <p>No SIP configurations found. Set up your phone numbers in Advanced Configuration first.</p>
                </div>
              )}
            </div>

            {selectedFromNumber && (
              <div className={`eligibility-info ${isSelectedEligible ? 'eligible' : 'ineligible'}`}>
                {isSelectedEligible ? (
                  <div className="eligibility-message success">
                    ✅ <strong>Ready to make calls</strong>
                    <div className="eligibility-details">
                      This number is active and configured for outgoing calls
                    </div>
                  </div>
                ) : (
                  <div className="eligibility-message error">
                    ❌ <strong>Cannot make outgoing calls</strong>
                    <div className="eligibility-details">
                      Reason: {selectedConfig ? getEligibilityReason(selectedConfig) : 'Unknown'}
                    </div>
                    <div className="eligibility-help">
                      Please enable SIP support and outgoing calls in Advanced Configuration
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="step-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setCurrentStep('number_input')}
              >
                ← Back
              </button>
              <button
                className="btn btn-primary"
                onClick={() => setCurrentStep('room_setup')}
                disabled={!selectedFromNumber || !isSelectedEligible}
              >
                Next: Voice Setup →
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Room Setup */}
        {currentStep === 'room_setup' && (
          <div className="step-container">
            <div className="step-header">
              <h3>🎤 Voice Setup</h3>
              <p>Configure your audio for the call</p>
            </div>

            <div className="room-connection-section">
              <h4>MediaSFU Room Control 🎤 (Outgoing)</h4>
              {!showRoomDisplay ? (
                <button 
                  className="btn btn-primary"
                  onClick={handleConnectToRoom}
                  disabled={sipLoading}
                >
                  🎤 Connect to Voice Room
                </button>
              ) : (
                <div className="room-status">
                  <span className="status-indicator">
                    {isConnectedToRoom ? '🟢 Connected & Ready' : '🟡 Connecting...'}
                  </span>
                  <span className="mic-status">
                    {isMicrophoneEnabled ? '🎤 Mic On' : '🔇 Mic Off'}
                  </span>
                </div>
              )}
              <div className="room-info-text">
                {!showRoomDisplay ? (
                  <small>🎤 <strong>Connect to an active voice room before making an outbound/outgoing call</strong> if you plan to use your audio to talk with the caller/callee during the call.</small>
                ) : isConnectedToRoom ? (
                  <small>✅ <strong>Voice room active!</strong> Outgoing calls will use this existing room to save resources and provide seamless audio control.</small>
                ) : (
                  <small>🔄 <strong>Room connecting...</strong> Use the room controls below to manage your microphone settings before placing the call.</small>
                )}
              </div>
              {needsRoom && (
                <div className="room-requirement-warning">
                  <span className="warning-icon">⚠️</span>
                  <strong>Active room required:</strong> You must connect to a voice room before making calls without an AI agent enabled.
                </div>
              )}
            </div>

            {showRoomDisplay && currentRoomName && (
              <div className="room-display-container">
                <MediaSFURoomDisplay
                  roomName={currentRoomName}
                  participantName={currentParticipantName}
                  onConnectionChange={setIsConnectedToRoom}
                  onMicrophoneChange={setIsMicrophoneEnabled}
                  callId=""
                />
              </div>
            )}

            <div className="step-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setCurrentStep('voice_preference')}
              >
                ← Back
              </button>
              <button
                className="btn btn-primary"
                onClick={() => setCurrentStep('ready_to_call')}
                disabled={needsRoom}
              >
                Next: Review Call →
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Ready to Call */}
        {currentStep === 'ready_to_call' && (
          <div className="step-container">
            <div className="step-header">
              <h3>📋 Review Call</h3>
              <p>Confirm your call details</p>
            </div>

            <div className="call-summary">
              <div className="summary-item">
                <strong>Calling:</strong> {phoneNumber}
              </div>
              <div className="summary-item">
                <strong>From:</strong> {selectedFromNumber}
              </div>
              <div className="summary-item">
                <strong>Voice Room:</strong> {isConnectedToRoom ? '✅ Connected' : autoAgentAvailable ? '🤖 AI Agent' : '❌ Not Connected'}
              </div>
            </div>

            <div className="step-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setCurrentStep('room_setup')}
              >
                ← Back
              </button>
              <button
                className="btn btn-success call-btn"
                onClick={handleStartCall}
                disabled={isDialing}
              >
                {isDialing ? (
                  <>
                    <LoadingSpinner size="small" />
                    Calling...
                  </>
                ) : (
                  <>
                    📞 Start Call
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step 5: Calling */}
        {currentStep === 'calling' && (
          <div className="step-container">
            <div className="step-header">
              <h3>📞 Calling...</h3>
              <p>Your call is being placed</p>
            </div>

            <div className={`call-status-indicator status-${callStatus}`}>
              <div className="status-content">
                {callStatus === 'initiating' && (
                  <>🔄 <span>Initiating call...</span></>
                )}
                {callStatus === 'ringing' && (
                  <>📞 <span>Ringing... waiting for answer</span></>
                )}
                {callStatus === 'connected' && (
                  <>✅ <span>Call connected!</span></>
                )}
                {callStatus === 'failed' && (
                  <>❌ <span>Call failed or ended</span></>
                )}
              </div>
            </div>

            <div className="calling-info">
              <p>You will be redirected to the calls page to monitor your call.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MakeCallPage;
