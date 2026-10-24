import assert from "node:assert/strict";
import test from "node:test";
import { createBuilderChat } from "../src/builder-chat.js";

function harness() {
  const values = new Map(), callbacks = new Map(), sends = [], cancellations = [];
  let runState = { runId:"run-1", status:"running", cancellationRequested:true, termination:"pending", error:null, errorCode:null };
  let runError = null;
  let sendError = null;
  let beforeSendResolve = null;
  const roster = [{ id:"lead", name:"Lead", status:"idle", adapterType:"codex_local", adapterConfig:{ model:"test-model", apiKey:"secret" } }, { id:"worker", name:"Worker", status:"idle" }, { id:"paused", status:"paused" }];
  const state = { async get(key) { return structuredClone(values.get(key.scopeId) ?? null); }, async set(key,value) { values.set(key.scopeId,structuredClone(value)); } };
  const agents = { async list() { return roster; }, sessions:{
    async list(agentId,companyId) { return [{sessionId:`${companyId}:${agentId}`}]; },
    async create(agentId,companyId) { return { sessionId:`${companyId}:${agentId}` }; },
    async sendMessage(sessionId,companyId,input) { sends.push(input.prompt); callbacks.set(sessionId,input.onEvent); beforeSendResolve?.(input,sessionId); if (sendError) throw sendError; return { runId:"run-1" }; },
    async cancel(sessionId,companyId,runId) { cancellations.push({sessionId,companyId,runId}); return { ...runState, runId }; },
    async getRun(_sessionId,_companyId,runId) { if (runError) throw runError; return { ...runState, runId }; },
  } };
  const logger = { warn() {}, error() {} };
  return { service:createBuilderChat({state,agents,logger}), callbacks, sends, cancellations, state, agents,
    setRunState(value) { runState={...runState,...value}; }, setRunError(value) { runError=value; }, setSendError(value) { sendError=value; },
    setBeforeSendResolve(value) { beforeSendResolve=value; } };
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
  await service.recordEvent("a",chat.id,(await service.view("a")).conversations[0].messages[1].id,{runId:"run-1",eventType:"done",payload:{resultJson:{summary:"Reply"}}});
  const messages=(await service.view("a")).conversations[0].messages;
  assert.equal(messages[1].content,"Reply"); assert.equal(messages[1].status,"completed");
  assert.ok(callbacks.has("a:lead"));
});
test("Lead and Worker prompts share the UI authoring contract without losing user input", async () => {
  const {service,sends}=harness();const chat=await service.create("a",{leadId:"lead",workerIds:["worker"]});
  const userContent="Keep this user requirement exactly: render the status panel.";
  await service.send("a",{conversationId:chat.id,message:userContent});
  const workerObjective="Implement the requested status panel and report its named component.";
  await service.delegate("a",{conversationId:chat.id,workerId:"worker",objective:workerObjective},{agentId:"lead"});
  const requiredContractText=[
    /Import React APIs from `react`/,
    /host resolves external React, JSX runtime, and SDK bridge dependencies/,
    /Do not assume `globalThis\.React` or `window\.React` exists/,
    /named component declared by the plugin manifest/,
    /Do not use Node-only APIs in browser UI code/,
  ];
  for (const prompt of sends) {
    for (const requirement of requiredContractText) assert.match(prompt,requirement);
  }
  assert.ok(sends[0].includes(userContent));
  assert.ok(sends[1].includes(workerObjective));
});
test("Builder rejects unsafe attachments before dispatch",async()=>{
  const {service,sends}=harness();const chat=await service.create("a",{leadId:"lead"});
  for(const file of [{name:"../secret",content:"x"},{name:"notes",content:"x".repeat(65537)}]){
    await assert.rejects(()=>service.send("a",{conversationId:chat.id,message:"x",attachments:[file]}));
  } assert.equal(sends.length,0);
});
test("Lead send rejection after dispatch remains unresolved and blocks retry",async()=>{
  const {service,sends,setSendError}=harness();const chat=await service.create("a",{leadId:"lead"});
  setSendError(new Error("transport disconnected"));
  await assert.rejects(()=>service.send("a",{conversationId:chat.id,message:"hello"}),/transport disconnected/);
  const message=(await service.view("a")).conversations[0].messages[1];
  assert.equal(message.status,"interrupted");assert.equal(message.recoveryPending,true);
  await assert.rejects(()=>service.send("a",{conversationId:chat.id,message:"unsafe retry"}),/active or unresolved/);
  assert.equal(sends.length,1);
});
test("Only the selected Lead can assign selected Workers and read reports",async()=>{
  const {service}=harness();const chat=await service.create("a",{leadId:"lead",workerIds:["worker"]});
  await assert.rejects(()=>service.delegate("a",{conversationId:chat.id,workerId:"worker",objective:"Test"},{agentId:"worker"}),/Only/);
  const assignment=await service.delegate("a",{conversationId:chat.id,workerId:"worker",objective:"Test"},{agentId:"lead"});
  assert.equal((await service.report("a",{conversationId:chat.id,reportId:assignment.reportId},{agentId:"lead"})).status,"running");
  await assert.rejects(()=>service.report("b",{conversationId:chat.id,reportId:assignment.reportId},{agentId:"lead"}),/not found/);
});
test("Worker send rejection after dispatch remains unresolved and blocks reassignment",async()=>{
  const {service,sends,setSendError}=harness();const chat=await service.create("a",{leadId:"lead",workerIds:["worker"]});
  setSendError(new Error("transport disconnected"));
  await assert.rejects(()=>service.delegate("a",{conversationId:chat.id,workerId:"worker",objective:"Review"},{agentId:"lead"}),/transport disconnected/);
  const report=(await service.report("a",{conversationId:chat.id,reportId:(await service.view("a")).conversations[0].reports[0].id},{agentId:"lead"}));
  assert.equal(report.status,"interrupted");assert.equal(report.recoveryPending,true);
  await assert.rejects(()=>service.delegate("a",{conversationId:chat.id,workerId:"worker",objective:"Unsafe duplicate"},{agentId:"lead"}),/active or unresolved/);
  assert.equal(sends.length,1);
});
test("Builder restart keeps the identified Lead run pending until Core confirms terminal state",async()=>{
  const {service,state,agents,sends,setRunState}=harness();const chat=await service.create("a",{leadId:"lead"});
  await service.send("a",{conversationId:chat.id,message:"hello"});
  // A second service has no in-memory event callbacks, just like a restarted worker.
  setRunState({status:"running",cancellationRequested:false,termination:"not_applicable"});
  const restarted=createBuilderChat({state,agents,logger:{warn(){},error(){}}});
  let message=(await restarted.view("a")).conversations[0].messages[1];
  assert.equal(message.status,"running");assert.equal(message.recoveryPending,true);
  await assert.rejects(()=>restarted.send("a",{conversationId:chat.id,message:"do not overlap"}),/active or unresolved/);
  setRunState({status:"succeeded",cancellationRequested:false,termination:"not_applicable"});
  message=(await restarted.view("a")).conversations[0].messages[1];
  assert.equal(message.status,"completed");assert.equal(message.recoveryPending,false);
  assert.match(message.content,/could not be restored/);
  await restarted.send("a",{conversationId:chat.id,message:"safe after terminal"});
  assert.equal(sends.length,2);
});

