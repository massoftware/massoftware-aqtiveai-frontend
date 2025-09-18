import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';

import { ChatService } from '../../services/chat.service';
import { AuthService } from '../../services/auth.service';
import { MarkdownService } from 'ngx-markdown';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ChatHistoryDetails } from '../../shared/models/chat-history-details.model';
import ChatHistories from '../../shared/models/chat-histories.model';
import { v4 as uuidv4 } from 'uuid';

@Component({
  selector: 'app-chat-content',
  templateUrl: './chat-content.component.html',
  styleUrls: ['./chat-content.component.css'],
})
export class ChatContentComponent
  implements OnInit, AfterViewInit, OnDestroy
{
  constructor(
    private chatService: ChatService,
    private authService: AuthService,
    private markdownService: MarkdownService,
    private snackBar: MatSnackBar
  ) {}

  @ViewChild('window') window!: any;
  @ViewChild('mainChatContainer') chatContainer!: ElementRef;
  public messages: any[] = [];
  public displayMessages: any[] = [];
  isBusy: boolean = false;
  isTyping: boolean = false;
  isLoadingHistory: boolean = false;
  currChatSelected: string = '';
  private typingIntervals: any[] = [];
  private chatTitle: string = 'New Chat';
  private chatSaved: boolean = false;
  private isHistoricalChat: boolean = false;
  private currentChatId: string = '';
  private currentSessionId: string = '';
  private isStoppedByUser: boolean = false;
  private isActiveConversation: boolean = false;
  @ViewChild('textInput', { static: true }) textInputRef!: ElementRef;

  ngOnInit(): void {
    this.scrollToBottom();

    // Subscribe to messages from the chat service (used for sidebar navigation and new chat)
    this.chatService.getMessagesSubject().subscribe(async (messages) => {
      // Always reset active conversation flag when subscription is triggered
      // This handles both new chats (length 0) and historical chat loading (length > 0)
      this.isActiveConversation = false;

      if (this.isHistoricalChat && messages.length > 0) {
        // For historical chats, prepare messages but don't display them yet
        this.isLoadingHistory = true;
        
        // Process messages to ensure custom table formatting is applied
        const processedMessages = await Promise.all(messages.map(async (message) => {
          if (message.role === 'assistant' && message.content) {
            // Apply custom table parsing to assistant messages
            const parsedContent = await this.parseMarkdownWithCustomTables(message.content);
            return {
              ...message,
              content: parsedContent,
              rawContent: message.content // Store original content
            };
          }
          return message;
        }));
        
        this.messages = processedMessages;
        this.displayMessages = []; // Keep display empty while loading

        // Wait for next tick to ensure DOM is ready, then show messages at bottom
        setTimeout(() => {
          this.displayMessages = [...this.messages]; // Create a copy, not a reference!
          // Immediately scroll to bottom without animation
          setTimeout(() => {
            this.scrollToBottomInstant();
            this.isLoadingHistory = false;
          }, 0);
        }, 0);
      } else {
        // For new chats or when adding new messages, show immediately
        const processedMessages = await Promise.all(messages.map(async (message) => {
          if (message.role === 'assistant' && message.content) {
            // Apply custom table parsing to assistant messages
            const parsedContent = await this.parseMarkdownWithCustomTables(message.content);
            return {
              ...message,
              content: parsedContent,
              rawContent: message.content // Store original content
            };
          }
          return message;
        }));
        
        this.messages = processedMessages;
        this.displayMessages = [...processedMessages]; // Create a copy, not a reference!
        this.isLoadingHistory = false;

        
        // Auto-scroll for new messages
        if (messages.length > 0) {
          setTimeout(() => this.scrollToBottom(), 50);
        }
      }
      
      // Reset title when starting new chat or loading history
      if (messages.length === 0) {
        this.chatTitle = 'New Chat';
        this.chatService.setCurrentChatTitle('New Chat');
        this.chatSaved = false;
        this.currentChatId = '';
        this.displayMessages = [];
        this.isLoadingHistory = false;
        this.isActiveConversation = false; // Reset active conversation flag for new chats
        // Don't set isHistoricalChat here as it's managed by the service
      }
    });


    // Subscribe to historical chat state
    this.chatService.getIsHistoricalChat().subscribe((isHistorical) => {
      this.isHistoricalChat = isHistorical;
      // Reset active conversation flag when switching chat modes
      if (isHistorical) {
        this.isActiveConversation = false;
      }
    });

    // Subscribe to chat title changes
    this.chatService.getCurrentChatTitleObservable().subscribe((title) => {
      this.chatTitle = title;
    });

    // Subscribe to current chat ID changes
    this.chatService.getCurrentChatId().subscribe((chatId) => {
      this.currentChatId = chatId || '';
      // If we have a chat ID, mark as saved since it's an existing chat
      if (chatId) {
        this.chatSaved = true;
      }
    });

    // Subscribe to current session ID changes
    this.chatService.getCurrentSessionId().subscribe((sessionId) => {
      this.currentSessionId = sessionId || '';
    });
  }

  ngAfterViewInit() {
    this.textInputRef.nativeElement.focus();
  }

  // Removed ngAfterViewChecked to prevent forced scrolling during typing

  async createCompletion(element: HTMLTextAreaElement) {

    const prompt = element.value;
    if (prompt.length <= 1 || this.isBusy) {
      element.value = '';
      element.style.height = 'auto';
      return;
    }
    element.value = '';
    element.style.height = 'auto';

    // If this was a historical chat, convert it to an active chat now
    if (this.isHistoricalChat) {
      this.isHistoricalChat = false;
      this.chatService.setIsHistoricalChat(false);
    }

    // Mark this as an active conversation to prevent subscription interference
    this.isActiveConversation = true;

    const message: any = {
      role: 'user',
      content: prompt,
    };

    this.messages.push(message);
    this.displayMessages.push(message);

    setTimeout(() => this.scrollToBottom(), 50); // Always scroll to bottom for new user message

    try {
      this.isBusy = true;

      // Use the user's current message as the query for the database API
      const result = await this.chatService.createCompletionViaDatabase(prompt);

      // Create empty assistant message first
      const responseMessage: any = {
        role: 'assistant',
        content: ''
      };

      this.messages.push(responseMessage);
      this.displayMessages.push(responseMessage);

      // Hide loading indicator and start typing effect
      this.isBusy = false;
      this.isTyping = true;
      
      // Save chat history immediately when AI starts responding
      if (this.messages.length >= 2) {
        // For historical chats, update existing. For new chats, create new entry.
        if (this.currentChatId) {
          // This is a follow-up to an existing chat, just update it
          await this.saveChatHistory();
        } else {
          // This is a new chat, create initial entry
          await this.saveChatHistoryInitial();
        }
      }
      
      this.typeMessage(result.response, this.messages.length - 1);
    } catch (err) {
      this.isBusy = false;
      this.isTyping = false;
      this.snackBar.open(
        'Database API Request Failed, please check if the API server is running.',
        'Close',
        {
          horizontalPosition: 'end',
          verticalPosition: 'bottom',
          duration: 5000,
        }
      );
    }

    // Note: isBusy and chatService.setMessagesSubject are now handled in typeMessage method
  }

  scrollToBottom() {
    setTimeout(() => {
      if (this.chatContainer && this.chatContainer.nativeElement) {
        const container = this.chatContainer.nativeElement;
        container.scrollTo({
          top: container.scrollHeight,
          behavior: 'instant'
        });
      }
    }, 50);
  }

  scrollToBottomInstant() {
    if (this.chatContainer && this.chatContainer.nativeElement) {
      const container = this.chatContainer.nativeElement;
      container.scrollTop = container.scrollHeight;
    }
  }

  autoResize(event: any) {
    const textarea = event.target;
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  }

  stopTyping() {
    this.isStoppedByUser = true;
  }

  private identifyTableRegions(text: string): Array<{start: number, end: number}> {
    const regions: Array<{start: number, end: number}> = [];
    
    // Convert literal \n to actual newlines for processing
    const normalizedText = text.replace(/\\n/g, '\n');
    
    // Find table patterns in the text
    const tableRegex = /\|[^|]+\|(?:\r?\n\|[-\s|:]+\|)?\r?\n(?:\|[^|\r\n]*\|(?:\r?\n|$))*/g;
    let match;
    
    while ((match = tableRegex.exec(normalizedText)) !== null) {
      const tableStart = match.index;
      const tableEnd = match.index + match[0].length;
      
      // Convert back to original text positions (accounting for \n vs \\n)
      let originalStart = 0;
      let originalEnd = 0;
      let normalizedPos = 0;
      let originalPos = 0;
      
      // Find start position in original text
      while (normalizedPos < tableStart && originalPos < text.length) {
        if (text.substring(originalPos, originalPos + 2) === '\\n') {
          originalPos += 2; // Skip \\n
          normalizedPos += 1; // Counts as one \n
        } else {
          originalPos++;
          normalizedPos++;
        }
      }
      originalStart = originalPos;
      
      // Find end position in original text
      while (normalizedPos < tableEnd && originalPos < text.length) {
        if (text.substring(originalPos, originalPos + 2) === '\\n') {
          originalPos += 2; // Skip \\n
          normalizedPos += 1; // Counts as one \n
        } else {
          originalPos++;
          normalizedPos++;
        }
      }
      originalEnd = originalPos;
      
      regions.push({ start: originalStart, end: originalEnd });
    }
    
    return regions;
  }

  typeMessage(fullText: string, messageIndex: number) {
    let currentText = '';
    let currentIndex = 0;
    const typingSpeed = 5; // milliseconds between characters (much faster)
    let lastTime = performance.now();
    let animationId: number;
    this.isStoppedByUser = false; // Reset stop flag
    
    // Pre-analyze text to identify table regions
    const tableRegions = this.identifyTableRegions(fullText);
    
    const typeNextCharacter = async (currentTime: number) => {
      // Check if user stopped typing
      if (this.isStoppedByUser) {
        // Finish typing with current content and save to history
        if (this.messages[messageIndex]) {
          this.messages[messageIndex].content = await this.parseMarkdownWithCustomTables(currentText);
          this.messages[messageIndex].rawContent = currentText;
          this.displayMessages[messageIndex].content = this.messages[messageIndex].content;
          this.displayMessages[messageIndex].rawContent = currentText;
        }
        
        // Update chat history with current content
        await this.saveChatHistory();
        
        // Clean up
        this.isTyping = false;
        const frameIndex = this.typingIntervals.indexOf(animationId);
        if (frameIndex > -1) {
          this.typingIntervals.splice(frameIndex, 1);
        }
        return;
      }
      
      if (currentTime - lastTime >= typingSpeed) {
        if (currentIndex < fullText.length) {
          // Check if we're about to enter a table region
          const nextTableRegion = tableRegions.find(region => region.start === currentIndex);
          
          if (nextTableRegion) {
            // Jump to end of table and add complete table content instantly
            currentIndex = nextTableRegion.end;
            currentText = fullText.substring(0, currentIndex);
          } else {
            // Normal character-by-character typing
            currentText += fullText[currentIndex];
            currentIndex++;
          }
          
          // Parse and update content
          const parsedText = await this.parseMarkdownWithCustomTables(currentText);
          
          // Update the message content
          if (this.messages[messageIndex]) {
            this.messages[messageIndex].content = parsedText;
            this.displayMessages[messageIndex].content = parsedText;
            // Store the raw text for saving to history
            this.messages[messageIndex].rawContent = currentText;
            this.displayMessages[messageIndex].rawContent = currentText;
            // Auto-scroll only if user is already at the bottom
            setTimeout(() => this.scrollToBottomIfAtBottom(), 10);
          }
          
          lastTime = currentTime;
        } else {
          // Typing finished
          this.isTyping = false;
          if (this.messages[messageIndex]) {
            this.messages[messageIndex].content = await this.parseMarkdownWithCustomTables(fullText);
            this.messages[messageIndex].rawContent = fullText;
            this.displayMessages[messageIndex].content = this.messages[messageIndex].content;
            this.displayMessages[messageIndex].rawContent = fullText;
          }
          
          // Don't update chat service during active conversations to avoid duplication
          // The subscription is only used for loading historical chats and new chat navigation
          
          // Update chat history with final content
          await this.saveChatHistory();
          
          // Clear animation frame
          const frameIndex = this.typingIntervals.indexOf(animationId);
          if (frameIndex > -1) {
            this.typingIntervals.splice(frameIndex, 1);
          }
          return;
        }
      }
      
      // Continue with next frame
      animationId = requestAnimationFrame(typeNextCharacter);
      this.typingIntervals.push(animationId);
    };
    
    // Start typing
    animationId = requestAnimationFrame(typeNextCharacter);
    this.typingIntervals.push(animationId);
  }


  private async parseMarkdownWithCustomTables(text: string): Promise<string> {
    // First, convert literal \n to actual newlines for processing
    const normalizedText = text.replace(/\\n/g, '\n');
    
    // Check if the text contains markdown table syntax
    const tableRegex = /\|[^|]+\|(?:\n\|[-\s|:]+\|)?\n(?:\|[^|]*\|(?:\n|$))+/g;
    
    if (!tableRegex.test(normalizedText)) {
      // No tables found, use regular markdown parsing
      return await this.markdownService.parse(normalizedText);
    }
    
    // Reset regex for actual matching
    tableRegex.lastIndex = 0;
    let processedText = normalizedText;
    let match;
    
    // Find and replace all tables
    while ((match = tableRegex.exec(normalizedText)) !== null) {
      const tableMarkdown = match[0];
      const customTable = this.convertToCustomTable(tableMarkdown);
      processedText = processedText.replace(tableMarkdown, customTable);
    }
    
    // Parse the rest as markdown (everything except the custom tables)
    const parts = processedText.split(/(<div class="custom-table">[\s\S]*?<\/div>)/);
    let finalResult = '';
    
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].includes('custom-table')) {
        // This is our custom table, keep as-is
        finalResult += parts[i];
      } else {
        // Parse this part as markdown
        finalResult += await this.markdownService.parse(parts[i]);
      }
    }
    
    return finalResult;
  }

  private convertToCustomTable(markdownTable: string): string {
    const lines = markdownTable.trim().split('\n').filter(line => line.trim());
    if (lines.length < 3) return markdownTable; // Not a valid table
    
    // Extract header - remove leading/trailing pipes and split
    const headerLine = lines[0].replace(/^\||\|$/g, '');
    const headers = headerLine.split('|').map(h => h.trim());
    
    // Find separator line (contains dashes)
    let separatorIndex = -1;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].includes('-')) {
        separatorIndex = i;
        break;
      }
    }
    
    if (separatorIndex === -1) return markdownTable; // No separator found
    
    // Extract data rows (after separator line)
    const dataLines = lines.slice(separatorIndex + 1);
    const rows = dataLines.map(line => {
      const cleanLine = line.replace(/^\||\|$/g, '');
      return cleanLine.split('|').map(cell => cell.trim());
    });
    
    // Build custom table HTML
    let html = '<div class="custom-table">';
    
    // Header
    html += '<div class="custom-table-header">';
    headers.forEach(header => {
      html += `<div class="custom-table-header-cell">${header}</div>`;
    });
    html += '</div>';
    
    // Rows
    rows.forEach(row => {
      html += '<div class="custom-table-row">';
      row.forEach((cell, index) => {
        if (index < headers.length) { // Only show cells that have corresponding headers
          html += `<div class="custom-table-cell">${cell}</div>`;
        }
      });
      html += '</div>';
    });
    
    html += '</div>';
    return html;
  }


  isAtBottom(): boolean {
    if (!this.chatContainer || !this.chatContainer.nativeElement) {
      return true;
    }
    const container = this.chatContainer.nativeElement;
    const threshold = 30; // pixels from bottom
    return container.scrollTop + container.clientHeight >= container.scrollHeight - threshold;
  }

  scrollToBottomIfAtBottom() {
    if (this.isAtBottom()) {
      this.scrollToBottom();
    }
  }

  getChatTitle(): string {
    return this.chatTitle;
  }

  getPersonalizedGreeting(): string {
    const userName = this.authService.getUserName();
    return `Hi ${userName}, ready when you are.`;
  }

  getCurrentChatTitleForSaving(): string {
    // Return the generated title if available, otherwise generate a fallback
    if (this.chatTitle !== 'New Chat') {
      return this.chatTitle;
    }
    
    // Fallback: use first user message if no title generated yet
    if (this.messages.length > 0 && this.messages[0].role === 'user') {
      const firstMessage = this.messages[0].content;
      if (typeof firstMessage === 'string') {
        return firstMessage.length > 50 
          ? firstMessage.substring(0, 50) + '...' 
          : firstMessage;
      }
    }
    
    return 'New Chat';
  }

  async generateChatTitle() {
    try {
      // Only generate title if we have at least one AI response and no custom title yet
      if (this.messages.length >= 2 && this.chatTitle === 'New Chat') {
        const userMessage = this.messages[0]?.content || '';

        // Generate a concise title from the user's first message
        const generatedTitle = await this.chatService.getTitleFromDatabase(userMessage);
        if (generatedTitle) {
          this.chatTitle = generatedTitle.replace(/['"]/g, ''); // Remove quotes if any
          this.chatService.setCurrentChatTitle(this.chatTitle); // Update service
        }
      }
    } catch (error) {
      console.log('Failed to generate title, keeping default');
      // Keep the default title if generation fails
    }
  }

  async saveChatHistoryInitial() {
    
    // Only save if it's a truly new chat (no currentChatId) with messages and hasn't been saved yet
    if (!this.chatSaved && !this.currentChatId && this.messages.length > 0) {
      try {
        const chatHistoryId = uuidv4();
        
        // Generate title first if needed
        if (this.chatTitle === 'New Chat' && this.messages.length >= 2) {
          await this.generateChatTitle();
        }
        
        // Use the current chat title
        let title = this.chatTitle;
        
        // Fallback if title is still "New Chat"
        if (title === 'New Chat' && this.messages.length > 0) {
          const firstUserMessage = this.messages.find((m: any) => m.role === 'user')?.content;
          if (typeof firstUserMessage === 'string') {
            title = firstUserMessage.length > 50 
              ? firstUserMessage.substring(0, 50) + '...' 
              : firstUserMessage;
          }
        }

        // Create clean messages for saving (use rawContent if available, otherwise content)
        const cleanMessages = this.messages.map(msg => ({
          role: msg.role,
          content: (msg as any).rawContent || msg.content
        }));

        const chatHistory: ChatHistoryDetails = {
          id: chatHistoryId,
          messages: cleanMessages,
          title: title,
          sessionId: this.currentSessionId || undefined,
        };

        // Store the chat ID for later updates
        this.currentChatId = chatHistoryId;

        const currentHistories = this.getCurrentChatHistoriesFromLocalStorage();
        console.log('Current histories before save:', currentHistories.chatHistoryDetails.length);
        
        // Add new chat to the beginning of the list
        currentHistories.chatHistoryDetails.unshift(chatHistory);
        
        // Save to localStorage
        this.setChatHistoriesToLocalStorage(currentHistories);
        console.log('Saved to localStorage, new count:', currentHistories.chatHistoryDetails.length);
        
        // Mark as saved
        this.chatSaved = true;
        
        // Notify other components that chat history was updated
        this.chatService.notifyChatHistoryUpdated();
        
      } catch (error) {
        console.error('Failed to save initial chat history:', error);
      }
    }
  }

  async saveChatHistory() {
    
    // This method now updates existing chat with final content
    if (this.chatSaved && this.currentChatId) {
      try {
        
        const currentHistories = this.getCurrentChatHistoriesFromLocalStorage();
        const chatIndex = currentHistories.chatHistoryDetails.findIndex(
          chat => chat.id === this.currentChatId
        );
        
        if (chatIndex !== -1) {
          // Create clean messages for saving (use rawContent if available, otherwise content)
          const cleanMessages = this.messages.map(msg => ({
            role: msg.role,
            content: (msg as any).rawContent || msg.content
          }));
          
          // Update the existing chat with the complete messages and session ID
          currentHistories.chatHistoryDetails[chatIndex].messages = cleanMessages;
          if (this.currentSessionId) {
            currentHistories.chatHistoryDetails[chatIndex].sessionId = this.currentSessionId;
          }
          
          // Save to localStorage
          this.setChatHistoriesToLocalStorage(currentHistories);
          
          // Notify other components that chat history was updated
          this.chatService.notifyChatHistoryUpdated();
        }
      } catch (error) {
        console.error('Failed to update chat history:', error);
      }
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

  ngOnDestroy() {
    // Clean up any running typing animation frames
    this.typingIntervals.forEach(animationId => cancelAnimationFrame(animationId));
  }
}
