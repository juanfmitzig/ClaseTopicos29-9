// =============================================================
// Pruebas sin API key ni red
// 1. Las reglas de auditoría detectan los problemas esperados.
// 2. update_product se detiene en una solicitud de aprobación y
//    solo se ejecuta si la respuesta es "approved".
// Ejecutar con:  npm run test:audit
// =============================================================
import assert from 'node:assert/strict';
import { ToolLoopAgent, tool } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod';
import { auditCatalog } from '../src/audit.js';

// ---- 1. Auditoría ----
const p = (id, over) => ({
  id, name: `Producto ${id}`, price: 10, stock: 5, category: 'Electrónica', description: 'ok', ...over,
});
const report = auditCatalog([
  p('1'), p('2'),
  p('3', { category: 'ELECTRÓNICA' }),
  p('4', { category: ' Electrónica ' }),
  p('5', { price: 0 }),
  p('6', { name: 'Mouse' }), p('7', { name: 'mouse' }),
  p('8', { description: '' }),
  p('9', { stock: 0 }),
]);
const types = report.findings.map((f) => f.type);
for (const t of ['category_inconsistent', 'price_zero', 'duplicate_name', 'description_missing', 'out_of_stock']) {
  assert.ok(types.includes(t), `debería detectar ${t}`);
}
const cats = report.findings.filter((f) => f.type === 'category_inconsistent');
assert.equal(cats.length, 2);
assert.ok(cats.every((f) => f.safety === 'safe' && f.suggestedFix.category === 'Electrónica'));
assert.ok(report.findings.filter((f) => f.type === 'price_zero').every((f) => f.safety === 'review'));
console.log(`✔ auditoría: ${report.totalFindings} hallazgos`, report.summary);

// ---- 2. Aprobación ----
const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};
async function run(approved) {
  let executed = 0;
  let calls = 0;
  const model = new MockLanguageModelV4({
    doGenerate: async () =>
      calls++ === 0
        ? {
            content: [{
              type: 'tool-call', toolCallId: 'c1', toolName: 'update_product',
              input: JSON.stringify({ id: 'a'.repeat(24), category: 'Electrónica', reason: 'F1' }),
            }],
            finishReason: { unified: 'tool-calls', raw: undefined }, usage, warnings: [],
          }
        : { content: [{ type: 'text', text: 'listo' }], finishReason: { unified: 'stop', raw: undefined }, usage, warnings: [] },
  });
  const agent = new ToolLoopAgent({
    model,
    tools: {
      update_product: tool({
        inputSchema: z.object({ id: z.string(), category: z.string(), reason: z.string() }),
        execute: async () => { executed++; return { ok: true }; },
      }),
    },
    toolApproval: { update_product: 'user-approval' },
  });
  const messages = [{ role: 'user', content: 'corrige' }];
  const first = await agent.generate({ messages });
  messages.push(...first.responseMessages);
  const req = first.content.find((x) => x.type === 'tool-approval-request');
  assert.ok(req, 'debe pedir aprobación');
  assert.equal(executed, 0, 'no debe ejecutarse antes de aprobar');
  assert.equal(req.toolCall.input.category, 'Electrónica');
  messages.push({ role: 'tool', content: [{ type: 'tool-approval-response', approvalId: req.approvalId, approved }] });
  await agent.generate({ messages });
  return executed;
}
assert.equal(await run(true), 1);
assert.equal(await run(false), 0);
console.log('✔ aprobación: ejecuta solo si se aprueba');
