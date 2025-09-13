import { Component, OnInit } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';

import { ApiKeyService } from '../services/api-key.service';
import { ChatDataService } from '../services/chat-data.service';
import ChatHistories from '../shared/models/chat-histories.model';
import { ChatHistoryDetails } from '../shared/models/chat-history-details.model';
import { ChatService } from '../services/chat.service';
import { UserDialogComponent } from '../user-dialog/user-dialog.component';
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
    private dialogModel: MatDialog,
    private apiKeyService: ApiKeyService
  ) {}

  messages: ChatMessage[] = [];
  chatHistories: ChatHistories = {
    chatHistoryDetails: [],
  };
  filteredChats: ChatHistoryDetails[] = [];
  searchTerm: string = '';
  userDialogBox!: MatDialogRef<UserDialogComponent>;
  apiKey: string = '';
  isHistoricalChat: boolean = false;
  selectedChatId: string | null = null;

  ngOnInit(): void {
    this.chatService.getMessagesSubject().subscribe((messages) => {
      this.messages = messages;
    });
    
    // Listen for chat history updates
    this.chatService.getChatHistoryUpdated().subscribe(() => {
      console.log('Sidebar received chat history update notification');
      this.refreshChatHistories();
    });
    
    this.chatHistories = this.getCurrentChatHistoriesFromLocalStorage();
    this.filteredChats = this.chatHistories.chatHistoryDetails;
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

  getHistoryChatMessages(id: string) {
    const history = this.chatHistories.chatHistoryDetails.find(
      (c) => c.id === id
    );

    if (history) {
      // Convert any potential null content to empty string for compatibility
      const safeMessages: ChatMessage[] = history.messages.map(msg => ({
        role: msg.role,
        content: msg.content || ''
      }));
      
      this.chatService.setMessagesSubject(safeMessages);
      this.chatService.setIsHistoricalChat(true);
      this.chatService.setCurrentChatTitle(history.title); // Set the chat title
      this.chatService.setCurrentChatId(id); // Set the current chat ID for saving
      this.chatService.setCurrentSessionId(history.sessionId || null); // Set the session ID for continuity
      this.isHistoricalChat = true;
      this.selectedChatId = id; // Set the selected chat ID
    }
  }

  getCurrentChatHistoriesFromLocalStorage(): ChatHistories {
    const currentHistories = localStorage.getItem('chatHistories');

    if (currentHistories) {
      const histories = JSON.parse(currentHistories) as ChatHistories;
      return {
        chatHistoryDetails: histories.chatHistoryDetails,
      };
    }

    return {
      chatHistoryDetails: [],
    };
  }

  setChatHistoriesToLocalStorage(chatHistories: ChatHistories) {
    localStorage.setItem('chatHistories', JSON.stringify(chatHistories));
  }

  deleteHistoricalChat(id: string) {
    this.chatHistories.chatHistoryDetails =
      this.chatHistories.chatHistoryDetails.filter((c) => c.id !== id);

    this.setChatHistoriesToLocalStorage(this.chatHistories);
    this.filterChats();
  }

  dialog() {
    const dialogRef = this.dialogModel.open(UserDialogComponent, {
      data: {
        message:
          "It's not stored in our end, it's only available in your browser localStorage",
        title: 'Please enter your API key',
      },
      width: '400px',
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.apiKey = result.apiKey;

        // Emit the api key event with new api key.
        this.apiKeyService.setApiKey();

        this.chatService.updateConfiguration();
      }
      this.chatDataService.setAPIKeyToLocalStore(this.apiKey);
    });
  }

  private checkIsChatHistoryExists(id: string) {
    const result = this.chatHistories.chatHistoryDetails.some(
      (c) => c.id === id
    );
    return result;
  }

  refreshChatHistories() {
    console.log('Refreshing chat histories...');
    // Add a small delay to ensure localStorage is updated
    setTimeout(() => {
      this.chatHistories = this.getCurrentChatHistoriesFromLocalStorage();
      console.log('Loaded chat histories:', this.chatHistories.chatHistoryDetails.length);
      this.filterChats();
      console.log('Filtered chats:', this.filteredChats.length);
    }, 100);
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
}
