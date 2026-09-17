# Chantier C — Fluidité et UX du CRM

Brief du 2026-09-16 (remplace les précédents sur C, D, E, F). Principe : un
bon affichage par défaut d'abord, la personnalisation sur place ensuite,
jamais une nouvelle carte de réglages ; chaque amélioration mesurée
avant / après.

Trois parties : **1. correctifs immédiats** (ce document, §1) ; **2. audit
UX et pains métier** (`docs/audit-ux-et-metier.md`, document seul — FAIT
le 2026-09-17 : mesures contre le site en ligne, scénarios de création
chronométrés, pains sourcés, plan noté) ; **3. construction** après
validation, ordonnée avec le chantier B.

## 1. Correctifs immédiats — faits le 2026-09-16

### 1.1 « Visite guidée » : un clic ne faisait rien

**Cause.** La carte de la visite vit dans le layout de l'application, qui
survit à la navigation. Elle ne lisait `?visite=1` qu'au MONTAGE : un clic
sur « Visite guidée » (premiers pas, menu de compte, palette, bandeau de la
démo) menait bien à `/dashboard?visite=1`, mais la carte, déjà montée avec
un état « masqué » ou « terminé », restait fermée. Seul un rechargement
complet relançait la visite — ce que ni un lien ni un menu ne font.

**Correction** (`src/components/tour/tour-card.tsx`). Chaque apparition du
paramètre remet la visite au premier pas (état dérivé, posé pendant le
rendu — pas de `setState` dans un effet), puis l'effet écrit le cookie et
retire `?visite=1` de l'adresse sans rechargement, pour qu'un rechargement
ou un lien copié ne relance pas la visite à leur tour.

### 1.2 Réglages, carte « Envois automatiques »

Interrupteur, plafond par contact et fenêtre d'envoi tiennent sur UNE ligne
dès `md` (grille à trois colonnes alignée en haut, chaque réglage avec son
aide dessous), et les textes sont réécrits en français simple — avant :
« Coupé : l'action « envoi automatique » ne prépare rien et la vague refuse
de partir » ; après : « Décoché : aucun email automatique n'est préparé ni
envoyé. Les tâches, les notifications et les brouillons continuent. » La
phrase de la fenêtre : « Du lundi au vendredi, heure de {fuseau}. En dehors
de cette fenêtre, l'écran de la vague le signale ; c'est toujours ton clic
qui envoie. » (fr et en, `rules.settingsCard`).

Le sommaire des réglages (douze liens) défilait horizontalement sur un
portable, sans barre visible : les dernières sections (collecte, motifs)
étaient hors champ. Dès `md`, il se replie sur deux lignes.

Les autres cartes des réglages ont été relues sur captures (fr, en) : voir
§1.6 pour ce qui a été retouché.

### 1.3 Anglais : ce qui restait en français

**Le contrôle automatique.** `src/i18n/messages.test.ts` (vitest) échoue
si une clé de `fr` manque dans une autre langue, s'il y en a une en trop, si
un message ne se lit pas en ICU, ou si les ARGUMENTS ICU diffèrent
(variables, pluriels, balises). À sa première exécution il a trouvé trois
dérives : `analytics.partenaires.n_expires` et `n_revoques` (pluriel en
français, variable simple en anglais) et
`watch.competitors.article_articles_…` (« classified » utilisé deux fois en
français, une en anglais) — corrigées.

