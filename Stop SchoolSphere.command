#!/bin/bash
cd "$(dirname "$0")"
./scripts/local-school.sh stop
result=$?
if [ "$result" -ne 0 ]; then
  echo
  read -r -p 'Нажмите Enter, чтобы закрыть окно...'
fi
exit "$result"
