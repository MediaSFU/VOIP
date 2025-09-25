// Call History Page - Responsive Flutter equivalent of CallHistoryPage.tsx
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/voip_config_provider.dart';
import '../providers/call_manager_provider.dart';
import '../types/call_types.dart';

class CallHistoryPage extends StatefulWidget {
  const CallHistoryPage({super.key});

  @override
  State<CallHistoryPage> createState() => _CallHistoryPageState();
}

class _CallHistoryPageState extends State<CallHistoryPage>
    with TickerProviderStateMixin {
  // Animation controller for smooth transitions
  late AnimationController _animationController;
  late Animation<double> _fadeAnimation;

  // Filter and search state - matching ReactJS CallHistoryPage
  String _filterStatus = 'all';
  String _filterDirection = 'all';
  String _searchTerm = '';
  final TextEditingController _searchController = TextEditingController();

  // Selection state for bulk operations
  Set<String> _selectedCalls = <String>{};

  // Confirmation modal state
  bool _showConfirmation = false;
  Map<String, dynamic>? _confirmationConfig;

  @override
  void initState() {
    super.initState();
    _animationController = AnimationController(
      duration: const Duration(milliseconds: 300),
      vsync: this,
    );
    _fadeAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _animationController, curve: Curves.easeInOut),
    );
    _animationController.forward();
  }

  @override
  void dispose() {
    _animationController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  // Check if API is configured - matching ReactJS pattern
  bool get _isApiConfigured {
    final config = context.read<VoipConfigProvider>().config;
    return config.api.key.isNotEmpty && config.api.userName.isNotEmpty;
  }

  // Get call statistics - matching ReactJS getCallHistoryStats()
  Map<String, dynamic> _getStats(List<Call> callHistory) {
    final total = callHistory.length;
    final byStatus = <String, int>{};
    final byDirection = <String, int>{};
    int totalDuration = 0;
    int connectedCalls = 0;

    for (final call in callHistory) {
      // Count by status
      final status = _getCallStatusString(call);
      byStatus[status] = (byStatus[status] ?? 0) + 1;

      // Count by direction
      final direction =
          call.direction == CallDirection.incoming ? 'inbound' : 'outbound';
      byDirection[direction] = (byDirection[direction] ?? 0) + 1;

      // Add duration for successful calls
      if (call.status == CallStatus.active || call.status == CallStatus.ended) {
        totalDuration += call.durationSeconds;
        connectedCalls++;
      }
    }

    return {
      'total': total,
      'byStatus': byStatus,
      'byDirection': byDirection,
      'totalDuration': totalDuration,
      'connectedCalls': connectedCalls,
    };
  }

  // Get call status string - matching ReactJS getCallStatus()
  String _getCallStatusString(Call call) {
    if (call.callEnded) return 'ended';
    return call.status.name;
  }

  // Get status color - matching ReactJS getStatusColor()
  Color _getStatusColor(String status) {
    switch (status) {
      case 'connected':
        return const Color(0xFF28a745);
      case 'ended':
        return const Color(0xFF6c757d);
      case 'failed':
        return const Color(0xFFdc3545);
      case 'rejected':
        return const Color(0xFFdc3545);
      case 'ringing':
        return const Color(0xFFffc107);
      default:
        return const Color(0xFF6c757d);
    }
  }

  // Filter calls based on search and filter criteria - matching ReactJS
  List<Call> _filterCalls(List<Call> callHistory) {
    return callHistory.where((call) {
      // Filter by status
      final status = _getCallStatusString(call);
      final matchesStatus = _filterStatus == 'all' || status == _filterStatus;

      // Filter by direction
      final direction =
          call.direction == CallDirection.incoming ? 'inbound' : 'outbound';
      final matchesDirection =
          _filterDirection == 'all' || direction == _filterDirection;

      // Filter by search term
      final matchesSearch = _searchTerm.isEmpty ||
          call.callerIdRaw.toLowerCase().contains(_searchTerm.toLowerCase()) ||
          call.calledUri.toLowerCase().contains(_searchTerm.toLowerCase()) ||
          call.sipCallId.toLowerCase().contains(_searchTerm.toLowerCase());

      return matchesStatus && matchesDirection && matchesSearch;
    }).toList();
  }

  // Format duration - matching ReactJS formatDuration()
  String _formatDuration(int? seconds) {
    if (seconds == null || seconds == 0) return 'N/A';
    final minutes = seconds ~/ 60;
    final secs = seconds % 60;
    return '$minutes:${secs.toString().padLeft(2, '0')}';
  }

  // Format date - matching ReactJS formatDate()
  String _formatDate(String? isoString) {
    if (isoString == null) return 'N/A';
    try {
      final date = DateTime.parse(isoString);
      return '${date.day.toString().padLeft(2, '0')}/${date.month.toString().padLeft(2, '0')}/${date.year}';
    } catch (e) {
      return 'Invalid Date';
    }
  }

  // Format time - matching ReactJS time formatting
  String _formatTime(String? isoString) {
    if (isoString == null) return 'N/A';
    try {
      final date = DateTime.parse(isoString);
      return '${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}';
    } catch (e) {
      return 'Invalid Time';
    }
  }

  // Extract clean identifier - matching ReactJS extractCleanIdentifier()
  String _extractCleanIdentifier(String identifier) {
    // Remove SIP URI components and keep only the number/user part
    return identifier.replaceAll(RegExp(r'<sip:|sip:|@.*|>'), '');
  }

  // Redial handler: initiate a new call based on previous call details
  Future<void> _handleRedial(Call call) async {
    final messenger = ScaffoldMessenger.of(context);
    if (!_isApiConfigured) {
      messenger.showSnackBar(
        const SnackBar(content: Text('API not configured')),
      );
      return;
    }

    try {
      // Decide target number: for outbound, use calledUri/phoneNumber; for inbound, use callerId
      String targetNumber;
      if (call.direction == CallDirection.outgoing ||
          call.direction == CallDirection.outbound) {
        targetNumber =
            call.phoneNumber ?? _extractCleanIdentifier(call.calledUri);
      } else {
        targetNumber = _extractCleanIdentifier(call.callerIdRaw);
      }

      targetNumber = targetNumber.trim();
      if (targetNumber.isEmpty) {
        messenger.showSnackBar(
          const SnackBar(content: Text('Cannot redial: missing number')),
        );
        return;
      }

      messenger.showSnackBar(
        SnackBar(content: Text('Dialing $targetNumber…')),
      );

      final callManager = context.read<CallManagerProvider>();
      final ok = await callManager.makeCall(phoneNumber: targetNumber);

      if (ok) {
        messenger.showSnackBar(
          const SnackBar(content: Text('Call initiated')),
        );
      } else {
        final err = callManager.error ?? 'Failed to initiate call';
        messenger.showSnackBar(
          SnackBar(content: Text(err)),
        );
      }
    } catch (e) {
      messenger.showSnackBar(
        SnackBar(content: Text('Redial failed: $e')),
      );
    }
  }

  // Toggle call selection
  void _toggleCallSelection(String sipCallId) {
    setState(() {
      if (_selectedCalls.contains(sipCallId)) {
        _selectedCalls.remove(sipCallId);
      } else {
        _selectedCalls.add(sipCallId);
      }
    });
  }

  // Select all calls
  void _selectAllCalls(List<Call> filteredHistory) {
    setState(() {
      _selectedCalls = filteredHistory.map((call) => call.sipCallId).toSet();
    });
  }

  // Clear selected calls
  void _clearSelectedCalls() {
    if (_selectedCalls.isEmpty) return;

    setState(() {
      _confirmationConfig = {
        'title': 'Clear Selected Calls',
        'message':
            'Are you sure you want to delete ${_selectedCalls.length} selected calls? This action cannot be undone.',
        'type': 'warning',
        'onConfirm': () {
          final callManager = context.read<CallManagerProvider>();
          for (final callId in _selectedCalls) {
            callManager.removeCall(callId);
          }
          setState(() {
            _selectedCalls.clear();
            _showConfirmation = false;
          });
        },
      };
      _showConfirmation = true;
    });
  }

  // Clear all calls
  void _clearAllCalls() {
    setState(() {
      _confirmationConfig = {
        'title': 'Clear All History',
        'message':
            'Are you sure you want to clear all call history? This action cannot be undone.',
        'type': 'danger',
        'onConfirm': () {
          final callManager = context.read<CallManagerProvider>();
          callManager.clearAllCalls();
          setState(() {
            _selectedCalls.clear();
            _showConfirmation = false;
          });
        },
      };
      _showConfirmation = true;
    });
  }

  // Build responsive stats grid - matching ReactJS history-stats
  Widget _buildStatsGrid(
      Map<String, dynamic> stats, bool isDesktop, bool isTablet) {
    return Container(
      margin: const EdgeInsets.only(bottom: 24),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final crossAxisCount = isDesktop ? 4 : (isTablet ? 3 : 2);
          final childAspectRatio = isDesktop
              ? 3.5
              : (isTablet ? 3.0 : 2.8); // Slightly taller for mobile
          final spacing = isDesktop
              ? 12.0
              : (isTablet ? 8.0 : 6.0); // Reduced spacing for mobile

          return GridView.count(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisCount: crossAxisCount,
            crossAxisSpacing: spacing,
            mainAxisSpacing: spacing,
            childAspectRatio: childAspectRatio,
            children: [
              _buildStatCard('Total Calls', (stats['total'] as int).toString(),
                  Icons.call, Colors.blue),
              _buildStatCard(
                  'Connected',
                  (stats['connectedCalls'] as int).toString(),
                  Icons.call_received,
                  Colors.green),
              _buildStatCard(
                  'Total Duration',
                  _formatDuration(stats['totalDuration'] as int),
                  Icons.access_time,
                  Colors.orange),
              _buildStatCard(
                  'Avg Duration',
                  _formatDuration((stats['connectedCalls'] as int) > 0
                      ? ((stats['totalDuration'] as int) /
                              (stats['connectedCalls'] as int))
                          .round()
                      : 0),
                  Icons.trending_up,
                  Colors.purple),
            ],
          );
        },
      ),
    );
  }

  // Build stat card with gradient - matching ReactJS .stat-item
  Widget _buildStatCard(
      String label, String value, IconData icon, Color color) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final isSmall = constraints.maxWidth < 480;
        return Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                color.withValues(alpha: 0.1),
                color.withValues(alpha: 0.05),
              ],
            ),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: color.withValues(alpha: 0.2)),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.05),
                blurRadius: 10,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Padding(
            padding: EdgeInsets.all(
                isSmall ? 8 : 16), // Reduced padding for small cards
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(icon,
                    color: color,
                    size: isSmall ? 8 : 12), // Even smaller icon for mobile
                SizedBox(height: isSmall ? 2 : 4), // Minimal spacing for mobile
                Flexible(
                  child: Text(
                    value,
                    style: TextStyle(
                      fontSize: isSmall ? 12 : 18, // Smaller font for mobile
                      fontWeight: FontWeight.bold,
                      color: color,
                    ),
                    textAlign: TextAlign.center,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                SizedBox(
                    height:
                        isSmall ? 1 : 4), // Ultra minimal spacing for mobile
                Flexible(
                  child: Text(
                    label,
                    style: TextStyle(
                      fontSize: isSmall ? 10 : 14, // Smaller font for mobile
                      color: Colors.grey.shade600,
                      fontWeight: FontWeight.w500,
                    ),
                    textAlign: TextAlign.center,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  // Build responsive controls - matching ReactJS history-controls
  Widget _buildControls(List<Call> callHistory, List<Call> filteredCalls,
      bool isDesktop, bool isTablet) {
    final stats = _getStats(callHistory);

    return Container(
      margin: const EdgeInsets.only(bottom: 24),
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.grey.shade300),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Top row - Search and Filters
          Flex(
            direction: isDesktop ? Axis.horizontal : Axis.vertical,
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Search section
              Flexible(
                flex: isDesktop ? 2 : 1,
                fit: FlexFit.loose,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Search History',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: Colors.grey.shade700,
                      ),
                    ),
                    const SizedBox(height: 8),
                    TextFormField(
                      controller: _searchController,
                      decoration: InputDecoration(
                        hintText: 'Search by number, caller ID, or call ID...',
                        prefixIcon: const Icon(Icons.search, size: 20),
                        suffixIcon: _searchTerm.isNotEmpty
                            ? IconButton(
                                icon: const Icon(Icons.clear, size: 18),
                                onPressed: () {
                                  setState(() {
                                    _searchController.clear();
                                    _searchTerm = '';
                                  });
                                },
                              )
                            : null,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: BorderSide(color: Colors.grey.shade300),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: BorderSide(color: Colors.grey.shade300),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide:
                              const BorderSide(color: Colors.blue, width: 2),
                        ),
                        contentPadding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 12),
                      ),
                      onChanged: (value) {
                        setState(() {
                          _searchTerm = value;
                        });
                      },
                    ),
                  ],
                ),
              ),

              if (isDesktop) const SizedBox(width: 32),
              if (!isDesktop) const SizedBox(height: 24),

              // Filter section
              Flexible(
                flex: isDesktop ? 1 : 1,
                fit: FlexFit.loose,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Filters',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: Colors.grey.shade700,
                      ),
                    ),
                    const SizedBox(height: 8),
                    isDesktop
                        ? Row(
                            children: [
                              Expanded(
                                child: DropdownButtonFormField<String>(
                                  isExpanded: true,
                                  initialValue: _filterStatus,
                                  decoration: InputDecoration(
                                    border: OutlineInputBorder(
                                      borderRadius: BorderRadius.circular(12),
                                      borderSide: BorderSide(
                                          color: Colors.grey.shade300),
                                    ),
                                    contentPadding: const EdgeInsets.symmetric(
                                        horizontal: 12, vertical: 8),
                                  ),
                                  items: [
                                    const DropdownMenuItem(
                                        value: 'all',
                                        child: Text('All Statuses')),
                                    ...(stats['byStatus'] as Map<String, int>)
                                        .keys
                                        .map<DropdownMenuItem<String>>(
                                            (String status) =>
                                                DropdownMenuItem<String>(
                                                    value: status,
                                                    child: Text(status))),
                                  ],
                                  onChanged: (value) {
                                    setState(() {
                                      _filterStatus = value ?? 'all';
                                    });
                                  },
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: DropdownButtonFormField<String>(
                                  isExpanded: true,
                                  initialValue: _filterDirection,
                                  decoration: InputDecoration(
                                    border: OutlineInputBorder(
                                      borderRadius: BorderRadius.circular(12),
                                      borderSide: BorderSide(
                                          color: Colors.grey.shade300),
                                    ),
                                    contentPadding: const EdgeInsets.symmetric(
                                        horizontal: 12, vertical: 8),
                                  ),
                                  items: const [
                                    DropdownMenuItem(
                                        value: 'all',
                                        child: Text('All Directions')),
                                    DropdownMenuItem(
                                        value: 'inbound',
                                        child: Text('Inbound')),
                                    DropdownMenuItem(
                                        value: 'outbound',
                                        child: Text('Outbound')),
                                  ],
                                  onChanged: (value) {
                                    setState(() {
                                      _filterDirection = value ?? 'all';
                                    });
                                  },
                                ),
                              ),
                            ],
                          )
                        : Column(
                            children: [
                              DropdownButtonFormField<String>(
                                isExpanded: true,
                                initialValue: _filterStatus,
                                decoration: InputDecoration(
                                  border: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(12),
                                    borderSide:
                                        BorderSide(color: Colors.grey.shade300),
                                  ),
                                  contentPadding: const EdgeInsets.symmetric(
                                      horizontal: 12, vertical: 8),
                                ),
                                items: [
                                  const DropdownMenuItem(
                                      value: 'all',
                                      child: Text('All Statuses')),
                                  ...(stats['byStatus'] as Map<String, int>)
                                      .keys
                                      .map<DropdownMenuItem<String>>(
                                          (String status) =>
                                              DropdownMenuItem<String>(
                                                  value: status,
                                                  child: Text(status))),
                                ],
                                onChanged: (value) {
                                  setState(() {
                                    _filterStatus = value ?? 'all';
                                  });
                                },
                              ),
                              const SizedBox(height: 12),
                              DropdownButtonFormField<String>(
                                isExpanded: true,
                                initialValue: _filterDirection,
                                decoration: InputDecoration(
                                  border: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(12),
                                    borderSide:
                                        BorderSide(color: Colors.grey.shade300),
                                  ),
                                  contentPadding: const EdgeInsets.symmetric(
                                      horizontal: 12, vertical: 8),
                                ),
                                items: const [
                                  DropdownMenuItem(
                                      value: 'all',
                                      child: Text('All Directions')),
                                  DropdownMenuItem(
                                      value: 'inbound', child: Text('Inbound')),
                                  DropdownMenuItem(
                                      value: 'outbound',
                                      child: Text('Outbound')),
                                ],
                                onChanged: (value) {
                                  setState(() {
                                    _filterDirection = value ?? 'all';
                                  });
                                },
                              ),
                            ],
                          ),
                  ],
                ),
              ),
            ],
          ),

          const SizedBox(height: 24),
          const Divider(),
          const SizedBox(height: 16),

          // Bottom row - Action buttons and stats
          Flex(
            direction: isDesktop ? Axis.horizontal : Axis.vertical,
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              // Action buttons
              Wrap(
                spacing: 12,
                runSpacing: 8,
                children: [
                  ElevatedButton.icon(
                    onPressed: filteredCalls.isEmpty
                        ? null
                        : () => _selectAllCalls(filteredCalls),
                    icon: const Icon(Icons.select_all, size: 18),
                    label: Text('Select All (${filteredCalls.length})'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.blue.shade600,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 8),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8)),
                    ),
                  ),
                  ElevatedButton.icon(
                    onPressed:
                        _selectedCalls.isEmpty ? null : _clearSelectedCalls,
                    icon: const Icon(Icons.clear, size: 18),
                    label: Text('Clear Selected (${_selectedCalls.length})'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.orange.shade600,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 8),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8)),
                    ),
                  ),
                  ElevatedButton.icon(
                    onPressed: callHistory.isEmpty ? null : _clearAllCalls,
                    icon: const Icon(Icons.delete_forever, size: 18),
                    label: const Text('Clear All History'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.red.shade600,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 8),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8)),
                    ),
                  ),
                ],
              ),

              if (!isDesktop) const SizedBox(height: 16),

              // Status stats
              Wrap(
                spacing: 16,
                runSpacing: 8,
                children: (stats['byStatus'] as Map<String, int>)
                    .entries
                    .map<Widget>((MapEntry<String, int> entry) {
                  return Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: _getStatusColor(entry.key).withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(
                          color: _getStatusColor(entry.key)
                              .withValues(alpha: 0.3)),
                    ),
                    child: Text(
                      '${entry.key}: ${entry.value}',
                      style: TextStyle(
                        color: _getStatusColor(entry.key),
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  );
                }).toList(),
              ),
            ],
          ),
        ],
      ),
    );
  }

  // Build responsive table - matching ReactJS calls-table
  Widget _buildCallsTable(
      List<Call> filteredCalls, bool isDesktop, bool isTablet) {
    if (filteredCalls.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(48),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Colors.grey.shade300),
        ),
        child: Center(
          child: Column(
            children: [
              Icon(Icons.history, size: 64, color: Colors.grey.shade400),
              const SizedBox(height: 16),
              Text(
                'No Call History',
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w600,
                  color: Colors.grey.shade600,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                _searchTerm.isNotEmpty ||
                        _filterStatus != 'all' ||
                        _filterDirection != 'all'
                    ? 'No calls match your current filters.'
                    : 'No calls have been made yet.',
                style: TextStyle(
                  color: Colors.grey.shade500,
                  fontSize: 16,
                ),
                textAlign: TextAlign.center,
              ),
              if (_searchTerm.isEmpty &&
                  _filterStatus == 'all' &&
                  _filterDirection == 'all') ...[
                const SizedBox(height: 24),
                ElevatedButton.icon(
                  onPressed: () => Navigator.pushNamed(context, '/calls'),
                  icon: const Icon(Icons.phone),
                  label: const Text('Make Your First Call'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.blue.shade600,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(
                        horizontal: 24, vertical: 12),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12)),
                  ),
                ),
              ],
            ],
          ),
        ),
      );
    }

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.grey.shade300),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: isDesktop
          ? _buildDesktopTable(filteredCalls)
          : _buildMobileCards(filteredCalls),
    );
  }

  // Build desktop table layout - matching ReactJS table structure
  Widget _buildDesktopTable(List<Call> filteredCalls) {
    return Column(
      children: [
        // Table header
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.grey.shade50,
            borderRadius: const BorderRadius.only(
              topLeft: Radius.circular(16),
              topRight: Radius.circular(16),
            ),
            border: Border(
                bottom: BorderSide(color: Colors.grey.shade300, width: 2)),
          ),
          child: const Row(
            children: [
              SizedBox(width: 40), // Checkbox space
              Expanded(
                  flex: 1,
                  child: Text('Type',
                      style: TextStyle(fontWeight: FontWeight.w600))),
              Expanded(
                  flex: 3,
                  child: Text('Details',
                      style: TextStyle(fontWeight: FontWeight.w600))),
              Expanded(
                  flex: 2,
                  child: Text('Date & Time',
                      style: TextStyle(fontWeight: FontWeight.w600))),
              Expanded(
                  flex: 1,
                  child: Text('Duration',
                      style: TextStyle(fontWeight: FontWeight.w600))),
              Expanded(
                  flex: 1,
                  child: Text('Status',
                      style: TextStyle(fontWeight: FontWeight.w600))),
              Expanded(
                  flex: 1,
                  child: Text('Actions',
                      style: TextStyle(fontWeight: FontWeight.w600))),
            ],
          ),
        ),

        // Table body
        Container(
          constraints: const BoxConstraints(maxHeight: 600),
          child: ListView.builder(
            itemCount: filteredCalls.length,
            itemBuilder: (context, index) {
              final call = filteredCalls[index];
              final isSelected = _selectedCalls.contains(call.sipCallId);
              final callType = call.direction == CallDirection.incoming
                  ? 'inbound'
                  : 'outbound';
              final status = _getCallStatusString(call);

              return Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: isSelected ? Colors.blue.shade50 : Colors.white,
                  border:
                      Border(bottom: BorderSide(color: Colors.grey.shade200)),
                ),
                child: Row(
                  children: [
                    // Checkbox
                    SizedBox(
                      width: 40,
                      child: Checkbox(
                        value: isSelected,
                        onChanged: (_) => _toggleCallSelection(call.sipCallId),
                      ),
                    ),

                    // Type
                    Expanded(
                      flex: 1,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: callType == 'inbound'
                              ? Colors.green.shade100
                              : Colors.blue.shade100,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          callType.toUpperCase(),
                          style: TextStyle(
                            color: callType == 'inbound'
                                ? Colors.green.shade700
                                : Colors.blue.shade700,
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                          ),
                          textAlign: TextAlign.center,
                        ),
                      ),
                    ),

                    // Details
                    Expanded(
                      flex: 3,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Flexible(
                                child: Text(
                                  _extractCleanIdentifier(call.callerIdRaw),
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w600),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                              const Text(' → '),
                              Flexible(
                                child: Text(
                                  _extractCleanIdentifier(call.calledUri),
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w600),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'ID: ${call.sipCallId}',
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.grey.shade600,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    ),

                    // Date & Time
                    Expanded(
                      flex: 2,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            _formatDate(call.startTimeISO),
                            style: TextStyle(
                              fontSize: 14,
                              color: Colors.grey.shade700,
                            ),
                          ),
                          Text(
                            _formatTime(call.startTimeISO),
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.grey.shade500,
                            ),
                          ),
                        ],
                      ),
                    ),

                    // Duration
                    Expanded(
                      flex: 1,
                      child: Text(
                        _formatDuration(call.durationSeconds),
                        style: const TextStyle(
                          fontFamily: 'monospace',
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),

                    // Status
                    Expanded(
                      flex: 1,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: _getStatusColor(status).withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                              color: _getStatusColor(status)
                                  .withValues(alpha: 0.3)),
                        ),
                        child: Text(
                          status.toUpperCase(),
                          style: TextStyle(
                            color: _getStatusColor(status),
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                          ),
                          textAlign: TextAlign.center,
                        ),
                      ),
                    ),

                    // Actions
                    Expanded(
                      flex: 1,
                      child: Row(
                        children: [
                          IconButton(
                            onPressed: () async {
                              await _handleRedial(call);
                            },
                            icon: const Icon(Icons.phone, size: 18),
                            tooltip: 'Redial',
                            style: IconButton.styleFrom(
                              backgroundColor: Colors.green.shade100,
                              foregroundColor: Colors.green.shade700,
                            ),
                          ),
                          const SizedBox(width: 4),
                          IconButton(
                            onPressed: () {
                              final callManager =
                                  context.read<CallManagerProvider>();
                              callManager.removeCall(call.sipCallId);
                            },
                            icon: const Icon(Icons.delete, size: 18),
                            tooltip: 'Delete',
                            style: IconButton.styleFrom(
                              backgroundColor: Colors.red.shade100,
                              foregroundColor: Colors.red.shade700,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  // Build mobile cards layout - matching ReactJS mobile responsive design
  Widget _buildMobileCards(List<Call> filteredCalls) {
    return ListView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16),
      itemCount: filteredCalls.length,
      itemBuilder: (context, index) {
        final call = filteredCalls[index];
        final isSelected = _selectedCalls.contains(call.sipCallId);
        final callType =
            call.direction == CallDirection.incoming ? 'inbound' : 'outbound';
        final status = _getCallStatusString(call);

        return Container(
          margin: const EdgeInsets.only(bottom: 16),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: isSelected ? Colors.blue.shade50 : Colors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: isSelected ? Colors.blue.shade300 : Colors.grey.shade300,
              width: isSelected ? 2 : 1,
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.05),
                blurRadius: 8,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header row
              Row(
                children: [
                  Checkbox(
                    value: isSelected,
                    onChanged: (_) => _toggleCallSelection(call.sipCallId),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: callType == 'inbound'
                          ? Colors.green.shade100
                          : Colors.blue.shade100,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      callType.toUpperCase(),
                      style: TextStyle(
                        color: callType == 'inbound'
                            ? Colors.green.shade700
                            : Colors.blue.shade700,
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  const Spacer(),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: _getStatusColor(status).withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                          color:
                              _getStatusColor(status).withValues(alpha: 0.3)),
                    ),
                    child: Text(
                      status.toUpperCase(),
                      style: TextStyle(
                        color: _getStatusColor(status),
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 12),

              // Call details
              Row(
                children: [
                  Flexible(
                    child: Text(
                      _extractCleanIdentifier(call.callerIdRaw),
                      style: const TextStyle(
                          fontWeight: FontWeight.w600, fontSize: 16),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const Text(' → ', style: TextStyle(fontSize: 16)),
                  Flexible(
                    child: Text(
                      _extractCleanIdentifier(call.calledUri),
                      style: const TextStyle(
                          fontWeight: FontWeight.w600, fontSize: 16),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 8),

              // Metadata
              Wrap(
                spacing: 16,
                runSpacing: 4,
                children: [
                  Text(
                    '📅 ${_formatDate(call.startTimeISO)}',
                    style: TextStyle(color: Colors.grey.shade600, fontSize: 12),
                  ),
                  Text(
                    '⏰ ${_formatTime(call.startTimeISO)}',
                    style: TextStyle(color: Colors.grey.shade600, fontSize: 12),
                  ),
                  Text(
                    '⏱️ ${_formatDuration(call.durationSeconds)}',
                    style: TextStyle(color: Colors.grey.shade600, fontSize: 12),
                  ),
                ],
              ),

              const SizedBox(height: 8),

              Text(
                'Call ID: ${call.sipCallId}',
                style: TextStyle(
                  fontSize: 11,
                  color: Colors.grey.shade500,
                  fontFamily: 'monospace',
                ),
                overflow: TextOverflow.ellipsis,
                maxLines: 1,
              ),

              const SizedBox(height: 12),

              // Action buttons
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: () async {
                        await _handleRedial(call);
                      },
                      icon: const Icon(Icons.phone, size: 16),
                      label: const Text('Redial'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.green.shade600,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8)),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: () {
                        final callManager = context.read<CallManagerProvider>();
                        callManager.removeCall(call.sipCallId);
                      },
                      icon: const Icon(Icons.delete, size: 16),
                      label: const Text('Delete'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.red.shade600,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8)),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }

  // Build confirmation modal - matching ReactJS ConfirmationModal
  Widget _buildConfirmationModal() {
    if (!_showConfirmation || _confirmationConfig == null) {
      return const SizedBox.shrink();
    }

    final config = _confirmationConfig!;
    final type = config['type'] as String;
    Color color;
    IconData icon;

    switch (type) {
      case 'danger':
        color = Colors.red;
        icon = Icons.warning;
        break;
      case 'warning':
        color = Colors.orange;
        icon = Icons.info;
        break;
      default:
        color = Colors.blue;
        icon = Icons.info;
    }

    return Container(
      color: Colors.black54,
      child: Center(
        child: Container(
          margin: const EdgeInsets.all(24),
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.3),
                blurRadius: 20,
                offset: const Offset(0, 10),
              ),
            ],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, color: color, size: 48),
              const SizedBox(height: 16),
              Text(
                config['title'] as String,
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w600,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 12),
              Text(
                config['message'] as String,
                style: TextStyle(
                  color: Colors.grey.shade600,
                  fontSize: 16,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton(
                      onPressed: () {
                        setState(() {
                          _showConfirmation = false;
                          _confirmationConfig = null;
                        });
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.grey.shade200,
                        foregroundColor: Colors.grey.shade700,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8)),
                      ),
                      child: const Text('Cancel'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: () {
                        config['onConfirm']();
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: color,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8)),
                      ),
                      child: Text(type == 'danger' ? 'Delete' : 'Confirm'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    // Not configured screen - matching ReactJS
    if (!_isApiConfigured) {
      return Scaffold(
        appBar: AppBar(
          title: const Text('📞 Call History'),
          automaticallyImplyLeading: false,
          backgroundColor: Colors.white,
          foregroundColor: Colors.black,
          elevation: 0,
          bottom: PreferredSize(
            preferredSize: const Size.fromHeight(1),
            child: Container(
              height: 1,
              color: Colors.grey.shade300,
            ),
          ),
        ),
        body: Center(
          child: Container(
            margin: const EdgeInsets.all(32),
            padding: const EdgeInsets.all(32),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: Colors.grey.shade300),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.05),
                  blurRadius: 10,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.settings, size: 64, color: Colors.orange.shade400),
                const SizedBox(height: 24),
                const Text(
                  'API Configuration Required',
                  style: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w600,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 12),
                Text(
                  'Please configure your API credentials in Settings to view call history.',
                  style: TextStyle(
                    color: Colors.grey.shade600,
                    fontSize: 16,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 24),
                ElevatedButton(
                  onPressed: () => Navigator.pushNamed(context, '/settings'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.blue.shade600,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(
                        horizontal: 32, vertical: 12),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12)),
                  ),
                  child: const Text('Go to Settings'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return Consumer<CallManagerProvider>(
      builder: (context, callManager, child) {
        if (callManager.isLoading) {
          return Scaffold(
            appBar: AppBar(
              title: const Text('📞 Call History'),
              automaticallyImplyLeading: false,
              backgroundColor: Colors.white,
              foregroundColor: Colors.black,
              elevation: 0,
            ),
            body: const Center(
              child: CircularProgressIndicator(),
            ),
          );
        }

        final callHistory = callManager.callHistory;
        final filteredCalls = _filterCalls(callHistory);

        return LayoutBuilder(
          builder: (context, constraints) {
            final isDesktop = constraints.maxWidth >= 1024;
            final isTablet =
                constraints.maxWidth >= 768 && constraints.maxWidth < 1024;

            return Scaffold(
              appBar: AppBar(
                title: const Text('📞 Call History'),
                automaticallyImplyLeading: false,
                backgroundColor: Colors.white,
                foregroundColor: Colors.black,
                elevation: 0,
                bottom: PreferredSize(
                  preferredSize: const Size.fromHeight(1),
                  child: Container(
                    height: 1,
                    color: Colors.grey.shade300,
                  ),
                ),
                actions: [
                  IconButton(
                    onPressed: () async {
                      final messenger = ScaffoldMessenger.of(context);
                      final callManager = context.read<CallManagerProvider>();
                      try {
                        messenger.showSnackBar(
                          const SnackBar(content: Text('Refreshing…')),
                        );
                        await callManager.loadCallHistory();
                        messenger.showSnackBar(
                          const SnackBar(
                              content: Text('Call history refreshed')),
                        );
                      } catch (e) {
                        messenger.showSnackBar(
                          SnackBar(content: Text('Failed to refresh: $e')),
                        );
                      }
                    },
                    icon: const Icon(Icons.refresh),
                    tooltip: 'Refresh',
                  ),
                ],
              ),
              body: Stack(
                children: [
                  // Main content
                  Container(
                    color: Colors.grey.shade50,
                    child: FadeTransition(
                      opacity: _fadeAnimation,
                      child: SingleChildScrollView(
                        padding: const EdgeInsets.all(24),
                        child: Center(
                          child: ConstrainedBox(
                            constraints: const BoxConstraints(maxWidth: 1200),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                // Page header
                                Row(
                                  mainAxisAlignment:
                                      MainAxisAlignment.spaceBetween,
                                  children: [
                                    Text(
                                      'Call History',
                                      style: TextStyle(
                                        fontSize: isDesktop ? 32 : 24,
                                        fontWeight: FontWeight.w600,
                                        color: Colors.grey.shade800,
                                      ),
                                    ),
                                    if (callHistory.isNotEmpty)
                                      Text(
                                        'Showing ${filteredCalls.length} calls',
                                        style: TextStyle(
                                          color: Colors.grey.shade600,
                                          fontSize: 14,
                                        ),
                                      ),
                                  ],
                                ),

                                const SizedBox(height: 32),

                                // Stats grid
                                if (callHistory.isNotEmpty)
                                  _buildStatsGrid(_getStats(callHistory),
                                      isDesktop, isTablet),

                                // Controls
                                _buildControls(callHistory, filteredCalls,
                                    isDesktop, isTablet),

                                // Calls table/cards
                                _buildCallsTable(
                                    filteredCalls, isDesktop, isTablet),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),

                  // Confirmation modal overlay
                  if (_showConfirmation) _buildConfirmationModal(),
                ],
              ),
            );
          },
        );
      },
    );
  }
}
