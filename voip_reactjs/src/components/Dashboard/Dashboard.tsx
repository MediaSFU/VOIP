import React, { useEffect } from 'react';
import { useVoipConfig, useCallManager, useCallHistory } from '../../hooks';
import LoadingSpinner from '../Common/LoadingSpinner';
import './Dashboard.css';

interface DashboardProps {
  onNavigate: (page: string) => void;
  isApiConfigured: boolean;
}

const Dashboard: React.FC<DashboardProps> = ({ onNavigate, isApiConfigured }) => {
  const { config, updateRealtimeConfig } = useVoipConfig();
  const { getCallHistoryStats } = useCallHistory();
  
  // Only initialize call manager if API is configured
  const callManager = useCallManager();
  
  // Get call history statistics
  const callStats = getCallHistoryStats();
  
  // TODO: Re-implement real-time updates with MediaSFU
  // const liveUpdates = useRealTimeCallUpdates(
  //   callManager.fetchActiveCalls,
  //   config.realtime.enabled,
  //   config.realtime.interval
  // );  
  
  // TODO: Fetch initial data from MediaSFU
  useEffect(() => {
    if (callManager && isApiConfigured) {
      // callManager.fetchActiveCalls();
      // callManager.fetchCallStats();
    }
  }, [callManager, isApiConfigured]);

  if (!isApiConfigured) {
    return (
      <div className="dashboard">
        <div className="welcome-section">
          <div className="welcome-card card">
            <h1>Welcome to VOIP Application</h1>
            <p>Get started by configuring your API credentials to begin making and receiving calls.</p>
            
            <div className="welcome-features">
              <h3>Key Features:</h3>
              <ul>
                <li>✅ HD Voice Calls with MediaSFU integration</li>
                <li>✅ Real-time call monitoring and analytics</li>
                <li>✅ Call recording and history tracking</li>
                <li>✅ Advanced call management features</li>
                <li>✅ HTTP-only API communication</li>
                <li>✅ No backend dependency required</li>
              </ul>
            </div>

            <div className="welcome-actions">
              <button 
                className="btn btn-primary"
                onClick={() => onNavigate('settings')}
              >
                Configure API Settings
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (callManager?.isLoading) {
    return <LoadingSpinner message="Loading dashboard data..." />;
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Dashboard</h1>
        <div className="dashboard-controls">
          <div className="live-updates-control">
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={config.realtime.enabled}
                onChange={() => updateRealtimeConfig({ enabled: !config.realtime.enabled })}
              />
              <span className="toggle-slider"></span>
            </label>
            <span className="toggle-label">Live Updates</span>
            {/* TODO: Re-implement live updates indicator
            {liveUpdates?.isRunning && (
              <span className="update-indicator">
                ● Last update: {liveUpdates.lastUpdate?.toLocaleTimeString()}
              </span>
            )}
            */}
          </div>
        </div>
      </div>

      {callManager?.error && (
        <div className="error-banner">
          <p>⚠️ {callManager.error}</p>
        </div>
      )}

      <div className="dashboard-grid">
        {/* Call Statistics */}
        <div className="stats-section card">
          <h2>Call Statistics</h2>
          <div className="stats-grid">
            <div className="stat-item">
              <div className="stat-value">{callManager?.calls.filter((c: any) => c.status === 'active').length || 0}</div>
              <div className="stat-label">Active Calls</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{callStats.todaysCalls}</div>
              <div className="stat-label">Today's Calls</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">
                {callStats.averageDuration > 0 
                  ? `${Math.floor(callStats.averageDuration / 60)}:${(callStats.averageDuration % 60).toString().padStart(2, '0')}`
                  : '0:00'
                }
              </div>
              <div className="stat-label">Avg Duration</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{callStats.connectionRate}%</div>
              <div className="stat-label">Connection Rate</div>
            </div>
          </div>
          
          {/* Additional Statistics */}
          <div className="detailed-stats">
            <div className="stats-row">
              <h3>Call Overview</h3>
              <div className="overview-stats">
                <div className="overview-stat">
                  <span className="overview-label">Total Calls:</span>
                  <span className="overview-value">{callStats.total}</span>
                </div>
                <div className="overview-stat">
                  <span className="overview-label">Connected Calls:</span>
                  <span className="overview-value">{callStats.connectedCalls}</span>
                </div>
                <div className="overview-stat">
                  <span className="overview-label">This Week:</span>
                  <span className="overview-value">{callStats.thisWeeksCalls}</span>
                </div>
                <div className="overview-stat">
                  <span className="overview-label">Total Talk Time:</span>
                  <span className="overview-value">
                    {callStats.totalDuration > 0 
                      ? `${Math.floor(callStats.totalDuration / 60)}:${(callStats.totalDuration % 60).toString().padStart(2, '0')}`
                      : '0:00'
                    }
                  </span>
                </div>
              </div>
            </div>
            
            <div className="stats-row">
              <h3>By Status</h3>
              <div className="status-breakdown">
                {Object.entries(callStats.byStatus).map(([status, count]) => (
                  <div key={status} className="status-stat">
                    <span className={`status-indicator status-${status}`}>{status}</span>
                    <span className="count">{count}</span>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="stats-row">
              <h3>By Direction</h3>
              <div className="direction-breakdown">
                {Object.entries(callStats.byDirection).map(([direction, count]) => (
                  <div key={direction} className="direction-stat">
                    <span className="direction-label">{direction}</span>
                    <span className="count">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Active Calls */}
        <div className="active-calls-section card">
          <div className="section-header">
            <h2>Active Calls</h2>
            <span className="call-count">{callManager?.calls.length || 0}</span>
          </div>
          
          {callManager?.calls.length ? (
            <div className="calls-list">
              {callManager.calls.map((call: any) => (
                <div key={call.id} className="call-item">
                  <div className="call-info">
                    <div className="call-participants">
                      <strong>{call.from}</strong> → <strong>{call.to}</strong>
                    </div>
                    <div className="call-meta">
                      <span className={`status-indicator status-${call.status}`}>
                        {call.status.toUpperCase()}
                      </span>
                      <span className="call-duration">
                        {call.duration ? `${Math.floor(call.duration / 60)}:${(call.duration % 60).toString().padStart(2, '0')}` : 'Starting...'}
                      </span>
                    </div>
                  </div>
                  <div className="call-actions">
                    <button 
                      className="btn btn-danger"
                      onClick={() => callManager.hangupCall(call.id)}
                    >
                      End Call
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="no-data">
              <p>No active calls</p>
              <button 
                className="btn btn-primary"
                onClick={() => onNavigate('calls')}
              >
                Make a Call
              </button>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="quick-actions-section card">
          <h2>Quick Actions</h2>
          <div className="actions-grid">
            <button 
              className="action-btn btn btn-primary"
              onClick={() => onNavigate('calls')}
            >
              📞 Make Call
            </button>
            <button 
              className="action-btn btn btn-secondary"
              onClick={() => onNavigate('history')}
            >
              📋 Call History
            </button>
            <button 
              className="action-btn btn btn-secondary"
              onClick={() => onNavigate('settings')}
            >
              ⚙️ Settings
            </button>
            <button 
              className="action-btn btn btn-secondary"
              onClick={() => {/* TODO: Re-implement data refresh */}}
            >
              🔄 Refresh Data
            </button>
          </div>
        </div>

        {/* System Status */}
        <div className="system-status-section card">
          <h2>System Status</h2>
          <div className="status-items">
            <div className="status-item">
              <span className="status-label">API Connection:</span>
              <span className="status-value status-success">✅ Connected</span>
            </div>
            <div className="status-item">
              <span className="status-label">MediaSFU Service:</span>
              <span className="status-value status-success">✅ Ready</span>
            </div>
            <div className="status-item">
              <span className="status-label">Real-time Updates:</span>
              <span className={`status-value ${config.realtime.enabled ? 'status-success' : 'status-warning'}`}>
                {config.realtime.enabled ? '✅ Enabled' : '⚠️ Disabled'}
              </span>
            </div>
            <div className="status-item">
              <span className="status-label">Update Interval:</span>
              <span className="status-value">{config.realtime.interval / 1000}s</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
