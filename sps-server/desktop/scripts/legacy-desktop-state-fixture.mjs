const HISTORICAL_V11_KEYS = Object.freeze([
  "version",
  "encryptedDesktopAccount",
  "desktopAccountLastAttempt",
  "desktopJoinLastAttempt",
  "desktopDeviceId",
  "accountConnections",
  "ownerHostOwnerSubject",
  "legacyOwnerHostAdoptionPending",
  "profile",
  "identity",
  "encryptedBoardApiToken",
  "companies",
  "projects",
  "nodeId",
  "nodeStatus",
  "transportKeyPublishedAt",
  "teamAccess",
  "encryptedTeamCredentials",
  "encryptedHostProjectShareSecrets",
]);

const HISTORICAL_V11_KEY_SET = new Set(HISTORICAL_V11_KEYS);

function isEmptyNativeState(value) {
  return value == null || (value.v === 1 && Array.isArray(value.entries) && value.entries.length === 0);
}

const CURRENT_ONLY_EMPTY_FIELDS = Object.freeze({
  nativeMemberKeyIndex: isEmptyNativeState,
  nativeNodes: isEmptyNativeState,
  ownerRestoreAttempts: value => value == null || (Array.isArray(value) && value.length === 0),
  encryptedNodeCompletionOutbox: value => value == null,
  encryptedNodeClaimJournal: value => value == null,
});

export const HISTORICAL_DESKTOP_STATE_VERSION = 11;

export function projectLegacyDesktopStateV11(state) {
  if (!state || typeof state !== "object" || Array.isArray(state) || state.version !== 13) {
    throw new Error("Expected a current v13 SPS Desktop state.");
  }

  for (const key of Object.keys(state)) {
    if (HISTORICAL_V11_KEY_SET.has(key)) continue;
    if (!Object.hasOwn(CURRENT_ONLY_EMPTY_FIELDS, key)) {
      throw new Error(`Cannot project unknown current Desktop state field: ${key}.`);
    }
    const isEmpty = CURRENT_ONLY_EMPTY_FIELDS[key];
    if (!isEmpty(state[key])) throw new Error(`Cannot discard non-empty current Desktop state field: ${key}.`);
  }

  const projected = {};
  for (const key of HISTORICAL_V11_KEYS) {
    if (!Object.hasOwn(state, key)) throw new Error(`Current Desktop state is missing historical field: ${key}.`);
    projected[key] = structuredClone(key === "version" ? HISTORICAL_DESKTOP_STATE_VERSION : state[key]);
  }
  return projected;
}
