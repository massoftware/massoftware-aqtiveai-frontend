import { Component, OnInit } from '@angular/core';

import { ChatDataService } from '../services/chat-data.service';
import ChatHistories from '../shared/models/chat-histories.model';
import { ChatHistoryDetails } from '../shared/models/chat-history-details.model';
import { ChatService } from '../services/chat.service';
import { AuthService } from '../services/auth.service';
import { v4 as uuidv4 } from 'uuid';

// Interface for chat messages (matching the one in ChatService)
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.css'],
})
export class SidebarComponent implements OnInit {
  constructor(
    private chatDataService: ChatDataService,
    private chatService: ChatService,
    private authService: AuthService
  ) {}

  messages: ChatMessage[] = [];
  chatHistories: ChatHistories = {
    chatHistoryDetails: [],
  };
  filteredChats: ChatHistoryDetails[] = [];
  searchTerm: string = '';
  isHistoricalChat: boolean = false;
  selectedChatId: string | null = null;
  private refreshTimeout: any;

  connectionStatus: 'checking' | 'success' | 'failed' | null = null;
  connectionMessage: string = '';

  ngOnInit(): void {
    this.chatService.getMessagesSubject().subscribe((messages) => {
      this.messages = messages;
    });

    // Listen for chat history updates
    this.chatService.getChatHistoryUpdated().subscribe(() => {
      this.refreshChatHistories();
    });

    // Load chat histories from API instead of localStorage
    this.loadChatHistories();

    // Validate database connection
    this.validateDatabaseConnection();
  }

  addNewChat() {
    // Simply clear the current chat and reset to new chat state
    // Chat history is now auto-saved when AI responds
    this.chatService.setMessagesSubject([]);
    this.chatService.setIsHistoricalChat(false);
    this.chatService.setCurrentChatId(null); // Clear current chat ID
    this.chatService.setCurrentSessionId(null); // Clear session ID for fresh start
    this.isHistoricalChat = false;
    this.selectedChatId = null; // Clear selection when starting new chat
  }

  async getHistoryChatMessages(id: string) {
    console.log('Loading chat history for ID:', id);
    console.log('ID type:', typeof id);
    console.log('Available chat IDs:', this.filteredChats.map(c => c.id));

    // Guard against undefined or invalid IDs
    if (!id || id === 'undefined') {
      console.error('Invalid chat ID provided:', id);
      return;
    }

    try {
      // First try to find in already loaded histories
      let history = this.chatHistories.chatHistoryDetails.find(
        (c) => c.id === id
      );

      // Since we're only loading session list (without messages), we need to fetch individual session details
      // Only skip API call if we already have messages loaded
      if (!history || !history.messages || history.messages.length === 0) {
        console.log('Chat messages not loaded, fetching from API...');
        const sessionDetail = await this.chatDataService.getChatSession(id);
        history = {
          id: sessionDetail.session.session_id,
          title: sessionDetail.session.title,
          sessionId: sessionDetail.session.session_id,
          messages: sessionDetail.messages.map(msg => ({
            role: msg.role,
            content: msg.content
          }))
        };

        // Update the local cache with the loaded messages
        const historyIndex = this.chatHistories.chatHistoryDetails.findIndex(c => c.id === id);
        if (historyIndex !== -1) {
          this.chatHistories.chatHistoryDetails[historyIndex] = history;
        }
      }

      if (history) {
        console.log('Found chat history:', history.title, 'with', history.messages.length, 'messages');

        // Convert any potential null content to empty string for compatibility
        const safeMessages: ChatMessage[] = history.messages.map(msg => ({
          role: msg.role,
          content: msg.content || ''
        }));

        this.chatService.setMessagesSubject(safeMessages);
        this.chatService.setIsHistoricalChat(true);
        this.chatService.setCurrentChatTitle(history.title);
        this.chatService.setCurrentChatId(id);
        this.chatService.setCurrentSessionId(history.sessionId || null);
        this.isHistoricalChat = true;
        this.selectedChatId = id;
      } else {
        console.error('Chat history not found for ID:', id);
      }
    } catch (error) {
      console.error('Failed to load chat history:', error);
    }
  }

