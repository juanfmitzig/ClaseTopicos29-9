// =============================================================
// Detección de inconsistencias en los datos de productos
// -------------------------------------------------------------
// Funciones PURAS: reciben la lista de productos y devuelven los
// problemas encontrados. No modifican nada; solo IDENTIFICAN.
//
// Cada problema tiene la forma:
//   { id, name, field, value, problem }
// =============================================================

// Quita tildes y pasa a minúsculas: "Electrónica" → "electronica".
// Sirve para agrupar valores que "deberían" ser el mismo.
function normalize(text) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// ¿Tiene al menos una letra? (para no juzgar mayúsculas en "14" o "1kg")
const hasLetters = (text) => /\p{L}/u.test(text);

// Problemas de formato de un texto (espacios y mayúsculas).
// mixedCase: revisar "ElectRónica". Solo para categorías: en nombres
// es normal que haya marcas como "NextGen" o "WiFi".
function checkText(value, { required, mixedCase = false }) {
  const problems = [];

  if (value === null || value === undefined) {
    if (required) problems.push('Valor nulo en un campo obligatorio');
    return problems;
  }
  if (typeof value !== 'string') {
    problems.push(`Tipo incorrecto: se esperaba texto y es ${typeof value}`);
    return problems;
  }
  if (value.trim() === '') {
    problems.push(required ? 'Texto vacío en un campo obligatorio' : 'Texto vacío');
    return problems;
  }

  if (value !== value.trim()) problems.push('Espacios al inicio o al final');
  if (/\s{2,}/.test(value)) problems.push('Espacios dobles dentro del texto');

  if (hasLetters(value)) {
    if (value === value.toUpperCase() && value.length > 3) {
      problems.push('Todo en MAYÚSCULAS');
    } else if (value === value.toLowerCase() && /^\p{L}/u.test(value.trim())) {
      // (si empieza con un número, como "32 puntas...", no es un error)
      problems.push('Todo en minúsculas');
    } else if (/^\p{Ll}/u.test(value.trim())) {
      problems.push('Empieza con minúscula');
    } else if (mixedCase && /\p{Ll}\p{Lu}/u.test(value) && !/\p{Lu}{2,}/u.test(value)) {
      // "ElectRónica": mayúscula en medio de una palabra
      problems.push('Mezcla de mayúsculas y minúsculas dentro de una palabra');
    }
  }
  return problems;
}

// Problemas de un número (negativo, no numérico, decimales, etc.).
function checkNumber(value, { integer, allowZero, maxDecimals }) {
  const problems = [];

  if (value === null || value === undefined) return ['Valor nulo en un campo obligatorio'];
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return [`Tipo incorrecto: se esperaba número y es ${typeof value}`];
  }

  if (value < 0) problems.push('Número negativo');
  if (value === 0 && !allowZero) problems.push('Valor en 0');
  if (integer && !Number.isInteger(value)) problems.push('Debería ser un número entero');
  if (maxDecimals !== undefined) {
    const decimals = (String(value).split('.')[1] ?? '').length;
    if (decimals > maxDecimals) problems.push(`Más de ${maxDecimals} decimales`);
  }
  return problems;
}

// Valores que son "el mismo" pero escritos distinto
// (ej. "Muebles", "muebles", "MUEBLES", "Electronica" vs "Electrónica").
function findVariants(products, field) {
  const groups = new Map();
  for (const p of products) {
    if (typeof p[field] !== 'string' || p[field].trim() === '') continue;
    const key = normalize(p[field]);
    if (!groups.has(key)) groups.set(key, new Map());
    const spellings = groups.get(key);
    spellings.set(p[field], (spellings.get(p[field]) ?? 0) + 1);
  }

  const issues = [];
  for (const spellings of groups.values()) {
    if (spellings.size < 2) continue;
    // La forma más usada se toma como la "correcta".
    const [mostCommon] = [...spellings.entries()].sort((a, b) => b[1] - a[1])[0];
    const all = [...spellings.keys()].map((s) => `"${s}"`).join(', ');
    for (const p of products) {
      if (p[field] !== mostCommon && spellings.has(p[field])) {
        issues.push({
          id: p.id,
          name: p.name,
          field,
          value: p[field],
          problem: `Escrito distinto que otros productos (variantes: ${all}; la más usada es "${mostCommon}")`,
        });
      }
    }
  }
  return issues;
}

// Productos con el mismo nombre (ignorando mayúsculas, tildes y espacios).
function findDuplicateNames(products) {
  const seen = new Map();
  const issues = [];
  for (const p of products) {
    if (typeof p.name !== 'string' || p.name.trim() === '') continue;
    const key = normalize(p.name);
    if (seen.has(key)) {
      issues.push({
        id: p.id,
        name: p.name,
        field: 'name',
        value: p.name,
        problem: `Nombre duplicado (ya existe "${seen.get(key).name}", id ${seen.get(key).id})`,
      });
    } else {
      seen.set(key, p);
    }
  }
  return issues;
}

/**
 * Revisa todos los productos y devuelve la lista de inconsistencias.
 * @param {Array<object>} products
 * @returns {Array<{id: string, name: string, field: string, value: unknown, problem: string}>}
 */
export function findInconsistencies(products) {
  const issues = [];
  const add = (p, field, problems) => {
    for (const problem of problems) {
      issues.push({ id: p.id, name: p.name, field, value: p[field], problem });
    }
  };

  for (const p of products) {
    add(p, 'name', checkText(p.name, { required: true }));
    add(p, 'category', checkText(p.category, { required: true, mixedCase: true }));
    add(p, 'description', checkText(p.description, { required: false }));
    add(p, 'price', checkNumber(p.price, { integer: false, allowZero: false, maxDecimals: 2 }));
    add(p, 'stock', checkNumber(p.stock, { integer: true, allowZero: true }));
  }

  issues.push(...findVariants(products, 'category'));
  issues.push(...findDuplicateNames(products));

  return issues;
}
