import { defineSpsPlatformContract } from "@sonparkserver/plugin-sdk/platform";
import { defineSpsPlugin, runSpsWorker } from "@sonparkserver/plugin-sdk/worker";
import { createBuilderChat } from "./builder-chat.js";
import manifest from "./manifest.js";
import { createDiscoveryAuthoringService } from "./authoring.js";

const authoringServices = new WeakMap();
const chatServices = new WeakMap();
function chatFor(platform) {
  let chat = chatServices.get(platform.state);
  if (!chat) { chat = createBuilderChat(platform); chatServices.set(platform.state, chat); }
  return chat;
}

function authoringFor(platform) {
  let authoring = authoringServices.get(platform);
  if (!authoring) {
    authoring = createDiscoveryAuthoringService({ state: platform.state });
    authoringServices.set(platform, authoring);
  }
  return authoring;
}

function safeTool(name, handler) {
  return async (params, runContext, platform) => {
    try {
      return await handler(authoringFor(platform), params, runContext);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`SPS Plugin Builder tool failed (${name}): ${message}\n`);
      return { error: "plugin_builder_unavailable", content: message };
    }
  };
}

async function workspaceView(authoring, params) {
  const sessions = await authoring.load(params.companyId);
  return { authoringSessions: sessions, authoringSessionCount: sessions.length, activeAuthoringSession: sessions.at(-1) ?? null };
}

const declarations = new Map(manifest.tools.map((tool) => [tool.name, tool]));

function tool(name, handler) {
  const declaration = declarations.get(name);
  if (!declaration) throw new Error(`Plugin Builder manifest is missing tool '${name}'.`);
  return {
    name,
    declaration: {
      displayName: declaration.displayName,
      description: declaration.description,
      parametersSchema: declaration.parametersSchema,
    },
    handler: safeTool(name, handler),
  };
}

const platform = defineSpsPlatformContract({
  capabilities: ["agent.tools.register", "plugin.state.read", "plugin.state.write", "agents.read", "agent.sessions.create", "agent.sessions.list", "agent.sessions.send", "agent.sessions.read", "agent.sessions.cancel"],
  tools: [
    tool("create-sps-plugin-project", async (authoring, params, runContext) => {
      const session = await authoring.createProject(params, runContext);
      return {
        content: `Opened SPS plugin authoring session ${session.id} for ${session.pluginId}. Create project files only with the Agent's approved workspace tools, then attach relative evidence with the authoring tools. No plugin lifecycle action was taken.`,
        data: { authoringSessionId: session.id, pluginId: session.pluginId, displayName: session.displayName, status: session.status },
      };
    }),
    tool("run-sps-authoring-step", async (authoring, params, runContext) => {
      const session = await authoring.runStep(params, runContext);
      return {
        content: `Recorded the authoring step for ${session.pluginId}. This evidence is advisory until Desktop reruns the mandatory build, validation, and test gates.`,
        data: { authoringSessionId: session.id, status: session.status, event: session.events.at(-1) },
      };
    }),
    tool("inspect-sps-plugin-build", async (authoring, params, runContext) => {
      const session = await authoring.inspectBuild(params, runContext);
      return {
        content: `Attached build evidence for ${session.pluginId}. Open Desktop Developer Mode to reproduce the three mandatory gates before Preview.`,
        data: { authoringSessionId: session.id, status: session.status, event: session.events.at(-1) },
      };
    }),
    tool("open-sps-plugin-preview", async (authoring, params, runContext) => {
      const session = await authoring.requestPreview(params, runContext);
      return {
        content: `Recorded an isolated Preview request for ${session.pluginId}. The Host must connect the project and pass Desktop's build, validation, and test gates before Preview opens.`,
        data: { authoringSessionId: session.id, status: session.status, event: session.events.at(-1) },
      };
    }),
    tool("create-sps-plugin-package", async (authoring, params, runContext) => {
      const session = await authoring.createPackage(params, runContext);
      return {
        content: `Recorded the SPS package candidate for ${session.pluginId}. Host lifecycle state was not changed.`,
        data: { authoringSessionId: session.id, pluginId: session.pluginId, status: session.status, event: session.events.at(-1) },
      };
    }),
    ...[["builder-delegate-worker", "delegate"], ["builder-worker-result", "report"]].map(([name, method]) => ({
      name, declaration: declarations.get(name),
      handler: async (params, runContext, platform) => {
        const data = await chatFor(platform)[method](runContext.companyId, params, runContext);
        return { content: JSON.stringify(data), data };
      },
    })),
  ],
  data: [{
    key: "plugin-builder-workspace",
    handler: async (params, invocationPlatform) => ({ ...await workspaceView(authoringFor(invocationPlatform), params), ...await chatFor(invocationPlatform).view(params.companyId) }),
  }],
  actions: [["builder-create", "create"], ["builder-team", "team"], ["builder-send", "send"], ["builder-stop", "stop"]].map(([key, method]) => ({
    key, handler: async (params, platform) => {
      if (platform.actor.type !== "user" || params.companyId && params.companyId !== platform.companyId) throw new Error("An authenticated Workspace user is required.");
      return chatFor(platform)[method](platform.companyId, params);
    },
  })),
});

const plugin = defineSpsPlugin({ platform, health() { return { status: "ok", message: "Plugin Builder chat is ready." }; } });
export default plugin;
runSpsWorker(plugin);
