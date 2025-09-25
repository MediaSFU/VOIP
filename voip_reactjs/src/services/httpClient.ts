import axios, { AxiosInstance, AxiosError } from 'axios';
import { ApiResponse } from '../types/api.types';

// Backend configuration based on react_ref authConfig pattern
const getBackendConfig = () => {
  return {
    BASE_URL: 'https://mediasfu.com',
    AUTH_URL: 'https://mediasfu.com/api',
    TELEPHONY_URL: 'https://mediasfu.com'
  };
};

export class HttpClient {
  private instance: AxiosInstance;

  constructor(baseURL?: string) {
    const config = getBackendConfig();
    
    this.instance = axios.create({
      baseURL: baseURL || `${config.BASE_URL}/v1/sipcall`,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor - using MediaSFU Bearer token pattern
    this.instance.interceptors.request.use(
      (config) => {
        // Get MediaSFU credentials from localStorage (same as react_ref)
        const mediaSFUCredentials = localStorage.getItem('mediaSFUCredentials');
        if (mediaSFUCredentials) {
          try {
            const credentials = JSON.parse(mediaSFUCredentials);
            if (credentials.apiUserName && credentials.apiKey) {
              // Use Bearer token with apiUserName:apiKey format (same as react_ref)
              config.headers.Authorization = `Bearer ${credentials.apiUserName}:${credentials.apiKey}`;
            }
          } catch (error) {
            // Error parsing MediaSFU credentials - continue without auth
          }
        }

        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.instance.interceptors.response.use(
      (response) => {
        return response;
      },
      (error: AxiosError) => {
        // Handle common errors
        if (error.response?.status === 401) {
          // Clear invalid credentials
          localStorage.removeItem('mediaSFUCredentials');
          window.location.reload();
        }
        
        return Promise.reject(error);
      }
    );
  }

  async get<T = any>(url: string): Promise<ApiResponse<T>> {
    try {
      const response = await this.instance.get(url);
      return {
        success: true,
        data: response.data,
        status: response.status
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Request failed',
        status: error.response?.status || 500
      };
    }
  }

  async post<T = any>(url: string, data?: any): Promise<ApiResponse<T>> {
    try {
      const response = await this.instance.post(url, data);
      return {
        success: true,
        data: response.data,
        status: response.status
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Request failed',
        status: error.response?.status || 500
      };
    }
  }

  async put<T = any>(url: string, data?: any): Promise<ApiResponse<T>> {
    try {
      const response = await this.instance.put(url, data);
      return {
        success: true,
        data: response.data,
        status: response.status
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Request failed',
        status: error.response?.status || 500
      };
    }
  }

  async delete<T = any>(url: string): Promise<ApiResponse<T>> {
    try {
      const response = await this.instance.delete(url);
      return {
        success: true,
        data: response.data,
        status: response.status
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Request failed',
        status: error.response?.status || 500
      };
    }
  }
}

// Export singleton instance
export const httpClient = new HttpClient();
