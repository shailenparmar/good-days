export interface StatisticsState {
  totalKeystrokes: number;
  totalSecondsOnApp: number;
}

export interface StatisticsActions {
  incrementKeystrokes: () => void;
}

export interface JournalEntry {
  date: string;
  content: string;
  startedAt?: number;
  lastModified?: number;
}
