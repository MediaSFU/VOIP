import React, { useState } from 'react';
import { useCallHistory } from '../../hooks';
import { Call } from '../../types/call.types';
import { parseSipCaller, getCallerDisplayString } from '../../utils/sipCallerParser';
import ConfirmationModal from '../Common/ConfirmationModal';
import './HistoryPage.css';

const HistoryPage: React.FC = () => {
  const { 
    callHistory, 
    clearCallHistory, 
    clearSpecificCallFromHistory, 
    clearMultipleCallsFromHistory,
    getCallHistoryStats 
  } = useCallHistory();

  const [selectedCalls, setSelectedCalls] = useState<Set<string>>(new Set());
  const [expandedCalls, setExpandedCalls] = useState<Set<string>>(new Set());
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterDirection, setFilterDirection] = useState<string>('all');
  const [showConfirmation, setShowConfirmation] = useState(false);

  const stats = getCallHistoryStats();

  const toggleCallSelection = (sipCallId: string) => {
    setSelectedCalls(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sipCallId)) {
        newSet.delete(sipCallId);
      } else {
        newSet.add(sipCallId);
      }
      return newSet;
    });
  };

  const toggleCallExpansion = (sipCallId: string) => {
    setExpandedCalls(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sipCallId)) {
        newSet.delete(sipCallId);
      } else {
        newSet.add(sipCallId);
      }
      return newSet;
    });
  };

  const clearSelectedCalls = () => {
    const selectedCallIds = Array.from(selectedCalls);
    clearMultipleCallsFromHistory(selectedCallIds);
    setSelectedCalls(new Set());
  };

  const selectAllCalls = () => {
    const allCallIds = filteredHistory.map(call => call.sipCallId);
    setSelectedCalls(new Set(allCallIds));
  };

  const clearAllCalls = () => {
    setShowConfirmation(true);
  };

  const handleConfirmClear = () => {
    clearCallHistory();
    setSelectedCalls(new Set());
    setExpandedCalls(new Set());
    setShowConfirmation(false);
  };

  // Filter history based on selected filters
  const filteredHistory = callHistory.filter(call => {
    const statusMatch = filterStatus === 'all' || call.status === filterStatus;
    const directionMatch = filterDirection === 'all' || call.direction === filterDirection;
    return statusMatch && directionMatch;
  });

  const formatDuration = (seconds?: number) => {
    if (!seconds) return 'N/A';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDateTime = (isoString?: string) => {
    if (!isoString) return 'N/A';
    try {
      return new Date(isoString).toLocaleString();
    } catch {
      return 'Invalid Date';
    }
  };

  const getCallStatus = (call: Call) => {
    if (call.callEnded) return 'ended';
    return call.status || 'unknown';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected': return '#28a745';
      case 'ended': return '#6c757d';
      case 'failed': return '#dc3545';
      case 'rejected': return '#dc3545';
      case 'ringing': return '#ffc107';
      default: return '#6c757d';
    }
  };

  return (
    <div className="history-page">
      <div className="history-header">
        <h2>Call History</h2>
        
        {/* Stats Summary */}
        <div className="history-stats">
          <div className="stat-item">
            <span className="stat-label">Total Calls:</span>
            <span className="stat-value">{stats.total}</span>
          </div>
          {Object.entries(stats.byStatus).map(([status, count]) => (
            <div key={status} className="stat-item">
              <span className="stat-label">{status}:</span>
              <span className="stat-value">{count}</span>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="history-filters">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Statuses</option>
            {Object.keys(stats.byStatus).map(status => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>

          <select
            value={filterDirection}
            onChange={(e) => setFilterDirection(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Directions</option>
            {Object.keys(stats.byDirection).map(direction => (
              <option key={direction} value={direction}>{direction}</option>
            ))}
          </select>
        </div>

        {/* Action Buttons */}
        <div className="history-actions">
          <button
            onClick={selectAllCalls}
            className="action-btn select-all-btn"
            disabled={filteredHistory.length === 0}
          >
            Select All ({filteredHistory.length})
          </button>
          
          <button
            onClick={clearSelectedCalls}
            className="action-btn clear-selected-btn"
            disabled={selectedCalls.size === 0}
          >
            Clear Selected ({selectedCalls.size})
          </button>
          
          <button
            onClick={clearAllCalls}
            className="action-btn clear-all-btn"
            disabled={callHistory.length === 0}
          >
            Clear All History
          </button>
        </div>
      </div>

      {/* History List */}
      <div className="history-list">
        {filteredHistory.length === 0 ? (
          <div className="no-history">
            {callHistory.length === 0 ? 'No call history available' : 'No calls match the current filters'}
          </div>
        ) : (
          filteredHistory.map((call) => {
            const sipCallId = call.sipCallId;
            const isSelected = selectedCalls.has(sipCallId);
            const isExpanded = expandedCalls.has(sipCallId);
            const status = getCallStatus(call);
            const caller = parseSipCaller(call.callerIdRaw || '');
            const displayName = getCallerDisplayString(caller);

            return (
              <div
                key={sipCallId}
                className={`history-item ${isSelected ? 'selected' : ''}`}
              >
                <div className="history-item-header" onClick={() => toggleCallExpansion(sipCallId)}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleCallSelection(sipCallId)}
                    onClick={(e) => e.stopPropagation()}
                    className="call-checkbox"
                  />
                  
                  <div className="call-basic-info">
                    <div className="call-participants">
                      <span className="call-direction">{call.direction}</span>
                      <span className="call-number">{displayName}</span>
                    </div>
                    
                    <div className="call-metadata">
                      <span 
                        className="call-status"
                        style={{ color: getStatusColor(status) }}
                      >
                        {status}
                      </span>
                      <span className="call-time">{formatDateTime(call.startTimeISO)}</span>
                      <span className="call-duration">{formatDuration(call.durationSeconds)}</span>
                      {!isExpanded && (
                        <span className="expand-hint">click to expand for details</span>
                      )}
                    </div>
                  </div>

                  <div className="expand-icon">
                    {isExpanded ? '▼' : '▶'}
                  </div>
                </div>

                {isExpanded && (
                  <div className="history-item-details">
                    <div className="detail-row">
                      <span className="detail-label">SIP Call ID:</span>
                      <span className="detail-value">{call.sipCallId}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Room Name:</span>
                      <span className="detail-value">{call.roomName}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Called URI:</span>
                      <span className="detail-value">{call.calledUri}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Audio Only:</span>
                      <span className="detail-value">{call.audioOnly ? 'Yes' : 'No'}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Active Media Source:</span>
                      <span className="detail-value">{call.activeMediaSource || 'N/A'}</span>
                    </div>
                    {call.humanParticipantName && (
                      <div className="detail-row">
                        <span className="detail-label">Human Participant:</span>
                        <span className="detail-value">{call.humanParticipantName}</span>
                      </div>
                    )}
                    
                    <div className="call-actions">
                      <button
                        onClick={() => clearSpecificCallFromHistory(sipCallId)}
                        className="delete-call-btn"
                      >
                        Delete This Call
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={showConfirmation}
        title="Clear Call History"
        message="Are you sure you want to clear all call history? This action cannot be undone."
        type="danger"
        confirmText="Clear All"
        onConfirm={handleConfirmClear}
        onCancel={() => setShowConfirmation(false)}
      />
    </div>
  );
};

export default HistoryPage;
