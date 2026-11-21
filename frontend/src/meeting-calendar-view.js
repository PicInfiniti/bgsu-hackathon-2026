import { escapeText as esc } from './review-state.js';
import { meetingDisplayTitle, meetingTypeLabel } from './shared-groups.js';
import { monthGrid, weekDays, MONTHS } from './calendar-math.js';
const dayStamp = date => Date.parse(`${date}T00:00:00Z`);
export const shiftCalendarDay = (date,days) => new Date(dayStamp(date)+days*86400000).toISOString().slice(0,10);
export function calendarDays(month,view='month',anchor=`${month}-01`) {
  if (view === 'day') return [anchor];
  return view === 'week' ? weekDays(anchor) : monthGrid(`${month}-01`).map(cell => cell.date);
}
export function meetingCalendarMarkup(meetings,{month,today,selectedDate=null,view='month',anchor=today,showDeadlines=true}={}) {
  const days=calendarDays(month,view,anchor),byDate=new Map(),due=new Map();
  for(const meeting of meetings){
    if(!byDate.has(meeting.date))byDate.set(meeting.date,[]);byDate.get(meeting.date).push(meeting);
    for(const item of meeting.items){if(showDeadlines&&item.kind==='action'&&!item.completed&&item.due_date&&!item.sensitive&&!['Health & Injury Follow-up','Insurance & Administration'].includes(item.topic))due.set(item.due_date,(due.get(item.due_date)||0)+1);}
  }
  if (view === 'year') return `<div class="meeting-year-grid">${MONTHS.map((name,index)=>{
    const value=`${month.slice(0,4)}-${String(index+1).padStart(2,'0')}`;
    return `<section class="meeting-mini-month"><button type="button" class="meeting-mini-title" data-calendar-month="${value}" aria-label="Open ${name} ${month.slice(0,4)}">${name}</button><div class="meeting-mini-days">${['M','T','W','T','F','S','S'].map(d=>`<span>${d}</span>`).join('')}${monthGrid(`${value}-01`).map(cell=>{
      if(!cell.inMonth)return '<span></span>';
      const count=byDate.get(cell.date)?.length||0,deadline=due.get(cell.date)||0;
      return `<button type="button" data-large-calendar-date="${cell.date}" class="${count?'has-meetings':''} ${deadline?'has-deadline':''} ${cell.date===today?'is-today':''} ${cell.date===selectedDate?'is-selected':''}" aria-label="${cell.date} · ${count} meetings${deadline?` · ${deadline} open actions due`:''}" ${cell.date===today?'aria-current="date"':''}>${Number(cell.date.slice(8))}</button>`;
    }).join('')}</div></section>`;
  }).join('')}</div>`;
  const headings=view==='day'?[new Date(`${anchor}T12:00:00`).toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'})]:['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const currentWeek=new Set(weekDays(today));
  return `<div class="meeting-large-calendar ${view==='week'?'is-week-view':''} ${view==='day'?'is-day-view':''}" role="group" aria-label="${view==='week'?'Week':view==='day'?'Day':'Month'} calendar">${headings.map(day=>`<div class="meeting-large-weekday">${day}</div>`).join('')}${days.map(date=>{
    const rows=(byDate.get(date)||[]).slice().sort((a,b)=>meetingDisplayTitle(a.title).localeCompare(meetingDisplayTitle(b.title))||a.id.localeCompare(b.id));
    const openDue=due.get(date)||0;
    const limit=view==='month'?(openDue?1:2):rows.length;
    const label=new Date(`${date}T12:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
    const dayLabel=date.endsWith('-01')?new Date(`${date}T12:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric'}):String(Number(date.slice(-2)));
    return `<section class="meeting-large-day ${view==='month'&&date.slice(0,7)!==month?'is-outside-month':''} ${currentWeek.has(date)?'is-current-week':''} ${date===today?'is-today':''} ${date===selectedDate?'is-selected':''}" data-large-calendar-cell="${date}" aria-label="${esc(label)}"><button class="meeting-large-day-number" type="button" data-large-calendar-date="${date}" aria-label="${esc(label)} · ${rows.length} meetings${openDue?` · ${openDue} open actions due`:''}" aria-pressed="${date===selectedDate}" ${date===today?'aria-current="date"':''}>${esc(dayLabel)}</button><div class="meeting-large-events">${rows.slice(0,limit).map(m=>`<button type="button" class="meeting-calendar-event event-${esc(m.meeting_type)}" data-open-meeting="${esc(m.id)}" title="${esc(meetingDisplayTitle(m.title))} · ${esc(meetingTypeLabel(m.meeting_type))} · ${esc(label)}"><span class="event-type-dot" aria-hidden="true"></span><span>${esc(meetingDisplayTitle(m.title))}</span></button>`).join('')}${rows.length>limit?`<button type="button" class="meeting-calendar-more" data-large-calendar-date="${date}">+${rows.length-limit} more meeting${rows.length-limit===1?'':'s'}</button>`:''}${openDue?`<button type="button" class="meeting-calendar-due" data-large-calendar-date="${date}">${openDue} open action${openDue===1?'':'s'} due</button>`:''}${!rows.length&&!openDue&&view!=='month'?'<p class="meeting-day-empty">No meetings or visible deadlines.</p>':''}</div></section>`;
  }).join('')}</div>`;
}
