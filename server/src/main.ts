import { access } from "node:fs/promises";
import path from "node:path";
import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import type { Address } from "viem";
import { loadConfig } from "./config.js";
import { MemoryRepos, type Repos } from "./db/repos.js";
import { PgRepos } from "./db/pg.js";
import { MemoryKv, RedisKv, type Kv } from "./infra/kv.js";
import { Quotas } from "./risk/quotas.js";
import { FakeChainReader, ViemChainReader, type ChainReader } from "./chain/client.js";
import { FileReferenceCorpus, OnnxClipEmbedder, type Embedder } from "./vision/clip.js";
import { ClaudeEscalator, NullEscalator, type Escalator } from "./vision/escalate.js";
import { NullDetector, OnnxDetector, type Detector } from "./media/detect.js";
import { FsObjectStore, MemoryObjectStore, PgObjectStore, S3ObjectStore, type ObjectStore } from "./media/storage.js";
import { KmsSigner, LocalDevSigner } from "./voucher/signer.js";
import { NonceSource, spotDomain, type VoucherSigner } from "./voucher/sign.js";
import { PriseService } from "./claim/orchestrate.js";
import { registerRoutes } from "./api/routes.js";
import { startBrandSync } from "./chain/brands.js";

async function exists(p: string): Promise<boolean> {
  return access(p).then(
    () => true,
    () => false,
  );
}

