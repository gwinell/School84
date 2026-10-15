param(
  [ValidateSet('Start', 'Stop')]
  [string]$Action = 'Start'
)

$ErrorActionPreference = 'Stop'
$ProjectDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$DockerBin = if ($env:DOCKER_BIN) { $env:DOCKER_BIN } else { 'docker' }
$StartupTimeout = if ($env:STARTUP_TIMEOUT_SECONDS) { [int]$env:STARTUP_TIMEOUT_SECONDS } else { 300 }
$AppUrl = 'http://localhost:3001'

function Write-Note([string]$Message) { Write-Host "`n$Message" }
function Fail([string]$Message) { throw "Остановлено: $Message" }
function Invoke-Compose([string[]]$ComposeArgs) {
  & $script:DockerBin compose --project-directory $script:ProjectDir @ComposeArgs
  if ($LASTEXITCODE -ne 0) { Fail "Команда Docker Compose завершилась с ошибкой. Ваши файлы данных не удалялись." }
}

if (-not (Get-Command $DockerBin -ErrorAction SilentlyContinue)) {
  Fail 'Docker не найден. Установите Docker Desktop, запустите его и повторите запуск.'
}
if ($Action -eq 'Stop') {
  & $DockerBin info *> $null
  if ($LASTEXITCODE -ne 0) { Write-Note 'Docker Desktop не запущен; база и файлы данных сохранены.'; exit 0 }
  Invoke-Compose @('stop')
  Write-Note 'SchoolSphere остановлен. Курсы и прогресс сохранены; для запуска откройте Start SchoolSphere.'
  exit 0
}
if (-not (Test-Path (Join-Path $ProjectDir 'docker-compose.yml'))) { Fail 'Не найдена конфигурация проекта docker-compose.yml.' }
& $DockerBin compose version *> $null
if ($LASTEXITCODE -ne 0) { Fail 'Не найден Docker Compose v2. Обновите Docker Desktop и повторите запуск.' }
& $DockerBin info *> $null
if ($LASTEXITCODE -ne 0) {
  $DockerDesktop = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
  if (Test-Path $DockerDesktop) { Start-Process $DockerDesktop }
  Write-Note 'Запускаю или ожидаю Docker Desktop... Если появится системный запрос, подтвердите запуск.'
  $Ready = $false
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 2
    & $DockerBin info *> $null
    if ($LASTEXITCODE -eq 0) { $Ready = $true; break }
  }
  if (-not $Ready) { Fail 'Docker Desktop не запущен. Откройте его, дождитесь статуса «Запущен» и повторите попытку.' }
}

$EnvPath = Join-Path $ProjectDir '.env'
if (-not (Test-Path $EnvPath)) {
  $RandomHex = { param([int]$Bytes) $Data = [byte[]]::new($Bytes); $Generator = [Security.Cryptography.RandomNumberGenerator]::Create(); $Generator.GetBytes($Data); $Generator.Dispose(); return (($Data | ForEach-Object { $_.ToString('x2') }) -join '') }
  $DbPassword = & $RandomHex 24
  $AuthSecret = & $RandomHex 32
  $RunnerToken = & $RandomHex 32
  $EnvContent = @"
POSTGRES_DB=school84
POSTGRES_USER=school84
POSTGRES_PASSWORD=$DbPassword
BETTER_AUTH_SECRET=$AuthSecret
BETTER_AUTH_URL=$AppUrl
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
PYTHON_RUNNER_TOKEN=$RunnerToken
"@
  $TempEnvPath = "$EnvPath.$PID.tmp"
  New-Item -ItemType File -Path $TempEnvPath | Out-Null
  try {
    $CurrentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $SystemSid = New-Object Security.Principal.SecurityIdentifier('S-1-5-18')
    $AdminSid = New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')
    $EnvAcl = New-Object Security.AccessControl.FileSecurity
    $EnvAcl.SetAccessRuleProtection($true, $false)
    $EnvAcl.SetOwner($CurrentSid)
    foreach ($Sid in @($CurrentSid, $SystemSid, $AdminSid)) {
      $EnvAcl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($Sid, 'FullControl', 'Allow')))
    }
    Set-Acl -Path $TempEnvPath -AclObject $EnvAcl
    [IO.File]::WriteAllText($TempEnvPath, $EnvContent, [Text.Encoding]::ASCII)
    try { [IO.File]::Move($TempEnvPath, $EnvPath) }
    catch {
      if (Test-Path $EnvPath) { Remove-Item $TempEnvPath -Force }
      else { throw 'Не удалось атомарно создать .env. Проверьте права доступа к папке проекта.' }
    }
  } catch {
    Remove-Item $TempEnvPath -Force -ErrorAction SilentlyContinue
    if (Test-Path $EnvPath) { Remove-Item $EnvPath -Force -ErrorAction SilentlyContinue }
    throw 'Не удалось безопасно создать .env с приватными локальными секретами. Проверьте разрешения папки и повторите запуск.'
  }
  Write-Note 'Созданы локальные настройки .env. Они остаются на этом компьютере и не заменяются при следующих запусках.'
}

