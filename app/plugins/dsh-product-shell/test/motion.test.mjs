import test from 'node:test';
import assert from 'node:assert/strict';
import { measuredStageFraction, researchStageRows, createMotionController } from '../src/motion-core.js';

test('stage percentages use recorded successful tasks, never elapsed time or failed attempts', () => {
  assert.equal(measuredStageFraction({status:'running',started_at:'2000-01-01'}),null);
  assert.equal(measuredStageFraction({status:'running',agents_total:8,agents_done:3,agents_failed:2}),3/8);
  assert.equal(measuredStageFraction({status:'failed',agents_total:8,agents_done:3}),3/8);
  assert.equal(measuredStageFraction({status:'cancelled'}),null);
  assert.equal(measuredStageFraction({status:'pending'}),0);
  assert.equal(measuredStageFraction({status:'completed'}),1);
  assert.equal(measuredStageFraction({status:'running',agents_total:2,agents_done:5}),1);
});

test('specified symbols show preparation and five stages, counting current roles only', () => {
  const run={current_stage:'research_debate',status:'running',stages:{base_research:{status:'completed'},research_debate:{status:'running',agents_total:9,agents_done:9}},agents:{a:{stage:'research_debate',status:'completed'},b:{stage:'research_debate',status:'failed'},c:{stage:'research_debate',status:'running'}}};
  const rows=researchStageRows(run);
  assert.equal(rows.length,6);
  assert.equal(rows[0].stage,'data_preparation');
  assert.equal(rows[1].status,'completed');
  assert.equal(rows[2].agents_done,1);
  assert.equal(rows[2].agents_total,3);
  assert.equal(measuredStageFraction(rows[2]),1/3);
  assert.equal(rows[5].recorded,false);
  assert.equal(rows[5].status,'pending');
  assert.equal(run.stages.research_debate.agents_done,9);
});

test('screening rounds display seven stages and keep unknown progress indeterminate', () => {
  const rows=researchStageRows({symbols_source:'screening',current_stage:'screening',status:'running'});
  assert.equal(rows.length,7);
  assert.equal(rows[0].stage,'screening');
  assert.equal(measuredStageFraction(rows[0]),null);
});

function animatedElement(){
  const animations=[];
  return {animations,animate(frames){let resolve,reject;const finished=new Promise((a,b)=>{resolve=a;reject=b;});const animation={frames,finished,resolve,cancel(){reject(new Error('cancelled'));}};animations.push(animation);return animation;}};
}

test('closing completion cannot hide a panel reopened during its transition', async () => {
  const element=animatedElement(),controller=createMotionController(),commits=[];
  controller.play(element,[{opacity:1},{opacity:0}],140,()=>commits.push('closed'));
  const closing=element.animations[0];
  controller.play(element,[{opacity:0},{opacity:1}],200,()=>commits.push('open'));
  closing.resolve();element.animations[1].resolve();
  await Promise.resolve();await Promise.resolve();
  assert.deepEqual(commits,['open']);
});

test('disabled motion and unsupported animation APIs finish immediately', () => {
  const controller=createMotionController();let completed=0;
  const element=animatedElement();
  controller.play(element,[{opacity:0},{opacity:1}],0,()=>completed++);
  controller.play({},[],200,()=>completed++);
  assert.equal(completed,2);
  assert.equal(element.animations.length,0);
});
