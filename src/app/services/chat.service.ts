import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

// Interface for database API request/response
interface DatabaseQueryRequest {
  query: string;
  session_id?: string;
}

interface DatabaseQueryResponse {
  response: string;
  session_id: string;
}

// Interface for chat messages (simplified from OpenAI format)
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

@Injectable({
  providedIn: 'root',
})
export class ChatService {
  private databaseApiUrl = 'http://localhost:8000'; // Your FastAPI endpoint

  messages: ChatMessage[] = [];
  private messagesSubject = new BehaviorSubject<ChatMessage[]>(
    []
  );
  private currentChatTitle = new BehaviorSubject<string>('New Chat');
  private chatHistoryUpdated = new BehaviorSubject<boolean>(false);
  private isHistoricalChat = new BehaviorSubject<boolean>(false);
  private currentChatId = new BehaviorSubject<string | null>(null);
  private currentSessionId = new BehaviorSubject<string | null>(null);

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {}

  public updateConfiguration(): void {
    // No longer needed for database API
  }

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

  async createCompletionViaDatabase(query: string): Promise<{response: string, sessionId: string}> {
    const request: DatabaseQueryRequest = {
      query,
      session_id: this.currentSessionId.value || undefined
    };

    console.log('Making request to:', `${this.databaseApiUrl}/ask/`);
    console.log('Request body:', JSON.stringify(request));

    try {
      const response = await firstValueFrom(
        this.http.post<DatabaseQueryResponse>(
          `${this.databaseApiUrl}/ask/`,
          request,
          {
            headers: this.getHeaders()
          }
        )
      );

      console.log('Response received:', response);

      // Update the current session ID
      if (response.session_id) {
        this.currentSessionId.next(response.session_id);
      }

      return {
        response: response.response,
        sessionId: response.session_id
      };
    } catch (error) {
      console.error('Database API error details:', error);
      if (error instanceof Error) {
        console.error('Error message:', error.message);
      }
      throw new Error('Failed to get response from database API');
    }
  }

  async getTitleFromDatabase(query: string): Promise<string> {
    try {
      const titleQuery = `Generate a short 2-4 word title for this question: ${query}`;
      const result = await this.createCompletionViaDatabase(titleQuery);
      return result.response.substring(0, 50); // Limit title length
    } catch (error) {
      console.error('Failed to generate title:', error);
      // Return a fallback title based on the query
      return query.length > 30 ? query.substring(0, 30) + '...' : query;
    }
  }

  public setMessagesSubject(event: ChatMessage[]) {
    this.messagesSubject.next(event);
  }

  public getMessagesSubject(): Observable<ChatMessage[]> {
    return this.messagesSubject.asObservable();
  }

  public setCurrentChatTitle(title: string) {
    this.currentChatTitle.next(title);
  }

  public getCurrentChatTitle(): string {
    return this.currentChatTitle.value;
  }

  public getCurrentChatTitleObservable(): Observable<string> {
    return this.currentChatTitle.asObservable();
  }

  public notifyChatHistoryUpdated() {
    this.chatHistoryUpdated.next(true);
  }

  public getChatHistoryUpdated(): Observable<boolean> {
    return this.chatHistoryUpdated.asObservable();
  }

  public setIsHistoricalChat(isHistorical: boolean) {
    this.isHistoricalChat.next(isHistorical);
  }

  public getIsHistoricalChat(): Observable<boolean> {
    return this.isHistoricalChat.asObservable();
  }

  public getIsHistoricalChatValue(): boolean {
    return this.isHistoricalChat.value;
  }

  public setCurrentChatId(chatId: string | null) {
    this.currentChatId.next(chatId);
  }

  public getCurrentChatId(): Observable<string | null> {
    return this.currentChatId.asObservable();
  }

  public getCurrentChatIdValue(): string | null {
    return this.currentChatId.value;
  }

  public setCurrentSessionId(sessionId: string | null) {
    this.currentSessionId.next(sessionId);
  }

  public getCurrentSessionId(): Observable<string | null> {
    return this.currentSessionId.asObservable();
  }

  public getCurrentSessionIdValue(): string | null {
    return this.currentSessionId.value;
  }
}
