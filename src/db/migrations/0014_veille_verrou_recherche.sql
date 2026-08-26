-- Module ciblage et contenu, étape 4 bis — deux propositions de schéma validées le 2026-08-26.
--   watch_topics.last_searched_at : la date de la dernière recherche web du sujet. La collecte
--                       cherche d'abord les sujets jamais cherchés ou les plus anciens, et ne
--                       recherche pas un sujet cherché il y a moins de vingt heures. Une date
--                       lisible et déboguable, à la place d'une rotation par compteur de collectes.
--   watch_runs        : index partiel unique (organization_id) WHERE finished_at IS NULL — UNE
--                       seule collecte ouverte par organisation, garanti par la base ; le code
--                       ferme les lignes ouvertes depuis plus de cinq minutes (fonction coupée)
--                       avant chaque départ, et lit une violation d'unicité comme « déjà en cours ».
-- Avant de poser l'index, les collectes encore ouvertes sont closes « interrompues » : l'index
-- refuserait deux lignes ouvertes pour une même organisation (il n'y en a aucune au moment de
-- l'application, mais une migration ne suppose rien). Une collecte réellement en cours à cet
-- instant réécrit de toute façon sa ligne en finissant.
-- IF NOT EXISTS sur l'ADD COLUMN et le CREATE INDEX, UPDATE sans effet la seconde fois :
-- rejouable après un échec au milieu (pas de transaction en HTTP).
ALTER TABLE "watch_topics" ADD COLUMN IF NOT EXISTS "last_searched_at" timestamp with time zone;--> statement-breakpoint
UPDATE "watch_runs" SET "finished_at" = now(), "error" = 'Collecte close à la migration 0014.' WHERE "finished_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "watch_runs_org_open_unique" ON "watch_runs" USING btree ("organization_id") WHERE "watch_runs"."finished_at" IS NULL;
