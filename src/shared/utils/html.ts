// Convert HTML to plain text, preserving line breaks for word counting
export function htmlToText(html: string): string {
  try {
    // Replace <br> and closing block tags with newlines before extracting text
    const withLineBreaks = html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<\/blockquote>/gi, '\n');
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = withLineBreaks;
    return tempDiv.textContent || '';
  } catch {
    // If HTML parsing fails, return the raw string stripped of tags
    return html.replace(/<[^>]*>/g, '');
  }
}
