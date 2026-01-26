export interface JournalEntry {
  date: string; // YYYY-MM-DD format
  content: string;
  startedAt?: number; // Timestamp when entry was first created
  lastModified?: number; // Timestamp when entry was last modified
}

export interface JournalState {
  entries: JournalEntry[];
  selectedDate: string;
  currentContent: string;
}

export interface JournalActions {
  setEntries: (entries: JournalEntry[]) => void;
  setSelectedDate: (date: string) => void;
  setCurrentContent: (content: string) => void;
  saveEntry: (content: string, timestamp?: number) => void;
}
