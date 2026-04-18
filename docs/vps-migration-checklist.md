# VPS Migration Checklist

Короткая шпаргалка для переноса FieryFaccultyTCG на новый VPS без постоянного восстановления контекста.

## Источники истины

- deploy compose: `docker-compose.staging.yml`
- env пример: `.env.staging.example`
- базовая инструкция: `docs/staging-vps.md`
- правила безопасного деплоя: `DEPLOY.md`

Локальный `docker-compose.yml` не использовать как staging/deploy-конфиг по умолчанию.

## Когда использовать эту инструкцию

- поднимаем новый VPS с нуля
- делаем чистый запуск без переноса старой БД
- переключаем staging на другую git-ветку

Если нужно сохранить текущие данные Postgres, сначала смотри `DEPLOY.md` и делай backup до любых рискованных действий.

## Минимальные требования к VPS

- Ubuntu `22.04` или `24.04`
- `2 vCPU / 2 GB RAM` как минимально практичный вариант
- `2 vCPU / 4 GB RAM` как комфортный вариант без лишних сюрпризов на сборке
- `30+ GB SSD`
- белый `IPv4`
- доступ по `SSH`

## 1. Подготовить SSH-ключ

На локальном Windows:

```powershell
Get-ChildItem $env:USERPROFILE\.ssh
Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub
```

Использовать:

- `id_ed25519` для входа
- `id_ed25519.pub` для добавления на сервер

Подключение:

```powershell
ssh -i $env:USERPROFILE\.ssh\id_ed25519 root@YOUR_SERVER_IP
```

## 2. Установить Docker на новом VPS

Под `root`:

```bash
apt update && apt upgrade -y
apt install -y ca-certificates curl gnupg ufw git
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
docker --version
docker compose version
```

## 3. Открыть нужные порты

```bash
ufw allow OpenSSH
ufw allow 3000/tcp
ufw allow 3001/tcp
ufw allow 4000/tcp
ufw enable
ufw status
```

Важно:

- если сайт не открывается снаружи, проверить не только `ufw`, но и внешний firewall в панели VPS-провайдера

## 4. Залить проект

```bash
git clone <YOUR_REPO_URL> fiery-faculty-tcg
cd fiery-faculty-tcg
cp .env.staging.example .env
```

Если нужен конкретный branch сразу после клона:

```bash
git fetch origin
git switch <BRANCH_NAME>
```

Пример для дизайн-ветки:

```bash
git fetch origin
git switch codex/design-theme-spike
```

## 5. Заполнить `.env`

Открыть файл:

```bash
nano .env
```

Минимально проверить и заменить:

```env
NODE_ENV=production

POSTGRES_USER=postgres
POSTGRES_PASSWORD=CHANGE_ME_STRONG_PASSWORD
POSTGRES_DB=projectbot
POSTGRES_PORT=5432
INTERNAL_API_TOKEN=CHANGE_ME_RANDOM_INTERNAL_TOKEN

BACKEND_PORT=3001
WS_PORT=4000
FRONTEND_PORT=3000

API_PREFIX=/api
CORS_ORIGIN=http://YOUR_SERVER_IP:3000

VITE_API_URL=
VITE_WS_URL=
```

Примечания:

- `POSTGRES_PASSWORD` и `INTERNAL_API_TOKEN` обязательно заменить
- `YOUR_SERVER_IP` заменить на реальный IP сервера
- `VITE_API_URL` и `VITE_WS_URL` можно оставить пустыми
- не коммитить `.env` и не копировать секреты в репозиторий

## 6. Поднять стенд

```bash
docker compose -f docker-compose.staging.yml --env-file .env up -d --build
docker compose -f docker-compose.staging.yml --env-file .env ps
```

Ожидаемое состояние:

- `postgres` в статусе `healthy`
- `backend`, `server`, `frontend` в статусе `Up`

## 7. Проверить логи

```bash
docker compose -f docker-compose.staging.yml --env-file .env logs --tail=50 backend
docker compose -f docker-compose.staging.yml --env-file .env logs --tail=50 server
docker compose -f docker-compose.staging.yml --env-file .env logs --tail=50 frontend
```

Нормальные признаки:

- backend: `Configuration validated successfully`
- backend: `Server is running on port 3001`
- server: `WS server running on port 4000`
- frontend: успешный `vite build` и `vite preview`

## 8. Smoke-check после запуска

С сервера:

```bash
curl http://127.0.0.1:3001/health
curl http://127.0.0.1:3001/api/health
```

С локального браузера:

- `http://YOUR_SERVER_IP:3000`
- логин
- список колод
- сохранение колоды
- PvP connect

Расширенный PvP smoke-check:

- открыть матч в двух вкладках
- войти двумя игроками
- использовать один `sessionId`
- проверить `join`
- проверить получение `state`
- проверить действие `EndTurn`

## 9. Обновление уже поднятого сервера

Если сервер уже существует, а нужно просто подтянуть свежий код:

```bash
cd ~/fiery-faculty-tcg
git fetch origin
git switch <BRANCH_NAME>
git pull
docker compose -f docker-compose.staging.yml --env-file .env up -d --build
docker compose -f docker-compose.staging.yml --env-file .env ps
```

## 10. Если сайт не открывается

Проверить:

```bash
docker compose -f docker-compose.staging.yml --env-file .env ps
ufw status
ss -tulpn | grep -E '3000|3001|4000'
```

Типовые причины:

- не установлен Docker
- не открыт порт `3000`
- внешний firewall провайдера режет входящие подключения
- в `.env` не заменён `YOUR_SERVER_IP`
- контейнеры поднялись, но один из сервисов упал после старта

## 11. Опасные команды и правила

- не делать `docker compose down -v`, если не готов потерять данные Postgres volume
- не менять `POSTGRES_PASSWORD` на уже живом сервере, если хочешь сохранить старую БД
- не использовать `localhost` в staging-конфигах там, где внутри Docker нужен сервис по имени контейнера
- после infra/deploy-изменений всегда проверять не только `ps`, но и реальные сценарии `login -> decks -> PvP`

## 12. Команды-шпаргалка

Запуск:

```bash
docker compose -f docker-compose.staging.yml --env-file .env up -d --build
```

Статус:

```bash
docker compose -f docker-compose.staging.yml --env-file .env ps
```

Логи:

```bash
docker compose -f docker-compose.staging.yml --env-file .env logs -f
```

Логи по сервису:

```bash
docker compose -f docker-compose.staging.yml --env-file .env logs -f backend
docker compose -f docker-compose.staging.yml --env-file .env logs -f server
docker compose -f docker-compose.staging.yml --env-file .env logs -f frontend
```

Остановка без удаления volume:

```bash
docker compose -f docker-compose.staging.yml --env-file .env down
```

## 13. Что открывать в браузере

- frontend: `http://YOUR_SERVER_IP:3000`
- backend health: `http://YOUR_SERVER_IP:3001/health`
- backend api health: `http://YOUR_SERVER_IP:3001/api/health`

## 14. Быстрый сценарий с нуля

```bash
apt update && apt upgrade -y
apt install -y ca-certificates curl gnupg ufw git
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
ufw allow OpenSSH
ufw allow 3000/tcp
ufw allow 3001/tcp
ufw allow 4000/tcp
ufw enable
git clone <YOUR_REPO_URL> fiery-faculty-tcg
cd fiery-faculty-tcg
cp .env.staging.example .env
nano .env
docker compose -f docker-compose.staging.yml --env-file .env up -d --build
docker compose -f docker-compose.staging.yml --env-file .env ps
curl http://127.0.0.1:3001/health
curl http://127.0.0.1:3001/api/health
```
