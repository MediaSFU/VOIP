import React, { useState, useCallback, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faPhone, 
  faRobot, 
  faCog, 
  faCheck, 
  faSpinner,
  faPlay,
  faInfoCircle,
  faExternalLinkAlt,
  faRefresh,
  faClock
} from '@fortawesome/free-solid-svg-icons';
import { useVoipConfig } from '../../hooks';
import { SIPConfig } from '../../types/call.types';
import './AdvancedConfigPage.css';

const AdvancedConfigPage: React.FC = () => {
  const { config } = useVoipConfig();
  const [loading, setLoading] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState<Record<string, boolean>>({});

  // SIP Configuration State (fetched from MediaSFU)
  const [sipConfigs, setSipConfigs] = useState<SIPConfig[]>([]);
  const [lastSipFetch, setLastSipFetch] = useState<Date | null>(null);
  const [canRefreshSip, setCanRefreshSip] = useState(true);

  // Events Settings State (fetched from MediaSFU)
  const [eventSettings, setEventSettings] = useState<{
    supportSIP: boolean;
    directionSIP: 'inbound' | 'outbound' | 'both';
  } | null>(null);

  // Meeting/Events Settings State (for form)
  const [supportSIP, setSupportSIP] = useState(false);
  const [formEventSettings, setFormEventSettings] = useState({
    eventType: 'conference',
    capacity: 10,
    duration: 60,
    recordOnly: false,
    directionSIP: 'both' as 'inbound' | 'outbound' | 'both'
  });

  // Rate limiting for event settings updates
  const [canUpdateEvents, setCanUpdateEvents] = useState(true);

  // Check if API credentials are configured
  const hasValidApiCredentials = config.api.key && 
    config.api.key.length === 64 && 
    config.api.userName && 
    /^[a-zA-Z0-9]{6,}$/.test(config.api.userName);

  const clearMessages = useCallback(() => {
    setErrors({});
    setSuccess({});
  }, []);

  const fetchSipConfigs = useCallback(async (isManual = false) => {
    // Validate API credentials before making request
    if (!config.api.key || config.api.key.length !== 64) {
      setErrors(prev => ({ ...prev, sip: 'Invalid API Key: Must be exactly 64 characters' }));
      return;
    }

    if (!config.api.userName || !/^[a-zA-Z0-9]{6,}$/.test(config.api.userName)) {
      setErrors(prev => ({ ...prev, sip: 'Invalid API Username: Must be alphanumeric and at least 6 characters' }));
      return;
    }

    if (isManual && !canRefreshSip) {
      setErrors(prev => ({ ...prev, sip: 'Please wait 5 minutes between manual refreshes' }));
      return;
    }

    setLoading('sipFetch');
    clearMessages();

    try {
      // Make HTTP request to MediaSFU API
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

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();

      
      if (data.sipConfigs) {
        setSipConfigs(data.sipConfigs);
        setLastSipFetch(new Date());
        
        if (isManual) {
          setCanRefreshSip(false);
          setSuccess(prev => ({ ...prev, sipFetch: true }));
          setTimeout(() => setSuccess(prev => ({ ...prev, sipFetch: false })), 3000);
        }
      } else {
        throw new Error(data.message || 'Failed to fetch SIP configurations');
      }
      
    } catch (error) {
      console.error('SIP fetch error:', error);
      setErrors(prev => ({ 
        ...prev, 
        sip: error instanceof Error ? error.message : 'Failed to fetch SIP configurations' 
      }));
    } finally {
      setLoading(null);
    }
  }, [config.api.key, config.api.userName, canRefreshSip, clearMessages]);

  // Fetch event settings from MediaSFU using proper GET request
  const fetchEventSettings = useCallback(async () => {
    // Validate API credentials before making request
    if (!config.api.key || config.api.key.length !== 64) {
      return;
    }

    if (!config.api.userName || !/^[a-zA-Z0-9]{6,}$/.test(config.api.userName)) {
      return;
    }

    try {
      const url = 'https://mediasfu.com/v1/eventssettings/';
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.api.userName}:${config.api.key}`,
        }
      });

      if (response.ok) {
        const data = await response.json();
        
        if (data && data.eventsSettings) {
          const settings = data.eventsSettings;
          setEventSettings({
            supportSIP: settings.supportSIP,
            directionSIP: settings.directionSIP || 'both'
          });
          setSupportSIP(settings.supportSIP);
          setFormEventSettings(prev => ({
            ...prev,
            eventType: settings.type || 'conference',
            directionSIP: settings.directionSIP || 'both'
          }));
        }
      } else {
        console.error('Failed to fetch event settings:', response.status);
      }
    } catch (error) {
      console.error('Error fetching event settings:', error);
    }
  }, [config.api.key, config.api.userName]);

  // Auto-fetch SIP configs and event settings on component mount and every hour
  useEffect(() => {
    fetchSipConfigs();
    fetchEventSettings();
    
    // Set up hourly auto-fetch
    const interval = setInterval(() => {
      fetchSipConfigs();
      fetchEventSettings();
    }, 60 * 60 * 1000); // 1 hour

    return () => clearInterval(interval);
  }, [fetchSipConfigs, fetchEventSettings]);

  // Manage manual refresh cooldown (5 minutes)
  useEffect(() => {
    if (!canRefreshSip) {
      const timeout = setTimeout(() => {
        setCanRefreshSip(true);
      }, 5 * 60 * 1000); // 5 minutes

      return () => clearTimeout(timeout);
    }
  }, [canRefreshSip]);

  // Manage event update cooldown (1 minute)
  useEffect(() => {
    if (!canUpdateEvents) {
      const timeout = setTimeout(() => {
        setCanUpdateEvents(true);
      }, 60 * 1000); // 1 minute

      return () => clearTimeout(timeout);
    }
  }, [canUpdateEvents]);

  // Only save (POST) event settings when user wants to enable SIP support
  const saveEventSettings = async () => {
    // Check rate limiting - once per minute
    if (!canUpdateEvents) {
      setErrors(prev => ({ ...prev, events: 'Please wait 1 minute between updates' }));
      return;
    }

    // Validate API credentials before making request
    if (!config.api.key || config.api.key.length !== 64) {
      setErrors(prev => ({ ...prev, events: 'Invalid API Key: Must be exactly 64 characters' }));
      return;
    }

    if (!config.api.userName || !/^[a-zA-Z0-9]{6,}$/.test(config.api.userName)) {
      setErrors(prev => ({ ...prev, events: 'Invalid API Username: Must be alphanumeric and at least 6 characters' }));
      return;
    }

    setLoading('events');
    clearMessages();

    try {
      const payload = {
        itemPageLimit: 2,
        mediaType: "video",
        addCoHost: false,
        targetOrientation: "landscape",
        targetOrientationHost: "landscape",
        targetResolution: "sd",
        targetResolutionHost: "sd",
        type: formEventSettings.eventType,
        audioSetting: "allow",
        videoSetting: "allow",
        screenshareSetting: "allow",
        chatSetting: "allow",
        safeRoom: false,
        safeRoomAction: "warn",
        autoStartSafeRoom: false,
        supportSIP: supportSIP,
        directionSIP: formEventSettings.directionSIP,
        action: "update"
      };

      // Make HTTP request to MediaSFU API
      const response = await fetch('https://mediasfu.com/v1/eventssettings/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.api.userName}:${config.api.key}`,
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();
      
      // Expect eventsSettings object in response instead of success flag
      if (data && data.eventsSettings) {
        const settings = data.eventsSettings;
        setEventSettings({
          supportSIP: settings.supportSIP,
          directionSIP: settings.directionSIP || 'both'
        });
        setSupportSIP(settings.supportSIP);
        setFormEventSettings(prev => ({
          ...prev,
          eventType: settings.type || 'conference',
          directionSIP: settings.directionSIP || 'both'
        }));
        
        setSuccess(prev => ({ ...prev, events: true }));
        setTimeout(() => setSuccess(prev => ({ ...prev, events: false })), 3000);
        
        // Set rate limiting
        setCanUpdateEvents(false);
      } else {
        throw new Error('No event settings returned in response');
      }
      
    } catch (error) {
      console.error('Event settings save error:', error);
      setErrors(prev => ({ 
        ...prev, 
        events: error instanceof Error ? error.message : 'Failed to save event settings' 
      }));
    } finally {
      setLoading(null);
    }
  };

  const formatLastFetch = (date: Date | null) => {
    if (!date) return 'Never';
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minutes ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hours ago`;
    return date.toLocaleDateString();
  };

  // If no valid API credentials, show configuration prompt
  if (!hasValidApiCredentials) {
    return (
      <div className="advanced-config-page">
        <div className="page-header">
          <h1>
            <FontAwesomeIcon icon={faCog} />
            Advanced Configuration
          </h1>
          <p>Configure essential components for your MediaSFU VOIP integration</p>
        </div>

        <div className="api-required-notice">
          <div className="notice-card">
            <div className="notice-header">
              <FontAwesomeIcon icon={faInfoCircle} className="notice-icon" />
              <h2>API Configuration Required</h2>
            </div>
            <div className="notice-content">
              <p>
                To access advanced configuration features, you must first configure your MediaSFU API credentials.
              </p>
              <ul>
                <li>API Key: Must be exactly 64 characters</li>
                <li>Username: Must be alphanumeric and at least 6 characters</li>
              </ul>
              <p>
                Please visit the Settings page to configure your API credentials before accessing advanced features.
              </p>
            </div>
            <div className="notice-actions">
              <a href="/settings" className="btn btn-primary">
                <FontAwesomeIcon icon={faCog} />
                Go to Settings
              </a>
              <a 
                href="https://mediasfu.com/dashboard" 
                target="_blank" 
                rel="noopener noreferrer"
                className="btn btn-secondary"
              >
                <FontAwesomeIcon icon={faExternalLinkAlt} />
                Get API Credentials
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="advanced-config-page">
      <div className="page-header">
        <h1>
          <FontAwesomeIcon icon={faCog} />
          Advanced Configuration
        </h1>
        <p>Configure essential components for your MediaSFU VOIP integration</p>
      </div>

      <div className="config-sections">
        {/* Section 1: Meeting/Events Settings */}
        <section className="config-section">
          <div className="section-header">
            <FontAwesomeIcon icon={faPhone} />
            <div>
              <h2>1. Meeting/Events Settings</h2>
              <p>Configure SIP support and event parameters for your meetings</p>
            </div>
          </div>

          <div className="section-content">
            {/* Current Status Display */}
            {eventSettings && (
              <div className="current-status">
                <h4>Current Settings:</h4>
                <div className="status-grid">
                  <div className="status-item">
                    <span className="status-label">SIP Support:</span>
                    <span className={`status-badge ${eventSettings.supportSIP ? 'enabled' : 'disabled'}`}>
                      {eventSettings.supportSIP ? '✅ Enabled' : '❌ Disabled'}
                    </span>
                  </div>
                  <div className="status-item">
                    <span className="status-label">Direction:</span>
                    <span className="status-badge">{eventSettings.directionSIP}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={supportSIP}
                  onChange={(e) => setSupportSIP(e.target.checked)}
                />
                <span className="checkmark"></span>
                Enable SIP Support
              </label>
              <div className="help-text">
                <FontAwesomeIcon icon={faInfoCircle} />
                This allows your events to accept SIP calls and enables phone integration
              </div>
            </div>

            {supportSIP && (
              <>
                <div className="form-group">
                  <label>SIP Direction</label>
                  <select
                    value={formEventSettings.directionSIP}
                    onChange={(e) => setFormEventSettings(prev => ({ ...prev, directionSIP: e.target.value as any }))}
                  >
                    <option value="inbound">Inbound Only</option>
                    <option value="outbound">Outbound Only</option>
                    <option value="both">Both Directions</option>
                  </select>
                </div>
              </>
            )}

            <div className="section-actions">
              <button
                className="btn btn-primary"
                onClick={saveEventSettings}
                disabled={loading === 'events' || !canUpdateEvents}
              >
                {loading === 'events' ? (
                  <FontAwesomeIcon icon={faSpinner} spin />
                ) : success.events ? (
                  <FontAwesomeIcon icon={faCheck} />
                ) : (
                  <FontAwesomeIcon icon={faPlay} />
                )}
                {loading === 'events' ? 'Saving...' : success.events ? 'Saved!' : 'Save Event Settings'}
              </button>
              {!canUpdateEvents && (
                <div className="cooldown-notice">
                  <FontAwesomeIcon icon={faInfoCircle} />
                  Updates limited to once per minute
                </div>
              )}
              {errors.events && <div className="error-message">{errors.events}</div>}
            </div>
          </div>
        </section>

        {/* Section 2: AI Credentials */}
        <section className="config-section">
          <div className="section-header">
            <FontAwesomeIcon icon={faRobot} />
            <div>
              <h2>2. AI Credentials (Optional)</h2>
              <p>Configure AI services on MediaSFU.com if you need AI-powered features</p>
            </div>
          </div>

          <div className="section-content">
            <div className="redirect-section">
              <div className="info-box">
                <h3>Configure AI Services on MediaSFU</h3>
                <p>
                  To enable AI-powered features for your calls and events, 
                  configure these services on your MediaSFU dashboard.
                </p>
                
                <div className="video-guides">
                  <h4>Video Guides:</h4>
                  <div className="video-grid">
                    <div className="video-item">
                      <h5>Part 5: AI Credentials Setup</h5>
                      <div className="video-container">
                        <iframe
                          width="100%"
                          height="200"
                          src="https://www.youtube.com/embed/UL2pbClybHc"
                          title="MediaSFU AI Credentials Setup"
                          frameBorder="0"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        ></iframe>
                      </div>
                      <a 
                        href="https://www.youtube.com/watch?v=UL2pbClybHc" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="video-external-link"
                      >
                        <FontAwesomeIcon icon={faExternalLinkAlt} />
                        Watch on YouTube
                      </a>
                    </div>
                    <div className="video-item">
                      <h5>Part 6: SIP Configuration</h5>
                      <div className="video-container">
                        <iframe
                          width="100%"
                          height="200"
                          src="https://www.youtube.com/embed/8pH7QB84PZo"
                          title="MediaSFU SIP Configuration"
                          frameBorder="0"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        ></iframe>
                      </div>
                      <a 
                        href="https://www.youtube.com/watch?v=8pH7QB84PZo" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="video-external-link"
                      >
                        <FontAwesomeIcon icon={faExternalLinkAlt} />
                        Watch on YouTube
                      </a>
                    </div>
                  </div>
                </div>

                <div className="action-buttons">
                  <a 
                    href="https://mediasfu.com/dashboard" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="btn btn-primary"
                  >
                    <FontAwesomeIcon icon={faExternalLinkAlt} />
                    Configure on MediaSFU Dashboard
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 3: SIP Configuration */}
        <section className="config-section">
          <div className="section-header">
            <FontAwesomeIcon icon={faPhone} />
            <div>
              <h2>3. SIP Configuration & Phone Numbers</h2>
              <p>Manage your SIP configurations and view available phone numbers</p>
            </div>
          </div>

          <div className="section-content">
            <div className="redirect-section">
              <div className="info-box">
                <h3>Manage SIP & Phone Numbers on MediaSFU</h3>
                <p>
                  Configure your SIP trunking and phone numbers on the MediaSFU dashboard. 
                  This includes setting up your contact numbers and SIP endpoints for call routing.
                </p>
                
                <div className="video-guides">
                  <h4>Video Guides:</h4>
                  <div className="video-grid">
                    <div className="video-item">
                      <h5>Part 6: SIP Configurations</h5>
                      <div className="video-container">
                        <iframe
                          width="100%"
                          height="200"
                          src="https://www.youtube.com/embed/8pH7QB84PZo"
                          title="MediaSFU SIP Configuration"
                          frameBorder="0"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        ></iframe>
                      </div>
                      <a 
                        href="https://www.youtube.com/watch?v=8pH7QB84PZo" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="video-external-link"
                      >
                        <FontAwesomeIcon icon={faExternalLinkAlt} />
                        Watch on YouTube
                      </a>
                    </div>
                    <div className="video-item">
                      <h5>Part 7: SIP Trunking Setup</h5>
                      <div className="video-container">
                        <iframe
                          width="100%"
                          height="200"
                          src="https://www.youtube.com/embed/OSvRkjahbv4"
                          title="MediaSFU SIP Trunking Setup"
                          frameBorder="0"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        ></iframe>
                      </div>
                      <a 
                        href="https://www.youtube.com/watch?v=OSvRkjahbv4" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="video-external-link"
                      >
                        <FontAwesomeIcon icon={faExternalLinkAlt} />
                        Watch on YouTube
                      </a>
                    </div>
                  </div>
                </div>

                <div className="action-buttons">
                  <a 
                    href="https://mediasfu.com/dashboard" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="btn btn-primary"
                  >
                    <FontAwesomeIcon icon={faExternalLinkAlt} />
                    Configure on MediaSFU Dashboard
                  </a>
                </div>
              </div>
            </div>

            {/* Current SIP Configs Display */}
            <div className="current-configs">
              <div className="configs-header">
                <h3>Your Current SIP Configurations</h3>
                <div className="fetch-info">
                  <span className="last-fetch">
                    <FontAwesomeIcon icon={faClock} />
                    Last updated: {formatLastFetch(lastSipFetch)}
                  </span>
                  <button
                    className="btn btn-secondary"
                    onClick={() => fetchSipConfigs(true)}
                    disabled={loading === 'sipFetch' || !canRefreshSip}
                  >
                    {loading === 'sipFetch' ? (
                      <FontAwesomeIcon icon={faSpinner} spin />
                    ) : (
                      <FontAwesomeIcon icon={faRefresh} />
                    )}
                    {loading === 'sipFetch' ? 'Fetching...' : 'Refresh'}
                  </button>
                </div>
              </div>

              {!canRefreshSip && (
                <div className="cooldown-notice">
                  <FontAwesomeIcon icon={faInfoCircle} />
                  Manual refresh available in 5 minutes. Auto-refresh occurs every hour.
                </div>
              )}

              {sipConfigs.length > 0 ? (
                <div className="sip-configs-list">
                  {sipConfigs.map((config, index) => (
                    <div key={config.id || `config-${index}`} className="sip-config-display">
                      <div className="config-header">
                        <div className="config-title">
                          <span className="config-name">
                            {config.name || config.provider || 'SIP Configuration'}
                          </span>
                          <span className="phone-number-prominent">
                            📞 {config.contactNumber || config.phoneNumber || 'No phone number'}
                          </span>
                        </div>
                        <span className={`config-status ${(config.enabled ?? config.supportSipActive) ? 'enabled' : 'disabled'}`}>
                          {(config.enabled ?? config.supportSipActive) ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      
                      <div className="config-details">
                        <div className="config-info-row">
                          <div className="provider-info">
                            <label>Provider:</label>
                            <span>{config.provider || 'Not specified'}</span>
                          </div>
                          {config.peer?.host && (
                            <div className="host-info">
                              <label>SIP Host:</label>
                              <span>{config.peer.host}:{config.peer.port || 5060}</span>
                            </div>
                          )}
                          {config.sipAddress && (
                            <div className="sip-address-info">
                              <label>SIP Address:</label>
                              <span>{config.sipAddress}</span>
                            </div>
                          )}
                        </div>
                        
                        <div className="config-features">
                          <div className="feature-flags">
                            {config.preferPCMA !== undefined && (
                              <span className={`feature-flag ${config.preferPCMA ? 'enabled' : 'disabled'}`}>
                                🎵 {config.preferPCMA ? 'PCMA' : 'PCMU'}
                              </span>
                            )}
                            {config.supportSipActive !== undefined && (
                              <span className={`feature-flag ${config.supportSipActive ? 'enabled' : 'disabled'}`}>
                                📞 {config.supportSipActive ? 'SIP Active' : 'SIP Inactive'}
                              </span>
                            )}
                            {config.sipOnly !== undefined && config.sipOnly && (
                              <span className="feature-flag enabled">
                                📱 SIP-Only
                              </span>
                            )}
                            {config.autoRecordSip !== undefined && config.autoRecordSip && (
                              <span className="feature-flag enabled">
                                🎙️ Auto-Record
                              </span>
                            )}
                          </div>
                          
                          <div className="direction-info">
                            {config.allowOutgoing !== undefined ? (
                              config.allowOutgoing ? (
                                <span className="direction-badge outgoing">
                                  📞 Outgoing Enabled
                                </span>
                              ) : (
                                <span className="direction-badge incoming">
                                  📞 Incoming Only
                                </span>
                              )
                            ) : (
                              <span className="direction-badge both">
                                📞 Both Directions
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Auto Agent Information - Removed Role */}
                        {config.autoAgent?.enabled && (
                          <div className="auto-agent-info">
                            <div className="agent-header">
                              <FontAwesomeIcon icon={faRobot} className="agent-icon" />
                              <span className="agent-title">Auto Agent Enabled</span>
                            </div>
                            <div className="agent-details">
                              <div className="agent-types">
                                <span className="agent-type incoming">
                                  Incoming: <strong>{config.autoAgent.type || 'AI'}</strong>
                                </span>
                                {config.autoAgent.outgoingType && (
                                  <span className="agent-type outgoing">
                                    Outgoing: <strong>{config.autoAgent.outgoingType}</strong>
                                  </span>
                                )}
                              </div>
                              {config.autoAgent.agentOnlyMode && (
                                <span className="feature-flag enabled small">
                                  🤖 Agent-Only Mode
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Priority display for legacy configs */}
                        {config.priority !== undefined && (
                          <div className="config-meta">
                            <span className="priority-badge">Priority: {config.priority}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="no-configs">
                  <FontAwesomeIcon icon={faInfoCircle} />
                  <p>No SIP configurations found. Set up your phone numbers on the MediaSFU dashboard first.</p>
                  <p className="help-note">
                    Once configured, your actual SIP endpoints and phone numbers will appear here.
                  </p>
                </div>
              )}

              {errors.sip && <div className="error-message">{errors.sip}</div>}
              {success.sipFetch && <div className="success-message">SIP configurations updated successfully!</div>}
            </div>
          </div>
        </section>
      </div>

      <div className="page-footer">
        <div className="help-section">
          <h3>Need Help?</h3>
          <p>
            For detailed setup guides and API documentation, visit the{' '}
            <a href="https://mediasfu.com/docs" target="_blank" rel="noopener noreferrer">
              MediaSFU Documentation
            </a>{' '}
            or watch the complete{' '}
            <a href="https://www.youtube.com/playlist?list=PLN1UgU_RfmkjCB10mKL_bKp64HKa2QHpF" target="_blank" rel="noopener noreferrer">
              9-Part Telephony Agent Series
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default AdvancedConfigPage;
