# Mettre SPOT en production

Ce document est la liste complète, dans l'ordre, de ce qu'il faut faire pour passer de la démo à un service ouvert à tout le monde. Tout ce qui est marqué **toi** demande un compte, une clé, de l'argent ou une décision que le code ne peut pas prendre. Tout le reste est déjà écrit et testé.

## 0. Ce qui est déjà prêt

- Contrats (`contracts/`) : registre des marques, coffre, fiches, planches, swapper. 105 tests dont 5 invariants.
- Serveur de prise (`server/`) : les six couches de vérification, les modèles ONNX (CLIP ViT-B/32, UltraFace) déjà téléchargés dans `server/models/`, un corpus de référence zero-shot pour les 134 marques, la synchronisation des marques depuis la chaîne, la règle des régions (fragment ou fiche seule), 51 tests.
- Keeper (`keeper/`) : inventaire, rareté, chasse commit-reveal. Testé en écriture sur une chaîne locale.
- PWA (`app/`) : tout le produit, carte interactive, mode démo et mode réel.
- Packaging : `docker-compose.yml` (Postgres, Redis, MinIO, serveur, keeper), Dockerfiles, migrations SQL (`server/drizzle/0000_init.sql`), fichiers `.env.example` dans chaque dossier.

Vérifié de bout en bout en local : chaîne anvil → déploiement → serveur qui lit les marques et le budget on-chain → keeper qui écrit la rareté → app en mode réel.

## 1. Comptes et services à ouvrir (**toi**)

| Besoin | Service conseillé | Sert à |
|---|---|---|
| Nom de domaine + DNS | Cloudflare | le site, l'API, et l'en-tête `cf-ipcountry` (pays du joueur) |
| Hébergement de la PWA | Vercel (ou tout hôte Node) | `app/` |
| Hébergement du back end | Fly.io, Render, Hetzner ou un VPS avec Docker | `docker-compose.yml` |
| Postgres managé | Neon, Supabase, RDS, ou le conteneur du compose | fiches, comptes, risques |
| Redis managé | Upstash ou le conteneur du compose | quotas |
| Stockage S3 | Cloudflare R2 ou AWS S3 | photos traitées |
| AWS KMS | AWS | la clé qui signe les bons de retrait (jamais en clair) |
| Anthropic | console.anthropic.com | escalade vision (`ANTHROPIC_API_KEY`) |
| Wallet opérateur | un hardware wallet ou un multisig Safe | déployer et posséder les contrats |
| Wallet keeper | un hot wallet dédié, peu d'ETH | rareté, chasse, dépôts d'inventaire |
| ETH sur Robinhood Chain | bridge Arbitrum → Robinhood Chain | le gaz des transactions |
| Stock Tokens | Robinhood (achat) puis transfert au coffre | l'inventaire distribué aux joueurs |

Sur Cloudflare, activer la transformation « Add visitor location headers » pour que `cf-ipcountry` et `cf-ipcity` arrivent au serveur : c'est ce qui décide du pays (fragment ou fiche seule) et de la ville sur la carte.

## 2. Le cadre légal (**toi**, avant tout le reste)

- Les Stock Tokens Robinhood sont des titres de dette tokenisés réservés à certaines juridictions (pas États-Unis, Canada, Royaume-Uni, Suisse). Le serveur applique déjà cette règle. Vérifie avec un avocat si distribuer ces tokens comme récompense demande une licence là où tu opères (MiCA / MiFID en Europe). C'est le point qui peut bloquer tout le projet.
- Les logos et noms de marques sont utilisés pour identification. `LEGAL.md` et la page `/marques` décrivent la règle de retrait sous 48 h. Garde une adresse de contact réelle pour les marques.
- RGPD : photos floutées (visages) et supprimables par le joueur, ville seule, pas de position précise. La page `/vie-privee` doit porter le nom de l'entité responsable.

## 3. Déployer les contrats

