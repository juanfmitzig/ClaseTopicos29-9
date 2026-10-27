// =============================================================
// Agente auditor de catálogo (Vercel AI SDK + MCP)
// -------------------------------------------------------------
//   Usuario ──► ToolLoopAgent ──tools──► cliente MCP ──stdio──► mcp-server ──► GraphQL
//
// Flujo: el agente audita (solo lectura), explica los hallazgos y
// propone correcciones. Toda llamada a update_product se detiene
// en un `tool-approval-request` y solo se ejecuta si el usuario
// escribe "s" en la terminal.
//
// Ejecutar:  npm start            (desde agent/)
// =============================================================
import { createInterface } from 'node:readline/promises';
import { groq } from '@ai-sdk/groq';
import { ToolLoopAgent, isStepCount } from 'ai';
import { buildTools, connectMcp } from './mcpTools.js';

if (!process.env.GROQ_API_KEY) {
  console.error('Falta GROQ_API_KEY. Defínela en el archivo .env de la raíz del repositorio.');
  process.exit(1);
}

const INSTRUCTIONS = `Eres un auditor de catálogo de productos. Respondes siempre en español.

Proceso:
1. Llama a audit_catalog para obtener los hallazgos (no inventes problemas que no estén ahí; puedes usar get_products si necesitas más contexto).
2. Explica los hallazgos agrupados por severidad: qué pasa, en qué producto y por qué importa.
3. Corrige SOLO los hallazgos con safety "safe" cuya corrección se deduzca de los datos (p. ej. unificar la grafía de una categoría). Nunca inventes precios ni stock: lo que sea "review" se reporta y se deja a una persona.
4. Para cada corrección llama a update_product con el campo mínimo necesario y una "reason" que cite el hallazgo. El usuario aprobará o rechazará cada cambio.
5. Si un cambio es rechazado, no lo reintentes ni insistas: continúa con los demás.
6. Al terminar resume qué se corrigió, qué se rechazó y qué queda pendiente de revisión humana.

Si el usuario solo pide auditar o explicar, no modifiques nada.`;

const mcp = await connectMcp();
const rl = createInterface({ input: process.stdin, output: process.stdout });

const agent = new ToolLoopAgent({
  model: groq(process.env.MODEL ?? 'openai/gpt-oss-120b'),
  instructions: INSTRUCTIONS,
  tools: buildTools(mcp),
  stopWhen: isStepCount(25),
  // Las lecturas se ejecutan solas; cualquier escritura espera aprobación humana.
  toolApproval: { update_product: 'user-approval' },
});

// Muestra la petición de aprobación y pregunta al usuario.
async function askApproval(part) {
  const { id, reason, ...changes } = part.toolCall.input;
  console.log('\n┌─ Cambio propuesto ─────────────────────────');
  console.log(`│ Producto: ${id}`);
  console.log(`│ Cambios:  ${JSON.stringify(changes)}`);
  console.log(`│ Motivo:   ${reason}`);
  console.log('└────────────────────────────────────────────');
  const answer = (await rl.question('¿Aprobar este cambio? (s/N) ')).trim().toLowerCase();
  const approved = answer === 's' || answer === 'si' || answer === 'sí';
  return {
    type: 'tool-approval-response',
    approvalId: part.approvalId,
    approved,
    reason: approved ? 'Aprobado por el usuario' : 'Rechazado por el usuario',
  };
}

// Un turno: genera, atiende las aprobaciones pendientes y repite hasta que no haya más.
async function runTurn(messages) {
  for (;;) {
    const result = await agent.generate({ messages });
    messages.push(...result.responseMessages);
    if (result.text) console.log(`\n${result.text}`);

    const requests = result.content.filter((p) => p.type === 'tool-approval-request' && !p.isAutomatic);
    if (requests.length === 0) return;

    const responses = [];
    for (const req of requests) responses.push(await askApproval(req));
    messages.push({ role: 'tool', content: responses });
  }
}

const messages = [];
console.log('🔎 Agente auditor de catálogo. Escribe "salir" para terminar.');
console.log('   Ej.: "Audita el catálogo y corrige lo que sea seguro"\n');

try {
  for (;;) {
    const input = (await rl.question('> ')).trim();
    if (!input) continue;
    if (['salir', 'exit'].includes(input.toLowerCase())) break;
    messages.push({ role: 'user', content: input });
    try {
      await runTurn(messages);
    } catch (err) {
      console.error(`\nError: ${err.message}`);
    }
  }
} finally {
  rl.close();
  await mcp.close();
}
