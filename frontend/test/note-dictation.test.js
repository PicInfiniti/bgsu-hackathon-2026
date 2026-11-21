import assert from 'node:assert/strict';
import test from 'node:test';
import { appendDictation, mountNoteDictation } from '../src/note-dictation.js';

class Element extends EventTarget {
  constructor() { super(); this.value=''; this.textContent=''; this.hidden=false; this.disabled=false; this.maxLength=12000; this.attributes={}; this.classes=new Set(); this.classList={toggle:(name,on)=>on?this.classes.add(name):this.classes.delete(name)}; this.label={textContent:''}; }
  setAttribute(name,value) { this.attributes[name]=value; }
  querySelector() { return this.label; }
  closest() { return null; }
}
class Recognition {
  static instances=[];
  constructor() { Recognition.instances.push(this); this.started=false; this.stopped=false; this.aborted=false; }
  start() { this.started=true; this.onstart?.(); }
  stop() { this.stopped=true; }
  abort() { this.aborted=true; }
  results(...chunks) { this.onresult?.({results:chunks.map(([text,final])=>Object.assign([{transcript:text}],{isFinal:final}))}); }
  end() { this.onend?.(); }
  error(code) { this.onerror?.({error:code}); }
}
function setup(extra={}) {
  const elements=Object.fromEntries(['textarea','button','status','preview','form','review'].map(name=>[name,new Element()]));
  const doc=new Element(); doc.hidden=false;
  const environment={SpeechRecognition:Recognition,isSecureContext:true,Event,document:doc,...extra.environment};
  const controls=mountNoteDictation({...elements,environment,canStart:extra.canStart||(()=>true)});
  const click=()=>elements.button.dispatchEvent(new Event('click'));
  return {...elements,environment,controls,click,recognition:()=>Recognition.instances.at(-1)};
}

test('appends speech without replacing typed text and respects UTF-16 character limits',()=>{
  assert.equal(appendDictation('Coach notes.','Practice footwork.').value,'Coach notes. Practice footwork.');
  assert.equal(appendDictation('Coach notes.\n','Practice footwork.').value,'Coach notes.\nPractice footwork.');
  assert.equal(appendDictation('Keep','  ').added,false);
  const limited=appendDictation('12345','abcdef',9);
  assert.equal(limited.value,'12345 abc'); assert.equal(limited.truncated,true);
  assert.equal(appendDictation('12345','🏈',7).value,'12345');
});

test('interim preview never alters the note; each final chunk is appended once and emits input',()=>{
  const c=setup(); c.textarea.value='Existing note.'; let inputs=0;
  c.textarea.addEventListener('input',()=>inputs++);
  c.click(); const rec=c.recognition();
  assert.equal(rec.lang,'en-US'); assert.equal(rec.continuous,true);
  rec.results(['Avery needs',false]);
  assert.equal(c.textarea.value,'Existing note.'); assert.equal(c.preview.hidden,false);
  rec.results(['Avery needs footwork practice.',true]);
  c.textarea.value+=' Coach typed an edit.';
  rec.results(['Avery needs footwork practice.',true],['By Friday.',true]);
  assert.equal(c.textarea.value,'Existing note. Avery needs footwork practice. Coach typed an edit. By Friday.');
  assert.equal(inputs,2);
  c.click(); assert.equal(rec.stopped,true); assert.equal(c.controls.active,true);
  rec.results(['Avery needs footwork practice.',true],['By Friday.',true],['Bring film.',true]); rec.end();
  assert.ok(c.textarea.value.endsWith('By Friday. Bring film.'));
  assert.equal(c.controls.active,false); assert.equal(c.button.attributes['aria-pressed'],'false');
});

test('cancel discards late callbacks from previous contexts and never restarts automatically',()=>{
  const c=setup();c.click();const old=c.recognition();
  old.results(['First note.',true]);c.controls.cancel();
  c.textarea.value='New meeting.';old.results(['Late words.',true]);old.end();
  assert.equal(c.textarea.value,'New meeting.');assert.equal(old.aborted,true);
  assert.equal(c.controls.active,false);
  c.click();const next=c.recognition();old.error('not-allowed');
  assert.equal(c.controls.active,true);next.end();assert.equal(c.controls.active,false);
  c.controls.destroy();
});

