# Imagen única con toda la app: API GraphQL + MCP server + agente.
# Por defecto arranca la API; el agente (interactivo) se lanza con docker exec.
FROM node:22-alpine

WORKDIR /app

# Dependencias primero para aprovechar la caché de capas
COPY package*.json ./
COPY agent/package*.json ./agent/
COPY mcp-server/package*.json ./mcp-server/
RUN npm ci --omit=dev \
 && cd agent && npm ci --omit=dev \
 && cd ../mcp-server && npm ci --omit=dev

COPY src ./src
COPY agent/src ./agent/src
COPY mcp-server/src ./mcp-server/src

ENV NODE_ENV=production
ENV PORT=4000
# Dentro del contenedor el MCP debe hablar con la API local, no con Render
ENV GRAPHQL_URL=http://localhost:4000/graphql
EXPOSE 4000

USER node

# MONGODB_URI y GROQ_API_KEY se pasan en runtime (--env-file .env)
CMD ["node", "src/index.js"]
