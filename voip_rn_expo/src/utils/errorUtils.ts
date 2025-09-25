/**
 * Error message formatting utilities
 * Cleans up API error responses for better user experience
 */

/**
 * Parses HTML error messages and extracts plain text
 * @param htmlString - Raw HTML error message from API
 * @returns Clean text message
 */
export const parseHtmlError = (htmlString: string): string => {
  if (!htmlString) return 'Unknown error occurred';
  
  // Remove HTML tags using regex
  const textContent = htmlString.replace(/<[^>]*>/g, '');
  
  // Decode common HTML entities
  const decoded = textContent
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
  
  // Clean up extra whitespace
  return decoded.replace(/\s+/g, ' ').trim();
};

/**
 * Formats API error responses for user-friendly display
 * @param error - Error object or string from API
 * @returns User-friendly error message
 */
export const formatErrorMessage = (error: any): string => {
  if (!error) return 'An unexpected error occurred';
  
  let errorText = '';
  
  if (typeof error === 'string') {
    errorText = error;
  } else if (error.message) {
    errorText = error.message;
  } else if (error.error) {
    errorText = error.error;
  } else if (error.details) {
    errorText = error.details;
  } else {
    errorText = 'An unexpected error occurred';
  }
  
  // Check if it contains HTML tags
  if (errorText.includes('<') && errorText.includes('>')) {
    errorText = parseHtmlError(errorText);
  }
  
  // Remove technical prefixes and make user-friendly
  errorText = errorText
    .replace(/^Error:\s*/i, '')
    .replace(/^Failed to\s*/i, 'Unable to ')
    .replace(/^Cannot\s*/i, 'Unable to ')
    .replace(/API error:/i, '')
    .replace(/HTTP error:/i, '')
    .replace(/Network error:/i, 'Connection issue: ')
    .trim();
  
  // Capitalize first letter
  if (errorText.length > 0) {
    errorText = errorText.charAt(0).toUpperCase() + errorText.slice(1);
  }
  
  // Ensure it ends with a period
  if (!errorText.endsWith('.') && !errorText.endsWith('!') && !errorText.endsWith('?')) {
    errorText += '.';
  }
  
  return errorText;
};

/**
 * Maps common technical errors to user-friendly messages
 * @param error - Error object or string
 * @returns User-friendly error message
 */
export const mapErrorToUserMessage = (error: any): string => {
  const errorText = formatErrorMessage(error).toLowerCase();
  
  // Common error patterns and their user-friendly replacements
  const errorMappings: Record<string, string> = {
    'timeout': 'The request timed out. Please try again.',
    'network': 'Unable to connect. Please check your internet connection.',
    'unauthorized': 'You are not authorized to perform this action.',
    'forbidden': 'You do not have permission to perform this action.',
    'not found': 'The requested resource was not found.',
    'bad request': 'Invalid request. Please check your input and try again.',
    'internal server error': 'Server error. Please try again later.',
    'service unavailable': 'Service is temporarily unavailable. Please try again later.',
    'invalid credentials': 'Invalid username or password.',
    'session expired': 'Your session has expired. Please log in again.',
    'rate limit': 'Too many requests. Please wait a moment and try again.',
  };
  
  for (const [pattern, message] of Object.entries(errorMappings)) {
    if (errorText.includes(pattern)) {
      return message;
    }
  }
  
  return formatErrorMessage(error);
};

/**
 * Creates a notification-ready error object
 * @param error - Raw error from API
 * @param context - Context of where the error occurred (e.g., 'making call', 'loading data')
 * @returns Object with title and message for notifications
 */
export const createErrorNotification = (error: any, context: string = ''): { title: string; message: string } => {
  const userMessage = mapErrorToUserMessage(error);
  
  let title = 'Error';
  if (context) {
    title = `Error ${context}`;
    // Capitalize first letter of context
    title = title.charAt(0).toUpperCase() + title.slice(1);
  }
  
  return {
    title,
    message: userMessage
  };
};