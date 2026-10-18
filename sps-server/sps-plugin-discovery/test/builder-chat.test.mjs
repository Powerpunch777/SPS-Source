import assert from "node:assert/strict";
import test from "node:test";
import { createBuilderChat } from "../src/builder-chat.js";

function harness() {
  const values = new Map(), callbacks = new Map(), sends = [];
  const roster = [{ id:"lead", name:"Lead", status:"idle", adapterType:"codex_local", adapterConfig:{ model:"test-model", apiKey:"secret" } }, { id:"worker", name:"Worker", status:"idle" }, { id:"paused", status:"paused" }];
  const state = { async get(key) { return structuredClone(values.get(key.scopeId) ?? null); }, async set(key,value) { values.set(key.scopeId,structuredClone(value)); } };
  const agents = { async list() { return roster; }, sessions:{
    async list(agentId,companyId) { return [{sessionId:`${companyId}:${agentId}`}]; },
    async create(agentId,companyId) { return { sessionId:`${companyId}:${agentId}` }; },
    async sendMessage(sessionId,companyId,input) { sends.push(input.prompt); callbacks.set(sessionId,input.onEvent); return { runId:"run-1" }; },
  } };
  return { service:createBuilderChat({state,agents}), callbacks, sends };
}
test("Builder keeps conversations Workspace-scoped and hides Agent secrets", async () => {
  const {service}=harness();
  const chat=await service.create("a",{leadId:"lead"});
  assert.equal((await service.view("a")).conversations[0].id,chat.id);
  assert.equal((await service.view("b")).conversations.length,0);
  assert.equal(JSON.stringify(await service.view("a")).includes("secret"),false);
  await assert.rejects(()=>service.create("a",{leadId:"paused"}),/available Lead/);
  await assert.rejects(()=>service.create("a",{leadId:"lead",workerIds:["lead"]}),/Workers must/);
});
test("Builder sends once, preserves attachments and terminal replies", async () => {
  const {service,callbacks,sends}=harness();
  const chat=await service.create("a",{leadId:"lead"});
  await service.send("a",{conversationId:chat.id,message:"Hello",attachments:[{name:"notes.md",content:"sample"}]});
  await assert.rejects(()=>service.send("a",{conversationId:chat.id,message:"duplicate"}),/already replying/);
  await assert.rejects(()=>service.send("b",{conversationId:chat.id,message:"cross tenant"}),/not found/);
  assert.match(sends[0],/notes.md\nsample/);
  await service.recordEvent("a",chat.id,(await service.view("a")).conversations[0].messages[1].id,{eventType:"done",payload:{resultJson:{summary:"Reply"}}});
  const messages=(await service.view("a")).conversations[0].messages;
  assert.equal(messages[1].content,"Reply"); assert.equal(messages[1].status,"completed");
  assert.ok(callbacks.has("a:lead"));
});
test("Builder rejects unsafe attachments before dispatch",async()=>{
  const {service,sends}=harness();const chat=await service.create("a",{leadId:"lead"});
  for(const file of [{name:"../secret",content:"x"},{name:"notes",content:"x".repeat(65537)}]){
    await assert.rejects(()=>service.send("a",{conversationId:chat.id,message:"x",attachments:[file]}));
  } assert.equal(sends.length,0);
});
test("Only the selected Lead can assign selected Workers and read reports",async()=>{
  const {service}=harness();const chat=await service.create("a",{leadId:"lead",workerIds:["worker"]});
  await assert.rejects(()=>service.delegate("a",{conversationId:chat.id,workerId:"worker",objective:"Test"},{agentId:"worker"}),/Only/);
  const assignment=await service.delegate("a",{conversationId:chat.id,workerId:"worker",objective:"Test"},{agentId:"lead"});
  assert.equal((await service.report("a",{conversationId:chat.id,reportId:assignment.reportId},{agentId:"lead"})).status,"running");
  await assert.rejects(()=>service.report("b",{conversationId:chat.id,reportId:assignment.reportId},{agentId:"lead"}),/not found/);
});
test("Worker restart marks an in-flight transcript interrupted without rerunning",async()=>{
  const {service}=harness();const chat=await service.create("a",{leadId:"lead"});
  await service.send("a",{conversationId:chat.id,message:"hello"});
  // A second service has no in-memory event callbacks, just like a restarted worker.
  const saved=(await service.view("a")).conversations;
  const state={async get(){return structuredClone(saved);},async set(_key,value){saved.splice(0,saved.length,...value);}};
  const restarted=createBuilderChat({state,agents:{async list(){return [];}}});
  await restarted.reconcile("a");assert.equal(saved[0].messages[1].status,"interrupted");
});
