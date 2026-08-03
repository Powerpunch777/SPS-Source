export function createRoomMemoryRuntime(deps) {
  const {
    asRecord,
    textParam,
    listParam,
    parseState,
    serializeState,
    now,
    isAgentRoom,
    getRoomDocumentDirect,
    putRoomDocument,
    upsertRoomDocument,
    loopbackSPSApiUrl,
    spsDesktopAccessHeaders,
    roomCheckpointKey,
    roomNativeCompactionsKey,
    lifecycleReconcileKey,
    memoryScopes,
    localMemorySidecarConfigUrl,
    readFileSync,
    activeThreadContexts,
    manualCodexCompactionThreads,
    recordedNativeCompactionEvents,
    nativeCompactionLocks,
  } = deps;

  function roomMemoryRuntime() {
    let config;
    try {
      config = JSON.parse(readFileSync(localMemorySidecarConfigUrl, "utf8"));
    } catch {
      throw new Error("The local Memory Sidecar companion configuration is unavailable.");
    }
    const host = String(config?.server?.host || "127.0.0.1").trim();
    const port = Number(config?.server?.port || 3188);
    const baseUrl = new URL(`http://${host}:${port}`);
    if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(baseUrl.hostname)) {
      throw new Error("The local Memory Sidecar must use a loopback address.");
    }
    return {
      baseUrl,
      token: String(process.env.MEMORY_SIDECAR_TOKEN || config?.security?.token || "").trim()
    };
  }

  async function fetchRoomMemory(pathname, options = {}) {
    const runtime = roomMemoryRuntime();
    const url = new URL(pathname, runtime.baseUrl);
    for (const [key, value] of Object.entries(asRecord(options.searchParams))) {
      if (value !== undefined && value !== null && String(value).trim() !== "") url.searchParams.set(key, String(value));
    }
    const headers = { accept: "application/json", ...asRecord(options.headers) };
    if (runtime.token) headers["x-sidecar-token"] = runtime.token;
    const response = await fetch(url, { method: options.method ?? "GET", headers, body: options.body });
    const body = await response.text();
    let data = null;
    try {
      data = body ? JSON.parse(body) : null;
    } catch {
      throw new Error("The Memory Sidecar returned an invalid response.");
    }
    if (!response.ok) throw new Error(`Memory Sidecar request failed (HTTP ${response.status}).`);
    return data;
  }

  async function searchRoomMemory(roomContext, query, requestedScopes, limit) {
    const scopes = requestedScopes.length ? requestedScopes : ["company", "project", "agent"];
    const selectedScopes = [...new Set(scopes.filter((scope) => memoryScopes.has(scope)))];
    if (!selectedScopes.length) throw new Error("Choose one or more of company, project, or agent memory scopes.");
    const itemsById = new Map();
    for (const scope of selectedScopes) {
      if (scope === "project" && !roomContext.projectId) continue;
      const searchParams = { q: query, scope, companyId: roomContext.companyId, limit };
      if (scope === "project") searchParams.projectId = roomContext.projectId;
      if (scope === "agent") searchParams.agentId = roomContext.agentId;
      const result = await fetchRoomMemory("/memory/search", { searchParams });
      for (const item of Array.isArray(result?.items) ? result.items : []) itemsById.set(item.id, item);
    }
    return [...itemsById.values()]
      .sort((left, right) => Number(right.score || 0) - Number(left.score || 0))
      .slice(0, limit);
  }

  async function proposeRoomMemory(roomContext, input) {
    const content = textParam(input, "content");
    const scope = textParam(input, "scope", "project") || "project";
    if (!content || content.length > 4000) throw new Error("Memory candidate content must be between 1 and 4000 characters.");
    if (!new Set(["company", "project", "agent", "task", "artifact", "user"]).has(scope)) throw new Error("Invalid memory candidate scope.");
    const candidate = await fetchRoomMemory("/memory/candidates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content,
        scope,
        type: textParam(input, "type", "learning") || "learning",
        tags: listParam(input, "tags").slice(0, 12),
        companyId: roomContext.companyId,
        projectId: roomContext.projectId ?? null,
        agentId: roomContext.agentId,
        issueId: roomContext.issueId,
        source: { kind: "room_chat", roomIssueId: roomContext.issueId, agentName: roomContext.agentName }
      })
    });
    return candidate?.candidate ?? null;
  }

  async function reconcileRoomMemoryLifecycle(ctx) {
    const summary = { companies: 0, rooms: 0, checkpointsPublished: 0, compactionsPublished: 0, failed: 0 };
    if (!ctx.memory?.publishLifecycle) return summary;
    const companies = await ctx.companies.list({ limit: 200 });
    for (const company of companies) {
      if (!company?.id) continue;
      summary.companies += 1;
      const projects = await ctx.projects.list({ companyId: company.id, limit: 200 });
      for (const project of projects) {
        const issues = await ctx.issues.list({ companyId: company.id, projectId: project.id, limit: 500 });
        for (const room of issues) {
          if (!isAgentRoom(room)) continue;
          summary.rooms += 1;
          try {
            const document = await ctx.issues.documents.get(room.id, roomCheckpointKey, company.id);
            const checkpoints = parseState(document?.body);
            const latest = Array.isArray(checkpoints) ? checkpoints.at(-1) : null;
            const version = Number(latest?.version);
            if (!Number.isInteger(version) || version < 1) continue;
            const markerScope = { scopeKind: "issue", scopeId: room.id, stateKey: lifecycleReconcileKey };
            const marker = await ctx.state.get(markerScope);
            const deliveredVersion = Number(asRecord(marker)?.checkpointVersion ?? 0);
            if (deliveredVersion >= version) continue;
            await publishRoomMemoryLifecycle(ctx, company.id, room.id, "room.checkpoint", latest);
            summary.checkpointsPublished += 1;
            if (typeof latest.compactedAt === "string" && latest.compactedAt) {
              await publishRoomMemoryLifecycle(ctx, company.id, room.id, "room.compacted", latest);
              summary.compactionsPublished += 1;
            }
            await ctx.state.set(markerScope, { checkpointVersion: version, reconciledAt: now() });
          } catch (error) {
            summary.failed += 1;
            ctx.logger?.warn?.("Room memory lifecycle reconciliation failed.", {
              issueId: room.id,
              message: error instanceof Error ? error.message : String(error)
            });
          }
        }
      }
    }
    return summary;
  }

  async function appendCheckpointOutsideInvocation(apiUrl, issueId, checkpoint) {
    const document = await getRoomDocumentDirect(apiUrl, issueId, roomCheckpointKey);
    let checkpoints = parseState(document?.body);
    if (!Array.isArray(checkpoints)) checkpoints = [];
    checkpoints.push(checkpoint);
    return putRoomDocument(apiUrl, {
      issueId,
      key: roomCheckpointKey,
      body: serializeState(checkpoints),
      title: "Room checkpoints",
      format: "markdown",
      baseRevisionId: document?.latestRevisionId ?? null,
      changeSummary: "Append Room compact checkpoint"
    });
  }

  function nativeCompactionEventId(message) {
    const params = asRecord(message?.params);
    const threadId = textParam(params, "threadId");
    const turnId = textParam(params, "turnId");
    return threadId && turnId ? `${threadId}:${turnId}` : "";
  }

  async function appendNativeCompactionOutsideInvocation(apiUrl, issueId, event) {
    const document = await getRoomDocumentDirect(apiUrl, issueId, roomNativeCompactionsKey);
    let events = parseState(document?.body);
    if (!Array.isArray(events)) events = [];
    if (events.some((entry) => entry?.id === event.id)) return events;
    events.push(event);
    await putRoomDocument(apiUrl, {
      issueId,
      key: roomNativeCompactionsKey,
      body: serializeState(events.slice(-100)),
      title: "Native Codex compactions",
      format: "markdown",
      baseRevisionId: document?.latestRevisionId ?? null,
      changeSummary: "Record native Codex context compaction"
    });
    return events;
  }

  async function recordNativeCodexCompaction(ctx, message) {
    const itemCompaction = message?.method === "item/completed" && message?.params?.item?.type === "contextCompaction";
    const threadCompaction = message?.method === "thread/compacted";
    if (!itemCompaction && !threadCompaction) return false;
    const eventId = nativeCompactionEventId(message);
    const threadId = textParam(asRecord(message?.params), "threadId");
    const context = activeThreadContexts.get(threadId);
    if (!eventId || !context || manualCodexCompactionThreads.has(threadId) || recordedNativeCompactionEvents.has(eventId)) return false;
    recordedNativeCompactionEvents.add(eventId);
    const run = async () => {
      try {
        await appendNativeCompactionOutsideInvocation(context.spsApiUrl, context.issueId, {
          id: eventId,
          kind: "codex_native_auto",
          threadId,
          turnId: textParam(asRecord(message?.params), "turnId"),
          occurredAt: now(),
          note: "Codex compacted its internal context automatically. SPS conversation and checkpoints remain the durable Room record."
        });
        return true;
      } catch (error) {
        recordedNativeCompactionEvents.delete(eventId);
        ctx.logger?.warn?.("Could not record native Codex compaction.", {
          issueId: context.issueId,
          threadId,
          message: error instanceof Error ? error.message : String(error)
        });
        return false;
      }
    };
    const previous = nativeCompactionLocks.get(context.issueId) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(run);
    nativeCompactionLocks.set(context.issueId, next);
    try {
      return await next;
    } finally {
      if (nativeCompactionLocks.get(context.issueId) === next) nativeCompactionLocks.delete(context.issueId);
    }
  }

  async function appendCheckpoint(ctx, companyId, issueId, checkpoint) {
    const document = await ctx.issues.documents.get(issueId, roomCheckpointKey, companyId);
    let checkpoints = parseState(document?.body);
    if (!Array.isArray(checkpoints)) checkpoints = [];
    checkpoints.push(checkpoint);
    await upsertRoomDocument(ctx, {
      issueId,
      key: roomCheckpointKey,
      body: serializeState(checkpoints),
      companyId,
      title: "Room checkpoints",
      format: "markdown",
      changeSummary: "Append Room compact checkpoint"
    });
    await publishRoomMemoryLifecycle(ctx, companyId, issueId, "room.checkpoint", checkpoint);
  }

  async function publishRoomMemoryLifecycle(ctx, companyId, issueId, eventType, checkpoint) {
    if (!ctx.memory?.publishLifecycle) return;
    try {
      await ctx.memory.publishLifecycle({
        eventType,
        companyId,
        entityType: "room",
        entityId: issueId,
        roomId: issueId,
        idempotencyKey: `room:${issueId}:${eventType}:${checkpoint.version}`
      });
    } catch (error) {
      ctx.logger?.warn?.("Room memory lifecycle publication failed.", {
        issueId,
        eventType,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return {
    roomMemoryRuntime,
    fetchRoomMemory,
    searchRoomMemory,
    proposeRoomMemory,
    reconcileRoomMemoryLifecycle,
    appendCheckpointOutsideInvocation,
    nativeCompactionEventId,
    appendNativeCompactionOutsideInvocation,
    recordNativeCodexCompaction,
    appendCheckpoint,
    publishRoomMemoryLifecycle,
  };
}