test("Lead recovery lookup errors keep retry blocked",async()=>{
  const {service,state,agents,setRunError}=harness();const chat=await service.create("a",{leadId:"lead"});
  await service.send("a",{conversationId:chat.id,message:"hello"});
  setRunError(new Error("Core read unavailable"));
  const restarted=createBuilderChat({state,agents,logger:{warn(){},error(){}}});
  await assert.rejects(()=>restarted.send("a",{conversationId:chat.id,message:"unsafe retry"}),/active or unresolved/);
  const message=(await restarted.view("a")).conversations[0].messages[1];
  assert.equal(message.status,"running");assert.equal(message.recoveryPending,true);
});

test("Worker restart persists run identity and blocks duplicate assignment until terminal",async()=>{
  const {service,state,agents,setRunState}=harness();const chat=await service.create("a",{leadId:"lead",workerIds:["worker"]});
  const assignment=await service.delegate("a",{conversationId:chat.id,workerId:"worker",objective:"Review"},{agentId:"lead"});
  const beforeRestart=(await service.report("a",{conversationId:chat.id,reportId:assignment.reportId},{agentId:"lead"}));
  assert.equal(beforeRestart.sessionId,"a:worker");assert.equal(beforeRestart.runId,"run-1");
  setRunState({status:"running",cancellationRequested:false,termination:"not_applicable"});
  const restarted=createBuilderChat({state,agents,logger:{warn(){},error(){}}});
  let recovered=await restarted.report("a",{conversationId:chat.id,reportId:assignment.reportId},{agentId:"lead"});
  assert.equal(recovered.status,"running");assert.equal(recovered.recoveryPending,true);
  await assert.rejects(()=>restarted.delegate("a",{conversationId:chat.id,workerId:"worker",objective:"Duplicate"},{agentId:"lead"}),/active or unresolved/);
  setRunState({status:"succeeded",cancellationRequested:false,termination:"not_applicable"});
  recovered=await restarted.report("a",{conversationId:chat.id,reportId:assignment.reportId},{agentId:"lead"});
  assert.equal(recovered.status,"completed");assert.equal(recovered.recoveryPending,false);
  await restarted.delegate("a",{conversationId:chat.id,workerId:"worker",objective:"Next assignment"},{agentId:"lead"});
});

