import { queryInstallerRegistrations } from '../installer-registry-query.mjs';

// Read-only qualification under the same restricted token/private Desktop as
// installer acceptance. Never report local registration values or install apps.
const entries = await queryInstallerRegistrations();
console.log(JSON.stringify({ installerRegistryRead: true, matchedRegistrations: entries.length }));
