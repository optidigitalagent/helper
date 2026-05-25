export type CaptureType = 'checklist' | 'call_summary' | 'client_notes' | 'raw_note';

export interface CaptureEntity {
  name:        string;
  status?:     string;
  context?:    string;
  next_action?: string;
  request?:    string;
}

export interface CaptureNote {
  id:           string;
  chat_id:      string;
  type:         CaptureType;
  title:        string;
  topic:        string | null;
  raw_text:     string;
  summary:      string;
  entities:     CaptureEntity[];
  done_items:   string[];
  waiting_items: string[];
  next_actions: string[];
  tags:         string[];
  metadata:     Record<string, unknown>;
  created_at:   string;
  updated_at:   string;
}

export interface ParsedCapture {
  title:         string;
  topic?:        string;
  entities:      CaptureEntity[];
  done_items:    string[];
  waiting_items: string[];
  next_actions:  string[];
  summary:       string;
  tags:          string[];
}