test("legacy Worker report without run identity remains unresolved and blocks duplicate",async()=>{
  const {service,state,agents,sends}=harness();const chat=await service.create("a",{leadId:"lead",workerIds:["worker"]});
  const assignment=await service.delegate("a",{conversationId:chat.id,workerId:"worker",objective:"Review"},{agentId:"lead"});
  const conversations=await state.get({scopeId:"a"});
  const legacyReport=conversations[0].reports.find(item=>item.id===assignment.reportId);
  delete legacyReport.sessionId;delete legacyReport.runId;
  await state.set({scopeId:"a"},conversations);
  const restarted=createBuilderChat({state,agents,logger:{warn(){},error(){}}});
  const recovered=await restarted.report("a",{conversationId:chat.id,reportId:assignment.reportId},{agentId:"lead"});
  assert.equal(recovered.status,"interrupted");assert.equal(recovered.recoveryPending,true);
  assert.match(recovered.content,/without a saved Worker run identity/);
  await assert.rejects(()=>restarted.delegate("a",{conversationId:chat.id,workerId:"worker",objective:"Unsafe duplicate"},{agentId:"lead"}),/active or unresolved/);
  assert.equal(sends.length,1);
});

test("done event carrying Core failure is failed and a late success cannot resurrect it",async()=>{
  const {service}=harness();const chat=await service.create("a",{leadId:"lead"});
  await service.send("a",{conversationId:chat.id,message:"hello"});
  const message=(await service.view("a")).conversations[0].messages[1];
  await service.recordEvent("a",chat.id,message.id,{runId:message.runId,eventType:"done",payload:{status:"failed",error:"adapter failed"}});
  await service.recordEvent("a",chat.id,message.id,{runId:message.runId,eventType:"done",payload:{status:"succeeded",resultJson:{summary:"late"}}});
  const settled=(await service.view("a")).conversations[0].messages[1];
  assert.equal(settled.status,"failed");assert.equal(settled.content,"adapter failed");
});

