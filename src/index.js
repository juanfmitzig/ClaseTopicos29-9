// =============================================================
// PASO 5: Servidor Express + Apollo Server
// -------------------------------------------------------------
// Express es el servidor HTTP. Apollo Server se "monta" como un
// middleware de Express en la ruta /graphql. Así podemos tener,
// en la misma app, rutas REST normales (ej. /health) y GraphQL.
// =============================================================
import express from 'express';
import cors from 'cors';
import http from 'node:http';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express5';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';

import { connectDB } from './config/db.js';
import { typeDefs } from './graphql/typeDefs.js';
import { resolvers } from './graphql/resolvers.js';

// Render inyecta la variable PORT; en local usamos 4000.
const PORT = process.env.PORT || 4000;

async function startServer() {
  // 5.1 Conectamos a la base de datos ANTES de levantar el servidor.
  await connectDB();

  // 5.2 Creamos la app Express y un servidor HTTP explícito
  //     (lo necesita el plugin de "drain" para cerrar ordenadamente).
  const app = express();
  const httpServer = http.createServer(app);

  // 5.3 Configuramos Apollo Server.
  const server = new ApolloServer({
    typeDefs,
    resolvers,

    // Introspección: permite que herramientas como Apollo Sandbox
    // "pregunten" al servidor qué tipos y campos existen.
    // Por defecto Apollo la DESACTIVA cuando NODE_ENV=production
    // (como en Render), por eso la forzamos a true.
    introspection: true,

    plugins: [
      // Cierra las conexiones activas antes de apagar el servidor.
      ApolloServerPluginDrainHttpServer({ httpServer }),

      // Landing page: en producción Apollo muestra por defecto una
      // página sin editor. Con este plugin se muestra SIEMPRE
      // Apollo Sandbox embebido al abrir /graphql en el navegador.
      ApolloServerPluginLandingPageLocalDefault({ embed: true }),
    ],
  });

  // Apollo debe iniciarse antes de montarlo en Express.
  await server.start();

  // 5.4 Rutas
  // Ruta simple para comprobar que el servicio vive (Render la usa
  // como "Health Check Path").
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  app.get('/', (_req, res) => res.redirect('/graphql'));

  // Endpoint GraphQL:
  //  - cors(): permite peticiones desde otros dominios (ej. Sandbox)
  //  - express.json(): parsea el cuerpo JSON de la petición
  //  - expressMiddleware(): entrega la petición a Apollo
  app.use(
    '/graphql',
    cors(),
    express.json(),
    expressMiddleware(server, {
      // El "context" se crea en cada petición y llega a todos los
      // resolvers como 3er parámetro. Útil, por ejemplo, para
      // pasar el usuario autenticado.
      context: async ({ req }) => ({ ip: req.ip }),
    })
  );

  // 5.5 Escuchamos en 0.0.0.0 para que Render pueda enrutar tráfico.
  await new Promise((resolve) => httpServer.listen({ port: PORT, host: '0.0.0.0' }, resolve));
  console.log(`🚀 Servidor listo en http://localhost:${PORT}/graphql`);
}

startServer().catch((err) => {
  console.error('No se pudo iniciar el servidor:', err);
  process.exit(1);
});
