# ---------- Etapa 1: build ----------
FROM node:22-alpine AS build

WORKDIR /app

# Copiamos primero solo los manifests para aprovechar la cache de Docker
COPY package.json package-lock.json ./
RUN npm ci

# Copiamos el resto del código fuente y compilamos TypeScript -> JS
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---------- Etapa 2: runtime ----------
FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

# Solo dependencias de producción (más liviano)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copiamos SOLO el resultado del build de la etapa anterior
COPY --from=build /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/index.js"]