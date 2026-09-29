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

// 3. find_inconsistencies: solo identifica, no modifica nada
const check = await client.callTool({ name: 'find_inconsistencies', arguments: {} });
const { totalProducts, totalIssues, issues } = check.structuredContent;
console.log(`
🔍 find_inconsistencies → ${totalIssues} problemas en ${totalProducts} productos`);
for (const issue of issues) {
  console.log(`   - ${issue.name} [${issue.field}] ${JSON.stringify(issue.value)}: ${issue.problem}`);
}

// 4. update_product: se reescribe la categoría con el MISMO valor,
//    así se prueba la mutación de punta a punta sin alterar los datos.
const same = await client.callTool({
  name: 'update_product',
  arguments: { id: first.id, category: first.category },
});
console.log(
  `\n✏️  update_product (mismo valor) → isError=${same.isError ?? false}, categoría "${same.structuredContent?.product.category}"`
);

// 5. Validaciones (ninguna llega a modificar la base)
const cases = [
  ['Precio negativo', { id: first.id, price: -5 }],
  ['Stock con decimales', { id: first.id, stock: 1.5 }],
  ['Categoría vacía', { id: first.id, category: '   ' }],
  ['Id inválido', { id: 'abc', stock: 1 }],
  ['Sin campos', { id: first.id }],
  ['Id inexistente', { id: '000000000000000000000000', stock: 1 }],
];
for (const [label, args] of cases) {
  const res = await client.callTool({ name: 'update_product', arguments: args });
  console.log(`🚫 ${label} → isError=${res.isError}: ${res.content[0].text.replace(/\s+/g, ' ').slice(0, 110)}`);
}

await client.close();
