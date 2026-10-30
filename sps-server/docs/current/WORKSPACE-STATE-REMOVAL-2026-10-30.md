# Workspace removal and plugin state

Deleting a Workspace previously left its company-scoped rows in `plugin_state`. The store uses a textual scope identifier and has a foreign key to the installed plugin, but no foreign key to the company. Removing the company therefore could not cascade into this store.

Core now explicitly removes rows matching both `scope_kind = company` and `scope_id = removed Workspace ID` inside the existing company-removal transaction. The operation covers all plugins and namespaces. The production route still drains Workspace-owned workers, stops execution, checks pending resources, and rechecks the durable stop token before deletion.

Other Workspaces, installed plugin records, shared instance state and other legacy scope kinds are preserved. An equal text identifier in a different scope is not sufficient evidence of Workspace ownership. This change applies to the current SPS Workspace-worker state contract, which permits the owning company scope; it does not infer ownership of arbitrary legacy plugin scopes or clean old orphan records automatically. No schema migration or SDK contract changes are required.

## Verification

The new real PostgreSQL regression failed on the preceding Core revision because the removed Workspace's state remained. After the fix, the same regression and the existing routine-containing company removal regression passed: **2 selected tests passed**, 12 other cases were excluded by the explicit name filter. Fixture setup/cleanup and test deadlines were retained.

The new case seeds two Workspaces and two installed plugins, multiple namespaces, the same state key in both Workspaces, shared instance state and a different-scope canary with the same identifier. It compares the exact remaining payloads and owners. It also runs removal inside a real outer transaction, observes the company-scoped state gone within that transaction, intentionally aborts, and verifies that the Workspace and all original state rows are restored before exercising committed removal.

Separately, actual Windows processes and migrated PostgreSQL qualified the production Workspace worker factory on Source `148024b3c6c3e418677a4f9fb5c019dd740e9772` / Core `e87216bbd709aff9b44b6c195be9fa07fa4a5645`: distinct configuration/state/entities, fourteen denied cross-scope or unavailable-API calls, exact final stored values, durable Workspace stop, and continued operation of the other Workspace. That prior-tuple evidence is complementary; it does not qualify this fix's installed package bytes.

Validation scripts reuse the existing Core/SDK/Runner contracts and disposable approved protocol fixtures. This is approved-plugin process ownership and Core/SDK access control on one Windows PC. Full hostile-code OS sandboxing, remote-device qualification, deployed authentication and final installer-byte qualification remain separate. No new solution plugin, Builder or Native feature is introduced.
