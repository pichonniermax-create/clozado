-- Module analytique, étape 6 — le pack métier de l'organisation
-- (docs/module-analytique.md, « Étape 6 »). Une colonne nullable, sans
-- valeur par défaut : NULL = pas encore choisi, le tableau de bord le dit.
-- Les clés possibles vivent dans le code (src/lib/metrics/packs.ts), pas
-- dans une contrainte : un pack s'ajoute sans migration.
ALTER TABLE "organizations" ADD COLUMN "business_pack" text;