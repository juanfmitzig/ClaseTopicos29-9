FROM node:22-alpine

WORKDIR /app

# Dependencias primero para aprovechar la caché de capas.
# El agente lanza el MCP como subproceso, así que ambos van en la imagen.
COPY agent/package*.json ./agent/
COPY mcp-server/package*.json ./mcp-server/
RUN cd agent && npm ci --omit=dev
RUN cd mcp-server && npm ci --omit=dev

COPY agent/src ./agent/src
COPY mcp-server/src ./mcp-server/src

ENV NODE_ENV=production

USER node
WORKDIR /app/agent

# Variables (GROQ_API_KEY, GRAPHQL_URL, etc.) se pasan en runtime
CMD ["node", "src/index.js"]
