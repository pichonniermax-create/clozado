# Les fiches deviennent modifiables

Chantier du 2026-09-21. Trois étapes : le composant partagé et les fiches
contact et société (`e4590c4`), les fiches partenaire et affaire avec la
règle du montant et de la commission (`8ec2083`), le journal des
modifications (ci-dessous, §4 — **il demande une migration, rien n'est
appliqué**).

## 1. Le geste, et ce qui le protège

Un seul composant, `src/components/fiches/inline-field.tsx`, sur les
quatre fiches. On clique sur une valeur, elle devient modifiable là où
elle est. **Entrée** enregistre, **Échap** annule, **Tab** enregistre et
passe au champ suivant ; le clavier seul suffit, et c'est vérifié au
navigateur. Pendant l'écriture, le champ dit qu'il travaille ; en cas de
refus, la valeur précédente revient et la phrase dit pourquoi.

Huit éditeurs, un par nature de champ : texte, texte long, e-mail,
téléphone, montant (avec la devise de l'organisation, saisi formaté,
envoyé brut), date, liste de valeurs lue en base, rattachement par
recherche. Le **responsable** n'est pas un type à part : c'est une liste
dont les options sont les utilisateurs de l'organisation — une seule
mécanique, une seule validation.

Quatre gardes, dans cet ordre, **toujours côté serveur** (l'écran ne
protège que l'écran) :

1. **L'organisation.** Chaque écriture relit la fiche par la même porte
   que les écrans (`getContact`, `assertOrgAccess`) : appeler l'action
   directement avec l'identifiant d'une fiche d'ailleurs ne modifie rien.
   Sept contrôles l'éprouvent dans `scripts/test-isolation.ts`.
2. **La version de la fiche.** L'écran envoie la version qu'il a chargée
   (`updated_at`, à la milliseconde) ; si elle ne correspond plus,
   l'écriture est refusée et l'écran se recharge. Jamais d'écrasement
   silencieux.
3. **La liste blanche des champs**, par nature de fiche — une personne
   morale n'a ni prénom, ni date de naissance, ni société de
   rattachement. Un champ hors liste est refusé : aucune affectation de
   masse possible.
4. **La forme de la valeur** (`src/lib/fiches/validate.ts`, 7 tests) :
   adresse plausible, téléphone plausible, montant positif à deux
   décimales, probabilité de 0 à 100, date qui existe (le 31 février
   n'en est pas une), longueurs.

Puis l'écriture repasse par les fonctions existantes (`updateContact`,
`updatePartner`, `updateDealDetails`, `changeDealStage`) : **une seule
porte pour toutes les règles métier** — recomposition du nom
d'affichage, dates d'attribution du conseiller et de l'apporteur, nom du
client recopié au rattachement, motif de perte reporté sur le passage
d'étape, historique et journal de l'étape.

**Un champ obligatoire** ne peut pas être vidé (refusé à l'écran, puis au
serveur) ; un champ facultatif le peut.

**En lecture seule** (démonstration publique), les champs ne sont pas
modifiables : le clic affiche la phrase de lecture seule qui existe déjà,
à l'endroit du clic. La garde est aussi côté serveur (l'action refuse
pour un visiteur), en plus du proxy qui bloque déjà ses écritures.

### Le défaut trouvé au navigateur

Corriger deux champs à la suite refusait le second. La première écriture
change la version de la fiche ; les autres champs portaient encore
l'ancienne tant que la page rafraîchie n'était pas revenue, et la
personne lisait « cette fiche a été modifiée » alors qu'elle était seule.
Les champs d'une même fiche partagent désormais **une** version
(`FicheVersion`), tenue côté client entre deux rendus du serveur. La
garde reste entière : une autre personne écrit, sa version ne correspond
plus.

## 2. Ce qui existait, ce qui est ajouté — fiche par fiche

