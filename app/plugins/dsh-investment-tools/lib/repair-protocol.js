import {message} from "./copy.js";
/** Product maintenance is a separate, human-reviewed operation. */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync, realpathSync } from "node:fs";
import { resolve, relative, dirname, isAbsolute, join } from "node:path";

const MUTATIONS = new Set(["edit", "write", "pwsh", "bash", "run_code", "job_kill", "subagent", "workflow", "subagent_spawn", "subagent_send", "subagent_fork"]);
const SHELL = new Set(["pwsh", "bash"]);


const digest = value => createHash("sha256").update(value).digest("hex");

function sourcePath(root, name) {
  const path = resolve(root, name);
  const rel = relative(root, path);
  if (!rel || rel.startsWith("..") || isAbsolute(rel) || /^(runtime|notes|\.git|app[\\/]dev-home)([\\/]|$)/i.test(rel)) throw new Error(message("repair.repair.paths.must.stay.within.project.source.and.must.not.target.user.data"));
  let parent = path;
  while (!existsSync(parent)) parent = dirname(parent);
  const actual = relative(root, realpathSync(parent));
  if (actual.startsWith("..") || isAbsolute(actual)) throw new Error(message("repair.the.repair.path.links.outside.the.project"));
  return path;
}

function renderPlan(plan) {
  return message("repair.p0.problem.p1.cause.and.evidence.p2.changes.p3.files.p4.allowed.commands.p5.vali",{p0:(plan.title),p1:(plan.problem),p2:(plan.cause),p3:(plan.changes),p4:(plan.files.map(file => "- " + file).join("\n")),p5:(plan.commands.map(cmd => "- `" + cmd.replaceAll("`", "'") + "`").join("\n")),p6:(plan.validation_commands.map(cmd => "- `" + cmd.replaceAll("`", "'") + "`").join("\n")),p7:(plan.rollback)});
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
    if (!grant || grant.status !== "approved" || Date.now() > grant.expires) return message("repair.read.the.error.and.source.then.call.investment.repair.plan.with.the.full.plan.do");
    if (!["edit", "write", ...SHELL].includes(exec.name)) return message("repair.repairs.may.execute.only.the.approved.file.changes.and.commands.in.this.conversa");
    try {
      if (SHELL.has(exec.name)) {
        const command = String(exec.arguments.command ?? "").trim();
        if (!grant.plan.commands.includes(command)) return message("repair.this.command.is.outside.the.approved.plan.update.the.plan.and.obtain.approval.ag");
        if (exec.arguments.run_in_background) return message("repair.repair.commands.must.finish.in.the.foreground.with.an.exit.code");
        if (!exec.arguments.workdir || !isAbsolute(exec.arguments.workdir) || resolve(exec.arguments.workdir).toLowerCase() !== grant.root.toLowerCase()) return message("repair.repair.commands.must.explicitly.set.workdir.to.the.approved.absolute.project.roo");
      } else {
        const requested = exec.arguments.file_path ?? exec.arguments.path;
        if (typeof requested !== "string" || !isAbsolute(requested)) return message("repair.repair.files.must.use.approved.absolute.paths.rather.than.the.session.working.di");
        const path = sourcePath(grant.root, requested);
        const canonical = value => process.platform === "win32" ? value.toLowerCase() : value;
        if (!grant.snapshots.some(row => canonical(row.path) === canonical(path))) return message("repair.this.file.is.outside.the.approved.plan.update.the.plan.and.obtain.approval.again");
      }
    } catch (error) { return String(error.message); }
    if (++grant.count > 64) { grant.status = "stopped"; record(grant); return message("repair.too.many.repair.operations.stopped.report.results.before.proposing.another.plan"); }
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

  registerTool(ctx, "investment_repair_plan", message("repair.present.a.diagnosed.product.repair.plan.and.wait.for.user.approval.approval.cove"), {
    title:{type:"string",required:true}, problem:{type:"string",required:true}, cause:{type:"string",required:true}, changes:{type:"string",required:true},
    files:{type:"array",required:true,items:{type:"string"}}, commands:{type:"array",required:true,items:{type:"string"}}, validation_commands:{type:"array",required:true,items:{type:"string"}}, rollback:{type:"string",required:true},
  }, async (args, exec) => {
    const APPROVE = message("repair.approve.this.plan");
    const REVISE = message("repair.revise.plan");
    if (process.env.ATA_AUTONOMOUS_ROUND === "1" || !isRoot(exec?.agent)) throw new Error(message("repair.repair.approval.is.available.only.in.the.user.s.desktop.conversation.background."));
    const rootEnv = process.env.AI_TRADING_AUTOMATION_ROOT ?? process.env.INVESTMENT_AUTO_ROOT;
    if (!rootEnv) throw new Error(message("repair.product.source.root.is.missing.repair.scope.cannot.be.determined"));
    const root = realpathSync(rootEnv);
    for (const field of ["title","problem","cause","changes","rollback"]) if (typeof args[field] !== "string" || !args[field].trim() || args[field].length > 12000) throw new Error(message("repair.repair.plan.is.missing.a.valid") + field);
    for (const field of ["files","commands","validation_commands"]) if (!Array.isArray(args[field]) || !args[field].length || args[field].length > 64 || args[field].some(item=>typeof item!=="string" || !item.trim() || item.length>12000)) throw new Error(message("repair.repair.plan.is.missing.a.valid") + field);
    const plan = structuredClone(args);
    plan.commands = plan.commands.map(cmd=>cmd.trim()); plan.validation_commands = plan.validation_commands.map(cmd=>cmd.trim());
    if (plan.validation_commands.some(cmd=>!plan.commands.includes(cmd))) throw new Error(message("repair.validation.commands.must.also.be.listed.among.allowed.commands"));
    const snapshots = [...new Set(plan.files.map(file=>sourcePath(root,file)))].map(path=>{const data=existsSync(path)?readFileSync(path):null;return {path,data,existed:data!==null,hash:data===null?null:digest(data)};});
    const questions = ctx.get?.("userQuestions");
    if (!questions) throw new Error(message("repair.no.user.approval.channel.is.available.repair.remains.stopped"));
    const prior = active(exec.agent);
    if (prior) { prior.status = "superseded"; record(prior); }
    const id = randomUUID();
    const answer = await questions.ask({agent:exec.agent,signal:exec.signal,questions:[{id,header:message("repair.product.repair.approval"),question:message("repair.apply.the.following.repair.plan"),detail:renderPlan(plan)+message("repair.project.root")+root+"`",options:[{label:APPROVE,description:message("repair.execute.only.the.listed.changes.and.commands.then.report.validation.results")},{label:REVISE,description:message("repair.keep.stopped.and.revise.the.plan.first")}],intent:{kind:"plan-review",approve:APPROVE}}]});
    exec.signal?.throwIfAborted();
    const rows = answer.answers.filter(row=>row.id===id);
    if (rows.length!==1 || rows[0].selected?.length!==1 || rows[0].selected[0]!==APPROVE || rows[0].custom!==undefined) return {approved:false,repair_id:id,feedback:rows[0]?.custom??message("repair.user.approval.was.not.given.repair.remains.stopped")};
    for (const row of snapshots) if (row.hash !== (existsSync(row.path)?digest(readFileSync(row.path)):null)) throw new Error(message("repair.source.changed.while.awaiting.approval.diagnose.again.and.request.a.new.approval"));
    const backup = join(root,"runtime","repair-plans",id);
    mkdirSync(backup,{recursive:true});
    for (let i=0;i<snapshots.length;i++) if (snapshots[i].existed) writeFileSync(join(backup,String(i)+".before"),snapshots[i].data);
    const grant = {id,root,backup,plan,snapshots,status:"approved",approvedAt:new Date().toISOString(),expires:Date.now()+30*60*1000,revision:0,count:0,checks:new Set(),validationHashes:new Map(),actions:[]};
    record(grant); grants.set(exec.agent.session,grant);
    return {approved:true,repair_id:id,files:snapshots.map(row=>row.path),workdir:root,commands:plan.commands,validation_commands:plan.validation_commands,backup_dir:backup,hint:message("repair.use.the.absolute.file.paths.and.workdir.above.stay.within.the.approved.scope.and")};
  }, {timeoutMs:900000});

  registerTool(ctx,"investment_repair_finish",message("repair.close.the.repair.grant.and.report.results.success.requires.all.validation.comman"), {
    repair_id:{type:"string",required:true}, success:{type:"boolean",required:true}, summary:{type:"string",required:true},
  }, async (args, exec) => {
    const grant = active(exec?.agent);
    if (!grant || grant.id!==args.repair_id || !isRoot(exec.agent)) throw new Error(message("repair.this.conversation.has.no.matching.repair.grant"));
    if ([...calls.values()].some(call=>call.grant===grant)) throw new Error(message("repair.repair.operations.are.still.running.validation.cannot.be.declared.complete"));
    if (args.success && (grant.status!=="approved" || Date.now()>grant.expires || grant.plan.validation_commands.some(cmd=>!grant.checks.has(cmd) || grant.validationHashes.get(cmd)!==hashes(grant)))) throw new Error(message("repair.not.all.validation.commands.passed.against.the.current.source.repair.success.can"));
    grant.status = args.success?"verified":"failed"; record(grant); grants.delete(exec.agent.session);
    return {repair_id:grant.id,status:grant.status,summary:args.summary,validation_commands:[...grant.checks],backup_dir:grant.backup,hint:message("repair.the.repair.grant.is.closed.report.results.to.the.user.resuming.the.original.anal")};
  });
}
