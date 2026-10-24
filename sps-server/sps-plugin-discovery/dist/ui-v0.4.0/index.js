// src/ui/DiscoveryPage.jsx
import { useEffect, useRef, useState } from "react";
import { useHostNavigation, usePluginAction, usePluginData } from "@sonparkserver/plugin-sdk/ui/bridge";

// src/ui/builder-styles.js
var builderStyles = `
.sps-builder{--builder-rail:200px;--builder-panel:300px;color:var(--foreground,#24272b);font:14px/1.6 var(--font-sans,"Pretendard Variable",system-ui,sans-serif);letter-spacing:0;height:calc(100dvh - 128px);min-height:480px;position:relative;display:grid;grid-template-columns:var(--builder-rail) minmax(0,1fr);overflow:hidden;border:1px solid var(--border,#e2e2e2);border-radius:8px;background:var(--background,#fff)}
.sps-builder *{box-sizing:border-box}.sps-builder.with-panel{grid-template-columns:var(--builder-rail) minmax(0,1fr) var(--builder-panel)}
.sps-builder button,.sps-builder input,.sps-builder select,.sps-builder textarea{font:inherit;color:inherit}.sps-builder button{cursor:pointer}.sps-builder button:disabled{cursor:default;opacity:.45}.sps-builder button:focus-visible,.sps-builder select:focus-visible,.sps-builder summary:focus-visible{outline:2px solid var(--ring,#777);outline-offset:2px}
.bc-rail{min-width:0;min-height:0;padding:12px 8px;background:var(--app-surface,#f7f7f7);border-right:1px solid var(--border,#e2e2e2);display:flex;flex-direction:column;gap:10px}.bc-rail-header{display:flex;align-items:center;justify-content:space-between;padding:0 6px}.bc-rail-header strong{font-size:13px}.bc-list{overflow:auto;min-height:0;display:grid;align-content:start;gap:4px}.bc-chat-link{border:0;background:transparent;text-align:left;border-radius:6px;padding:9px 10px;min-width:0}.bc-chat-link span{display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.bc-chat-link small{display:block;color:var(--muted-foreground,#68717b);font-size:11px}.bc-chat-link.active,.bc-chat-link:hover{background:var(--accent,#eee)}
.bc-main{min-width:0;min-height:0;display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr) auto}.bc-header{min-height:52px;display:flex;align-items:center;gap:8px;padding:10px 18px;border-bottom:1px solid var(--border,#e2e2e2)}.bc-header-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:600}.bc-icon,.bc-button{border:1px solid var(--border,#ddd);border-radius:6px;background:var(--background,#fff);padding:5px 9px;flex:none}.bc-icon{min-width:30px;height:30px;padding:2px 6px}.bc-button.primary{background:var(--primary,#292d32);color:var(--primary-foreground,#fff);border-color:var(--primary,#292d32)}
.bc-transcript{overflow:auto;min-height:0;padding:24px clamp(16px,3vw,40px);overscroll-behavior:contain}.bc-empty{min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px;gap:8px}.bc-empty h2{font-size:22px;font-weight:600;margin:0}.bc-empty p{color:var(--muted-foreground,#68717b);margin:0;max-width:380px}.bc-message{max-width:800px;margin:0 auto 26px;overflow-wrap:anywhere}.bc-message.user{width:fit-content;max-width:85%;margin-right:0;margin-left:auto;background:var(--muted,#f5f5f5);border-radius:8px;padding:11px 15px}.bc-message-head{font-size:12px;color:var(--muted-foreground,#68717b);margin-bottom:6px;display:flex;gap:10px;align-items:center}.bc-message-body{white-space:pre-wrap;font-size:15px;line-height:1.7}.bc-message details{margin-top:8px;font-size:12px;color:var(--muted-foreground,#68717b)}.bc-message pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:180px;overflow:auto;font:12px/1.5 ui-monospace,monospace}.bc-error{color:#a61b1b;font-size:12px;overflow-wrap:anywhere}.bc-muted{color:var(--muted-foreground,#68717b);font-size:12px}.bc-status{border-radius:5px;background:var(--muted,#f4f4f4);padding:2px 6px;font-size:11px}
.bc-composer{padding:12px clamp(16px,3vw,40px) 18px}.bc-compose-box{max-width:840px;margin:0 auto;border:1px solid var(--border,#ddd);border-radius:8px;padding:10px 12px;box-shadow:0 1px 3px #00000008}.bc-compose-box:focus-within{border-color:var(--ring,#888)}.bc-compose-box textarea{display:block;resize:none;width:100%;min-height:70px;max-height:180px;border:0;outline:0;background:transparent;padding:4px}.bc-compose-tools{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:6px}.bc-compose-tools select{min-width:0;max-width:200px;border:0;background:transparent;font-size:12px;padding:4px}.bc-spacer{flex:1}.bc-model{font-size:11px;color:var(--muted-foreground,#68717b)}.bc-file-chips{display:flex;gap:6px;flex-wrap:wrap}.bc-file-chip{display:flex;align-items:center;gap:5px;font-size:12px;padding:2px 6px;border:1px solid var(--border,#ddd);border-radius:5px}.bc-file-chip button{border:0;background:transparent}.bc-hidden{display:none}.bc-notice{max-width:840px;margin:6px auto;font-size:12px}
.bc-panel{position:relative;min-width:0;min-height:0;overflow:auto;border-left:1px solid var(--border,#ddd);background:var(--background,#fff);padding:14px}.bc-panel-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}.bc-panel h3{margin:18px 0 8px;font-size:12px;font-weight:600}.bc-panel p{font-size:12px;color:var(--muted-foreground,#68717b)}.bc-person{display:flex;gap:8px;align-items:center;padding:8px 0;min-width:0}.bc-person label{display:flex;gap:8px;align-items:center;width:100%;min-width:0}.bc-person-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bc-person small{margin-left:auto;color:var(--muted-foreground,#68717b);font-size:11px}.bc-resizer{position:absolute;top:0;bottom:0;left:0;width:6px;cursor:col-resize;touch-action:none}.bc-evidence{border-top:1px solid var(--border,#ddd);padding-top:12px;margin-top:18px}.bc-evidence summary{cursor:pointer;font-size:12px}.bc-evidence-item{padding:8px 0;border-bottom:1px solid var(--border,#eee);font-size:12px}.bc-evidence-item strong{display:block}.bc-evidence-item p{margin:4px 0;overflow-wrap:anywhere}
@media(max-width:1100px){.sps-builder.with-panel{grid-template-columns:var(--builder-rail) minmax(0,1fr)}.bc-panel{position:absolute;inset:0 0 0 auto;z-index:4;width:min(var(--builder-panel),80%);box-shadow:-8px 0 24px #0000000d}}
@media(max-width:850px){.sps-builder{--builder-rail:150px}.bc-model{display:none}}
@media(max-width:600px){.sps-builder{--builder-rail:0px}.bc-rail{display:none}.bc-composer{padding:10px}.bc-transcript{padding:16px}.bc-header{padding:8px 10px}}
`;

