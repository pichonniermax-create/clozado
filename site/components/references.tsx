import { getDictionary, type Locale } from "@/lib/i18n";
import { Card } from "./layout-primitives";
import { SectionEditoriale } from "./section-editoriale";

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
    <SectionEditoriale titre={common.references.titre} largeurContenu="lg:col-start-4 lg:col-span-9">
      <ul className="grille-cartes" data-colonnes="3">
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
    </SectionEditoriale>
  );
}
