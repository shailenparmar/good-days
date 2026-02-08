export type { JournalEntry } from '@features/journal';

export interface StatisticsState {
  totalKeystrokes: number;
  totalSecondsOnApp: number;
}

export interface StatisticsActions {
  incrementKeystrokes: () => void;
}
