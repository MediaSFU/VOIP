// Configuration types - Dart equivalent of TypeScript config.types.ts

class VoipConfig {
  final String apiKey;
  final String apiUserName;
  final String baseUrl;
  final bool enableLiveUpdates;
  final int updateInterval; // milliseconds

  const VoipConfig({
    required this.apiKey,
    required this.apiUserName,
    required this.baseUrl,
    required this.enableLiveUpdates,
    required this.updateInterval,
  });

  factory VoipConfig.fromJson(Map<String, dynamic> json) {
    return VoipConfig(
      apiKey: (json['apiKey'] as String?) ?? '',
      apiUserName: (json['apiUserName'] as String?) ?? '',
      baseUrl: (json['baseUrl'] as String?) ?? 'https://mediasfu.com',
      enableLiveUpdates: (json['enableLiveUpdates'] as bool?) ?? true,
      updateInterval: (json['updateInterval'] as int?) ?? 6000,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'apiKey': apiKey,
      'apiUserName': apiUserName,
      'baseUrl': baseUrl,
      'enableLiveUpdates': enableLiveUpdates,
      'updateInterval': updateInterval,
    };
  }

  VoipConfig copyWith({
    String? apiKey,
    String? apiUserName,
    String? baseUrl,
    bool? enableLiveUpdates,
    int? updateInterval,
  }) {
    return VoipConfig(
      apiKey: apiKey ?? this.apiKey,
      apiUserName: apiUserName ?? this.apiUserName,
      baseUrl: baseUrl ?? this.baseUrl,
      enableLiveUpdates: enableLiveUpdates ?? this.enableLiveUpdates,
      updateInterval: updateInterval ?? this.updateInterval,
    );
  }
}

class ApiConfig {
  final String key;
  final String userName;
  final String baseUrl;

  const ApiConfig({
    required this.key,
    required this.userName,
    required this.baseUrl,
  });

  factory ApiConfig.fromJson(Map<String, dynamic> json) {
    return ApiConfig(
      key: (json['key'] as String?) ?? '',
      userName: (json['userName'] as String?) ?? '',
      baseUrl: (json['baseUrl'] as String?) ?? 'https://mediasfu.com',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'key': key,
      'userName': userName,
      'baseUrl': baseUrl,
    };
  }

  ApiConfig copyWith({
    String? key,
    String? userName,
    String? baseUrl,
  }) {
    return ApiConfig(
      key: key ?? this.key,
      userName: userName ?? this.userName,
      baseUrl: baseUrl ?? this.baseUrl,
    );
  }
}

class RealtimeConfig {
  final bool enabled;
  final int interval; // milliseconds

  const RealtimeConfig({
    required this.enabled,
    required this.interval,
  });

  factory RealtimeConfig.fromJson(Map<String, dynamic> json) {
    return RealtimeConfig(
      enabled: (json['enabled'] as bool?) ?? true,
      interval: (json['interval'] as int?) ?? 6000,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'enabled': enabled,
      'interval': interval,
    };
  }

  RealtimeConfig copyWith({
    bool? enabled,
    int? interval,
  }) {
    return RealtimeConfig(
      enabled: enabled ?? this.enabled,
      interval: interval ?? this.interval,
    );
  }
}

enum AppTheme { light, dark }

class UiConfig {
  final AppTheme theme;
  final bool compactMode;

  const UiConfig({
    required this.theme,
    required this.compactMode,
  });

  factory UiConfig.fromJson(Map<String, dynamic> json) {
    return UiConfig(
      theme: _parseTheme(json['theme'] as String?),
      compactMode: (json['compactMode'] as bool?) ?? false,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'theme': theme.name,
      'compactMode': compactMode,
    };
  }

  static AppTheme _parseTheme(String? theme) {
    switch (theme?.toLowerCase()) {
      case 'dark':
        return AppTheme.dark;
      case 'light':
      default:
        return AppTheme.light;
    }
  }

  UiConfig copyWith({
    AppTheme? theme,
    bool? compactMode,
  }) {
    return UiConfig(
      theme: theme ?? this.theme,
      compactMode: compactMode ?? this.compactMode,
    );
  }
}

class CallsConfig {
  final bool autoAnswer;
  final bool recordCalls;
  final int defaultRingTime; // seconds

  const CallsConfig({
    required this.autoAnswer,
    required this.recordCalls,
    required this.defaultRingTime,
  });

  factory CallsConfig.fromJson(Map<String, dynamic> json) {
    return CallsConfig(
      autoAnswer: (json['autoAnswer'] as bool?) ?? false,
      recordCalls: (json['recordCalls'] as bool?) ?? false,
      defaultRingTime: (json['defaultRingTime'] as int?) ?? 30,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'autoAnswer': autoAnswer,
      'recordCalls': recordCalls,
      'defaultRingTime': defaultRingTime,
    };
  }

  CallsConfig copyWith({
    bool? autoAnswer,
    bool? recordCalls,
    int? defaultRingTime,
  }) {
    return CallsConfig(
      autoAnswer: autoAnswer ?? this.autoAnswer,
      recordCalls: recordCalls ?? this.recordCalls,
      defaultRingTime: defaultRingTime ?? this.defaultRingTime,
    );
  }
}

class AppConfig {
  final ApiConfig api;
  final RealtimeConfig realtime;
  final UiConfig ui;
  final CallsConfig calls;

  const AppConfig({
    required this.api,
    required this.realtime,
    required this.ui,
    required this.calls,
  });

  factory AppConfig.fromJson(Map<String, dynamic> json) {
    return AppConfig(
      api: ApiConfig.fromJson(json['api'] as Map<String, dynamic>? ?? {}),
      realtime: RealtimeConfig.fromJson(
          json['realtime'] as Map<String, dynamic>? ?? {}),
      ui: UiConfig.fromJson(json['ui'] as Map<String, dynamic>? ?? {}),
      calls: CallsConfig.fromJson(json['calls'] as Map<String, dynamic>? ?? {}),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'api': api.toJson(),
      'realtime': realtime.toJson(),
      'ui': ui.toJson(),
      'calls': calls.toJson(),
    };
  }

  AppConfig copyWith({
    ApiConfig? api,
    RealtimeConfig? realtime,
    UiConfig? ui,
    CallsConfig? calls,
  }) {
    return AppConfig(
      api: api ?? this.api,
      realtime: realtime ?? this.realtime,
      ui: ui ?? this.ui,
      calls: calls ?? this.calls,
    );
  }
}

// Default configuration
const AppConfig defaultConfig = AppConfig(
  api: ApiConfig(
    key: '',
    userName: '',
    baseUrl: 'https://mediasfu.com',
  ),
  realtime: RealtimeConfig(
    enabled: true,
    interval:
        6000, // 6 seconds default (respecting API rate limit of 1 per 5 seconds)
  ),
  ui: UiConfig(
    theme: AppTheme.light,
    compactMode: false,
  ),
  calls: CallsConfig(
    autoAnswer: false,
    recordCalls: false,
    defaultRingTime: 30,
  ),
);
