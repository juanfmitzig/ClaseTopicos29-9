FROM node:22-alpine

WORKDIR /app

# Dependencias primero para aprovechar la caché de capas
COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

USER node

# Las variables (MONGODB_URI, etc.) se pasan en runtime, no se incluyen en la imagen
CMD ["node", "src/index.js"]
