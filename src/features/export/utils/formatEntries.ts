import type { JournalEntry } from '@features/journal';

export function formatEntriesAsText(entries: JournalEntry[]): string {
  if (entries.length === 0) return '';

  // Sort entries by date ascending (oldest first)
  const sortedEntries = [...entries].sort((a, b) => a.date.localeCompare(b.date));

  let textContent = `# good days\n\n`;
  textContent += '---\n';

  sortedEntries.forEach(entry => {
    const date = new Date(entry.date + 'T00:00:00');
    const formattedDate = date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    textContent += `\n## ${formattedDate}\n\n`;
    if (entry.startedAt) {
      const startTime = new Date(entry.startedAt);
      const hours = String(startTime.getHours()).padStart(2, '0');
      const minutes = String(startTime.getMinutes()).padStart(2, '0');
      const seconds = String(startTime.getSeconds()).padStart(2, '0');
      textContent += `*Started at ${hours}:${minutes}:${seconds}*\n\n`;
    }

    // Get text content from HTML, preserving line breaks
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = entry.content;

    // Convert <br> and block elements to newlines
    tempDiv.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
    tempDiv.querySelectorAll('div, p').forEach(div => {
      const text = div.textContent || '';
      div.replaceWith(text + '\n');
    });

    let plainText = tempDiv.textContent || '';
    // Remove excessive newlines (more than 2 in a row) and trim
    plainText = plainText.replace(/\n{3,}/g, '\n\n').trim();

    textContent += plainText + '\n\n';
  });

  return textContent;
}
