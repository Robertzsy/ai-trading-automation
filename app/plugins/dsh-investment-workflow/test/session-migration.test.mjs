import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Context } from "@deepseek-ai/cordis";
import * as Persistence from "@deepseek-ai/dsh-session-persistence-jsonl";
import {zstdCompressSync} from "node:zlib";

for (const compression of ["none", "zstd"]) test(`V0 ${compression} history reads without mutation, publishes successor on write, and survives restart`, async () => {
  const root = await mkdtemp(join(tmpdir(), "ata-session-upgrade-"));
  const directory = join(root, "_no-cwd", "legacy-round");
  await mkdir(directory, {recursive:true});
  const path = join(directory, "session.jsonl" + (compression === "zstd" ? ".zstd" : ""));
  const events = [
    {type:"turn/start",seq:0,time:1000,data:{turn:1}},
    {type:"step/start",seq:1,time:1000,data:{turn:1,step:1}},
    {type:"user/message",seq:2,time:1000,surfaceOp:"append",data:{role:"user",id:"old-message",content:[{type:"text",text:"Synthetic historical question"}],source:{kind:"user"}}},
    {type:"session/title",seq:3,time:1000,data:{title:"Historical research",messageSeqs:[],source:{kind:"user"}}}
  ];
  const source = [JSON.stringify({type:"session",version:0,id:"legacy-round",createdAt:1000,delegationDepth:0}), ...events.map(row=>JSON.stringify(row))].join("\n")+"\n";
  // The production Zstandard format stores the header in its own frame.
  const bytes = compression === "zstd" ? Buffer.concat(source.trimEnd().split("\n").map(line=>zstdCompressSync(Buffer.from(line+"\n")))) : Buffer.from(source);
  await writeFile(path, bytes);
  let ctx = new Context();
  try {
    await ctx.plugin(Persistence, {root,compression});
    assert.equal((await ctx.sessionPersistence.list()).length,1);
    assert.equal((await ctx.sessionPersistence.stat("legacy-round")).formatStatus,"migration-required");
    const reader = await ctx.sessionPersistence.open("legacy-round","read");
    const loaded=await reader.read();
    assert.equal(loaded.events.find(event=>event.type==="session/title").data.title,"Historical research");
    assert.equal(loaded.events.find(event=>event.type==="user/message").data.content[0].text,"Synthetic historical question");
    await reader.close();
    assert.deepEqual(await readdir(directory),[path.split(/[\\/]/).at(-1)]);
    assert.deepEqual(await readFile(path),bytes);
    const writer = await ctx.sessionPersistence.open("legacy-round","write");
    await writer.append([{type:"session/title",seq:loaded.events.length,time:2000,data:{title:"Continued research",messageSeqs:[],source:{kind:"user"}}}]);
    await writer.close();
    assert.deepEqual(await readFile(path),bytes);
    assert.equal((await ctx.sessionPersistence.stat("legacy-round")).formatStatus,"current");
    assert.equal((await readdir(directory)).some(name=>/^session\.v\d+\.jsonl(?:\.zstd)?$/.test(name)),true);
    await ctx.fiber.dispose(); ctx=new Context();
    await ctx.plugin(Persistence,{root,compression});
    const resumed = await ctx.sessionPersistence.open("legacy-round","read");
    assert.equal((await resumed.read()).events.at(-1).data.title,"Continued research");
    await resumed.close();
  } finally { await ctx.fiber.dispose(); await rm(root,{recursive:true,force:true}); }
});
