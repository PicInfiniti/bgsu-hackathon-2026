// Voice notes use the browser's Web Speech API. Audio never leaves the browser;
// only the recognised text is sent to the backend for clean-up.
export const VOICE_TOOLTIP = 'Voice works in Chrome and Edge.';

export function speechRecognitionClass(win = globalThis) {
  return win?.SpeechRecognition || win?.webkitSpeechRecognition || null;
}

export function voiceButtonState(win = globalThis) {
  const supported = Boolean(speechRecognitionClass(win));
  return { supported, hidden: !supported, tooltip: supported ? 'Speak your note' : VOICE_TOOLTIP };
}

export function formatTimer(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Starts recognition; calls onText(finalText, interimText). Returns a stop() function. */
export function startDictation(win, { onText, onEnd, onError, onFinal }) {
  const Recognition = speechRecognitionClass(win);
  if (!Recognition) throw Error(VOICE_TOOLTIP);
  const recognition = new Recognition();
  recognition.continuous = true; recognition.interimResults = true; recognition.lang = 'en-US';
  let finalText = '', stopped = false;
  recognition.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const piece = event.results[i][0].transcript;
      if (event.results[i].isFinal) { finalText += (finalText && !finalText.endsWith(' ') ? ' ' : '') + piece.trim(); onFinal?.(piece.trim()); }
      else interim += piece;
    }
    onText(finalText, interim);
  };
  recognition.onerror = (event) => { if (event.error !== 'no-speech' && event.error !== 'aborted') onError?.(event.error === 'not-allowed' ? 'Allow the microphone to use Voice.' : 'Voice stopped. Try again.'); };
  // Chrome ends recognition after silence; restart until the coach presses stop.
  recognition.onend = () => { if (!stopped) { try { recognition.start(); } catch { onEnd?.(finalText); } } else onEnd?.(finalText); };
  recognition.start();
  return () => { stopped = true; recognition.stop(); };
}
