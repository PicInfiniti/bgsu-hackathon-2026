import { escapeText } from './review-state.js';

export function assistantAnswerMarkup(result) {
  const sources = new Map(result.sources.map(s => [s.source_id, s]));
  const link = id => {
    const s = sources.get(id);
    return s ? `<button type="button" class="assistant-citation" data-assistant-source="${escapeText(id)}">${escapeText(s.date)} · ${escapeText(id)}</button>` : '';
  };
  const statements = result.statements.map(s => `<li><p>${escapeText(s.text)}</p><div class="assistant-citations">${s.source_ids.map(link).join('')}</div></li>`).join('');
  return `<p class="assistant-answer-label">${!sources.size ? 'No matching notes · No Aivana request made' : result.origin === 'demo' ? 'Demo · Saved notes, not an AI answer' : 'Aivana · Check the cited notes'}</p>
    ${statements ? `<ul class="assistant-statements">${statements}</ul>` : "<p>I couldn't find that in your notes. Try another subject or broaden your filters.</p>"}
    ${result.suggestions.length ? `<h4>Suggested discussion questions</h4><ul>${result.suggestions.map(s => `<li>${escapeText(s)}</li>`).join('')}</ul>` : ''}
    <p class="assistant-context-note">${result.context_count} of ${result.matched_count} matching notes used${result.limited ? ' · Limited to 12 notes, ranked by relevance and recency' : ''}. Sensitive notes left out. Each question is independent.</p>
    ${sources.size ? `<details class="assistant-sources"><summary>Supporting notes · ${sources.size}</summary>${[...sources.values()].map(s => `<article id="assistant-source-${escapeText(s.source_id)}" tabindex="-1"><strong>${escapeText(s.source_id)} · ${escapeText(s.date)} · ${escapeText(s.title)}</strong><p>${escapeText(s.text)}</p><small>${escapeText(s.kind)} · ${escapeText(s.skill)}${s.kind === 'action' ? ` · ${s.completed ? 'Completed' : 'Open'}${s.due_date ? ` · Due ${escapeText(s.due_date)}` : ' · No deadline'}` : ''}</small><button class="rail-link" type="button" data-assistant-record="${escapeText(s.source_id)}">Open in timeline</button></article>`).join('')}</details>` : ''}`;
}
