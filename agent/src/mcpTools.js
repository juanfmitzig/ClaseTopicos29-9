// =============================================================
// Puente MCP → herramientas del AI SDK
// -------------------------------------------------------------
// Lanza el servidor MCP de ../mcp-server por stdio (igual que
// hace mcp-server/test/client.js) y expone sus herramientas como
// tools del AI SDK, tipadas con Zod.
// =============================================================
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { tool } from 'ai';
import { z } from 'zod';
import { auditCatalog } from './audit.js';

const MCP_ENTRY = fileURLToPath(new URL('../../mcp-server/src/index.js', import.meta.url));

const productId = z
  .string()
  .regex(/^[a-f\d]{24}$/i, 'Debe ser un ObjectId de MongoDB (24 caracteres hexadecimales)');

export async function connectMcp() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [MCP_ENTRY],
    env: { ...process.env },
    stderr: 'ignore', // el log de arranque del MCP ensuciaría la terminal
  });
  const client = new Client({ name: 'agente-auditor', version: '1.0.0' });
  await client.connect(transport);
  return client;
}

// Llama a una herramienta MCP y devuelve su contenido estructurado.
async function callMcp(client, name, args) {
  const res = await client.callTool({ name, arguments: args });
  if (res.isError) throw new Error(res.content?.[0]?.text ?? `Falló la herramienta ${name}`);
  return res.structuredContent;
}

/** @param {Client} client */
export function buildTools(client) {
  return {
    get_products: tool({
      description: 'Lista el catálogo completo de productos (id, nombre, precio, stock, categoría, descripción).',
      inputSchema: z.object({}),
      execute: () => callMcp(client, 'get_products', {}),
    }),

    audit_catalog: tool({
      description:
        'Audita el catálogo con reglas deterministas y devuelve los hallazgos. Cada hallazgo trae `safety` ' +
        '("safe" = se puede corregir sin criterio de negocio, "review" = solo reportar) y, si aplica, `suggestedFix`. ' +
        'Úsala SIEMPRE como base de la auditoría.',
      inputSchema: z.object({}),
      execute: async () => auditCatalog((await callMcp(client, 'get_products', {})).products),
    }),

    update_product: tool({
      description:
        'Corrige el precio, stock y/o categoría de un producto. Requiere aprobación del usuario antes de ejecutarse. ' +
        'Incluye siempre en `reason` el hallazgo (F#) que justifica el cambio.',
      inputSchema: z.object({
        id: productId,
        price: z.number().nonnegative().optional(),
        stock: z.number().int().nonnegative().optional(),
        category: z.string().trim().min(1).optional(),
        reason: z.string().min(1).describe('Por qué se hace este cambio (hallazgo y justificación)'),
      }),
      execute: ({ reason: _reason, ...args }) => callMcp(client, 'update_product', args),
    }),
  };
}
