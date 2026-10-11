/** Background research has one coordinator attempt; maintenance belongs to chat. */
export function singleRoundAttempt(execute) {
  const attempts = new Map();
  return (args, exec) => {
    if (process.env.ATA_AUTONOMOUS_ROUND !== "1") return execute(args, exec);
    const assigned = process.env.INVESTMENT_CYCLE_ID;
    if (assigned && args.cycle_id && assigned !== args.cycle_id) throw new Error("后台会话不能更换轮次 id 重跑");
    const key = assigned || args.cycle_id || "scheduled";
    if (!attempts.has(key)) {
      const attempt = Promise.resolve().then(() => execute(args, exec));
      attempts.set(key, attempt);
      // Keep the original outcome, including failure, for every repeat call.
      attempt.catch(() => {});
    }
    return attempts.get(key);
  };
}

export function installCoordinatorGuard(ctx) {
  if (process.env.ATA_AUTONOMOUS_ROUND !== "1" || typeof ctx.on !== "function") return;
  let coordinator;
  ctx.on("agent/created", ({ agent }) => {
    if (coordinator) return;
    coordinator = agent;
    const tools = agent.ctx.get("tools");
    const allowed = new Set(["investment_analysis_workflow", "investment_analysis_status", "investment_status"]);
    tools.guard(exec => {
      // Child analysts retain their research tools. Only the coordinator is
      // denied coding, ad-hoc delegation, trading and alternative workflows.
      if (exec.agent?.id === coordinator.id && !allowed.has(exec.name)) return "后台研究只执行固定工作流；失败后保留检查点并停止，代码维护请在用户对话中处理";
    });
  });
}

export async function saveCheckpoint(client, payload) {
  return saveRunState(client, "/api/analysis/runs/checkpoint", payload);
}

/** Only retry idempotent state writes, not research or submission commands. */
export async function saveRunState(client, path, payload) {
  for (let attempt = 0; ; attempt++) {
    try { return await client.post(path, payload, { timeoutMs: 120000 }); }
    catch (error) {
      // Retry persistence only, never the model stage. Deterministic HTTP
      // validation errors are not retried. The server commit is idempotent.
      const status = error.status ?? Number(String(error.message).match(/HTTP (\d+)/)?.[1]);
      if (attempt >= 2 || (status >= 400 && status < 500)) throw error;
    }
  }
}
