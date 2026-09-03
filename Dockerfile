# ---------- Etapa 1: build ----------
# Compila TypeScript -> JavaScript. Aquí SÍ se necesitan las devDependencies.
FROM node:22-alpine AS build

WORKDIR /app

# Copiamos primero los manifiestos para aprovechar la cache de capas:
# si no cambian, Docker reutiliza el resultado de `npm ci`.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build


# ---------- Etapa 2: runtime ----------
# Imagen final: solo el JS compilado y las dependencias de producción.
FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Traemos únicamente el resultado del build (sin src/, sin devDependencies).
COPY --from=build /app/dist ./dist

# El proceso corre como usuario sin privilegios (viene en la imagen node).
USER node

EXPOSE 3000

CMD ["node", "dist/index.js"]
