import { escapeText as esc } from './review-state.js';
import { meetingDisplayTitle, meetingTypeLabel } from './shared-groups.js';
const dayStamp = date => Date.parse(`${date}T00:00:00Z`);
export const shiftCalendarDay = (date,days) => new Date(dayStamp(date)+days*86400000).toISOString().slice(0,10);
export function calendarDays(month,view='month',anchor=`${month}-01`) {
  const first=`${month}-01`,start=view==='week'?anchor:first;
  const weekday=new Date(`${start}T00:00:00Z`).getUTCDay();
  const count=view==='week'?7:Math.max(35,Math.ceil((weekday+new Date(Number(month.slice(0,4)),Number(month.slice(5)),0).getDate())/7)*7);
  const from=shiftCalendarDay(start,-weekday);
  return Array.from({length:count},(_,i)=>shiftCalendarDay(from,i));
}
export function meetingCalendarMarkup(meetings,{month,today,selectedDate=null,view='month',anchor=today}={}) {
  const days=calendarDays(month,view,anchor),byDate=new Map(),due=new Map();
  for(const meeting of meetings){
    if(!byDate.has(meeting.date))byDate.set(meeting.date,[]);byDate.get(meeting.date).push(meeting);
    for(const item of meeting.items){if(item.kind==='action'&&!item.completed&&item.due_date&&!item.sensitive&&!['Health & Injury Follow-up','Insurance & Administration'].includes(item.topic))due.set(item.due_date,(due.get(item.due_date)||0)+1);}
  }
  return `<div class="meeting-large-calendar ${view==='week'?'is-week-view':''}" role="group" aria-label="${view==='week'?'Week':'Month'} calendar">${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map(day=>`<div class="meeting-large-weekday">${day}</div>`).join('')}${days.map(date=>{
    const rows=(byDate.get(date)||[]).slice().sort((a,b)=>meetingDisplayTitle(a.title).localeCompare(meetingDisplayTitle(b.title))||a.id.localeCompare(b.id));
    const limit=view==='week'?rows.length:3,openDue=due.get(date)||0;
    const label=new Date(`${date}T12:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
    const dayLabel=date.endsWith('-01')?new Date(`${date}T12:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric'}):String(Number(date.slice(-2)));
    return `<section class="meeting-large-day ${view==='month'&&date.slice(0,7)!==month?'is-outside-month':''} ${date===today?'is-today':''} ${date===selectedDate?'is-selected':''}" data-large-calendar-cell="${date}" aria-label="${esc(label)}"><button class="meeting-large-day-number" type="button" data-large-calendar-date="${date}" aria-label="${esc(label)} · ${rows.length} meetings${openDue?` · ${openDue} open actions due`:''}" aria-pressed="${date===selectedDate}" ${date===today?'aria-current="date"':''}>${esc(dayLabel)}</button><div class="meeting-large-events">${rows.slice(0,limit).map(m=>`<button type="button" class="meeting-calendar-event event-${esc(m.meeting_type)}" data-open-meeting="${esc(m.id)}" title="${esc(meetingDisplayTitle(m.title))} · ${esc(meetingTypeLabel(m.meeting_type))} · ${esc(label)}"><span class="event-type-dot" aria-hidden="true"></span><span>${esc(meetingDisplayTitle(m.title))}</span></button>`).join('')}${rows.length>limit?`<button type="button" class="meeting-calendar-more" data-large-calendar-date="${date}">+${rows.length-limit} more meeting${rows.length-limit===1?'':'s'}</button>`:''}${openDue?`<button type="button" class="meeting-calendar-due" data-large-calendar-date="${date}">${openDue} open action${openDue===1?'':'s'} due</button>`:''}</div></section>`;
  }).join('')}</div>`;
}
