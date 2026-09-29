// =============================================================
// Cliente MCP de prueba
// -------------------------------------------------------------
// Simula lo que hace un asistente de IA: lanza el servidor por
// stdio, lista sus herramientas y las invoca.
// Ejecutar con:  npm run test:client
// =============================================================
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: process.execPath, // el mismo "node" que ejecuta este script
  args: ['src/index.js'],
  env: { ...process.env },
});

const client = new Client({ name: 'cliente-prueba', version: '1.0.0' });
await client.connect(transport);

// 1. Descubrir herramientas (lo primero que hace un asistente)
const { tools } = await client.listTools();
console.log('🔧 Herramientas disponibles:');
for (const tool of tools) {
  console.log(`  - ${tool.name}: parámetros ${JSON.stringify(Object.keys(tool.inputSchema.properties ?? {}))}`);
}

// 2. get_products
const list = await client.callTool({ name: 'get_products', arguments: {} });
console.log(`\n📦 get_products → ${list.structuredContent.count} productos`);
const first = list.structuredContent.products[0];
console.log(`   Primero: ${first.name} | precio ${first.price} | stock ${first.stock}`);

// 3. update_product: cambiamos el stock y luego lo restauramos
const updated = await client.callTool({
  name: 'update_product',
  arguments: { id: first.id, stock: first.stock + 1 },
});
console.log(`\n✏️  update_product → stock ${first.stock} ➜ ${updated.structuredContent.product.stock}`);

await client.callTool({ name: 'update_product', arguments: { id: first.id, stock: first.stock } });
console.log(`   (restaurado a ${first.stock})`);

// 4. Validación de tipos: un precio negativo debe ser rechazado
const invalid = await client.callTool({
  name: 'update_product',
  arguments: { id: first.id, price: -5 },
});
console.log(`\n🚫 Precio negativo → isError=${invalid.isError}: ${invalid.content[0].text.slice(0, 120)}`);

// 5. Sin campos para actualizar
const empty = await client.callTool({ name: 'update_product', arguments: { id: first.id } });
console.log(`🚫 Sin campos → isError=${empty.isError}: ${empty.content[0].text}`);

await client.close();
