/** Product maintenance is a separate, human-reviewed operation. */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync, realpathSync } from "node:fs";
import { resolve, relative, dirname, isAbsolute, join } from "node:path";

const MUTATIONS = new Set(["edit", "write", "pwsh", "bash", "run_code", "job_kill", "subagent", "workflow", "subagent_spawn", "subagent_send", "subagent_fork"]);
const SHELL = new Set(["pwsh", "bash"]);
const APPROVE = "确认此方案";
const REVISE = "修改方案";
const digest = value => createHash("sha256").update(value).digest("hex");

function sourcePath(root, name) {
  const path = resolve(root, name);
  const rel = relative(root, path);
  if (!rel || rel.startsWith("..") || isAbsolute(rel) || /^(runtime|notes|\.git|app[\\/]dev-home)([\\/]|$)/i.test(rel)) throw new Error("修复路径必须是项目源码，不能指向用户数据或目录之外");
  let parent = path;
  while (!existsSync(parent)) parent = dirname(parent);
  const actual = relative(root, realpathSync(parent));
  if (actual.startsWith("..") || isAbsolute(actual)) throw new Error("修复路径的链接指向项目之外");
  return path;
}

function renderPlan(plan) {
  return `# ${plan.title}\n\n问题：${plan.problem}\n\n原因与依据：${plan.cause}\n\n修改方案：${plan.changes}\n\n修改文件：\n${plan.files.map(file => "- " + file).join("\n")}\n\n允许执行的命令：\n${plan.commands.map(cmd => "- `" + cmd.replaceAll("`", "'") + "`").join("\n")}\n\n验证：\n${plan.validation_commands.map(cmd => "- `" + cmd.replaceAll("`", "'") + "`").join("\n")}\n\n回退：${plan.rollback}\n\n确认仅授权上述修复，完成后报告验证结果；原分析不会自动重跑。`;
}

