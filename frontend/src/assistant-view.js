import { meetingDisplayTitle } from './shared-groups.js';
import { escapeText } from './review-state.js';

export function assistantAnswerMarkup(result, { sourcePrefix = 'assistant-source' } = {}) {
  const sources = new Map(result.sources.map(s => [s.source_id, s]));
  const link = id => {
    const s = sources.get(id);
    return s ? `<button type="button" class="assistant-citation" data-assistant-source="${escapeText(id)}">${escapeText(s.date)} · ${escapeText(id)}</button>` : '';
  };
  const statements = result.statements.map(s => `<li><p>${escapeText(s.text)}</p><div class="assistant-citations">${s.source_ids.map(link).join('')}</div></li>`).join('');
  return `<p class="assistant-answer-label">${!sources.size ? 'No matching records · No Aivana request made' : result.origin === 'demo' ? 'Demo · Saved excerpts, not an AI answer' : 'Aivana · Check the cited records'}</p>
    ${statements ? `<ul class="assistant-statements">${statements}</ul>` : '<p>No answer was found in the relevant approved records. Try another subject or broaden your filters.</p>'}
    ${result.suggestions.length ? `<h4>Suggested discussion questions</h4><ul>${result.suggestions.map(s => `<li>${escapeText(s)}</li>`).join('')}</ul>` : ''}
    <p class="assistant-context-note">${result.context_count} of ${result.matched_count} matching records supplied${result.limited ? ' · Context limited to 12 records, selected for player coverage, relevance and recency' : ''}.${result.player_ids?.length ? ` Supplied records cover ${result.covered_player_count} of ${result.player_ids.length} selected players; absence from this answer does not mean no history.` : ''} Sensitive records excluded. Each question is independent.</p>
    ${sources.size ? `<details class="assistant-sources"><summary>Supporting records · ${sources.size}</summary>${[...sources.values()].map(s => `<article id="${escapeText(sourcePrefix)}-${escapeText(s.source_id)}" tabindex="-1"><strong>${escapeText(s.source_id)} · ${escapeText(s.date)} · ${escapeText(meetingDisplayTitle(s.title))}</strong><p class="assistant-source-players">${(s.player_names || []).map(escapeText).join(' · ')}</p><p>${escapeText(s.text)}</p><small>${escapeText(s.kind)} · ${escapeText(s.skill)}${s.kind === 'action' ? ` · ${s.completed ? 'Completed' : 'Open'}${s.due_date ? ` · Due ${escapeText(s.due_date)}` : ' · No deadline'}` : ''}</small><button class="rail-link" type="button" data-assistant-record="${escapeText(s.source_id)}">View timeline record</button></article>`).join('')}</details>` : ''}`;
}
