// =============================================================
// Script de datos de prueba ("seed")
// Ejecutar con:  npm run seed
// Borra los productos existentes e inserta un catálogo de ejemplo.
// =============================================================
import mongoose from 'mongoose';
import { connectDB } from './config/db.js';
import { Product } from './models/Product.js';

const products = [
  { name: 'Laptop Pro 14', price: 1299.99, stock: 8, category: 'Electrónica', description: 'Portátil de 14" con 16 GB de RAM' },
  { name: 'Mouse Inalámbrico', price: 24.5, stock: 150, category: 'Electrónica', description: 'Mouse ergonómico Bluetooth' },
  { name: 'Teclado Mecánico', price: 89.9, stock: 0, category: 'Electrónica', description: 'Switches rojos, retroiluminado' },
  { name: 'Silla Ergonómica', price: 249, stock: 12, category: 'Muebles', description: 'Soporte lumbar ajustable' },
  { name: 'Escritorio Elevable', price: 399, stock: 5, category: 'Muebles', description: 'Altura regulable eléctrica' },
  { name: 'Café en Grano 1kg', price: 18.75, stock: 60, category: 'Alimentos', description: 'Tostado medio, origen Colombia' },
  { name: 'Té Verde 100 bolsas', price: 7.2, stock: 0, category: 'Alimentos', description: 'Té verde orgánico' },
  { name: 'Libro: Aprende GraphQL', price: 35, stock: 25, category: 'Libros', description: 'Guía práctica de GraphQL con Node.js' },
];

try {
  await connectDB();
  await Product.deleteMany({});
  const inserted = await Product.insertMany(products);
  console.log(`🌱 Insertados ${inserted.length} productos`);
} catch (err) {
  console.error('Error en el seed:', err);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
