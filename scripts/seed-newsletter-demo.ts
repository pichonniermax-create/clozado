/**
 * Peuple le module mailing pour les deux organisations de démo créées par
 * seed-demo.ts (npm run db:seed-demo, prérequis) : profil éditorial de
 * l'organisation, un signataire, une cible, quelques chiffres vérifiés.
 * De quoi tester réellement /newsletters/new (générer + enregistrer).
 *
 * Volontairement deux profils très différents (B2C pédagogue vs B2B direct)
 * pour vérifier que l'identité éditoriale par organisation/cible produit
 * bien deux tons distincts — pas juste deux logos différents sur le même
 * texte (dossier de reconstruction §7.2).
 *
 * Idempotent : peut être relancé sans dupliquer les données. Ne touche pas
 * aux colonnes de marque déjà renseignées à la main (ne remplit que les
 * champs encore vides).
 *
 * Usage : npm run db:seed-newsletter-demo (après npm run db:seed-demo)
 */
import { and, eq } from "drizzle-orm";
import { config } from "dotenv";
config({ path: ".env.local" });

const DEMO_CONTENT = {
  dupont: {
    branding: {
      tagline: "Votre courtier de confiance",
      toneOfVoice:
        "Expert, rassurant, direct. Jamais condescendant. Vulgarise sans simplifier à l'excès.",
      editorialGuidelines:
        "Pas de conseil fiscal ou juridique catégorique : informer et inviter à échanger avec un conseiller. Toujours ancrer l'explication dans un exemple concret de projet immobilier.",
    },
    signatory: { name: "Claire Dupont", jobTitle: "Courtière en crédit immobilier" },
    target: {
      slug: "decouverte",
      label: "Découverte",
      persona: "Primo-accédant qui explore son projet d'achat",
      audienceLabel: "B2C",
      editorialVoice:
        "Pédagogue, pas de jargon, rassure sur la complexité du crédit immobilier. Le lecteur découvre le sujet, il n'est pas encore engagé dans un dossier.",
    },
    figures: [
      { label: "Dossiers financés", value: "1 200" },
      { label: "Taux de succès", value: "92 %" },
      { label: "Délai moyen d'accord", value: "15 jours" },
    ],
  },
  martin: {
    branding: {
      tagline: "Des outils qui simplifient votre gestion",
      toneOfVoice: "Direct, orienté résultats, un ton de pair à pair entre professionnels.",
      editorialGuidelines:
        "Toujours relier une fonctionnalité à un gain de temps ou d'argent mesurable. Pas de superlatif creux.",
    },
    signatory: { name: "Julien Martin", jobTitle: "Fondateur" },
    target: {
      slug: "clients-actifs",
      label: "Clients actifs",
      persona: "Gérant de PME déjà utilisateur du produit",
      audienceLabel: "B2B",
      editorialVoice:
        "Concret, orienté fonctionnalités et ROI, s'adresse à quelqu'un qui connaît déjà le produit — jamais un discours de découverte.",
    },
    figures: [
      { label: "Entreprises clientes", value: "340" },
      { label: "Temps gagné par mois", value: "6h" },
    ],
  },
} as const;

async function main() {
  // Import dynamique : chargé APRÈS config() ci-dessus, sinon src/db/index.ts
  // planterait en ne trouvant pas encore DATABASE_URL (les imports statiques
  // sont évalués avant le reste du fichier).
  const { db } = await import("../src/db");
  const { organizations, signatories, mailTargets, verifiedFigures } = await import(
    "../src/db/schema"
  );

  for (const [slug, content] of Object.entries(DEMO_CONTENT)) {
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.slug, slug),
    });
    if (!org) {
      console.log(`⚠ Organisation "${slug}" introuvable — lance d'abord npm run db:seed-demo.`);
      continue;
    }

    // Ne remplit que les champs de marque encore vides — ne jamais écraser
    // un réglage déjà fait à la main dans /settings.
    const brandingPatch: Partial<typeof organizations.$inferInsert> = {};
    if (!org.tagline) brandingPatch.tagline = content.branding.tagline;
    if (!org.toneOfVoice) brandingPatch.toneOfVoice = content.branding.toneOfVoice;
    if (!org.editorialGuidelines) {
      brandingPatch.editorialGuidelines = content.branding.editorialGuidelines;
    }
    if (Object.keys(brandingPatch).length > 0) {
      await db.update(organizations).set(brandingPatch).where(eq(organizations.id, org.id));
      console.log(`✓ Profil éditorial complété : ${org.name}`);
    } else {
      console.log(`= Profil éditorial déjà renseigné : ${org.name}`);
    }

    let signatory = await db.query.signatories.findFirst({
      where: and(
        eq(signatories.organizationId, org.id),
        eq(signatories.name, content.signatory.name)
      ),
    });
    if (!signatory) {
      [signatory] = await db
        .insert(signatories)
        .values({
          organizationId: org.id,
          name: content.signatory.name,
          jobTitle: content.signatory.jobTitle,
        })
        .returning();
      console.log(`✓ Signataire créé : ${signatory.name} (${org.name})`);
    } else {
      console.log(`= Signataire déjà existant : ${signatory.name}`);
    }

    let target = await db.query.mailTargets.findFirst({
      where: and(
        eq(mailTargets.organizationId, org.id),
        eq(mailTargets.slug, content.target.slug)
      ),
    });
    if (!target) {
      [target] = await db
        .insert(mailTargets)
        .values({
          organizationId: org.id,
          slug: content.target.slug,
          label: content.target.label,
          persona: content.target.persona,
          audienceLabel: content.target.audienceLabel,
          editorialVoice: content.target.editorialVoice,
          defaultSignatoryId: signatory.id,
        })
        .returning();
      console.log(`✓ Cible créée : ${target.label} (${org.name})`);
    } else {
      console.log(`= Cible déjà existante : ${target.label}`);
    }

    for (const [position, figure] of content.figures.entries()) {
      const existing = await db.query.verifiedFigures.findFirst({
        where: and(
          eq(verifiedFigures.organizationId, org.id),
          eq(verifiedFigures.label, figure.label)
        ),
      });
      if (!existing) {
        await db.insert(verifiedFigures).values({
          organizationId: org.id,
          label: figure.label,
          value: figure.value,
          position,
        });
        console.log(`✓ Chiffre vérifié créé : ${figure.label} = ${figure.value} (${org.name})`);
      } else {
        console.log(`= Chiffre vérifié déjà existant : ${figure.label}`);
      }
    }
  }
}

main()
  .then(() => {
    console.log("\nSeed newsletter terminé.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("ERREUR:", err);
    process.exit(1);
  });
