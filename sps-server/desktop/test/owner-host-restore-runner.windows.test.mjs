import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, stat, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { createSpsOwnerHostRestoreRunner } from "../src/owner-host-restore-runner.mjs";

async function waitForFile(file) {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    try { await stat(file); return; }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    await delay(100);
  }
  throw new Error("Owned restore fixture did not reach its expected phase.");
}
async function fixture(t, holdRestore) {
  const root = await mkdtemp(path.join(os.tmpdir(), "sps-owned-restore-"));
  const temporaryRoot = await realpath(os.tmpdir());
  const runner = createSpsOwnerHostRestoreRunner();
  t.after(async () => {
    if (runner.isActive()) await runner.stop();
    // Preserve uncertain process/file ownership rather than recursively
    // deleting a fixture merely because its test has finished.
    assert.equal(runner.isActive(), false, `Restore ownership is unconfirmed; fixture preserved at ${root}`);
    assert.equal(path.dirname(await realpath(root)), temporaryRoot);
    await rm(root, { recursive: true, force: true });
  });
  const marker = path.join(root, "descendant.json"), waiting = path.join(root, "restoring");
  const descendant = path.join(root, "descendant.mjs"), config = path.join(root, "config.json");
  const db = path.join(root, "db.mjs"), embedded = path.join(root, "postgres.mjs");
  await writeFile(descendant, `import {writeFile} from 'node:fs/promises';await writeFile(${JSON.stringify(marker)},JSON.stringify({pid:process.pid}));setInterval(()=>{},1000);`);
  await writeFile(config, JSON.stringify({ database: { embeddedPostgresDataDir: path.join(root, "database"), embeddedPostgresPort: 34567 } }));
  await writeFile(embedded, `
    import {spawn} from 'node:child_process';import {stat} from 'node:fs/promises';import {setTimeout as delay} from 'node:timers/promises';
    export default class {
      async initialise(){}
      async start(){
        spawn(process.execPath,[${JSON.stringify(descendant)}],{stdio:'ignore',windowsHide:true}).unref();
        for(let i=0;i<150;i++){try{await stat(${JSON.stringify(marker)});return;}catch(error){if(error.code!=='ENOENT')throw error;}await delay(100);}
        throw new Error('Descendant fixture did not start');
      }
      async stop(){} // Deliberate inert double; the real owned Job must close the descendant.
    }
  `);
  await writeFile(db, `
    import {writeFile} from 'node:fs/promises';
    export async function ensurePostgresDatabase(){}
    export async function runDatabaseRestore(){await writeFile(${JSON.stringify(waiting)},'ready');${holdRestore ? "await new Promise(()=>{setInterval(()=>{},1000);});" : ""}}
    export async function sanitizePostRestoreDatabase(){}
  `);
  return { runner, root, marker, waiting, invocation: { command: process.execPath, cwd: root,
    helperPath: fileURLToPath(new URL("../src/owner-host-restore.mjs", import.meta.url)), configPath: config,
    backupFile: path.join(root, "unused.sql.gz"), dbModulePath: db, embeddedPostgresModulePath: embedded, environment: {} } };
}
async function pipeWrapFixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "sps-owned-restore-pipe-wrap-"));
  const temporaryRoot = await realpath(os.tmpdir());
  const runner = createSpsOwnerHostRestoreRunner();
  t.after(async () => {
    if (runner.isActive()) await runner.stop();
    // Preserve uncertain process/file ownership rather than recursively
    // deleting a fixture merely because its test has finished.
    assert.equal(runner.isActive(), false, `Restore ownership is unconfirmed; fixture preserved at ${root}`);
    assert.equal(path.dirname(await realpath(root)), temporaryRoot);
    await rm(root, { recursive: true, force: true });
  });

  const marker = path.join(root, "grandchild.json");
  const waiting = path.join(root, "restoring");
  const primarySource = `
    const {spawn}=require('node:child_process');
    const grandchild=spawn(process.execPath,['-e',${JSON.stringify(`require('node:fs').writeFileSync(${JSON.stringify(marker)},JSON.stringify({pid:process.pid}));setInterval(()=>{},1000);`)}],{stdio:['ignore',1,2],windowsHide:true});
    grandchild.unref();
    setInterval(()=>{},1000);
  `;
  const embedded = path.join(root, "postgres-pipe-wrap.mjs");
  const db = path.join(root, "db.mjs");
  const config = path.join(root, "config.json");
  await writeFile(config, JSON.stringify({ database: { embeddedPostgresDataDir: path.join(root, "database"), embeddedPostgresPort: 34568 } }));
  await writeFile(embedded, `
    import {spawn} from 'node:child_process';
    import {once} from 'node:events';
    import {stat} from 'node:fs/promises';
    import {setTimeout as delay} from 'node:timers/promises';
    export default class {
      process=null;
      async initialise(){}
      async start(){
        this.process=spawn(process.execPath,['-e',${JSON.stringify(primarySource)}],{stdio:['ignore','pipe','pipe'],windowsHide:true});
        for(let i=0;i<150;i++){try{await stat(${JSON.stringify(marker)});return;}catch(error){if(error.code!=='ENOENT')throw error;}await delay(100);}
        throw new Error('Pipe-wrap grandchild fixture did not start');
      }
      async stop(){
        const child=this.process;
        if(!child)return;
        child.kill();
        await once(child,'exit');
        this.process=null;
      }
    }
  `);
  await writeFile(db, `
    import {writeFile} from 'node:fs/promises';
    export async function ensurePostgresDatabase(){}
    export async function runDatabaseRestore(){await writeFile(${JSON.stringify(waiting)},'ready');}
    export async function sanitizePostRestoreDatabase(){}
  `);
  return {
    runner,
    marker,
    waiting,
    invocation: {
      command: process.execPath,
      cwd: root,
      helperPath: fileURLToPath(new URL("../src/owner-host-restore.mjs", import.meta.url)),
      configPath: config,
      backupFile: path.join(root, "unused.sql.gz"),
      dbModulePath: db,
      embeddedPostgresModulePath: embedded,
      environment: {},
    },
  };
}
test("Windows restore Job closes a real owned descendant before accepting helper success", { skip: process.platform !== "win32", timeout: 45000 }, async t => {
  const f = await fixture(t, false);
  await f.runner.run(f.invocation);
  assert.ok(JSON.parse(await readFile(f.marker, "utf8")).pid > 0);
  assert.equal(f.runner.isActive(), false);
  assert.equal(f.runner.hasUnconfirmedTermination(), false);
});
test("Windows restore closes Postgres pipe wrappers before joining the inherited-stdio Job", { skip: process.platform !== "win32", timeout: 45000 }, async t => {
  const f = await pipeWrapFixture(t);
  await f.runner.run(f.invocation);
  await stat(f.waiting);
  assert.ok(JSON.parse(await readFile(f.marker, "utf8")).pid > 0);
  assert.equal(f.runner.isActive(), false);
  assert.equal(f.runner.hasUnconfirmedTermination(), false);
});
test("Windows restore cancellation confirms the owned helper/descendant Job before release", { skip: process.platform !== "win32", timeout: 45000 }, async t => {
  const f = await fixture(t, true);
  const operation = f.runner.run(f.invocation);
  const outcome = operation.then(() => assert.fail("Cancelled restore must not succeed"), error => error);
  await waitForFile(f.waiting);
  assert.equal(f.runner.isActive(), true);
  await f.runner.stop();
  assert.match((await outcome).message, /cancelled/);
  assert.equal(f.runner.isActive(), false);
  assert.equal(f.runner.hasUnconfirmedTermination(), false);
});
