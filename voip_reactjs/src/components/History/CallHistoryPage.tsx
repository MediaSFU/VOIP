import React, { useEffect, useState } from 'react';
import { useCallManager, useCallHistory } from '../../hooks';
import { Call } from '../../types';
import LoadingSpinner from '../Common/LoadingSpinner';
import ConfirmationModal from '../Common/ConfirmationModal';
import { parseSipCaller, getCallerDisplayString, extractCleanIdentifier } from '../../utils/sipCallerParser';
import './CallHistoryPage.css';

interface CallHistoryPageProps {
  isApiConfigured: boolean;
}

const CallHistoryPage: React.FC<CallHistoryPageProps> = ({ isApiConfigured }) => {
  const [currentPage] = useState(1); // For future pagination implementation
  const [filter, setFilter] = useState<'all' | 'inbound' | 'outbound'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Confirmation modal state
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [confirmationConfig, setConfirmationConfig] = useState<{
    title: string;
    message: string;
    type: 'warning' | 'danger' | 'info';
    onConfirm: () => void;
  } | null>(null);

  const callManager = useCallManager();
  const { 
    callHistory, 
    clearCallHistory, 
    clearSpecificCallFromHistory,
    getCallHistoryStats 
  } = useCallHistory();

  const stats = getCallHistoryStats();

  useEffect(() => {
    if (callManager) {
      // TODO: Implement fetchCallHistory with MediaSFU
      // callManager.fetchCallHistory(currentPage, 20);
    }
  }, [callManager, currentPage]);

  const formatDuration = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (isoString: string): string => {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    } catch {
      return 'Invalid Date';
    }
  };

  const filteredCalls = callHistory.filter((call: Call) => {
    // Map MediaSFU direction to the expected format
    const callType = call.direction === 'incoming' ? 'inbound' : 
                     call.direction === 'outgoing' ? 'outbound' : 
                     call.direction;
    
    const matchesFilter = filter === 'all' || callType === filter;
    
    // Parse caller information for search
    const caller = parseSipCaller(call.callerIdRaw || '');
    const displayName = getCallerDisplayString(caller);
    
    const matchesSearch = searchTerm === '' || 
      (call.callerIdRaw && call.callerIdRaw.includes(searchTerm)) || 
      (call.calledUri && call.calledUri.includes(searchTerm)) ||
      displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (call.sipCallId && call.sipCallId.includes(searchTerm));
    
    return matchesFilter && matchesSearch;
  }) || [];

  if (!isApiConfigured) {
    return (
      <div className="history-page">
        <div className="not-configured card">
          <h2>API Not Configured</h2>
          <p>Please configure your API settings to view call history.</p>
          <button className="btn btn-primary" onClick={() => window.location.href = '/settings'}>
            Go to Settings
          </button>
        </div>
      </div>
    );
  }

  if (callManager?.isLoading) {
    return <LoadingSpinner message="Loading call history..." />;
  }

  return (
    <div className="history-page">
      <div className="history-header">
        <h1>Call History</h1>
        <div className="header-actions">
          <button 
            className="btn btn-secondary"
            onClick={() => window.location.reload()}
          >
            🔄 Refresh
          </button>
          <button 
            className="btn btn-danger"
            onClick={() => {
              setConfirmationConfig({
                title: "Clear All History",
                message: "Are you sure you want to clear all call history? This cannot be undone.",
                type: "danger",
                onConfirm: () => {
                  clearCallHistory();
                  setShowConfirmation(false);
                  setConfirmationConfig(null);
                }
              });
              setShowConfirmation(true);
            }}
            disabled={callHistory.length === 0}
          >
            🗑️ Clear History
          </button>
        </div>
      </div>

      {callManager?.error && (
        <div className="error-banner">
          <p>⚠️ {callManager.error}</p>
        </div>
      )}

      <div className="history-controls card">
        <div className="controls-top-row">
          <div className="search-section">
            <label htmlFor="search-input">Search Calls</label>
            <input
              id="search-input"
              type="text"
              className="search-input"
              placeholder="Search by phone number, name, or SIP Call ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="filter-section">
            <label htmlFor="filter-select">Filter by Direction</label>
            <select 
              id="filter-select"
              className="filter-select"
              value={filter}
              onChange={(e) => setFilter(e.target.value as any)}
            >
              <option value="all">All Calls</option>
              <option value="inbound">📞 Incoming</option>
              <option value="outbound">📱 Outgoing</option>
            </select>
          </div>
        </div>

        <div className="controls-bottom-row">
          <div className="stats-section">
            <div className="stat-item">
              <span className="stat-label">📊 Total:</span>
              <span className="stat-value">{stats.total}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">🔍 Filtered:</span>
              <span className="stat-value">{filteredCalls.length}</span>
            </div>
            {Object.entries(stats.byStatus).slice(0, 3).map(([status, count]) => (
              <div key={status} className="stat-item">
                <span className="stat-label">{status}:</span>
                <span className="stat-value">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="history-content">
        {filteredCalls.length > 0 ? (
          <div className="calls-table-container card">
            <div className="calls-table">
              <div className="table-header">
                <div className="header-cell">Type</div>
                <div className="header-cell">Details</div>
                <div className="header-cell">Date & Time</div>
                <div className="header-cell">Duration</div>
                <div className="header-cell">Status</div>
                <div className="header-cell">Actions</div>
              </div>

              <div className="table-body">
                {filteredCalls.map((call: Call) => {
                  const callType = call.direction === 'incoming' ? 'inbound' : 
                                   call.direction === 'outgoing' ? 'outbound' : 
                                   call.direction;
                  const caller = parseSipCaller(call.callerIdRaw || '');
                  const displayName = getCallerDisplayString(caller);
                  
                  // Improved status detection:
                  // If call has callEnded: true, it's terminated
                  // If call status is ended/failed/completed, it's that status
                  // If call status is active but we haven't seen it in recent polls, it's likely terminated
                  let status: string = call.status || 'unknown';
                  if (call.callEnded || ['ended', 'failed', 'completed', 'terminated'].includes(call.status || '')) {
                    status = call.callEnded ? 'terminated' : (call.status || 'unknown');
                  }
                  
                  return (
                    <div key={call.sipCallId} className="table-row">
                      <div className="table-cell">
                        <span className={`call-type-badge ${callType}`}>
                          {callType === 'inbound' ? '📞 In' : '📱 Out'}
                        </span>
                      </div>
                      
                      <div className="table-cell participants-cell">
                        <div className="participants-info">
                          <div className="phone-numbers">
                            <strong>{extractCleanIdentifier(call.callerIdRaw || '')}</strong> → <strong>{extractCleanIdentifier(call.calledUri || '')}</strong>
                          </div>
                          {displayName && displayName !== call.callerIdRaw && (
                            <div className="display-name">{displayName}</div>
                          )}
                          <div className="sip-call-id">ID: {call.sipCallId}</div>
                        </div>
                      </div>

                      <div className="table-cell">
                        <div className="datetime-info">
                          <div className="date">{formatDate(call.startTimeISO)}</div>
                        </div>
                      </div>

                      <div className="table-cell">
                        <span className="duration">
                          {call.durationSeconds ? formatDuration(call.durationSeconds) : 'N/A'}
                        </span>
                      </div>

                      <div className="table-cell">
                        <span className={`status-indicator status-${status}`}>
                          {status?.replace('-', ' ').toUpperCase() || 'UNKNOWN'}
                        </span>
                      </div>

                      <div className="table-cell">
                        <div className="action-buttons">
                          <button 
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                              // Copy the caller number for easy access
                              const number = callType === 'outbound' 
                                ? extractCleanIdentifier(call.calledUri || '') 
                                : extractCleanIdentifier(call.callerIdRaw || '');
                              if (number && number !== 'Unknown') {
                                navigator.clipboard.writeText(number);
                              }
                            }}
                            title="Copy number"
                          >
                            📋
                          </button>
                          <button 
                            className="btn btn-danger btn-sm"
                            onClick={() => {
                              setConfirmationConfig({
                                title: "Remove Call",
                                message: "Remove this call from history? This cannot be undone.",
                                type: "warning",
                                onConfirm: () => {
                                  clearSpecificCallFromHistory(call.sipCallId);
                                  setShowConfirmation(false);
                                  setConfirmationConfig(null);
                                }
                              });
                              setShowConfirmation(true);
                            }}
                            title="Remove from history"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="no-history card">
            <div className="no-data">
              <h3>No Call History</h3>
              <p>
                {searchTerm || filter !== 'all' 
                  ? 'No calls match your current filters.' 
                  : 'No calls have been made yet.'}
              </p>
              {(!searchTerm && filter === 'all') && (
                <button 
                  className="btn btn-primary"
                  onClick={() => window.location.href = '/calls'}
                >
                  Make Your First Call
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Simple pagination - would be enhanced with real API pagination */}
      {filteredCalls.length > 0 && (
        <div className="pagination-section">
          <div className="pagination-info">
            Showing {filteredCalls.length} calls
          </div>
        </div>
      )}
      
      {/* Confirmation Modal */}
      {confirmationConfig && (
        <ConfirmationModal
          isOpen={showConfirmation}
          title={confirmationConfig.title}
          message={confirmationConfig.message}
          type={confirmationConfig.type}
          onConfirm={confirmationConfig.onConfirm}
          onCancel={() => {
            setShowConfirmation(false);
            setConfirmationConfig(null);
          }}
        />
      )}
    </div>
  );
};

export default CallHistoryPage;
