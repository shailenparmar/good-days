// Date utility functions

export function getTodayDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const entryDate = new Date(date);
  entryDate.setHours(0, 0, 0, 0);

  const formattedDate = date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).toLowerCase();

  if (entryDate.getTime() === today.getTime()) {
    return 'today';
  } else if (entryDate.getTime() === yesterday.getTime()) {
    return 'yesterday';
  } else {
    return formattedDate;
  }
}

export function getTimeUntilMidnight(): string {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  const msUntilMidnight = tomorrow.getTime() - now.getTime();
  const hours = Math.floor(msUntilMidnight / (1000 * 60 * 60));
  const minutes = Math.floor((msUntilMidnight % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((msUntilMidnight % (1000 * 60)) / 1000);

  return `${hours}h ${minutes}m ${seconds}s`;
}

export function formatTimeSpent(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s active`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s active`;
  } else {
    return `${seconds}s active`;
  }
}
