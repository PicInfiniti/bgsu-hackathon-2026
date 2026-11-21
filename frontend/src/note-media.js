// Photo/freehand input adapted from coach-dashboard-redesign; uses the existing approval flow.
import { PenPad, PEN_COLORS } from './pen-pad.js';
import { resizePhoto } from './image-utils.js';
const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mountNoteMedia({form, textarea, voice, request, getMode, canUse, cancelVoice, onBusy = () => {}}) {
  const root = document.createElement('section'); root.className = 'note-input-tools';
  root.innerHTML = `<div class="editor-input-top"><h3>Capture your note</h3><div class="note-input-tabs" role="group" aria-label="Note input method">${[['type','Type'],['pen','Freehand'],['photo','Photo'],['voice','Voice']].map(([key,label])=>`<button type="button" data-note-input="${key}" aria-pressed="${key==='type'}">${label}</button>`).join('')}</div></div>
    <div data-input-pane="pen" hidden><p>Write with a mouse, finger or pen.</p><div class="ink-tools"><button type="button" data-ink-tool="pen" aria-pressed="true">Pen</button><button type="button" data-ink-tool="eraser" aria-pressed="false">Eraser</button>${Object.entries(PEN_COLORS).map(([key,color])=>`<button type="button" data-ink-color="${key}" style="--ink:${color}" aria-label="${key} ink" aria-pressed="${key==='black'}">●</button>`).join('')}<button type="button" data-ink-undo>Undo</button><button type="button" data-ink-redo>Redo</button><button type="button" data-ink-clear>Clear</button></div><canvas class="note-ink-pad" aria-label="Freehand note drawing area"></canvas><button class="secondary" type="button" data-read-ink>Convert handwriting to text</button></div>
    <div data-input-pane="photo" hidden><label class="note-photo-picker">Add photos<input type="file" accept="image/png,image/jpeg" multiple data-note-photos></label><p>PNG or JPEG · up to 4 photos plus a drawing. Images are saved only when you approve the meeting.</p><div class="note-photo-strip"></div><button class="secondary" type="button" data-read-photos>Read photos</button></div>
    <div data-input-pane="voice" hidden><div class="voice-box"><div class="voice-session-heading"><span class="voice-session-label">VOICE NOTE</span><span class="voice-recording-state"><i></i><span data-voice-state>Ready when you are</span><time data-voice-time>0:00</time></span></div><div class="voice-orbit" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/></svg></div><h4>Speak now. Follow through later.</h4><p class="voice-intro">Capture the conversation in your own words.</p><div class="voice-button-slot"></div><div class="voice-transcript"><span>LIVE TRANSCRIPT</span><p data-voice-final>Your words will appear here as you speak.</p></div><div class="voice-status-slot"></div><div class="voice-privacy-slot"></div></div></div><p class="note-media-hint">Photo and handwriting conversion use Live Aivana. Check the text before adding it to your note.</p><div class="note-media-check" hidden aria-live="polite"></div>`;
  form.insertBefore(root, textarea.closest('.note-label'));
  const voiceExtras = [...form.querySelectorAll('.dictation-privacy,#note-dictation-preview')];
  const $ = s=>root.querySelector(s);
  $('.voice-button-slot').append(voice.querySelector('button'));
  $('.voice-status-slot').append(voice.querySelector('.dictation-status'));
  $('.voice-transcript').append(voiceExtras.find(el=>el.id==='note-dictation-preview'));
  $('.voice-privacy-slot').append(voiceExtras.find(el=>el.classList.contains('dictation-privacy')));
  voice.remove();
  let pad = null, photos = [], revision = 0, controller = null, working = false, loading = false;
  let currentPane = 'type', voiceStarted = null, voiceTimer = null, voiceOffset = 0;
  function voiceTick() {
    const elapsed=Math.floor((Date.now()-voiceStarted)/1000);
    $('[data-voice-time]').textContent=`${Math.floor(elapsed/60)}:${String(elapsed%60).padStart(2,'0')}`;
  }
  function voiceState(active) {
    $('.voice-box').classList.toggle('is-recording',active);
    $('[data-voice-state]').textContent=active?'Listening':'Ready when you are';
    if(active && voiceStarted===null){voiceStarted=Date.now();voiceOffset=textarea.value.length;voiceTimer=setInterval(voiceTick,1000);voiceTick();}
    if(!active){clearInterval(voiceTimer);voiceTimer=null;voiceStarted=null;}
  }
  textarea.addEventListener('input',()=>{
    if(voiceStarted!==null)$('[data-voice-final]').textContent=textarea.value.slice(voiceOffset).trim()||'Listening for your words…';
  });
  const resize = () => { if(currentPane==='pen' && pad)pad.resize(); };
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  observer?.observe($('canvas'));
  function stopPending() {
    revision++; controller?.abort(); controller=null;
    $('.note-media-check').hidden=true; $('.note-media-check').replaceChildren();
    loading=false; working=false; onBusy(false); update();
  }
  function update() {
    $('[data-read-photos]').disabled=working||!photos.length;
    $('[data-read-ink]').disabled=working||!pad||pad.empty;
    root.querySelectorAll('.ink-tools button,[data-note-photos]').forEach(b=>b.disabled=working);
  }
  function setPane(pane) {
    if(pane!==currentPane){stopPending();cancelVoice();}
    currentPane=pane;
    root.querySelectorAll('[data-note-input]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.noteInput===pane)));
    root.querySelectorAll('[data-input-pane]').forEach(p=>p.hidden=p.dataset.inputPane!==pane);
    if(pane==='pen') {
      try { pad ??= new PenPad($('canvas'),{onChange:update}); pad.resize(); }
      catch { $('.note-media-hint').textContent='Freehand drawing is unavailable in this browser. Use Type, Photo or Voice.'; }
    }
    if(pane==='type')textarea.focus(); update();
  }
  function renderPhotos() {
    $('.note-photo-strip').innerHTML=photos.map((url,n)=>`<figure><img src="${url}" alt="Note photo ${n+1}"><button type="button" data-delete-photo="${n}" aria-label="Remove photo ${n+1}">×</button></figure>`).join('');update();
  }
  async function read(images) {
    if(working||!canUse())return;
    cancelVoice(); stopPending();
    const check=$('.note-media-check');check.hidden=false;
    if(getMode()!=='live'){check.textContent='Switch to Live mode to read handwriting or photos. Demo makes no AI calls.';return;}
    const token=revision; controller=new AbortController(); working=true; onBusy(true);update();
    check.textContent='Reading your note…';
    try {
      const result=await request('/notes/transcribe',{images,mode:getMode()},controller.signal);
      if(token!==revision)return;
      if(!result||typeof result.text!=='string'||!Array.isArray(result.uncertain_words)||!Array.isArray(result.warnings))throw Error('Image transcription returned an invalid response.');
      check.innerHTML=`<h3>Check the text</h3><p>Compare with your image. Edit names, deadlines and unclear words before adding.</p>${result.uncertain_words.length?`<p>Words to check: ${result.uncertain_words.map(esc).join(', ')}</p>`:''}${result.warnings.map(w=>`<p class="error">${esc(w)}</p>`).join('')}<label>Transcribed text<textarea data-media-transcript rows="7" maxlength="12000">${esc(result.text)}</textarea></label><div><button class="secondary" type="button" data-dismiss-transcript>Cancel</button><button class="primary" type="button" data-use-transcript>Add checked text to note</button></div>`;
    } catch(error) { if(token===revision)check.textContent=error.message; }
    finally { if(token===revision){working=false;controller=null;onBusy(false);update();} }
  }
  root.addEventListener('click',e=>{
    const button=e.target.closest('button');if(!button)return;
    if(button.dataset.noteInput){setPane(button.dataset.noteInput);return;}
    if(button.hasAttribute('data-dismiss-transcript')){stopPending();return;}
    if(button.hasAttribute('data-use-transcript')) {
      if(!canUse())return;
      const text=$('[data-media-transcript]').value.trim(),separator=textarea.value.trim()?'\n\n':'';
      if(!text)return;
      if(textarea.value.length+separator.length+text.length>textarea.maxLength){$('.note-media-hint').textContent='This text would exceed the note limit. Shorten the transcript or note before adding.';return;}
      textarea.value+=separator+text;textarea.dispatchEvent(new Event('input',{bubbles:true}));stopPending();setPane('type');return;
    }
    if(working||!canUse())return;
    if(button.hasAttribute('data-delete-photo')){photos.splice(Number(button.dataset.deletePhoto),1);stopPending();renderPhotos();return;}
    if(button.hasAttribute('data-read-photos')){read([...photos]);return;}
    if(!pad)return;
    if(button.hasAttribute('data-read-ink')){const url=pad.toPNG();if(url)read([url]);return;}
    if(button.dataset.inkTool)pad.tool=button.dataset.inkTool;
    if(button.dataset.inkColor){pad.color=button.dataset.inkColor;pad.tool='pen';}
    for(const action of ['undo','redo','clear'])if(button.hasAttribute(`data-ink-${action}`))pad[action]();
    root.querySelectorAll('[data-ink-tool]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.inkTool===pad.tool)));
    root.querySelectorAll('[data-ink-color]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.inkColor===pad.color)));update();
  });
  $('[data-note-photos]').addEventListener('change',async e=>{
    if(working||loading||!canUse())return;
    stopPending();const token=revision,files=[...e.target.files];e.target.value='';loading=true;
    for(const file of files) {
      if(token!==revision)break;
      if(photos.length>=4){$('.note-media-hint').textContent='Up to four photos per meeting, with one freehand drawing.';break;}
      try {const url=await resizePhoto(file);if(token===revision)photos.push(url);}
      catch(error){if(token===revision)$('.note-media-hint').textContent=error.message;}
    }
    if(token===revision){loading=false;renderPhotos();}
  });
  update();
  return {
    cancel:stopPending,
    voiceState,
    reset(){stopPending();voiceState(false);$('[data-voice-final]').textContent='Your words will appear here as you speak.';$('[data-voice-time]').textContent='0:00';photos=[];pad?.clear();renderPhotos();setPane('type');},
    sources(){const ink=pad&&!pad.empty?pad.toPNG():null;return [...photos.map(data_url=>({kind:'photo',data_url})),...(ink?[{kind:'pen',data_url:ink}]:[])];},
    refresh:resize,
    get active(){return working||loading;},
  };
}
