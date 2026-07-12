# CMP-67: Provision explicit Project Hub memory namespace

## Target Project Hub

- Paperclip Project ID: `1a3fe2e8-f7a2-4fe6-9df7-eab58914b999`
- Project name: `강해린`
- Company ID: `181e1bf7-3390-4b8d-8507-b736a03e444b`

## Context

The new game-specific Project Hub was intentionally created separately from `Onboarding`. The Memory Sidecar currently indexes an approved company journal and a project journal only for the old Onboarding Project ID. Without explicit provisioning, recalls scoped to the new Project Hub have no project journal target.

The agreed operating model requires strict separation:

- approved durable memory lives in project `LEARNINGS.md` journals;
- proposals remain candidates until explicit review/promotion;
- memory never creates/routes/closes tasks or becomes a controller.

## Objective

Implement a reusable, explicit, safe way to initialize a Paperclip Project's approved-memory journal and register it in the local Memory Sidecar configuration. Then provision the target Project Hub using that tool.

## Requirements

1. Do not change `02-final-operating-model-ko.md`, Paperclip core, Direct Task Bridge config, plugin execution setting, Unreal workspace, Git state, agent assignments, or existing approved journal content.
2. Create a focused helper under `memory-sidecar/` or `scripts/` that takes explicit `CompanyId` and `ProjectId` inputs. It must derive the standard Paperclip managed project journal path only under:
   `C:\Users\young\.paperclip\instances\default\projects\<companyId>\<projectId>\_default\LEARNINGS.md`
   Reject malformed IDs/paths and never accept a caller-provided path outside that managed root.
3. The helper must be idempotent:
   - create the project journal only if missing, with a minimal non-substantive header explaining that approved decisions belong there;
   - add exactly one matching `{ scope: "project", companyId, projectId, path }` entry to `memory-sidecar/config.local.json` only if absent;
   - preserve all other journal entries and any existing security settings;
   - never append a candidate or decision automatically.
4. Provide a dry-run/test mode that performs no live writes or process changes. Add focused tests proving ID/path containment, idempotency, duplicate prevention, and no candidate promotion.
5. If the Sidecar must be restarted to pick up a changed configuration, require an explicit restart switch. The normal helper must not silently restart it.
6. Run the helper for the target Project Hub with the explicit restart step only after its tests pass. Verify:
   - Sidecar health remains loopback-only and healthy;
   - a scoped recall for the target Project ID reaches its project journal namespace;
   - candidate/approved boundaries are unchanged;
   - no Direct Task bridge config, secret, workspace mapping, managed agent activity, or Unreal file edit occurs.
7. Document the provisioning operation and update the relevant README/checklist status accurately.

## Acceptance

The target Project Hub has its own empty-but-valid approved memory journal registered in the Sidecar. Its scoped recall no longer falls back to the Onboarding project journal. No substantive memory is auto-approved and no execution feature is enabled.