```bash
cd contracts
export OWNER=0x…          # le multisig qui possédera les contrats
export SIGNER=0x…         # l'ADRESSE de la clé KMS du serveur (jamais la clé)
export KEEPER=0x…         # le wallet du keeper
export GUARDIAN=0x…       # qui peut mettre le coffre en pause
export DAILY_BUDGET_USD=20000000000   # 200 $ en 8 décimales
export BONUS_TOKEN=0x…    # USDG sur Robinhood Chain (réserve des primes de planches)
export SIGHTINGS_URI="https://api.ton-domaine/fiche/{id}"
export PLATES_BASE_URI="https://api.ton-domaine/planche/"
forge script script/Deploy.s.sol --rpc-url https://rpc.mainnet.chain.robinhood.com --broadcast --verify
```

Puis, depuis le multisig, `acceptOwnership()` sur les quatre contrats. Note les quatre adresses : elles vont dans les `.env` du serveur, du keeper et de l'app.

**À confirmer avant mainnet (toi + un développeur Solidity) :** le nom et l'échelle réels de `currentMultiplier()` sur les Stock Tokens, et les adresses des flux de prix (`latestRoundData`, format Chainlink) sur Robinhood Chain. Sans flux de prix, le coffre ne peut pas valoriser les fragments.

## 4. Admettre les marques et créer les planches

Chaque marque = un Stock Token + un flux de prix + un secteur. Une admission par transaction du keeper :

```bash
cast send $REGISTRY "addBrand(string,address,address,uint16)" "Amazon" $AMZN_TOKEN $AMZN_FEED 1 --rpc-url … --private-key $KEEPER
```

L'ordre d'admission fixe les identifiants (1, 2, 3…). Le corpus de référence `server/models/refs/index.json` est numéroté comme la démo (`app/lib/demo.ts`) : admets les marques dans cet ordre, ou régénère le corpus après admission avec `node scripts/build-refs.mjs`. Les planches se créent avec `addPlate(name, brandIds[], opensAt)`.

Critère de la spec : un pool de liquidité d'au moins 100 000 $ par marque. Sans DEX opérationnel sur Robinhood Chain, l'inventaire se constitue à la main : achat des tokens, transfert au coffre, puis `depositUnits(brandId, amounts)` par le keeper. Le keeper automatise ça (`keeper/src/inventory.ts`) dès que les adresses du routeur et des pools Uniswap V4 sont connues (`ROUTER_ADDRESS`, `USDG_ADDRESS`, `WETH_ADDRESS`).

## 5. Le back end

```bash
cp server/.env.example server/.env    # remplir : DATABASE_URL, REDIS_URL, S3_*, SIGNER_KMS_KEY_ID, ANTHROPIC_API_KEY, adresses des contrats
cp keeper/.env.example keeper/.env    # remplir : adresses, KEEPER_PRIVATE_KEY
docker compose up -d --build
docker compose exec postgres psql -U spot -d spot -f /migrations/0000_init.sql
docker compose logs -f server         # doit afficher « marques synchronisées depuis le registre »
```

En production le serveur refuse de démarrer sans Postgres, Redis, S3, KMS et les modèles. Le dossier `server/models/` doit contenir :

- `clip-vision.onnx` — déjà téléchargé (Xenova/clip-vit-base-patch32, `onnx/vision_model.onnx`).
- `face.onnx` — déjà téléchargé (UltraFace version-RFB-320).
- `plate.onnx` — **toi** : à exporter une fois sur une machine avec Python :
  `pip install ultralytics && python -c "from ultralytics import YOLO; YOLO('best.pt').export(format='onnx', imgsz=640)"` avec `best.pt` du dépôt Hugging Face `keremberke/yolov5n-license-plate`, puis copier le `.onnx` sous ce nom.
- `refs/` — déjà généré en zero-shot. Après le test terrain, ajoute les vraies photos marque par marque : `node scripts/add-ref.mjs <brandId> photo1.jpg photo2.jpg …` (20 à 40 par marque).

