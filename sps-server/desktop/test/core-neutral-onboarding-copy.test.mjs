import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("keeps Desktop onboarding neutral before a workflow plugin is selected", async () => {
  const onboarding = await readFile(new URL("../renderer/index.html", import.meta.url), "utf8");

  assert.match(onboarding, /회사·Workspace·플러그인 데이터/);
  assert.match(onboarding, /Workspace와 활성 플러그인을 여는 중입니다/);
  assert.doesNotMatch(onboarding, /Rooms|Tasks|장기기억/);
});
