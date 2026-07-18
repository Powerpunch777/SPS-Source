import { randomUUID } from "node:crypto";
import postgres from "../../external/sps-core/packages/db/node_modules/postgres/src/index.js";

const DATABASE_URL = process.env.PAPERCLIP_DATABASE_URL
  ?? "postgres://paperclip:paperclip@127.0.0.1:54329/paperclip";
const APPLY = process.argv.includes("--apply");
const PROJECT_ID = "7e78ae0e-cc72-4e1e-a219-f1cf0e271b51";
const CMP_162_ID = "5ac1dedd-a6ef-41e6-92da-acdce2e5b498";
const CMP_163_ID = "f88d701f-776f-4245-8798-7b3d9490aea5";
const CMP_164_ID = "6556ac40-99e5-457f-97ad-16632a82057d";
const CMP_163_REPORT_ID = "819d1279-8567-45b9-a705-a78c7af9c0be";
const IMAGE_WORKER_ID = "df437a20-1e6f-450f-89d6-895ab6a59425";
const DOCUMENT_WORKER_ID = "12378369-9f04-4ad7-a5d5-8774aa4238dd";
const ERRONEOUS_INTERACTION_IDS = [
  "8e240684-0ed0-40dc-8799-26df835ee9cc",
  "906a5a7d-7ffc-409f-9d5c-fcb833faef7f",
];
const ERRONEOUS_COMMENT_IDS = [
  "51656b1b-f1af-4e3a-8bea-ca5192ea5033",
  "0dac93b4-5df1-4ed3-90a7-74e626854866",
  "d4811a00-93df-4590-8bf7-a1ab906d5e03",
  "5c83b99e-d74b-462c-a93d-e39a062a0a20",
  "eec7f575-3e88-47c2-8a89-1d0a44f95e82",
];
const OPERATIONAL_AGENT_NAMES = [
  "Code Worker",
  "Designer",
  "Document Worker",
  "Image Worker",
  "Manager",
  "QA Worker",
  "Voice Worker",
  "박정훈-CTO 2",
  "손영하-CTO",
];
const TASK_ROOM_EXECUTION_POLICY = {
  mode: "normal",
  commentRequired: true,
  stages: [],
  failure: {
    automaticRetry: true,
    preserveAssignee: true,
    wakeRecoveryOwner: false,
  },
};
const DURABLE_JSON_PREFIX = "paperclip-room-json:v1:";

function parseState(body) {
  if (typeof body !== "string" || body.length === 0) return null;
  const source = body.startsWith(DURABLE_JSON_PREFIX)
    ? Buffer.from(body.slice(DURABLE_JSON_PREFIX.length).trim(), "base64").toString("utf8")
    : body;
  return JSON.parse(source);
}

function serializeState(state) {
  return `${DURABLE_JSON_PREFIX}${Buffer.from(JSON.stringify(state), "utf8").toString("base64")}\n`;
}

