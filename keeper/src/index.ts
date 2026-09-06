import cron from "node-cron";
import { loadConfig } from "./config.js";
import { makeDeps, inventoryJob, rarityJob, huntJob } from "./jobs.js";

/**
 * Trois crons indépendants (spec Partie 6) :
 *   inventaire  — toutes les 5 minutes
 *   rareté      — chaque nuit à 23:50 UTC
 *   chasse      — à 00:00 UTC (révélation + réengagement 30 jours)
 */
const cfg = loadConfig();
const d = makeDeps(cfg);
let inventoryRunning = false;

cron.schedule("*/5 * * * *", async () => {
  if (inventoryRunning) return; // idempotent et jamais concurrent
  inventoryRunning = true;
  try {
    await inventoryJob(d);
  } catch (e) {
    d.log.error({ err: (e as Error).message }, "inventaire");
  } finally {
    inventoryRunning = false;
  }
}, { timezone: "UTC" });

cron.schedule("50 23 * * *", async () => {
  try {
    await rarityJob(d);
  } catch (e) {
    d.log.error({ err: (e as Error).message }, "rareté");
  }
}, { timezone: "UTC" });

cron.schedule("0 0 * * *", async () => {
  try {
    await huntJob(d);
  } catch (e) {
    d.log.error({ err: (e as Error).message }, "chasse");
  }
}, { timezone: "UTC" });

d.log.info({ keeper: d.c.account.address, registry: cfg.REGISTRY_ADDRESS, vault: cfg.VAULT_ADDRESS }, "keeper démarré");
