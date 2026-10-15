#!/usr/bin/env bash
set -Eeuo pipefail

ACTION="${1:-start}"
case "$ACTION" in
  start|stop) ;;
  *) echo "Usage: $0 [start|stop]" >&2; exit 2 ;;
esac

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
DOCKER_CLI="${DOCKER_BIN:-docker}"
BROWSER_CLI="${BROWSER_BIN:-}"
STARTUP_TIMEOUT="${STARTUP_TIMEOUT_SECONDS:-300}"
APP_URL="http://localhost:3001"

say() { printf '\n%s\n' "$*"; }
fail() { say "Остановлено: $*"; exit 1; }
compose() { "$DOCKER_CLI" compose --project-directory "$PROJECT_DIR" "$@"; }

if ! command -v "$DOCKER_CLI" >/dev/null 2>&1; then
  fail "Docker не найден. Установите Docker Desktop (Windows/macOS) или Docker Engine вместе с Compose v2 (Linux), затем запустите Docker и повторите запуск."
fi

wait_for_docker() {
  if "$DOCKER_CLI" info >/dev/null 2>&1; then return 0; fi
  case "$(uname -s 2>/dev/null || true)" in
    Darwin)
      if [ -d "/Applications/Docker.app" ]; then
        say "Запускаю Docker Desktop. При первом старте подтвердите системный запрос, если он появится."
        open -a Docker >/dev/null 2>&1 || true
      fi
      ;;
  esac
  say "Ожидаю запуска Docker Desktop / Docker Engine..."
  local attempts=0
  while [ "$attempts" -lt 60 ]; do
    "$DOCKER_CLI" info >/dev/null 2>&1 && return 0
    sleep 2
    attempts=$((attempts + 1))
  done
  fail "Docker установлен, но не запущен. Откройте Docker Desktop, дождитесь статуса «Запущен» и повторите попытку."
}

if [ "$ACTION" = stop ]; then
  wait_for_docker
  compose stop
  say "SchoolSphere остановлен. Курсы и прогресс сохранены; для запуска снова откройте Start SchoolSphere."
  exit 0
fi

if ! "$DOCKER_CLI" compose version >/dev/null 2>&1; then
  fail "Не найден Docker Compose v2. Обновите или переустановите Docker Desktop / Docker Engine с Compose plugin."
fi
wait_for_docker

if [ ! -f "$PROJECT_DIR/.env" ]; then
  command -v openssl >/dev/null 2>&1 || fail "Для безопасного создания локальных паролей нужна команда openssl. Установите OpenSSL или создайте .env вручную по .env.example."
  db_password="$(openssl rand -hex 24)"
  auth_secret="$(openssl rand -hex 32)"
  runner_token="$(openssl rand -hex 32)"
  env_tmp="$PROJECT_DIR/.env.tmp.$$"
  (umask 077; cat > "$env_tmp" <<EOF
POSTGRES_DB=school84
POSTGRES_USER=school84
POSTGRES_PASSWORD=$db_password
BETTER_AUTH_SECRET=$auth_secret
BETTER_AUTH_URL=$APP_URL
DATABASE_URL=
GITHUB_CLIENT_ID=local-github-client
GITHUB_CLIENT_SECRET=local-github-secret
RESEND_API_KEY=re_local_only
EMAIL_FROM=SchoolSphere <noreply@localhost>
AUTH_EMAIL_MODE=console
DEMO_LOGIN_ENABLED=true
ARCJET_KEY=local-arcjet-key
ARCJET_ENABLED=false
AWS_ACCESS_KEY_ID=local
AWS_SECRET_ACCESS_KEY=local-secret
AWS_ENDPOINT_URL_S3=http://host.docker.internal:9000
AWS_REGION=us-east-1
NEXT_PUBLIC_S3_BUCKET_NAME_IMAGES=school84-local
PYTHON_RUNNER_TOKEN=$runner_token
EOF
  )
  env_created=0
  if [ ! -e "$PROJECT_DIR/.env" ]; then
    if ln "$env_tmp" "$PROJECT_DIR/.env"; then
      env_created=1
    elif [ ! -f "$PROJECT_DIR/.env" ]; then
      rm -f "$env_tmp"
      fail "Не удалось безопасно создать .env. Проверьте права доступа к папке проекта."
    fi
  fi
  rm -f "$env_tmp"
  if [ "$env_created" -eq 1 ]; then
    chmod 600 "$PROJECT_DIR/.env" || { rm -f "$PROJECT_DIR/.env"; fail "Не удалось защитить .env; созданный файл с секретами удалён. Исправьте права файла и повторите запуск."; }
    say "Созданы локальные настройки .env. Они остаются на этом компьютере и не заменяются при следующих запусках."
  fi
