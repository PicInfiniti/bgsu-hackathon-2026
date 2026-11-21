// "Ask Aivana" side panel (like Copilot in Outlook). All AI calls go through
// the backend; any change to data shows a confirm card first.
import { voiceButtonState, startDictation } from './voice.js';

const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const CHIPS = {
  schedule: ["What's on this week?", 'Add practice Tuesday 3:30', 'When is my next 1-on-1?'],
  note: ['Recap this note', 'Turn this into homework', 'Fix my spelling'],
  home: ['What should I do next?', 'What do I need to do today?', "Who hasn't had a 1-on-1?"],
  film: ['Recap this film', 'Make a WR cut-up of 3rd downs', 'Which notes have no homework yet?'],
  player: ['What should I do next with him?', 'What did I note on this player in film?', 'What does he need before Saturday?'],
  homework: ['Late homework', 'What should we prioritize before Saturday?', "Who hasn't had a 1-on-1?"],
};
export const MAX_TURNS = 6;
export const VOICE_FAILED = 'Voice transcription failed. Please try again or type your message.';

export function chipsFor(page) {
  return CHIPS[page] || CHIPS.home;
}

/** Keep only the last six turns that get sent back as context. */
export function trimHistory(turns) {
  return turns.filter(t => t.role === 'user' || t.role === 'assistant').slice(-MAX_TURNS).map(t => ({ role: t.role, text: t.text }));
}

/** Combine text typed before the mic started with the live transcript. */
export function composeVoiceText(prefix, finalText, interim) {
  return [prefix.trim(), `${finalText} ${interim}`.trim()].filter(Boolean).join(' ');
}

/**
 * The send guard: exactly one submission at a time, never empty, and the
 * text is only cleared after the server answered.
 */
export function createSender(sendFn) {
  let busy = false;
  return async (text) => {
    const message = (text || '').trim();
    if (busy || !message) return { sent: false, reason: busy ? 'busy' : 'empty' };
    busy = true;
    try { return { sent: true, result: await sendFn(message) }; }
    catch (error) { return { sent: false, reason: 'failed', error }; }
    finally { busy = false; }
  };
}

export function answerSections(result) {
  const cite = (ids) => (ids || []).map(id => `<a href="#" class="src-chip" data-src="${esc(id)}">${esc(id)}</a>`).join(' ');
  const s = result.sections;
  if (!s) return '';
  let html = '';
  if (s.recommendations?.length) html += `<section class="ans-recs"><h4>Recommended next steps <small>suggestions</small></h4><ol>${s.recommendations.map(r => `<li><strong>${esc(r.action)}</strong>${r.why ? `<small class="why">Why: ${esc(r.why)}</small>` : ''}${r.source_ids?.length ? `<span class="src-line">${cite(r.source_ids)}</span>` : ''}</li>`).join('')}</ol></section>`;
  if (s.facts?.length) html += `<section class="ans-facts"><h4>${s.recommendations?.length ? 'What the records say' : 'Supporting records'} <small>known facts</small></h4><ul>${s.facts.map(f => `<li>${esc(f.text)} <span class="src-line">${cite(f.source_ids)}</span></li>`).join('')}</ul></section>`;
  if (s.missing?.length) html += `<section class="ans-missing"><h4>Check before you act <small>missing information</small></h4><ul>${s.missing.map(m => `<li>${esc(m)}</li>`).join('')}</ul></section>`;
  return html;
}

