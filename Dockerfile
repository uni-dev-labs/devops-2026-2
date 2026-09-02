


# ---------- Etapa 1: build ----------
# Compila TypeScript -> JavaScript (dist/) usando devDependencies (tsx/typescript)
FROM node:22-alpine AS build
 
WORKDIR /app
 
# Instalamos dependencias primero para aprovechar la cache de capas de Docker
COPY package.json package-lock.json ./
RUN npm ci
 
# Copiamos el resto del código fuente y compilamos
COPY tsconfig.json ./
COPY src ./src
RUN npm run build
 
# ---------- Etapa 2: runtime ----------
# Imagen final liviana: solo dependencias de producción + dist/ ya compilado
FROM node:22-alpine AS runtime
 
WORKDIR /app
ENV NODE_ENV=production
 
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
 
# Copiamos SOLO el resultado del build, no el código TypeScript ni node_modules de dev
COPY --from=build /app/dist ./dist
 
EXPOSE 3000
 
CMD ["node", "dist/index.js"]
 
