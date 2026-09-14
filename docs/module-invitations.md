# Invitations d'espaces — liens de création d'espace pour de nouvelles entreprises

Notes de chantier, même rôle que `docs/module-demo.md`. Commandé le
2026-09-14 (« permets-moi de générer des liens de création d'espaces pour
des nouvelles entreprises »), construit le même jour.

**Le but** : le super admin rencontre une entreprise, génère un lien, le
lui transmet (ou l'envoie d'ici par email) ; la personne l'ouvre, crée son
espace en une minute avec le nom et la langue déjà remplis, et devient
l'administrateur de cet espace. Un second chemin d'entrée à côté de
l'inscription libre (décision `ebc239d`, inchangée) — ni un remplacement,
ni une invitation de MEMBRE dans un espace existant (constat P3 de
l'audit, un autre chantier).

---

## 1. Conception

### 1.1 Le modèle — migration `0018_invitations`

Une table `workspace_invitations` (src/db/schema/workspace-invitations.ts) :

| Colonne | Rôle |
|---|---|
| `token_hash` (unique) | L'empreinte SHA-256 du jeton du lien — la clé de recherche. Le jeton en clair n'est jamais stocké tel quel. |
| `token_encrypted` | Le jeton chiffré (AES-256-GCM, clé dérivée par usage `workspace-invitation`, src/lib/crypto.ts) : le super admin recopie le lien depuis la liste sans en générer un nouveau. |
| `organization_name` | Le nom proposé, pré-rempli à l'inscription, modifiable par la personne. |
| `email` | L'adresse réservée (minuscules) ; NULL = lien ouvert. Si elle est posée, seule cette adresse consomme le lien, et l'email d'invitation peut partir d'ici. |
| `locale` | La langue de l'espace créé (`organizations.default_locale`) et de l'email d'invitation. |
| `note` | Une note interne du super admin — jamais montrée à la personne invitée. |
| `created_by`, `created_by_email` | L'auteur (SET NULL si le compte disparaît ; l'adresse survit). |
| `expires_at` | 7, 14 ou 30 jours (CHECK `expires_at > created_at`). |
| `sent_at` | Le dernier envoi de l'email d'invitation. |
| `used_at`, `used_by_email`, `organization_id` | La consommation : posée AVANT la création de l'espace, atomiquement ; l'espace rattaché ensuite (SET NULL s'il disparaît). CHECK : utilisée ⇒ adresse d'usage renseignée ; non utilisée ⇒ ni adresse ni espace. |
| `revoked_at` | La révocation (un geste explicite). |

L'**état** est calculé, jamais stocké (`src/lib/invitations/status.ts`) :
« utilisée » l'emporte sur tout, puis « révoquée », puis « expirée »,
sinon « en attente ».

La migration est rédigée à la main sur l'instantané drizzle-kit
(`IF NOT EXISTS`, clés étrangères dans des blocs `DO` : rejouable après un
échec au milieu, pas de transaction en HTTP). **Appliquée sur la base
LOCALE de preuve le 2026-09-14 (19 migrations) ; sur la base partagée,
JAMAIS sans accord** — tant qu'elle n'y est pas appliquée, `/invitations`
répond par sa frontière d'erreur et `/inscription?invitation=…` par
« lien plus valable » ; l'inscription libre et tout le reste ne changent
pas.

### 1.2 Le côté public — `/inscription?invitation=<jeton>`

- Le jeton a une forme fixe (43 caractères base64url) : tout autre texte
  est refusé AVANT la moindre requête (`isInvitationTokenShape`).
- La page résout le jeton (`resolveInvitation`) et ne montre que ce que le
  formulaire a besoin de savoir : le nom (pré-rempli), l'adresse réservée
  (pré-remplie et verrouillée — `readOnly`, et de toute façon vérifiée
  par le serveur), jamais l'auteur ni la note. Un jeton qui n'est plus
  valable (servi, expiré, révoqué, inconnu) affiche « ce lien n'est plus
  valable » ET laisse le formulaire libre : personne n'est bloqué.
- À la soumission, `signUpAction` **consomme d'abord** l'invitation par
  un seul `UPDATE … WHERE used_at IS NULL AND revoked_at IS NULL AND
  expires_at > now() AND (email IS NULL OR email = <adresse>) RETURNING`
  (`claimInvitation`) : deux soumissions simultanées du même lien ne
  créent jamais deux espaces (prouvé, §3). Aucune ligne touchée → la
  résolution dit pourquoi (« plus valable », ou « réservé à une autre
  adresse »). Puis `createOrganizationWithAdmin` reçoit la langue de
  l'invitation ; l'espace créé est rattaché (`attachInvitationOrganization`).
  Une adresse déjà inscrite ne crée rien (convention existante : pas de
  fuite, un lien de connexion vers l'espace existant) et l'invitation est
  RENDUE (`releaseInvitation`) ; une exception rend aussi l'invitation et
  va au journal (`signup_failed`).
- La limitation de débit de l'inscription (3 par minute et par adresse
  IP) reste en place.
- Limite connue : la page d'inscription se rend dans la langue de la
  requête (le français pour un anonyme), pas dans celle de l'invitation ;
  la langue de l'invitation s'applique à l'ESPACE créé et à l'email
  d'invitation. À revoir avec P13 (langue à l'inscription).

