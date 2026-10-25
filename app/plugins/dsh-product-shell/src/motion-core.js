// Embedded into the script-style client by generate-shell-motion.mjs.
// These helpers have no browser side effects, so progress and cancellation can
// also be checked without loading DSH or calling a model.
export const RESEARCH_STAGE_KEYS = Object.freeze([
  'base_research', 'research_debate', 'portfolio_draft', 'risk_review', 'final_decision'
]);

export function measuredStageFraction(row) {
  if (row?.status === 'completed') return 1;
  const total = Number(row?.agents_total);
  const completed = Number(row?.agents_done ?? 0);
  if (Number.isFinite(total) && total > 0 && Number.isFinite(completed)) {
    return Math.min(1, Math.max(0, completed / total));
  }
  return row?.status === 'pending' || row?.status === 'idle' ? 0 : null;
}

export function researchStageRows(run) {
  const stages = run?.stages ?? {};
  return RESEARCH_STAGE_KEYS.map(stage => {
    const saved = stages[stage];
    const row = saved && typeof saved === 'object' ? { ...saved, stage, recorded: true } : { stage, status: 'pending', recorded: false };
    const tasks = Object.values(run?.agents ?? {}).filter(task => task && task.stage === stage);
    if (row.status !== 'completed' && tasks.length) {
      // Saved counters include previous attempts; the role map contains
      // the current task for each role and is authoritative when present.
      row.agents_total = tasks.length;
      row.agents_done = tasks.filter(task => task.status === 'completed').length;
      row.agents_failed = tasks.filter(task => task.status === 'failed').length;
    }
    if (!row.recorded && run?.current_stage === stage) row.status = run.status === 'failed' ? 'failed' : run.status === 'cancelled' ? 'cancelled' : 'running';
    return row;
  });
}

export function createMotionController() {
  let revision = 0;
  let current = null;
  function cancel() {
    revision += 1;
    current?.cancel();
    current = null;
  }
  function play(element, frames, milliseconds, finished = () => {}) {
    let visible;
    if (current && element?.ownerDocument?.defaultView) {
      const style = element.ownerDocument.defaultView.getComputedStyle(element);
      visible = { opacity: style.opacity, transform: style.transform };
    }
    cancel();
    const token = revision;
    if (!element || !element.animate || milliseconds <= 0) {
      finished();
      return;
    }
    const keyframes = frames.map(frame => ({ ...frame }));
    if (visible) Object.assign(keyframes[0], visible);
    const animation = element.animate(keyframes, {
      duration: milliseconds, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both'
    });
    current = animation;
    animation.finished.then(() => {
      if (revision !== token) return;
      current = null;
      finished();
      animation.cancel();
    }).catch(() => {});
  }
  return { play, cancel };
}