test('permission, network and microphone errors preserve notes and reset the start button',()=>{
  for(const code of ['not-allowed','network','audio-capture','no-speech']){
    const c=setup();c.textarea.value='Keep this.';c.click();const rec=c.recognition();rec.error(code);rec.end();
    assert.equal(c.textarea.value,'Keep this.');assert.equal(c.controls.active,false);
    assert.equal(c.button.disabled,false);assert.ok(c.status.classes.has('is-error'));
    assert.equal(c.preview.hidden,true);assert.equal(rec.aborted,true);
  }
});

test('unsupported browsers, insecure contexts and blocked starts do not activate a microphone',()=>{
  const unsupported=setup({environment:{SpeechRecognition:undefined}});
  assert.equal(unsupported.button.disabled,true);assert.ok(unsupported.status.textContent.includes('unavailable'));
  unsupported.click();assert.equal(unsupported.controls.active,false);
  const insecure=setup({environment:{isSecureContext:false}});assert.equal(insecure.button.disabled,true);
  const blocked=setup({canStart:()=>false});blocked.click();assert.equal(blocked.controls.active,false);
  const prefixed=setup({environment:{SpeechRecognition:undefined,webkitSpeechRecognition:Recognition}});prefixed.click();assert.equal(prefixed.controls.active,true);prefixed.controls.cancel();
});

test('the character limit stops recognition and stale results cannot append more text',()=>{
  const c=setup();c.textarea.maxLength=8;c.textarea.value='Note';c.click();const rec=c.recognition();
  rec.results(['more words',true]);assert.equal(c.textarea.value,'Note mor');assert.equal(c.controls.active,false);assert.equal(rec.aborted,true);
  rec.results(['more words',true],['extra',true]);assert.equal(c.textarea.value,'Note mor');assert.ok(c.status.textContent.includes('character limit'));
});

test('form submission waits for the final transcript and visibility changes cancel capture',()=>{
  const c=setup();c.click();let submits=0;
  c.form.addEventListener('submit',()=>submits++);
  const e=new Event('submit',{cancelable:true});c.form.dispatchEvent(e);
  assert.equal(e.defaultPrevented,true);assert.equal(submits,0);assert.equal(c.recognition().stopped,true);
  c.recognition().end();c.form.dispatchEvent(new Event('submit'));assert.equal(submits,1);
  c.click();c.environment.document.hidden=true;c.environment.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(c.controls.active,false);assert.equal(c.recognition().aborted,true);
});

test('recognizer construction/start/stop failures preserve notes and release the listening state',()=>{
  const constructorFailure=setup({environment:{SpeechRecognition:class {constructor(){throw Error('Unavailable');}}}});
  constructorFailure.textarea.value='Keep notes.';constructorFailure.click();
  assert.equal(constructorFailure.controls.active,false);assert.equal(constructorFailure.textarea.value,'Keep notes.');assert.ok(constructorFailure.status.classes.has('is-error'));
  const startFailure=setup({environment:{SpeechRecognition:class extends Recognition {start(){throw Error('Blocked');}}}});
  startFailure.click();assert.equal(startFailure.controls.active,false);assert.equal(startFailure.button.disabled,false);
  const stopFailure=setup({environment:{SpeechRecognition:class extends Recognition {stop(){throw Error('Already ended');}}}});
  stopFailure.textarea.value='Keep this.';stopFailure.click();const rec=stopFailure.recognition();stopFailure.controls.stop();
  assert.equal(stopFailure.controls.active,false);assert.equal(rec.aborted,true);assert.equal(stopFailure.textarea.value,'Keep this.');
});

test('a full note never starts recognition and meeting-context input cancels active capture',()=>{
  const full=setup();full.textarea.maxLength=4;full.textarea.value='Full';const count=Recognition.instances.length;full.click();
  assert.equal(Recognition.instances.length,count);assert.equal(full.controls.active,false);assert.ok(full.status.textContent.includes('character limit'));
  const context=setup();context.click();const rec=context.recognition();context.form.dispatchEvent(new Event('input',{bubbles:true}));
  assert.equal(context.controls.active,false);assert.equal(rec.aborted,true);rec.results(['Late words',true]);assert.equal(context.textarea.value,'');
});
