import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [{ default: manifest }, worker] = await Promise.all([
  import(new URL("../dist/manifest.js", import.meta.url)),
  readFile(new URL("../dist/worker.js", import.meta.url), "utf8"),
]);

const expectedEvents = [
  "project.created",
  "room.checkpoint",
  "room.compacted",
  "task.completed",
  "task.blocked",
  "task.reopened",
  "artifact.published",
];

assert.ok(manifest.capabilities.includes("events.subscribe"));
assert.equal(manifest.companyActivation?.defaultEnabled, false);
assert.equal(manifest.memoryProvider.defaultForNewCompanies, false);
assert.deepEqual(
  [...manifest.memoryProvider.lifecycleEvents].sort(),
  [...expectedEvents].sort(),
  "The manifest and worker lifecycle contracts must stay in sync.",
);
for (const eventType of expectedEvents) {
  assert.ok(worker.includes(`"${eventType}"`), `Worker is missing lifecycle handler ${eventType}.`);
}
assert.match(worker, /const MEMORY_LIFECYCLE_EVENTS/);
assert.match(worker, /ctx\.events\.on\(eventType/);
assert.match(worker, /idempotencyKey: `lifecycle:\$\{event\.eventId\}`/);
assert.match(worker, /issueId: taskId/);
console.log("SPS Default Memory lifecycle contract verification passed.");
