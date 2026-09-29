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

  // Nombre de la base. La cadena que da Atlas ("...mongodb.net/?appName=...")
  // NO incluye la base, y en ese caso Mongoose usa "test" en silencio:
  // la API termina leyendo una base distinta de la que tiene los datos.
  // Con MONGODB_DB_NAME se indica explícitamente (tiene prioridad sobre la URI).
  const dbName = process.env.MONGODB_DB_NAME?.trim() || undefined;

  // connect() devuelve una promesa: esperamos a que la conexión
  // esté lista antes de aceptar peticiones.
  await mongoose.connect(uri, { dbName });

  await logDatabaseInfo();
}

// Muestra en los logs a qué base se conectó y cuántos productos ve.
// Si no ve ninguno, busca en qué base del cluster están los "products".
async function logDatabaseInfo() {
  const db = mongoose.connection.db;
  const count = await db.collection('products').countDocuments();
  console.log(`📂 Base de datos: "${db.databaseName}" → ${count} productos en "products"`);

  if (count > 0) return;
  try {
    const { databases } = await db.admin().listDatabases({ nameOnly: true });
    for (const { name } of databases) {
      if (['admin', 'local', 'config'].includes(name)) continue;
      const other = mongoose.connection.client.db(name);
      const n = await other.collection('products').countDocuments();
      if (n > 0) {
        console.warn(`⚠️  La base "${name}" tiene ${n} productos: usa MONGODB_DB_NAME="${name}"`);
      }
    }
  } catch {
    // El usuario de la base puede no tener permiso para listar bases.
  }
}
