import { createElement as h, useEffect, useState } from "react";
import { useHostContext, usePluginAction, usePluginData } from "@sonparkserver/plugin-sdk/ui/bridge";

const buttonStyle = { border: "1px solid var(--border, #ddd)", borderRadius: 6, padding: "8px 12px", cursor: "pointer" };

export function ChecklistPage() {
  const { companyId } = useHostContext();
  const result = usePluginData("checklist");
  const add = usePluginAction("checklist.add");
  const toggle = usePluginAction("checklist.toggle");
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => { setText(""); setError(null); }, [companyId]);

  async function perform(action, params, clear = false) {
    setPending(true);
    setError(null);
    try {
      await action(params);
      if (clear) setText("");
      result.refresh();
    } catch {
      setError("The change could not be saved. Refresh before trying again.");
    } finally {
      setPending(false);
    }
  }

  const items = result.data?.items ?? [];
  return h("section", { "data-testid": "no-ai-checklist", style: { maxWidth: 760, margin: "0 auto", padding: 24 } },
    h("header", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" } },
      h("h1", { style: { fontSize: 24, margin: "0 0 16px" } }, "Workspace checklist"),
      h("button", { id: "checklist-refresh", type: "button", style: buttonStyle, disabled: pending || result.loading, onClick: result.refresh }, "Refresh")),
    h("form", { onSubmit: event => { event.preventDefault(); if (!pending && text.trim()) void perform(add, { text }, true); },
      style: { display: "flex", gap: 8, marginBottom: 20 } },
      h("input", { id: "checklist-text", "aria-label": "New checklist item", value: text, maxLength: 200,
        disabled: pending, onChange: event => setText(event.target.value),
        style: { flex: 1, minWidth: 0, border: "1px solid var(--border, #ddd)", borderRadius: 6, padding: 10 } }),
      h("button", { id: "checklist-add", type: "submit", style: buttonStyle, disabled: pending || !text.trim() || result.loading }, "Add")),
    result.loading ? h("p", { role: "status" }, "Loading checklist...") : null,
    result.error || error ? h("p", { role: "alert", "data-checklist-bridge-error": result.error
      ? (["WORKER_UNAVAILABLE", "TIMEOUT"].includes(result.error.code) ? result.error.code : "OTHER") : undefined },
    error ?? "The checklist could not be loaded. Try refreshing.") : null,
    !result.loading && !result.error && items.length === 0 ? h("p", { "data-testid": "checklist-empty" }, "No items yet.") : null,
    h("ul", { style: { listStyle: "none", padding: 0, margin: 0 } }, ...items.map(item =>
      h("li", { key: item.id, style: { padding: "12px 0", borderBottom: "1px solid var(--border, #ddd)" } },
        h("label", { style: { display: "flex", alignItems: "center", gap: 12 } },
          h("input", { type: "checkbox", checked: item.completed, disabled: pending || result.loading,
            "data-checklist-id": item.id, "aria-label": `Complete ${item.text}`,
            onChange: event => void perform(toggle, { id: item.id, completed: event.target.checked }) }),
          h("span", { style: { overflowWrap: "anywhere", textDecoration: item.completed ? "line-through" : "none" } }, item.text))))),
    h("footer", { style: { display: "flex", gap: 20, marginTop: 24, fontSize: 13, color: "var(--muted-foreground, #666)" } },
      h("span", { "data-testid": "checklist-events" }, `Events: ${result.data?.eventCount ?? 0}`),
      h("span", { "data-testid": "checklist-jobs" }, `Jobs: ${result.data?.jobCount ?? 0}`)));
}
