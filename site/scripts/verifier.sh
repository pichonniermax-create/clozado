#!/usr/bin/env bash
# Vérification du site en ligne — une commande, un verdict par ligne.
#
#   ./scripts/verifier.sh https://clozado-site.vercel.app
#   ./scripts/verifier.sh https://clozado.fr
#
# Contrôle, dans cet ordre : les neuf anciennes adresses Framer répondent en
# VRAI 301 vers la bonne cible ; les huit pages répondent 200 ; une adresse
# inconnue répond 404 ; robots.txt et sitemap.xml existent ; les en-têtes de
# sécurité sont posés. Sortie non nulle si un seul contrôle échoue : la
# commande peut servir de garde avant la bascule DNS.
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

# Une redirection : chemin attendu, cible attendue.
redirection() {
  local source="$1" cible="$2"
  local reponse code lieu
  reponse=$(curl -sS -o /dev/null -m 20 -w "%{http_code} %{redirect_url}" "$BASE$source" 2>/dev/null)
  code="${reponse%% *}"; lieu="${reponse#* }"
  if [ "$code" != "301" ]; then
    ko "$source → attendu 301, reçu $code"
  elif [ "$lieu" != "$BASE$cible" ] && [ "$lieu" != "$cible" ]; then
    ko "$source → 301 mais vers « $lieu » au lieu de « $BASE$cible »"
  else
    ok "$source → 301 → $cible"
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
redirection "/offre"                     "/fr/tarifs"
redirection "/crm-courtier-assurance"    "/fr/courtiers"
redirection "/crm-gestion-patrimoine"    "/fr/cgp"
redirection "/crm-promotion-immobiliere" "/fr/immobilier"
redirection "/contact"                   "/fr/demo"
redirection "/references"                "/fr"
redirection "/mentions-legales"          "/fr/mentions-legales"
redirection "/confidentialite"           "/fr/confidentialite"

titre "Les huit pages"
for chemin in /fr /fr/cgp /fr/courtiers /fr/immobilier /fr/tarifs /fr/demo /fr/mentions-legales /fr/confidentialite; do
  page "$chemin"
done

titre "Les fichiers d'indexation"
page "/robots.txt"
page "/sitemap.xml"
page "/fr/opengraph-image"

titre "Une adresse inconnue"
page "/cette-page-n-existe-pas" 404
page "/fr/cette-page-n-existe-pas" 404

titre "Les en-têtes"
entete "content-security-policy"   "frame-ancestors 'none'"
entete "x-content-type-options"    "nosniff"
entete "referrer-policy"           "strict-origin-when-cross-origin"
entete "permissions-policy"        "camera=()"
entete "strict-transport-security" "max-age="

titre "Ce que le sitemap déclare"
DECLARE=$(curl -sS -m 20 "$BASE/sitemap.xml" 2>/dev/null | grep -o '<loc>[^<]*</loc>' | sed 's|</\?loc>||g')
NOMBRE=$(printf '%s\n' "$DECLARE" | grep -c . || true)
[ "$NOMBRE" = "8" ] && ok "8 adresses déclarées" || ko "$NOMBRE adresses déclarées au lieu de 8"
printf '%s\n' "$DECLARE" | sed 's/^/       /'

printf "\n"
if [ "$ECHECS" -eq 0 ]; then
  printf "%sTous les contrôles passent.%s\n" "$VERT" "$FIN"
else
  printf "%s%d contrôle(s) en échec.%s\n" "$ROUGE" "$ECHECS" "$FIN"
fi
exit $(( ECHECS > 0 ))
