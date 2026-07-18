import assert from "node:assert/strict";
import { rewriteWorkspaceMarkdownLinks } from "../src/ui/workspace-links.js";

const linkBaseHref = "/CMP/agent-rooms?project=project-1&room=room-1";
const targets = [{
  projectId: "project-1",
  workspaceId: "workspace-design",
  rootPath: "C:\\Users\\young\\Documents\\Game Design\\school-arcade-design"
}];

const rewrite = (markdown) => rewriteWorkspaceMarkdownLinks(markdown, { linkBaseHref, roomIssueId: "room-1", targets });

assert.equal(
  rewrite("[Comparison](C:/Users/young/Documents/Game%20Design/school-arcade-design/References/Art/CharacterStyleSheet/comparison.png)"),
  "[Comparison](/CMP/agent-rooms?project=project-1&room=room-1&file=References%2FArt%2FCharacterStyleSheet%2Fcomparison.png&projectId=project-1&workspaceId=workspace-design&roomFile=1)"
);

assert.equal(
  rewrite("[Design doc](<C:\\Users\\young\\Documents\\Game Design\\school-arcade-design\\Design\\Game Design.md>)"),
  "[Design doc](/CMP/agent-rooms?project=project-1&room=room-1&file=Design%2FGame+Design.md&projectId=project-1&workspaceId=workspace-design&roomFile=1)"
);

assert.equal(
  rewrite("![Preview](file:///C:/Users/young/Documents/Game%20Design/school-arcade-design/References/Art/preview.png)"),
  "[![Preview](/api/issues/room-1/file-resources/content?path=References%2FArt%2Fpreview.png&projectId=project-1&workspaceId=workspace-design&download=1)](/CMP/agent-rooms?project=project-1&room=room-1&file=References%2FArt%2Fpreview.png&projectId=project-1&workspaceId=workspace-design&roomFile=1)"
);

assert.equal(
  rewrite("![Boss preview](</C:/Users/young/Documents/Game Design/school-arcade-design/References/Art/Bosses/Castle/castle_boss_preview.png>)"),
  "[![Boss preview](/api/issues/room-1/file-resources/content?path=References%2FArt%2FBosses%2FCastle%2Fcastle_boss_preview.png&projectId=project-1&workspaceId=workspace-design&download=1)](/CMP/agent-rooms?project=project-1&room=room-1&file=References%2FArt%2FBosses%2FCastle%2Fcastle_boss_preview.png&projectId=project-1&workspaceId=workspace-design&roomFile=1)"
);

assert.equal(rewrite("[Outside](C:/Temp/secret.txt)"), "[Outside](C:/Temp/secret.txt)");
assert.equal(rewrite("[Web](https://example.com/image.png)"), "[Web](https://example.com/image.png)");
assert.equal(rewrite("[Relative](References/Art/leon.png)"), "[Relative](References/Art/leon.png)");

const nestedTargets = [
  ...targets,
  { projectId: "project-1", workspaceId: "nested", rootPath: "C:/Users/young/Documents/Game Design/school-arcade-design/References" }
];
assert.match(
  rewriteWorkspaceMarkdownLinks("[Leon](C:/Users/young/Documents/Game%20Design/school-arcade-design/References/Art/leon.png)", { linkBaseHref, targets: nestedTargets }),
  /workspaceId=nested/
);

console.log("PASS Room workspace file link rewriting");
