import test from 'node:test';
import assert from 'node:assert/strict';
import {observeWorkspaceHeader} from '../src/workspace-layout.js';

test('sticky offset follows the measured header when its controls wrap',()=>{
  let height=78,resize,disconnected=false;
  const properties=new Map(),workspace={style:{setProperty:(key,value)=>properties.set(key,value)}};
  const header={closest:()=>workspace,getBoundingClientRect:()=>({height})};
  class ResizeObserver {constructor(callback){resize=callback;}observe(target){assert.equal(target,header);}disconnect(){disconnected=true;}}
  const dispose=observeWorkspaceHeader(header,{ResizeObserver});
  assert.equal(properties.get('--workspace-header-height'),'78px');
  height=124.2;resize();assert.equal(properties.get('--workspace-header-height'),'125px');
  height=0;resize();assert.equal(properties.get('--workspace-header-height'),'125px');
  dispose();assert.equal(disconnected,true);
});

test('resize fallback updates header offset and can be cleaned up',()=>{
  let height=96,listener,removed;
  const properties=new Map(),header={closest:()=>({style:{setProperty:(key,value)=>properties.set(key,value)}}),getBoundingClientRect:()=>({height})};
  const dispose=observeWorkspaceHeader(header,{addEventListener:(event,callback)=>{assert.equal(event,'resize');listener=callback;},removeEventListener:(event,callback)=>{removed=callback;}});
  assert.equal(properties.get('--workspace-header-height'),'96px');
  height=142;listener();assert.equal(properties.get('--workspace-header-height'),'142px');
  dispose();assert.equal(removed,listener);
  assert.doesNotThrow(()=>observeWorkspaceHeader(null,{}));
});
