export type IdeaStatus = 'inbox' | 'tomorrow' | 'archived' | 'processed';

export interface Idea {
  id: string;
  text: string;
  status: IdeaStatus;
  created_at: string;
  updated_at?: string;
}

export interface Settings {
  id?: string;
  news_topics: string[];
  alarm_time: string;
  is_alarm_enabled: boolean;
  created_at?: string;
  updated_at?: string;
}
