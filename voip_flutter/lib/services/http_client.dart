// HTTP client service - Dart equivalent of TypeScript httpClient.ts
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../utils/logger.dart';

// Backend configuration based on react_ref authConfig pattern
class BackendConfig {
  static const String baseUrl = 'https://mediasfu.com';
  static const String authUrl = 'https://mediasfu.com/api';
  static const String telephonyUrl = 'https://mediasfu.com';
}

class ApiResponse<T> {
  final bool success;
  final T? data;
  final String? error;
  final int? status;

  const ApiResponse({
    required this.success,
    this.data,
    this.error,
    this.status,
  });

  factory ApiResponse.success(T data, {int? status}) {
    return ApiResponse(
      success: true,
      data: data,
      status: status,
    );
  }

  factory ApiResponse.error(String error, {int? status}) {
    return ApiResponse(
      success: false,
      error: error,
      status: status,
    );
  }
}

class HttpClient {
  final String baseUrl;
  final http.Client _client;
  final Duration timeout;

  HttpClient({
    String? customBaseUrl,
    Duration? customTimeout,
  })  : baseUrl = customBaseUrl ?? '${BackendConfig.baseUrl}/v1/sipcall',
        _client = http.Client(),
        timeout = customTimeout ?? const Duration(seconds: 30);

  /// Get MediaSFU credentials from SharedPreferences
  Future<Map<String, String>?> _getCredentials() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final credentialsJson = prefs.getString('mediaSFUCredentials');

      if (credentialsJson != null) {
        final credentials = jsonDecode(credentialsJson) as Map<String, dynamic>;
        final apiUserName = credentials['apiUserName'] as String?;
        final apiKey = credentials['apiKey'] as String?;

        Logger.debug(
            'Parsed credentials - Username: $apiUserName, Key length: ${apiKey?.length}');

        if (apiUserName != null && apiKey != null) {
          return {
            'apiUserName': apiUserName,
            'apiKey': apiKey,
          };
        }
      }
    } catch (error) {
      // Error parsing MediaSFU credentials - continue without auth
      Logger.error('Error getting credentials: $error');
    }

    Logger.debug('No valid credentials found');
    return null;
  }

  /// Get headers with authentication
  Future<Map<String, String>> _getHeaders() async {
    final headers = <String, String>{
      'Content-Type': 'application/json',
    };

    final credentials = await _getCredentials();
    if (credentials != null) {
      // Use Bearer token with apiUserName:apiKey format (same as react_ref)
      final token = '${credentials['apiUserName']}:${credentials['apiKey']}';
      headers['Authorization'] = 'Bearer $token';
    }

    return headers;
  }

  /// Handle unauthorized response
  Future<void> _handleUnauthorized() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove('mediaSFUCredentials');
      // Note: In Flutter, we can't reload the page like in web
      // This would need to be handled by the calling widget/app
    } catch (error) {
      Logger.error('Error clearing credentials: $error');
    }
  }

  /// Make GET request
  Future<ApiResponse<T>> get<T>(String endpoint) async {
    try {
      final uri = Uri.parse('$baseUrl$endpoint');
      final headers = await _getHeaders();

      final response =
          await _client.get(uri, headers: headers).timeout(timeout);

      if (response.statusCode == 401) {
        await _handleUnauthorized();
        return ApiResponse.error(
          'Unauthorized - invalid credentials',
          status: 401,
        );
      }

      final responseData = jsonDecode(response.body);

      if (response.statusCode >= 200 && response.statusCode < 300) {
        return ApiResponse.success(
          responseData as T,
          status: response.statusCode,
        );
      } else {
        return ApiResponse.error(
          (responseData['error'] as String?) ?? 'Request failed',
          status: response.statusCode,
        );
      }
    } catch (error) {
      return ApiResponse.error(
        error.toString(),
        status: 500,
      );
    }
  }

  /// Make POST request
  Future<ApiResponse<T>> post<T>(String endpoint,
      {Map<String, dynamic>? data}) async {
    try {
      final uri = Uri.parse('$baseUrl$endpoint');
      final headers = await _getHeaders();

      final response = await _client
          .post(
            uri,
            headers: headers,
            body: data != null ? jsonEncode(data) : null,
          )
          .timeout(timeout);

      if (response.statusCode == 401) {
        await _handleUnauthorized();
        return ApiResponse.error(
          'Unauthorized - invalid credentials',
          status: 401,
        );
      }

      final responseData = jsonDecode(response.body);

      if (response.statusCode >= 200 && response.statusCode < 300) {
        return ApiResponse.success(
          responseData as T,
          status: response.statusCode,
        );
      } else {
        return ApiResponse.error(
          (responseData['error'] as String?) ?? 'Request failed',
          status: response.statusCode,
        );
      }
    } catch (error) {
      return ApiResponse.error(
        error.toString(),
        status: 500,
      );
    }
  }

  /// Make PUT request
  Future<ApiResponse<T>> put<T>(String endpoint,
      {Map<String, dynamic>? data}) async {
    try {
      final uri = Uri.parse('$baseUrl$endpoint');
      final headers = await _getHeaders();

      final response = await _client
          .put(
            uri,
            headers: headers,
            body: data != null ? jsonEncode(data) : null,
          )
          .timeout(timeout);

      if (response.statusCode == 401) {
        await _handleUnauthorized();
        return ApiResponse.error(
          'Unauthorized - invalid credentials',
          status: 401,
        );
      }

      final responseData = jsonDecode(response.body);

      if (response.statusCode >= 200 && response.statusCode < 300) {
        return ApiResponse.success(
          responseData as T,
          status: response.statusCode,
        );
      } else {
        return ApiResponse.error(
          (responseData['error'] as String?) ?? 'Request failed',
          status: response.statusCode,
        );
      }
    } catch (error) {
      return ApiResponse.error(
        error.toString(),
        status: 500,
      );
    }
  }

  /// Make DELETE request
  Future<ApiResponse<T>> delete<T>(String endpoint) async {
    try {
      final uri = Uri.parse('$baseUrl$endpoint');
      final headers = await _getHeaders();

      final response =
          await _client.delete(uri, headers: headers).timeout(timeout);

      if (response.statusCode == 401) {
        await _handleUnauthorized();
        return ApiResponse.error(
          'Unauthorized - invalid credentials',
          status: 401,
        );
      }

      final responseData = jsonDecode(response.body);

      if (response.statusCode >= 200 && response.statusCode < 300) {
        return ApiResponse.success(
          responseData as T,
          status: response.statusCode,
        );
      } else {
        return ApiResponse.error(
          (responseData['error'] as String?) ?? 'Request failed',
          status: response.statusCode,
        );
      }
    } catch (error) {
      return ApiResponse.error(
        error.toString(),
        status: 500,
      );
    }
  }

  /// Dispose the client
  void dispose() {
    _client.close();
  }
}
