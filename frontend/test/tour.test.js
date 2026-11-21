import assert from 'node:assert/strict';
import { TOURS, step, shouldStart, readTourSettings, rememberTour, TOUR_STORAGE_KEY } from '../src/tour.js';

const memory = new Map();
const storage = {getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value)};
assert.equal(shouldStart(readTourSettings(storage),'welcome'),true);
rememberTour(storage,'welcome','dismissed');
assert.equal(shouldStart(readTourSettings(storage),'welcome'),false);
rememberTour(storage,'another','done');
assert.equal(readTourSettings(storage).tours.welcome,'dismissed');
memory.set(TOUR_STORAGE_KEY,'invalid json');
assert.deepEqual(readTourSettings(storage),{});
assert.deepEqual(readTourSettings({getItem(){throw Error('Storage disabled');}}),{});
assert.doesNotThrow(()=>rememberTour({setItem(){throw Error('Storage disabled');}},'welcome','done'));
assert.equal(step({index:0},'back',TOURS.welcome.length).index,0);
assert.equal(step({index:TOURS.welcome.length-1},'next',TOURS.welcome.length).ended,'done');
assert.equal(step({index:1},'close',TOURS.welcome.length).ended,'dismissed');
assert.ok(TOURS.welcome.some(s=>s.target==='#header-ask'));
