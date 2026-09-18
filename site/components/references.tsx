import { getDictionary, type Locale } from "@/lib/i18n";
import { Card, Section } from "./layout-primitives";

/**
 * L'EMPLACEMENT des références clients — vide aujourd'hui, donc INVISIBLE :
 * le composant ne rend rien du tout tant que la liste des contenus est
 * vide. Pas de logos grisés, pas de « bientôt », pas de témoignage
 * inventé. Le jour où une référence est vérifiée et autorisée, elle
 * s'ajoute aux contenus et la section apparaît.
 */
export function References({ locale }: { locale: Locale }) {
  const { common } = getDictionary(locale);
  if (common.references.elements.length === 0) return null;

  return (
    <Section titre={common.references.titre}>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {common.references.elements.map((reference) => (
          <li key={reference.nom}>
            <Card className="h-full">
              <p className="font-medium">{reference.nom}</p>
              <p className="mt-1 text-sm text-muted-foreground">{reference.metier}</p>
              {reference.citation && <p className="mt-4 text-sm leading-relaxed">{reference.citation}</p>}
            </Card>
          </li>
        ))}
      </ul>
    </Section>
  );
}
