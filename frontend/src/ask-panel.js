// Slide-out chat adapted from coach-dashboard-redesign. Uses the current,
// source-validated /assistant endpoint and never writes notebook records.
import { escapeText as esc } from './review-state.js';
import { mountNoteDictation } from './note-dictation.js';
import { assistantAnswerMarkup } from './assistant-view.js';

export function createAskPanel({ players, request, getMode, getContext, canSend, openRecord }) {
  let revision = 0, controller = null, serial = 0, previousFocus = null, lastMode = getMode();
  const answers = new WeakMap();
  const panel = document.createElement('aside');
  panel.className = 'ask-panel'; panel.id = 'coach-side-chat'; panel.hidden = true;
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'false'); panel.setAttribute('aria-labelledby', 'ask-title');
  panel.innerHTML = `<div class="ask-head"><div><h2 id="ask-title"><span aria-hidden="true">✦</span> Coach assistant</h2><p data-ask-mode></p></div><button type="button" data-new-chat>New chat</button><button type="button" class="ask-close" data-close-ask aria-label="Close coach assistant">×</button></div>
    <div class="ask-context"><label>Ask about<select id="ask-scope"><option value="team">Whole team</option><option value="individual">One player</option><option value="group">Selected group</option></select></label>
      <label data-player-field hidden>Player<select id="ask-player">${players.map(p=>`<option value="${esc(p.id)}">#${esc(p.number)} ${esc(p.name)}</option>`).join('')}</select></label>
      <fieldset data-group-field hidden><legend>Choose at least two players</legend><div class="ask-group-players">${players.map(p=>`<label><input type="checkbox" name="ask-member" value="${esc(p.id)}">#${esc(p.number)} ${esc(p.name)}</label>`).join('')}</div></fieldset>
      <details class="ask-filters"><summary>Narrow the records</summary><div><label>Meeting type<select id="ask-meeting-type"><option value="">All types</option><option value="individual">Individual</option><option value="group">Group</option><option value="team">Team</option></select></label><label>Actions<select id="ask-status"><option value="all">All records</option><option value="open">Open actions</option><option value="overdue">Overdue actions</option><option value="done">Completed actions</option></select></label></div></details>
    </div>
    <div class="ask-messages" data-messages role="log" aria-live="polite" aria-relevant="additions"></div>
    <div class="ask-chips"><button type="button" data-question="Summarize past feedback.">Recap feedback</button><button type="button" data-question="Which actions need follow-up?" data-open-actions>Open actions</button><button type="button" data-question="Prepare my next meeting.">Prepare a conversation</button></div>
    <form class="ask-form"><label for="ask-input">Your question</label><textarea id="ask-input" rows="2" maxlength="800" required placeholder="What should we revisit at the next meeting?"></textarea><div class="ask-voice-controls"><button type="button" class="ask-mic" data-ask-mic aria-label="Dictate a question" aria-pressed="false"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/></svg><span data-dictation-label>Voice to text</span></button><p data-send-status role="status"></p><button type="submit" data-send>Send <span aria-hidden="true">↑</span></button></div><p class="ask-voice-status" data-voice-status role="status"></p><p class="ask-voice-preview" data-voice-preview hidden></p><p class="ask-voice-privacy">Your browser’s speech service may process audio. Only send your question when you are ready.</p></form>
    <p class="ask-footer">Approved, non-sensitive records only. Each question is independent. Check the cited sources.</p>`;
  document.body.append(panel);
  const $ = selector => panel.querySelector(selector);
  const input = $('#ask-input');
  const questionDictation = mountNoteDictation({
    textarea:input,button:$('[data-ask-mic]'),status:$('[data-voice-status]'),preview:$('[data-voice-preview]'),
    form:panel.querySelector('form'),review:$('[data-messages]'),environment:window,
    canStart:()=>!panel.hidden&&!controller&&canSend(),subject:'question',reviewHint:'Review your question, then press Send.',
    onStateChange:active=>$('[data-ask-mic]').setAttribute('aria-label',active?'Stop question dictation':'Dictate a question'),
  });
  function contextLabel() { return $('#ask-scope').value === 'individual' ? players.find(p=>p.id===$('#ask-player').value)?.name || 'One player' : $('#ask-scope').value === 'group' ? 'Selected group' : 'Whole team'; }
  function welcome() {
    $('[data-messages]').innerHTML = '<div class="ask-welcome"><span aria-hidden="true">✦</span><h3>A little context.<br>A better conversation.</h3><p>Revisit feedback, find open actions, or prepare your next check-in. Choose whose records to use, then ask a question.</p></div>';
  }
  function refresh() {
    if (lastMode !== getMode()) { lastMode = getMode(); cancel(); }
    $('[data-ask-mode]').textContent = getMode()==='demo' ? 'Demo · Saved excerpts, no AI call' : 'Live · Aivana with cited records';
    $('[data-send]').disabled = Boolean(controller) || !canSend();
    $('[data-send-status]').textContent = controller ? 'Finding relevant records…' : !canSend() ? 'Waiting for the notebook…' : '';
    $('[data-player-field]').hidden = $('#ask-scope').value !== 'individual';
    $('[data-group-field]').hidden = $('#ask-scope').value !== 'group';
  }
  function cancel() {
    questionDictation.cancel();
    revision++; controller?.abort(); controller=null;
    panel.querySelectorAll('[data-pending]').forEach(node=>{
      node.removeAttribute('data-pending');node.innerHTML='<p class="ask-loading">Request cancelled. Your question is ready to send again.</p>';
    });
  }
  function clear() { cancel(); input.value=''; welcome(); refresh(); }
  async function submit() {
    if(questionDictation.active){questionDictation.stop();return;}
    if (controller || !canSend() || !input.value.trim()) return;
    const question=input.value.trim();
    const scope=$('#ask-scope').value;
    const selected=scope==='group'?[...panel.querySelectorAll('[name="ask-member"]:checked')].map(el=>el.value):[$('#ask-player').value];
    if(scope==='group'&&selected.length<2){$('[data-send-status]').textContent='Choose at least two players for a group.';return;}
    const body={question,mode:getMode(),scope,player_id:scope==='individual'?selected[0]:null,player_ids:scope==='group'?selected:[],filters:{meeting_type:$('#ask-meeting-type').value,status:$('#ask-status').value}};
    const version=++revision, pending=new AbortController(); controller=pending;
    const user=document.createElement('div');user.className='ask-bubble user';user.innerHTML=`<small>${esc(contextLabel())} · ${getMode()==='demo'?'Demo':'Live'}</small><p>${esc(question)}</p>`;
    const answer=document.createElement('div');answer.className='ask-bubble assistant';answer.dataset.pending='';answer.innerHTML='<p class="ask-loading">Finding relevant approved records…</p>';
    $('.ask-welcome')?.remove();
    while($('[data-messages]').children.length>=12)$('[data-messages]').firstElementChild.remove();
    $('[data-messages]').append(user,answer);refresh();answer.scrollIntoView({block:'nearest'});
    try {
      const result=await request(body,pending.signal);
      if(version!==revision)return;
      const prefix=`ask-source-${++serial}`;
      answer.removeAttribute('data-pending');answer.innerHTML=assistantAnswerMarkup(result,{sourcePrefix:prefix});
      answers.set(answer,{result,prefix});
      if(input.value.trim()===question)input.value='';
    } catch(error) {
      if(version!==revision)return;
      answer.removeAttribute('data-pending');answer.innerHTML=`<p class="ask-error">${esc(error.message||'The answer could not be loaded.')}</p><button type="button" data-retry>Retry</button>`;
      answer.querySelector('[data-retry]').addEventListener('click',()=>{if(controller)return;input.value=question;answer.remove();user.remove();submit();});
    } finally {
      if(version===revision){controller=null;refresh();}
    }
  }
  panel.querySelector('form').addEventListener('submit',event=>{event.preventDefault();submit();});
  input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();submit();}});
  panel.addEventListener('change',event=>{if(event.target.closest('.ask-context')){cancel();refresh();}});
  panel.addEventListener('click',event=>{
    if(event.target.closest('[data-send]')&&questionDictation.active){event.preventDefault();questionDictation.stop();return;}
    if(event.target.closest('[data-close-ask]')){close();return;}
    if(event.target.closest('[data-new-chat]')){clear();input.focus();return;}
    const prompt=event.target.closest('[data-question]');
    if(prompt){questionDictation.cancel();input.value=prompt.dataset.question;if(prompt.hasAttribute('data-open-actions')){$('#ask-status').value='open';cancel();refresh();}input.focus();return;}
    const bubble=event.target.closest('.ask-bubble'),data=bubble&&answers.get(bubble);
    if(!data)return;
    const citation=event.target.closest('[data-assistant-source]');
    if(citation){const details=bubble.querySelector('.assistant-sources');details.open=true;const source=document.getElementById(`${data.prefix}-${citation.dataset.assistantSource}`);source?.focus({preventScroll:true});source?.scrollIntoView({block:'nearest'});}
    const record=event.target.closest('[data-assistant-record]');
    if(record){const source=data.result.sources.find(s=>s.source_id===record.dataset.assistantRecord);if(source){close();openRecord(source);}}
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden&&!document.querySelector('dialog[open],.tour-pop')){event.preventDefault();close();}});
  function open({playerId}={}) {
    previousFocus=document.activeElement;
    const pid=playerId || getContext().playerId;
    if(pid&&players.some(p=>p.id===pid)){
      if($('#ask-scope').value!=='individual'||$('#ask-player').value!==pid)cancel();
      $('#ask-scope').value='individual';$('#ask-player').value=pid;
    }
    panel.hidden=false;document.body.classList.add('ask-open');
    document.querySelector('#header-ask')?.setAttribute('aria-expanded','true');refresh();input.focus();
  }
  function close() {
    cancel();panel.hidden=true;document.body.classList.remove('ask-open');
    document.querySelector('#header-ask')?.setAttribute('aria-expanded','false');
    if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});refresh();
  }
  welcome();refresh();
  return {open,close,refresh,cancelVoice:()=>questionDictation.cancel(),get voiceActive(){return questionDictation.active;},get isOpen(){return !panel.hidden;}};
}
