# Agente auditor de catálogo

Agente construido con **Vercel AI SDK** (`ToolLoopAgent`) que usa el servidor MCP de `../mcp-server` para auditar el catálogo de productos, explicar los problemas y corregir los que son seguros **previa aprobación del usuario**.

```
Usuario ─► ToolLoopAgent ─► tools ─► cliente MCP ─stdio─► mcp-server ─► GraphQL
```

## Herramientas del agente

| Tool | Aprobación | Qué hace |
|---|---|---|
| `audit_catalog` | no (solo lectura) | Reglas deterministas (`src/audit.js`): categorías inconsistentes, stock inválido, precios 0/negativos/atípicos, nombres duplicados, descripciones vacías. Cada hallazgo trae `safety` (`safe` / `review`) y `suggestedFix`. |
| `get_products` | no | Listado crudo vía MCP. |
| `update_product` | **sí, siempre** (`toolApproval`) | Cambia `price`, `stock` o `category` vía MCP. |

Reparto de responsabilidades: el código detecta (reproducible), el modelo explica y decide qué corregir, y el humano autoriza cada escritura. Solo los hallazgos `safe` (hoy, unificar la grafía de categorías) se corrigen; precios, stock y duplicados solo se reportan, porque el valor correcto no se puede deducir de los datos.

## Uso

```bash
cd agent
npm install
npm run test:audit   # pruebas sin API key ni red
npm start            # requiere GROQ_API_KEY en ../.env
```

Variables (se leen de `../.env`): `GROQ_API_KEY` (obligatoria), `MODEL` (cualquier modelo de chat de Groq; por defecto `openai/gpt-oss-120b`, alternativa `openai/gpt-oss-20b`), `GRAPHQL_URL` (se pasa al MCP; por defecto la API en Render).

Ejemplo: `> Audita el catálogo y corrige lo que sea seguro`. Por cada cambio se muestra producto, campos y motivo, y se pide `s/N`.
