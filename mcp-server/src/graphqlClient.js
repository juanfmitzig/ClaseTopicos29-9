// =============================================================
// Cliente GraphQL mínimo
// -------------------------------------------------------------
// GraphQL funciona sobre HTTP: siempre es un POST con un JSON
// { query, variables }. No hace falta ninguna librería extra,
// basta con fetch (incluido en Node 18+).
// =============================================================

// URL del servidor GraphQL. Se puede cambiar con una variable de
// entorno, por ejemplo para apuntar a http://localhost:4000/graphql
export const GRAPHQL_URL =
  process.env.GRAPHQL_URL ?? 'https://clasetopicos29-9.onrender.com/graphql';

// Render (plan gratuito) "duerme" el servicio tras 15 min sin uso y
// la primera petición puede tardar ~1 min: damos un margen amplio.
const TIMEOUT_MS = Number(process.env.GRAPHQL_TIMEOUT_MS ?? 90_000);

/**
 * Ejecuta una operación GraphQL y devuelve el campo "data".
 * Lanza un Error si hay fallo de red, HTTP o errores de GraphQL.
 *
 * @template T
 * @param {string} query - Operación GraphQL (query o mutation)
 * @param {Record<string, unknown>} [variables] - Variables de la operación
 * @returns {Promise<T>}
 */
export async function graphqlRequest(query, variables = {}) {
  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  // GraphQL responde 200 incluso con errores de negocio, pero un
  // 4xx/5xx significa que ni siquiera se pudo procesar la petición
  // (salvo 400, que Apollo usa para errores de validación con cuerpo JSON).
  const body = await response.json().catch(() => null);

  if (!body) {
    throw new Error(`El servidor GraphQL respondió HTTP ${response.status} sin JSON válido`);
  }

  // Errores GraphQL: vienen en un arreglo "errors".
  if (body.errors?.length) {
    const messages = body.errors.map((e) => e.message).join('; ');
    throw new Error(messages);
  }

  if (!response.ok) {
    throw new Error(`El servidor GraphQL respondió HTTP ${response.status}`);
  }

  return body.data;
}
