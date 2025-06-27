import { TrivilToken } from '../components/TrivilLanguageSupport';

export interface SyntaxAnalysisRequest {
  sourceCode: string;
  position: number;
}

export interface SyntaxAnalysisResponse {
  success: boolean;
  tokens: TrivilToken[];
  error?: string;
  analysisTimeMs: number;
}

class SyntaxAnalysisService {
  private readonly baseUrl: string;
  private abortController: AbortController | null = null;

  constructor() {
    const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8080';
    this.baseUrl = `${backendUrl}/api/syntax`;
  }

  async analyzeSyntax(sourceCode: string, position: number = -1): Promise<TrivilToken[]> {
    try {
      if (this.abortController) {
        this.abortController.abort();
      }
      
      this.abortController = new AbortController();
      
      const request: SyntaxAnalysisRequest = {
        sourceCode,
        position
      };

      const timeoutMs = parseInt(process.env.REACT_APP_SYNTAX_API_TIMEOUT || '5000');
      const timeoutId = setTimeout(() => {
        if (this.abortController) {
          this.abortController.abort();
        }
      }, timeoutMs);

      const response = await fetch(`${this.baseUrl}/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: this.abortController.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
      }

      const responseText = await response.text();
      let result: SyntaxAnalysisResponse;
      try {
        result = JSON.parse(responseText);
      } catch (parseError) {
        throw new Error(`Invalid JSON response: ${parseError}`);
      }

      if (!result.success) {
        return [];
      }

      if (!result.tokens || !Array.isArray(result.tokens)) {
        return [];
      }

      const tokens = result.tokens.map(token => ({
        startLine: token.startLine,
        startColumn: token.startColumn,
        endLine: token.endLine,
        endColumn: token.endColumn,
        tokenType: token.tokenType,
        value: token.value,
        semanticInfo: token.semanticInfo
      }));

      return tokens;

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return [];
      }
      return [];
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutMs = parseInt(process.env.REACT_APP_HEALTH_CHECK_TIMEOUT || '3000');
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, timeoutMs);

      const response = await fetch(`${this.baseUrl}/health`, {
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      return false;
    }
  }
}

export const syntaxAnalysisService = new SyntaxAnalysisService(); 