**La liste des textes non traduits**, établie par un balayage au navigateur
(build de production, tous les écrans, une organisation jetable en anglais
avec des données anglaises, puis l'organisation de démo vue en anglais) et
par la relecture des exemptions de la règle ESLint `no-visible-text` :

| Où | Texte | Correction |
|---|---|---|
| Fiche contact et affaire, journal | « Activité » (titre par défaut du composant `Journal`) | `activities.journal.activite` |
| Journal de l'affaire | « Origine rattachée : … » écrit dans `deal_events.message` | `settings.queries.origine_rattachee`, dans la langue de la personne qui rattache |
| Brief de la newsletter « pour ce contact » | « chez {société} », « « {titre} » (étape {étape}) » | `contacts.queries.chez_societe`, `affaire_a_l_etape` |
| Journal unifié | « Partenaire », « (partenaire) » pour l'acteur d'un partage | `activities.queries.acteur_partenaire`, `partenaire` |
| Sélecteur de cible du composeur | « contact » + « s » collé | `newsletters.newsletterEditor.cible_n_contacts` (pluriel ICU) |
| Composeur (génération IA) | message de l'exception `AITruncatedError` | `newsletters.apiAiDesign.reponse_ia_tronquee_reessaie` |
| Export analytique | deux réponses 400 en français | `analytics.export.*` |
| Réglages, pied de page | noms de pays toujours en français (`Intl.DisplayNames(["fr","en"])`) | `fmt.country` (langue de la personne) |
| Cibles | « (copie) » à la duplication | `targets.queries.copie_de` |
| Réglages, clés de site | « Site principal » (défaut de la base) posé à la création de l'espace | libellé dans la langue de l'espace à l'inscription |
| Partout | « 2026· sujets », « 12:00· dernier usage » : espace manquante avant le point médian | 46 messages qui commencent par « · » gagnent une espace (fr, en) |

**Formats.** Dates et montants suivent la langue de la personne
(`createFormats`) : en anglais « 16 Sept, 22:47 » et « €7,250,000 » —
vérifié au balayage, rien à corriger.

**Emails.** Lien de connexion (langue du destinataire), invitation, pied de
page, newsletter (langue de l'organisation), désinscription : tous passent
par `translatorFor` — vérifié par lecture, rien à corriger.

**Ce qui reste en français par construction, et pourquoi.**
- Les messages du journal d'une affaire (`deal_events.message`) sont
  ÉCRITS au moment du geste, dans la langue de la personne qui agit
  (« Commission marquée réglée. », « Origine rattachée : … »). Une personne
  qui lit ensuite en anglais voit le français de son collègue. Les rendre
  bilingues demande de stocker la clé et ses valeurs plutôt que la phrase :
  un changement de modèle (chantier B ou C partie 3), pas un correctif.
- Les données de l'organisation (étapes, motifs de perte, étiquettes,
  titres, articles de veille, chiffres et leurs sources) sont dans la
  langue où elles ont été saisies ou semées : ce n'est pas de l'interface.
- Les messages techniques des routes cron et API (« Non autorisé. »,
  « CRON_SECRET absent »), les journaux serveur et les messages
  d'exception internes : jamais montrés à une personne dans l'écran.
- Les noms de langue (« Français », « English ») se disent dans leur langue.

### 1.4 Module partenariats : plus de défilement horizontal sur un portable

`src/components/ui/column-chooser-table.tsx` : un tableau dont on choisit
les colonnes — par défaut les colonnes essentielles (assez peu pour tenir
sans défilement horizontal à 1366 px avec la barre latérale), la première
colonne toujours là et collée à gauche, les autres à cocher dans un menu
« Colonnes » ; le choix vit dans le navigateur (`localStorage`, par
tableau, magasin externe lu par `useSyncExternalStore` — rendu serveur et
navigateur identiques), « Réinitialiser les colonnes » revient aux
défauts. Les cellules arrivent rendues par l'écran serveur : le composant
montre ou cache, il ne calcule rien. Les vues enregistrées du chantier C
(partie 3) porteront ce choix en base, par utilisateur.

Appliqué à `/analytique/partenaires` (onze colonnes → six par défaut :
partenaire, partages, acceptés, acceptation, gagnées, commissions
acquises) et à `/analytique/funnel` par origine (dix → six : origine,
visiteurs, leads, affaires, gagnées, lead → affaire).

**Toutes les listes vérifiées** au balayage (1366 × 768, admin et member) :
la liste des affaires (sept colonnes, 896 px) tient ; les tableaux de
répartition et de délais (trois à quatre colonnes) tiennent ; le sommaire
des réglages se replie (§1.2). Restent volontairement horizontaux : le
kanban des affaires (un tableau de colonnes, c'est sa nature ; il défile
dans son cadre, jamais la page) et, sur téléphone, les tableaux qui
défilent dans leur cadre.

### 1.5 Textes coupés

« Hors fenêtre, l'écran d… » : la phrase d'aide de la fenêtre d'envoi
n'était pas tronquée par le style ; réécrite et posée sous son champ (§1.2).

**Le balayage** (`scripts/_tmp-c-scan.ts`, jamais committé — voir §1.7)
relève sur chaque écran, fr et en, 1366 × 768 et 390 × 844, admin et
member : les éléments coupés par des points de suspension
(`text-overflow: ellipsis` avec débordement réel), tronqués par un
`line-clamp` (hauteur dépassée), coupés par un `overflow: hidden`, et les
pages plus larges que la fenêtre. Premier passage : 80 points de
suspension, 20 troncatures, 1 page qui déborde — presque tous sur
téléphone, dans les listes (`ListRowLink` tronquait titre et sous-titre),
le kanban, la liste des affaires (client et responsable tronqués même sur
portable), les tâches (titres sur une ligne), les newsletters, la veille,
le journal des règles, les cibles.

**Correction.** Titres, sous-titres, noms, adresses et URL SE REPLIENT
(`break-words`, `break-all` pour une URL ou un email) au lieu d'être
tronqués : `ListRowLink`, tuiles (aide), tâches (section, tableau de bord,
page), kanban (titre, client, responsable, étape), liste des affaires,
suivi, newsletters, veille, journal des règles, cibles, règles,
concurrents, profil, invitations, rendez-vous, journal (URL), statut
d'envoi (URL). Restent tronqués, par choix, des éléments d'une seule ligne
où le texte est de la coquille ou une valeur courte : le nom de l'espace
dans l'en-tête à 390 px, l'email dans le menu de compte, les libellés de la
barre d'onglets et de la palette, la barre repliée de la visite, les noms de
fichier du logo, les valeurs d'exemple de la table de correspondance de
l'import — aucun n'a coupé de texte au balayage.

### 1.6 Revue des cartes des réglages

Les douze cartes relues sur captures (1366 × 768, fr puis en) avec la même
grille : libellé au-dessus du contrôle, aide dessous, colonnes alignées en
haut, un bouton par formulaire. Conformes sans retouche : Marque, Domaine
d'envoi, Pied de page (deux colonnes), Adresse d'ingestion, Langue / devise
/ fuseau (trois colonnes), Logo (deux colonnes), Pack métier, Pipelines et
étapes, Types d'affaire, Collecte (clé de site), Motifs de perte.
Retouchées : Envois automatiques (§1.2, trois réglages sur une ligne, les
trois intitulés sur le même `Label`) ; Collecte, clé d'API (`ApiKeyCreator`) :
le bouton « Créer la clé » s'alignait sur le bas de l'AIDE et tombait sous
le champ — champ et bouton sur une ligne, l'aide dessous, comme la clé de
site. Le sommaire se replie sur deux lignes (§1.2).

### 1.7 Preuve

Tout est joué sur le build de production, contre la base de `.env.local`,
en session forgée (Claire, admin de la démo ; Thomas, member ; une
organisation jetable en anglais, supprimée à la fin).

- `src/i18n/messages.test.ts` : 62 contrôles (fichiers, clés, ICU,
  arguments), 190 tests vitest verts au total ; ESLint 0 message sur 505
  fichiers ; `npm run build` passe.
- Preuve navigateur (`scripts/_tmp-c-proof.ts`, 24 contrôles) : visite
  fermée puis relancée d'un clic depuis les premiers pas (carte à l'étape 1,
  adresse nettoyée, cookie « 0|en_cours ») et depuis le menu de compte sur
  `/contacts` ; carte « Envois automatiques » : les trois blocs sur la même
  ligne (même ordonnée), textes simples présents, phrase de la fenêtre
  entière ; sommaire des réglages sans défilement (942/942) ; aucun tableau
  ne défile horizontalement à 1366 px sur partenariats, funnel, liste des
  affaires, pertes, délais ; partenariats : six colonnes par défaut, cocher
  « Refusés » en ajoute une (sept, sans défilement), mémorisée au
  rechargement, « Réinitialiser » revient à six ; en anglais : la carte
  parle anglais, le journal de la fiche s'intitule « Activity » ; zéro
  erreur de page.
