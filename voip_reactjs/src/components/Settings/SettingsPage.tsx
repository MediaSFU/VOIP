import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye, faEyeSlash, faCopy } from '@fortawesome/free-solid-svg-icons';
import { useVoipConfig } from '../../hooks';
import ConfirmationModal from '../Common/ConfirmationModal';
import './SettingsPage.css';

const SettingsPage: React.FC = () => {
  const { 
    config, 
    updateApiConfig, 
    updateRealtimeConfig, 
    updateUIConfig, 
    resetConfig,
    toggleTheme,
    exportConfig,
    importConfig,
    isApiConfigured
  } = useVoipConfig();

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [configJson, setConfigJson] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  
  // Confirmation modal state
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [confirmationTitle, setConfirmationTitle] = useState('');
  const [confirmationMessage, setConfirmationMessage] = useState('');
  const [confirmationAction, setConfirmationAction] = useState<() => void>(() => {});

  // Form states
  const [apiSettings, setApiSettings] = useState({
    key: config.api.key,
    userName: config.api.userName,
    baseUrl: config.api.baseUrl
  });

  const [realtimeSettings, setRealtimeSettings] = useState({
    enabled: config.realtime.enabled,
    interval: config.realtime.interval / 1000 // Convert to seconds for UI
  });

  // Save API settings
  const handleSaveApiSettings = () => {
    updateApiConfig(apiSettings);
    setSaveMessage('API settings saved successfully!');
    setTimeout(() => setSaveMessage(''), 3000);
  };

  // Save realtime settings
  const handleSaveRealtimeSettings = () => {
    updateRealtimeConfig({
      enabled: realtimeSettings.enabled,
      interval: realtimeSettings.interval * 1000 // Convert back to milliseconds
    });
    setSaveMessage('Realtime settings saved successfully!');
    setTimeout(() => setSaveMessage(''), 3000);
  };

  // Test API connection
  const handleTestConnection = async () => {
    if (!apiSettings.key || !apiSettings.userName) {
      setTestResult({
        success: false,
        message: 'Please provide both API Key and Username'
      });
      return;
    }

    // Validate credentials format
    if (apiSettings.key.length !== 64) {
      setTestResult({
        success: false,
        message: 'Invalid API Key: Must be exactly 64 characters'
      });
      return;
    }

    if (!/^[a-zA-Z0-9]{6,}$/.test(apiSettings.userName)) {
      setTestResult({
        success: false,
        message: 'Invalid API Username: Must be alphanumeric and at least 6 characters'
      });
      return;
    }

    setTestResult({ success: true, message: 'Testing connection...' });
    
    try {
      // Test the connection by trying to fetch SIP configs
      const response = await fetch('https://mediasfu.com/v1/sipconfigs/?action=get&startIndex=0&pageSize=10', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiSettings.userName}:${apiSettings.key}`,
        }
      });

      if (response.ok) {
        await response.json(); // Parse response to ensure it's valid JSON
        setTestResult({
          success: true,
          message: 'Connection test successful! API credentials are valid.'
        });
      } else if (response.status === 401) {
        setTestResult({
          success: false,
          message: 'Authentication failed: Invalid API credentials'
        });
      } else if (response.status === 403) {
        setTestResult({
          success: false,
          message: 'Access denied: Check your API permissions'
        });
      } else {
        setTestResult({
          success: false,
          message: `Connection failed: HTTP ${response.status}`
        });
      }
    } catch (error) {
      setTestResult({
        success: false,
        message: 'Connection failed: Network error or invalid URL'
      });
    }
  };

  // Copy API key to clipboard
  const handleCopyApiKey = async () => {
    try {
      await navigator.clipboard.writeText(apiSettings.key);
      setSaveMessage('API Key copied to clipboard!');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (err) {
      setSaveMessage('Failed to copy API key');
      setTimeout(() => setSaveMessage(''), 3000);
    }
  };

  // Export configuration
  const handleExportConfig = () => {
    const configData = exportConfig();
    setConfigJson(configData);
    
    // Create download link
    const blob = new Blob([configData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'voip-config.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import configuration
  const handleImportConfig = () => {
    if (!configJson) return;
    
    const success = importConfig(configJson);
    if (success) {
      setSaveMessage('Configuration imported successfully!');
      // Refresh form states
      setApiSettings({
        key: config.api.key,
        userName: config.api.userName,
        baseUrl: config.api.baseUrl
      });
      setRealtimeSettings({
        enabled: config.realtime.enabled,
        interval: config.realtime.interval / 1000
      });
    } else {
      setSaveMessage('Failed to import configuration. Please check the JSON format.');
    }
    setTimeout(() => setSaveMessage(''), 3000);
  };

  // Reset to defaults
  const handleResetConfig = () => {
    setConfirmationTitle('Reset Settings');
    setConfirmationMessage('Are you sure you want to reset all settings to defaults?');
    setConfirmationAction(() => () => {
      resetConfig();
      setSaveMessage('Configuration reset to defaults!');
      setTimeout(() => setSaveMessage(''), 3000);
      setShowConfirmation(false);
    });
    setShowConfirmation(true);
  };

  return (
    <div className="settings-page">
      <div className="settings-header">
        <h1>Settings</h1>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={() => window.location.href = '/advanced'}>
            ⚙️ Advanced Config
          </button>
          <button className="btn btn-secondary" onClick={toggleTheme}>
            {config.ui.theme === 'light' ? '🌙' : '☀️'} Toggle Theme
          </button>
        </div>
      </div>

      {saveMessage && (
        <div className="save-message">
          ✅ {saveMessage}
        </div>
      )}

      <div className="settings-grid">
        {/* API Configuration */}
        <div className="settings-section card">
          <div className="section-header">
            <h2>API Configuration</h2>
            <div className="status-badge">
              {isApiConfigured() ? (
                <span className="status-success">✅ Configured</span>
              ) : (
                <span className="status-warning">⚠️ Not Configured</span>
              )}
            </div>
          </div>
          
          <div className="form-group">
            <label className="form-label">API Key *</label>
            <div className="input-with-actions">
              <input
                type={showApiKey ? "text" : "password"}
                className="form-input"
                value={apiSettings.key}
                onChange={(e) => setApiSettings({ ...apiSettings, key: e.target.value })}
                placeholder="Enter your API key"
              />
              <button
                type="button"
                className="input-action-btn"
                onClick={() => setShowApiKey(!showApiKey)}
                title={showApiKey ? "Hide API Key" : "Show API Key"}
              >
                <FontAwesomeIcon icon={showApiKey ? faEyeSlash : faEye} />
              </button>
              <button
                type="button"
                className="input-action-btn"
                onClick={handleCopyApiKey}
                title="Copy API Key"
                disabled={!apiSettings.key}
              >
                <FontAwesomeIcon icon={faCopy} />
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">API Username *</label>
            <input
              type="text"
              className="form-input"
              value={apiSettings.userName}
              onChange={(e) => setApiSettings({ ...apiSettings, userName: e.target.value })}
              placeholder="Enter your API username"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Base URL</label>
            <input
              type="url"
              className="form-input"
              value={apiSettings.baseUrl}
              onChange={(e) => setApiSettings({ ...apiSettings, baseUrl: e.target.value })}
              placeholder="https://mediasfu.com"
            />
          </div>

          <div className="special-note">
            <p><strong>Important:</strong> Unless you are using a registered domain with MediaSFU, use the <strong>sandbox key</strong>.</p>
          </div>

          <div className="form-actions">
            <button className="btn btn-primary" onClick={handleSaveApiSettings}>
              Save API Settings
            </button>
            <button className="btn btn-secondary" onClick={handleTestConnection}>
              Test Connection
            </button>
          </div>

          {testResult && (
            <div className={`test-result ${testResult.success ? 'success' : 'error'}`}>
              {testResult.message}
            </div>
          )}
        </div>

        {/* Real-time Updates */}
        <div className="settings-section card">
          <h2>Real-time Updates</h2>
          
          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={realtimeSettings.enabled}
                onChange={(e) => setRealtimeSettings({ ...realtimeSettings, enabled: e.target.checked })}
              />
              Enable live call updates
            </label>
          </div>

          <div className="form-group">
            <label className="form-label">Update Interval (seconds)</label>
            <input
              type="number"
              min="6"
              max="60"
              className="form-input"
              value={realtimeSettings.interval}
              onChange={(e) => setRealtimeSettings({ ...realtimeSettings, interval: Math.max(6, parseInt(e.target.value) || 6) })}
            />
            <small className="form-help">Minimum 6 seconds (API rate limit: 1 request per 5 seconds)</small>
          </div>

          <div className="form-actions">
            <button className="btn btn-primary" onClick={handleSaveRealtimeSettings}>
              Save Realtime Settings
            </button>
          </div>
        </div>

        {/* UI Settings */}
        <div className="settings-section card">
          <h2>User Interface</h2>
          
          <div className="form-group">
            <label className="form-label">Theme</label>
            <div className="theme-selector">
              <button 
                className={`theme-option ${config.ui.theme === 'light' ? 'active' : ''}`}
                onClick={() => config.ui.theme !== 'light' && toggleTheme()}
              >
                ☀️ Light
              </button>
              <button 
                className={`theme-option ${config.ui.theme === 'dark' ? 'active' : ''}`}
                onClick={() => config.ui.theme !== 'dark' && toggleTheme()}
              >
                🌙 Dark
              </button>
            </div>
            <div className="special-note" style={{ marginTop: '1rem' }}>
              <p><strong>Note:</strong> You may need to <strong>reload the page</strong> for theme changes to fully take effect across all components.</p>
            </div>
          </div>

          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={config.ui.compactMode}
                onChange={(e) => updateUIConfig({ compactMode: e.target.checked })}
              />
              Compact mode
            </label>
          </div>
        </div>

        {/* Advanced Settings */}
        <div className="settings-section card full-width">
          <div className="section-header">
            <h2>Advanced Settings</h2>
            <button 
              className="btn btn-secondary"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              {showAdvanced ? 'Hide' : 'Show'} Advanced
            </button>
          </div>

          {showAdvanced && (
            <div className="advanced-settings">
              <div className="form-group">
                <label className="form-label">Import/Export Configuration</label>
                <div className="config-actions">
                  <button className="btn btn-secondary" onClick={handleExportConfig}>
                    📤 Export Config
                  </button>
                  <button className="btn btn-secondary" onClick={handleImportConfig}>
                    📥 Import Config
                  </button>
                  <button className="btn btn-warning" onClick={handleResetConfig}>
                    🔄 Reset to Defaults
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Configuration JSON</label>
                <textarea
                  className="form-input config-textarea"
                  value={configJson}
                  onChange={(e) => setConfigJson(e.target.value)}
                  placeholder="Paste configuration JSON here to import..."
                  rows={10}
                />
              </div>

              <div className="current-config">
                <h3>Current Configuration</h3>
                <pre className="config-display">
                  {JSON.stringify(config, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmationModal
        isOpen={showConfirmation}
        onConfirm={confirmationAction}
        onCancel={() => setShowConfirmation(false)}
        title={confirmationTitle}
        message={confirmationMessage}
      />
    </div>
  );
};

export default SettingsPage;