| Fiche | Existait déjà | Ajouté par ce chantier |
|---|---|---|
| **Contact** (personne) | un formulaire d'ensemble toujours ouvert : prénom, nom, e-mail, téléphone, société en texte libre, fonction, naissance, ville, code postal, pays, conseiller, apporteur, origine, notes | la **société rattachée** (`contacts.company_id`, une vraie fiche choisie par recherche) : la colonne existait depuis toujours et n'était modifiable nulle part. Tout le reste passe au geste en place ; le couple « Enregistrer / Annuler » disparaît |
| **Société** (personne morale) | le même formulaire, sans les champs de personne | rien de neuf en champs : la raison sociale, les coordonnées, le conseiller, l'apporteur, l'origine et les notes passent au geste en place |
| **Partenaire** | un formulaire **replié derrière « Modifier »**, doublé d'une liste en lecture juste au-dessus | le formulaire disparaît : la liste EST la modification. La **validation de l'e-mail et du téléphone** côté serveur (ils n'avaient que leur longueur) |
| **Affaire** | un formulaire d'ensemble : étape, montant, probabilité, clôture prévue, responsable, motif de perte ; et, à part, un second formulaire pour rattacher une fiche client | le **nom de l'affaire** et le **type d'affaire**, qui n'étaient modifiables nulle part ; le **client** rattaché depuis la carte du haut (le second formulaire disparaît) ; la **validation du montant, de la probabilité et de la date** |

### Ce qui est resté à sa place, et pourquoi

- **Les étiquettes d'un contact** gardent leur carte : elles sont
  multi-valeurs, un champ en place n'en tient qu'une.
- **Le statut actif/inactif d'un partenaire** garde son geste et sa
  confirmation : ce n'est pas une valeur qu'on corrige, c'est une
  décision.
- **Le seuil de veille propre à un partenaire** n'existe pas : le seuil
  est celui de l'organisation (`organizations.partner_stale_days`). Le
  rendre propre à chaque confrère demanderait une colonne — à décider.
- **Le secteur d'une société** n'existe pas non plus (il n'y a pas de
  colonne « secteur » sur les fiches) — même remarque.
- **La société rattachée et l'apporteur d'une AFFAIRE** n'existent pas en
  base : une affaire porte un contact (`contact_id`), pas une société ;
  et l'apporteur vit sur le contact (`contacts.partner_id`), pas sur
  l'affaire. Les ajouter demanderait deux colonnes et une décision : une
  affaire hérite-t-elle de l'apporteur de son client, ou peut-elle en
  avoir un autre ?
- **Les droits** : aucun droit de modification par champ n'existe dans le
  produit ; les droits de modification suivent donc les droits de
  lecture, comme demandé. Un membre voit et modifie les fiches de son
  organisation ; un super admin agit dans l'organisation qu'il a choisie.
  Rien à signaler de différent.

## 3. Le montant d'une affaire et la commission

Changer le montant d'une affaire **ne recalcule jamais** une commission
déjà convenue par un partage. La base le garantissait déjà
(`commissions.computed_amount` est figé au calcul,
`commissions.base_amount` garde le montant sur lequel on s'est entendu) ;
ce qui manquait, c'est que la fiche le DISE. Elle le dit maintenant, en
toutes lettres, dès que les deux chiffres divergent d'au moins un
centime :

> Commission convenue sur 300 000 € ; le montant de l'affaire est
> aujourd'hui 350 000 €. Elle n'a pas été recalculée — c'est ce qui a été
> convenu avec le confrère qui fait foi.

Seulement pour une commission **en pourcentage** : une commission fixe ne
dépend pas du montant (`src/lib/deals/commission-gap.ts`, 5 tests).

## 4. Le journal des modifications — CONÇU, migration NON appliquée

Exigence du chantier : « qui, quand, quel champ, ancienne valeur,
nouvelle valeur ». Aucune table existante ne peut le porter :

- `activities` est le journal des **interactions saisies** (appel,
  e-mail, rendez-vous, note) — pas un journal de champs ;
- `deal_events` est typé par un `enum` fermé et n'a ni champ, ni avant,
  ni après — seulement un `message` libre, et il ne concerne que les
  affaires ;
- `contact_access_log` trace les **consultations**, pas les écritures.

### Ce que la base devra porter

```sql
CREATE TABLE "field_changes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  -- Le sujet : une fiche et une seule, comme pour `activities`.
  "contact_id" uuid,
  "deal_id" uuid,
  "partner_id" uuid,
  -- Le champ, tel que la liste blanche du serveur le nomme (« email », « ownerId »…).
  "field" text NOT NULL,
  -- Ce qui se LISAIT avant et après : un libellé, jamais un identifiant — « Claire Vasseur »,
  -- pas un uuid. Un journal se relit trois ans plus tard, quand le compte n'existe plus.
  "old_value" text,
  "new_value" text,
  "actor_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "field_changes_has_subject"
    CHECK ("contact_id" IS NOT NULL OR "deal_id" IS NOT NULL OR "partner_id" IS NOT NULL),
  -- Les FK composites : la base garantit qu'une ligne ne porte jamais une autre
  -- organisation que la fiche dont elle parle (même règle que partout ailleurs).
  CONSTRAINT "field_changes_contact_org_fk" FOREIGN KEY ("contact_id", "organization_id")
    REFERENCES "contacts"("id", "organization_id") ON DELETE CASCADE,
  CONSTRAINT "field_changes_deal_org_fk" FOREIGN KEY ("deal_id", "organization_id")
    REFERENCES "deals"("id", "organization_id") ON DELETE CASCADE,
  CONSTRAINT "field_changes_partner_org_fk" FOREIGN KEY ("partner_id", "organization_id")
    REFERENCES "partners"("id", "organization_id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX "field_changes_org_contact_idx" ON "field_changes" ("organization_id", "contact_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX "field_changes_org_deal_idx" ON "field_changes" ("organization_id", "deal_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX "field_changes_org_partner_idx" ON "field_changes" ("organization_id", "partner_id", "created_at" DESC);
```

### Les trois décisions à prendre avec elle

1. **Ce qu'on écrit dans `old_value` / `new_value`.** La proposition :
   le texte AFFICHÉ, tronqué à 500 caractères (les notes vont jusqu'à
   5 000 ; un journal ne doit pas peser plus lourd que la donnée). Un
   champ vide s'écrit `NULL`, et l'écran dit « non renseigné ».
2. **Ce que devient le journal quand la fiche est supprimée.** Une fiche
   contact n'est pas détruite : elle devient une **pierre tombale**
   (identité à NULL, nom remplacé). Or le journal, lui, garderait
   l'ancienne adresse et l'ancien nom — c'est-à-dire exactement ce que la
   suppression efface. **Proposition : la suppression d'un contact
   supprime ses lignes de journal**, comme elle supprime déjà ses
   interactions, ses tâches et ses rendez-vous. L'autre voie (les garder
   pour l'audit) est défendable pour une profession réglementée, mais
   elle contredit la pierre tombale : c'est un arbitrage, pas un détail
   technique.
3. **Ce qui est journalisé.** La proposition : les modifications en
   place, écrites depuis les trois fonctions `patch*` — un seul endroit
   par fiche. Restent HORS journal, et c'est à dire : l'import CSV (en
   masse), la fusion de fiches, les écritures du moteur de règles, et les
   changements d'étape (déjà journalisés dans `deal_events`, qui reste la
   source pour eux).

### Ce que ça donnerait à l'écran

Une ligne par modification dans le journal déjà présent sur chaque fiche
(`Journal`, `listContactJournal` / `listDealJournal` fusionnent déjà
plusieurs sources à la lecture) : « **Claire Vasseur** a changé
*Téléphone* — « 06 12 34 56 78 » → « 06 98 76 54 32 », il y a deux
heures ». Rien de neuf à l'écran : une source de plus dans la fusion.

**Rien de tout cela n'est écrit ni appliqué.** Le fichier de migration
sera généré après accord, et appliqué seulement sur accord explicite sur
le SQL.