fi

say "Собираю среду для запуска курсов. При первой установке это может занять несколько минут."
compose --profile build-image build python-sandbox-image
compose up -d db

db_ready=0
attempts=0
while [ "$attempts" -lt 60 ]; do
  if compose exec -T db sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1; then db_ready=1; break; fi
  sleep 2
  attempts=$((attempts + 1))
done
[ "$db_ready" -eq 1 ] || fail "База данных не запустилась. Проверьте Docker Desktop и свободное место на диске; ваши данные не удалялись."

# Schema initialization is allowed only for a demonstrably empty public schema.
# Any existing tables are treated as user data and db push is skipped.
table_count="$(compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atqc "SELECT count(*) FROM pg_tables WHERE schemaname = '\''public'\''"' | tr -d '\r')"
case "$table_count" in
  ''|*[!0-9]*) fail "Не удалось безопасно проверить базу. Ничего не менял в схеме. Проверьте Docker и обратитесь к инструкции локальной установки." ;;
esac
fresh_database=0
if [ "$table_count" -eq 0 ]; then
  say "Обнаружена пустая база. Выполняю первоначальную настройку схемы один раз."
  compose --profile init-schema run --build --rm schema-init
  fresh_database=1
  compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /local-install-state.psql'
else
  has_core="$(compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atqc "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = '\''public'\'' AND table_name = '\''user'\'')"' | tr -d '\r')"
  [ "$has_core" = "t" ] || fail "В базе уже есть таблицы, но не найдена ожидаемая схема SchoolSphere. Чтобы сохранить данные, установщик не менял схему. См. раздел «Если запуск остановился» в docs/LOCAL_DEVELOPMENT.md."
  say "Найдена существующая база SchoolSphere. Сохраняю её схему и данные без повторной синхронизации."
fi

if [ "$fresh_database" -eq 1 ]; then
  compose --profile local-admin run --rm local-admin
fi

compose up --build -d app python-runner

wait_service_health() {
  local service="$1" container_id status tries=0
  while [ "$tries" -lt "$STARTUP_TIMEOUT" ]; do
    container_id="$(compose ps -q "$service" 2>/dev/null || true)"
    if [ -n "$container_id" ]; then
      status="$("$DOCKER_CLI" inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id" 2>/dev/null || true)"
      [ "$status" = healthy ] && return 0
      [ "$status" = exited ] && return 1
    fi
    sleep 1
    tries=$((tries + 1))
  done
  return 1
}

say "Проверяю готовность Python-исполнителя и сайта..."
wait_service_health python-runner || fail "Учебный Python-исполнитель не стал готов. Данные сохранены. Посмотрите журнал: docker compose logs python-runner."
wait_service_health app || fail "Сайт не стал готов. Данные сохранены. Посмотрите журнал: docker compose logs app."

say "Готово. Открываю личную школу по адресу $APP_URL"
if [ -n "$BROWSER_CLI" ]; then
  "$BROWSER_CLI" "$APP_URL" >/dev/null 2>&1 || true
elif command -v open >/dev/null 2>&1; then
  open "$APP_URL" >/dev/null 2>&1 || true
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$APP_URL" >/dev/null 2>&1 || true
else
  say "Откройте в браузере: $APP_URL"
fi
say "На странице входа выберите «Войти как ученик». Это локальный демонстрационный вход; сайт доступен только на этом компьютере."