- Balayage (`scripts/_tmp-c-scan.ts`, 184 pages : 32 écrans × {Claire fr
  1366 et 390, Thomas fr 1366, organisation anglaise 1366 et 390, Claire en
  1366}) : avant → après. Points de suspension 80 → 0 ; troncatures
  (`line-clamp`) 20 → 0 ; textes coupés (`overflow: hidden`) 66 → 0 (les
  66 étaient les `caption` `sr-only` des tableaux, exclues du critère, plus
  quelques titres de tâches) ; pages plus larges que la fenêtre 1 → 0
  (`/cibles` à 390 px en anglais : le bouton « Create the 5 audiences… » se
  replie) ; défilement horizontal 20 → 13, tous voulus (le kanban sur
  portable et téléphone ; sur téléphone seulement : la liste des affaires,
  les tableaux du funnel et des partenariats, le sommaire des réglages —
  chacun défile dans son cadre, jamais la page) ; français en interface
  anglaise : 90 pages signalées → 14, toutes des données de l'organisation
  de démo (motifs de perte, noms de règles, articles de veille, chiffres et
  sources, titre de rendez-vous, sujets de newsletter) ou le message de
  journal écrit en français au moment du geste (§1.3, limite documentée).
- Retouches finales (`scripts/_tmp-c-retouches.ts`) : `/cibles` en anglais
  à 390 px ne déborde plus (390/390) et ses deux phrases sont séparées ; le
  bouton « Créer la clé » est aligné sur son champ (même bas, 6203/6203).