function taskReportFingerprint(body) {
  const text = String(body || "").replace(/\s+/g, " ").trim();
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${text.length}:${(hash >>> 0).toString(16)}`;
}

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

const sql = postgres(DATABASE_URL, { max: 1 });

try {
  const agents = await sql`
    select id, name, status
    from agents
    where name = any(${OPERATIONAL_AGENT_NAMES})
    order by name
  `;
  invariant(agents.length === OPERATIONAL_AGENT_NAMES.length, "Operational Agent set does not match the expected company roster.");
  invariant(agents.every((agent) => agent.status === "paused"), "All operational Agents must be paused before repair.");

  const activeRuns = await sql`
    select id, status
    from heartbeat_runs
    where status = any(${["queued", "running", "scheduled_retry"]})
  `;
  const activeWakeups = await sql`
    select id, status
    from agent_wakeup_requests
    where status = any(${["queued", "claimed"]})
  `;
  invariant(activeRuns.length === 0, `Refusing repair while ${activeRuns.length} heartbeat Run(s) are active.`);
  invariant(activeWakeups.length === 0, `Refusing repair while ${activeWakeups.length} Wake request(s) are active.`);

  const taskRows = await sql`
    select
      i.id,
      i.identifier,
      i.status,
      i.assignee_agent_id,
      d.id as document_id,
      d.company_id,
      d.title as document_title,
      d.format as document_format,
      d.latest_body,
      d.latest_revision_number
    from issues i
    join issue_documents link on link.issue_id = i.id
    join documents d on d.id = link.document_id
    where i.project_id = ${PROJECT_ID}
      and link.key = 'task_room_state'
    order by i.issue_number
  `;
  const taskRooms = taskRows.map((row) => ({ ...row, state: parseState(row.latest_body) }))
    .filter((row) => row.state?.kind === "task_room");
  invariant(taskRooms.length >= 7, "Too few Task Room states were found; refusing a partial migration.");

  const targetIssues = await sql`
    select id, identifier, status, assignee_agent_id
    from issues
    where id = any(${[CMP_162_ID, CMP_163_ID, CMP_164_ID]})
    order by identifier
  `;
  invariant(targetIssues.length === 3, "CMP-162, CMP-163, and CMP-164 must all exist before repair.");

  const reportRows = await sql`
    select id, issue_id, author_agent_id, body
    from issue_comments
    where id = ${CMP_163_REPORT_ID}
  `;
  const report = reportRows[0];
  invariant(report?.issue_id === CMP_163_ID, "The selected CMP-163 report comment belongs to another Task.");
  invariant(report?.author_agent_id === IMAGE_WORKER_ID, "The selected CMP-163 report was not written by Image Worker.");
  invariant(report?.body?.startsWith("## SPS Final Report\n"), "The selected CMP-163 report is not a valid Final Report.");

  const assignmentRepairs = taskRooms
    .filter((row) => ["in_review", "blocked"].includes(row.status))
    .filter((row) => row.state.workerAgentId && row.assignee_agent_id !== row.state.workerAgentId)
    .map((row) => ({
      identifier: row.identifier,
      from: row.assignee_agent_id,
      to: row.state.workerAgentId,
    }));
  const preview = {
    apply: APPLY,
    projectId: PROJECT_ID,
    migratedTaskRoomPolicies: taskRooms.length,
    assignmentRepairs,
    cancelledIssues: ["CMP-162", "CMP-164"],
    restoredIssue: {
      identifier: "CMP-163",
      status: "in_review",
      assigneeAgentId: IMAGE_WORKER_ID,
      reportCommentId: CMP_163_REPORT_ID,
      reportFingerprint: taskReportFingerprint(report.body),
    },
    cancelledInteractions: ERRONEOUS_INTERACTION_IDS,
    hiddenRecoveryComments: ERRONEOUS_COMMENT_IDS,
  };

  if (!APPLY) {
    console.log(JSON.stringify(preview, null, 2));
    process.exitCode = 2;
  } else {
    await sql.begin(async (tx) => {
      for (const taskRoom of taskRooms) {
        await tx`
          update issues
          set execution_policy = ${tx.json(TASK_ROOM_EXECUTION_POLICY)}, updated_at = now()
          where id = ${taskRoom.id}
        `;
        if (
          ["in_review", "blocked"].includes(taskRoom.status)
          && taskRoom.state.workerAgentId
          && taskRoom.assignee_agent_id !== taskRoom.state.workerAgentId
        ) {
          await tx`
            update issues
            set assignee_agent_id = ${taskRoom.state.workerAgentId}, assignee_user_id = null, updated_at = now()
            where id = ${taskRoom.id}
          `;
        }
      }

      await tx`
        update issues
        set
          status = 'cancelled',
          assignee_agent_id = ${DOCUMENT_WORKER_ID},
          assignee_user_id = null,
          checkout_run_id = null,
          execution_run_id = null,
          execution_state = null,
          cancelled_at = coalesce(cancelled_at, now()),
          updated_at = now()
        where id = ${CMP_162_ID}
      `;
      await tx`
        update issues
        set
          status = 'cancelled',
          assignee_agent_id = null,
          assignee_user_id = null,
          checkout_run_id = null,
          execution_run_id = null,
          execution_state = null,
          cancelled_at = coalesce(cancelled_at, now()),
          updated_at = now()
        where id = ${CMP_164_ID}
      `;
      await tx`
        update issues
        set
          status = 'in_review',
          assignee_agent_id = ${IMAGE_WORKER_ID},
          assignee_user_id = null,
          checkout_run_id = null,
          execution_run_id = null,
          execution_state = null,
          cancelled_at = null,
          updated_at = now()
        where id = ${CMP_163_ID}
      `;

      for (const interactionId of ERRONEOUS_INTERACTION_IDS) {
        await tx`
          update issue_thread_interactions
          set
            status = 'cancelled',
            continuation_policy = 'none',
            result = ${tx.json({ version: 1, outcome: "cancelled", reason: "Removed during Workplane routing repair." })},
            resolved_at = coalesce(resolved_at, now()),
            updated_at = now()
          where id = ${interactionId} and status = 'pending'
        `;
      }
      for (const commentId of ERRONEOUS_COMMENT_IDS) {
        await tx`
          update issue_comments
          set
            deleted_at = coalesce(deleted_at, now()),
            deleted_by_type = 'user',
            deleted_by_user_id = 'local-workplane-repair',
            updated_at = now()
          where id = ${commentId} and issue_id = ${CMP_163_ID}
        `;
      }

      const cmp163TaskRoom = taskRooms.find((row) => row.id === CMP_163_ID);
      invariant(cmp163TaskRoom, "CMP-163 Task Room state is missing.");
      const nextState = structuredClone(cmp163TaskRoom.state);
      nextState.workerAgentId = IMAGE_WORKER_ID;
      const reportFingerprint = taskReportFingerprint(report.body);
      const reviewNeedsRepair = nextState.review?.required !== "owning_agent"
        || nextState.review?.status !== "owner_review_requested"
        || nextState.review?.workerReportCommentId !== CMP_163_REPORT_ID
        || nextState.review?.workerReportFingerprint !== reportFingerprint
        || nextState.ownerNotification !== undefined;
      nextState.review = {
        ...(nextState.review ?? {}),
        required: "owning_agent",
        status: "owner_review_requested",
        workerReportCommentId: CMP_163_REPORT_ID,
        workerReportFingerprint: reportFingerprint,
        updatedAt: reviewNeedsRepair ? new Date().toISOString() : nextState.review?.updatedAt,
      };
      delete nextState.ownerNotification;
      const nextBody = serializeState(nextState);
      if (nextBody !== cmp163TaskRoom.latest_body) {
        const revisionId = randomUUID();
        const revisionNumber = Number(cmp163TaskRoom.latest_revision_number) + 1;
        await tx`
          insert into document_revisions (
            id, company_id, document_id, revision_number, title, format, body,
            change_summary, created_by_user_id, created_at
          ) values (
            ${revisionId}, ${cmp163TaskRoom.company_id}, ${cmp163TaskRoom.document_id},
            ${revisionNumber}, ${cmp163TaskRoom.document_title}, ${cmp163TaskRoom.document_format},
            ${nextBody}, 'Repair Worker report routing after generic recovery interference',
            'local-workplane-repair', now()
          )
        `;
        await tx`
          update documents
          set
            latest_body = ${nextBody},
            latest_revision_id = ${revisionId},
            latest_revision_number = ${revisionNumber},
            updated_by_agent_id = null,
            updated_by_user_id = 'local-workplane-repair',
            updated_at = now()
          where id = ${cmp163TaskRoom.document_id}
        `;
      }
    });

    console.log(JSON.stringify({ ...preview, applied: true }, null, 2));
  }
} finally {
  await sql.end();
}
