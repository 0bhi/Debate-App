import { CreateDebateRequest } from "./validators";
import { env } from "./env";
import { logger } from "./logger";

// Prefer calling the web's API routes, which proxy to the server.
// If a public server API URL is provided, call it directly from the client.
const API_BASE = env.NEXT_PUBLIC_SERVER_API_URL || "/api";

/**
 * Maximum retries for 503 service unavailable errors
 */
const MAX_RETRIES_503 = 3;
/**
 * Base delay in milliseconds for exponential backoff on 503 errors
 */
const BASE_RETRY_DELAY_MS = 1000;

class ApiClient {
  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    retryCount: number = 0
  ): Promise<T> {
    const url = `${API_BASE}${endpoint}`;

    const config: RequestInit = {
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      ...options,
    };

    const response = await fetch(url, config);

    if (!response.ok) {
      // Handle 503 Service Unavailable with retry logic
      if (response.status === 503 && retryCount < MAX_RETRIES_503) {
        const retryAfter = response.headers.get("retry-after");
        
        // Calculate exponential backoff delay
        // Use retry-after header if available, otherwise use exponential backoff
        const retryAfterSeconds = retryAfter
          ? parseInt(retryAfter, 10)
          : null;

        const backoffDelayMs = retryAfterSeconds
          ? retryAfterSeconds * 1000
          : BASE_RETRY_DELAY_MS * Math.pow(2, retryCount);

        logger.warn("503 Service Unavailable, retrying", {
          attempt: retryCount + 1,
          maxRetries: MAX_RETRIES_503,
          delayMs: backoffDelayMs,
          retryAfter: retryAfterSeconds,
        });

        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, backoffDelayMs));

        // Retry the request
        return this.request<T>(endpoint, options, retryCount + 1);
      }

      let errorMessage = `HTTP ${response.status}`;
      
      // Handle specific status codes
      if (response.status === 429) {
        errorMessage = "Rate limit exceeded. Too many requests. Please try again later.";
      } else if (response.status === 404) {
        errorMessage = "Resource not found";
      } else if (response.status === 500) {
        errorMessage = "Internal server error";
      } else if (response.status === 502) {
        errorMessage = "Bad gateway. The debate server returned an error.";
      } else if (response.status === 503) {
        errorMessage = "Service temporarily unavailable. Please ensure the debate server is running.";
      } else if (response.status === 504) {
        errorMessage = "Request timed out. The debate server did not respond in time.";
      }

      // Try to parse error response, but handle non-JSON or empty responses
      const contentType = response.headers.get("content-type");
      const contentLength = response.headers.get("content-length");
      
      if (contentType?.includes("application/json") && contentLength !== "0") {
        try {
          const text = await response.text();
          if (text && text.trim()) {
            const error = JSON.parse(text);
            // Prefer error.error or error.message from server response
            errorMessage = error.error || error.message || errorMessage;
            
            // Log additional details for debugging
            if (error.details || error.serverUrl) {
              logger.debug("Error response details", {
                details: error.details,
                serverUrl: error.serverUrl,
              });
            }
          }
        } catch {
          // If JSON parsing fails, use status-based message
        }
      }

      throw new Error(errorMessage);
    }

    return response.json();
  }

  async createDebate(
    request: CreateDebateRequest
  ): Promise<{ id: string; wsUrl: string }> {
    return this.request("/debates", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  async getDebate(id: string): Promise<any> {
    return this.request(`/debates/${id}`);
  }

  async getWebSocketInfo(
    sessionId: string
  ): Promise<{ wsUrl: string; sessionId: string }> {
    return this.request(`/ws?sessionId=${sessionId}`);
  }

  async getInvitationLink(
    debateId: string
  ): Promise<{ inviteToken: string; inviteUrl: string }> {
    return this.request(`/debates/${debateId}/invite`);
  }

  async acceptInvitation(
    debateId: string,
    token: string
  ): Promise<{ success: boolean }> {
    return this.request(`/debates/${debateId}/accept-invitation`, {
      method: "POST",
      body: JSON.stringify({ token }),
    });
  }

  async retryJudging(debateId: string): Promise<{ success: boolean; message?: string }> {
    return this.request(`/debates/${debateId}/retry-judge`, {
      method: "POST",
    });
  }
}

export const apiClient = new ApiClient();
