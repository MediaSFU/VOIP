import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/voip_config_provider.dart';
import '../providers/call_manager_provider.dart';
import '../providers/live_updates_provider.dart';
import '../types/call_types.dart';
import '../types/config_types.dart';

class DashboardPage extends StatefulWidget {
  final void Function(String) onNavigate;

  const DashboardPage({
    super.key,
    required this.onNavigate,
  });

  @override
  State<DashboardPage> createState() => _DashboardPageState();
}

class _DashboardPageState extends State<DashboardPage> {
  bool _didInit = false;
  @override
  void initState() {
    super.initState();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_didInit) return;
    _didInit = true;
    final configProvider =
        Provider.of<VoipConfigProvider>(context, listen: false);
    final callManagerProvider =
        Provider.of<CallManagerProvider>(context, listen: false);
    // Initialize providers synchronously here
    configProvider.initialize();
    callManagerProvider.initialize();
  }

  @override
  Widget build(BuildContext context) {
    return Consumer3<VoipConfigProvider, CallManagerProvider,
        LiveUpdatesProvider>(
      builder:
          (context, configProvider, callManagerProvider, liveUpdates, child) {
        final config = configProvider.config;
        final isConfigured =
            config.api.key.isNotEmpty && config.api.userName.isNotEmpty;

        return Scaffold(
          backgroundColor: Theme.of(context).scaffoldBackgroundColor,
          body: Center(
            child: Container(
              constraints: const BoxConstraints(maxWidth: 1200),
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SizedBox(height: 24),

                    // Dashboard Header - matching ReactJS .dashboard-header
                    _buildDashboardHeader(config),

                    const SizedBox(height: 32),

                    // Error Banner if any
                    if (callManagerProvider.error != null)
                      _buildErrorBanner(callManagerProvider.error!),

                    // Welcome Section for Unconfigured API
                    if (!isConfigured)
                      _buildWelcomeSection()
                    else ...[
                      // Main Dashboard Grid - matching ReactJS .dashboard-grid
                      _buildDashboardGrid(
                          callManagerProvider, config, liveUpdates),
                    ],

                    const SizedBox(height: 32),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  // Dashboard Header with title and controls - matching ReactJS .dashboard-header
  Widget _buildDashboardHeader(AppConfig config) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final isMobile = constraints.maxWidth < 600;

        if (isMobile) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Dashboard',
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                      fontWeight: FontWeight.w600,
                      color: Theme.of(context).brightness == Brightness.dark
                          ? const Color(0xFFE2E8F0)
                          : const Color(0xFF2D3748),
                    ),
              ),
              const SizedBox(height: 8),
              _buildDashboardControls(config),
            ],
          );
        }

        return Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Text(
              'Dashboard',
              style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                    color: Theme.of(context).brightness == Brightness.dark
                        ? const Color(0xFFE2E8F0)
                        : const Color(0xFF2D3748),
                  ),
            ),
            _buildDashboardControls(config),
          ],
        );
      },
    );
  }

  // Live Updates Control - matching ReactJS .live-updates-control
  Widget _buildDashboardControls(AppConfig config) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        _buildToggleSwitch(config),
        const SizedBox(width: 8),
        Text(
          'Live Updates',
          style: TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w500,
            color: Theme.of(context).brightness == Brightness.dark
                ? const Color(0xFFE2E8F0)
                : const Color(0xFF4A5568),
          ),
        ),
      ],
    );
  }

  // Custom toggle switch - matching ReactJS .toggle-switch
  Widget _buildToggleSwitch(AppConfig config) {
    return GestureDetector(
      onTap: () {
        Provider.of<VoipConfigProvider>(context, listen: false)
            .setRealtimeEnabled(!config.realtime.enabled);
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 400),
        width: 50,
        height: 24,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(24),
          color: config.realtime.enabled
              ? const Color(0xFF667EEA)
              : const Color(0xFFCCCCCC),
        ),
        child: AnimatedAlign(
          duration: const Duration(milliseconds: 400),
          alignment: config.realtime.enabled
              ? Alignment.centerRight
              : Alignment.centerLeft,
          child: Container(
            width: 18,
            height: 18,
            margin: const EdgeInsets.all(3),
            decoration: const BoxDecoration(
              color: Colors.white,
              shape: BoxShape.circle,
            ),
          ),
        ),
      ),
    );
  }

  // Error Banner - matching ReactJS .error-banner
  Widget _buildErrorBanner(String error) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      margin: const EdgeInsets.only(bottom: 32),
      decoration: BoxDecoration(
        color: Theme.of(context).brightness == Brightness.dark
            ? const Color(0xFF742A2A)
            : const Color(0xFFFED7D7),
        borderRadius: BorderRadius.circular(8),
        border: const Border(
          left: BorderSide(
            color: Color(0xFFF56565),
            width: 4,
          ),
        ),
      ),
      child: Text(
        '⚠️ $error',
        style: TextStyle(
          color: Theme.of(context).brightness == Brightness.dark
              ? const Color(0xFFFED7D7)
              : const Color(0xFF742A2A),
        ),
      ),
    );
  }

  // Welcome Section for unconfigured API - matching ReactJS welcome section
  Widget _buildWelcomeSection() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(32),
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.1),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Welcome to VOIP Application',
            style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
          ),
          const SizedBox(height: 8),
          Text(
            'Get started by configuring your API credentials to begin making and receiving calls.',
            style: Theme.of(context).textTheme.bodyLarge,
          ),
          const SizedBox(height: 24),

          // Key Features
          Text(
            'Key Features:',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
          ),
          const SizedBox(height: 12),

          ..._buildFeatureList(),

          const SizedBox(height: 32),

          // Configure Button
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: () => widget.onNavigate('settings'),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF667EEA),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
              ),
              child: const Text(
                'Configure API Settings',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  List<Widget> _buildFeatureList() {
    final features = [
      '✅ HD Voice Calls with MediaSFU integration',
      '✅ Real-time call monitoring and analytics',
      '✅ Call recording and history tracking',
      '✅ Advanced call management features',
      '✅ HTTP-only API communication',
      '✅ No backend dependency required',
    ];

    return features
        .map((feature) => Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Text(
                feature,
                style: Theme.of(context).textTheme.bodyMedium,
              ),
            ))
        .toList();
  }

  // Main Dashboard Grid - matching ReactJS .dashboard-grid with responsive breakpoints
  Widget _buildDashboardGrid(CallManagerProvider callManagerProvider,
      AppConfig config, LiveUpdatesProvider liveUpdates) {
    return LayoutBuilder(
      builder: (context, constraints) {
        // Responsive breakpoints matching ReactJS CSS
        final isDesktop = constraints.maxWidth > 1024;
        final isTablet =
            constraints.maxWidth > 768 && constraints.maxWidth <= 1024;

        return Column(
          children: [
            // Stats Section (spans full width) - matching ReactJS .stats-section
            _buildStatsSection(
                callManagerProvider, liveUpdates, constraints.maxWidth),
            const SizedBox(height: 32),

            // Responsive grid layout
            if (isDesktop) ...[
              // Desktop: 2 columns for other sections
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      children: [
                        _buildActiveCallsSection(
                            callManagerProvider, liveUpdates),
                        const SizedBox(height: 32),
                        _buildQuickActionsSection(),
                      ],
                    ),
                  ),
                  const SizedBox(width: 32),
                  Expanded(child: _buildSystemStatusSection(config)),
                ],
              ),
            ] else if (isTablet) ...[
              // Tablet: Stack vertically but with some 2-column layouts
              _buildActiveCallsSection(callManagerProvider, liveUpdates),
              const SizedBox(height: 24),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(child: _buildQuickActionsSection()),
                  const SizedBox(width: 24),
                  Expanded(child: _buildSystemStatusSection(config)),
                ],
              ),
            ] else ...[
              // Mobile: 1 column stack
              _buildActiveCallsSection(callManagerProvider, liveUpdates),
              const SizedBox(height: 24),
              _buildQuickActionsSection(),
              const SizedBox(height: 24),
              _buildSystemStatusSection(config),
            ],
          ],
        );
      },
    );
  }

  // Stats Section - matching ReactJS .stats-section with responsive grid
  Widget _buildStatsSection(CallManagerProvider callManagerProvider,
      LiveUpdatesProvider liveUpdates, double screenWidth) {
    // Prefer provider stats; fallback to live updates if provider stats are null or all-zero
    CallStats? stats = callManagerProvider.callStats;
    int activeCalls = callManagerProvider.activeCalls.length;

    bool isZeroStats(CallStats? s) =>
        s == null ||
        (s.total == 0 &&
            s.todaysCalls == 0 &&
            s.connectedCalls == 0 &&
            s.averageDuration == 0);

    if (isZeroStats(stats) && liveUpdates.liveStats != null) {
      stats = liveUpdates.liveStats;
    }

    // Active calls fallback from live updates when provider has none
    if (activeCalls == 0 && liveUpdates.getActiveCalls().isNotEmpty) {
      activeCalls = liveUpdates.getActiveCalls().length;
    }

    if (stats == null) {
      // Show loading state while stats are being calculated
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Theme.of(context).cardColor,
          borderRadius: BorderRadius.circular(12),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.1),
              blurRadius: 10,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: const Center(
          child: CircularProgressIndicator(),
        ),
      );
    }

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.1),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Call Statistics',
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
          ),
          const SizedBox(height: 24),

          // Responsive stats grid - matching ReactJS .stats-grid
          _buildStatsGrid(screenWidth, [
            _StatItem(
              label: 'Active Calls',
              value: activeCalls.toString(),
            ),
            _StatItem(
              label: "Today's Calls",
              value: stats.todaysCalls.toString(),
            ),
            _StatItem(
              label: 'Avg Duration',
              value: stats.averageDuration > 0
                  ? '${stats.averageDuration ~/ 60}:${(stats.averageDuration % 60).toString().padLeft(2, '0')}'
                  : '0:00',
            ),
            _StatItem(
              label: 'Connection Rate',
              value: '${stats.connectionRate}%',
            ),
          ]),
        ],
      ),
    );
  }

  // Responsive stats grid matching ReactJS breakpoints
  Widget _buildStatsGrid(double screenWidth, List<_StatItem> stats) {
    int columns;
    double gap;

    // Responsive columns - improved mobile layout with 2x2 grid
    if (screenWidth <= 480) {
      columns = 2; // Mobile: 2x2 grid for better space utilization
      gap = 6; // Reduced gap for mobile to fit better
    } else if (screenWidth <= 768) {
      columns = 2; // Tablet: 2 columns
      gap = 12;
    } else {
      columns = 4; // Desktop: 4 columns
      gap = 18;
    }

    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: columns,
        crossAxisSpacing: gap,
        mainAxisSpacing: gap,
        childAspectRatio:
            screenWidth <= 480 ? 1.0 : 1.1, // More height on very small screens
      ),
      itemCount: stats.length,
      itemBuilder: (context, index) => _buildStatCard(stats[index]),
    );
  }

  // Individual stat card with gradient - matching ReactJS .stat-item
  Widget _buildStatCard(_StatItem stat) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final isSmall = constraints.maxWidth < 120;
        return MouseRegion(
          cursor: SystemMouseCursors.click,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0xFF667EEA), Color(0xFF764BA2)],
              ),
              borderRadius: BorderRadius.circular(12),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.1),
                  blurRadius: 10,
                  offset: const Offset(0, 4),
                ),
              ],
              border: Border.all(
                color: Colors.white.withValues(alpha: 0.1),
                width: 1,
              ),
            ),
            child: Material(
              color: Colors.transparent,
              child: InkWell(
                borderRadius: BorderRadius.circular(12),
                onTap: () {},
                child: Container(
                  padding: EdgeInsets.symmetric(
                    horizontal: isSmall ? 10 : 16,
                    vertical: isSmall ? 10 : 16,
                  ), // Tighter padding for very small cards
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        stat.value,
                        style: TextStyle(
                          fontSize: isSmall ? 18 : 32, // Smaller on tiny cards
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                          height: isSmall ? 1.0 : 1.1, // Tighten line height
                          shadows: const [
                            Shadow(
                              color: Colors.black26,
                              offset: Offset(0, 2),
                              blurRadius: 4,
                            ),
                          ],
                        ),
                        textAlign: TextAlign.center,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      SizedBox(
                          height:
                              isSmall ? 2 : 8), // Minimal spacing for mobile
                      Text(
                        stat.label.toUpperCase(),
                        style: TextStyle(
                          fontSize: isSmall ? 8 : 13, // Smaller on tiny cards
                          fontWeight: FontWeight.w500,
                          color: Colors.white.withValues(alpha: 0.95),
                          letterSpacing: 0.5,
                          height: isSmall ? 1.0 : 1.15, // Tighten line height
                          shadows: const [
                            Shadow(
                              color: Colors.black26,
                              offset: Offset(0, 1),
                              blurRadius: 2,
                            ),
                          ],
                        ),
                        textAlign: TextAlign.center,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  // Active Calls Section - matching ReactJS .active-calls-section
  Widget _buildActiveCallsSection(CallManagerProvider callManagerProvider,
      LiveUpdatesProvider liveUpdates) {
    var activeCalls = callManagerProvider.calls
        .where((c) =>
            c.status == CallStatus.active ||
            c.status == CallStatus.ringing ||
            c.status == CallStatus.connecting)
        .toList();

    if (activeCalls.isEmpty) {
      // Fallback to live updates active calls to avoid empty UI
      activeCalls = liveUpdates.getActiveCalls();
    }

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.1),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Section header - matching ReactJS .section-header
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Active Calls',
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
              ),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                decoration: BoxDecoration(
                  color: const Color(0xFF667EEA),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  activeCalls.length.toString(),
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w600,
                    fontSize: 12,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),

          if (activeCalls.isEmpty)
            _buildNoActiveCalls()
          else
            _buildActiveCallsList(activeCalls),
        ],
      ),
    );
  }

  Widget _buildNoActiveCalls() {
    return Column(
      children: [
        const SizedBox(height: 32),
        Text(
          'No active calls',
          style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                color: Colors.grey[600],
              ),
        ),
        const SizedBox(height: 8),
        ElevatedButton(
          onPressed: () => widget.onNavigate('calls'),
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFF667EEA),
            foregroundColor: Colors.white,
          ),
          child: const Text('Make a Call'),
        ),
        const SizedBox(height: 32),
      ],
    );
  }

  Widget _buildActiveCallsList(List<Call> calls) {
    return Column(
      children: calls
          .map((call) => Container(
                margin: const EdgeInsets.only(bottom: 12),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Theme.of(context).brightness == Brightness.dark
                      ? Colors.grey[800]
                      : Colors.grey[50],
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    // Distinct border colors by direction: outgoing vs incoming
                    color: _getDirectionBorderColor(call.direction),
                  ),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${_getFromLabel(call)} → ${_getToLabel(call)}',
                            style: Theme.of(context)
                                .textTheme
                                .titleMedium
                                ?.copyWith(
                                  fontWeight: FontWeight.w600,
                                ),
                          ),
                          const SizedBox(height: 4),
                          Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 8, vertical: 2),
                                decoration: BoxDecoration(
                                  color: _getStatusColor(call.status),
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: Text(
                                  call.status.name.toUpperCase(),
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 10,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                              const SizedBox(width: 8),
                              Text(
                                call.durationSeconds > 0
                                    ? '${call.durationSeconds ~/ 60}:${(call.durationSeconds % 60).toString().padLeft(2, '0')}'
                                    : 'Starting...',
                                style: Theme.of(context)
                                    .textTheme
                                    .bodySmall
                                    ?.copyWith(
                                      color: Colors.grey[600],
                                    ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    ElevatedButton(
                      onPressed: () => _handleEndCall(call),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.red,
                        foregroundColor: Colors.white,
                        minimumSize: const Size(80, 36),
                      ),
                      child: const Text('End Call'),
                    ),
                  ],
                ),
              ))
          .toList(),
    );
  }

  Color _getStatusColor(CallStatus status) {
    switch (status) {
      case CallStatus.active:
        return Colors.green;
      case CallStatus.ringing:
        return Colors.orange;
      case CallStatus.connecting:
        return Colors.blue;
      default:
        return Colors.grey;
    }
  }

  // Distinct border color by direction
  Color _getDirectionBorderColor(CallDirection direction) {
    switch (direction) {
      case CallDirection.outgoing:
      case CallDirection.outbound:
        return const Color(0xFF3182CE); // blue for outgoing
      case CallDirection.incoming:
      case CallDirection.inbound:
        return const Color(0xFF38A169); // green for incoming
    }
  }

  // Parse labels with fallbacks aligned to voip_reactjs logic
  String _getFromLabel(Call call) {
    // Prefer parsed 'from' or callerName; for outgoing, fallback to current user label
    final from = call.from?.trim();
    if (from != null && from.isNotEmpty) return from;
    final callerName = call.callerName?.trim();
    if (callerName != null && callerName.isNotEmpty) return callerName;

    // For outgoing, React shows the initiator (current user). We don’t track user here, so use "You"
    if (call.direction == CallDirection.outgoing ||
        call.direction == CallDirection.outbound) {
      return 'You';
    }
    // Incoming fallback
    return 'Unknown';
  }

  String _getToLabel(Call call) {
    // Prefer parsed 'to' or phoneNumber; for incoming, fallback to Unknown Caller
    final to = call.to?.trim();
    if (to != null && to.isNotEmpty) return to;
    final number = call.phoneNumber?.trim();
    if (number != null && number.isNotEmpty) return number;

    // Try to extract from calledUri (e.g., sip:+1234)
    final uri = call.calledUri.trim();
    if (uri.isNotEmpty) {
      final match = RegExp(r"[+\d]{6,}").firstMatch(uri);
      if (match != null) return match.group(0)!;
    }

    // Outgoing: Unknown Caller (per ref), Incoming: Unknown
    if (call.direction == CallDirection.outgoing ||
        call.direction == CallDirection.outbound) {
      return 'Unknown Caller';
    }
    return 'Unknown';
  }

  // Quick Actions Section - matching ReactJS .quick-actions-section
  Widget _buildQuickActionsSection() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.1),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Quick Actions',
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
          ),
          const SizedBox(height: 8),

          // Actions grid - matching ReactJS .actions-grid
          LayoutBuilder(
            builder: (context, constraints) {
              final crossAxisCount = constraints.maxWidth > 400 ? 2 : 1;

              return GridView.count(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                crossAxisCount: crossAxisCount,
                crossAxisSpacing: 16,
                mainAxisSpacing: 16,
                childAspectRatio: 2.5,
                children: [
                  _buildActionButton(
                    '📞 Make Call',
                    () => widget.onNavigate('calls'),
                    isPrimary: true,
                  ),
                  _buildActionButton(
                    '📋 Call History',
                    () => widget.onNavigate('history'),
                  ),
                  _buildActionButton(
                    '⚙️ Settings',
                    () => widget.onNavigate('settings'),
                  ),
                  _buildActionButton(
                    '🔄 Refresh Data',
                    _refreshData,
                  ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }

  Future<void> _refreshData() async {
    final callManagerProvider =
        Provider.of<CallManagerProvider>(context, listen: false);

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Refreshing…')),
    );

    try {
      await callManagerProvider.loadCallHistory();
      await callManagerProvider.refreshCallStats();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Data refreshed')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to refresh: $e')),
      );
    }
  }

  Future<void> _handleEndCall(Call call) async {
    final callManagerProvider =
        Provider.of<CallManagerProvider>(context, listen: false);

    String? callId;
    final sip = call.sipCallId.trim().toLowerCase();
    if (sip.isNotEmpty && sip.startsWith('prod')) {
      callId = call.sipCallId;
    } else {
      final id = (call.id ?? '').trim().toLowerCase();
      if (id.isNotEmpty && id.startsWith('prod')) {
        callId = call.id;
      }
    }

    if (callId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
            content: Text('Cannot end this call (no valid production ID)')),
      );
      return;
    }

    final ok = await callManagerProvider.hangupCall(callId);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(ok ? 'Call ended' : 'Failed to end call'),
      ),
    );
  }

  Widget _buildActionButton(String text, VoidCallback onPressed,
      {bool isPrimary = false}) {
    return ElevatedButton(
      onPressed: onPressed,
      style: ElevatedButton.styleFrom(
        backgroundColor: isPrimary
            ? const Color(0xFF667EEA)
            : Theme.of(context).colorScheme.surfaceContainerHighest,
        foregroundColor: isPrimary
            ? Colors.white
            : Theme.of(context).colorScheme.onSurfaceVariant,
        elevation: 2,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(8),
        ),
      ),
      child: Text(
        text,
        style: const TextStyle(
          fontWeight: FontWeight.w500,
          fontSize: 14,
        ),
        textAlign: TextAlign.center,
      ),
    );
  }

  // System Status Section - matching ReactJS .system-status-section
  Widget _buildSystemStatusSection(AppConfig config) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.1),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'System Status',
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
          ),
          const SizedBox(height: 8),
          Column(
            children: [
              _buildStatusItem('API Connection', '✅ Connected', true),
              _buildStatusItem('MediaSFU Service', '✅ Ready', true),
              _buildStatusItem(
                'Real-time Updates',
                config.realtime.enabled ? '✅ Enabled' : '⚠️ Disabled',
                config.realtime.enabled,
              ),
              _buildStatusItem(
                'Update Interval',
                '${config.realtime.interval ~/ 1000}s',
                true,
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildStatusItem(String label, String value, bool isGood) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 8),
      decoration: BoxDecoration(
        border: Border(
          bottom: BorderSide(
            color: Theme.of(context).dividerColor.withValues(alpha: 0.3),
            width: 1,
          ),
        ),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          Text(
            value,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: isGood
                      ? (Theme.of(context).brightness == Brightness.dark
                          ? const Color(0xFF9F7AEA)
                          : const Color(0xFF667EEA))
                      : Theme.of(context).colorScheme.error,
                  fontWeight: FontWeight.w600,
                ),
          ),
        ],
      ),
    );
  }
}

// Helper class for stat items
class _StatItem {
  final String label;
  final String value;

  _StatItem({required this.label, required this.value});
}
