#!/usr/bin/env node
// =============================================================
// Servidor MCP (Model Context Protocol) por stdio
// -------------------------------------------------------------
// MCP es un protocolo estándar para que un asistente de IA (Claude,
// por ejemplo) use "herramientas" externas. Este servidor expone
// dos herramientas que, por debajo, llaman a nuestra API GraphQL:
//
//   Asistente IA ──MCP (stdio)──► este servidor ──HTTP/GraphQL──► Render
//
// Transporte stdio: el cliente (Claude Desktop, Claude Code...)
// lanza este proceso y se comunica escribiendo/leyendo mensajes
// JSON-RPC por la entrada y salida estándar.
//
// ⚠️ REGLA DE ORO en stdio: NUNCA usar console.log(). stdout está
// reservado para el protocolo; cualquier texto extra lo corrompe.
// Para logs se usa console.error() (va a stderr).
// =============================================================
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { graphqlRequest, GRAPHQL_URL } from './graphqlClient.js';

// -------------------------------------------------------------
// PASO 1: Esquemas de tipos con Zod
// -------------------------------------------------------------
// Zod cumple dos funciones:
//   1. VALIDA en tiempo de ejecución los argumentos que envía el
//      modelo (si no cumplen, el SDK rechaza la llamada).
//   2. El SDK lo CONVIERTE a JSON Schema, que es lo que el modelo
//      ve para saber qué parámetros existen y de qué tipo son.
// Por eso las descripciones (.describe) son importantes: son la
// "documentación" que lee la IA.

// Un id de MongoDB (ObjectId) son 24 caracteres hexadecimales.
const productId = z
  .string()
  .regex(/^[a-f\d]{24}$/i, 'Debe ser un ObjectId de MongoDB (24 caracteres hexadecimales)')
  .describe('ID del producto (ObjectId de MongoDB, 24 caracteres hexadecimales)');

// Forma de un producto tal como lo devuelve la API GraphQL.
const productSchema = z.object({
  id: z.string(),
  name: z.string(),
  price: z.number(),
  stock: z.number().int(),
  category: z.string(),
  description: z.string().nullable(),
});

// Campos que pedimos en ambas operaciones (fragmento reutilizable).
const PRODUCT_FIELDS = /* GraphQL */ `
  fragment ProductFields on Product {
    id
    name
    price
    stock
    category
    description
  }
`;

// Devuelve un resultado de error "amigable" para el modelo.
// isError: true le indica al cliente que la herramienta falló,
// para que la IA pueda explicar el problema o reintentar.
function toolError(message) {
  return {
    isError: true,
    content: [{ type: 'text', text: `Error: ${message}` }],
  };
}

// -------------------------------------------------------------
// PASO 2: Crear el servidor MCP
// -------------------------------------------------------------
const server = new McpServer({
  name: 'mcp-productos',
  version: '1.0.0',
});

// -------------------------------------------------------------
// PASO 3: Herramienta get_products
// -------------------------------------------------------------
// registerTool(nombre, definición, manejador)
//   - inputSchema: parámetros de entrada (aquí no hay ninguno)
//   - outputSchema: forma del resultado estructurado
//   - annotations: pistas para el cliente (ej. que es solo lectura)
server.registerTool(
  'get_products',
  {
    title: 'Listar productos',
    description:
      'Obtiene el listado completo de productos del catálogo (id, nombre, precio, stock, categoría y descripción).',
    inputSchema: {},
    outputSchema: {
      count: z.number().int().describe('Cantidad de productos'),
      products: z.array(productSchema),
    },
    annotations: {
      readOnlyHint: true, // no modifica datos
      openWorldHint: true, // se comunica con un servicio externo
    },
  },
  async () => {
    try {
      const data = await graphqlRequest(/* GraphQL */ `
        query GetProducts {
          products { ...ProductFields }
        }
        ${PRODUCT_FIELDS}
      `);

      const result = { count: data.products.length, products: data.products };

      return {
        // content: texto que lee el modelo (compatibilidad con todos los clientes)
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        // structuredContent: el mismo resultado como objeto tipado (validado con outputSchema)
        structuredContent: result,
      };
    } catch (err) {
      return toolError(`no se pudieron obtener los productos: ${err.message}`);
    }
  }
);

// -------------------------------------------------------------
// PASO 4: Herramienta update_product
// -------------------------------------------------------------
server.registerTool(
  'update_product',
  {
    title: 'Actualizar producto',
    description:
      'Modifica el precio, el stock y/o la categoría de un producto a partir de su ID. ' +
      'Solo se cambian los campos enviados; se debe enviar al menos uno.',
    inputSchema: {
      id: productId,
      price: z
        .number()
        .nonnegative('El precio no puede ser negativo')
        .optional()
        .describe('Nuevo precio (número mayor o igual a 0)'),
      stock: z
        .number()
        .int('El stock debe ser un número entero')
        .nonnegative('El stock no puede ser negativo')
        .optional()
        .describe('Nuevo stock (entero mayor o igual a 0)'),
      category: z
        .string()
        .trim()
        .min(1, 'La categoría no puede estar vacía')
        .optional()
        .describe('Nueva categoría (ej. "Electrónica", "Muebles")'),
    },
    outputSchema: {
      product: productSchema.describe('Producto ya actualizado'),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false, // modifica, pero no borra
      idempotentHint: true, // repetir la misma llamada deja el mismo resultado
      openWorldHint: true,
    },
  },
  // Gracias a Zod, los argumentos ya llegan validados y tipados.
  async ({ id, price, stock, category }) => {
    // Construimos el input solo con los campos que se enviaron.
    const input = Object.fromEntries(
      Object.entries({ price, stock, category }).filter(([, v]) => v !== undefined)
    );

    if (Object.keys(input).length === 0) {
      return toolError('debes indicar al menos uno de estos campos: price, stock o category.');
    }

    try {
      // Usamos VARIABLES en vez de concatenar texto en la consulta:
      // evita errores de formato e inyecciones, igual que en SQL.
      const data = await graphqlRequest(
        /* GraphQL */ `
          mutation UpdateProduct($id: ID!, $input: UpdateProductInput!) {
            updateProduct(id: $id, input: $input) { ...ProductFields }
          }
          ${PRODUCT_FIELDS}
        `,
        { id, input }
      );

      const result = { product: data.updateProduct };

      return {
        content: [
          { type: 'text', text: `Producto actualizado:\n${JSON.stringify(result.product, null, 2)}` },
        ],
        structuredContent: result,
      };
    } catch (err) {
      return toolError(`no se pudo actualizar el producto ${id}: ${err.message}`);
    }
  }
);

// -------------------------------------------------------------
// PASO 5: Conectar el transporte stdio
// -------------------------------------------------------------
const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`✅ Servidor MCP "mcp-productos" listo (stdio) → ${GRAPHQL_URL}`);
