# AI instructions — FieryFaccultyTCG

> При конфликте с базовыми правилами - приоритет у этого файла.

## ALWAYS ON

- Общение: русский язык, кратко и по делу.
- При выполнении задач:
  - сначала уточняем контекст в репозитории (где код, какие команды запуска);
  - правки делаем минимальными и проверяемыми;
  - после существенных изменений: `lint`, `type-check/typecheck`, тесты и сборка (по месту).
- Запрещено:
  - коммитить/логировать секреты, токены и содержимое `.env`;
  - добавлять недетерминированность в игровую логику (всё, что влияет на исход матча, — только в `game-core`).

---

## TASK ROUTING

### Организационные правила (обязательные)

| Триггер | Файл |
|---------|------|
| Безопасность, секреты, валидация, SQL | `docs/ai/_synced/org/security.md` |
| Git workflow, релиз, коммиты | `docs/ai/_synced/org/release.md` |
| CI/CD, пайплайн, артефакты | `docs/ai/_synced/org/ci.md` |
| Метрики Prometheus, кардинальность | `METRICS.md` |

### Правила стека (web-ccg)

| Триггер | Файл |
|---------|------|
| Архитектура frontend/server/game-core, детерминизм, реплеи | `docs/ai/_synced/stack/architecture.md` |
| Стиль TypeScript/React/Node, принципы слоёв | `docs/ai/_synced/stack/style.md` |
| Тесты: детерминизм core, WS сценарии, UI потоки | `docs/ai/_synced/stack/tests.md` |
| Зависимости и технологии (React/Vite/ws) | `docs/ai/_synced/stack/deps.md` |
| Команды dev/build/lint/test/Docker | `docs/ai/_synced/stack/commands.md` |

### Проекто-специфичное

| Триггер | Файл |
|---------|------|
| Архитектура фронтенда | `frontend/ARCHITECTURE.md` |
| Архитектура legacy backend (HTTP API) | `backend/ARCHITECTURE.md` |

---

## FILE DISCOVERY

| Что | Где |
|-----|-----|
| Game engine (детерминированный core) | `game-core/` |
| WebSocket сервер (сессии, оркестрация) | `server/` |
| Legacy HTTP backend | `backend/` |
| Frontend (React) | `frontend/` |
| Docker Compose | `docker-compose.yml` |
| Docker: Postgres init | `docker/postgres/init.sql` |

---

## CONSTRAINTS

- Любая логика, влияющая на исход матча (рандом, эффекты, резолв событий), реализуется только в `game-core/`.
- Сервер и фронтенд не должны добавлять рандом, влияющий на игровой state.
- Любые сообщения по сети (WebSocket/HTTP) валидируются и типизируются; внешним данным не доверяем.
- В логах и в репозитории не должно быть секретов и данных из `.env`.

