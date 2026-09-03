# ── Etapa base: Node.js 20 con Alpine Linux (ligero) ──
# mongodb@7 requiere Node >= 20.19
FROM node:20-alpine
# Instalar dependencias de sistema que pueden necesitar algunos paquetes npm
RUN apk add --no-cache python3 make g++
# Definir el directorio de trabajo dentro del contenedor
WORKDIR /app
# PASO 1: Copiar solo los archivos de dependencias
# (esto permite que Docker cachee npm install)
COPY package*.json ./
COPY tsconfig.json ./
# PASO 2: Instalar todas las dependencias (incluyendo devDependencies para tsx)
RUN npm install
# PASO 3: Copiar el resto del código fuente
COPY . .
# Documentar el puerto que usa la app
EXPOSE 3000
# Iniciar la app en modo desarrollo con tsx watch
CMD ["npx", "tsx", "watch", "src/index.ts"]
