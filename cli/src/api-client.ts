import { NeurcodeConfig } from './config';

export interface AnalyzeDiffRequest {
  diff: string;
  projectId?: string;
}

export interface AnalyzeDiffResponse {
  logId: string;
  decision: 'allow' | 'warn' | 'block';
  violations: Array<{
    rule: string;
    file: string;
    severity: 'allow' | 'warn' | 'block';
    message?: string;
  }>;
  summary: {
    totalFiles: number;
    totalAdded: number;
    totalRemoved: number;
    files: Array<{
      path: string;
      changeType: 'add' | 'delete' | 'modify' | 'rename';
      added: number;
      removed: number;
    }>;
  };
}

export class ApiClient {
  private apiUrl: string;
  private apiKey?: string;

  constructor(config: NeurcodeConfig) {
    if (!config.apiUrl) {
      throw new Error('API URL not configured. Set NEURCODE_API_URL env var or add to neurcode.config.json');
    }
    this.apiUrl = config.apiUrl.replace(/\/$/, ''); // Remove trailing slash
    this.apiKey = config.apiKey;
  }

  async analyzeDiff(diff: string, projectId?: string): Promise<AnalyzeDiffResponse> {
    const url = `${this.apiUrl}/api/v1/analyze-diff`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (this.apiKey) {
      // Support both "Bearer nk_live_..." and just "nk_live_..."
      const key = this.apiKey.startsWith('Bearer ') ? this.apiKey : `Bearer ${this.apiKey}`;
      headers['Authorization'] = key;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        diff,
        projectId
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `API request failed with status ${response.status}`;
      
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorMessage;
        if (errorJson.message) {
          errorMessage += `: ${errorJson.message}`;
        }
      } catch {
        errorMessage += `: ${errorText}`;
      }

      throw new Error(errorMessage);
    }

    return response.json() as Promise<AnalyzeDiffResponse>;
  }
}

