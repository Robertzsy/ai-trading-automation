import test from 'node:test';
import assert from 'node:assert/strict';
import {withLanguage,message,setInvocationLanguage} from '../lib/copy.js';

test('overlapping invocations and resumed rounds retain independent languages',async()=>{
  let release;
  const waiting=new Promise(resolve=>{release=resolve;});
  const english=withLanguage('en',async()=>{await waiting;return message('repair.approve.this.plan');});
  const chinese=withLanguage('zh',async()=>{setInvocationLanguage('zh');release();await Promise.resolve();return message('repair.approve.this.plan');});
  assert.deepEqual(await Promise.all([english,chinese]),['Approve this plan','确认此方案']);
});
