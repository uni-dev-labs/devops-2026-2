# ==============================
# Etapa 1: Build
# ==============================
FROM node:22-alpine AS build

WORKDIR /app

# Copiar archivos de dependencias
COPY package.json package-lock.json ./

# Instalar todas las dependencias, incluidas las de desarrollo
RUN npm ci

# Copiar configuración y código fuente
COPY tsconfig.json ./
COPY src ./src

# Compilar TypeScript
RUN npm run build


# ==============================
# Etapa 2: Runtime
# ==============================
FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

# Copiar archivos de dependencias
COPY package.json package-lock.json ./

# Instalar únicamente dependencias de producción
RUN npm ci --omit=dev

# Copiar la aplicación compilada desde la etapa build
COPY --from=build /app/dist ./dist

# Puerto de la API
EXPOSE 3000

# Iniciar la aplicación
CMD ["node", "dist/index.js"]