  async loadChatHistories(): Promise<void> {
    try {
      console.log('Loading chat histories from API...');
      const histories = await this.chatDataService.getAllChatHistories();
      console.log('Loaded', histories.length, 'chat histories from API');
      console.log('Raw API histories:', histories);

      this.chatHistories = {
        chatHistoryDetails: histories
      };
      this.filteredChats = this.chatHistories.chatHistoryDetails;
      console.log('Updated filteredChats:', this.filteredChats.length);
      console.log('Filtered chats structure:', this.filteredChats);

      // Log each chat's ID to debug
      this.filteredChats.forEach((chat, index) => {
        console.log(`Chat ${index}: ID="${chat.id}", Title="${chat.title}"`);
      });
    } catch (error) {
      console.error('Failed to load chat histories from API:', error);
      console.error('API Error type:', typeof error);
      console.error('API Error message:', (error as any)?.message || 'Unknown error');

      // Initialize empty chat histories if API fails
      this.chatHistories = {
        chatHistoryDetails: [],
      };
      this.filteredChats = [];
    }
  }

  async deleteHistoricalChat(id: string): Promise<void> {
    try {
      // Delete from API
      await this.chatDataService.deleteChatSession(id);

      // Update local state
      this.chatHistories.chatHistoryDetails =
        this.chatHistories.chatHistoryDetails.filter((c) => c.id !== id);

      this.filterChats();
    } catch (error) {
      console.error('Failed to delete chat session:', error);
      // You might want to show a user-friendly error message here
    }
  }



  private checkIsChatHistoryExists(id: string) {
    const result = this.chatHistories.chatHistoryDetails.some(
      (c) => c.id === id
    );
    return result;
  }

  refreshChatHistories() {
    // Add a small delay to batch multiple refresh requests
    clearTimeout(this.refreshTimeout);
    this.refreshTimeout = setTimeout(() => {
      this.loadChatHistories();
    }, 500); // 500ms delay to batch multiple refresh calls
  }

  filterChats() {
    if (!this.searchTerm.trim()) {
      this.filteredChats = this.chatHistories.chatHistoryDetails;
    } else {
      this.filteredChats = this.chatHistories.chatHistoryDetails.filter(chat =>
        chat.title.toLowerCase().includes(this.searchTerm.toLowerCase())
      );
    }
  }


  async validateDatabaseConnection(): Promise<void> {
    this.connectionStatus = 'checking';
    this.connectionMessage = 'Checking connection...';

    try {
      const result = await this.chatDataService.validateConnection();

      if (result.valid) {
        this.connectionStatus = 'success';
        this.connectionMessage = 'DB Connection Success';
      } else {
        this.connectionStatus = 'failed';
        this.connectionMessage = 'DB Connection Failed';
      }
    } catch (error) {
      console.error('Connection validation failed:', error);
      this.connectionStatus = 'failed';
      this.connectionMessage = 'DB Connection Failed';
    }
  }

  // Diagnostic method - call from browser console
  diagnose() {
    console.log('=== SIDEBAR DIAGNOSIS ===');
    console.log('Total chat histories:', this.chatHistories.chatHistoryDetails.length);
    console.log('Filtered chats:', this.filteredChats.length);
    console.log('Chat histories structure:', this.chatHistories);
    console.log('Individual chat details:');
    this.chatHistories.chatHistoryDetails.forEach((chat, index) => {
      console.log(`  ${index}: ID="${chat.id}" (${typeof chat.id}), Title="${chat.title}", Messages=${chat.messages?.length || 0}`);
    });

    return {
      totalChats: this.chatHistories.chatHistoryDetails.length,
      filteredChats: this.filteredChats.length
    };
  }
}
