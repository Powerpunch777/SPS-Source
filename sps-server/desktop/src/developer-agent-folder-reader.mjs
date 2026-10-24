import { normalizeDeveloperContext } from "./developer-context-store.mjs";
import { assessDeveloperAgentFolder } from "./developer-agent-folder.mjs";

const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;

function normalizeInput(input) {
  if (!input || Object.getPrototypeOf(input) !== Object.prototype
    || Object.keys(input).length !== 2 || !Object.hasOwn(input, "context") || !Object.hasOwn(input, "agentId")
    || Object.values(Object.getOwnPropertyDescriptors(input)).some(field => !Object.hasOwn(field, "value"))
    || typeof input.agentId !== "string" || !UUID.test(input.agentId)) {
    throw new TypeError("A developer context and canonical Agent ID are required.");
  }
  return { context: normalizeDeveloperContext(input.context), agentId: input.agentId };
}

export async function readDeveloperAgentFolder(input, {
  assertOwner, resolveContext, getBinding, loadProjects, getAgent,
}) {
  assertOwner();
  const request = normalizeInput(input);
  const { context } = await resolveContext(request.context);
  const binding = await getBinding(context);
  const project = binding && (await loadProjects()).find(item => item.id === binding.projectId);
  if (!project) throw new Error("Connect an available developer project before checking the Lead folder.");

  const agent = await getAgent(request.agentId);
  const assessment = assessDeveloperAgentFolder({
    project, agent, companyId: context.companyId, agentId: request.agentId,
  });
  const current = await getBinding(context);
  if (current?.projectId !== binding.projectId || current?.updatedAt !== binding.updatedAt) {
    throw new Error("Developer project changed. Check the Lead folder again.");
  }
  assertOwner();
  return assessment;
}
