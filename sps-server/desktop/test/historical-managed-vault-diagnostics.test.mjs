import assert from "node:assert/strict";
import test from "node:test";
import { createHistoricalPostgresStartupObserver } from "../scripts/historical-managed-vault-fixture.mjs";

test("historical PostgreSQL startup observer recognizes the official banner across chunks", () => {
  const observer = createHistoricalPostgresStartupObserver();
  observer.begin();
  observer.observe({ toString() { throw new Error("Unknown diagnostic objects must not be evaluated."); } });
  observer.observe("Execution of PostgreSQL by a user with administrative ");
  observer.observe(Buffer.from("permissions is not\npermitted.\nThe server must be started under an unprivileged user ID to prevent\n"));
  observer.observe("possible system security compromises. See the documentation for\nmore information on how to properly start the server.\n");
  observer.end();

  assert.equal(observer.failureCategory(), "administrator_unsupported");
  assert.doesNotMatch(JSON.stringify(observer), /Execution of PostgreSQL|administrative permissions/);
  observer.dispose();
  assert.equal(observer.failureCategory(), "unclassified");
});

test("historical PostgreSQL startup observer retains a bounded tail and exposes no unknown text", () => {
  const observer = createHistoricalPostgresStartupObserver();
  observer.begin();
  observer.observe("Execution of PostgreSQL by a user with administrative ");
  observer.observe("x".repeat(4096));
  observer.observe("permissions is not\npermitted.\nThe server must be started under an unprivileged user ID to prevent\npossible system security compromises. See the documentation for\nmore information on how to properly start the server.");
  observer.observe("\naccount=private-user port=5432 pid=1234 path=C:\\private\\cluster");
  observer.end();

  assert.equal(observer.failureCategory(), "unclassified");
  assert.doesNotMatch(JSON.stringify({ category: observer.failureCategory(), observer }),
    /private-user|5432|1234|private\\cluster|administrative permissions/);
  observer.dispose();
});
