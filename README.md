# ProjectBot

Веб-приложение на React + TypeScript + Node.js + PostgreSQL, запускаемое в Docker контейнерах.

Все работы выполняются по правилам AGENTS.md.

## 🚀 Технологии

### Frontend
- **React** 18.2 - библиотека для создания пользовательских интерфейсов
- **TypeScript** 5.3 - типизированный JavaScript
- **Vite** 5.0 - быстрый сборщик и dev-сервер
- **Модульный CSS** - стилизация компонентов

### Backend
- **Node.js** 20 - серверная платформа
- **Express** 4.18 - веб-фреймворк
- **TypeScript** 5.3 - типизированный JavaScript
- **PostgreSQL** 15 - реляционная база данных

### Инфраструктура
- **Docker** & **Docker Compose** - контейнеризация приложения

## 📁 Структура проекта

```
projectBot/
├── game-core/           # Чистая игровая логика (deterministic / serializable / replayable)
│   ├── src/
│   │   ├── actions/
│   │   ├── engine/
│   │   ├── effects/
│   │   ├── events/
│   │   ├── queues/
│   │   ├── rng/
│   │   ├── state-machine/
│   │   ├── types/
│   │   └── utils/
│   ├── data/            # Примеры data-driven карт
│   ├── package.json
│   └── tsconfig.json
├── server/              # WebSocket слой (сессии + оркестрация engine)
│   ├── src/
│   │   ├── engine/
│   │   ├── sessions/
│   │   ├── types/
│   │   └── ws/
│   ├── package.json
│   └── tsconfig.json
├── backend/             # Legacy HTTP backend (можно использовать как API/админку)
│   └── ...
├── frontend/            # Client UI (React)
│   ├── src/
│   │   ├── components/ # Переиспользуемые UI компоненты
│   │   ├── pages/      # Страницы/экраны приложения
│   │   ├── hooks/      # Кастомные React хуки
│   │   ├── services/   # Сервисы и API слой
│   │   │   └── api/    # API слой (axios instance, apiClient)
│   │   ├── utils/      # Вспомогательные утилиты
│   │   ├── types/      # TypeScript типы
│   │   ├── constants/  # Константы приложения
│   │   ├── styles/     # Глобальные стили
│   │   ├── assets/     # Статические файлы
│   │   ├── App.tsx     # Главный компонент
│   │   └── main.tsx    # Точка входа
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── ARCHITECTURE.md # Документация архитектуры
├── docker/              # Docker конфигурация
│   └── postgres/
│       └── init.sql     # SQL скрипты инициализации
├── docker-compose.yml   # Оркестрация контейнеров
└── README.md
```

## 🛠️ Установка и запуск

### Предварительные требования

- Docker Desktop (или Docker + Docker Compose)
- Git

### Быстрый старт

1. **Клонируйте репозиторий** (если используете Git):
   ```bash
   git clone <repository-url>
   cd projectBot
   ```

2. **Создайте файл `.env`** в корне проекта (опционально, есть значения по умолчанию):
   ```env
   # HTTP backend
   NODE_ENV=development
   BACKEND_PORT=3001
   
   # Game WebSocket server
   WS_PORT=4000
   
   # Database
   POSTGRES_USER=postgres
   POSTGRES_PASSWORD=postgres
   POSTGRES_DB=projectbot
   POSTGRES_HOST=postgres
   POSTGRES_PORT=5432
   
   # API
   API_PREFIX=/api
   
   # CORS
   CORS_ORIGIN=*
   
   # Frontend
   FRONTEND_PORT=3000
   VITE_API_URL=http://localhost:3001
   VITE_WS_URL=ws://localhost:4000
   ```
   
   Или создайте `.env` файл в папке `backend/` для backend-специфичных переменных.

3. **Запустите все сервисы**:
   ```bash
   docker-compose up --build
   ```

   Или в фоновом режиме:
   ```bash
   docker-compose up -d --build
   ```

4. **Откройте в браузере**:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:3001
   - Game WebSocket server: ws://localhost:4000
   - Health check: http://localhost:3001/health

### Остановка

```bash
docker-compose down
```

Для удаления volumes (включая данные БД):
```bash
docker-compose down -v
```

## 📝 Разработка

### Локальная разработка без Docker

#### Backend

```bash
cd backend
npm install
npm run dev
```

Backend будет доступен на http://localhost:3001

#### Game Server

