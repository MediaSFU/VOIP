import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ScrollView,
  TouchableOpacity,
  Switch,
  RefreshControl,
  Dimensions,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useVoipConfig } from '../../hooks/useVoipConfig';
import { useCallHistory } from '../../hooks/useCallHistory';
import LoadingSpinner from '../Common/LoadingSpinner';

interface DashboardProps {
  onNavigate: (page: string) => void;
  isApiConfigured: boolean;
}

const Dashboard: React.FC<DashboardProps> = ({ onNavigate, isApiConfigured }) => {
  const { config, updateRealtimeConfig } = useVoipConfig();
  const { getCallHistoryStats } = useCallHistory();
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Screen size detection for responsive design
  const [screenData, setScreenData] = useState(Dimensions.get('window'));
  const isTablet = screenData.width >= 768;
  const isDesktop = screenData.width >= 1024;

  useEffect(() => {
    const onChange = (result: any) => {
      setScreenData(result.window);
    };

    const subscription = Dimensions.addEventListener('change', onChange);
    return () => subscription?.remove();
  }, []);

  // Get call statistics
  const callStats = getCallHistoryStats();

  // Simulate initial loading
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  };

  const toggleRealtime = () => {
    updateRealtimeConfig({ enabled: !config.realtime.enabled });
  };

  if (isLoading) {
    return <LoadingSpinner message="Loading dashboard data..." />;
  }

  if (!isApiConfigured) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />
        <ScrollView
          style={styles.scrollView}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
        >
          <View style={styles.welcomeSection}>
            <View style={styles.welcomeCard}>
              <Text style={styles.welcomeTitle}>Welcome to VOIP Application</Text>
              <Text style={styles.welcomeDescription}>
                Get started by configuring your API credentials to begin making and receiving calls.
              </Text>

              <View style={styles.welcomeFeatures}>
                <Text style={styles.featuresTitle}>Key Features:</Text>
                <View style={styles.featuresList}>
                  <View style={styles.featureItem}>
                    <Ionicons name="checkmark-circle" size={16} color="#48bb78" />
                    <Text style={styles.featureText}>HD Voice Calls with MediaSFU integration</Text>
                  </View>
                  <View style={styles.featureItem}>
                    <Ionicons name="checkmark-circle" size={16} color="#48bb78" />
                    <Text style={styles.featureText}>Real-time call monitoring and analytics</Text>
                  </View>
                  <View style={styles.featureItem}>
                    <Ionicons name="checkmark-circle" size={16} color="#48bb78" />
                    <Text style={styles.featureText}>Call recording and history tracking</Text>
                  </View>
                  <View style={styles.featureItem}>
                    <Ionicons name="checkmark-circle" size={16} color="#48bb78" />
                    <Text style={styles.featureText}>Advanced call management features</Text>
                  </View>
                  <View style={styles.featureItem}>
                    <Ionicons name="checkmark-circle" size={16} color="#48bb78" />
                    <Text style={styles.featureText}>HTTP-only API communication</Text>
                  </View>
                  <View style={styles.featureItem}>
                    <Ionicons name="checkmark-circle" size={16} color="#48bb78" />
                    <Text style={styles.featureText}>No backend dependency required</Text>
                  </View>
                </View>
              </View>

              <TouchableOpacity
                style={styles.welcomeButton}
                onPress={() => onNavigate('settings')}
              >
                <Text style={styles.welcomeButtonText}>Configure API Settings</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />

      {/* Main Container with max width for desktop */}
      <View style={[styles.mainContainer, isDesktop && styles.desktopContainer]}>
        {/* Dashboard Header */}
        <View style={[styles.header, isTablet && styles.headerLarge]}>
          <Text style={[styles.title, isTablet && styles.titleLarge]}>Dashboard</Text>
          <View style={styles.headerControls}>
            <View style={styles.liveUpdatesControl}>
              <Switch
                value={config.realtime.enabled}
                onValueChange={toggleRealtime}
                trackColor={{ false: '#ccc', true: '#667eea' }}
                thumbColor={config.realtime.enabled ? '#fff' : '#fff'}
              />
              <Text style={styles.toggleLabel}>Live Updates</Text>
            </View>
          </View>
        </View>

        <ScrollView
          style={styles.scrollView}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
        >
          {/* Dashboard Content */}
          <View style={[styles.dashboardContent, isDesktop && styles.dashboardContentDesktop]}>

            {/* Call Statistics Section */}
            <View style={[styles.statsSection, isDesktop && styles.statsSectionDesktop]}>
              <Text style={styles.sectionTitle}>Call Statistics</Text>

              {/* Main Stats Grid */}
              <View style={[styles.statsGrid, isTablet && styles.statsGridTablet]}>
                <View style={[styles.statCard, isTablet && styles.statCardLarge]}>
                  <View style={styles.statCardInner}>
                    <Text style={[styles.statNumber, isTablet && styles.statNumberLarge]}>
                      {callStats.activeCalls || 0}
                    </Text>
                    <Text style={styles.statLabel}>Active Calls</Text>
                  </View>
                </View>

                <View style={[styles.statCard, isTablet && styles.statCardLarge]}>
                  <View style={styles.statCardInner}>
                    <Text style={[styles.statNumber, isTablet && styles.statNumberLarge]}>
                      {callStats.todaysCalls || 0}
                    </Text>
                    <Text style={styles.statLabel}>Today's Calls</Text>
                  </View>
                </View>

                <View style={[styles.statCard, isTablet && styles.statCardLarge]}>
                  <View style={styles.statCardInner}>
                    <Text style={[styles.statNumber, isTablet && styles.statNumberLarge]}>
                      {callStats.averageDuration > 0
                        ? `${Math.floor(callStats.averageDuration / 60)}:${(callStats.averageDuration % 60).toString().padStart(2, '0')}`
                        : '0:00'
                      }
                    </Text>
                    <Text style={styles.statLabel}>Avg Duration</Text>
                  </View>
                </View>

                <View style={[styles.statCard, isTablet && styles.statCardLarge]}>
                  <View style={styles.statCardInner}>
                    <Text style={[styles.statNumber, isTablet && styles.statNumberLarge]}>
                      {Math.round(callStats.connectionRate || 0)}%
                    </Text>
                    <Text style={styles.statLabel}>Connection Rate</Text>
                  </View>
                </View>
              </View>

              {/* Detailed Statistics */}
              <View style={styles.detailedStats}>
                {/* Call Overview */}
                <View style={styles.statsRow}>
                  <Text style={styles.statsRowTitle}>Call Overview</Text>
                  <View style={styles.overviewStats}>
                    <View style={styles.overviewStat}>
                      <Text style={styles.overviewLabel}>Total Calls:</Text>
                      <Text style={styles.overviewValue}>{callStats.totalCalls || 0}</Text>
                    </View>
                    <View style={styles.overviewStat}>
                      <Text style={styles.overviewLabel}>Connected Calls:</Text>
                      <Text style={styles.overviewValue}>{callStats.connectedCalls || 0}</Text>
                    </View>
                    <View style={styles.overviewStat}>
                      <Text style={styles.overviewLabel}>Inbound Calls:</Text>
                      <Text style={styles.overviewValue}>{callStats.inboundCalls || 0}</Text>
                    </View>
                    <View style={styles.overviewStat}>
                      <Text style={styles.overviewLabel}>Outbound Calls:</Text>
                      <Text style={styles.overviewValue}>{callStats.outboundCalls || 0}</Text>
                    </View>
                    <View style={styles.overviewStat}>
                      <Text style={styles.overviewLabel}>Missed Calls:</Text>
                      <Text style={styles.overviewValue}>{callStats.missedCalls || 0}</Text>
                    </View>
                    <View style={styles.overviewStat}>
                      <Text style={styles.overviewLabel}>This Week:</Text>
                      <Text style={styles.overviewValue}>{callStats.thisWeeksCalls || 0}</Text>
                    </View>
                    <View style={styles.overviewStat}>
                      <Text style={styles.overviewLabel}>Total Talk Time:</Text>
                      <Text style={styles.overviewValue}>
                        {callStats.totalDuration > 0
                          ? `${Math.floor(callStats.totalDuration / 3600)}h ${Math.floor((callStats.totalDuration % 3600) / 60)}m`
                          : '0h 0m'
                        }
                      </Text>
                    </View>
                  </View>
                </View>

                {/* By Status */}
                <View style={styles.statsRow}>
                  <Text style={styles.statsRowTitle}>By Status</Text>
                  <View style={styles.statusBreakdown}>
                    <View style={styles.statusStat}>
                      <View style={[styles.statusIndicator, styles.statusActive]}>
                        <Text style={styles.statusText}>Active</Text>
                      </View>
                      <Text style={styles.countText}>{callStats.activeCalls || 0}</Text>
                    </View>
                    <View style={styles.statusStat}>
                      <View style={[styles.statusIndicator, styles.statusCompleted]}>
                        <Text style={styles.statusText}>Completed</Text>
                      </View>
                      <Text style={styles.countText}>{callStats.completedCalls || 0}</Text>
                    </View>
                    <View style={styles.statusStat}>
                      <View style={[styles.statusIndicator, styles.statusFailed]}>
                        <Text style={styles.statusText}>Failed</Text>
                      </View>
                      <Text style={styles.countText}>{callStats.failedCalls || 0}</Text>
                    </View>
                  </View>
                </View>

                {/* By Direction */}
                <View style={styles.statsRow}>
                  <Text style={styles.statsRowTitle}>By Direction</Text>
                  <View style={styles.statusBreakdown}>
                    <View style={styles.statusStat}>
                      <View style={[styles.statusIndicator, { backgroundColor: '#3182ce' }]}>
                        <Text style={styles.statusText}>Inbound</Text>
                      </View>
                      <Text style={styles.countText}>{callStats.inboundCalls || 0}</Text>
                    </View>
                    <View style={styles.statusStat}>
                      <View style={[styles.statusIndicator, { backgroundColor: '#805ad5' }]}>
                        <Text style={styles.statusText}>Outbound</Text>
                      </View>
                      <Text style={styles.countText}>{callStats.outboundCalls || 0}</Text>
                    </View>
                    <View style={styles.statusStat}>
                      <View style={[styles.statusIndicator, { backgroundColor: '#e53e3e' }]}>
                        <Text style={styles.statusText}>Missed</Text>
                      </View>
                      <Text style={styles.countText}>{callStats.missedCalls || 0}</Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>

            {/* Secondary Content Row - for desktop/tablet */}
            <View style={[styles.secondaryRow, isDesktop && styles.secondaryRowDesktop]}>

              {/* Active Calls Section */}
              <View style={[styles.activeCallsSection, isDesktop && styles.sectionDesktop]}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Active Calls</Text>
                  <View style={styles.callCount}>
                    <Text style={styles.callCountText}>{callStats.activeCalls || 0}</Text>
                  </View>
                </View>

                {(callStats.activeCalls || 0) > 0 ? (
                  <View style={styles.callsList}>
                    <Text style={styles.noDataText}>Active calls will appear here</Text>
                  </View>
                ) : (
                  <View style={styles.noData}>
                    <Text style={styles.noDataText}>No active calls</Text>
                    <TouchableOpacity
                      style={styles.noDataButton}
                      onPress={() => onNavigate('calls')}
                    >
                      <Text style={styles.noDataButtonText}>Make a Call</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* Quick Actions Section */}
              <View style={[styles.quickActionsSection, isDesktop && styles.sectionDesktop]}>
                <Text style={styles.sectionTitle}>Quick Actions</Text>
                <View style={[styles.actionsGrid, isTablet && styles.actionsGridTablet]}>
                  <TouchableOpacity
                    style={[styles.actionCard, isTablet && styles.actionCardLarge]}
                    onPress={() => onNavigate('calls')}
                  >
                    <View style={styles.actionCardInner}>
                      <Ionicons name="call" size={isTablet ? 32 : 24} color="#667eea" />
                      <Text style={styles.actionTitle}>Make Call</Text>
                      <Text style={styles.actionDescription}>Start a new voice call</Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionCard, isTablet && styles.actionCardLarge]}
                    onPress={() => onNavigate('history')}
                  >
                    <View style={styles.actionCardInner}>
                      <Ionicons name="time" size={isTablet ? 32 : 24} color="#667eea" />
                      <Text style={styles.actionTitle}>Call History</Text>
                      <Text style={styles.actionDescription}>View recent call logs</Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionCard, isTablet && styles.actionCardLarge]}
                    onPress={() => onNavigate('settings')}
                  >
                    <View style={styles.actionCardInner}>
                      <Ionicons name="settings" size={isTablet ? 32 : 24} color="#667eea" />
                      <Text style={styles.actionTitle}>Settings</Text>
                      <Text style={styles.actionDescription}>Configure preferences</Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionCard, isTablet && styles.actionCardLarge]}
                    onPress={handleRefresh}
                  >
                    <View style={styles.actionCardInner}>
                      <Ionicons name="refresh" size={isTablet ? 32 : 24} color="#667eea" />
                      <Text style={styles.actionTitle}>Refresh Data</Text>
                      <Text style={styles.actionDescription}>Update dashboard data</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* System Status Section */}
            <View style={[styles.systemStatusSection, isDesktop && styles.systemStatusSectionDesktop]}>
              <Text style={styles.sectionTitle}>System Status</Text>
              <View style={styles.statusItems}>
                <View style={styles.statusItem}>
                  <Text style={styles.statusLabel}>API Connection:</Text>
                  <Text style={[styles.statusValue, styles.statusSuccess]}>Connected</Text>
                </View>
                <View style={styles.statusItem}>
                  <Text style={styles.statusLabel}>MediaSFU Service:</Text>
                  <Text style={[styles.statusValue, styles.statusSuccess]}>Ready</Text>
                </View>
                <View style={styles.statusItem}>
                  <Text style={styles.statusLabel}>Real-time Updates:</Text>
                  <Text style={[styles.statusValue, config.realtime.enabled ? styles.statusSuccess : styles.statusWarning]}>
                    {config.realtime.enabled ? 'Enabled' : 'Disabled'}
                  </Text>
                </View>
                <View style={styles.statusItem}>
                  <Text style={styles.statusLabel}>Update Interval:</Text>
                  <Text style={styles.statusValue}>{config.realtime.interval / 1000}s</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Footer Spacing */}
          <View style={styles.footer} />
        </ScrollView>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  scrollView: {
    flex: 1,
  },
  mainContainer: {
    flex: 1,
  },
  desktopContainer: {
    maxWidth: 1200,
    alignSelf: 'center',
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  headerLarge: {
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#2d3748',
  },
  titleLarge: {
    fontSize: 32,
  },
  headerControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  liveUpdatesControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toggleLabel: {
    fontSize: 14,
    color: '#4a5568',
    fontWeight: '500',
  },

  // Welcome Section
  welcomeSection: {
    paddingHorizontal: 20,
    paddingVertical: 24,
    maxWidth: 800,
    alignSelf: 'center',
    width: '100%',
  },
  welcomeCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    alignItems: 'center',
  },
  welcomeTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: '#2d3748',
    marginBottom: 16,
    textAlign: 'center',
  },
  welcomeDescription: {
    fontSize: 18,
    color: '#4a5568',
    textAlign: 'center',
    lineHeight: 28,
    marginBottom: 32,
  },
  welcomeFeatures: {
    width: '100%',
    marginBottom: 32,
    backgroundColor: '#f7fafc',
    borderRadius: 12,
    padding: 24,
  },
  featuresTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#2d3748',
    marginBottom: 16,
  },
  featuresList: {
    gap: 12,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  featureText: {
    marginLeft: 12,
    fontSize: 16,
    color: '#4a5568',
    flex: 1,
  },
  welcomeButton: {
    backgroundColor: '#667eea',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: 'center',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  welcomeButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },

  // Dashboard Content
  dashboardContent: {
    padding: 16,
  },
  dashboardContentDesktop: {
    padding: 24,
  },

  // Statistics Section
  statsSection: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  statsSectionDesktop: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#2d3748',
    marginBottom: 20,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -8,
    marginBottom: 32,
  },
  statsGridTablet: {
    marginHorizontal: -12,
  },
  statCardLarge: {
    paddingHorizontal: 12,
    width: '25%',
  },
  statCardInner: {
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
    backgroundColor: '#667eea',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
    minHeight: 120,
    justifyContent: 'center',
  },
  statNumber: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  statNumberLarge: {
    fontSize: 36,
  },
  statLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.95)',
    textAlign: 'center',
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Update the statCard to include inner container
  statCard: {
    width: '50%',
    paddingHorizontal: 8,
    marginBottom: 16,
  },

  // Detailed Statistics
  detailedStats: {
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: 'rgba(102, 126, 234, 0.2)',
    gap: 24,
  },
  statsRow: {
    marginBottom: 20,
  },
  statsRowTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2d3748',
    marginBottom: 16,
  },
  overviewStats: {
    gap: 12,
  },
  overviewStat: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(102, 126, 234, 0.05)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(102, 126, 234, 0.1)',
  },
  overviewLabel: {
    fontSize: 14,
    color: '#4a5568',
    fontWeight: '500',
  },
  overviewValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#667eea',
  },
  statusBreakdown: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statusStat: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(102, 126, 234, 0.1)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(102, 126, 234, 0.2)',
  },
  statusIndicator: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 8,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
    textTransform: 'capitalize',
  },
  statusActive: {
    backgroundColor: '#4299e1',
  },
  statusCompleted: {
    backgroundColor: '#48bb78',
  },
  statusFailed: {
    backgroundColor: '#f56565',
  },
  countText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#667eea',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    minWidth: 20,
    textAlign: 'center',
  },

  // Secondary Row (for desktop layout)
  secondaryRow: {
    gap: 16,
  },
  secondaryRowDesktop: {
    flexDirection: 'row',
    gap: 24,
  },
  sectionDesktop: {
    flex: 1,
  },

  // Active Calls Section
  activeCallsSection: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  callCount: {
    backgroundColor: '#667eea',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  callCountText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  callsList: {
    padding: 16,
  },
  noData: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
  },
  noDataText: {
    fontSize: 16,
    color: '#4a5568',
    marginBottom: 20,
    textAlign: 'center',
  },
  noDataButton: {
    backgroundColor: '#667eea',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 2,
  },
  noDataButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },

  // Quick Actions Section
  quickActionsSection: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -8,
  },
  actionsGridTablet: {
    marginHorizontal: -12,
  },
  actionCard: {
    width: '50%',
    paddingHorizontal: 8,
    marginBottom: 16,
  },
  actionCardLarge: {
    paddingHorizontal: 12,
  },
  actionCardInner: {
    backgroundColor: '#f7fafc',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    minHeight: 120,
    justifyContent: 'center',
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2d3748',
    marginTop: 8,
    marginBottom: 4,
    textAlign: 'center',
  },
  actionDescription: {
    fontSize: 12,
    color: '#4a5568',
    textAlign: 'center',
    lineHeight: 16,
  },

  // System Status Section
  systemStatusSection: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  systemStatusSectionDesktop: {
    marginBottom: 24,
  },
  statusItems: {
    gap: 12,
  },
  statusItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  statusLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#4a5568',
  },
  statusValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  statusSuccess: {
    color: '#48bb78',
  },
  statusWarning: {
    color: '#ed8936',
  },
  statusError: {
    color: '#f56565',
  },

  footer: {
    height: 40,
  },
});

export default Dashboard;
