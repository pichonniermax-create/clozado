---
titre: Compter une affaire gagnée, et s’y tenir
resume: Trois écrans, trois chiffres, et personne pour trancher. Ce qu’une définition d’indicateur doit fixer pour qu’un cabinet arrête d’en débattre.
categorie: Mesure
publie: 2026-09-11
misAJour: 2026-09-18
demonstration: oui
---

Dans la plupart des cabinets que nous rencontrons, la question « combien d’affaires avons-nous gagnées le mois dernier ? » reçoit deux ou trois réponses différentes selon l’écran qu’on ouvre. Ce n’est pas un problème d’outil : c’est un problème de définition.

## Trois écrans, trois chiffres

Le tableau de bord compte les affaires dont le statut est « gagnée » aujourd’hui. L’export CSV compte celles dont la date de signature tombe dans le mois. Le tableur du directeur compte celles qui ont été facturées. Les trois ont raison, et aucun ne parle de la même chose.

> Le jour où trois personnes défendent trois chiffres, ce n’est plus l’outil qu’il faut changer : c’est la phrase qui manque.
> — Un associé de cabinet, lors d’une mise en service

## Ce qu’une définition doit fixer

Une définition utile tient en une phrase et répond à quatre questions. Si l’une manque, le débat revient.

### La date qui compte

Une affaire gagnée le 31 mars et facturée le 2 avril appartient à mars ou à avril ? Les deux réponses se défendent ; une seule doit être écrite. Nous comptons **à la date de l’issue**, celle où quelqu’un a posé « gagnée » sur l’affaire.

### Le périmètre

- Les affaires **supprimées** sortent du compte, mais pas les affaires **archivées**.
- Les affaires d’un conseiller parti restent comptées : elles ont eu lieu.
- Les affaires de test n’existent pas en production ; en démonstration, elles sont annoncées comme telles.

### Le seuil d’affichage

Un taux calculé sur quatre observations ment. Nous ne l’affichons pas sous cinq, et l’écran dit ce qui lui manque plutôt que d’avancer un chiffre creux.

### La source unique

Le même calcul sert à l’écran, à l’export et au récapitulatif. Un chiffre exporté veut dire ce qu’un chiffre lu veut dire.

## Notre définition, en une ligne

> [!note]
> Affaire gagnée : affaire non supprimée dont l’issue « gagnée » est posée, comptée à la date de cette issue, dans la période choisie.

## Ce que ça change, écran par écran

| Écran | Avant | Après |
|---|---|---|
| Tableau de bord | statut courant | issue posée, à sa date |
| Export CSV | date de signature | issue posée, à sa date |
| Récapitulatif mensuel | affaires facturées | issue posée, à sa date |

Les trois chiffres deviennent le même. Celui du directeur baisse souvent de deux ou trois unités le premier mois : ce sont les affaires facturées d’un mois pour une issue posée le mois d’avant.

## Et dans l’export

La colonne porte le même nom que l’écran, et la définition voyage avec le fichier :

```csv
affaire,conseiller,issue,date_issue,montant_estime
A-2412,Claire Estève,gagnée,2026-03-31,285000
A-2418,Claire Estève,perdue,2026-04-02,96000
```

## Ce que ça ne règle pas

Une définition ne dit pas si le mois a été bon. Elle dit seulement que la question « combien » a une réponse, et une seule. Le reste — pourquoi, et quoi faire — se lit ailleurs : dans les délais, dans les pertes, dans ce que les confrères apportent.

## Par où commencer

1. Écrivez votre définition en une phrase, sans conjonction « ou ».
2. Affichez-la **à côté du chiffre**, pas dans un document séparé.
3. Vérifiez qu’un export donne exactement le même nombre que l’écran.
4. Si les deux diffèrent, c’est le calcul qui diverge, pas la donnée.