```bash
cd server
npm install
npm run dev
```

Game WebSocket server будет доступен на ws://localhost:4000

#### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend будет доступен на http://localhost:3000

**Важно**: При локальной разработке убедитесь, что PostgreSQL запущен (через Docker или локально).

### Полезные команды

#### Backend
- `npm run dev` - запуск в режиме разработки с hot-reload
- `npm run build` - сборка проекта
- `npm run start` - запуск собранного проекта
- `npm run lint` - проверка кода линтером
- `npm run type-check` - проверка типов TypeScript

#### Frontend
- `npm run dev` - запуск dev-сервера
- `npm run build` - сборка для production
- `npm run preview` - предпросмотр production сборки
- `npm run lint` - проверка кода линтером
- `npm run type-check` - проверка типов TypeScript

## 🗄️ База данных

PostgreSQL запускается в отдельном контейнере. Для подключения используйте:

- **Host**: `postgres` (внутри Docker сети) или `localhost` (снаружи)
- **Port**: `5432`
- **Database**: `projectbot` (по умолчанию)
- **User**: `postgres` (по умолчанию)
- **Password**: `postgres` (по умолчанию)

### Подключение к БД извне Docker

```bash
psql -h localhost -p 5432 -U postgres -d projectbot
```

## 🔧 Конфигурация

### Переменные окружения

Все переменные окружения можно настроить через файл `.env` в корне проекта или через переменные окружения системы.

### Порты

По умолчанию используются следующие порты:
- **Frontend**: 3000
- **Backend**: 3001
- **Game WebSocket server**: 4000
- **PostgreSQL**: 5432

Их можно изменить в `docker-compose.yml` или через переменные окружения.

## 🏗️ Архитектура Backend

Backend использует **слоистую архитектуру** (Layered Architecture) для обеспечения масштабируемости:

- **config/** - Конфигурация приложения (БД, настройки)
- **routes/** - Определение маршрутов API
- **controllers/** - Обработка HTTP запросов и ответов
- **services/** - Бизнес-логика приложения
- **models/** - Модели данных (entities/interfaces)
- **middlewares/** - Express middleware (валидация, обработка ошибок)
- **utils/** - Вспомогательные утилиты
- **types/** - TypeScript типы и интерфейсы

Подробная документация по архитектуре: [backend/ARCHITECTURE.md](backend/ARCHITECTURE.md)

### Frontend

Frontend также использует **слоистую архитектуру**:

- **services/api/** - API слой на основе axios (instance с interceptors, типизированный клиент)
- **components/** - Переиспользуемые UI компоненты
- **pages/** - Страницы/экраны приложения
- **hooks/** - Кастомные React хуки
- **services/** - Бизнес-сервисы (используют API слой)
- **utils/** - Вспомогательные утилиты
- **types/** - TypeScript типы и интерфейсы
- **constants/** - Константы приложения
- **styles/** - Глобальные стили
- **assets/** - Статические файлы

Подробная документация: [frontend/ARCHITECTURE.md](frontend/ARCHITECTURE.md)

## 📚 API

### Health Check

```
GET /health
GET /api/health
```

Проверяет статус сервера и подключение к базе данных.

### API Routes

```
GET /api
```

Базовый эндпоинт API с информацией о доступных эндпоинтах.

## PvP Bootstrap `v0`

На текущем этапе для первого живого PvP используется временный bootstrap без отдельной HTTP-ручки матчмейкинга.

- `sessionId` задаётся или генерируется прямо во frontend UI.
- `playerId` берётся из `authService` после логина пользователя.
- Игрок 1 создаёт/вводит `sessionId` и подключается к WS первым.
- Игрок 2 вводит тот же `sessionId` и подключается ко второй стороне матча.
- Для подключения используется WS-сообщение формата:

```json
{
  "type": "join",
  "sessionId": "match-123",
  "playerId": "user_123",
  "seed": 123
}
```

- `seed` на первом этапе задаёт только первый игрок.
- Отдельные lobby/matchmaking HTTP-ручки планируются позже, после первой рабочей UI-интеграции.

## 🐛 Отладка

### Просмотр логов

```bash
# Все сервисы
docker-compose logs -f

# Конкретный сервис
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f postgres
```

### Пересборка контейнеров

```bash
docker-compose up --build --force-recreate
```

## 📄 Лицензия

ISC

## 🤝 Вклад

Приветствуются любые улучшения и предложения!
