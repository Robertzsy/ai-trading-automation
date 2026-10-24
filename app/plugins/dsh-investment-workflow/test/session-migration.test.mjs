import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Context } from "@deepseek-ai/cordis";
import * as Persistence from "@deepseek-ai/dsh-session-persistence-jsonl";

test("V0 history reads without mutation, publishes successor on write, and survives restart", async () => {
  const root = await mkdtemp(join(tmpdir(), "ata-session-upgrade-"));
  const directory = join(root, "_no-cwd", "legacy-round");
  await mkdir(directory, {recursive:true});
  const path = join(directory, "session.jsonl");
  const events = [{type:"session/title",seq:0,time:1000,data:{title:"Historical research",messageSeqs:[],source:{kind:"user"}}}];
  const source = [JSON.stringify({type:"session",version:0,id:"legacy-round",createdAt:1000,delegationDepth:0}), ...events.map(row=>JSON.stringify(row))].join("\n")+"\n";
  await writeFile(path, source);
  let ctx = new Context();
  try {
    await ctx.plugin(Persistence, {root,compression:"none"});
    assert.equal((await ctx.sessionPersistence.stat("legacy-round")).formatStatus,"migration-required");
    const reader = await ctx.sessionPersistence.open("legacy-round","read");
    assert.equal((await reader.read()).events[0].data.title,"Historical research");
    await reader.close();
    assert.deepEqual(await readdir(directory),["session.jsonl"]);
    assert.equal(await readFile(path,"utf8"),source);
    const writer = await ctx.sessionPersistence.open("legacy-round","write");
    await writer.append([{type:"session/title",seq:1,time:2000,data:{title:"Continued research",messageSeqs:[],source:{kind:"user"}}}]);
    await writer.close();
    assert.equal(await readFile(path,"utf8"),source);
    assert.equal((await ctx.sessionPersistence.stat("legacy-round")).formatStatus,"current");
    assert.equal((await readdir(directory)).some(name=>/^session\.v\d+\.jsonl$/.test(name)),true);
    await ctx.fiber.dispose(); ctx=new Context();
    await ctx.plugin(Persistence,{root,compression:"none"});
    const resumed = await ctx.sessionPersistence.open("legacy-round","read");
    assert.equal((await resumed.read()).events.at(-1).data.title,"Continued research");
    await resumed.close();
  } finally { await ctx.fiber.dispose(); await rm(root,{recursive:true,force:true}); }
});
