// "Who's talking?" — speaker labels chosen by the coach while recording.
// The browser's speech-to-text returns one combined text with no speakers, so
// these labels are never "detected": every line is marked "tagged by coach".
export const SOURCE = 'coach_tag';
export const UNKNOWN = 'Unknown';

export const mmss = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

/** A speaker choice: { label, player_id }. Coach / Other / Unknown are never linked to a player. */
export function speaker(label, playerId = null) {
  const plain = ['Coach', 'Other', UNKNOWN].includes(label);
  return { label, player_id: plain ? null : playerId };
}

/** Add one finished piece of speech under the current speaker; nothing is added when no one was tapped. */
export function addLine(lines, current, text, startMs) {
  const t = (text || '').trim();
  if (!t || !current) return lines;
  const last = lines.at(-1);
  if (last && last.speaker_label === current.label && last.player_id === current.player_id && startMs - last.start_ms < 15000) {
    return [...lines.slice(0, -1), { ...last, text: `${last.text} ${t}` }];
  }
  return [...lines, { speaker_label: current.label, player_id: current.player_id, start_ms: startMs, text: t, source: SOURCE }];
}

export function relabel(lines, index, who) {
  return lines.map((l, i) => i === index ? { ...l, speaker_label: who.label, player_id: who.player_id } : l);
}

/** Split a line at a word position (the second half keeps the time and gets the same speaker until relabelled). */
export function splitLine(lines, index, at) {
  const l = lines[index];
  const first = l.text.slice(0, at).trim(), second = l.text.slice(at).trim();
  if (!first || !second) return lines;
  return [...lines.slice(0, index), { ...l, text: first }, { ...l, text: second, start_ms: l.start_ms + 1 }, ...lines.slice(index + 1)];
}

/** Text that goes into the note: one line per speaker turn, e.g. "[00:07] Alex Carter: I missed the safety." */
export function labelledText(lines) {
  return lines.map(l => `[${mmss(l.start_ms)}] ${l.speaker_label}: ${l.text}`).join('\n');
}

export function speakerCount(lines) {
  return new Set(lines.map(l => l.speaker_label).filter(l => l !== UNKNOWN)).size;
}
