# ---------- Etapa 1: build ----------
FROM node:22-alpine AS build
WORKDIR /app

# Copiamos solo los manifiestos primero para aprovechar la cache de capas:
# si no cambian, Docker no vuelve a ejecutar npm ci.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---------- Etapa 2: runtime ----------
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Traemos únicamente el JS compilado desde la etapa de build.
COPY --from=build /app/dist ./dist

# Usuario sin privilegios (la imagen node ya trae el usuario "node").
USER node

EXPOSE 3000
CMD ["node", "dist/index.js"]
