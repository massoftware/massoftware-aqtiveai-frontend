import { ChatCompletionMessage } from 'openai/resources';
import { ChatHistoryDetails } from '../shared/models/chat-history-details.model';
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';

// API request/response interfaces
interface ChatSessionRequest {
  title: string;
  initial_message?: string;
}

interface ChatSessionResponse {
  session_id: string;
  title: string;
  message: string;
}

interface ChatSession {
  session_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count?: number;
}

interface GetChatHistoryResponse {
  sessions: ChatSession[];
  total_count: number;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  metadata?: any;
}

interface GetChatSessionResponse {
  session: ChatSession;
  messages: ChatMessage[];
}

interface AddMessageRequest {
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: any;
}

interface UpdateSessionTitleRequest {
  title: string;
}


interface ConnectionValidationResponse {
  valid: boolean;
  message: string;
  tenant_id?: string;
  error_type?: string;
}

@Injectable({
  providedIn: 'root',
})
export class ChatDataService {
  totalChatConversation: number = 0;
  private apiUrl = environment.apiUrl;

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {}

  private getHeaders(): HttpHeaders {
    let headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });

    const token = this.authService.getToken();
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }

    return headers;
  }

  // New API methods for chat history management
  async createChatSession(title: string, initialMessage?: string): Promise<string> {
    const request: ChatSessionRequest = {
      title,
      initial_message: initialMessage
    };

    try {
      const response = await firstValueFrom(
        this.http.post<ChatSessionResponse>(
          `${this.apiUrl}/chat/sessions/`,
          request,
          { headers: this.getHeaders() }
        )
      );
      return response.session_id;
    } catch (error) {
      console.error('Failed to create chat session:', error);
      throw error;
    }
  }

  async getChatSessions(limit: number = 50, offset: number = 0): Promise<GetChatHistoryResponse> {
    try {
      console.log('Making API request to:', `${this.apiUrl}/chat/sessions/?limit=${limit}&offset=${offset}`);
      console.log('Using headers:', this.getHeaders());

      const response = await firstValueFrom(
        this.http.get<GetChatHistoryResponse>(
          `${this.apiUrl}/chat/sessions/?limit=${limit}&offset=${offset}`,
          { headers: this.getHeaders() }
        )
      );

      console.log('API response received:', response);
      return response;
    } catch (error) {
      console.error('Failed to get chat sessions:', error);
      console.error('Error details:', {
        status: (error as any)?.status,
        statusText: (error as any)?.statusText,
        url: (error as any)?.url,
        message: (error as any)?.message
      });
      throw error;
    }
  }

  async getChatSession(sessionId: string): Promise<GetChatSessionResponse> {
    try {
      const response = await firstValueFrom(
        this.http.get<GetChatSessionResponse>(
          `${this.apiUrl}/chat/sessions/${sessionId}`,
          { headers: this.getHeaders() }
        )
      );
      return response;
    } catch (error) {
      console.error('Failed to get chat session:', error);
      throw error;
    }
  }

  async addMessage(sessionId: string, role: 'user' | 'assistant', content: string, metadata?: any): Promise<string> {
    const request: AddMessageRequest = {
      session_id: sessionId,
      role,
      content,
      metadata
    };

    try {
      const response = await firstValueFrom(
        this.http.post<{ message_id: string; session_id: string; message: string }>(
          `${this.apiUrl}/chat/messages/`,
          request,
          { headers: this.getHeaders() }
        )
      );
      return response.message_id;
    } catch (error) {
      console.error('Failed to add message:', error);
      throw error;
    }
  }

  async updateSessionTitle(sessionId: string, title: string): Promise<void> {
    const request: UpdateSessionTitleRequest = { title };

    try {
      await firstValueFrom(
        this.http.put<{ message: string }>(
          `${this.apiUrl}/chat/sessions/${sessionId}/title`,
          request,
          { headers: this.getHeaders() }
        )
      );
    } catch (error) {
      console.error('Failed to update session title:', error);
      throw error;
    }
  }

  async deleteChatSession(sessionId: string): Promise<void> {
    try {
      await firstValueFrom(
        this.http.delete<{ message: string }>(
          `${this.apiUrl}/chat/sessions/${sessionId}`,
          { headers: this.getHeaders() }
        )
      );
    } catch (error) {
      console.error('Failed to delete chat session:', error);
      throw error;
    }
  }

  async validateConnection(): Promise<ConnectionValidationResponse> {
    try {
      const response = await firstValueFrom(
        this.http.post<ConnectionValidationResponse>(
          `${this.apiUrl}/validate_connection`,
          {},
          { headers: this.getHeaders() }
        )
      );
      return response;
    } catch (error) {
      console.error('Failed to validate connection:', error);
      throw error;
    }
  }

  // Convert API response to local model format
  private convertApiSessionToLocal(session: ChatSession, messages: ChatMessage[]): ChatHistoryDetails {
    return {
      id: session.session_id,
      title: session.title,
      sessionId: session.session_id,
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }))
    };
  }

  // Helper method to get all sessions formatted for the sidebar
  async getAllChatHistories(): Promise<ChatHistoryDetails[]> {
    try {
      console.log('Attempting to fetch chat sessions from API...');
      const response = await this.getChatSessions(100, 0); // Get first 100 sessions
      console.log('API Response:', response);
      console.log('Individual sessions from API:', response.sessions);

      // Convert sessions directly without fetching individual details
      const histories: ChatHistoryDetails[] = response.sessions.map(session => {
        console.log('Processing session:', session);
        console.log('Session ID:', session.session_id, 'Type:', typeof session.session_id);

        return {
          id: session.session_id,
          title: session.title,
          sessionId: session.session_id,
          messages: [] // We'll load messages only when the user clicks on a specific chat
        };
      });

      console.log('Final API histories:', histories);
      return histories;
    } catch (error) {
      console.error('Failed to get all chat histories from API:', error);
      console.log('API Error details:', error);
      throw error;
    }
  }


  public setTotalChatConversation(chatCount: number) {
    this.totalChatConversation += chatCount;
  }

  public getTotalChatConversation(): number {
    return this.totalChatConversation;
  }
}