### 1.3 Le côté gestionnaire — `/invitations`

Réservé au super admin RÉEL (`requireSessionUser`, rôle de session — pas la
substitution) ; vérifié dans la page, dans chaque action ET dans chaque
requête (`requireSuperAdmin` de src/db/queries/workspace-invitations.ts) :
une invitation n'appartient à aucune organisation, aucun `orgScope` ne la
couvre. L'entrée « Invitations d'espaces » vit dans une section « Gestion »
de la navigation, montrée au seul super admin (`superAdminOnly`), et une
carte sur sa liste des organisations compte les liens en attente. Un
visiteur de la démo ne l'atteint pas (`DEMO_FORBIDDEN_PATHS`).

- **Générer** : nom, adresse réservée (facultatif), langue, validité (7 /
  14 / 30 jours), note interne. Le lien s'affiche mis en avant, à copier
  (`CopyButton`) ou à envoyer par email si une adresse est réservée.
- **La liste** : chaque invitation avec son état (badge), qui l'a créée et
  quand, l'expiration, le dernier envoi, l'espace créé (nom, slug) et
  l'adresse qui l'a créé, la note. Les gestes selon l'état : copier le
  lien, envoyer / renvoyer l'email, révoquer — pour une invitation en
  attente seulement. Le jeton en clair n'est déchiffré que pour une
  invitation en attente.
- **L'email d'invitation** (`src/lib/email/invitation.ts`) : le gabarit du
  lien de connexion, aux couleurs du produit, dans la langue de
  l'invitation, expéditeur du produit, par l'API Resend (`sendEmail`).
  Un refus du fournisseur est journalisé et dit à l'écran ; le lien reste
  copiable à la main. Une clé d'idempotence par envoi : un renvoi voulu
  est un nouvel email.

### 1.4 Ce que ce chantier ne fait pas

- Pas de quota ni de plan sur l'espace créé (P1, étape 5 de l'audit).
- Pas d'invitation de membre (P3).
- Pas de page d'inscription dans la langue de l'invitation (P13).

---

## 2. Fichiers

`src/db/schema/workspace-invitations.ts`, `src/db/migrations/0018_invitations.sql`
(+ `meta/0018_snapshot.json`), `src/db/queries/workspace-invitations.ts`,
`src/lib/invitations/{token,status,actions}.ts`, `src/lib/email/invitation.ts`,
`src/app/(app)/invitations/{page,loading}.tsx`, `src/app/inscription/page.tsx`,
`src/components/auth/sign-up-form.tsx`, `src/lib/auth/actions.ts`,
`src/db/queries/signup.ts` (langue de l'espace), la navigation
(`superAdminOnly`), `src/messages/{fr,en}/invitations.json` (+ clés dans
`auth`, `errors`, `nav`, `dashboard`), test `src/lib/invitations/token.test.ts`.

---

## 3. Preuves (2026-09-14, base locale de preuve)

**À blanc** (`scripts/_tmp-invitations-proof.ts`, supprimé après) — 20
contrôles OK : création (jeton de 43 caractères, adresse normalisée),
refus d'une adresse illisible, d'une langue inconnue, d'une validité hors
liste, d'une clé inconnue (`usedAt` forgé, schéma strict), d'un admin
d'organisation (création et liste) ; états calculés (en attente, révoquée,
expirée) ; jeton en clair rendu pour la seule invitation en attente ;
résolution (en attente, inconnu, révoqué, expiré) ; adresse réservée : une
autre adresse ne consomme pas ; révoquée non consommable ; **course** :
deux consommations simultanées du même jeton, une seule passe ; « utilisée »
après consommation ; rendue après une création non aboutie.

**Au navigateur** (build de production, Chromium) — voir §4 Avancement.

---

## 4. Avancement

- **2026-09-14** : conception, migration 0018 (locale), requêtes, écran
  `/invitations`, inscription sur invitation, email, messages FR/EN, test
  unitaire (6 cas), preuve à blanc 20/20.
