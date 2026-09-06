# SECURITY — modèle de menace de SPOT

> Ce système n'est **pas infalsifiable**. Il est conçu pour que tricher coûte plus cher que la récompense. Ce document dit ce que chaque composant peut faire, ce qui le limite, et où sont les trous connus.

## 1. Le raisonnement chiffré

Un fragment vaut en moyenne **0,50 $** (budget 200 $/jour, ~400 prises), entre 0,20 $ et 4 $ selon la rareté. Un compte est limité à 4 prises/jour, 1 par marque et par jour, 20 minutes entre deux prises, 2 wallets par appareil, 6 par IP. Un nouveau wallet touche 25 % du tarif pendant 24 h.

Un tricheur parfait, jamais détecté, gagne donc au plus **~2 $/jour par compte** le premier jour, ~8 $/jour ensuite. Pour que ça vaille une ferme, il faut des dizaines de comptes sur des appareils et des IP distincts, chacun capable de produire **deux angles cohérents du même objet réel en moins de 60 secondes** à la demande (contre-angle). C'est ce coût-là qu'on cherche à maintenir au-dessus du gain — pas l'impossibilité.

**Corollaire :** augmenter les fragments pour doper l'acquisition est précisément ce qui rend les fermes rentables. C'est interdit par conception (spec, partie 11).

## 2. Ce que peut faire chaque composant

### Le claim server — le point de confiance central

Le serveur **peut signer un voucher pour n'importe qui**, pour n'importe quel montant. Le contrat ne sait pas si une photo existe. C'est le point de confiance unique du système, et il faut le dire.

Ce qui borne un serveur compromis :

- **le budget quotidien** on-chain : quoi qu'il signe, le vault ne verse jamais plus que `dailyBudgetUsd` par jour (invariant 2) ;
- **l'inventaire** : il ne peut distribuer que ce que le keeper a acheté, marque par marque ;
- **la pause asymétrique** (§4) : dès la détection, le guardian ferme l'entrée ; les vouchers antidatés expirent mécaniquement au bout de 30 minutes ;
- **la rotation** : `signer` est immuable ; on déploie un nouveau vault et on migre. C'est volontairement lourd : la clé doit être protégée réellement, en **KMS**, jamais en variable d'environnement en clair. Le script de déploiement ne reçoit que l'adresse.

Perte maximale théorique en cas de compromission de clé : `dailyBudgetUsd` × (jours avant détection), plus 30 minutes.

### Le keeper

Il dépose l'inventaire (`depositUnits`) et écrit la rareté et la chasse. Il ne peut **rien retirer** du vault. Un keeper compromis peut au pire ne plus approvisionner (les claims revertent `InsufficientUnits`, le nonce n'est pas consommé, le voucher reste valide) ou fausser la rareté — bornée on-chain à ±35 % par mise à jour et à [0,4 ; 8,0].

### Le guardian

Il peut **suspendre l'entrée de nouveaux vouchers**. Rien d'autre. Il ne peut pas bloquer un voucher déjà signé, ni toucher aux fonds, ni changer le budget.

### L'owner

Budget du lendemain, admission et retrait des marques, création et clôture des planches, retrait de l'inventaire d'une marque **inactive** uniquement (invariant 5), migration une seule fois vers un contrat successeur. Il ne peut pas retirer l'inventaire d'une marque active, ni bloquer un voucher, ni frapper quoi que ce soit.

### Les contrats

Pas de proxy, pas d'upgrade, pas de `delegatecall`, pas de `tx.origin`, pas de boucle non bornée (dépôt ≤ 200 unités, claim ≤ 8 unités traversées, retrait et migration bornés par `maxUnits`). `ReentrancyGuard` et `SafeERC20` sur tout ce qui transfère. Checks-Effects-Interactions : le nonce est consommé **avant** tout transfert.

## 3. Pourquoi on a renoncé à l'attestation native

Une application native donnerait Play Integrity / App Attest — la meilleure défense anti-émulateur. Une PWA n'a rien d'équivalent.

On y renonce sciemment : une application distribuant des titres financiers tokenisés a une forte probabilité d'être rejetée par les stores, et un rejet en cours de route tue le projet. La PWA ne dépend de personne.

