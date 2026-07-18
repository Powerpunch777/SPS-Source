let prompt = "";
for await (const chunk of process.stdin) prompt += chunk;
if (!prompt.includes("CURRENT REQUEST")) {
  process.stderr.write("missing room prompt\n");
  process.exitCode = 2;
} else {
  process.stdout.write("mock agy room reply\n");
}
