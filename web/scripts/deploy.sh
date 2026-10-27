#!/bin/zsh
# Safe rebuild of the live NomBot (Oct 27): build into .next-build while .next keeps serving, swap only after a clean
# build, restart, check the site answers, and roll back to the previous build if it doesn't.
#   scripts/deploy.sh
set -u
cd "$(dirname "$0")/.."
memory_pressure | tail -1
( set -a; . ~/.config/iog-host/site.env; set +a; unset SITE_PASSWORD; NEXT_DIST_DIR=.next-build npm run build ) > .next-build.log 2>&1
if [[ $? -ne 0 || ! -f .next-build/BUILD_ID ]]; then echo "BUILD FAILED, live site untouched"; tail -30 .next-build.log; exit 1; fi
# The build recorded its own folder name; the server runs from .next
sed -i '' 's#\.next-build#.next#g' .next-build/required-server-files.json
rm -rf .next-prev && mv .next .next-prev && mv .next-build .next
# The :3001 dev server (iMNet) lives in .next/dev: carry it over untouched, or it starts failing
[[ -d .next-prev/dev ]] && rm -rf .next/dev && mv .next-prev/dev .next/dev
launchctl kickstart -k gui/$(id -u)/org.iog.nombot
for i in {1..20}; do sleep 1; code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/); [[ $code == 200 ]] && break; done
if [[ $code != 200 ]]; then
  echo "NEW BUILD NOT ANSWERING ($code), rolling back"
  rm -rf .next-failed && mv .next .next-failed && mv .next-prev .next
  [[ -d .next-failed/dev ]] && mv .next-failed/dev .next/dev
  launchctl kickstart -k gui/$(id -u)/org.iog.nombot; exit 1
fi
for p in /research /research/reports /browse; do c=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:4000$p"); [[ $c == 200 ]] || echo "WARN $p $c"; done
echo "deployed: 4000 $code, 4000 /api/v1 keyless $(curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/api/v1/search), 3001 $(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/v1/search)"