export function createAskPanel(ctx) {
  const { api, notify, getMode, getContext, openLink, runConfirm, runButton } = ctx;
  const voice = voiceButtonState(window);
  let turns = [], stopVoice = null, voiceOn = false, convo = { player_id: null, player_name: null, skill: null, film_id: null };
  const panel = document.createElement('aside');
  panel.className = 'ask-panel'; panel.hidden = true; panel.setAttribute('aria-label', 'Ask Aivana');
  panel.innerHTML = `<div class="ask-head"><h2>✦ Aivana</h2><span class="ask-mode" data-ask-mode></span><button type="button" class="text-button" data-new-chat>New chat</button><button type="button" class="icon-button" data-close-ask aria-label="Close Ask Aivana">✕</button></div>
    <div class="ask-context" data-ask-context hidden></div>
    <div class="ask-messages" data-messages aria-live="polite"></div>
    <div class="ask-chips" data-chips></div>
    <form class="ask-form" data-ask-form><label class="sr-only" for="ask-input">Ask Aivana</label><textarea id="ask-input" rows="2" maxlength="800" placeholder="Ask about your notes, players, homework or what to do next…"></textarea>
      <div class="ask-buttons">${voice.supported ? '<button type="button" class="icon-button" data-ask-mic aria-label="Speak your question" aria-pressed="false">🎤</button>' : `<span class="mic-off" title="${voice.tooltip}" aria-label="${voice.tooltip}">🎤</span>`}<button type="submit" class="primary compact" data-ask-send>Send</button></div></form>
    <p class="ask-voice" data-voice-status hidden></p>
    <p class="ask-footer">Aivana can make mistakes. Check important info.</p>`;
  document.body.append(panel);
  const $ = (s) => panel.querySelector(s);
  const input = $('#ask-input');

  function renderContext() {
    const el = $('[data-ask-context]');
    el.hidden = !convo.player_name && !convo.skill;
    el.innerHTML = `Currently discussing: <strong>${esc(convo.player_name || 'the team')}</strong>${convo.skill ? ` · ${esc(convo.skill)}` : ''} <button type="button" class="text-button" data-clear-context aria-label="Stop discussing this player">✕ Clear</button>`;
    $('[data-ask-mode]').textContent = getMode() === 'demo' ? 'Demo · code answers' : 'Live · Aivana';
  }
  function welcome() {
    const { page } = getContext();
    $('[data-messages]').innerHTML = `<div class="ask-welcome"><p><strong>Hey Coach.</strong> Ask what you told a player, what's late, or what to do next. I answer from your approved notes and show where each point came from.</p>${getMode() === 'demo' ? '<p class="muted">Demo mode: answers are built by code from your saved records, no AI call. Switch to Live (top of the page) for Aivana.</p>' : '<p class="muted">Live mode: Aivana writes the answer from your approved records; every point is checked against its source.</p>'}</div>`;
    renderChips(page); renderContext();
  }
  function renderChips(page = getContext().page) { $('[data-chips]').innerHTML = chipsFor(page).map(c => `<button type="button" class="chip-button" data-chip="${esc(c)}">${esc(c)}</button>`).join(''); }
  function addBubble(role, html) { const div = document.createElement('div'); div.className = `bubble ${role}`; div.innerHTML = html; $('[data-messages]').append(div); div.scrollIntoView({ block: 'end', behavior: 'smooth' }); return div; }
  function typeInto(el, text) {
    return new Promise(resolve => {
      const words = text.split(/(\s+)/); let i = 0;
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = text; resolve(); return; }
      const tick = () => { el.textContent += words.slice(i, i + 3).join(''); i += 3; if (i < words.length) setTimeout(tick, 18); else resolve(); };
      tick();
    });
  }
  function stopMic() { voiceOn = false; stopVoice?.(); stopVoice = null; const mic = $('[data-ask-mic]'); mic?.setAttribute('aria-pressed', 'false'); $('[data-voice-status]').hidden = true; }

  async function request(message) {
    const context = getContext();
    const page = context.page === 'player' && !convo.player_id ? { ...convo, player_id: context.selected_id } : convo;
    return api('/assistant/message', { message, page: context.page, selected_id: context.selected_id, context: page, history: trimHistory(turns), mode: getMode() });
  }
  const send = createSender(request);

  async function submit(message) {
    stopMic(); // a running microphone must not write into the box after sending
    const text = (message ?? input.value).trim();
    if (!text) return;
    $('[data-ask-send]').disabled = true;
    const userBubble = addBubble('user', esc(text));
    const answer = addBubble('assistant', '<p class="typing" aria-label="Aivana is answering"><span></span><span></span><span></span></p>');
    const outcome = await send(text);
    $('[data-ask-send]').disabled = false;
    if (!outcome.sent) {
      if (outcome.reason === 'busy') { userBubble.remove(); answer.remove(); return; }
      answer.innerHTML = `<p class="answer-error">${esc(outcome.error?.message || 'The message was not sent.')}</p><button type="button" class="secondary compact" data-retry>Retry</button>`;
      answer.querySelector('[data-retry]').onclick = () => { userBubble.remove(); answer.remove(); submit(text); };
      input.value = text; // keep the unsent text
      return;
    }
    input.value = '';
    turns.push({ role: 'user', text });
    render(answer, outcome.result);
  }
  async function render(answer, result) {
    answer.innerHTML = '<p class="answer-text"></p>';
    await typeInto(answer.querySelector('.answer-text'), result.reply);
    answer.insertAdjacentHTML('beforeend', answerSections(result));
    if (result.citations?.length) answer.insertAdjacentHTML('beforeend', `<details class="sources" ${result.sections ? '' : 'open'}><summary>Sources · ${result.citations.length}</summary><ol class="citations">${result.citations.map(c => `<li id="src-${esc(c.source_id)}"><button type="button" class="cite" data-link="${esc(c.link)}"><strong>${esc(c.source_id)} · ${esc(c.title)}</strong>${c.date ? ` · ${esc(c.date)}` : ''}</button>${c.text ? `<small>${esc(c.text.slice(0, 160))}</small>` : ''}</li>`).join('')}</ol></details>`);
    if (result.buttons?.length) answer.insertAdjacentHTML('beforeend', `<div class="ask-actions"><span class="muted">Suggested follow-up:</span>${result.buttons.map((b, n) => b.href ? `<a class="secondary compact" href="${esc(b.href)}" download>${esc(b.label)}</a>` : `<button type="button" class="secondary compact" data-run-button="${n}">${esc(b.label)}</button>`).join('')}</div>`);
    if (result.confirm) answer.insertAdjacentHTML('beforeend', `<div class="confirm-card"><p>${confirmSummary(result.confirm)}</p><div><button type="button" class="primary compact" data-confirm>${esc(result.confirm.label)}</button><button type="button" class="text-button" data-cancel>Cancel</button></div></div>`);
    answer.dataset.result = JSON.stringify({ confirm: result.confirm, buttons: result.buttons });
    answer.insertAdjacentHTML('beforeend', `<span class="origin">${result.origin === 'aivana' ? 'By Aivana · checked against your records' : result.origin === 'demo' ? 'Demo · made by code' : 'Made by code from your records'}</span>`);
    if (result.context) { convo = { ...convo, ...result.context }; renderContext(); }
    turns.push({ role: 'assistant', text: result.reply });
    turns = turns.slice(-MAX_TURNS * 2);
    renderChips();
  }
  function confirmSummary(c) {
    if (c.kind === 'add_event') { const e = c.event; return `<strong>${esc(e.title)}</strong> · ${esc(new Date(e.start_at).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))} · ${e.duration_min} min${e.repeat_weekly ? ' · every week' : ''}`; }
    if (c.kind === 'mark_done') return 'Mark this homework done.';
    if (c.kind === 'save_playlist') return `Save cut-up <strong>${esc(c.playlist.title)}</strong> (${c.playlist.clip_ids.length} clips).`;
    if (c.kind === 'apply_text') return `${c.changes.length} fix${c.changes.length === 1 ? '' : 'es'}: ${c.changes.slice(0, 4).map(ch => `<del>${esc(ch.before || '∅')}</del> → <ins>${esc(ch.after)}</ins>`).join(', ')}`;
    return 'Confirm this change.';
  }
  panel.addEventListener('click', async e => {
    if (e.target.closest('[data-close-ask]')) { close(); return; }
    if (e.target.closest('[data-new-chat]')) { stopMic(); turns = []; convo = { player_id: null, player_name: null, skill: null, film_id: null }; input.value = ''; welcome(); input.focus(); return; }
    if (e.target.closest('[data-clear-context]')) { convo = { player_id: null, player_name: null, skill: null, film_id: null }; renderContext(); return; }
    const src = e.target.closest('[data-src]'); if (src) { e.preventDefault(); const bubble = src.closest('.bubble'); const d = bubble.querySelector('details.sources'); if (d) { d.open = true; bubble.querySelector(`#src-${CSS.escape(src.dataset.src)}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } return; }
    const chip = e.target.closest('[data-chip]'); if (chip) { submit(chip.dataset.chip); return; }
    const link = e.target.closest('[data-link]'); if (link) { openLink(link.dataset.link); if (innerWidth < 900) close(); return; }
    const bubble = e.target.closest('.bubble'); const data = bubble?.dataset.result ? JSON.parse(bubble.dataset.result) : null;
    if (e.target.closest('[data-confirm]') && data?.confirm) {
      const card = e.target.closest('.confirm-card');
      card.querySelectorAll('button').forEach(b => b.disabled = true);
      try { const message = await runConfirm(data.confirm); card.innerHTML = `<p class="confirmed">✓ ${esc(message)}</p>`; turns.push({ role: 'assistant', text: message }); }
      catch (error) { card.querySelectorAll('button').forEach(b => b.disabled = false); notify(error.message, true); }
      return;
    }
    if (e.target.closest('[data-cancel]')) { e.target.closest('.confirm-card').innerHTML = '<p class="muted">Cancelled. Nothing changed.</p>'; return; }
    const button = e.target.closest('[data-run-button]'); if (button && data) runButton(data.buttons[Number(button.dataset.runButton)]);
    if (e.target.closest('[data-ask-mic]')) {
      const mic = e.target.closest('[data-ask-mic]');
      if (voiceOn) { stopMic(); input.focus(); return; }
      const prefix = input.value; // keep typed text; the transcript is added after it
      try {
        voiceOn = true;
        stopVoice = startDictation(window, {
          onText: (f, i) => { if (voiceOn) input.value = composeVoiceText(prefix, f, i); },
          onEnd: () => { voiceOn = false; mic.setAttribute('aria-pressed', 'false'); $('[data-voice-status]').hidden = true; },
          onError: (m) => { stopMic(); input.value = input.value || prefix; notify(/microphone/i.test(m) ? m : VOICE_FAILED, true); },
        });
        mic.setAttribute('aria-pressed', 'true');
        $('[data-voice-status]').hidden = false; $('[data-voice-status]').textContent = '● Listening… press 🎤 to stop. You can edit the text before sending.';
      } catch (error) { voiceOn = false; notify(error.message || VOICE_FAILED, true); }
    }
  });
  $('[data-ask-form]').addEventListener('submit', e => { e.preventDefault(); submit(); });
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden && !document.querySelector('.date-picker')) close(); });

  function open(prompt) {
    panel.hidden = false; document.body.classList.add('ask-open');
    const context = getContext();
    if (context.page === 'player' && context.selected_id && convo.player_id !== context.selected_id) convo = { ...convo, player_id: context.selected_id, player_name: ctx.playerName?.(context.selected_id) || null, skill: null };
    if (!turns.length) welcome(); else { renderChips(); renderContext(); }
    input.focus();
    if (prompt) submit(prompt);
  }
  function close() { stopMic(); panel.hidden = true; document.body.classList.remove('ask-open'); document.querySelector('[data-open-ask]')?.focus(); }
  return { open, close, toggle: () => panel.hidden ? open() : close(), refreshChips: () => { if (!panel.hidden) { renderChips(); renderContext(); } }, get isOpen() { return !panel.hidden; } };
}
