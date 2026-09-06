# SPOT

**Tu photographies une entreprise cotée dans la vraie vie. Tu reçois un fragment de son action.**

Un camion Amazon dans ta rue → `0,015 AMZN`. Une canette de Coca → `0,004 KO`.

- Chaîne : **Robinhood Chain** (chainId `4663`, vérifié en direct via `eth_chainId` le 05.IX.26)
- Actif distribué : **Robinhood Stock Tokens** (ERC-20, 18 décimales)
- Support : **PWA mobile**
- **Tout est acheté d'avance.** Rien n'est jamais frappé. Le joueur n'est jamais payé dans le token du projet.
- **Budget quotidien fixe et public.** Épuisé → on gagne encore la fiche, plus de fragment.

Les deux documents fondateurs sont la source de vérité :

- `PROMPT-SPOT.md` — spécification complète de build
- `PROMPT-SPOT-DA.md` — direction artistique (à lire avant toute ligne de CSS)

Les documents de conformité et de sécurité sont à la racine : [`LEGAL.md`](LEGAL.md), [`SECURITY.md`](SECURITY.md).

---

> Pour sortir aujourd'hui : `LAUNCH.md`, le plan en une heure (fiches d'abord, fragments ensuite). Le détail de chaque brique est dans `DEPLOY.md`.

## État du build

| Phase | Contenu | État |
|---|---|---|
| **1 — Le socle** | `foundry.toml`, interfaces, `UnitQueue`, `SpotRegistry`, `SpotVault`, invariants (10 000 runs), EIP-712, scénario sur fork local | **fait** |
| **2 — La vérification** | capture double frame + capteurs, traitement d'image en mémoire, six couches (mécanique, parallaxe, moiré, cadre, luminance, CLIP + escalade, pHash, contre-angle), score de risque, quotas | **fait** — les poids ONNX (CLIP, visages, plaques) et le corpus de référence ne sont pas dans le dépôt |
| **3 — L'inventaire** | `SpotSwapper` + `DecimalMath`, keeper (inventaire 5 min, rareté 23:50 UTC, chasse commit-reveal 00:00 UTC) | **fait** — `buildRoute` (encodage Uniswap V4) attend les adresses réelles des pools |
| **4 — Le produit visible** | PWA : chasse du jour, prise, carnet, fiches ERC-1155, `/vault`, `/terrain`, `/marques`, `/vie-privee`, `/legal`, `/indisponible`, image de partage | **fait** |
| **5 — La profondeur** | `SpotPlates` (scellement + prime), échange de fiches (ERC-1155 transférables) | **fait** — l'abonnement (prises illimitées, fiches HD) n'est pas implémenté |
| 6 — Lancement | revue 9.1, testnet, 200 prises réelles, financement, mainnet | à faire — et c'est le test terrain qui décide (spec, étape 12) |

**Tests :** 105 tests Foundry (dont 5 invariants à 10 000 runs), 50 tests serveur, 10 tests keeper, typecheck strict et build de production de la PWA.

## Arborescence

```
spot/
├── contracts/                  Foundry — Solidity 0.8.26, via-IR, OpenZeppelin v5.1
│   ├── src/
│   │   ├── SpotRegistry.sol    marques, planches, rareté (±35 % on-chain), chasse (commit-reveal)
│   │   ├── SpotVault.sol       inventaire FIFO, vouchers EIP-712, budget, pause asymétrique, migration
│   │   ├── SpotSightings.sol   fiches ERC-1155
│   │   ├── SpotPlates.sol      planches ERC-721, prime dégressive
│   │   ├── SpotSwapper.sol     achat d'inventaire (keeper), slippage 1 %, montant réellement reçu
│   │   ├── interfaces/
│   │   └── libraries/          UnitQueue, DecimalMath (6 / 8 / 18)
│   ├── test/                   unitaires, campagne déterministe, invariants, vecteurs partagés
│   └── script/                 Deploy.s.sol, Scenario.s.sol
├── server/                     Node 22, Fastify, drizzle (Postgres), Redis, sharp, onnxruntime
│   ├── src/
│   │   ├── checks/             couche 2 — EXIF, capteurs, images identiques, horloge, résolution
│   │   ├── vision/             couche 3 — parallaxe, moiré (FFT), cadre, luminance ; couche 4 — CLIP, escalade Claude ; couche 5 — pHash
│   │   ├── claim/              orchestration, fragment, chasse, contre-angle (couche 6)
│   │   ├── risk/               score 0–100, quotas Redis
│   │   ├── voucher/            EIP-712, nonces, signer KMS (prod) / clé de dev
│   │   ├── media/              traitement en mémoire, floutage, stockage S3
│   │   ├── db/                 schéma, dépôts mémoire et Postgres
│   │   ├── chain/              lecture viem (budget, prix × multiplicateur, chasse)
│   │   └── api/                les routes de la spec 7.2
│   └── models/                 (à déposer) clip-vision.onnx, face.onnx, plate.onnx, refs/<brandId>.json
├── keeper/                     node-cron : inventaire, rareté, chasse ; CLI pour exécution ponctuelle
├── app/                        Next.js 15, React 19, Tailwind 4, wagmi 3 — la PWA
│   ├── app/                    /, /prise/[brandId], /carnet, /planches, /terrain, /vault, /marques, /vie-privee, /legal, /indisponible, /reglages, /api/og/[id]
│   ├── components/             Fiche, Manuscrit, Tampon, CoinsPhoto, Reglette, Notes, Carnet, Planche, prise/
│   ├── middleware.ts           géo-blocage en edge, défaut = refus
│   └── public/sw.js            coquille hors ligne + file des prises
├── LEGAL.md
├── SECURITY.md
└── README.md
```

## Commandes