export function installRepairProtocol(ctx, registerTool) {
  const grants = new WeakMap();
  const calls = new Map();
  const isRoot = agent => agent && ctx.agents?.roots().includes(agent);
  const active = agent => grants.get(agent?.session);
  const hashes = grant => JSON.stringify(grant.snapshots.map(row=>existsSync(row.path)?digest(readFileSync(row.path)):null));
  const record = grant => writeFileSync(join(grant.backup, "plan.json"), JSON.stringify({id:grant.id,plan:grant.plan,status:grant.status,approved_at:grant.approvedAt,files:grant.snapshots.map(row=>({path:row.path,existed:row.existed,before_sha256:row.hash})),checks:[...grant.checks],actions:grant.actions}, null, 2));

  ctx.tools.guard?.(exec => {
    if (!MUTATIONS.has(exec.name)) return;
    if (process.env.ATA_AUTONOMOUS_ROUND === "1") return; // Separate background coordinator guard applies.
    if (exec.agent && !isRoot(exec.agent)) return; // Fixed research children retain their tools.
    const grant = active(exec.agent);
    if (!grant || grant.status !== "approved" || Date.now() > grant.expires) return "先读取错误和源码，调用 investment_repair_plan 展示完整修复方案；用户确认前禁止改文件、执行 shell 或委派修复";
    if (!["edit", "write", ...SHELL].includes(exec.name)) return "修复仅允许当前对话执行已确认的文件修改和命令，不能委派或启动替代工作流";
    try {
      if (SHELL.has(exec.name)) {
        const command = String(exec.arguments.command ?? "").trim();
        if (!grant.plan.commands.includes(command)) return "命令不在已确认方案内，请更新方案并重新确认";
        if (exec.arguments.run_in_background) return "修复命令必须在前台完成并取得退出码";
        if (!exec.arguments.workdir || !isAbsolute(exec.arguments.workdir) || resolve(exec.arguments.workdir).toLowerCase() !== grant.root.toLowerCase()) return "修复命令必须用绝对路径明确指定已确认的项目根目录作为 workdir";
      } else {
        const requested = exec.arguments.file_path ?? exec.arguments.path;
        if (typeof requested !== "string" || !isAbsolute(requested)) return "修复文件必须使用已确认源码的绝对路径，不能依赖会话工作目录";
        const path = sourcePath(grant.root, requested);
        const canonical = value => process.platform === "win32" ? value.toLowerCase() : value;
        if (!grant.snapshots.some(row => canonical(row.path) === canonical(path))) return "文件不在已确认方案内，请更新方案并重新确认";
      }
    } catch (error) { return String(error.message); }
    if (++grant.count > 64) { grant.status = "stopped"; record(grant); return "本次修复操作过多，已停止，请报告结果后重新提出方案"; }
    const validation = SHELL.has(exec.name) && grant.plan.validation_commands.includes(String(exec.arguments.command).trim());
    if (!validation) { grant.revision++; grant.checks.clear(); grant.validationHashes.clear(); }
    calls.set(exec.callId, {grant,revision:grant.revision,validation,name:exec.name,command:SHELL.has(exec.name)?String(exec.arguments.command).trim():null});
  });
  ctx.on?.("tools/result", (exec, result) => {
    const call = calls.get(exec.callId);
    if (!call) return;
    calls.delete(exec.callId);
    const {grant} = call;
    const success = !result.isError && (!SHELL.has(call.name) || (result.value?.exitCode === 0 && !result.value?.timedOut && !result.value?.aborted));
    grant.actions.push({tool:call.name,command:call.command,success});
    if (!success) { grant.status = "failed"; grant.checks.clear(); }
    else if (call.validation && call.revision === grant.revision) { grant.checks.add(call.command); grant.validationHashes.set(call.command,hashes(grant)); }
    record(grant);
  });

  registerTool(ctx, "investment_repair_plan", "展示产品修复方案并等待用户确认。必须先诊断；确认前不修改源码。确认只授权列明的文件和命令，失败后停止，不自动重跑原分析。", {
    title:{type:"string",required:true}, problem:{type:"string",required:true}, cause:{type:"string",required:true}, changes:{type:"string",required:true},
    files:{type:"array",required:true,items:{type:"string"}}, commands:{type:"array",required:true,items:{type:"string"}}, validation_commands:{type:"array",required:true,items:{type:"string"}}, rollback:{type:"string",required:true},
  }, async (args, exec) => {
    if (process.env.ATA_AUTONOMOUS_ROUND === "1" || !isRoot(exec?.agent)) throw new Error("修复确认只能在用户桌面对话中进行，后台只报告错误并停止");
    const rootEnv = process.env.AI_TRADING_AUTOMATION_ROOT ?? process.env.INVESTMENT_AUTO_ROOT;
    if (!rootEnv) throw new Error("缺少产品源码根目录，不能确定修复范围");
    const root = realpathSync(rootEnv);
    for (const field of ["title","problem","cause","changes","rollback"]) if (typeof args[field] !== "string" || !args[field].trim() || args[field].length > 12000) throw new Error("修复方案缺少有效的 " + field);
    for (const field of ["files","commands","validation_commands"]) if (!Array.isArray(args[field]) || !args[field].length || args[field].length > 64 || args[field].some(item=>typeof item!=="string" || !item.trim() || item.length>12000)) throw new Error("修复方案缺少有效的 " + field);
    const plan = structuredClone(args);
    plan.commands = plan.commands.map(cmd=>cmd.trim()); plan.validation_commands = plan.validation_commands.map(cmd=>cmd.trim());
    if (plan.validation_commands.some(cmd=>!plan.commands.includes(cmd))) throw new Error("验证命令必须列在允许执行的命令内");
    const snapshots = [...new Set(plan.files.map(file=>sourcePath(root,file)))].map(path=>{const data=existsSync(path)?readFileSync(path):null;return {path,data,existed:data!==null,hash:data===null?null:digest(data)};});
    const questions = ctx.get?.("userQuestions");
    if (!questions) throw new Error("当前对话没有用户确认通道，修复保持停止");
    const prior = active(exec.agent);
    if (prior) { prior.status = "superseded"; record(prior); }
    const id = randomUUID();
    const answer = await questions.ask({agent:exec.agent,signal:exec.signal,questions:[{id,header:"产品修复确认",question:"按下列方案修复？",detail:renderPlan(plan)+"\n\n项目根目录：`"+root+"`",options:[{label:APPROVE,description:"只执行列明的修改和命令，完成后报告验证结果。"},{label:REVISE,description:"保持停止，先修改方案。"}],intent:{kind:"plan-review",approve:APPROVE}}]});
    exec.signal?.throwIfAborted();
    const rows = answer.answers.filter(row=>row.id===id);
    if (rows.length!==1 || rows[0].selected?.length!==1 || rows[0].selected[0]!==APPROVE || rows[0].custom!==undefined) return {approved:false,repair_id:id,feedback:rows[0]?.custom??"用户未确认，修复保持停止"};
    for (const row of snapshots) if (row.hash !== (existsSync(row.path)?digest(readFileSync(row.path)):null)) throw new Error("方案确认期间源码已变化，请重新诊断并确认");
    const backup = join(root,"runtime","repair-plans",id);
    mkdirSync(backup,{recursive:true});
    for (let i=0;i<snapshots.length;i++) if (snapshots[i].existed) writeFileSync(join(backup,String(i)+".before"),snapshots[i].data);
    const grant = {id,root,backup,plan,snapshots,status:"approved",approvedAt:new Date().toISOString(),expires:Date.now()+30*60*1000,revision:0,count:0,checks:new Set(),validationHashes:new Map(),actions:[]};
    record(grant); grants.set(exec.agent.session,grant);
    return {approved:true,repair_id:id,files:snapshots.map(row=>row.path),workdir:root,commands:plan.commands,validation_commands:plan.validation_commands,backup_dir:backup,hint:"文件和 workdir 使用上述绝对路径；仅执行确认范围，验证失败立即停止。完成后调用 investment_repair_finish，不自动重跑原分析。"};
  }, {timeoutMs:900000});

  registerTool(ctx,"investment_repair_finish","关闭本次修复并报告结果。成功必须有实际执行通过的全部验证命令；失败立即关闭授权并报告，不能继续自动修复或重跑分析。", {
    repair_id:{type:"string",required:true}, success:{type:"boolean",required:true}, summary:{type:"string",required:true},
  }, async (args, exec) => {
    const grant = active(exec?.agent);
    if (!grant || grant.id!==args.repair_id || !isRoot(exec.agent)) throw new Error("当前对话没有对应的修复授权");
    if ([...calls.values()].some(call=>call.grant===grant)) throw new Error("修复操作尚未结束，不能宣布验证完成");
    if (args.success && (grant.status!=="approved" || Date.now()>grant.expires || grant.plan.validation_commands.some(cmd=>!grant.checks.has(cmd) || grant.validationHashes.get(cmd)!==hashes(grant)))) throw new Error("没有取得当前源码下全部验证命令的成功退出码，不能宣布修复成功");
    grant.status = args.success?"verified":"failed"; record(grant); grants.delete(exec.agent.session);
    return {repair_id:grant.id,status:grant.status,summary:args.summary,validation_commands:[...grant.checks],backup_dir:grant.backup,hint:"修复授权已关闭。请向用户报告结果；原分析续跑仍需用户明确要求。"};
  });
}
