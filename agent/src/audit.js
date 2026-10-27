// =============================================================
// Auditoría determinista del catálogo
// -------------------------------------------------------------
// Estas reglas NO dependen del modelo: detectan los problemas de
// forma reproducible. El LLM las usa como evidencia, las explica
// y decide cuáles corregir. Cada hallazgo indica si se puede
// corregir con las herramientas del MCP (price, stock, category)
// y cuán seguro es hacerlo:
//   - safe:   la corrección se deduce de los datos, sin criterio de negocio
//   - review: requiere una decisión humana (el agente solo lo reporta)
// =============================================================

// Quita acentos, espacios sobrantes y mayúsculas para comparar textos.
const normalize = (s) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const hasAccent = (s) => /\p{Diacritic}/u.test(s.normalize('NFD'));
const titleCase = (s) => s.trim().charAt(0).toUpperCase() + s.trim().slice(1).toLowerCase();

// Elige la grafía "oficial" de una categoría entre sus variantes:
// prefiere las que ya están en formato "Título", luego con tilde, luego la más usada.
// Si ninguna está en formato "Título" (p. ej. "hogar" / "HOGAR"), se deriva de la más usada.
function pickCanonicalCategory(spellings) {
  const ranked = [...spellings.entries()].sort(
    (a, b) => hasAccent(b[0]) - hasAccent(a[0]) || b[1] - a[1]
  );
  const proper = ranked.find(([s]) => s === titleCase(s));
  return proper ? proper[0] : titleCase(ranked[0][0]);
}

const median = (nums) => {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * @typedef {{
 *   id: string, name: string, price: number, stock: number,
 *   category: string, description: string | null
 * }} Product
 */

/** @param {Product[]} products */
export function auditCatalog(products) {
  const findings = [];
  const add = (f) => findings.push({ ...f, id: `F${findings.length + 1}` });

  // 1. Categorías escritas distinto (p. ej. "Electronica" vs "Electrónica ").
  const byCategory = new Map();
  for (const p of products) {
    const key = normalize(p.category);
    byCategory.set(key, [...(byCategory.get(key) ?? []), p]);
  }
  for (const group of byCategory.values()) {
    const spellings = new Map();
    for (const p of group) spellings.set(p.category, (spellings.get(p.category) ?? 0) + 1);
    if (spellings.size < 2) continue;
    const canonical = pickCanonicalCategory(spellings);
    for (const p of group.filter((x) => x.category !== canonical)) {
      add({
        type: 'category_inconsistent',
        severity: 'medium',
        safety: 'safe',
        productId: p.id,
        productName: p.name,
        detail: `Categoría "${p.category}" es una variante de "${canonical}"`,
        suggestedFix: { category: canonical },
      });
    }
  }

  // 2. Stock inválido (negativo o no entero).
  for (const p of products) {
    if (!Number.isInteger(p.stock) || p.stock < 0) {
      const fixed = Math.max(0, Math.round(p.stock));
      add({
        type: 'stock_invalid',
        severity: 'high',
        safety: 'review', // no sabemos cuál es el stock real
        productId: p.id,
        productName: p.name,
        detail: `Stock inválido: ${p.stock}`,
        suggestedFix: { stock: fixed },
      });
    }
  }

  // 3. Precios inválidos o sospechosos.
  const prices = products.map((p) => p.price).filter((n) => n > 0);
  const med = prices.length ? median(prices) : 0;
  for (const p of products) {
    if (p.price < 0) {
      add({
        type: 'price_negative',
        severity: 'high',
        safety: 'review',
        productId: p.id,
        productName: p.name,
        detail: `Precio negativo: ${p.price}`,
      });
    } else if (p.price === 0) {
      add({
        type: 'price_zero',
        severity: 'high',
        safety: 'review',
        productId: p.id,
        productName: p.name,
        detail: 'Precio en 0: no se puede inferir el precio correcto',
      });
    } else if (med > 0 && p.price > med * 50) {
      add({
        type: 'price_outlier',
        severity: 'low',
        safety: 'review',
        productId: p.id,
        productName: p.name,
        detail: `Precio ${p.price} es más de 50 veces la mediana (${med})`,
      });
    }
  }

  // 4. Nombres duplicados (mismo nombre normalizado).
  const byName = new Map();
  for (const p of products) {
    const key = normalize(p.name);
    byName.set(key, [...(byName.get(key) ?? []), p]);
  }
  for (const group of byName.values()) {
    if (group.length < 2) continue;
    add({
      type: 'duplicate_name',
      severity: 'medium',
      safety: 'review', // el MCP no puede eliminar ni fusionar productos
      productId: group.map((p) => p.id).join(','),
      productName: group[0].name,
      detail: `${group.length} productos con el mismo nombre (ids: ${group.map((p) => p.id).join(', ')})`,
    });
  }

  // 5. Datos incompletos o con formato descuidado.
  for (const p of products) {
    if (!p.description?.trim()) {
      add({
        type: 'description_missing',
        severity: 'low',
        safety: 'review', // el MCP no puede editar descripciones
        productId: p.id,
        productName: p.name,
        detail: 'Sin descripción',
      });
    }
    if (p.name !== p.name.trim() || /\s{2,}/.test(p.name)) {
      add({
        type: 'name_whitespace',
        severity: 'low',
        safety: 'review', // el MCP no puede editar nombres
        productId: p.id,
        productName: p.name,
        detail: 'El nombre tiene espacios sobrantes',
      });
    }
  }

  // 6. Información útil (no es un error).
  for (const p of products) {
    if (p.stock === 0) {
      add({
        type: 'out_of_stock',
        severity: 'info',
        safety: 'review',
        productId: p.id,
        productName: p.name,
        detail: 'Sin stock (puede ser intencional)',
      });
    }
  }

  const summary = Object.fromEntries(
    ['high', 'medium', 'low', 'info'].map((s) => [s, findings.filter((f) => f.severity === s).length])
  );

  return { totalProducts: products.length, totalFindings: findings.length, summary, findings };
}
