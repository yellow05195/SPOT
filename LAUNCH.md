# Sortir SPOT en une heure

Le plan minute par minute pour ouvrir le site aujourd'hui. Il complète `DEPLOY.md` (le détail de chaque brique) et suppose que le dépôt GitHub est à jour.

Le principe du jour J : **fiches d'abord, fragments ensuite.** Le serveur démarre avec `FRAGMENTS_ENABLED=false` : tout le jeu fonctionne (lens, vérification, fiches, planches, carte, chasse du jour), chaque photo validée est enregistrée sur la chaîne, mais aucun Stock Token ne circule. Les fragments s'allument en changeant une variable, quand l'inventaire est dans le coffre et que l'avocat a répondu. Cela évite de bloquer la sortie sur les adresses de tokens, les flux de prix et le cadre légal.

## Ce qui est vérifié, aujourd'hui, sur cette machine

| Brique | État |
|---|---|
| Contrats | 105 tests verts, `Deploy.s.sol` prêt pour Robinhood Chain (chain id 4663, mainnet ouvert depuis juillet 2026) |
| Serveur | tests verts, build propre, `/health`, migration au démarrage, modèles téléchargés au build de l'image (CLIP, visages, plaques) |
| Keeper | build propre, image Docker |
| App | build de production propre en mode réel, 404, robots, sitemap, aperçu Open Graph, mode "fragments en pause" |
| Bout en bout | une vraie prise (lens, serveur, bon signé, claim on-chain, fiche) enregistrée en vidéo sur une chaîne locale |
| Infra | `render.yaml` (base, Redis, serveur, keeper, disque photos), `app/vercel.json`, CI GitHub sur chaque push |

## Avant de lancer le chrono (toi, 10 minutes)