// src/ui/DiscoveryPage.jsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
function PluginBuilderPage({ context }) {
  const { data, loading, error, refresh } = usePluginData("plugin-builder-workspace", { companyId: context.companyId });
  const create = usePluginAction("builder-create"), send = usePluginAction("builder-send"), saveTeam = usePluginAction("builder-team");
  const stop = usePluginAction("builder-stop");
  const navigation = useHostNavigation();
  const [selectedId, setSelectedId] = useState(null), [leadId, setLeadId] = useState("");
  const [workers, setWorkers] = useState([]), [draft, setDraft] = useState(""), [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(""), [panel, setPanel] = useState(false), [panelWidth, setPanelWidth] = useState(300);
  const end = useRef(null), fileInput = useRef(null), resizeCleanup = useRef(null);
  const agents = data?.agents ?? [], conversations = data?.conversations ?? [];
  const conversation = conversations.find((item) => item.id === selectedId);
  const selectedLeadId = conversation?.leadId || leadId || agents[0]?.id || "";
  const selectedWorkers = conversation?.workerIds ?? workers, lead = agents.find((agent) => agent.id === selectedLeadId);
  const messages = conversation?.messages ?? [], activeMessage = messages.find((message) => ["running", "cancelling"].includes(message.status) || message.recoveryPending);
  const running = Boolean(activeMessage), cancelling = activeMessage?.status === "cancelling";
  const sessions = data?.authoringSessions ?? [];
  useEffect(() => {
    const timer = setInterval(refresh, running ? 1500 : 1e4);
    return () => clearInterval(timer);
  }, [refresh, running]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [selectedId, messages.length, messages.at(-1)?.status]);
  useEffect(() => () => resizeCleanup.current?.(), []);
  function fresh() {
    setSelectedId(null);
    setDraft("");
    setFiles([]);
    setNotice("");
  }
  async function submit(event) {
    event.preventDefault();
    if (busy || running || !selectedLeadId || !draft.trim() && !files.length) return;
    setBusy(true);
    setNotice("");
    try {
      const current = conversation ?? await create({ leadId: selectedLeadId, workerIds: selectedWorkers });
      setSelectedId(current.id);
      await send({ conversationId: current.id, message: draft, attachments: files });
      setDraft("");
      setFiles([]);
      refresh();
    } catch (failure) {
      setNotice(failure.message || "\uBA54\uC2DC\uC9C0\uB97C \uBCF4\uB0B4\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
      refresh();
    } finally {
      setBusy(false);
    }
  }
  async function changeWorkers(workerId, checked) {
    const next = checked ? [...selectedWorkers, workerId] : selectedWorkers.filter((id) => id !== workerId);
    if (!conversation) {
      setWorkers(next);
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      await saveTeam({ conversationId: conversation.id, leadId: selectedLeadId, workerIds: next });
      refresh();
    } catch (failure) {
      setNotice(failure.message);
    } finally {
      setBusy(false);
    }
  }
  async function stopReply() {
    if (busy || !activeMessage?.runId) return;
    setBusy(true);
    setNotice("");
    try {
      await stop({ conversationId: conversation.id, messageId: activeMessage.id, runId: activeMessage.runId });
    } catch (failure) {
      setNotice(failure.message || "\uC911\uC9C0 \uC0C1\uD0DC\uB97C \uD655\uC778\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
    } finally {
      setBusy(false);
      refresh();
    }
  }
  async function attach(event) {
    const chosen = [...event.target.files];
    event.target.value = "";
    try {
      if (files.length + chosen.length > 4) throw new Error("\uD14D\uC2A4\uD2B8 \uD30C\uC77C\uC740 \uCD5C\uB300 4\uAC1C\uAE4C\uC9C0 \uCCA8\uBD80\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
      const next = await Promise.all(chosen.map(async (file) => {
        if (file.size > 65536) throw new Error("\uD30C\uC77C \uD558\uB098\uB2F9 \uCD5C\uB300 64 KiB\uC785\uB2C8\uB2E4.");
        const content = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
        if (content.includes("\0")) throw new Error("UTF-8 \uD14D\uC2A4\uD2B8 \uD30C\uC77C\uB9CC \uCCA8\uBD80\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
        return { name: file.name, content };
      }));
      setFiles([...files, ...next]);
      setNotice("");
    } catch (failure) {
      setNotice(failure.message);
    }
  }
  function resize(event) {
    const start = event.clientX, width = panelWidth;
    resizeCleanup.current?.();
    const move = (next) => setPanelWidth(Math.max(260, Math.min(440, width + start - next.clientX)));
    const stop2 = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop2);
      resizeCleanup.current = null;
    };
    resizeCleanup.current = stop2;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop2);
  }
  return /* @__PURE__ */ jsxs("div", { className: `sps-builder ${panel ? "with-panel" : ""}`, style: { "--builder-panel": `${panelWidth}px` }, children: [
    /* @__PURE__ */ jsx("style", { children: builderStyles }),
    /* @__PURE__ */ jsxs("aside", { className: "bc-rail", "aria-label": "Builder conversations", children: [
      /* @__PURE__ */ jsxs("div", { className: "bc-rail-header", children: [
        /* @__PURE__ */ jsx("strong", { children: "Plugin Builder" }),
        /* @__PURE__ */ jsx("button", { className: "bc-icon", title: "\uC0C8 \uB300\uD654", "aria-label": "\uC0C8 \uB300\uD654", onClick: fresh, children: "+" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "bc-list", children: [
        [...conversations].reverse().map((item) => /* @__PURE__ */ jsxs("button", { className: `bc-chat-link ${selectedId === item.id ? "active" : ""}`, onClick: () => {
          setSelectedId(item.id);
          setDraft("");
          setFiles([]);
          setNotice("");
        }, children: [
          /* @__PURE__ */ jsx("span", { children: item.title }),
          /* @__PURE__ */ jsx("small", { children: agents.find((agent) => agent.id === item.leadId)?.name || "Lead" })
        ] }, item.id)),
        !loading && !conversations.length ? /* @__PURE__ */ jsx("p", { className: "bc-muted", children: "\uC544\uC9C1 \uB300\uD654\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." }) : null
      ] })
    ] }),
    /* @__PURE__ */ jsxs("main", { className: "bc-main", children: [
      /* @__PURE__ */ jsxs("header", { className: "bc-header", children: [
        /* @__PURE__ */ jsx("span", { className: "bc-header-title", children: conversation?.title || "\uC0C8 \uB300\uD654" }),
        /* @__PURE__ */ jsx("button", { className: "bc-icon", title: "\uC0C8 \uB300\uD654", "aria-label": "\uC0C8 \uB300\uD654 \uC2DC\uC791", onClick: fresh, children: "+" }),
        /* @__PURE__ */ jsx("button", { className: "bc-button", "aria-expanded": panel, onClick: () => setPanel(!panel), children: "\uC791\uC5C5 \uD328\uB110" })
      ] }),
      /* @__PURE__ */ jsxs("section", { className: "bc-transcript", "aria-label": "Lead conversation", "aria-live": "polite", children: [
        loading && !data ? /* @__PURE__ */ jsx("p", { className: "bc-muted", children: "\uB300\uD654\uB97C \uBD88\uB7EC\uC624\uB294 \uC911..." }) : null,
        error ? /* @__PURE__ */ jsxs("p", { className: "bc-error", role: "alert", children: [
          error.message,
          " ",
          /* @__PURE__ */ jsx("button", { className: "bc-button", onClick: refresh, children: "\uB2E4\uC2DC \uC2DC\uB3C4" })
        ] }) : null,
        !loading && !error && !messages.length ? /* @__PURE__ */ jsxs("div", { className: "bc-empty", children: [
          /* @__PURE__ */ jsx("h2", { children: "\uBB34\uC5C7\uC744 \uB9CC\uB4E4\uAE4C\uC694?" }),
          /* @__PURE__ */ jsx("p", { children: "Lead\uC640 \uD50C\uB7EC\uADF8\uC778 \uC81C\uC791\uC744 \uC2DC\uC791\uD558\uC138\uC694." })
        ] }) : null,
        messages.map((message) => /* @__PURE__ */ jsxs("article", { className: `bc-message ${message.role}`, children: [
          /* @__PURE__ */ jsxs("div", { className: "bc-message-head", children: [
            /* @__PURE__ */ jsx("span", { children: message.role === "user" ? "\uB098" : lead?.name || "Lead" }),
            message.status ? /* @__PURE__ */ jsx("span", { className: "bc-status", children: message.recoveryPending ? "\uC2E4\uD589 \uC0C1\uD0DC \uD655\uC778 \uC911" : { running: "\uC791\uC5C5 \uC911", cancelling: "\uC911\uC9C0 \uD655\uC778 \uC911", cancelled: "\uC911\uC9C0 \uC644\uB8CC", failed: "\uC2E4\uD328", interrupted: "\uC911\uB2E8\uB428", completed: "\uC644\uB8CC" }[message.status] }) : null
          ] }),
          /* @__PURE__ */ jsx("div", { className: `bc-message-body ${message.status === "failed" ? "bc-error" : ""}`, children: message.content || (message.status === "running" ? "\uB2F5\uBCC0\uC744 \uC900\uBE44\uD558\uACE0 \uC788\uC2B5\uB2C8\uB2E4\u2026" : "") }),
          message.attachments?.map((file, index) => /* @__PURE__ */ jsxs("details", { children: [
            /* @__PURE__ */ jsx("summary", { children: file.name }),
            /* @__PURE__ */ jsx("pre", { children: file.content })
          ] }, index)),
          message.steps?.length ? /* @__PURE__ */ jsxs("details", { children: [
            /* @__PURE__ */ jsxs("summary", { children: [
              "\uC2E4\uD589 \uAE30\uB85D ",
              message.steps.length
            ] }),
            /* @__PURE__ */ jsx("pre", { children: message.steps.map((step) => step.text).join("\n") })
          ] }) : null
        ] }, message.id)),
        /* @__PURE__ */ jsx("div", { ref: end })
      ] }),
      /* @__PURE__ */ jsxs("form", { className: "bc-composer", onSubmit: submit, children: [
        /* @__PURE__ */ jsxs("div", { className: "bc-compose-box", children: [
          files.length ? /* @__PURE__ */ jsx("div", { className: "bc-file-chips", children: files.map((file, index) => /* @__PURE__ */ jsxs("span", { className: "bc-file-chip", children: [
            file.name,
            /* @__PURE__ */ jsx("button", { type: "button", title: "\uCCA8\uBD80 \uC81C\uAC70", "aria-label": `${file.name} \uCCA8\uBD80 \uC81C\uAC70`, onClick: () => setFiles(files.filter((_, i) => i !== index)), children: "x" })
          ] }, index)) }) : null,
          /* @__PURE__ */ jsx("textarea", { "aria-label": "Lead\uC5D0\uAC8C \uBA54\uC2DC\uC9C0", placeholder: lead ? `${lead.name}\uC5D0\uAC8C \uBA54\uC2DC\uC9C0` : "\uBA3C\uC800 Assistant\uB97C \uB4F1\uB85D\uD558\uC138\uC694", value: draft, maxLength: 2e4, disabled: busy || running || !lead, onChange: (event) => setDraft(event.target.value), onKeyDown: (event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.currentTarget.form.requestSubmit();
            }
          } }),
          /* @__PURE__ */ jsxs("div", { className: "bc-compose-tools", children: [
            /* @__PURE__ */ jsx("button", { type: "button", className: "bc-icon", title: "UTF-8 \uD14D\uC2A4\uD2B8 \uD30C\uC77C \uCCA8\uBD80", "aria-label": "\uD14D\uC2A4\uD2B8 \uD30C\uC77C \uCCA8\uBD80", disabled: busy || running, onClick: () => fileInput.current.click(), children: "+" }),
            /* @__PURE__ */ jsx("input", { className: "bc-hidden", ref: fileInput, type: "file", multiple: true, accept: ".txt,.md,.json,.js,.ts,.jsx,.tsx,.css,.html,.yaml,.yml,.csv", onChange: attach }),
            /* @__PURE__ */ jsxs("select", { "aria-label": "Lead \uC120\uD0DD", value: selectedLeadId, disabled: busy || running || Boolean(conversation), onChange: (event) => {
              setLeadId(event.target.value);
              setWorkers(workers.filter((id) => id !== event.target.value));
            }, children: [
              !agents.length ? /* @__PURE__ */ jsx("option", { value: "", children: "Lead \uC5C6\uC74C" }) : null,
              agents.map((agent) => /* @__PURE__ */ jsx("option", { value: agent.id, children: agent.name }, agent.id))
            ] }),
            /* @__PURE__ */ jsxs("span", { className: "bc-model", title: "\uC120\uD0DD\uD55C Agent\uC758 \uBAA8\uB378\xB7\uCD94\uB860 \uC124\uC815\uC744 \uC0AC\uC6A9\uD569\uB2C8\uB2E4", children: [
              lead?.model || lead?.adapterType || "",
              lead?.effort ? ` \xB7 ${lead.effort}` : ""
            ] }),
            /* @__PURE__ */ jsx("span", { className: "bc-spacer" }),
            running ? /* @__PURE__ */ jsx("button", { type: "button", className: "bc-button", title: "\uD604\uC7AC Lead \uC751\uB2F5\uB9CC \uC911\uC9C0", onClick: stopReply, disabled: busy || !activeMessage.runId, children: busy ? "\uC911\uC9C0 \uC694\uCCAD \uC911\u2026" : cancelling ? "\uC911\uC9C0 \uC7AC\uC2DC\uB3C4" : "\uC751\uB2F5 \uC911\uC9C0" }) : /* @__PURE__ */ jsx("button", { className: "bc-button primary", disabled: busy || !lead || !draft.trim() && !files.length, children: busy ? "\uC804\uC1A1 \uC911\u2026" : "\uBCF4\uB0B4\uAE30" })
          ] })
        ] }),
        notice ? /* @__PURE__ */ jsx("p", { className: "bc-notice bc-error", role: "alert", children: notice }) : null,
        !lead && !loading ? /* @__PURE__ */ jsx("p", { className: "bc-notice bc-muted", children: "\uC774 Workspace\uC5D0 \uC2E4\uD589 \uAC00\uB2A5\uD55C Assistant\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." }) : null
      ] })
    ] }),
    panel ? /* @__PURE__ */ jsxs("aside", { className: "bc-panel", "aria-label": "Builder \uC791\uC5C5 \uD328\uB110", children: [
      /* @__PURE__ */ jsx("div", { className: "bc-resizer", role: "separator", tabIndex: 0, "aria-label": "\uC791\uC5C5 \uD328\uB110 \uB108\uBE44", "aria-orientation": "vertical", "aria-valuemin": 260, "aria-valuemax": 440, "aria-valuenow": panelWidth, onPointerDown: resize, onKeyDown: (event) => {
        if (["ArrowLeft", "ArrowRight"].includes(event.key)) {
          event.preventDefault();
          setPanelWidth((width) => Math.max(260, Math.min(440, width + (event.key === "ArrowLeft" ? 20 : -20))));
        }
      } }),
      /* @__PURE__ */ jsxs("div", { className: "bc-panel-head", children: [
        /* @__PURE__ */ jsx("strong", { children: "\uC791\uC5C5" }),
        /* @__PURE__ */ jsx("button", { className: "bc-icon", "aria-label": "\uC791\uC5C5 \uD328\uB110 \uB2EB\uAE30", title: "\uC791\uC5C5 \uD328\uB110 \uB2EB\uAE30", onClick: () => setPanel(false), children: "x" })
      ] }),
      /* @__PURE__ */ jsx("h3", { children: "Lead" }),
      /* @__PURE__ */ jsxs("div", { className: "bc-person", children: [
        /* @__PURE__ */ jsx("span", { className: "bc-person-name", children: lead?.name || "\uC120\uD0DD \uD544\uC694" }),
        /* @__PURE__ */ jsx("small", { children: running ? "\uC791\uC5C5 \uC911" : "\uB300\uAE30" })
      ] }),
      /* @__PURE__ */ jsx("h3", { children: "Workers" }),
      agents.filter((agent) => agent.id !== selectedLeadId).map((agent) => /* @__PURE__ */ jsx("div", { className: "bc-person", children: /* @__PURE__ */ jsxs("label", { children: [
        /* @__PURE__ */ jsx("input", { type: "checkbox", disabled: busy || running, checked: selectedWorkers.includes(agent.id), onChange: (event) => changeWorkers(agent.id, event.target.checked) }),
        /* @__PURE__ */ jsx("span", { className: "bc-person-name", children: agent.name })
      ] }) }, agent.id)),
      agents.length < 2 ? /* @__PURE__ */ jsx("p", { children: "\uCD94\uAC00 Assistant\uB97C \uB4F1\uB85D\uD558\uBA74 Worker\uB85C \uC120\uD0DD\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." }) : null,
      conversation?.reports?.length ? /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("h3", { children: "Worker \uBCF4\uACE0" }),
        conversation.reports.map((report) => /* @__PURE__ */ jsxs("details", { className: "bc-evidence-item", children: [
          /* @__PURE__ */ jsxs("summary", { children: [
            agents.find((agent) => agent.id === report.workerId)?.name || "Worker",
            " \xB7 ",
            report.status
          ] }),
          /* @__PURE__ */ jsx("p", { children: report.objective }),
          /* @__PURE__ */ jsx("p", { children: report.content || "\uC2E4\uD589 \uC911" })
        ] }, report.id))
      ] }) : null,
      /* @__PURE__ */ jsx("h3", { children: "Preview" }),
      /* @__PURE__ */ jsx("button", { className: "bc-button", onClick: () => navigation.navigate("/company/settings/instance/plugins"), children: "\uD50C\uB7EC\uADF8\uC778 \uAC80\uD1A0 \uC5F4\uAE30" }),
      /* @__PURE__ */ jsxs("details", { className: "bc-evidence", children: [
        /* @__PURE__ */ jsxs("summary", { children: [
          "\uC81C\uC791 \uAE30\uB85D \xB7 Authoring projects (",
          sessions.length,
          ")"
        ] }),
        !sessions.length ? /* @__PURE__ */ jsx("p", { children: "No plugin project has been started in this Workspace." }) : null,
        [...sessions].reverse().map((session) => /* @__PURE__ */ jsxs("div", { className: "bc-evidence-item", children: [
          /* @__PURE__ */ jsx("strong", { children: session.displayName }),
          /* @__PURE__ */ jsx("span", { className: "bc-status", children: session.status }),
          session.events.slice(-8).map((event) => /* @__PURE__ */ jsxs("p", { children: [
            event.summary,
            event.evidence?.length ? ` \xB7 \uC99D\uAC70 ${event.evidence.length}` : ""
          ] }, event.id))
        ] }, session.id))
      ] }),
      /* @__PURE__ */ jsxs("details", { className: "bc-evidence", children: [
        /* @__PURE__ */ jsx("summary", { children: "Builder contract" }),
        /* @__PURE__ */ jsx("p", { children: "\uC81C\uC791 \uAE30\uB85D\uACFC \uAC80\uC99D \uACB0\uACFC\uB294 Workspace\uC5D0 \uC800\uC7A5\uD569\uB2C8\uB2E4. Preview\uB294 \uBCC4\uB3C4 \uACA9\uB9AC \uCC3D\uC5D0\uC11C \uD655\uC778\uD558\uBA70, \uC124\uCE58\xB7\uD65C\uC131\uD654\uB294 \uC124\uC815\uC5D0\uC11C \uAD00\uB9AC\uD569\uB2C8\uB2E4." })
      ] })
    ] }) : null
  ] });
}
export {
  PluginBuilderPage
};