**C'est un compromis, pas une victoire.** On compense en empilant les six couches ci-dessous et, surtout, en gardant les fragments petits.

## 4. La pause asymétrique — comment elle tient sans bloquer les vouchers signés

Le contrat ne peut pas distinguer un voucher « nouveau » d'un « ancien » sans information. Le voucher porte donc `issuedAt`, signé par le serveur, avec deux contraintes :

- `deadline - issuedAt <= 30 minutes` (durée de vie maximale) ;
- `issuedAt <= block.timestamp + 2 minutes` (tolérance d'horloge).

`pauseEntry()` enregistre `entryPausedAt`. Un voucher est refusé si `issuedAt >= entryPausedAt`. Un voucher émis avant passe **toujours**, jusqu'à sa deadline.

Un attaquant qui détient la clé peut antidater `issuedAt` avant la pause — mais alors sa deadline est au plus `issuedAt + 30 min`, donc le voucher expire **30 minutes après la pause au plus tard**. La fenêtre résiduelle est de 30 minutes, bornée par le budget du jour. Test : `test_pause_blocksVouchersIssuedAfter_allowsBefore`.

## 5. Les six couches de vérification — et leurs limites connues

| Couche | Ce qu'elle attrape | Ce qu'elle rate |
|---|---|---|
| 1. Capture (flux caméra, 2 frames, capteurs) | l'import de fichier, la galerie | tout : le client peut mentir sur tout |
| 2. Contrôles mécaniques (EXIF, capteurs nuls/trop réguliers, images identiques, horloge) | les imports naïfs, les rejeux, les générateurs de capteurs simplistes | un générateur de bruit réaliste |
| 3. Parallaxe, moiré, bordure, luminance | la photo d'écran, l'impression | un écran incurvé bien cadré, une photo d'une maquette 3D |
| 4. CLIP local + escalade LLM | l'objet absent, la mauvaise marque | un faux convaincant ; coût à surveiller (taux d'escalade 10–20 %) |
| 5. pHash (même joueur, autres joueurs 30 j, arrière-plan) | la répétition, le partage d'images entre comptes | une nouvelle photo à chaque fois |
| 6. Contre-angle (8 %, 40 % si risque élevé) | quiconque n'est pas devant l'objet | une ferme physique de 50 téléphones dans la même pièce — attrapée alors par les couches 5 (arrière-plan récurrent) et le score de risque (même IP, régularité) |

Le score de risque (0–100) rend le contre-angle systématique au-delà de 60 et coupe les fragments au-delà de 85 **sans prévenir** : bannir pousse à recréer un compte, jouer dans le vide non.

**Le rejet ne consomme jamais de quota.** Sinon le joueur honnête est puni de la nervosité de nos filtres.

## 6. Décisions de politique dans `claim`

| Situation | Comportement | Pourquoi |
|---|---|---|
| Budget du jour épuisé | fiche frappée, pas de fragment, nonce consommé, `SightingOnly` | règle 3 : la fiche prime sur le fragment |
| Marque retirée après signature | fiche frappée, pas de fragment | la fiche reste valide pour toujours ; la distribution s'arrête à l'instant du retrait |
| Oracle périmé (> 24 h), prix ≤ 0, round incomplet | **revert `StalePrice`**, nonce non consommé | on ne paie jamais à un prix inconnu ; le voucher reste valide, le serveur réémet si besoin |
| `currentMultiplier() == 0` ou absent | revert | jamais de valeur par défaut silencieuse — c'est le bug le plus probable du projet |
| Inventaire insuffisant | revert, nonce non consommé | le keeper réapprovisionne, le même voucher passe |
| Voucher expiré | revert | le serveur réémet **sans nouvelle photo**, avec un nouveau nonce |
| Token du voucher ≠ token de la marque | revert | bug serveur : doit échouer bruyamment |
| Montant nul signé par le serveur | fiche frappée, pas de fragment, `SightingOnly(NoFragment)` | score de risque > 85 : le compte joue dans le vide sans être prévenu (spec 4.7) |

## 7. Invariants (Foundry, 10 000 runs)

