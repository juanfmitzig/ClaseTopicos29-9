// =============================================================
// PASO 1: Conexión a MongoDB Atlas con Mongoose
// -------------------------------------------------------------
// Mongoose es un ODM (Object Document Mapper): nos permite definir
// "modelos" con esquema y validaciones sobre MongoDB, que por sí
// solo no impone ninguna estructura a los documentos.
// =============================================================
import dns from 'node:dns';
import mongoose from 'mongoose';

// Las URI "mongodb+srv://" requieren una consulta DNS de tipo SRV.
// En algunas PCs Windows Node usa un DNS local (127.0.0.1) que no
// responde esas consultas → error "querySrv ECONNREFUSED".
// Solución opcional: definir DNS_SERVERS="8.8.8.8,1.1.1.1" en .env.
if (process.env.DNS_SERVERS) {
  dns.setServers(process.env.DNS_SERVERS.split(',').map((s) => s.trim()));
}

export async function connectDB() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    // Fallar rápido: sin URI no tiene sentido levantar el servidor.
    throw new Error('Falta la variable de entorno MONGODB_URI');
  }

  // Eventos útiles para entender el ciclo de vida de la conexión.
  mongoose.connection.on('connected', () => console.log('✅ MongoDB conectado'));
  mongoose.connection.on('error', (err) => console.error('❌ Error de MongoDB:', err.message));
  mongoose.connection.on('disconnected', () => console.warn('⚠️  MongoDB desconectado'));

  // connect() devuelve una promesa: esperamos a que la conexión
  // esté lista antes de aceptar peticiones.
  await mongoose.connect(uri);
}
