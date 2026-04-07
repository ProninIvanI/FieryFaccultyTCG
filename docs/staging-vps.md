# Staging VPS

Краткая инструкция по подъёму staging-стенда проекта на чистом VPS.

## 1. Что нужно от VPS

- Ubuntu 22.04/24.04
- 2 vCPU
- 4 GB RAM
- 30+ GB SSD
- белый IPv4
- доступ по SSH

## 2. Базовая подготовка сервера

Под `root`:

```bash
apt update && apt upgrade -y
adduser deploy
usermod -aG sudo deploy
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
```

Дальше можно работать под `deploy`.

## 3. Docker и firewall

```bash
sudo apt install -y ca-certificates curl gnupg ufw git
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
newgrp docker
```

Открыть только нужные порты:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 3000/tcp
sudo ufw allow 3001/tcp
sudo ufw allow 4000/tcp
sudo ufw enable
sudo ufw status
```

## 4. Залить проект

```bash
git clone <YOUR_REPO_URL> fiery-faculty-tcg
cd fiery-faculty-tcg
cp .env.staging.example .env
```

Заполни `.env`:

- `POSTGRES_PASSWORD` замени на свой сильный пароль
- `INTERNAL_API_TOKEN` замени на случайный внутренний токен
- `YOUR_SERVER_IP` замени на реальный IP VPS

Если домена пока нет, используй IP.
`VITE_API_URL` и `VITE_WS_URL` можно оставить пустыми: фронтенд сам возьмёт текущий хост страницы и пойдёт на `:3001` / `:4000`.

## 5. Поднять стенд

```bash
docker compose -f docker-compose.staging.yml --env-file .env up -d --build
```

Проверка контейнеров:

```bash
docker compose -f docker-compose.staging.yml ps
docker compose -f docker-compose.staging.yml logs -f backend
docker compose -f docker-compose.staging.yml logs -f server
docker compose -f docker-compose.staging.yml logs -f frontend
```

## 6. Smoke-check

Проверки:

```bash
curl http://YOUR_SERVER_IP:3001/health
curl http://YOUR_SERVER_IP:3001/api/health
```

В браузере:

- `http://YOUR_SERVER_IP:3000`
- логин под двумя пользователями в двух вкладках
- после логина проверить logout из меню пользователя и убедиться, что `POST /api/auth/logout` уходит на backend
- открыть `PlayPvpPage`
- указать один `sessionId`
- подключить обоих игроков
- проверить `join`, получение `state`, `EndTurn`

## 7. Полезные команды

Перезапуск:

```bash
docker compose -f docker-compose.staging.yml --env-file .env up -d --build
```

Остановка:

```bash
docker compose -f docker-compose.staging.yml down
```

Логи:

```bash
docker compose -f docker-compose.staging.yml logs -f
```

## 8. Ограничения текущего staging

- Это staging, не production.
- Сервисы пока открыты напрямую по портам `3000`, `3001`, `4000`.
- Нет reverse proxy, домена и HTTPS.
- Для следующего шага стоит добавить `Nginx/Caddy + HTTPS + домен`.
