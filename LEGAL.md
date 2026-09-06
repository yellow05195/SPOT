# LEGAL — choix juridiques de SPOT

Ce document décrit ce que SPOT fait, ne fait pas, et pourquoi. Il est écrit pour être lu, pas pour se couvrir. Il n'est pas un avis juridique.

## 1. Ce que sont les Stock Tokens

Les Robinhood Stock Tokens **ne sont pas des actions**. Ce sont des titres de dette tokenisés émis par **Robinhood Assets (Jersey) Limited**. Le détenteur est créancier de l'émetteur, pas actionnaire : il n'a ni droit de vote, ni titre de propriété sur une action.

En conséquence, l'interface de SPOT n'écrit **jamais** « tu possèdes une action Amazon ». Elle écrit **« exposition économique à AMZN »**. Ce point est non négociable et vérifié dans la revue de chaque écran.

Les Stock Tokens ne sont pas enregistrés sous le Securities Act de 1933. Robinhood applique ses restrictions au niveau de son application, pas de l'actif : les tokens sont des ERC-20 transférables sans KYC. **La conformité repose donc entièrement sur SPOT.**

## 2. Juridictions bloquées

Bloquées en dur, sans exception ni contournement :

- États-Unis
- Canada
- Royaume-Uni
- Suisse
- toute juridiction ou personne figurant sur les listes OFAC

Mise en œuvre :

1. **Géo-blocage IP en edge** (middleware Next.js + en-tête pays Cloudflare), jamais côté client. **L'absence de pays détecté bloque aussi** : le défaut est le refus.
2. **Écran d'acceptation** avec une case explicite « je ne suis pas une US person ».
3. **Aucune option « continuer quand même »**, aucune mention de VPN, aucun bouton de contournement — y compris sur la page `/indisponible`, que beaucoup de gens ne verront que seule.
4. Les restrictions sont rappelées sur `/legal`.

Ce que ça ne garantit pas : un utilisateur déterminé peut masquer son adresse IP. SPOT n'y consent pas, ne l'aide pas, et se réserve le droit de suspendre les comptes concernés.

## 3. Aucune promesse de rendement

SPOT est un jeu de collection. Le fragment est **la note en bas de la page**, pas le produit.

- Les mots `investment`, `investissement`, `rendement`, `profit`, `returns`, `APY` n'apparaissent **nulle part** : ni dans l'interface, ni dans le code, ni dans la communication.
- Les montants sont volontairement petits (ordre de 0,50 $ par prise) et affichés comme tels.
- Aucune projection, aucun historique de « gains », aucun classement par valeur.

## 4. Marques

Le jeu repose sur la présence physique de marques qui n'ont rien autorisé. Règles :

- **Aucun logo n'est reproduit**, nulle part : ni dans l'application, ni sur les fiches, ni en marketing. Le nom de la marque est écrit **en toutes lettres, à la main**, comme un naturaliste note le nom d'une espèce.
- **Aucun nom de marque dans un nom de produit, de série ou de planche.** Les planches portent des noms de secteurs : `Logistique`, `Boissons`, `Mobilité`.
- **Aucune suggestion de partenariat, d'approbation ou d'affiliation.**
- **Procédure de retrait :** toute marque qui le demande sort du jeu **sous 48 h, sans discussion**. Techniquement, `SpotRegistry.deactivate(brandId)` s'exécute en une transaction et prend effet immédiatement ; l'objectif opérationnel est moins de 5 minutes entre la décision et l'exécution. Les fiches déjà obtenues par les joueurs restent valides : on ne réécrit pas leur histoire, mais la distribution du token de cette marque s'arrête à l'instant du retrait. L'adresse de contact est publiée sur `/marques`.

## 5. Vie privée

Les joueurs photographient des lieux réels, avec des gens dedans. Ce que SPOT stocke, et ce qu'il ne stocke jamais :

| Stocké | Jamais stocké |
|---|---|
| une image **traitée** : EXIF supprimés, visages et plaques floutés, 1600 px max, WebP | l'image originale (traitée en mémoire, jamais écrite sur disque) |
| le SHA-256 de cette image traitée (on-chain) | les métadonnées EXIF |
| une **ville** (`Lyon, FR`, sous forme de code) | des coordonnées GPS, sous quelque forme que ce soit |
| la date et l'heure de la prise | les visages nets |

Le joueur peut **supprimer une fiche** à tout moment : l'image est réellement effacée du stockage ; le hash et le fragment restent acquis. La page `/vie-privee` l'explique en français clair.

## 6. Ce que le contrat garantit, et ce qu'il ne garantit pas

- **Rien n'est frappé** : le vault ne distribue que des tokens qu'il détient déjà. Vérifiable on-chain, en permanence, sur `/vault`.
- **Budget quotidien fixe**, décidé la veille, jamais dépassé (invariant testé).
- **Pas de proxy, pas d'upgrade** : le code déployé est le code final.
- Le claim server est le **point de confiance central** : il décide qui reçoit un voucher. Voir [`SECURITY.md`](SECURITY.md).

## 7. Sources de financement, dites honnêtement

1. Une taxe créateur sur un éventuel token $SPOT (phase 2, optionnelle) financerait le lancement — **et mourrait avec le volume**.
2. Un abonnement (prises illimitées, fiches HD) est la seule source qui grandit avec l'usage.
3. L'attribution de visite pour les marques est un débouché possible **sans aucun client à ce jour**. Le projet est construit pour tenir sans.

Le token $SPOT, s'il existe un jour, **ne finance rien du jeu** et **n'est jamais versé aux joueurs**.
