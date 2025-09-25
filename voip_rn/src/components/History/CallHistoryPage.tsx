import React, { useState } from 'react';
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
} from 'react-native';
import { useCallHistory } from '../../hooks/useCallHistory';
import { Call } from '../../types/call.types';
// LoadingSpinner not needed here
import NotificationModal from '../Common/NotificationModal';
import ConfirmationModal from '../Common/ConfirmationModal';

interface CallHistoryPageProps {
  isApiConfigured: boolean;
  onNavigate?: (page: string) => void;
}

const CallHistoryPage: React.FC<CallHistoryPageProps> = ({
  isApiConfigured,
  onNavigate,
}) => {
  const [filter, setFilter] = useState<'all' | 'inbound' | 'outbound'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [notification, setNotification] = useState<{isOpen: boolean; title: string; message: string; type: 'success' | 'error' | 'warning' | 'info';}>({ isOpen: false, title: '', message: '', type: 'info' });
  const [confirmState, setConfirmState] = useState<{isOpen: boolean; title: string; message: string; confirmText?: string; cancelText?: string; onConfirm?: () => void;}>({ isOpen: false, title: '', message: '' });

  const {
    callHistory,
    clearCallHistory,
    clearSpecificCallFromHistory,
    getCallHistoryStats,
    loadCallHistory,
  } = useCallHistory();

  const stats = getCallHistoryStats();


  const formatDuration = (seconds: number): string => {
    if (!seconds) {return '0:00';}
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (isoString: string): string => {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'Invalid Date';
    }
  };

  const getCallStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
      case 'active':
        return '#28a745';
      case 'failed':
      case 'rejected':
        return '#dc3545';
      case 'missed':
        return '#ffc107';
      default:
        return '#6c757d';
    }
  };

  const getDirectionIcon = (direction: string) => {
    return direction === 'incoming' || direction === 'inbound' ? '📞' : '📱';
  };

  const filteredCalls = callHistory.filter((call: Call) => {
    const callType = call.direction === 'incoming' ? 'inbound' :
                     call.direction === 'outgoing' ? 'outbound' :
                     call.direction;

    const matchesFilter = filter === 'all' || callType === filter;

    const matchesSearch = searchTerm === '' ||
      (call.callerIdRaw && call.callerIdRaw.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (call.calledUri && call.calledUri.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (call.phoneNumber && call.phoneNumber.includes(searchTerm)) ||
      (call.sipCallId && call.sipCallId.toLowerCase().includes(searchTerm.toLowerCase()));

    return matchesFilter && matchesSearch;
  }) || [];

  const handleRefresh = async () => {
    try {
      setIsRefreshing(true);
      await loadCallHistory();
    } finally {
      setTimeout(() => setIsRefreshing(false), 300);
    }
  };

  const handleClearHistory = () => {
    setConfirmState({
      isOpen: true,
      title: 'Clear All History',
      message: 'Are you sure you want to clear all call history? This cannot be undone.',
      confirmText: 'Clear',
      cancelText: 'Cancel',
      onConfirm: () => {
        clearCallHistory();
        setConfirmState({ isOpen: false, title: '', message: '' });
        setNotification({ isOpen: true, title: 'Success', message: 'Call history cleared', type: 'success' });
      },
    });
  };

  const handleDeleteCall = (sipCallId: string) => {
    setConfirmState({
      isOpen: true,
      title: 'Delete Call',
      message: 'Are you sure you want to delete this call from history?',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      onConfirm: () => {
        clearSpecificCallFromHistory(sipCallId);
        setConfirmState({ isOpen: false, title: '', message: '' });
        setNotification({ isOpen: true, title: 'Success', message: 'Call deleted from history', type: 'success' });
      },
    });
  };

  const renderFilterButton = (filterValue: 'all' | 'inbound' | 'outbound', label: string) => (
    <TouchableOpacity
      key={filterValue}
      style={[
        styles.filterButton,
        filter === filterValue && styles.filterButtonActive,
      ]}
      onPress={() => setFilter(filterValue)}
    >
      <Text style={[
        styles.filterButtonText,
        filter === filterValue && styles.filterButtonTextActive,
      ]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  if (!isApiConfigured) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.centeredContent}>
          <View style={styles.configPrompt}>
            <Text style={styles.configTitle}>📋 Call History</Text>
            <Text style={styles.configDescription}>
              Configure your API settings to view call history.
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

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />
      <ScrollView style={styles.scrollView}>
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>📋 Call History</Text>
            <View style={styles.headerActions}>
              <TouchableOpacity
                style={styles.refreshButton}
                onPress={handleRefresh}
                disabled={isRefreshing}
              >
                {isRefreshing ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <Text style={styles.refreshButtonText}>🔄 Refresh</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.clearButton, callHistory.length === 0 && styles.buttonDisabled]}
                onPress={handleClearHistory}
                disabled={callHistory.length === 0}
              >
                <Text style={styles.clearButtonText}>🗑️ Clear</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Controls */}
          <View style={styles.controlsSection}>
            {/* Search */}
            <View style={styles.searchSection}>
              <Text style={styles.sectionLabel}>Search Calls</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="Search by phone number, name, or SIP Call ID..."
                placeholderTextColor="#999"
                value={searchTerm}
                onChangeText={setSearchTerm}
              />
            </View>

            {/* Filters */}
            <View style={styles.filterSection}>
              <Text style={styles.sectionLabel}>Filter by Direction</Text>
              <View style={styles.filterButtons}>
                {renderFilterButton('all', 'All Calls')}
                {renderFilterButton('inbound', '📞 Incoming')}
                {renderFilterButton('outbound', '📱 Outgoing')}
              </View>
            </View>

            {/* Stats */}
            <View style={styles.statsSection}>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>📊 Total:</Text>
                <Text style={styles.statValue}>{stats.totalCalls}</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>🔍 Filtered:</Text>
                <Text style={styles.statValue}>{filteredCalls.length}</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>✅ Completed:</Text>
                <Text style={styles.statValue}>{stats.completedCalls}</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>❌ Failed:</Text>
                <Text style={styles.statValue}>{stats.failedCalls}</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>📥 Inbound:</Text>
                <Text style={styles.statValue}>{stats.inboundCalls}</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>📤 Outbound:</Text>
                <Text style={styles.statValue}>{stats.outboundCalls}</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>⏰ Missed:</Text>
                <Text style={styles.statValue}>{stats.missedCalls}</Text>
              </View>
            </View>
          </View>

          {/* Call List */}
          <View style={styles.callListSection}>
            {filteredCalls.length > 0 ? (
              <View style={styles.callList}>
                {filteredCalls.map((call: Call) => (
                  <View key={call.sipCallId || call.id} style={styles.callItem}>
                    <View style={styles.callHeader}>
                      <View style={styles.callDirection}>
                        <Text style={styles.directionIcon}>
                          {getDirectionIcon(call.direction)}
                        </Text>
                        <Text style={styles.directionText}>
                          {call.direction === 'incoming' || call.direction === 'inbound' ? 'Incoming' : 'Outgoing'}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.deleteButton}
                        onPress={() => handleDeleteCall(call.sipCallId)}
                      >
                        <Text style={styles.deleteButtonText}>🗑️</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.callDetails}>
                      <Text style={styles.phoneNumber}>
                        {call.phoneNumber || call.calledUri || 'Unknown'}
                      </Text>
                      {call.callerName && (
                        <Text style={styles.callerName}>{call.callerName}</Text>
                      )}
                      <Text style={styles.callDate}>
                        {formatDate(call.startTimeISO)}
                      </Text>
                    </View>

                    <View style={styles.callMeta}>
                      <View style={styles.durationContainer}>
                        <Text style={styles.durationText}>
                          Duration: {formatDuration(call.durationSeconds)}
                        </Text>
                      </View>
                      <View style={styles.statusContainer}>
                        <Text
                          style={[
                            styles.statusText,
                            { color: getCallStatusColor(call.status) },
                          ]}
                        >
                          {call.status.charAt(0).toUpperCase() + call.status.slice(1)}
                        </Text>
                      </View>
                    </View>

                    {call.sipCallId && (
                      <Text style={styles.callId}>ID: {call.sipCallId}</Text>
                    )}
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.noCallsContainer}>
                <Text style={styles.noCallsText}>
                  {searchTerm || filter !== 'all' ? 'No matching calls found' : 'No call history available'}
                </Text>
                <Text style={styles.noCallsSubtext}>
                  {searchTerm || filter !== 'all'
                    ? 'Try adjusting your search or filter criteria'
                    : 'Make some calls to see your history here. Tap Refresh after placing or ending a call.'
                  }
                </Text>
                <TouchableOpacity style={[styles.refreshButton, { marginTop: 12 }]} onPress={handleRefresh}>
                  <Text style={styles.refreshButtonText}>🔄 Refresh</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Notification Modal */}
      <NotificationModal
        visible={notification.isOpen}
        title={notification.title}
        message={notification.message}
        type={notification.type}
        onClose={() => setNotification(prev => ({ ...prev, isOpen: false }))}
      />

      {/* Confirmation Modal */}
      <ConfirmationModal
        visible={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        confirmText={confirmState.confirmText || 'Confirm'}
        cancelText={confirmState.cancelText || 'Cancel'}
        onConfirm={() => {
          if (confirmState.onConfirm) {confirmState.onConfirm();}
        }}
        onCancel={() => setConfirmState({ isOpen: false, title: '', message: '' })}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
    width: '100%',
    maxWidth: 1200,
  },
  centeredContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
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

  // Header styles
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  refreshButton: {
    backgroundColor: '#6c757d',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    minWidth: 80,
    alignItems: 'center',
  },
  refreshButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  clearButton: {
    backgroundColor: '#dc3545',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  clearButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  buttonDisabled: {
    backgroundColor: '#6c757d',
    opacity: 0.5,
  },

  // Controls section styles
  controlsSection: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  searchSection: {
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  searchInput: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#333',
  },
  filterSection: {
    marginBottom: 20,
  },
  filterButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterButton: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  filterButtonActive: {
    backgroundColor: '#007bff',
    borderColor: '#007bff',
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  filterButtonTextActive: {
    color: 'white',
  },
  statsSection: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statLabel: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  statValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: 'bold',
  },

  // Call list styles
  callListSection: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  callList: {
    gap: 16,
  },
  callItem: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  callHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  callDirection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  directionIcon: {
    fontSize: 16,
  },
  directionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  deleteButton: {
    padding: 4,
  },
  deleteButtonText: {
    fontSize: 16,
  },
  callDetails: {
    marginBottom: 8,
  },
  phoneNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  callerName: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  callDate: {
    fontSize: 14,
    color: '#666',
  },
  callMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  durationContainer: {
    flex: 1,
  },
  durationText: {
    fontSize: 14,
    color: '#666',
  },
  statusContainer: {
    alignItems: 'flex-end',
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  callId: {
    fontSize: 12,
    color: '#999',
    fontFamily: 'monospace',
  },
  noCallsContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  noCallsText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
    textAlign: 'center',
  },
  noCallsSubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
});

export default CallHistoryPage;
