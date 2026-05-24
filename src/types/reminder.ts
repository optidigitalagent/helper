export type ReminderPriority = 'low' | 'normal' | 'high' | 'urgent';
export type ReminderStatus   = 'active' | 'done' | 'deleted';

export interface Reminder {
  id:               string;
  user_id:          string | null;
  chat_id:          string;
  source:           string;
  raw_text:         string;
  normalized_title: string;
  notes:            string | null;
  due_at:           string | null;
  due_date:         string | null;
  timezone:         string;
  priority:         ReminderPriority;
  status:           ReminderStatus;
  tags:             string[];
  metadata:         Record<string, unknown>;
  created_at:       string;
  updated_at:       string;
  completed_at:     string | null;
}

export interface ParsedReminder {
  normalized_title: string;
  notes:            string | null;
  due_at:           string | null;
  due_date:         string | null;
  priority:         ReminderPriority;
  tags:             string[];
}
