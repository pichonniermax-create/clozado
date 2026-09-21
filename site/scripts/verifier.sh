#!/usr/bin/env bash
# Vérification du site en ligne — une commande, un verdict par ligne.
#
#   ./scripts/verifier.sh https://clozado-site.vercel.app
#   ./scripts/verifier.sh https://clozado.fr
#
# Contrôle, dans cet ordre : les neuf anciennes adresses Framer répondent en
# VRAI 301 vers la bonne cible ; les redirections permanentes vers
# l'application et la page de démonstration répondent en 308 ; TOUTE adresse
# déclarée au sitemap répond 200 ; le flux RSS répond avec son type ; une
# adresse inconnue répond 404 ; les en-têtes de sécurité sont posés. Sortie
# non nulle si un seul contrôle échoue : la commande peut servir de garde
# avant la bascule DNS.
#
# LA LISTE DES PAGES N'EST PLUS ÉCRITE ICI. Elle est lue dans le sitemap que
# le site publie : une page ouverte, un article publié, une catégorie née
# d'un article entrent donc au contrôle sans qu'on touche à ce fichier.
# L'ancienne version tenait huit chemins en dur et une page Tarifs
# supprimée — elle rendait des échecs faux.
set -uo pipefail

BASE="${1:-}"
if [ -z "$BASE" ]; then
  echo "usage : $0 <adresse de base, sans barre oblique finale>" >&2
  exit 2
fi
BASE="${BASE%/}"

VERT=$'\033[32m'; ROUGE=$'\033[31m'; GRIS=$'\033[90m'; FIN=$'\033[0m'
ECHECS=0

ok()   { printf "  %sOK%s   %s\n" "$VERT" "$FIN" "$1"; }
ko()   { printf "  %sKO%s   %s\n" "$ROUGE" "$FIN" "$1"; ECHECS=$((ECHECS+1)); }
titre(){ printf "\n%s%s%s\n" "$GRIS" "$1" "$FIN"; }

# Une redirection : chemin attendu, cible attendue, code attendu (301 par défaut).
redirection() {
  local source="$1" cible="$2" attendu="${3:-301}"
  local reponse code lieu
  reponse=$(curl -sS -o /dev/null -m 20 -w "%{http_code} %{redirect_url}" "$BASE$source" 2>/dev/null)
  code="${reponse%% *}"; lieu="${reponse#* }"
  # `curl` NORMALISE la cible qu'il rapporte : « https://app.clozado.fr »
  # revient « https://app.clozado.fr/ ». Ce n'est pas l'en-tête qui change,
  # c'est la mesure — on compare donc sans la barre oblique finale.
  lieu="${lieu%/}"
  if [ "$code" != "$attendu" ]; then
    ko "$source → attendu $attendu, reçu $code"
  elif [ "$lieu" != "${BASE}${cible%/}" ] && [ "$lieu" != "${cible%/}" ]; then
    ko "$source → $attendu mais vers « $lieu » au lieu de « $cible »"
  else
    ok "$source → $attendu → $cible"
  fi
}

page() {
  local chemin="$1" attendu="${2:-200}"
  local code
  code=$(curl -sS -o /dev/null -m 20 -w "%{http_code}" "$BASE$chemin" 2>/dev/null)
  [ "$code" = "$attendu" ] && ok "$chemin → $code" || ko "$chemin → attendu $attendu, reçu $code"
}

entete() {
  local nom="$1" motif="$2" valeur
  valeur=$(curl -sSI -m 20 "$BASE/fr" 2>/dev/null | tr -d '\r' | grep -i "^$nom:" | head -1 | cut -d' ' -f2-)
  if [ -z "$valeur" ]; then
    ko "en-tête $nom absent"
  elif ! printf '%s' "$valeur" | grep -qi -- "$motif"; then
    ko "en-tête $nom = « $valeur » (attendu : contient « $motif »)"
  else
    ok "en-tête $nom"
  fi
}

printf "Vérification de %s\n" "$BASE"

titre "Les neuf anciennes adresses Framer, en vrai 301"
redirection "/"                          "/fr"
redirection "/offre"                     "/fr/demo"
redirection "/crm-courtier-assurance"    "/fr/courtiers"
redirection "/crm-gestion-patrimoine"    "/fr/cgp"
redirection "/crm-promotion-immobiliere" "/fr/immobilier"
redirection "/contact"                   "/fr/demo"
redirection "/references"                "/fr"
redirection "/mentions-legales"          "/fr/mentions-legales"
redirection "/confidentialite"           "/fr/confidentialite"

titre "La page Tarifs supprimée, et l'application"
redirection "/tarifs"      "/fr/demo"                        308
redirection "/fr/tarifs"   "/fr/demo"                        308
redirection "/login"       "https://app.clozado.fr/login"    308
redirection "/inscription" "https://app.clozado.fr"          308

titre "Les fichiers d'indexation"
page "/robots.txt"
page "/sitemap.xml"
page "/fr/opengraph-image"

titre "Toutes les adresses que le sitemap déclare"
DECLARE=$(curl -sS -m 20 "$BASE/sitemap.xml" 2>/dev/null | grep -o '<loc>[^<]*</loc>' | sed 's|</\?loc>||g')
NOMBRE=$(printf '%s\n' "$DECLARE" | grep -c . || true)
if [ "$NOMBRE" -lt 1 ]; then
  ko "sitemap vide ou illisible"
else
  ok "$NOMBRE adresses déclarées"
  while IFS= read -r adresse; do
    [ -z "$adresse" ] && continue
    # Le sitemap porte le domaine canonique ; on contrôle sur l'adresse testée.
    page "/${adresse#*://*/}"
  done <<< "$DECLARE"
fi

titre "Le flux RSS"
page "/fr/blog/rss.xml"
TYPE=$(curl -sSI -m 20 "$BASE/fr/blog/rss.xml" 2>/dev/null | tr -d '\r' | grep -i '^content-type:' | head -1 | cut -d' ' -f2-)
printf '%s' "$TYPE" | grep -qi "application/rss+xml" \
  && ok "type du flux = $TYPE" \
  || ko "type du flux = « $TYPE » (attendu : application/rss+xml)"

titre "Une adresse inconnue"
page "/cette-page-n-existe-pas" 404
page "/fr/cette-page-n-existe-pas" 404
page "/fr/blog/cet-article-n-existe-pas" 404

titre "Les en-têtes"
entete "content-security-policy"   "frame-ancestors 'none'"
entete "x-content-type-options"    "nosniff"
entete "referrer-policy"           "strict-origin-when-cross-origin"
entete "permissions-policy"        "camera=()"
entete "strict-transport-security" "max-age="

printf "\n"
if [ "$ECHECS" -eq 0 ]; then
  printf "%sTous les contrôles passent.%s\n" "$VERT" "$FIN"
else
  printf "%s%d contrôle(s) en échec.%s\n" "$ROUGE" "$ECHECS" "$FIN"
fi
exit $(( ECHECS > 0 ))
