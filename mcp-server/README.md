# Servidor MCP de Productos

Servidor **MCP (Model Context Protocol)** con transporte **stdio**. Permite que un asistente de IA (Claude Desktop, Claude Code, etc.) consulte productos, **identifique inconsistencias en los datos** y los corrija usando la API GraphQL desplegada en Render.

```
Asistente IA ──JSON-RPC por stdio──► mcp-server ──POST /graphql──► https://clasetopicos29-9.onrender.com
```

## Herramientas

| Tool | Parámetros | Qué hace |
|---|---|---|
| `get_products` | ninguno | Lista todos los productos (`query { products { ... } }`) |
| `update_product` | `id` (string, ObjectId **obligatorio**), `price` (number ≥ 0), `stock` (entero ≥ 0), `category` (string no vacío) | Modifica un producto (`mutation updateProduct(id, input)`) |
| `find_inconsistencies` | ninguno | Lista los errores de formato de los datos (solo lectura) |

En `update_product` los tres campos son opcionales, pero hay que enviar al menos uno. Es la única herramienta que modifica la base: `get_products` y `find_inconsistencies` solo leen.

`find_inconsistencies` (lógica en `src/inconsistencies.js`) detecta:
- Mayúsculas/minúsculas: todo en MAYÚSCULAS, todo en minúsculas, empieza con minúscula y, en categorías, mezcla dentro de una palabra (`ElectRónica`).
- Categorías escritas de distintas formas (`Hogar` / `hogar` / `ELECTRONICA` vs `Electronica`).
- Espacios al inicio/final o dobles, textos vacíos (incluidas las descripciones) y valores nulos.
- Precios negativos, en 0 o con más de 2 decimales.
- Stock negativo o con decimales.
- Nombres duplicados (ignorando mayúsculas, tildes y espacios).

Cada problema se devuelve como `{ id, name, field, value, problem }`.

> **Límite:** la API GraphQL declara `price: Float!` y `stock: Int!`. Si en la base hay un precio nulo o un stock con decimales, la API falla antes de llegar al MCP y la herramienta devuelve ese error.

### ¿Cómo se tipan los parámetros?

Con **Zod** (`src/index.js`). El SDK usa esos esquemas para:
1. **Validar** los argumentos antes de ejecutar la herramienta. Por ejemplo, un `price: -5` en `update_product` se rechaza con un error de validación.
2. **Publicar** un JSON Schema en `tools/list`, que es lo que lee el modelo para saber qué parámetros existen y de qué tipo son.

Las tres herramientas también declaran un `outputSchema`, así que devuelven `structuredContent` tipado además del texto.

## Uso

```bash
cd mcp-server
npm install
npm run test:client   # cliente de prueba: lista las tools y las invoca (no altera los datos)
npm run inspector     # abre MCP Inspector (interfaz web para probar las tools)
```

Variables de entorno opcionales:
- `GRAPHQL_URL`: por defecto `https://clasetopicos29-9.onrender.com/graphql`. Usa `http://localhost:4000/graphql` para probar contra el servidor local.
- `GRAPHQL_TIMEOUT_MS`: por defecto `90000`. Es alto porque Render gratuito tarda en "despertar".

## Conectarlo a Claude

**Claude Code** (desde la raíz del repositorio):
```bash
claude mcp add productos -- node mcp-server/src/index.js
```

**Claude Desktop**: edita `claude_desktop_config.json` (en Windows, `%APPDATA%\Claude\claude_desktop_config.json`) y usa la **ruta absoluta**:
```json
{
  "mcpServers": {
    "productos": {
      "command": "node",
      "args": ["C:\\ruta\\a\\ClaseTopicos29-9\\mcp-server\\src\\index.js"]
    }
  }
}
```
Reinicia Claude Desktop y pide, por ejemplo: *"Busca las inconsistencias en los datos de productos"*.

## Nota importante sobre stdio

En un servidor stdio **nunca** se debe usar `console.log()`. La salida estándar (stdout) transporta los mensajes del protocolo, y cualquier texto extra los corrompe. Para escribir logs se usa `console.error()`, que va a stderr.
