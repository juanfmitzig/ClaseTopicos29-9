# Servidor MCP de Productos

Servidor **MCP (Model Context Protocol)** con transporte **stdio**. Permite que un asistente de IA (Claude Desktop, Claude Code, etc.) consulte y modifique productos usando la API GraphQL desplegada en Render.

```
Asistente IA ──JSON-RPC por stdio──► mcp-server ──POST /graphql──► https://clasetopicos29-9.onrender.com
```

## Herramientas

| Tool | Parámetros | Operación GraphQL |
|---|---|---|
| `get_products` | ninguno | `query { products { ... } }` |
| `update_product` | `id` (string, ObjectId **obligatorio**), `price` (number ≥ 0), `stock` (entero ≥ 0), `category` (string no vacío) | `mutation updateProduct(id, input)` |

En `update_product` los tres campos son opcionales, pero hay que enviar al menos uno.

### ¿Cómo se tipan los parámetros?

Con **Zod** (`src/index.js`). El SDK usa esos esquemas para:
1. **Validar** los argumentos antes de ejecutar la herramienta. Por ejemplo, un `price: -5` se rechaza con un error de validación.
2. **Publicar** un JSON Schema en `tools/list`, que es lo que lee el modelo para saber qué parámetros existen y de qué tipo son.

Las dos herramientas también declaran un `outputSchema`, así que devuelven `structuredContent` tipado además del texto.

## Uso

```bash
cd mcp-server
npm install
npm run test:client   # cliente de prueba: lista las tools y las invoca
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
Reinicia Claude Desktop y pide, por ejemplo: *"Muéstrame los productos sin stock y pon 20 unidades al Teclado Mecánico"*.

## Nota importante sobre stdio

En un servidor stdio **nunca** se debe usar `console.log()`. La salida estándar (stdout) transporta los mensajes del protocolo, y cualquier texto extra los corrompe. Para escribir logs se usa `console.error()`, que va a stderr.
