// Logger utility - Simple logging utility for debugging
import 'package:flutter/foundation.dart';

enum LogLevel { debug, info, warning, error }

class Logger {
  static const String _prefix = '[VoIP App]';
  static LogLevel _level = LogLevel.error;

  static final Map<LogLevel, int> _levelPriority = {
    LogLevel.debug: 0,
    LogLevel.info: 1,
    LogLevel.warning: 2,
    LogLevel.error: 3,
  };

  static void setLevel(LogLevel level) {
    _level = level;
  }

  static bool _shouldLog(LogLevel level) {
    if (!kDebugMode) {
      return false;
    }
    return _levelPriority[level]! >= _levelPriority[_level]!;
  }

  static void _log(String label, String message, LogLevel level) {
    if (_shouldLog(level)) {
      print('$_prefix $label: $message');
    }
  }

  // Log info messages
  static void info(String message) {
    _log('INFO', message, LogLevel.info);
  }

  // Log error messages
  static void error(String message) {
    _log('ERROR', message, LogLevel.error);
  }

  // Log warning messages
  static void warning(String message) {
    _log('WARNING', message, LogLevel.warning);
  }

  // Log warn messages (alias for warning)
  static void warn(String message) {
    _log('WARN', message, LogLevel.warning);
  }

  // Log debug messages
  static void debug(String message) {
    _log('DEBUG', message, LogLevel.debug);
  }
}
