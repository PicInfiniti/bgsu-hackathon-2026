// iCalendar serialization follows RFC 5545. No AI call, calendar service or storage write.
import { escapeText as esc } from './review-state.js';
import { meetingDisplayTitle } from './shared-groups.js';

const sensitiveTopics = new Set(['Health & Injury Follow-up', 'Insurance & Administration']);
export const calendarActionKey = item => JSON.stringify([item.meeting.id,item.id]);
const validDate = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const stamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0,10) === value && value < '9999-12-31';
};

export function eligibleCalendarActions(actions, players) {
  const roster = new Map(players.map(p => [p.id,p]));
  const seen = new Set();
  return actions.flatMap(item => {
    const m = item.meeting;
    if (item.kind !== 'action' || item.completed || item.sensitive || sensitiveTopics.has(item.topic) || m?.approved !== true || !validDate(item.due_date)) return [];
    if (!validDate(m.date) || item.due_date < m.date || typeof m.id !== 'string' || !m.id || typeof item.id !== 'string' || !item.id || typeof item.text !== 'string' || !item.text.trim()) return [];
    const ids = [...new Set(item.player_ids?.length ? item.player_ids : [item.player_id])];
    if (!ids.length || ids.some(id => !roster.has(id) || !m.attendees?.includes(id))) return [];
    const key = calendarActionKey(item);
    if (seen.has(key)) return [];
    seen.add(key);
    return [{key, item, playerNames:ids.map(id => roster.get(id).name)}];
  });
}

const textValue = value => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
function foldLine(line) {
  const encoder = new TextEncoder();
  let result = '', chunk = '', bytes = 0;
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (bytes + size > 75) { result += chunk + '\r\n'; chunk = ' '; bytes = 1; }
    chunk += character; bytes += size;
  }
  return result + chunk;
}

export function buildCalendar(actions, players, {selectedKeys, now = new Date(), reminder = 'none'} = {}) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error('Calendar export needs a valid timestamp.');
  if (!['none','day-before'].includes(reminder)) throw new Error('Choose a valid calendar reminder.');
  if (selectedKeys !== undefined && (!Array.isArray(selectedKeys) || selectedKeys.some(key => typeof key !== 'string'))) throw new Error('Choose valid actions to export.');
  const selected = selectedKeys === undefined ? null : new Set(selectedKeys);
  const entries = eligibleCalendarActions(actions,players).filter(entry => !selected || selected.has(entry.key));
  if (!entries.length) throw new Error('Select at least one open, dated, non-sensitive action.');
  const timestamp = now.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
  const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//picInfiniti//Falcon Follow-up//EN','CALSCALE:GREGORIAN','X-WR-CALNAME:Falcon Follow-up'];
  for (const {item,playerNames} of entries) {
    const due = item.due_date.replaceAll('-','');
    const next = new Date(Date.parse(`${item.due_date}T00:00:00Z`) + 86400000).toISOString().slice(0,10).replaceAll('-','');
    const summary = `${playerNames.join(', ')}: ${item.text}`;
    const description = [`Player${playerNames.length === 1 ? '' : 's'}: ${playerNames.join(', ')}`,`Action: ${item.text}`,`Due: ${item.due_date}`,`Source meeting: ${meetingDisplayTitle(item.meeting.title)}`,`Meeting date: ${item.meeting.date}`,`Skill: ${item.skill || 'Not specified'}`,`Topic: ${item.topic || 'Not specified'}`].join('\n');
    // Encode the complete ID pair, avoiding separator collisions and header injection.
    const uid = `${encodeURIComponent(calendarActionKey(item))}@falcon-follow-up.local`;
    lines.push('BEGIN:VEVENT',`UID:${uid}`,`DTSTAMP:${timestamp}`,`DTSTART;VALUE=DATE:${due}`,`DTEND;VALUE=DATE:${next}`,`SUMMARY:${textValue(summary)}`,`DESCRIPTION:${textValue(description)}`,'CLASS:PRIVATE','TRANSP:TRANSPARENT');
    if (reminder === 'day-before') lines.push('BEGIN:VALARM','ACTION:DISPLAY','TRIGGER:-P1D',`DESCRIPTION:${textValue(summary)}`,'END:VALARM');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return {content:lines.map(foldLine).join('\r\n') + '\r\n', count:entries.length};
}

export function exportChoicesMarkup(entries) {
  return entries.map(({key,item,playerNames}) => `<label class="calendar-export-choice"><input type="checkbox" name="calendar-export-action" value="${esc(key)}" checked><span><strong>${esc(item.text)}</strong><span>${playerNames.map(esc).join(' · ')}</span><small>Due ${esc(item.due_date)} · ${esc(meetingDisplayTitle(item.meeting.title))} · ${esc(item.meeting.date)}</small></span></label>`).join('') || '<p class="calendar-export-empty">No exportable actions match these filters. Choose Open or All, check your player/category/search filters, and turn off sensitive-only mode. Actions need a deadline to appear here.</p>';
}
