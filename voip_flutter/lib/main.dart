// Main entry point - Flutter equivalent of ReactJS App.tsx
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:google_fonts/google_fonts.dart';
import 'providers/providers.dart';
import 'providers/live_updates_provider.dart';
import 'pages/dashboard_page.dart';
import 'pages/calls_page.dart';
import 'pages/call_history_page.dart';
import 'pages/settings_page.dart';

void main() {
  runApp(const VoipApp());
}

class VoipApp extends StatelessWidget {
  const VoipApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => VoipConfigProvider()),
        ChangeNotifierProvider(create: (_) => CallManagerProvider()),
        ChangeNotifierProvider(create: (_) => LiveUpdatesProvider()),
      ],
      child: Consumer2<VoipConfigProvider, CallManagerProvider>(
        builder: (context, configProvider, callManagerProvider, child) {
          // Wire up LiveUpdatesProvider with CallManagerProvider
          final liveUpdatesProvider = context.read<LiveUpdatesProvider>();
          liveUpdatesProvider.setCallManagerProvider(callManagerProvider);
          // Ensure LiveUpdates respects current realtime config (start/stop or update interval)
          liveUpdatesProvider.updateConfig(configProvider.config.realtime);

          return MaterialApp(
            title: 'VoIP App',
            debugShowCheckedModeBanner: false,
            theme: _buildLightTheme(),
            darkTheme: _buildDarkTheme(),
            themeMode:
                configProvider.isDarkMode ? ThemeMode.dark : ThemeMode.light,
            home: const MainNavigationPage(),
          );
        },
      ),
    );
  }

  ThemeData _buildLightTheme() {
    return ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: Colors.blue,
        brightness: Brightness.light,
      ),
      // Use Google Fonts for better character support
      textTheme: GoogleFonts.interTextTheme(),
      appBarTheme: const AppBarTheme(
        centerTitle: true,
        elevation: 2,
      ),
      cardTheme: const CardThemeData(
        elevation: 2,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(8)),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(8),
          ),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
        ),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      ),
    );
  }

  ThemeData _buildDarkTheme() {
    return ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: Colors.blue,
        brightness: Brightness.dark,
      ),
      // Use Google Fonts for better character support
      textTheme: GoogleFonts.interTextTheme(ThemeData.dark().textTheme),
      appBarTheme: const AppBarTheme(
        centerTitle: true,
        elevation: 2,
      ),
      cardTheme: const CardThemeData(
        elevation: 2,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(8)),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(8),
          ),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
        ),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      ),
    );
  }
}

class MainNavigationPage extends StatefulWidget {
  const MainNavigationPage({super.key});

  @override
  State<MainNavigationPage> createState() => _MainNavigationPageState();
}

class _MainNavigationPageState extends State<MainNavigationPage> {
  int _currentIndex = 0;

  List<Widget> _getPages() {
    return [
      DashboardPage(onNavigate: _navigateToPage),
      const CallsPage(),
      const CallHistoryPage(),
      const SettingsPage(),
    ];
  }

  void _navigateToPage(String page) {
    setState(() {
      switch (page) {
        case 'calls':
          _currentIndex = 1;
          break;
        case 'history':
          _currentIndex = 2;
          break;
        case 'settings':
          _currentIndex = 3;
          break;
        default:
          _currentIndex = 0;
      }
    });
  }

  @override
  void initState() {
    super.initState();
    _initializeProviders();
  }

  Future<void> _initializeProviders() async {
    if (!mounted) return;

    // Initialize configuration provider
    final configProvider =
        Provider.of<VoipConfigProvider>(context, listen: false);
    await configProvider.initialize();

    if (!mounted) return;

    // Initialize call manager
    final callManager =
        Provider.of<CallManagerProvider>(context, listen: false);
    await callManager.initialize();

    if (!mounted) return;

    // TODO: Initialize live updates (removed to match ReactJS TODO state)
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Consumer<VoipConfigProvider>(
        builder: (context, configProvider, child) {
          if (configProvider.isLoading) {
            return const Center(
              child: CircularProgressIndicator(),
            );
          }

          if (configProvider.error != null) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(
                    Icons.error_outline,
                    size: 64,
                    color: Colors.red,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Initialization Error',
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    configProvider.error!,
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                  const SizedBox(height: 24),
                  ElevatedButton(
                    onPressed: () => _initializeProviders(),
                    child: const Text('Retry'),
                  ),
                ],
              ),
            );
          }

          return _getPages()[_currentIndex];
        },
      ),
      bottomNavigationBar: _buildBottomNavigationBar(),
    );
  }

  Widget _buildBottomNavigationBar() {
    return Consumer<CallManagerProvider>(
      builder: (context, callManager, child) {
        return BottomNavigationBar(
          type: BottomNavigationBarType.fixed,
          currentIndex: _currentIndex,
          onTap: (index) {
            setState(() {
              _currentIndex = index;
            });
          },
          items: [
            const BottomNavigationBarItem(
              icon: Icon(Icons.home),
              label: 'Dashboard',
            ),
            BottomNavigationBarItem(
              icon: Stack(
                children: [
                  const Icon(Icons.phone),
                  if (callManager.hasActiveCall)
                    Positioned(
                      right: 0,
                      top: 0,
                      child: Container(
                        padding: const EdgeInsets.all(2),
                        decoration: const BoxDecoration(
                          color: Colors.red,
                          shape: BoxShape.circle,
                        ),
                        constraints: const BoxConstraints(
                          minWidth: 12,
                          minHeight: 12,
                        ),
                        child: const Text(
                          '•',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 8,
                          ),
                          textAlign: TextAlign.center,
                        ),
                      ),
                    ),
                ],
              ),
              label: 'Calls',
            ),
            BottomNavigationBarItem(
              icon: Badge(
                label: Text('${callManager.totalCalls}'),
                isLabelVisible: callManager.totalCalls > 0,
                child: const Icon(Icons.history),
              ),
              label: 'History',
            ),
            const BottomNavigationBarItem(
              icon: Icon(Icons.settings),
              label: 'Settings',
            ),
          ],
        );
      },
    );
  }
}
