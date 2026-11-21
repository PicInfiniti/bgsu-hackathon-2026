import { appliesTo, escapeText as esc } from './review-state.js';
import { meetingDisplayTitle } from './shared-groups.js';
export function preparationMeetings(meetings,playerId) {
  return meetings.filter(m=>m.approved===true&&m.attendees.includes(playerId)).map(m=>({...m,items:m.items.filter(i=>appliesTo(i,playerId)&&!i.sensitive&&!['Health & Injury Follow-up','Insurance & Administration'].includes(i.topic))})).filter(m=>m.items.length).sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id));
}
export function preparationChoices(meetings,selectedIds=null) {
  return meetings.map(m=>`<label><input type="checkbox" name="prep-source" value="${esc(m.id)}" ${selectedIds===null||selectedIds.has(m.id)?'checked':''}><span><strong>${esc(meetingDisplayTitle(m.title))}</strong><small>${esc(m.date)} · ${m.items.length} record${m.items.length===1?'':'s'}</small></span></label>`).join('')||'<p>No approved, non-sensitive player records are available.</p>';
}
export async function consumePreparation(response,onEvent) {
  if(!response.ok){let message='Preparation request failed.';try{const data=await response.json();if(typeof data.detail==='string')message=data.detail;}catch{}throw Error(message);}
  if(!response.body)throw Error('Preparation streaming is unavailable.');
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
  try{
    while(true){const {value,done}=await reader.read();buffer+=decoder.decode(value||new Uint8Array(),{stream:!done});if(buffer.length>100000)throw Error('Preparation stream exceeded its limit.');
      let match;
      while((match=/\r?\n\r?\n/.exec(buffer))){const block=buffer.slice(0,match.index);buffer=buffer.slice(match.index+match[0].length);let event='message';const data=[];
        for(const line of block.split(/\r?\n/)){if(line.startsWith('event:'))event=line.slice(6).trim();if(line.startsWith('data:'))data.push(line.slice(5).trimStart());}
        if(!data.length)continue;let payload;try{payload=JSON.parse(data.join('\n'));}catch{throw Error('Unreadable preparation event.');}
        if(event==='error')throw Error(payload.message||'Preparation stream failed.');
        onEvent(event,payload);
        if(event==='done'){await reader.cancel();return payload;}
      }
      if(done)throw Error('The preparation stream ended before completion. Retry the brief.');
    }
  }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
