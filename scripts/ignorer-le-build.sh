#!/usr/bin/env bash
# LA RÈGLE D'IGNORANCE — elle compare le dernier commit DÉPLOYÉ AVEC SUCCÈS
# au commit en cours. Jamais HEAD^.
#
# POURQUOI. La règle précédente était `git diff --quiet HEAD^ HEAD -- .` :
# elle ne regardait que le DERNIER commit d'une poussée. Le 2026-09-21, une
# poussée de deux commits — la refonte des pages légales, puis une ligne de
# `.gitignore` à la racine — a été sautée en entier : le dernier commit ne
# touchait pas le dossier, donc tout le lot est resté à quai, sans qu'aucun
# échec ne le signale. Le site est resté quatre heures sur une version
# antérieure pendant qu'on le croyait à jour.
#
# `VERCEL_GIT_PREVIOUS_SHA` donne « the git SHA of the last successful
# deployment for the project and branch », et « this variable is only exposed
# when an Ignored Build Step is provided » :
# https://vercel.com/docs/environment-variables/system-environment-variables
#
# AU MOINDRE DOUTE, ON CONSTRUIT. Variable vide (première construction d'une
# branche), commit absent du clone (Vercel clone peu profond), erreur de git :
# dans tous ces cas on sort 1. Une construction de trop coûte deux minutes ;
# une construction sautée à tort coûte une version en ligne dont personne ne
# sait qu'elle est vieille.
#
#   sortie 1 = on construit   ·   sortie 0 = on saute
#
# Usage : ignorer-le-build.sh <spécification de chemins…>
#   site : bash ../scripts/ignorer-le-build.sh .
#   app  : bash scripts/ignorer-le-build.sh . ':(exclude)site'
set -u

construire() {
  echo "ignorer-le-build : $1 → on construit."
  exit 1
}

PRECEDENT="${VERCEL_GIT_PREVIOUS_SHA:-}"
[ -n "$PRECEDENT" ] || construire "VERCEL_GIT_PREVIOUS_SHA est vide (première construction de la branche, ou variable non exposée)"

git cat-file -e "${PRECEDENT}^{commit}" 2>/dev/null || construire "le commit ${PRECEDENT} est introuvable dans ce clone"

git diff --quiet "$PRECEDENT" HEAD -- "$@" 2>/dev/null
CODE=$?

case "$CODE" in
  0) echo "ignorer-le-build : rien n'a changé depuis ${PRECEDENT} dans « $* » → on saute."; exit 0 ;;
  1) echo "ignorer-le-build : des changements depuis ${PRECEDENT} dans « $* » → on construit."; exit 1 ;;
  *) construire "git a répondu $CODE" ;;
esac
