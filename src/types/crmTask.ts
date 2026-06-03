export type CrmContactType = 'client' | 'partner' | 'lead' | 'other';
export type CrmTaskStatus  = 'active' | 'done' | 'cancelled';

export interface CrmTask {
  id:              string;
  chat_id:         string;
  contact_name:    string;
  contact_phone:   string | null;
  contact_type:    CrmContactType;
  agreement:       string;
  action_required: string;
  deadline_text:   string | null;
  deadline_at:     string | null;
  next_step:       string | null;
  comment:         string | null;
  status:          CrmTaskStatus;
  raw_text:        string;
  created_at:      string;
  updated_at:      string;
  completed_at:    string | null;
}

export interface ParsedCrmTask {
  contact_name:    string;
  contact_phone:   string | null;
  contact_type:    CrmContactType;
  agreement:       string;
  action_required: string;
  deadline_text:   string | null;
  deadline_at:     string | null;
  next_step:       string | null;
  comment:         string | null;
}
