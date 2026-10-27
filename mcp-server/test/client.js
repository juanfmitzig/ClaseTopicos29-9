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

await client.close();
