import { useEffect, useMemo, useState } from "react";
import {
  usePluginAction,
  usePluginData,
  usePluginStream,
  usePluginToast,
} from "@paperclipai/plugin-sdk/ui";

const styles = `
  .sps-discovery { max-width: 920px; margin: 0 auto; color: var(--foreground, #172033); font: 14px/1.5 system-ui, sans-serif; }
  .sps-discovery-header { padding: 8px 0 18px; }
  .sps-discovery-header h1 { margin: 0; font-size: 22px; letter-spacing: 0; }
  .sps-discovery-header p { max-width: 680px; margin: 8px 0 0; color: var(--muted-foreground, #667085); }
  .sps-discovery-card { margin-top: 14px; border: 1px solid var(--border, #d8dee9); border-radius: 10px; background: var(--background, #fff); overflow: hidden; }
  .sps-discovery-card-head { padding: 14px 16px; border-bottom: 1px solid var(--border, #e3e8f0); display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .sps-discovery-card-head strong { display: block; font-size: 14px; }
  .sps-discovery-card-head span { display: block; margin-top: 2px; color: var(--muted-foreground, #667085); font-size: 12px; }
  .sps-discovery-assistants { padding: 10px; display: grid; gap: 7px; }
  .sps-discovery-assistant { width: 100%; border: 1px solid transparent; border-radius: 8px; background: transparent; padding: 10px 11px; text-align: left; color: inherit; cursor: pointer; display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .sps-discovery-assistant:hover { background: #f6f8fb; }
  .sps-discovery-assistant.selected { border-color: #b8c8de; background: #edf3fb; }
  .sps-discovery-assistant span { color: var(--muted-foreground, #667085); font-size: 12px; }
  .sps-discovery-empty { padding: 18px 16px; color: var(--muted-foreground, #667085); }
  .sps-discovery-button { appearance: none; border: 1px solid #1f5eb8; border-radius: 7px; background: #2563bf; color: #fff; padding: 8px 11px; font: 650 13px/1.2 system-ui, sans-serif; cursor: pointer; }
  .sps-discovery-button:hover { background: #1f56a6; }
  .sps-discovery-button.secondary { border-color: var(--border, #c9d2df); background: var(--background, #fff); color: var(--foreground, #172033); }
  .sps-discovery-button:disabled { opacity: .55; cursor: default; }
  .sps-discovery-thread { min-height: 300px; max-height: min(58vh, 680px); overflow: auto; padding: 20px clamp(14px, 4vw, 40px); background: #fbfcfe; }
  .sps-discovery-message { max-width: 720px; margin: 0 auto 17px; white-space: pre-wrap; overflow-wrap: anywhere; }
  .sps-discovery-message.user { max-width: min(610px, 100%); margin-right: max(0px, calc((100% - 720px) / 2)); margin-left: auto; padding: 10px 12px; border: 1px solid #dce3ec; border-radius: 12px; background: #f2f5f9; }
  .sps-discovery-message.system { color: #a2481d; font-size: 13px; }
  .sps-discovery-label { margin-bottom: 4px; color: var(--muted-foreground, #667085); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; }
  .sps-discovery-live { max-width: 720px; margin: 0 auto; color: var(--muted-foreground, #667085); white-space: pre-wrap; overflow-wrap: anywhere; }
  .sps-discovery-compose { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 9px; padding: 12px; border-top: 1px solid var(--border, #e3e8f0); background: var(--background, #fff); }
  .sps-discovery-compose textarea { min-height: 42px; max-height: 150px; resize: vertical; border: 1px solid var(--border, #c9d2df); border-radius: 8px; padding: 10px; color: inherit; background: transparent; font: inherit; outline: none; }
  .sps-discovery-compose textarea:focus { border-color: #5b90db; box-shadow: 0 0 0 2px rgba(37, 99, 191, .12); }
  .sps-discovery-hint { padding: 0 12px 12px; color: var(--muted-foreground, #667085); font-size: 12px; }
  @media (max-width: 640px) { .sps-discovery-compose { grid-template-columns: 1fr; } .sps-discovery-compose .sps-discovery-button { min-height: 40px; } }
`;

function safeMessages(messages) {
  return Array.isArray(messages) ? messages.filter((message) => message?.content) : [];
}

function roleLabel(role) {
  return role === "assistant" ? "Assistant" : role === "system" ? "System" : "You";
}

