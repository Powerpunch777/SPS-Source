import { types as utilTypes } from "node:util";
import {
  redactDeveloperDiagnosticText,
  SPS_PLUGIN_DIAGNOSTIC_SCHEMA,
} from "./developer-diagnostics.mjs";

const MAX_EVENTS = 300;
const MAX_RECORD_KEYS = 32;
const MAX_MESSAGE_LENGTH = 1024;
const MAX_FEEDBACK_DIAGNOSTICS = 6;
const MAX_FEEDBACK_MESSAGE_LENGTH = 700;
const PROJECT_ID = /^dev-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EVENT_ID = /^desktop\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EVENT_CODE = /^[A-Z][A-Z0-9_]{1,119}$/;
const CANONICAL_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const GATES_START = "DEVELOPER_GATES_STARTED";
const PREVIEW_START = "PREVIEW_CANDIDATE_STARTED";
const GATE_FAILURE = /^DEVELOPER_(?:BUILD|VALIDATE|TEST)_(?:FAILED|UNAVAILABLE)$/;
const PREVIEW_FAILURES = new Set([
  "PREVIEW_CANDIDATE_FAILED",
  "PREVIEW_RUNTIME_START_FAILED",
  "PREVIEW_RENDERER_LOAD_FAILED",
]);

function invalidInput() {
  throw new TypeError("Developer validation feedback input is invalid.");
}

function readDataRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || utilTypes.isProxy(value)) invalidInput();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalidInput();
  const keys = Reflect.ownKeys(value);
  if (keys.length > MAX_RECORD_KEYS) invalidInput();
  const result = Object.create(null);
  for (const key of keys) {
    if (typeof key !== "string") invalidInput();
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) invalidInput();
    result[key] = descriptor.value;
  }
  return result;
}

function readEventList(events) {
  if (!Array.isArray(events) || utilTypes.isProxy(events)) invalidInput();
  const lengthDescriptor = Object.getOwnPropertyDescriptor(events, "length");
  const length = lengthDescriptor?.value;
  if (!Number.isInteger(length) || length < 0 || length > MAX_EVENTS) invalidInput();
  const result = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(events, String(index));
    if (!descriptor?.enumerable || !("value" in descriptor)) invalidInput();
    const event = readDataRecord(descriptor.value);
    const details = readDataRecord(event.details);
    if (event.schemaVersion !== SPS_PLUGIN_DIAGNOSTIC_SCHEMA
      || typeof event.id !== "string" || !EVENT_ID.test(event.id)
      || typeof event.code !== "string" || !EVENT_CODE.test(event.code)
      || typeof event.message !== "string" || event.message.length === 0 || event.message.length > MAX_MESSAGE_LENGTH
      || typeof event.occurredAt !== "string" || !CANONICAL_TIMESTAMP.test(event.occurredAt)
      || Number.isNaN(Date.parse(event.occurredAt)) || new Date(event.occurredAt).toISOString() !== event.occurredAt) {
      invalidInput();
    }
    if (Object.hasOwn(details, "projectId")
      && (typeof details.projectId !== "string" || !PROJECT_ID.test(details.projectId))) invalidInput();
    if (event.code === "DEVELOPER_GATES_FINISHED"
      && typeof details.success !== "boolean") invalidInput();
    result.push({
      id: event.id,
      code: event.code,
      message: event.message,
      occurredAt: event.occurredAt,
      details,
    });
  }
  return result;
}

function makeDiagnostics(events, kind, status) {
  let diagnostics = events.slice(0, -1);
  if (status === "failed") {
    const isFailure = kind === "gates"
      ? (event) => GATE_FAILURE.test(event.code)
        || (event.code === "DEVELOPER_GATES_FINISHED" && event.details.success === false)
      : (event) => PREVIEW_FAILURES.has(event.code);
    diagnostics = [
      ...diagnostics.filter(isFailure),
      ...diagnostics.filter((event) => !isFailure(event)),
    ];
  }
  return diagnostics
    .slice(0, MAX_FEEDBACK_DIAGNOSTICS)
    .map((event) => ({
      code: event.code,
      message: redactDeveloperDiagnosticText(event.message).slice(0, MAX_FEEDBACK_MESSAGE_LENGTH),
    }));
}

/**
 * Reduces scoped Developer Mode diagnostics to safe, generic build feedback.
 * This function performs no filesystem or other I/O.
 */
export function buildDeveloperValidationFeedback(input = {}) {
  const options = readDataRecord(input);
  if (Object.keys(options).length !== 2
    || !Object.hasOwn(options, "projectId")
    || !Object.hasOwn(options, "events")) invalidInput();
  const { projectId, events } = options;
  if (typeof projectId !== "string" || !PROJECT_ID.test(projectId)) invalidInput();
  const parsedEvents = readEventList(events);
  const projectEvents = parsedEvents.filter((event) => event.details.projectId === projectId);
  const anchorIndex = projectEvents.findIndex((event) => event.code === GATES_START || event.code === PREVIEW_START);
  if (anchorIndex < 0) return null;

  const anchor = projectEvents[anchorIndex];
  const kind = anchor.code === GATES_START ? "gates" : "preview";
  const terminalIndex = projectEvents
    .slice(0, anchorIndex)
    .findLastIndex((event) => kind === "gates"
      ? event.code === "DEVELOPER_GATES_FINISHED"
      : event.code === "PREVIEW_CANDIDATE_VERIFIED" || event.code === "PREVIEW_CANDIDATE_FAILED");
  const attemptEvents = projectEvents.slice(
    terminalIndex >= 0 ? terminalIndex : 0,
    anchorIndex + 1,
  );
  const hasFailure = kind === "gates"
    ? attemptEvents.some((event) => GATE_FAILURE.test(event.code))
      || attemptEvents.some((event) => event.code === "DEVELOPER_GATES_FINISHED" && event.details.success === false)
    : attemptEvents.some((event) => PREVIEW_FAILURES.has(event.code));
  const finished = kind === "gates"
    ? attemptEvents.find((event) => event.code === "DEVELOPER_GATES_FINISHED")
    : attemptEvents.find((event) => event.code === "PREVIEW_CANDIDATE_VERIFIED");
  const status = hasFailure ? "failed" : finished ? "passed" : "running";
  const occurredAt = attemptEvents.reduce(
    (latest, event) => event.occurredAt > latest ? event.occurredAt : latest,
    anchor.occurredAt,
  );

  return {
    schemaVersion: 1,
    attemptId: anchor.id,
    kind,
    status,
    occurredAt,
    diagnostics: makeDiagnostics(attemptEvents, kind, status),
  };
}
