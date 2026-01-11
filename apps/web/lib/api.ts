import { CreateDebateRequest } from "./validators";
import { env } from "./env";

// Prefer calling the web's API routes, which proxy to the server.
// If a public server API URL is provided, call it directly from the client.
const API_BASE = env.NEXT_PUBLIC_SERVER_API_URL || "/api";

class ApiClient {
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
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
      let errorMessage = `HTTP ${response.status}`;
      
      // Handle specific status codes
      if (response.status === 429) {
        errorMessage = "Rate limit exceeded. Too many requests. Please try again later.";
      } else if (response.status === 404) {
        errorMessage = "Resource not found";
      } else if (response.status === 500) {
        errorMessage = "Internal server error";
      } else if (response.status === 503) {
        errorMessage = "Service temporarily unavailable";
      }

      // Try to parse error response, but handle non-JSON or empty responses
      const contentType = response.headers.get("content-type");
      const contentLength = response.headers.get("content-length");
      
      if (contentType?.includes("application/json") && contentLength !== "0") {
        try {
          const text = await response.text();
          if (text && text.trim()) {
            const error = JSON.parse(text);
            errorMessage = error.error || error.message || errorMessage;
            
            // If it's a rate limit error, provide more context
            if (error.code === "RATE_LIMIT_EXCEEDED" || response.status === 429) {
              errorMessage = error.error || errorMessage;
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
