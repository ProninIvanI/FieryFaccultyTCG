# Deploy Guide

Короткая памятка для безопасного обновления staging/VPS.

## 1. Что считать источником истины

- staging deploy: `docker-compose.staging.yml`
- env пример: `.env.staging.example`
- VPS инструкция: `docs/staging-vps.md`
- локальный `docker-compose.yml` не использовать как deploy-конфиг по умолчанию

## 2. Базовые правила

- не менять `POSTGRES_PASSWORD` после первого успешного поднятия стенда, если данные нужно сохранить
- не выполнять `docker compose ... down -v`, если не готов потерять БД
- перед рискованными действиями с БД делать backup
- после infra-правок всегда проверять не только `Up`, но и реальные пользовательские сценарии

## 3. Безопасное обновление

```bash
git pull
docker compose -f docker-compose.staging.yml --env-file .env up -d --build
docker compose -f docker-compose.staging.yml --env-file .env ps
```

## 4. Минимальный smoke-check после деплоя

```bash
curl http://127.0.0.1:3001/health
curl http://127.0.0.1:3001/api/health
docker compose -f docker-compose.staging.yml --env-file .env logs --tail=50 backend
docker compose -f docker-compose.staging.yml --env-file .env logs --tail=50 server
```

Потом в браузере проверить:

- открывается `http://YOUR_SERVER_IP:3000`
- логин работает
- список колод загружается
- сохранение колоды работает
- PvP подключение проходит

## 5. Backup Postgres перед рискованными действиями

```bash
mkdir -p backups
docker exec projectbot_postgres_staging pg_dump -U postgres -d projectbot > backups/projectbot_$(date +%F_%H-%M-%S).sql
```

Примечание:

- если в `.env` используются другие `POSTGRES_USER` или `POSTGRES_DB`, подставь их в команду

## 6. Когда допустим `down -v`

Только если одновременно верны оба условия:

- staging данные не нужны
- есть понимание, что volume будет удалён полностью

Команда:

```bash
docker compose -f docker-compose.staging.yml --env-file .env down -v
docker compose -f docker-compose.staging.yml --env-file .env up -d --build
```

## 7. Типовые причины поломки staging

- в staging попали локальные `localhost` URL
- `server` внутри docker ходит не в `backend`, а в свой `localhost`
- поменялся `POSTGRES_PASSWORD`, но старый Postgres volume сохранился
- контейнеры `Up`, но не прошли реальные сценарии `login -> decks -> PvP`
- deploy-доки, `.env` пример и compose разъехались между собой

## 8. Что делать при `Internal server error`

Сначала не гадать, а смотреть live-логи:

```bash
docker compose -f docker-compose.staging.yml --env-file .env logs -f backend
docker compose -f docker-compose.staging.yml --env-file .env logs -f server
```

И только потом повторять сценарий в браузере.
