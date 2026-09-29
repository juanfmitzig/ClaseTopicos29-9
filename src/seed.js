// =============================================================
// Script de carga del catálogo original ("seed")
// Ejecutar con:  npm run seed            (solo si "products" está vacía)
//                npm run seed -- --reset (BORRA todo y vuelve a cargar)
//
// Carga los 50 productos del ejercicio (src/data/catalogo-original.json),
// que tienen errores A PROPÓSITO: precios y stock negativos, precios
// en 0, categorías escritas de distintas formas, descripciones vacías.
// Son los datos que el MCP y el agente tienen que auditar.
// =============================================================
import { readFile } from 'node:fs/promises';
import mongoose from 'mongoose';
import { connectDB } from './config/db.js';

const products = JSON.parse(
  await readFile(new URL('./data/catalogo-original.json', import.meta.url), 'utf8')
);
const reset = process.argv.includes('--reset');

try {
  await connectDB();
  // Se usa la colección "cruda" del driver y no el modelo de Mongoose:
  // el modelo rechazaría los precios/stock negativos y no se cargarían
  // los datos con errores que el ejercicio necesita.
  const collection = mongoose.connection.db.collection('products');
  const existing = await collection.countDocuments();

  if (existing > 0 && !reset) {
    console.error(
      `⛔ "products" ya tiene ${existing} documentos; no se modificó nada.\n` +
        '   Para borrarlos y cargar el catálogo original: npm run seed -- --reset'
    );
    process.exitCode = 1;
  } else {
    if (existing > 0) await collection.deleteMany({});
    const now = new Date();
    const { insertedCount } = await collection.insertMany(
      products.map((p) => ({ ...p, createdAt: now, updatedAt: now }))
    );
    console.log(`🌱 Insertados ${insertedCount} productos en "${collection.dbName}.products"`);
  }
} catch (err) {
  console.error('Error en el seed:', err);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
