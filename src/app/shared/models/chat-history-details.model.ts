// Interface for chat messages
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatHistoryDetails {
  id: string;
  title: string;
  messages: ChatMessage[];
  sessionId?: string;
}
