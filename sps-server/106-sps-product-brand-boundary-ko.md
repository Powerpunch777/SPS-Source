# SPS Product Brand Boundary

## Purpose

SPS (SonParkServer)는 독립 제품 이름이다. 사용자가 설치하고 보는 화면,
SPS Desktop, 운영 문서, 공개 Hub, 초대 흐름은 모두 SPS를 사용한다.

SPS Core는 별도 Git 저장소로 추적되는 호환 코어다. 그 안의 upstream 패키지명,
데이터 형식, 기존 환경 변수는 업데이트 수용성을 위해 당분간 유지한다. 이 내부
호환 명칭을 사용자 제품명으로 노출하지 않는다.

## Naming contract

| Layer | Required name | Notes |
| --- | --- | --- |
| Product title, logo, browser title, Desktop installer | `SPS` / `SonParkServer` | End-user surface only. |
| New public deployment configuration | `SPS_*` | Hub, Google OAuth, node and permission documentation use this form. |
| Repository topology | `Powerpunch777/SPS` + pinned `Powerpunch777/SPS-Core` submodule | `git clone --recurse-submodules` restores a compatible whole server. |
| Compatibility internals | existing package namespaces, persisted keys, legacy environment fallbacks | Do not rename mechanically; preserve until a dual-read migration exists. |

## What is already enforced

- The browser title, logo asset, favicon injection markers, theme preference,
  workplane metadata, Desktop product identity, and public Hub configuration use
  SPS naming.
- Existing `paperclip.theme` preferences are read once and migrated to
  `sps.theme`, so an upgrade does not reset a user's theme.
- Core UI distribution is prepared with a Node script, not a Bash-only command;
  SPS Desktop and Windows packaging can therefore create the same server UI
  asset tree as Docker/Linux builds.
- New default Agent instructions and first-admin setup screens describe SPS.
- Hostname errors explain `SPS_ALLOWED_HOSTNAMES`, rather than exposing an
  upstream CLI command.

## Compatibility rules

1. Never bulk-rename package imports, database columns, storage locations, or
   runtime context keys only to change branding. Those values are part of the
   Core update contract.
2. Add an SPS public equivalent first. Read the legacy value only as a fallback
   and write the SPS value going forward.
3. For a protocol visible to agents or plugins, accept both versions during a
   migration window. Only remove a legacy spelling after all shipped adapters
   and generated AGENTS.md templates have moved.
4. A browser-visible string must use SPS unless it is quoting a literal legacy
   compatibility key that an operator must configure.
5. New SPS plugins, documents, scripts, and Desktop configuration must not add
   new upstream-branded public commands or settings.

## Remaining migration queue

| Item | Why it is not a search-and-replace | Required safe change |
| --- | --- | --- |
| Task final/blocker report headings | SDK validation and existing Agent prompts require the current heading. | Add dual-header acceptance, emit the SPS heading, then update adapters and tests. |
| Agent API and run headers | Existing CLI adapters send the legacy HTTP header. | Add an SPS alias while retaining the legacy header until every adapter supports it. |
| Plugin element and bridge identifiers | Installed third-party plugin bundles may refer to current identifiers. | Version the bridge and support both identifiers before changing defaults. |
| Remaining advanced Core copy | Some upstream-only settings pages still have user-visible upstream wording. | Replace each visible text path with SPS while retaining internal identifiers. |
| Package namespaces | Package names are currently the Core update boundary. | Consider a full namespace fork only after an automated upstream merge and compatibility test process exists. |

## Release gates

SPS can be run locally now. A public Hub and shareable Windows installer require
all of the following:

1. Docker Engine running on the Hub computer.
2. A public HTTPS domain and Google OAuth Web client values.
3. A trusted Windows code-signing certificate and GitHub release signing
secrets.
4. A second physical computer used to accept an invite, register an SPS Desktop
Node, grant an Agent, and execute a harmless command.

Run the checks before a pilot:

```powershell
# Verify the local product server.
.\sps-server\scripts\Test-SPSWorkplaneReadiness.ps1 | Format-List

# Verify public-Hub prerequisites without printing secrets.
.\sps-server\deploy\hub\Test-SPSPublicHubDeployment.ps1

# Verify the desktop package source tests.
Set-Location .\sps-server\desktop
npm test
```
