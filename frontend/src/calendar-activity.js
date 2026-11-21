import { escapeText as esc, appliesTo } from './review-state.js';
import { meetingTypeLabel } from './shared-groups.js';

export function calendarGrid(meetings, monthValue, today, selectedDate, typed = false) {
  const [year,month] = monthValue.split('-').map(Number);
  const start = new Date(year,month-1,1).getDay();
  const days = new Date(year,month,0).getDate();
  const deadlines = new Set(meetings.flatMap(m => m.items.filter(i => i.kind === 'action' && !i.completed && i.due_date).map(i => i.due_date)));
  return ['Su','Mo','Tu','We','Th','Fr','Sa'].map(day => `<span class="weekday">${day}</span>`).join('') + '<span aria-hidden="true"></span>'.repeat(start) + Array.from({length:days},(_,index) => {
    const date = `${monthValue}-${String(index+1).padStart(2,'0')}`;
    const saved = meetings.filter(m => m.date === date);
    const types = ['individual','group','team'].map(type => ({type,count:saved.filter(m => m.meeting_type === type).length})).filter(entry => entry.count);
    const meetingLabel = typed ? types.map(({type,count}) => `${count} ${meetingTypeLabel(type).toLowerCase()}${count===1?'':'s'}`).join(', ') : saved.length ? `${saved.length} saved meeting${saved.length===1?'':'s'}` : '';
    const label = `${date}${meetingLabel ? `, ${meetingLabel}` : ''}${deadlines.has(date) ? ', open action due' : ''}`;
    const tooltip = [meetingLabel, deadlines.has(date) ? 'Action due' : ''].filter(Boolean).join(' · ');
    const dots = typed ? types.map(({type}) => `<i class="meeting-${type}"></i>`).join('') : saved.length ? '<i class="meeting-dot"></i>' : '';
    return `<button type="button" class="calendar-day ${date===today?'today':''} ${date===selectedDate?'selected-day':''} ${deadlines.has(date)?'has-action-due':''}" data-calendar-date="${date}" aria-pressed="${date===selectedDate}" ${date===today?'aria-current="date"':''} aria-label="${esc(label)}" ${tooltip ? `title="${esc(tooltip)}"` : ''}>${index+1}<span class="day-markers" aria-hidden="true">${dots}</span></button>`;
  }).join('');
}

export const calendarMeetings = (meetings, type) => type ? meetings.filter(m => m.meeting_type === type) : meetings;
export const playerCalendarMeetings = (meetings, playerId) => meetings.filter(m => m.attendees.includes(playerId)).map(m => ({...m,items:m.items.filter(i => appliesTo(i,playerId))}));

export function activityForDate(meetings, date, {showSensitive = false} = {}) {
  const due = meetings.flatMap(meeting => meeting.items
    .filter(item => item.kind === 'action' && item.due_date === date)
    .map(item => ({...item, meeting})));
  return {
    meetings: meetings.filter(meeting => meeting.date === date),
    actions: due.filter(item => showSensitive || !item.sensitive),
    hiddenActionCount: showSensitive ? 0 : due.filter(item => item.sensitive).length,
  };
}