/** Câblage : chaque dépendance a une implémentation réelle et une implémentation de secours pour le dev. */
export async function buildApp() {
  const configWarnings: string[] = [];
  const cfg = loadConfig(process.env, configWarnings);
  const app = Fastify({ logger: { level: cfg.LOG_LEVEL }, trustProxy: cfg.TRUSTED_PROXY, bodyLimit: 1024 * 1024 });
  await app.register(cors, { origin: true });
  await app.register(multipart);
  const log = app.log;
  for (const w of configWarnings) log.warn(w);
  if (!cfg.FRAGMENTS_ENABLED) log.warn("FRAGMENTS_ENABLED=false : fiches d'abord, fragments ensuite (toute prise vaut 0 fragment)");

  const repos: Repos = cfg.DATABASE_URL ? PgRepos.connect(cfg.DATABASE_URL) : new MemoryRepos();
  if (!cfg.DATABASE_URL) log.warn("DATABASE_URL absente : dépôts en mémoire (dev uniquement)");
  const kv: Kv = cfg.REDIS_URL ? RedisKv.connect(cfg.REDIS_URL) : new MemoryKv();
  if (!cfg.REDIS_URL) log.warn("REDIS_URL absente : quotas en mémoire (dev uniquement)");

  const chain: ChainReader =
    cfg.VAULT_ADDRESS && cfg.REGISTRY_ADDRESS
      ? new ViemChainReader(cfg.CHAIN_RPC_URL, cfg.VAULT_ADDRESS as Address, cfg.REGISTRY_ADDRESS as Address)
      : new FakeChainReader();
  if (chain instanceof ViemChainReader && cfg.REGISTRY_ADDRESS) startBrandSync(chain, cfg.REGISTRY_ADDRESS as Address, repos, log);
  else log.warn("VAULT_ADDRESS / REGISTRY_ADDRESS absentes : lecteur de chaîne factice, aucune marque synchronisée");

  let signer: VoucherSigner;
  if (cfg.SIGNER_KMS_KEY_ID) signer = await KmsSigner.create(cfg.SIGNER_KMS_KEY_ID, cfg.AWS_REGION);
  else if (cfg.SIGNER_DEV_PRIVATE_KEY) {
    signer = new LocalDevSigner(cfg.SIGNER_DEV_PRIVATE_KEY as `0x${string}`);
    if (cfg.NODE_ENV === "production") log.error("ALLOW_HOT_SIGNER : clé de signer EN CLAIR en production. Dépannage uniquement, à migrer vers SIGNER_KMS_KEY_ID (AWS KMS) sans délai");
  }
  else throw new Error("SIGNER_KMS_KEY_ID (prod) ou SIGNER_DEV_PRIVATE_KEY (dev) requis");
  log.info({ signer: signer.address }, "signer");

  const mediaBase = cfg.S3_PUBLIC_BASE_URL ?? cfg.PUBLIC_MEDIA_BASE_URL ?? `http://localhost:${cfg.PORT}/media`;
  const store: ObjectStore = cfg.S3_BUCKET
    ? new S3ObjectStore(cfg.S3_BUCKET, cfg.S3_PUBLIC_BASE_URL ?? "", cfg.S3_ENDPOINT, cfg.AWS_REGION)
    : cfg.MEDIA_IN_DATABASE && cfg.DATABASE_URL
      ? new PgObjectStore(cfg.DATABASE_URL, mediaBase)
      : cfg.MEDIA_LOCAL_DIR
        ? new FsObjectStore(cfg.MEDIA_LOCAL_DIR, mediaBase)
        : new MemoryObjectStore();
  if (store instanceof PgObjectStore) log.warn("MEDIA_IN_DATABASE : photos stockées dans Postgres (offre gratuite), passer à S3/R2 dès que possible");

  const clipPath = path.join(cfg.MODELS_DIR, "clip-vision.onnx");
  let embedder: Embedder;
  if (await exists(clipPath)) embedder = new OnnxClipEmbedder(clipPath);
  else {
    if (cfg.NODE_ENV === "production") throw new Error(`modèle CLIP absent : ${clipPath}`);
    log.warn({ clipPath }, "CLIP absent : les prises seront refusées (objet non reconnu). Déposer les poids dans models/");
    embedder = { embed: async () => new Float32Array(512) };
  }
  const corpus = new FileReferenceCorpus(cfg.MODELS_DIR);
  const escalator: Escalator = cfg.ANTHROPIC_API_KEY ? new ClaudeEscalator(cfg.VISION_MODEL, cfg.ANTHROPIC_API_KEY) : new NullEscalator();
  if (!cfg.ANTHROPIC_API_KEY) log.warn("ANTHROPIC_API_KEY absente : pas d'escalade, la bande médiane est refusée");

  const facePath = path.join(cfg.MODELS_DIR, "face.onnx");
  const platePath = path.join(cfg.MODELS_DIR, "plate.onnx");
  const faces: Detector = (await exists(facePath))
    ? new OnnxDetector({ modelPath: facePath, inputWidth: 320, inputHeight: 240, layout: "ultraface", threshold: 0.6, mean: 127, scale: 128 })
    : new NullDetector();
  const plates: Detector = (await exists(platePath))
    ? new OnnxDetector({ modelPath: platePath, inputWidth: 640, inputHeight: 640, layout: "yolo", threshold: 0.4, mean: 0, scale: 255 })
    : new NullDetector();
  if (faces instanceof NullDetector || plates instanceof NullDetector) {
    if (cfg.NODE_ENV === "production") throw new Error("détecteurs visages/plaques absents : interdit en production (spec 1.5)");
    log.warn("détecteurs visages/plaques absents : aucun floutage (dev uniquement)");
  }

  const vault = (cfg.VAULT_ADDRESS ?? "0x0000000000000000000000000000000000000000") as Address;
  const service = new PriseService({
    repos,
    quotas: new Quotas(kv),
    chain,
    embedder,
    corpus,
    escalator,
    faces,
    plates,
    store,
    signer,
    domain: spotDomain(cfg.CHAIN_ID, vault),
    nonces: new NonceSource(),
    config: { dailyBudgetUsd: cfg.DAILY_BUDGET_USD, counterAngleRate: cfg.COUNTER_ANGLE_RATE, counterAngleRateHighRisk: cfg.COUNTER_ANGLE_RATE_HIGH_RISK, voucherLifetimeS: cfg.VOUCHER_LIFETIME_S, fragmentsEnabled: cfg.FRAGMENTS_ENABLED },
    now: () => Date.now(),
    rng: Math.random,
    log,
  });

  await registerRoutes(app, {
    service,
    repos,
    chain,
    store,
    signer,
    config: { dailyBudgetUsd: cfg.DAILY_BUDGET_USD, chainId: cfg.CHAIN_ID, vault: cfg.VAULT_ADDRESS ? (cfg.VAULT_ADDRESS as Address) : null, explorer: "https://robinhoodchain.blockscout.com", fragmentsEnabled: cfg.FRAGMENTS_ENABLED },
    now: () => Date.now(),
  });

  return { app, cfg };
}

const isMain = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isMain) {
  const { app, cfg } = await buildApp();
  await app.listen({ port: cfg.PORT, host: "0.0.0.0" });
}
