// A deliberately small Markdown subset. Model text is always escaped; it can
// never create raw HTML, scripts, images, or links in the coaching workspace.
const escapeHTML = (text) => text.replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const inline = (text) => escapeHTML(text)
  .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
  .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');

export function formatBrief(markdown) {
  const blocks = [];
  let paragraph = [], list = [], listType = '', hasContent = false;
  const flushParagraph = () => {
    if (paragraph.length) { blocks.push(`<p>${inline(paragraph.join(' '))}</p>`); paragraph = []; hasContent = true; }
  };
  const flushList = () => {
    if (list.length) { blocks.push(`<${listType}>${list.map(text => `<li>${inline(text)}</li>`).join('')}</${listType}>`); list = []; listType = ''; hasContent = true; }
  };
  for (const line of String(markdown || '').replace(/\r\n?/g, '\n').split('\n')) {
    const text = line.trim();
    if (!text) { flushParagraph(); flushList(); continue; }
    const heading = text.match(/^#{1,6}\s+(.+?)\s*#*$/) || text.match(/^\*\*(.+)\*\*$/);
    const bullet = text.match(/^[-*+]\s+(.+)$/);
    const numbered = text.match(/^\d+[.)]\s+(.+)$/);
    if (heading) {
      flushParagraph(); flushList();
      blocks.push(`<h4 class="${hasContent ? 'brief-heading' : 'brief-title'}">${inline(heading[1])}</h4>`);
      hasContent = true;
    } else if (bullet || numbered) {
      flushParagraph();
      const type = bullet ? 'ul' : 'ol';
      if (listType && listType !== type) flushList();
      listType = type; list.push((bullet || numbered)[1]);
    } else {
      flushList(); paragraph.push(text);
    }
  }
  flushParagraph(); flushList();
  return blocks.join('');
}
