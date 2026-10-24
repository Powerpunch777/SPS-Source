import { useEffect, useRef, useState } from "react";
import { useHostNavigation, usePluginAction, usePluginData } from "@sonparkserver/plugin-sdk/ui/bridge";
import { builderStyles } from "./builder-styles.js";

export function PluginBuilderPage({ context }) {
  const { data, loading, error, refresh } = usePluginData("plugin-builder-workspace", { companyId: context.companyId });
  const create = usePluginAction("builder-create"), send = usePluginAction("builder-send"), saveTeam = usePluginAction("builder-team");
  const stop = usePluginAction("builder-stop");
  const navigation = useHostNavigation();
  const [selectedId, setSelectedId] = useState(null), [leadId, setLeadId] = useState("");
  const [workers, setWorkers] = useState([]), [draft, setDraft] = useState(""), [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(""), [panel, setPanel] = useState(false), [panelWidth, setPanelWidth] = useState(300);
  const end = useRef(null), fileInput = useRef(null), resizeCleanup = useRef(null);
  const agents = data?.agents ?? [], conversations = data?.conversations ?? [];
  const conversation = conversations.find(item => item.id === selectedId);
  const selectedLeadId = conversation?.leadId || leadId || agents[0]?.id || "";
  const selectedWorkers = conversation?.workerIds ?? workers, lead = agents.find(agent => agent.id === selectedLeadId);
  const messages = conversation?.messages ?? [], activeMessage = messages.find(message => ["running", "cancelling"].includes(message.status) || message.recoveryPending);
  const running = Boolean(activeMessage), cancelling = activeMessage?.status === "cancelling";
  const sessions = data?.authoringSessions ?? [];
  useEffect(() => { const timer = setInterval(refresh, running ? 1500 : 10000); return () => clearInterval(timer); }, [refresh, running]);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [selectedId, messages.length, messages.at(-1)?.status]);
  useEffect(() => () => resizeCleanup.current?.(), []);
  function fresh() { setSelectedId(null); setDraft(""); setFiles([]); setNotice(""); }
  async function submit(event) {
    event.preventDefault();
    if (busy || running || !selectedLeadId || (!draft.trim() && !files.length)) return;
    setBusy(true); setNotice("");
    try {
      const current = conversation ?? await create({ leadId: selectedLeadId, workerIds: selectedWorkers });
      setSelectedId(current.id);
      await send({ conversationId: current.id, message: draft, attachments: files });
      setDraft(""); setFiles([]); refresh();
    } catch (failure) { setNotice(failure.message || "메시지를 보내지 못했습니다."); refresh(); }
    finally { setBusy(false); }
  }
  async function changeWorkers(workerId, checked) {
    const next = checked ? [...selectedWorkers, workerId] : selectedWorkers.filter(id => id !== workerId);
    if (!conversation) { setWorkers(next); return; }
    setBusy(true); setNotice("");
    try { await saveTeam({ conversationId: conversation.id, leadId: selectedLeadId, workerIds: next }); refresh(); }
    catch (failure) { setNotice(failure.message); } finally { setBusy(false); }
  }
  async function stopReply() {
    if (busy || !activeMessage?.runId) return;
    setBusy(true); setNotice("");
    try { await stop({ conversationId: conversation.id, messageId: activeMessage.id, runId: activeMessage.runId }); }
    catch (failure) { setNotice(failure.message || "중지 상태를 확인하지 못했습니다."); }
    finally { setBusy(false); refresh(); }
  }
  async function attach(event) {
    const chosen = [...event.target.files]; event.target.value = "";
    try {
      if (files.length + chosen.length > 4) throw new Error("텍스트 파일은 최대 4개까지 첨부할 수 있습니다.");
      const next = await Promise.all(chosen.map(async file => {
        if (file.size > 65536) throw new Error("파일 하나당 최대 64 KiB입니다.");
        const content = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
        if (content.includes("\0")) throw new Error("UTF-8 텍스트 파일만 첨부할 수 있습니다.");
        return { name: file.name, content };
      })); setFiles([...files, ...next]); setNotice("");
    } catch (failure) { setNotice(failure.message); }
  }
  function resize(event) {
    const start = event.clientX, width = panelWidth; resizeCleanup.current?.();
    const move = next => setPanelWidth(Math.max(260, Math.min(440, width + start - next.clientX)));
    const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); resizeCleanup.current = null; };
    resizeCleanup.current = stop; window.addEventListener("pointermove", move); window.addEventListener("pointerup", stop);
  }
  return <div className={`sps-builder ${panel ? "with-panel" : ""}`} style={{ "--builder-panel": `${panelWidth}px` }}>
    <style>{builderStyles}</style>
    <aside className="bc-rail" aria-label="Builder conversations">
      <div className="bc-rail-header"><strong>Plugin Builder</strong><button className="bc-icon" title="새 대화" aria-label="새 대화" onClick={fresh}>+</button></div>
      <div className="bc-list">{[...conversations].reverse().map(item => <button key={item.id} className={`bc-chat-link ${selectedId === item.id ? "active" : ""}`} onClick={() => { setSelectedId(item.id); setDraft(""); setFiles([]); setNotice(""); }}><span>{item.title}</span><small>{agents.find(agent => agent.id === item.leadId)?.name || "Lead"}</small></button>)}
        {!loading && !conversations.length ? <p className="bc-muted">아직 대화가 없습니다.</p> : null}</div>
    </aside>
    <main className="bc-main">
      <header className="bc-header"><span className="bc-header-title">{conversation?.title || "새 대화"}</span><button className="bc-icon" title="새 대화" aria-label="새 대화 시작" onClick={fresh}>+</button><button className="bc-button" aria-expanded={panel} onClick={() => setPanel(!panel)}>작업 패널</button></header>
      <section className="bc-transcript" aria-label="Lead conversation" aria-live="polite">
        {loading && !data ? <p className="bc-muted">대화를 불러오는 중...</p> : null}
        {error ? <p className="bc-error" role="alert">{error.message} <button className="bc-button" onClick={refresh}>다시 시도</button></p> : null}
        {!loading && !error && !messages.length ? <div className="bc-empty"><h2>무엇을 만들까요?</h2><p>Lead와 플러그인 제작을 시작하세요.</p></div> : null}
        {messages.map(message => <article className={`bc-message ${message.role}`} key={message.id}>
          <div className="bc-message-head"><span>{message.role === "user" ? "나" : lead?.name || "Lead"}</span>{message.status ? <span className="bc-status">{message.recoveryPending ? "실행 상태 확인 중" : { running:"작업 중", cancelling:"중지 확인 중", cancelled:"중지 완료", failed:"실패", interrupted:"중단됨", completed:"완료" }[message.status]}</span> : null}</div>
          <div className={`bc-message-body ${message.status === "failed" ? "bc-error" : ""}`}>{message.content || (message.status === "running" ? "답변을 준비하고 있습니다…" : "")}</div>
          {message.attachments?.map((file,index) => <details key={index}><summary>{file.name}</summary><pre>{file.content}</pre></details>)}
          {message.steps?.length ? <details><summary>실행 기록 {message.steps.length}</summary><pre>{message.steps.map(step => step.text).join("\n")}</pre></details> : null}
        </article>)}<div ref={end} />
      </section>
      <form className="bc-composer" onSubmit={submit}><div className="bc-compose-box">
        {files.length ? <div className="bc-file-chips">{files.map((file,index) => <span className="bc-file-chip" key={index}>{file.name}<button type="button" title="첨부 제거" aria-label={`${file.name} 첨부 제거`} onClick={() => setFiles(files.filter((_,i) => i!==index))}>x</button></span>)}</div> : null}
        <textarea aria-label="Lead에게 메시지" placeholder={lead ? `${lead.name}에게 메시지` : "먼저 Assistant를 등록하세요"} value={draft} maxLength={20000} disabled={busy || running || !lead} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if(event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form.requestSubmit(); } }} />
        <div className="bc-compose-tools"><button type="button" className="bc-icon" title="UTF-8 텍스트 파일 첨부" aria-label="텍스트 파일 첨부" disabled={busy || running} onClick={() => fileInput.current.click()}>+</button><input className="bc-hidden" ref={fileInput} type="file" multiple accept=".txt,.md,.json,.js,.ts,.jsx,.tsx,.css,.html,.yaml,.yml,.csv" onChange={attach} />
          <select aria-label="Lead 선택" value={selectedLeadId} disabled={busy || running || Boolean(conversation)} onChange={event => { setLeadId(event.target.value); setWorkers(workers.filter(id => id!==event.target.value)); }}>{!agents.length ? <option value="">Lead 없음</option> : null}{agents.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select>
          <span className="bc-model" title="선택한 Agent의 모델·추론 설정을 사용합니다">{lead?.model || lead?.adapterType || ""}{lead?.effort ? ` · ${lead.effort}` : ""}</span><span className="bc-spacer" />{running ? <button type="button" className="bc-button" title="현재 Lead 응답만 중지" onClick={stopReply} disabled={busy || !activeMessage.runId}>{busy ? "중지 요청 중…" : cancelling ? "중지 재시도" : "응답 중지"}</button> : <button className="bc-button primary" disabled={busy || !lead || (!draft.trim() && !files.length)}>{busy ? "전송 중…" : "보내기"}</button>}
        </div></div>{notice ? <p className="bc-notice bc-error" role="alert">{notice}</p> : null}{!lead && !loading ? <p className="bc-notice bc-muted">이 Workspace에 실행 가능한 Assistant가 없습니다.</p> : null}
      </form>
    </main>
    {panel ? <aside className="bc-panel" aria-label="Builder 작업 패널"><div className="bc-resizer" role="separator" tabIndex={0} aria-label="작업 패널 너비" aria-orientation="vertical" aria-valuemin={260} aria-valuemax={440} aria-valuenow={panelWidth} onPointerDown={resize} onKeyDown={event => { if(["ArrowLeft","ArrowRight"].includes(event.key)) { event.preventDefault(); setPanelWidth(width => Math.max(260,Math.min(440,width+(event.key==="ArrowLeft"?20:-20)))); } }} />
      <div className="bc-panel-head"><strong>작업</strong><button className="bc-icon" aria-label="작업 패널 닫기" title="작업 패널 닫기" onClick={() => setPanel(false)}>x</button></div><h3>Lead</h3><div className="bc-person"><span className="bc-person-name">{lead?.name || "선택 필요"}</span><small>{running ? "작업 중" : "대기"}</small></div><h3>Workers</h3>
      {agents.filter(agent => agent.id!==selectedLeadId).map(agent => <div className="bc-person" key={agent.id}><label><input type="checkbox" disabled={busy || running} checked={selectedWorkers.includes(agent.id)} onChange={event => changeWorkers(agent.id,event.target.checked)} /><span className="bc-person-name">{agent.name}</span></label></div>)}{agents.length<2 ? <p>추가 Assistant를 등록하면 Worker로 선택할 수 있습니다.</p> : null}
      {conversation?.reports?.length ? <><h3>Worker 보고</h3>{conversation.reports.map(report => <details className="bc-evidence-item" key={report.id}><summary>{agents.find(agent => agent.id===report.workerId)?.name || "Worker"} · {report.status}</summary><p>{report.objective}</p><p>{report.content || "실행 중"}</p></details>)}</> : null}
      <h3>Preview</h3><button className="bc-button" onClick={() => navigation.navigate("/company/settings/instance/plugins")}>플러그인 검토 열기</button>
      <details className="bc-evidence"><summary>제작 기록 · Authoring projects ({sessions.length})</summary>{!sessions.length ? <p>No plugin project has been started in this Workspace.</p> : null}{[...sessions].reverse().map(session => <div className="bc-evidence-item" key={session.id}><strong>{session.displayName}</strong><span className="bc-status">{session.status}</span>{session.events.slice(-8).map(event => <p key={event.id}>{event.summary}{event.evidence?.length ? ` · 증거 ${event.evidence.length}` : ""}</p>)}</div>)}</details>
      <details className="bc-evidence"><summary>Builder contract</summary><p>제작 기록과 검증 결과는 Workspace에 저장합니다. Preview는 별도 격리 창에서 확인하며, 설치·활성화는 설정에서 관리합니다.</p></details>
    </aside> : null}
  </div>;
}
