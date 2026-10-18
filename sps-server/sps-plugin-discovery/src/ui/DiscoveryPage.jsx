import { usePluginData } from "@sonparkserver/plugin-sdk/ui/bridge";

const styles = `
  .sps-builder { max-width: 1100px; margin: 0 auto; color: var(--foreground, #24272b); font: 14px/1.6 var(--font-sans, "Pretendard Variable", system-ui, sans-serif); letter-spacing: 0; }
  .sps-builder-header { padding: 8px 0 18px; }
  .sps-builder-header h1 { margin: 0; font-size: 22px; }
  .sps-builder-header p { max-width: 760px; margin: 8px 0 0; color: var(--muted-foreground, #667085); }
  .sps-builder-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; }
  .sps-builder-card { min-width: 0; border: 1px solid var(--border, #e2e2e2); border-radius: 8px; background: var(--background, #fff); overflow: hidden; }
  .sps-builder-card-head { padding: 14px 16px; border-bottom: 1px solid var(--border, #e3e8f0); }
  .sps-builder-card-head strong { display: block; font-size: 14px; }
  .sps-builder-card-head span { display: block; margin-top: 3px; color: var(--muted-foreground, #667085); font-size: 12px; }
  summary.sps-builder-card-head { cursor: pointer; color: var(--muted-foreground, #626b75); }
  summary.sps-builder-card-head strong { display: inline; margin-left: 6px; font-weight: 500; }
  .sps-builder-empty { padding: 22px 16px; color: var(--muted-foreground, #667085); }
  .sps-builder-session { padding: 13px 16px; border-bottom: 1px solid var(--border, #e3e8f0); }
  .sps-builder-session:last-child { border-bottom: 0; }
  .sps-builder-session-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
  .sps-builder-session-head strong { overflow-wrap: anywhere; }
  .sps-builder-status { flex: none; border-radius: 6px; background: var(--muted, #f4f4f4); color: var(--foreground, #24272b); padding: 2px 7px; font-size: 12px; font-weight: 500; }
  .sps-builder-session p { margin: 5px 0 0; color: var(--muted-foreground, #667085); font-size: 12px; overflow-wrap: anywhere; }
  .sps-builder-event { margin-top: 10px; padding-left: 10px; border-left: 2px solid #d9e3f1; }
  .sps-builder-event strong { display: block; font-size: 12px; text-transform: capitalize; }
  .sps-builder-event span { display: block; color: var(--muted-foreground, #667085); font-size: 11px; overflow-wrap: anywhere; }
  .sps-builder-contract { display: grid; gap: 10px; padding: 16px; }
  .sps-builder-step { display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 9px; align-items: start; }
  .sps-builder-step-number { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 6px; background: var(--muted, #f4f4f4); color: var(--foreground, #24272b); font-weight: 600; font-size: 12px; }
  .sps-builder-step strong { display: block; }
  .sps-builder-step span { display: block; margin-top: 2px; color: var(--muted-foreground, #667085); font-size: 12px; }
  .sps-builder-note { margin: 0 16px 16px; padding: 10px 11px; border-radius: 6px; background: var(--muted, #f4f4f4); color: var(--muted-foreground, #626b75); font-size: 12px; }
  @media (max-width: 820px) { .sps-builder-grid { grid-template-columns: 1fr; } }
`;

function eventLabel(event) {
  return `${event?.type ?? "event"} - ${event?.status ?? "unknown"}`;
}

export function PluginBuilderPage({ context }) {
  const { data, loading, error } = usePluginData("plugin-builder-workspace", { companyId: context.companyId });
  const sessions = Array.isArray(data?.authoringSessions) ? [...data.authoringSessions].reverse() : [];

  return (
    <div className="sps-builder">
      <style>{styles}</style>
      <header className="sps-builder-header">
        <h1>Plugin Builder</h1>
        <p>Create an external SPS plugin project, record the work performed by an approved Agent, inspect build evidence, preview it in isolation, and produce a package candidate.</p>
      </header>
      <div className="sps-builder-grid">
        <main className="sps-builder-card">
          <div className="sps-builder-card-head">
            <strong>Authoring projects</strong>
            <span>Projects are kept outside SPS. This page shows only the append-only authoring evidence stored for this Workspace.</span>
          </div>
          {loading ? <div className="sps-builder-empty">Loading authoring projects...</div> : null}
          {error ? <div className="sps-builder-empty">Could not load authoring projects: {error.message}</div> : null}
          {!loading && !error && sessions.length === 0 ? <div className="sps-builder-empty">No plugin project has been started in this Workspace.</div> : null}
          {sessions.map((session) => (
            <section className="sps-builder-session" key={session.id}>
              <div className="sps-builder-session-head">
                <strong>{session.displayName}</strong>
                <span className="sps-builder-status">{session.status}</span>
              </div>
              <p>{session.pluginId}</p>
              {session.goal ? <p>{session.goal}</p> : null}
              {session.events.slice(-8).map((event) => (
                <div className="sps-builder-event" key={event.id}>
                  <strong>{eventLabel(event)}</strong>
                  <span>{event.summary}</span>
                  {event.evidence?.length ? <span>{event.evidence.length} evidence item(s)</span> : null}
                </div>
              ))}
            </section>
          ))}
        </main>
        <details className="sps-builder-card">
          <summary className="sps-builder-card-head">
            <strong>Builder contract</strong>
          </summary>
          <div className="sps-builder-contract">
            {["Create an external project", "Record authoring steps and evidence", "Inspect build, validation, and tests", "Open isolated Preview", "Create a package candidate"].map((label, index) => (
              <div className="sps-builder-step" key={label}>
                <span className="sps-builder-step-number">{index + 1}</span>
                <div><strong>{label}</strong><span>Recorded per Workspace in the append-only ledger.</span></div>
              </div>
            ))}
          </div>
          <p className="sps-builder-note">Installation, activation, update, disable, rollback, and removal remain Host lifecycle operations in Settings. Builder never invokes them.</p>
        </details>
      </div>
    </div>
  );
}
