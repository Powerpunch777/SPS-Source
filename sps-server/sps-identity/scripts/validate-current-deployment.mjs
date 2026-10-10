import { stdin } from "node:process";
import { selectCurrentDeployment, wranglerCollection } from "./version-selection.mjs";

const [deploymentId, versionId] = process.argv.slice(2);
if (!deploymentId || !versionId) {
  throw new Error("Usage: validate-current-deployment.mjs <deployment-id> <version-id>");
}
let input = "";
stdin.setEncoding("utf8");
for await (const chunk of stdin) input += chunk;
const deployment = selectCurrentDeployment(wranglerCollection(input, "deployments"), { deploymentId, versionId });
process.stdout.write(`${deployment.id}\n`);
