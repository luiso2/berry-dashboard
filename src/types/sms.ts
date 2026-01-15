// SMS Conversation Types

export interface SMSMessage {
  id: number;
  user_id: number | null;
  from_number: string;
  to_number: string;
  direction: 'inbound' | 'outbound';
  message: string;
  ai_response: string | null;
  is_read: boolean;
  is_human_takeover: boolean;
  created_at: string;
}

export interface SMSThread {
  phone: string;
  message_count: number;
  unread_count: number;
  is_human_takeover: boolean;
  last_message: string;
  last_message_time: string;
}

export interface SMSStats {
  total_conversations: number;
  total_messages: number;
  unread_messages: number;
  human_takeover_count: number;
  messages_today: number;
}
