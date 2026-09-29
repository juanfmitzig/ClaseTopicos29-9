#!/usr/bin/env node
// =============================================================
// Servidor MCP (Model Context Protocol) por stdio
// -------------------------------------------------------------
// MCP es un protocolo estándar para que un asistente de IA (Claude,
// por ejemplo) use "herramientas" externas. Este servidor expone
// dos herramientas de SOLO LECTURA que, por debajo, llaman a
// nuestra API GraphQL:
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
import { findInconsistencies } from './inconsistencies.js';

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

// Forma de un producto tal como lo devuelve la API GraphQL.
// Es PERMISIVA a propósito: el objetivo es detectar datos
// incorrectos, así que no debe rechazar un stock con decimales o
// un nombre nulo; esos casos los reporta find_inconsistencies.
const productSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  price: z.number().nullable(),
  stock: z.number().nullable(),
  category: z.string().nullable(),
  description: z.string().nullable(),
});

// Forma de cada inconsistencia encontrada.
const issueSchema = z.object({
  id: z.string().describe('ID del producto afectado'),
  name: z.string().nullable().describe('Nombre del producto afectado'),
  field: z.string().describe('Campo con el problema'),
  value: z.unknown().describe('Valor actual del campo'),
  problem: z.string().describe('Descripción del problema'),
});

// Campos que pedimos a la API (fragmento reutilizable).
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

// Pide todos los productos a la API GraphQL (lo usan ambas herramientas).
async function fetchProducts() {
  const data = await graphqlRequest(/* GraphQL */ `
    query GetProducts {
      products { ...ProductFields }
    }
    ${PRODUCT_FIELDS}
  `);
  return data.products;
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
      const products = await fetchProducts();
      const result = { count: products.length, products };

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
// PASO 4: Herramienta find_inconsistencies
// -------------------------------------------------------------
// SOLO IDENTIFICA problemas de formato en los datos; no corrige
// nada. Por eso este servidor no expone ninguna herramienta que
// modifique la base de datos.
server.registerTool(
  'find_inconsistencies',
  {
    title: 'Buscar inconsistencias',
    description:
      'Revisa todos los productos y lista los errores de formato SIN modificar nada: ' +
      'mayúsculas/minúsculas inconsistentes, categorías escritas de distintas formas, ' +
      'espacios sobrantes, textos vacíos, precios negativos o en 0, stock negativo o con decimales, ' +
      'valores nulos y nombres duplicados.',
    inputSchema: {},
    outputSchema: {
      totalProducts: z.number().int().describe('Cantidad de productos revisados'),
      totalIssues: z.number().int().describe('Cantidad de inconsistencias encontradas'),
      issues: z.array(issueSchema),
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
    },
  },
  async () => {
    try {
      const products = await fetchProducts();
      const issues = findInconsistencies(products);
      const result = { totalProducts: products.length, totalIssues: issues.length, issues };

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    } catch (err) {
      return toolError(`no se pudieron revisar los productos: ${err.message}`);
    }
  }
);

// -------------------------------------------------------------
// PASO 5: Conectar el transporte stdio
// -------------------------------------------------------------
const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`✅ Servidor MCP "mcp-productos" listo (stdio) → ${GRAPHQL_URL}`);