Write-Note 'Собираю среду для запуска курсов. При первой установке это может занять несколько минут.'
Invoke-Compose @('--profile', 'build-image', 'build', 'python-sandbox-image')
Invoke-Compose @('up', '-d', 'db')
$DbReady = $false
for ($i = 0; $i -lt 60; $i++) {
  & $DockerBin compose --project-directory $ProjectDir exec -T db sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' *> $null
  if ($LASTEXITCODE -eq 0) { $DbReady = $true; break }
  Start-Sleep -Seconds 2
}
if (-not $DbReady) { Fail 'База данных не запустилась. Проверьте Docker и свободное место; данные не удалялись.' }
$TableCountText = & $DockerBin compose --project-directory $ProjectDir exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atqc "SELECT count(*) FROM pg_tables WHERE schemaname = ''public''"'
if ($LASTEXITCODE -ne 0 -or $TableCountText -notmatch '^\s*\d+\s*$') { Fail 'Не удалось безопасно проверить базу; схема не менялась.' }
$TableCount = [int]$TableCountText.Trim()
$FreshDatabase = $false
if ($TableCount -eq 0) {
  Write-Note 'Обнаружена пустая база. Выполняю первоначальную настройку схемы один раз.'
  Invoke-Compose @('--profile', 'init-schema', 'run', '--build', '--rm', 'schema-init')
  & $DockerBin compose --project-directory $ProjectDir exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /local-install-state.psql'
  if ($LASTEXITCODE -ne 0) { Fail 'Не удалось записать маркер чистой установки; демонстрационные данные не добавлены.' }
  $FreshDatabase = $true
} else {
  $HasCore = & $DockerBin compose --project-directory $ProjectDir exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atqc "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = ''public'' AND table_name = ''user'')"'
  if ($LASTEXITCODE -ne 0 -or $HasCore.Trim() -ne 't') { Fail 'В базе уже есть таблицы, но не найдена ожидаемая схема SchoolSphere. Чтобы сохранить данные, схема не менялась. См. раздел «Если запуск остановился» в docs/LOCAL_DEVELOPMENT.md.' }
  Write-Note 'Найдена существующая база SchoolSphere. Сохраняю её схему и данные без повторной синхронизации.'
}

if ($FreshDatabase) { Invoke-Compose @('--profile', 'local-admin', 'run', '--rm', 'local-admin') }

Invoke-Compose @('up', '--build', '-d', 'app', 'python-runner')
function Wait-Healthy([string]$Service) {
  for ($i = 0; $i -lt $StartupTimeout; $i++) {
    $ContainerId = & $DockerBin compose --project-directory $ProjectDir ps -q $Service
    if ($LASTEXITCODE -eq 0 -and $ContainerId) {
      $Health = & $DockerBin inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' $ContainerId
      if ($Health.Trim() -eq 'healthy') { return $true }
      if ($Health.Trim() -eq 'exited') { return $false }
    }
    Start-Sleep -Seconds 1
  }
  return $false
}
Write-Note 'Проверяю готовность Python-исполнителя и сайта...'
if (-not (Wait-Healthy 'python-runner')) { Fail 'Python-исполнитель не стал готов. Данные сохранены; проверьте docker compose logs python-runner.' }
if (-not (Wait-Healthy 'app')) { Fail 'Сайт не стал готов. Данные сохранены; проверьте docker compose logs app.' }
Write-Note "Готово. Открываю личную школу: $AppUrl"
try {
  if ($env:BROWSER_BIN) { & $env:BROWSER_BIN $AppUrl }
  else { Start-Process $AppUrl }
} catch { Write-Note "Откройте в браузере: $AppUrl" }
Write-Note 'На странице входа выберите «Войти как ученик». Демонстрационный вход работает только в локальной установке.'
