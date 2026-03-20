FROM node:20-alpine

WORKDIR /app

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci

# Копируем остальные файлы
COPY . .

# Открываем порт
EXPOSE 3001

# Команда по умолчанию (переопределяется в docker-compose)
CMD ["npm", "run", "dev"]