export function PluginDiscoveryPage({ context }) {
  const toast = usePluginToast();
  const { data, loading, error, refresh } = usePluginData("discovery-workspace", { companyId: context.companyId });
  const selectAssistant = usePluginAction("discovery-select-assistant");
  const sendMessage = usePluginAction("discovery-send");
  const stream = usePluginStream("discovery-chat", { companyId: context.companyId });
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedAssistantId, setSelectedAssistantId] = useState(null);
  const [liveText, setLiveText] = useState("");

  const assistants = data?.assistants ?? [];
  const activeAssistantId = selectedAssistantId ?? data?.selectedAssistantId ?? null;
  const messages = useMemo(() => safeMessages(data?.transcript), [data?.transcript]);

  useEffect(() => {
    const event = stream.lastEvent;
    if (!event || event.companyId !== context.companyId) return;
    if (event.eventType === "chunk" && event.message) setLiveText((previous) => `${previous}${event.message}`);
    if (event.eventType === "done" || event.eventType === "error") {
      setBusy(false);
      setLiveText("");
      void refresh();
    }
  }, [context.companyId, refresh, stream.lastEvent]);

  async function chooseAssistant(agentId) {
    setSelectedAssistantId(agentId);
    try {
      await selectAssistant({ companyId: context.companyId, assistantId: agentId });
      await refresh();
    } catch (actionError) {
      toast({ title: "Assistant selection failed", body: actionError instanceof Error ? actionError.message : String(actionError), tone: "error" });
    }
  }

  async function submit(event) {
    event.preventDefault();
    const nextPrompt = prompt.trim();
    if (!nextPrompt || !activeAssistantId || busy) return;
    setBusy(true);
    setLiveText("");
    setPrompt("");
    try {
      await sendMessage({ companyId: context.companyId, assistantId: activeAssistantId, prompt: nextPrompt });
      await refresh();
    } catch (actionError) {
      setBusy(false);
      setPrompt(nextPrompt);
      toast({ title: "Message was not sent", body: actionError instanceof Error ? actionError.message : String(actionError), tone: "error" });
    }
  }

  return (
    <div className="sps-discovery">
      <style>{styles}</style>
      <header className="sps-discovery-header">
        <h1>Plugin Discovery & Builder</h1>
        <p>Describe how you want SPS to work. Your Assistant can recommend a verified extension or draft a new one. It will not change plugin state by itself.</p>
      </header>

      <section className="sps-discovery-card">
        <div className="sps-discovery-card-head">
          <div><strong>Assistant</strong><span>Choose the runtime that will help explore your workflow.</span></div>
          <button className="sps-discovery-button secondary" type="button" onClick={() => navigation.navigate("/assistants/new")}>Add assistant</button>
        </div>
        {loading ? <div className="sps-discovery-empty">Loading available assistants...</div> : null}
        {error ? <div className="sps-discovery-empty">Could not load assistants: {error.message}</div> : null}
        {!loading && !error && assistants.length === 0 ? (
          <div className="sps-discovery-empty">Register an initial Assistant before starting a Discovery conversation.</div>
        ) : null}
        {!loading && !error && assistants.length > 0 ? (
          <div className="sps-discovery-assistants">
            {assistants.map((assistant) => (
              <button
                className={`sps-discovery-assistant ${assistant.id === activeAssistantId ? "selected" : ""}`}
                key={assistant.id}
                type="button"
                onClick={() => chooseAssistant(assistant.id)}
              >
                <div><strong>{assistant.name}</strong><span>{assistant.title || assistant.adapterType}</span></div>
                <span>{assistant.status}</span>
              </button>
            ))}
          </div>
        ) : null}
      </section>

      <section className="sps-discovery-card">
        <div className="sps-discovery-thread">
          {messages.length === 0 ? <div className="sps-discovery-empty">Start by describing the kind of workflow, product, or tool your team needs.</div> : null}
          {messages.map((message, index) => (
            <article className={`sps-discovery-message ${message.role}`} key={`${message.at}-${index}`}>
              <div className="sps-discovery-label">{roleLabel(message.role)}</div>
              <div>{message.content}</div>
            </article>
          ))}
          {busy && liveText ? <div className="sps-discovery-live">{liveText}</div> : null}
          {busy && !liveText ? <div className="sps-discovery-live">Assistant is working...</div> : null}
        </div>
        <form className="sps-discovery-compose" onSubmit={submit}>
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={activeAssistantId ? "Describe the workflow you want to build..." : "Choose or add an Assistant first"} disabled={!activeAssistantId || busy} />
          <button className="sps-discovery-button" type="submit" disabled={!activeAssistantId || !prompt.trim() || busy}>{busy ? "Working..." : "Send"}</button>
        </form>
        <div className="sps-discovery-hint">Recommendations and drafts are advisory. Review plugin changes in Settings &gt; Plugins.</div>
      </section>
    </div>
  );
}
