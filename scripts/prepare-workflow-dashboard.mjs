import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { getProjectPaths, readTimelineEvents, readWorkflow } from "../workflow-dashboard/storage.mjs";

const outputDirectory = path.resolve(process.argv[2] || ".workflow-dashboard-site");
const paths = getProjectPaths();
const sourceDirectory = paths.dashboardDir;

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(path.join(outputDirectory, "data"), { recursive: true });

for (const filename of ["index.html", "styles.css", "app.js", "tracks.js"]) {
  await copyFile(path.join(sourceDirectory, filename), path.join(outputDirectory, filename));
}

for (const filename of ["autobo-workflow.json", "autobo-events.json"]) {
  await copyFile(path.join(sourceDirectory, "data", filename), path.join(outputDirectory, "data", filename));
}

const workflow = await readWorkflow(paths);
const events = await readTimelineEvents(paths);
await writeFile(path.join(outputDirectory, "data", "workflow.json"), `${JSON.stringify(workflow, null, 2)}\n`, "utf8");
await writeFile(path.join(outputDirectory, "data", "events.json"), `${JSON.stringify(events, null, 2)}\n`, "utf8");

console.log(`Painel preparado em ${outputDirectory}`);
console.log(`Tickets: ${workflow.tickets.length}; eventos: ${events.length}`);