```bash
# Contrats
cd contracts && forge build && forge test          # profil complet ; FOUNDRY_PROFILE=quick pour itérer
anvil --chain-id 4663 --port 8547 && forge script script/Scenario.s.sol --rpc-url http://127.0.0.1:8547 --broadcast

# Serveur de prise
cd server && pnpm install && pnpm test && pnpm typecheck
SIGNER_DEV_PRIVATE_KEY=0x… pnpm dev                 # sans DATABASE_URL/REDIS_URL : dépôts et quotas en mémoire (dev)

# Keeper
cd keeper && pnpm install && pnpm test
REGISTRY_ADDRESS=0x… VAULT_ADDRESS=0x… KEEPER_PRIVATE_KEY=0x… pnpm commit-hunts   # publie 30 jours d'engagements

# PWA
cd app && pnpm install && cp .env.example .env.local && pnpm dev   # NEXT_PUBLIC_DEMO=1 : données figées, prise simulée
pnpm build
```

## Décisions prises en cours de build (et où la spec laissait un choix)

Ces points ne sont pas dans la spec mot pour mot. Ils sont documentés pour être validés ou renversés.

1. **Le voucher porte trois champs de plus** que la spec 4.8 : `imageHash`, `cityCode`, `issuedAt`. `mintSighting` est `onlyVault` et « une prise = une transaction » : la fiche doit être frappée dans `claim`, avec ses données. `issuedAt` sert à la pause asymétrique (SECURITY.md). Le serveur signe ces neuf champs ; `test/Vectors.t.sol` et `server/test/vectors.test.ts` figent le même hachage des deux côtés.
2. **Un voucher à montant nul = fiche seule.** C'est ainsi qu'un compte au-dessus de 85 de risque « joue dans le vide » sans être prévenu : le serveur signe `amount = 0`, le vault frappe la fiche et émet `SightingOnly(NoFragment)`.
3. **`claim` consomme l'inventaire par montant, pas par unité entière.** File FIFO entamée depuis la tête, reliquat conservé, au plus 8 unités traversées (`TooFragmented` sinon).
4. **Oracle périmé (> 24 h) ou inventaire vide → revert, nonce non consommé.** Le voucher reste valide jusqu'à sa deadline, puis le serveur réémet sans nouvelle photo.
5. **Marque retirée alors qu'un voucher est en vol → fiche seule, pas de fragment.**
6. **Le budget se décide à l'avance** : `setDailyBudget` s'applique au lendemain.
7. **Rareté et chasse vivent dans `SpotRegistry`.** Le ±35 % et le clamp [0,4 ; 8,0] sont appliqués on-chain ; la chasse est en commit-reveal, engagement pour un jour strictement futur, révélation ouverte à tous.
8. **`currentMultiplier()`** est supposé être un getter 18 décimales sur le Stock Token. **À confirmer sur le contrat réel avant mainnet.**
9. **Le critère de liquidité à l'admission** (pool ≥ 100 000 $) est vérifié par le script d'admission du keeper, pas on-chain.
10. **`migrate` est l'exception explicite à l'invariant 5.**
11. **Le contre-angle n'estime pas une homographie complète** : il mesure le déplacement médian et la non-uniformité du champ de flot entre les deux clichés, plus la cohérence CLIP et le pHash. Une transformation trop proche de l'identité est un rejet (`server/src/claim/counterAngle.ts`).
12. **L'escalade vision appelle Claude** (`claude-opus-5`, sorties structurées, effort bas) avec la phrase de la spec ; sans clé API, la bande médiane est refusée et la métrique d'escalade le montre.
13. **Le serveur prédit `paid`** avec l'état du budget lu on-chain au moment de la signature ; c'est le contrat qui tranche à l'exécution.
14. **wagmi 3** (spec : v2) — la v3 est la génération courante ; l'API utilisée est la même. Le wallet embarqué par passkey se branche comme connecteur supplémentaire.

## Ce qu'il manque encore, honnêtement

- **Les poids ONNX** : `clip-vision.onnx` (ViT-B/32, 352 Mo) et `face.onnx` (UltraFace-320) sont téléchargés dans `server/models/` (voir DEPLOY.md pour les refaire) ; `plate.onnx` (YOLO11 nano plaques, morsetechlab, AGPL-3.0) se télécharge comme les deux autres avec `pnpm models` (`scripts/fetch-models.mjs`), et l'image Docker les embarque au build. Le corpus de référence est en mode zero-shot (invites textuelles CLIP, `scripts/build-refs.mjs`) : il fonctionne partout dès le premier jour, la bande médiane part en escalade ; les vraies photos du test terrain le remplacent marque par marque avec `scripts/add-ref.mjs`.
- **Les adresses réelles sur Robinhood Chain** : Stock Tokens, feeds Chainlink, USDG, WETH, routeur et pools Uniswap V4, feed ETH/USD. `keeper/src/chain.ts › buildRoute` est volontairement une erreur explicite tant qu'elles ne sont pas connues.
- **Le nom et l'échelle réels de `currentMultiplier()`.**
- **L'abonnement** (source de revenu n° 2) et son effet sur les quotas (le champ `subscriber` existe déjà partout).
- **Le test terrain** : 200 prises à la main, dans la rue, sur 3 téléphones. Si le taux de faux rejets dépasse 8 %, on ne va pas plus loin. Les seuils de la couche 3 (`PLANAR_VARIANCE_MAX`, `PEAK_RATIO`, `EDGE_COVERAGE`, `LUMINANCE_STD_MIN`) sont calibrés sur des images synthétiques et **doivent** être réglés sur ce panel.
- Les smart wallets (passkey) doivent implémenter `onERC1155Received` / `onERC721Received`, sinon la frappe de la fiche fait échouer le claim.
