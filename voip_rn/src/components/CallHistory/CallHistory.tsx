import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { callService } from '../../services/callService';
import { Call, CallStats } from '../../types/call.types';
import { callLogger } from '../../utils/logger';

export const CallHistory: React.FC = () => {
  const [calls, setCalls] = useState<Call[]>([]);
  const [stats, setStats] = useState<CallStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'incoming' | 'outgoing'>('all');

  const loadCallHistory = useCallback(async (showRefresh = false) => {
    try {
      if (showRefresh) {
        setRefreshing(true);
      } else {
        setIsLoading(true);
      }

      let response;

      if (filter === 'all') {
        response = await callService.getAllCalls();
      } else {
        response = await callService.getCallsByDirection(filter);
      }

      if (response.success && response.data) {
        setCalls(response.data);
      } else {
        // Fallback to local history if API fails
        const localHistory = await callService.getLocalCallHistory();
        setCalls(localHistory);

        if (response.error) {
          callLogger.warn('API failed, using local history:', response.error);
        }
      }
    } catch (error) {
      callLogger.error('Failed to load call history:', error);
      // Try to load local history as fallback
      try {
        const localHistory = await callService.getLocalCallHistory();
        setCalls(localHistory);
      } catch (localError) {
        callLogger.error('Failed to load local history:', localError);
        Alert.alert('Error', 'Failed to load call history');
      }
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  const loadCallStats = useCallback(async () => {
    try {
      const response = await callService.getCallStats();
      if (response.success && response.data) {
        setStats(response.data);
      }
    } catch (error) {
      callLogger.error('Failed to load call stats:', error);
    }
  }, []);

  // Load data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadCallHistory();
      loadCallStats();
    }, [loadCallHistory, loadCallStats])
  );

  const handleRefresh = () => {
    loadCallHistory(true);
    loadCallStats();
  };

  const handleFilterChange = (newFilter: 'all' | 'incoming' | 'outgoing') => {
    setFilter(newFilter);
    setCalls([]); // Clear current calls while loading
    setTimeout(() => loadCallHistory(), 100); // Small delay to show filter change
  };

  const handleCallPress = (call: Call) => {
    Alert.alert(
      'Call Details',
      `Number: ${call.phoneNumber || call.calledUri || 'Unknown'}\n` +
      `Direction: ${call.direction}\n` +
      `Status: ${call.status}\n` +
      `Start: ${new Date(call.startTimeISO).toLocaleString()}\n` +
      `Duration: ${formatDuration(call.durationSeconds || 0)}`,
      [
        { text: 'OK' },
        {
          text: 'Call Again',
          onPress: () => {
            // This would trigger a new call
            Alert.alert('Coming Soon', 'Call back functionality will be available soon');
          },
        },
      ]
    );
  };

  const handleClearHistory = () => {
    Alert.alert(
      'Clear History',
      'Are you sure you want to clear all local call history? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await callService.clearLocalCallHistory();
              setCalls([]);
              Alert.alert('Success', 'Local call history cleared');
            } catch (err) {
              callLogger.warn('Failed to clear call history', err);
              Alert.alert('Error', 'Failed to clear call history');
            }
          },
        },
      ]
    );
  };

  const formatDuration = (seconds: number): string => {
    if (seconds === 0) {return '0:00';}
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getCallIcon = (call: Call): string => {
    if (call.direction === 'incoming' || call.direction === 'inbound') {
      return call.status === 'completed' ? '📞' : '📵';
    } else {
      return call.status === 'completed' ? '📤' : '📵';
    }
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'completed': return '#4CAF50';
      case 'active': return '#2196F3';
      case 'connecting': return '#FF9800';
      case 'ringing': return '#9C27B0';
      case 'failed': return '#F44336';
      default: return '#666';
    }
  };

  if (isLoading && calls.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={styles.loadingText}>Loading call history...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Stats Summary */}
      {stats && (
        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{stats.totalCalls}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{stats.activeCalls}</Text>
            <Text style={styles.statLabel}>Active</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{stats.todaysCalls}</Text>
            <Text style={styles.statLabel}>Today</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{Math.round(stats.avgDuration / 60)}m</Text>
            <Text style={styles.statLabel}>Avg Duration</Text>
          </View>
        </View>
      )}

      {/* Filter Buttons */}
      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'all' && styles.activeFilter]}
          onPress={() => handleFilterChange('all')}
        >
          <Text style={[styles.filterText, filter === 'all' && styles.activeFilterText]}>
            All
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'incoming' && styles.activeFilter]}
          onPress={() => handleFilterChange('incoming')}
        >
          <Text style={[styles.filterText, filter === 'incoming' && styles.activeFilterText]}>
            Incoming
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'outgoing' && styles.activeFilter]}
          onPress={() => handleFilterChange('outgoing')}
        >
          <Text style={[styles.filterText, filter === 'outgoing' && styles.activeFilterText]}>
            Outgoing
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.clearButton}
          onPress={handleClearHistory}
        >
          <Text style={styles.clearButtonText}>Clear</Text>
        </TouchableOpacity>
      </View>

      {/* Call List */}
      <ScrollView
        style={styles.callList}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#2196F3']}
          />
        }
      >
        {calls.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {filter === 'all' ? 'No call history available' : `No ${filter} calls found`}
            </Text>
            <Text style={styles.emptySubtext}>
              Pull down to refresh or make a call to see history
            </Text>
          </View>
        ) : (
          calls.map((call, index) => (
            <TouchableOpacity
              key={`${call.id || call.sipCallId}-${index}`}
              style={styles.callItem}
              onPress={() => handleCallPress(call)}
            >
              <View style={styles.callIcon}>
                <Text style={styles.callIconText}>{getCallIcon(call)}</Text>
              </View>

              <View style={styles.callDetails}>
                <Text style={styles.callNumber}>
                  {call.phoneNumber || call.calledUri || 'Unknown Number'}
                </Text>
                <Text style={styles.callTime}>
                  {new Date(call.startTimeISO).toLocaleString()}
                </Text>
                <Text style={styles.callDirection}>
                  {call.direction} • {formatDuration(call.durationSeconds || 0)}
                </Text>
              </View>

              <View style={styles.callStatus}>
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: getStatusColor(call.status) },
                  ]}
                />
                <Text style={[styles.statusText, { color: getStatusColor(call.status) }]}>
                  {call.status}
                </Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 15,
    fontSize: 16,
    color: '#666',
  },
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: 'white',
    paddingVertical: 20,
    paddingHorizontal: 15,
    justifyContent: 'space-around',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2196F3',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  filterContainer: {
    flexDirection: 'row',
    backgroundColor: 'white',
    paddingHorizontal: 15,
    paddingVertical: 10,
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  filterButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
  },
  activeFilter: {
    backgroundColor: '#2196F3',
  },
  filterText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  activeFilterText: {
    color: 'white',
  },
  clearButton: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#ff6b6b',
  },
  clearButtonText: {
    fontSize: 14,
    color: 'white',
    fontWeight: '500',
  },
  callList: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    color: '#666',
    textAlign: 'center',
    marginBottom: 10,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  callItem: {
    flexDirection: 'row',
    backgroundColor: 'white',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    alignItems: 'center',
  },
  callIcon: {
    marginRight: 15,
  },
  callIconText: {
    fontSize: 24,
  },
  callDetails: {
    flex: 1,
  },
  callNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 2,
  },
  callTime: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  callDirection: {
    fontSize: 12,
    color: '#999',
  },
  callStatus: {
    alignItems: 'flex-end',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
});

export default CallHistory;
