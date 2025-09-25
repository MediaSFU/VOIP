import { storage } from '../utils/storage';
import { ApiResponse } from '../types/api.types';
import { apiLogger } from '../utils/logger';

// Backend configuration based on react_ref authConfig pattern
const getBackendConfig = () => {
  return {
    BASE_URL: 'https://mediasfu.com',
    AUTH_URL: 'https://mediasfu.com/api',
    TELEPHONY_URL: 'https://mediasfu.com'
  };
};

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: any;
}

export class HttpClient {
  private baseURL: string;
  private defaultHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  constructor(baseURL?: string) {
    const config = getBackendConfig();
    this.baseURL = baseURL || config.BASE_URL;
    this.setupDefaultHeaders();
  }

  private async setupDefaultHeaders(): Promise<void> {
    try {
      // Use the same credential storage format as MediaSFU
      const mediaSFUCredentials = await storage.getItem('mediaSFUCredentials');
      if (mediaSFUCredentials) {
        const credentials = JSON.parse(mediaSFUCredentials);
        if (credentials.apiKey && credentials.apiUserName) {
          this.defaultHeaders['Authorization'] = `Bearer ${credentials.apiUserName}:${credentials.apiKey}`;
        }
      }
    } catch (error) {
      apiLogger.warn('Failed to load MediaSFU credentials for headers:', error);
    }
  }

  private async makeRequest<T>(endpoint: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
    try {
      // Ensure we have the latest auth headers
      await this.setupDefaultHeaders();

      const url = `${this.baseURL}/v1/sipcall${endpoint}`;
      const requestOptions: RequestInit = {
        method: options.method || 'GET',
        headers: {
          ...this.defaultHeaders,
          ...options.headers,
        },
      };

      if (options.body && (options.method === 'POST' || options.method === 'PUT')) {
        requestOptions.body = JSON.stringify(options.body);
      }

      
      const response = await fetch(url, requestOptions);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      
      return {
        success: true,
        data: data
      };
    } catch (error: any) {
      apiLogger.error(`HTTP request failed:`, error);
      return {
        success: false,
        error: error.message || 'Network request failed'
      };
    }
  }

  // GET request
  async get<T>(endpoint: string, headers?: Record<string, string>): Promise<ApiResponse<T>> {
    return this.makeRequest<T>(endpoint, { method: 'GET', headers });
  }

  // POST request
  async post<T>(endpoint: string, data?: any, headers?: Record<string, string>): Promise<ApiResponse<T>> {
    return this.makeRequest<T>(endpoint, { method: 'POST', body: data, headers });
  }

  // PUT request
  async put<T>(endpoint: string, data?: any, headers?: Record<string, string>): Promise<ApiResponse<T>> {
    return this.makeRequest<T>(endpoint, { method: 'PUT', body: data, headers });
  }

  // DELETE request
  async delete<T>(endpoint: string, headers?: Record<string, string>): Promise<ApiResponse<T>> {
    return this.makeRequest<T>(endpoint, { method: 'DELETE', headers });
  }

  // Update MediaSFU credentials and refresh headers
  async setApiKey(apiKey: string, apiUserName?: string): Promise<void> {
    try {
      // Get existing credentials or create new ones
      let credentials = { apiKey: '', apiUserName: '' };
      const existing = await storage.getItem('mediaSFUCredentials');
      if (existing) {
        credentials = JSON.parse(existing);
      }
      
      // Update with new values
      credentials.apiKey = apiKey;
      if (apiUserName) {
        credentials.apiUserName = apiUserName;
      }
      
      // Save updated credentials
      await storage.setItem('mediaSFUCredentials', JSON.stringify(credentials));
      if (credentials.apiKey && credentials.apiUserName) {
        this.defaultHeaders['Authorization'] = `Bearer ${credentials.apiUserName}:${credentials.apiKey}`;
      }
    } catch (error) {
      apiLogger.warn('Failed to save MediaSFU credentials:', error);
    }
  }

  // Remove MediaSFU credentials
  async removeApiKey(): Promise<void> {
    await storage.removeItem('mediaSFUCredentials');
    delete this.defaultHeaders['Authorization'];
  }
}

export default HttpClient;