test("Lead terminal event arriving before sendMessage returns is applied after run identity binds",async()=>{
  const {service,setBeforeSendResolve}=harness();const chat=await service.create("a",{leadId:"lead"});
  setBeforeSendResolve(input=>input.onEvent({runId:"run-1",eventType:"done",message:"Run completed",payload:{status:"succeeded",resultJson:{summary:"Fast result"}}}));
  await service.send("a",{conversationId:chat.id,message:"fast"});
  const message=(await service.view("a")).conversations[0].messages[1];
  assert.equal(message.status,"completed");assert.equal(message.content,"Fast result");
});

test("Worker cancellation event stays unresolved until Core confirms termination",async()=>{
  const {service,callbacks,setRunState}=harness();const chat=await service.create("a",{leadId:"lead",workerIds:["worker"]});
  const assignment=await service.delegate("a",{conversationId:chat.id,workerId:"worker",objective:"Review"},{agentId:"lead"});
  callbacks.get("a:worker")({runId:"run-1",eventType:"error",message:"Run cancelled",payload:{status:"cancelled"}});
  let report=await service.report("a",{conversationId:chat.id,reportId:assignment.reportId},{agentId:"lead"});
  assert.equal(report.status,"running");assert.equal(report.recoveryPending,true);
  await assert.rejects(()=>service.delegate("a",{conversationId:chat.id,workerId:"worker",objective:"Do not overlap"},{agentId:"lead"}),/active or unresolved/);
  setRunState({status:"cancelled",cancellationRequested:false,termination:"confirmed"});
  report=await service.report("a",{conversationId:chat.id,reportId:assignment.reportId},{agentId:"lead"});
  assert.equal(report.status,"interrupted");assert.equal(report.recoveryPending,false);
  await service.delegate("a",{conversationId:chat.id,workerId:"worker",objective:"After confirmed stop"},{agentId:"lead"});
});

test("Lead stop is exact-run scoped, stays pending until termination and does not stop Workers", async()=>{
  const {service,cancellations,setRunState}=harness();
  const chat=await service.create("a",{leadId:"lead",workerIds:["worker"]});
  await service.send("a",{conversationId:chat.id,message:"hello"});
  const message=(await service.view("a")).conversations[0].messages[1];
  const input={conversationId:chat.id,messageId:message.id,runId:message.runId};
  await assert.rejects(()=>service.stop("b",input),/not found/);
  await assert.rejects(()=>service.stop("a",{...input,runId:"other"}),/exact Lead run/);
  assert.equal(cancellations.length,0);
  await service.stop("a",input);
  assert.deepEqual(cancellations,[{sessionId:"a:lead",companyId:"a",runId:"run-1"}]);
  assert.equal((await service.view("a")).conversations[0].messages[1].status,"cancelling");
  await assert.rejects(()=>service.send("a",{conversationId:chat.id,message:"next"}),/active or unresolved/);
  await service.recordEvent("a",chat.id,message.id,{runId:message.runId,eventType:"error",payload:{status:"cancelled"}});
  await service.recordEvent("a",chat.id,message.id,{runId:message.runId,eventType:"error",payload:{status:"failed"}});
  assert.equal((await service.view("a")).conversations[0].messages[1].status,"cancelling");
  setRunState({status:"cancelled",termination:"confirmed"});
  assert.equal((await service.view("a")).conversations[0].messages[1].status,"cancelled");
  await service.stop("a",input); assert.equal(cancellations.length,1);
  await service.recordEvent("a",chat.id,message.id,{runId:message.runId,eventType:"done",payload:{resultJson:{summary:"late"}}});
  assert.equal((await service.view("a")).conversations[0].messages[1].status,"cancelled");
});

test("a completed response wins a late stop without becoming cancelled", async()=>{
  const {service,setRunState}=harness();const chat=await service.create("a",{leadId:"lead"});
  await service.send("a",{conversationId:chat.id,message:"hello"});
  const message=(await service.view("a")).conversations[0].messages[1];
  setRunState({status:"succeeded",cancellationRequested:false,termination:"not_applicable"});
  await service.stop("a",{conversationId:chat.id,messageId:message.id,runId:message.runId});
  assert.equal((await service.view("a")).conversations[0].messages[1].status,"completed");
});
