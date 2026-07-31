// src/ui/DiscoveryPage.jsx
import { useEffect, useMemo, useState } from "react";
import {
  usePluginAction,
  usePluginData,
  useHostNavigation,
  usePluginStream,
  usePluginToast
} from "@paperclipai/plugin-sdk/ui";
import { jsx, jsxs } from "react/jsx-runtime";
var styles = `
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
function dashboardStyles() {
  return {
    display: "grid",
    gap: "10px",
    minHeight: "112px",
    color: "var(--foreground, #172033)",
    font: "14px/1.45 system-ui, sans-serif"
  };
}
function PluginDiscoveryDashboardWidget({ data, loading, error }) {
  const navigation = useHostNavigation();
  if (loading) return /* @__PURE__ */ jsx("div", { style: dashboardStyles(), children: "Loading Discovery..." });
  if (error) return /* @__PURE__ */ jsxs("div", { style: dashboardStyles(), children: [
    "Discovery status is unavailable: ",
    error.message
  ] });
  const assistant = data?.assistant ?? null;
  const summary = assistant ? `${assistant.name}${assistant.title ? `, ${assistant.title}` : ""}` : "No Assistant selected";
  const detail = assistant ? `${assistant.status} / ${data?.conversationStarted ? `${data?.messageCount ?? 0} messages in this conversation` : "ready to start a conversation"}` : data?.assistantCount > 0 ? "Choose an Assistant to start a Discovery conversation." : "Add an Assistant before starting a Discovery conversation.";
  return /* @__PURE__ */ jsxs("div", { style: dashboardStyles(), children: [
    /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx("strong", { style: { display: "block", fontSize: "15px" }, children: summary }),
      /* @__PURE__ */ jsx("span", { style: { color: "var(--muted-foreground, #667085)", fontSize: "13px" }, children: detail })
    ] }),
    /* @__PURE__ */ jsx(
      "button",
      {
        className: "sps-discovery-button",
        type: "button",
        onClick: () => navigation.navigate("/discover"),
        style: {
          justifySelf: "start",
          border: "1px solid #1f5eb8",
          borderRadius: "7px",
          background: "#2563bf",
          color: "#fff",
          padding: "8px 11px",
          font: "650 13px/1.2 system-ui, sans-serif",
          cursor: "pointer"
        },
        children: "Open Discovery"
      }
    )
  ] });
}
function PluginDiscoveryPage({ context }) {
  const navigation = useHostNavigation();
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
  return /* @__PURE__ */ jsxs("div", { className: "sps-discovery", children: [
    /* @__PURE__ */ jsx("style", { children: styles }),
    /* @__PURE__ */ jsxs("header", { className: "sps-discovery-header", children: [
      /* @__PURE__ */ jsx("h1", { children: "Plugin Discovery & Builder" }),
      /* @__PURE__ */ jsx("p", { children: "Describe how you want SPS to work. Your Assistant can recommend a verified extension or draft a new one. It will not change plugin state by itself." })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "sps-discovery-card", children: [
      /* @__PURE__ */ jsxs("div", { className: "sps-discovery-card-head", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("strong", { children: "Assistant" }),
          /* @__PURE__ */ jsx("span", { children: "Choose the runtime that will help explore your workflow." })
        ] }),
        /* @__PURE__ */ jsx("button", { className: "sps-discovery-button secondary", type: "button", onClick: () => navigation.navigate("/assistants/new"), children: "Add assistant" })
      ] }),
      loading ? /* @__PURE__ */ jsx("div", { className: "sps-discovery-empty", children: "Loading available assistants..." }) : null,
      error ? /* @__PURE__ */ jsxs("div", { className: "sps-discovery-empty", children: [
        "Could not load assistants: ",
        error.message
      ] }) : null,
      !loading && !error && assistants.length === 0 ? /* @__PURE__ */ jsx("div", { className: "sps-discovery-empty", children: "Register an initial Assistant before starting a Discovery conversation." }) : null,
      !loading && !error && assistants.length > 0 ? /* @__PURE__ */ jsx("div", { className: "sps-discovery-assistants", children: assistants.map((assistant) => /* @__PURE__ */ jsxs(
        "button",
        {
          className: `sps-discovery-assistant ${assistant.id === activeAssistantId ? "selected" : ""}`,
          type: "button",
          onClick: () => chooseAssistant(assistant.id),
          children: [
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("strong", { children: assistant.name }),
              /* @__PURE__ */ jsx("span", { children: assistant.title || assistant.adapterType })
            ] }),
            /* @__PURE__ */ jsx("span", { children: assistant.status })
          ]
        },
        assistant.id
      )) }) : null
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "sps-discovery-card", children: [
      /* @__PURE__ */ jsxs("div", { className: "sps-discovery-thread", children: [
        messages.length === 0 ? /* @__PURE__ */ jsx("div", { className: "sps-discovery-empty", children: "Start by describing the kind of workflow, product, or tool your team needs." }) : null,
        messages.map((message, index) => /* @__PURE__ */ jsxs("article", { className: `sps-discovery-message ${message.role}`, children: [
          /* @__PURE__ */ jsx("div", { className: "sps-discovery-label", children: roleLabel(message.role) }),
          /* @__PURE__ */ jsx("div", { children: message.content })
        ] }, `${message.at}-${index}`)),
        busy && liveText ? /* @__PURE__ */ jsx("div", { className: "sps-discovery-live", children: liveText }) : null,
        busy && !liveText ? /* @__PURE__ */ jsx("div", { className: "sps-discovery-live", children: "Assistant is working..." }) : null
      ] }),
      /* @__PURE__ */ jsxs("form", { className: "sps-discovery-compose", onSubmit: submit, children: [
        /* @__PURE__ */ jsx("textarea", { value: prompt, onChange: (event) => setPrompt(event.target.value), placeholder: activeAssistantId ? "Describe the workflow you want to build..." : "Choose or add an Assistant first", disabled: !activeAssistantId || busy }),
        /* @__PURE__ */ jsx("button", { className: "sps-discovery-button", type: "submit", disabled: !activeAssistantId || !prompt.trim() || busy, children: busy ? "Working..." : "Send" })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "sps-discovery-hint", children: "Recommendations and drafts are advisory. Review plugin changes in Settings > Plugins." })
    ] })
  ] });
}
export {
  PluginDiscoveryDashboardWidget,
  PluginDiscoveryPage
};
