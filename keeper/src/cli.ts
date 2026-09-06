import { loadConfig } from "./config.js";
import { makeDeps, inventoryJob, rarityJob, huntJob, commitHuntsJob } from "./jobs.js";

/** Exécution ponctuelle d'un job : `pnpm once:rarity`, `pnpm commit-hunts`, … */
const job = process.argv[2];
const d = makeDeps(loadConfig());
const jobs: Record<string, () => Promise<unknown>> = {
  inventory: () => inventoryJob(d),
  rarity: () => rarityJob(d),
  hunt: () => huntJob(d),
  "commit-hunts": () => commitHuntsJob(d),
};
const run = job ? jobs[job] : undefined;
if (!run) {
  console.error(`usage : cli <${Object.keys(jobs).join("|")}>`);
  process.exit(2);
}
run()
  .then((r) => {
    d.log.info({ result: r }, "terminé");
  })
  .catch((e) => {
    d.log.error({ err: (e as Error).message }, "échec");
    process.exit(1);
  });
