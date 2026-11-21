import { escapeText as esc } from './review-state.js';
import { meetingTypeLabel, meetingDisplayTitle, groupRecords } from './shared-groups.js';

export function filterMeetings(meetings, players, {search = '', type = '', player = '', start = '', end = '', period = 'all', sort = 'recent', today} = {}) {
  const roster = new Map(players.map(p => [p.id, p]));
  const query = search.trim().toLowerCase();
  return meetings.filter(m => {
    if (type && m.meeting_type !== type || player && !m.attendees.includes(player)) return false;
    if (start && m.date < start || end && m.date > end || start && end && start > end) return false;
    if (period === 'upcoming' && m.date < today || period === 'past' && m.date >= today) return false;
    // Hidden sensitive text must not become discoverable through search.
    const safeText = m.items.some(i => i.sensitive) ? '' : m.note;
    const names = m.attendees.map(id => { const p = roster.get(id); return p ? `${p.name} ${p.number} ${p.position}` : ''; }).join(' ');
    return `${meetingDisplayTitle(m.title)} ${names} ${safeText}`.toLowerCase().includes(query);
  }).sort((a,b) => sort === 'oldest' ? a.date.localeCompare(b.date) || a.id.localeCompare(b.id)
    : sort === 'title' ? meetingDisplayTitle(a.title).localeCompare(meetingDisplayTitle(b.title)) || b.date.localeCompare(a.date)
    : b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

export function meetingListMarkup(meetings, players, today) {
  const roster = new Map(players.map(p => [p.id,p.name]));
  return meetings.map(m => {
    const names = m.attendees.map(id => roster.get(id) || 'Unknown player');
    const visible = m.items.filter(i => !i.sensitive);
    const open = visible.filter(i => i.kind === 'action' && !i.completed).length;
    return `<article class="library-meeting ${esc(m.meeting_type)}-library-meeting"><div class="library-meeting-date"><strong>${esc(m.date.slice(8))}</strong><span>${esc(new Date(`${m.date}T12:00:00`).toLocaleDateString('en-US',{month:'short',year:'numeric'}))}</span></div><div class="library-meeting-description"><div class="library-meeting-labels"><span class="badge">${esc(meetingTypeLabel(m.meeting_type))}</span>${m.date > today ? '<span class="library-future">Future date</span>' : m.date === today ? '<span class="library-future">Today</span>' : ''}</div><h3><button type="button" data-open-meeting="${esc(m.id)}">${esc(meetingDisplayTitle(m.title))}</button></h3><p>${names.slice(0,3).map(esc).join(' · ')}${names.length > 3 ? ` · +${names.length-3} more` : ''}</p><small>${names.length} attendee${names.length === 1 ? '' : 's'} · ${m.note_only ? 'Original note' : `${visible.length} visible records`} · ${open} open action${open === 1 ? '' : 's'}</small></div><button class="secondary compact" type="button" data-open-meeting="${esc(m.id)}" aria-label="Open meeting: ${esc(meetingDisplayTitle(m.title))}">View meeting ↗</button></article>`;
  }).join('') || '<div class="panel empty">No meetings match these filters. Try another date, type, or player.</div>';
}

export function meetingDetailMarkup(meeting, players, showSensitive, renderRecord) {
  const roster = new Map(players.map(p => [p.id,p]));
  const visible = meeting.items.filter(i => !i.sensitive || showSensitive);
  const hidden = meeting.items.length - visible.length;
  const groups = groupRecords(visible);
  const records = groups.map(group => group.shared
    ? `<details class="library-shared-record"><summary>${esc(group.item.text)}<small>${group.members.length} player records · Expand for individual updates</small></summary>${group.members.map(i => renderRecord(i,meeting,showSensitive)).join('')}</details>`
    : renderRecord(group.item,meeting,showSensitive)).join('');
  return `<header class="library-detail-heading"><div><p class="eyebrow">${esc(meetingTypeLabel(meeting.meeting_type))} · ${esc(meeting.date)}</p><h2 id="meeting-detail-title" tabindex="-1">${esc(meetingDisplayTitle(meeting.title))}</h2><p>${meeting.attendees.length} attendees · ${meeting.note_only ? 'Original note saved' : 'Coach-approved records'}</p></div></header>
    <div class="library-detail-layout"><div class="library-detail-main"><section class="panel library-original-note"><h3>Original meeting note</h3>${hidden ? '<p class="sensitive-notice">This note contains sensitive content. Enable sensitive records to view the full note.</p>' : `<p class="original-note-text">${esc(meeting.note)}</p>`}</section><section class="library-records"><h3>Feedback & follow-ups</h3>${hidden ? `<p class="sensitive-notice">${hidden} sensitive record${hidden === 1 ? '' : 's'} hidden.</p>` : ''}${records || `<div class="panel empty">${hidden ? 'Enable sensitive records to review these entries.' : 'This meeting has no extracted feedback or tasks. The date, attendees, and original note are saved.'}</div>`}</section></div>
    <aside><section class="panel library-attendees"><h3>Meeting attendees</h3>${meeting.attendees.map(id => { const p = roster.get(id); return `<button type="button" data-open-player="${esc(id)}"><span>${esc(p?.name || 'Unknown player')}<small>${p ? `#${esc(p.number)} · ${esc(p.position)}` : ''}</small></span><span aria-hidden="true">↗</span></button>`; }).join('')}</section></aside></div>`;
}

// Keep calendar deadlines consistent with the default sensitive-record visibility.
export const meetingCalendarSource = meetings => meetings.map(m => ({...m, items:m.items.filter(i => !i.sensitive && !['Health & Injury Follow-up','Insurance & Administration'].includes(i.topic))}));
