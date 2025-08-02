import { CreateDebateRequest, JudgeRequest } from "./validators";

const API_BASE = "/api";

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
      const error = await response
        .json()
        .catch(() => ({ error: "Unknown error" }));
      throw new Error(error.error || `HTTP ${response.status}`);
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

  async judgeDebate(
    id: string,
    judgment: JudgeRequest
  ): Promise<{ success: boolean; winner: string }> {
    return this.request(`/debates/${id}/judge`, {
      method: "POST",
      body: JSON.stringify(judgment),
    });
  }

  async getWebSocketInfo(
    sessionId: string
  ): Promise<{ wsUrl: string; sessionId: string }> {
    return this.request(`/ws?sessionId=${sessionId}`);
  }
}

export const apiClient = new ApiClient();
