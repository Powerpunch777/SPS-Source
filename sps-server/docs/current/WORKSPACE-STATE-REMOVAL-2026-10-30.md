# Workspace removal and plugin state

> **설계 정렬 2026-11-02:** [단일 기준](DESIGN-BASELINE-2026-11-02.md)과
> [사용자 원문](../design/CORE-PLUGIN-ARCHITECTURE-2026-10-25.md)이 제품 목표에 우선한다.
> 전체 Workspace 제거와 해당 Workspace+Plugin 기본 데이터 초기화를 구분한다. 전체 초기화는 별도 확인하며 다른 Workspace/Plugin·외부 프로젝트·Vault를 보호한다. 미구현 범용 초기화를 현재 제거 API로 대체했다고 표시하지 않는다.
> 이후의 과거 정책/계획/시험은 해당 날짜·리비전의 기록이며 충돌 시 목표를 축소하지 않는다.
> 문서 수정만 수행하며 구현·API 변경·장기목표 재개를 뜻하지 않는다.

Deleting a Workspace previously left its company-scoped rows in `plugin_state`. The store uses a textual scope identifier and has a foreign key to the installed plugin, but no foreign key to the company. Removing the company therefore could not cascade into this store.

Core now explicitly removes rows matching both `scope_kind = company` and `scope_id = removed Workspace ID` inside the existing company-removal transaction. The operation covers all plugins and namespaces. The production route still drains Workspace-owned workers, stops execution, checks pending resources, and rechecks the durable stop token before deletion.

Other Workspaces, installed plugin records, shared instance state and other legacy scope kinds are preserved. An equal text identifier in a different scope is not sufficient evidence of Workspace ownership. This change applies to the current SPS Workspace-worker state contract, which permits the owning company scope; it does not infer ownership of arbitrary legacy plugin scopes or clean old orphan records automatically. No schema migration or SDK contract changes are required.

## Verification

The new real PostgreSQL regression failed on the preceding Core revision because the removed Workspace's state remained. After the fix, the same regression and the existing routine-containing company removal regression passed: **2 selected tests passed**, 12 other cases were excluded by the explicit name filter. Fixture setup/cleanup and test deadlines were retained.

The new case seeds two Workspaces and two installed plugins, multiple namespaces, the same state key in both Workspaces, shared instance state and a different-scope canary with the same identifier. It compares the exact remaining payloads and owners. It also runs removal inside a real outer transaction, observes the company-scoped state gone within that transaction, intentionally aborts, and verifies that the Workspace and all original state rows are restored before exercising committed removal.

Separately, actual Windows processes and migrated PostgreSQL qualified the production Workspace worker factory on Source `148024b3c6c3e418677a4f9fb5c019dd740e9772` / Core `e87216bbd709aff9b44b6c195be9fa07fa4a5645`: distinct configuration/state/entities, fourteen denied cross-scope or unavailable-API calls, exact final stored values, durable Workspace stop, and continued operation of the other Workspace. That prior-tuple evidence is complementary; it does not qualify this fix's installed package bytes.

Validation scripts reuse the existing Core/SDK/Runner contracts and disposable approved protocol fixtures. This is approved-plugin process ownership and Core/SDK access control on one Windows PC. Full hostile-code OS sandboxing, remote-device qualification, deployed authentication and final installer-byte qualification remain separate. No new solution plugin, Builder or Native feature is introduced.