1. Un compte [Render](https://render.com) et un compte [Vercel](https://vercel.com), tous deux connectés au GitHub `yellow05195`.
2. Une clé Anthropic (console.anthropic.com) : sans elle les photos douteuses sont refusées au lieu d'être revues.
3. Un wallet avec **0,05 ETH sur Robinhood Chain** pour déployer et admettre les marques (bridge depuis Arbitrum, ou retrait depuis Robinhood vers Robinhood Chain). Sans ETH sur cette chaîne, rien ne se déploie : c'est le seul point qui peut prendre plus d'une heure.
4. Foundry installé (`~/.foundry/bin` est déjà là sur ce PC).

## Le chrono

### 0 à 5 min : trois clés

Dans un terminal, trois wallets neufs. Note chaque adresse et chaque clé dans ton gestionnaire de mots de passe, jamais dans un fichier du dépôt.

```bash
~/.foundry/bin/cast wallet new
```

Une fois pour SIGNER (signe les bons de retrait, côté serveur), une fois pour KEEPER (rareté et chasse, un peu d'ETH), une fois pour GUARDIAN (peut mettre le coffre en pause).

Le déployeur (celui qui a l'ETH) devient `OWNER` pour aujourd'hui. Passe la propriété à un multisig Safe dès la première semaine (`transferOwnership` puis `acceptOwnership`).

### 5 à 15 min : les contrats sur Robinhood Chain

```bash
cd contracts && OWNER=0xDEPLOYEUR SIGNER=0xSIGNER KEEPER=0xKEEPER GUARDIAN=0xGUARDIAN DAILY_BUDGET_USD=20000000000 BONUS_TOKEN=0x000000000000000000000000000000000000dEaD SIGHTINGS_URI="https://TON-API/fiche/{id}" PLATES_BASE_URI="https://TON-API/planche/" ~/.foundry/bin/forge script script/Deploy.s.sol --rpc-url https://rpc.mainnet.chain.robinhood.com --broadcast --private-key 0xCLE_DU_DEPLOYEUR
```

`BONUS_TOKEN` est la réserve des primes de planches : l'adresse d'USDG sur Robinhood Chain quand tu l'as, le placeholder sinon (aucune prime ne part tant que le coffre n'en détient pas). Note les quatre adresses affichées : Registry, Vault, Sightings, Plates. Elles se vérifient sur [robinhoodchain.blockscout.com](https://robinhoodchain.blockscout.com).

Puis les 134 marques, dans l'ordre du catalogue (l'ordre fixe les identifiants, et le corpus de reconnaissance est numéroté pareil) :

```bash
CARDS_ONLY=1 REGISTRY=0xREGISTRY RPC_URL=https://rpc.mainnet.chain.robinhood.com PRIVATE_KEY=0xCLE_DU_DEPLOYEUR node contracts/scripts/admit-brands.mjs
```

`CARDS_ONLY=1` admet chaque marque sans token ni flux de prix (`addBrandCardsOnly`) : correct tant que `FRAGMENTS_ENABLED=false`. Quand tu auras les vraies adresses, remplis `contracts/brands.json` et branche-les marque par marque avec `setBrandAssets(id, token, feed)`, sans redéployer. Si le script s'arrête, il indique `--from <id>` pour reprendre.

### 15 à 30 min : le back end sur Render

1. Render, New, Blueprint, dépôt `yellow05195/SPOT`. Le fichier `render.yaml` crée la base, le Redis, le serveur et le keeper.
2. Renseigne les secrets demandés : `SIGNER_DEV_PRIVATE_KEY` (la clé SIGNER), `KEEPER_PRIVATE_KEY`, `ANTHROPIC_API_KEY`, les adresses `VAULT_ADDRESS`, `REGISTRY_ADDRESS`, `SIGHTINGS_ADDRESS`, et `PUBLIC_MEDIA_BASE_URL` = `https://spot-server.onrender.com/media` (adapte au nom que Render te donne).
3. Le premier build télécharge 360 Mo de modèles : compte 6 à 8 minutes. Pendant ce temps, passe à Vercel.
4. Vérifie : `https://spot-server.onrender.com/health` répond `ok: true` avec l'adresse SIGNER, et `/chasse` liste le budget du jour. Le journal doit contenir « marques synchronisées depuis le registre ».

`ALLOW_HOT_SIGNER=true` est le mode lancement : la clé qui signe les bons vit dans les variables Render. C'est acceptable avec `FRAGMENTS_ENABLED=false` et un petit budget. Avant d'allumer les fragments, passe à AWS KMS (`SIGNER_KMS_KEY_ID`) comme décrit dans `DEPLOY.md`.

### 30 à 40 min : le site sur Vercel

1. Vercel, Add New, Project, dépôt `SPOT`, **Root Directory = `app`**, framework Next.js détecté.
2. Variables d'environnement :

```
NEXT_PUBLIC_DEMO=0
NEXT_PUBLIC_SITE_URL=https://spot-xxx.vercel.app
NEXT_PUBLIC_API_URL=https://spot-server.onrender.com
NEXT_PUBLIC_RPC_URL=https://rpc.mainnet.chain.robinhood.com
NEXT_PUBLIC_VAULT_ADDRESS=0x...
NEXT_PUBLIC_SIGHTINGS_ADDRESS=0x...
NEXT_PUBLIC_PLATES_ADDRESS=0x...
```

3. Deploy. L'URL `*.vercel.app` est en HTTPS, donc la caméra s'ouvre. Le nom de domaine viendra après : dans Vercel, Domains, puis Cloudflare devant (proxy orange et « Add visitor location headers ») pour que le pays du joueur arrive au serveur. Sans Cloudflare, Vercel fournit déjà le pays via son propre en-tête, le middleware le lit.

### 40 à 50 min : la première vraie prise

Sur ton téléphone, ouvre l'URL Vercel, connecte un wallet qui a quelques centimes d'ETH sur Robinhood Chain (MetaMask : réseau Robinhood Chain, chain id 4663, RPC ci-dessus), va sur une marque, ouvre la lens, photographie une enseigne dans la rue. Attendu : « in the notebook », tampon « card only », la fiche dans le carnet, le pin sur la carte, et la transaction visible sur blockscout depuis ton wallet.

Si la photo est refusée « objet non reconnu » alors que la marque est bien là, c'est le corpus zero-shot qui manque de vraies références : ajoute tes photos validées avec `node server/scripts/add-ref.mjs <id> photo.jpg ...` (voir `DEPLOY.md` § 7).

### 50 à 55 min : le keeper

Le keeper tourne déjà sur Render. Publie les engagements de chasse pour 30 jours (il faut au moins 5 marques actives, c'est le cas) :

```bash
cd keeper && pnpm once:hunt
```

avec un `.env` local contenant les mêmes variables que sur Render, ou depuis le shell Render du service `spot-keeper`. Sans engagements, la chasse du jour est vide et toutes les prises paient à 30 % (ce qui ne change rien tant que les fragments sont en pause).

### 55 à 60 min : sortir

Tweet principal avec le teaser (`brand/video/spot-teaser-x.mp4`), le lien en première réponse, la bio, épinglé. Les textes sont prêts dans la conversation et se recopient tels quels.

## Après la sortie, dans l'ordre

1. Surveiller `/stats` et le journal Render la première heure : taux de rejet, escalades, erreurs.
2. Domaine : Cloudflare devant Vercel pour le site, Cloudflare devant Render pour `api.` ; mettre à jour `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_API_URL`, `PUBLIC_MEDIA_BASE_URL`, `SIGHTINGS_URI` / `PLATES_BASE_URI` (setters du registre).
3. Photos : passer du disque Render à R2/S3 (`S3_BUCKET`, `S3_PUBLIC_BASE_URL`), les fichiers déjà servis restent valables le temps de migrer.
4. Multisig Safe comme propriétaire des quatre contrats, KMS pour le signer.
5. Allumer les fragments : réponse de l'avocat, adresses des Stock Tokens et des flux Chainlink dans `contracts/brands.json`, inventaire déposé dans le coffre (`depositUnits`), puis `FRAGMENTS_ENABLED=true` sur Render. Rien d'autre à changer : l'app affiche déjà les fragments dès que le serveur les rend.
6. Le test terrain à 200 prises et les vraies références (`DEPLOY.md` § 7) : c'est ce qui rend la reconnaissance nette.

## Ce que le lancement n'inclut pas, et pourquoi

- **Aucun Stock Token distribué le jour J.** Volontaire : les adresses des tokens et des flux de prix restent à confirmer sur Robinhood Chain, et la question légale (titres tokenisés donnés en récompense, MiCA/MiFID en Europe) doit être tranchée par un avocat. Le jeu complet tourne sans.
- **Le détecteur de plaques** est le modèle YOLO11 nano fine-tuné de morsetechlab (licence AGPL-3.0, poids publics et non modifiés, donc conformes tels quels). Un modèle sous licence permissive peut le remplacer sans toucher au code (`models/plate.onnx`, entrée 640×640, sortie [1, 5, 8400]).
- **Le paiement automatique d'inventaire** attend les adresses Uniswap V4 sur Robinhood Chain (`keeper/.env.example`).