1. Pour chaque token : `balanceOf(vault) >= reserved[token]` (somme des unités vivantes).
2. `spentTodayUsd <= dailyBudgetUsd`, toujours — garanti par l'application du budget au lendemain seulement.
3. Un nonce n'est jamais consommé deux fois (rejeu tenté systématiquement par le handler).
4. Aucun token ne sort sans voucher valide : `déposé − sorti_par_claim_ou_retrait_inactif == balance`, et aucune contrefaçon (clé attaquante) ne passe.
5. Aucune fonction admin ne retire l'inventaire d'une marque active (`withdrawInventory` tenté sur marques actives). **Exception documentée :** `migrate` + `migrateBrand`, une seule fois, vers un contrat, avec vérification de réception côté successeur.

## 8. Scénarios adversariaux couverts par les tests

| Scénario (spec 9.2) | Test |
|---|---|
| Rejeu du même voucher | `test_claim_replayReverts`, `test_claim_replayAfterSightingOnlyAlsoReverts`, invariant 3 |
| Voucher d'un autre wallet | `test_claim_voucherOfAnotherWalletPaysThatWallet` |
| Voucher expiré puis réémis, nonce différent | `test_claim_expiredReverts_thenReissueWithNewNonceWorks` |
| Budget épuisé en milieu de lot | `test_claim_budgetExhaustedMintsSightingWithoutFragment`, invariant 2 |
| 1 000 claims dans le même bloc | `test_thousandClaimsSameBlock` |
| Clé serveur compromise | §2 + `test_pause_blocksVouchersIssuedAfter_allowsBefore` |
| Serveur hors ligne 24 h | `test_serverOffline24h_…`, puis réémission |
| Chaîne gelée pendant un claim | le voucher expire, réémission sans photo ; l'horloge est `block.timestamp`, jamais `block.number` |
| Prix Chainlink gelé 48 h | `test_stalePrice_revertsWithoutConsumingNonce`, `test_stalePrice_variants` |
| Marque désactivée, voucher en vol | `test_claim_inactiveBrandMintsSightingOnly` |
| Signature portée sur une autre chaîne / un autre vault | `test_claim_domainBoundToChainAndContract` |
| Réentrance pendant la frappe de la fiche | `test_claim_reentrancyBlocked` |
| Ferme de 50 téléphones | `server/test/orchestrate.test.ts` (image partagée → rejet des deux comptes, contre-angle systématique au-delà de 60, montant nul au-delà de 85) ; le score de risque compte les wallets par appareil et par IP |

## 9. Checklist avant déploiement (spec 9.1)

- [x] `ReentrancyGuard` sur toute fonction qui transfère de la valeur
- [x] `SafeERC20` partout
- [x] Checks-Effects-Interactions strict
- [x] Nonce consommé **avant** le transfert
- [x] Domaine EIP-712 lié au chainId et au contrat
- [ ] Clé du signer en KMS (opérationnel — le script ne reçoit que l'adresse)
- [x] `guardian` ne peut jamais bloquer un voucher déjà signé
- [x] Fraîcheur des feeds Chainlink vérifiée (admission et claim)
- [x] `currentMultiplier` appliqué partout où un prix est lu — test dédié
- [x] Décimales testées sur 6 / 8 / 18 (`test_bonusDecimals_6_8_18`, `test_feedDecimals_normalizedTo8`)
- [x] Aucune boucle non bornée
- [x] Pas de proxy, pas d'upgrade, pas de `tx.origin`, pas de `delegatecall`
- [x] Aucune image originale écrite sur disque (`server/src/media/process.ts` : tout en mémoire, seule la version traitée est écrite)
- [x] Aucune coordonnée GPS stockée nulle part (`cityCode` = hachage de « Ville, CC » ; le client n'envoie jamais de position)

## 10. Divulgation

Une faille se signale en privé, avant toute publication, à l'adresse indiquée sur `/marques` et `/legal` (à définir avant le testnet). Engagement : accusé de réception sous 48 h, correctif ou mitigation avant toute divulgation, crédit public si souhaité. Pas de programme de prime pour l'instant — on le dit plutôt que de le laisser croire.