Mettre l'API derrière Cloudflare (proxy orange) sur `api.ton-domaine`, HTTPS obligatoire (la caméra ne s'ouvre qu'en HTTPS).

## 6. La PWA

Sur Vercel : importer le dossier `app/`, et définir les variables :

```
NEXT_PUBLIC_DEMO=0
NEXT_PUBLIC_API_URL=https://api.ton-domaine
NEXT_PUBLIC_RPC_URL=https://rpc.mainnet.chain.robinhood.com
NEXT_PUBLIC_VAULT_ADDRESS=0x…
NEXT_PUBLIC_SIGHTINGS_ADDRESS=0x…
NEXT_PUBLIC_PLATES_ADDRESS=0x…
```

Domaine principal sur Cloudflare devant Vercel, pour que le middleware reçoive `cf-ipcountry`. Le site marche aussi sur un VPS : `NEXT_DIST_DIR=.next-prod pnpm build && pnpm start -p 3005` derrière un reverse proxy HTTPS.

## 7. Le test terrain, avant d'ouvrir (**toi**, avec deux ou trois amis)

C'est l'étape 12 de la spec, et elle décide de la suite.

1. Sur testnet ou sur mainnet avec un budget de 20 $, 200 prises réelles dans la rue, sur au moins 3 téléphones différents, dans la lumière du jour, la nuit, sous la pluie.
2. Note chaque rejet. Si plus de 8 % des vraies prises sont refusées, on règle les seuils de la couche 3 dans `server/src/vision/` (`PLANAR_VARIANCE_MAX`, `PEAK_RATIO`, `EDGE_COVERAGE`, `LUMINANCE_STD_MIN`) et ceux de CLIP (`ZS_ACCEPT_SCORE`, `ZS_REJECT_SCORE`, puis `ACCEPT_THRESHOLD` / `REJECT_THRESHOLD` quand les vraies références existent).
3. Les photos validées deviennent le corpus de référence (`scripts/add-ref.mjs`). C'est ce qui rend la reconnaissance nette sans dépendre de l'escalade.
4. Essaye de tricher : écran, impression, photo de photo, deux comptes sur le même téléphone. Chaque triche qui passe est un seuil à serrer.

## 8. Ouvrir

- Passer `DAILY_BUDGET_USD` à la valeur voulue (le changement s'applique le lendemain, `setDailyBudget`).
- Approvisionner le coffre pour au moins 4 h de couverture (`MIN_COVERAGE_HOURS`), le keeper surveille et alerte.
- Publier 30 jours d'engagements de chasse : `pnpm --dir keeper once:hunt` (il faut au moins 5 marques actives).
- Surveiller `GET /stats` (taux de rejet, escalades, comptes à risque, budget du jour) et les journaux du serveur.

## 9. Ce qui reste volontairement ouvert

- L'abonnement (prises illimitées, fiches HD) : le champ `subscriber` existe partout, pas d'encaissement.
- L'achat automatique d'inventaire : `keeper/src/chain.ts › buildRoute` attend les adresses Uniswap V4 réelles.
- Les smart wallets par passkey doivent implémenter `onERC1155Received` / `onERC721Received`.

## Ta liste, en bref

1. Un avocat pour la question des tokens comme récompense.
2. Domaine + Cloudflare, Vercel, un hôte Docker, Postgres, Redis, R2/S3, KMS, clé Anthropic.
3. Deux wallets (opérateur multisig, keeper) avec de l'ETH sur Robinhood Chain.
4. Les adresses des Stock Tokens, des flux de prix, de l'USDG et, si possible, des pools.
5. Déployer les contrats, admettre les marques, acheter et déposer l'inventaire.
6. Exporter `plate.onnx` avec Python.
7. Remplir les `.env`, `docker compose up`, appliquer la migration, déployer la PWA.
8. Le test terrain à 200 prises, régler les seuils, constituer les vraies références.
9. Ouvrir, surveiller, ajuster le budget.
