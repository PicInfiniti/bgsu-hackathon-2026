// Browser speech recognition is optional; only finalized text enters the meeting note.
export function appendDictation(current, transcript, limit = 12000) {
  const text = String(transcript || '').trim();
  if (!text) return {value:current, added:false, truncated:false};
  const separator = current && !/\s$/.test(current) ? ' ' : '';
  const requested = separator + text;
  let addition = requested.slice(0,Math.max(0,limit-current.length));
  // Do not leave half a UTF-16 surrogate pair at the note's character limit.
  if (/[\uD800-\uDBFF]$/.test(addition)) addition = addition.slice(0,-1);
  if (!addition.trim()) addition = '';
  return {value:current + addition, added:Boolean(addition), truncated:addition.length < requested.length};
}

const errorMessages = {
  'not-allowed':'Microphone access was denied. Allow microphone access for this site in your browser, then try again.',
  'service-not-allowed':'The browser speech service is unavailable or blocked. You can still type or paste notes.',
  'audio-capture':'No microphone is available. Check your microphone connection and browser settings.',
  'no-speech':'No speech was detected. Try again when you are ready.',
  network:'Speech recognition could not connect. Check your connection, then try again.',
  'language-not-supported':'English speech recognition is unavailable in this browser.',
};

export function mountNoteDictation({textarea, button, status, preview, form, review, canStart = () => true, onStateChange = () => {}, environment = globalThis, subject = 'note', reviewHint = 'Review and edit the added text before extracting or saving.'}) {
  const Recognition = environment.SpeechRecognition || environment.webkitSpeechRecognition;
  let session = null, stopping = false, disposed = false;
  const supported = Boolean(Recognition) && environment.isSecureContext !== false;
  const say = (message,error = false) => { status.textContent = message; status.classList.toggle('is-error',error); };
  function update() {
    button.setAttribute('aria-pressed',String(Boolean(session)));
    button.classList.toggle('is-listening',Boolean(session));
    button.disabled = !supported || stopping;
    button.querySelector('[data-dictation-label]').textContent = stopping ? 'Finishing…' : session ? 'Stop dictation' : 'Voice to text';
    onStateChange(Boolean(session));
  }
  function finish(message,error = false) {
    session = null; stopping = false; preview.textContent = ''; preview.hidden = true;
    say(message,error); update();
  }
  function cancel() {
    if (!session) return;
    const old = session; finish('Dictation stopped. Any text already added is kept.');
    try { old.recognition.abort(); } catch { /* Already stopped. */ }
  }
  function stop() {
    if (!session || stopping) return;
    stopping = true; say('Finishing dictation…'); update();
    try { session.recognition.stop(); }
    catch { cancel(); }
  }
  function start() {
    if (!supported || disposed || !canStart() || textarea.disabled) return;
    if (textarea.value.length >= (textarea.maxLength > 0 ? textarea.maxLength : 12000)) { say(`The ${subject} is at its character limit. Edit it before adding more text.`,true); return; }
    let recognition;
    try { recognition = new Recognition(); }
    catch { say('Speech recognition could not start in this browser. You can still type or paste notes.',true); return; }
    const current = {recognition, committed:new Set(), added:false};
    session = current; stopping = false;
    recognition.lang = 'en-US'; recognition.continuous = true; recognition.interimResults = true; recognition.maxAlternatives = 1;
    recognition.onstart = () => { if (session === current && !stopping) say('Listening… Speak clearly. Stop dictation when you are finished.'); };
    recognition.onresult = event => {
      if (session !== current) return;
      if (!canStart() || textarea.disabled) { cancel(); return; }
      let interim = '';
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i], text = result[0]?.transcript || '';
        if (!result.isFinal) { interim += text + ' '; continue; }
        if (current.committed.has(i)) continue;
        current.committed.add(i);
        const addition = appendDictation(textarea.value,text,textarea.maxLength > 0 ? textarea.maxLength : 12000);
        if (addition.added) {
          textarea.value = addition.value; current.added = true;
          textarea.dispatchEvent(new environment.Event('input',{bubbles:true}));
        }
        if (addition.truncated) {
          finish(`The ${subject} reached its character limit. Dictation stopped; review the final sentence.`,true);
          try { recognition.abort(); } catch { /* Already stopped. */ }
          return;
        }
      }
      preview.textContent = interim.trim() ? `Hearing: ${interim.trim()}` : '';
      preview.hidden = !interim.trim();
    };
    recognition.onerror = event => {
      if (session !== current) return;
      finish(errorMessages[event.error] || (event.error === 'aborted' ? 'Dictation stopped. Added text is kept.' : 'Speech recognition stopped. Your existing notes are kept; try again.'),event.error !== 'aborted');
      try { recognition.abort(); } catch { /* Already stopped. */ }
    };
    recognition.onend = () => {
      if (session !== current) return;
      finish(current.added ? `Dictation stopped. ${reviewHint}` : `Dictation ended without finalized text. Try again, or type your ${subject}.`);
    };
    say('Requesting microphone access…'); update();
    try { recognition.start(); }
    catch { finish('Speech recognition could not start. Check microphone permissions, then try again.',true); }
  }
  const toggle = () => session ? stop() : start();
  const guard = event => {
    if (!session || event.type === 'click' && !event.target.closest('#extract, #review-meeting, #save, [data-review-note-only], [data-add-record]')) return;
    event.preventDefault(); event.stopImmediatePropagation(); stop();
  };
  const contextInput = event => { if (event.target !== textarea) cancel(); };
  const pageHidden = () => { if (environment.document?.hidden) cancel(); };
  button.addEventListener('click',toggle);
  form.addEventListener('submit',guard,true); form.addEventListener('click',guard,true); review.addEventListener('click',guard,true);
  form.addEventListener('input',contextInput);
  environment.document?.addEventListener('visibilitychange',pageHidden);
  environment.addEventListener?.('pagehide',cancel);
  say(supported ? `Speak in English. Finalized text is added to your ${subject}.` : 'Voice to text is unavailable in this browser. You can still type or paste text.');
  update();
  return {get active() { return Boolean(session); }, cancel, stop, destroy() {
    cancel(); disposed = true;
    button.removeEventListener('click',toggle); form.removeEventListener('submit',guard,true); form.removeEventListener('click',guard,true); review.removeEventListener('click',guard,true); form.removeEventListener('input',contextInput);
    environment.document?.removeEventListener('visibilitychange',pageHidden); environment.removeEventListener?.('pagehide',cancel);
  }};
}
