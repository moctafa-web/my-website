// لصق التجار من إكسيل: عمود واحد = اسم التاجر
export interface PastedSupplierRow {
  line: number;
  name: string;
}

export type SupplierPasteState =
  | { kind: 'ok' }
  | { kind: 'error'; reason: string }
  | { kind: 'dupExisting'; with: string }
  | { kind: 'dupInPaste'; with: string; firstLine: number }
  | { kind: 'similar'; with: string; source: 'existing' | 'paste'; line?: number; reason: string };

export interface ExistingName { name: string; label: string }

// توحيد الاسم: حروف صغيرة، توحيد الألف والياء والتاء المربوطة، شيل التشكيل والعلامات
const canon = (s: string): string =>
  String(s || '')
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

// كلمات عامة ما بتفرّقش بين تاجر وتاجر
const STOP = new Set(
  ['مكتب', 'شركه', 'مؤسسه', 'تجاره', 'للتجاره', 'معرض', 'محل', 'مخزن', 'موبايل', 'موبايلات', 'جروب', 'و',
    'office', 'co', 'company', 'trading', 'store', 'shop', 'mobile', 'mobiles', 'group', 'ltd', 'el', 'al', 'and']
    .map(canon),
);

const tokensOf = (name: string): string[] => canon(name).split(' ').filter(Boolean);
const stripAl = (t: string) => (t.length > 3 && t.startsWith('ال') ? t.slice(2) : t);
const coreTokens = (name: string): string[] => {
  const all = tokensOf(name).map(stripAl);
  const core = all.filter(t => !STOP.has(t) && t.length >= 2);
  return core.length ? core : all;
};

export const exactKey = (name: string): string => tokensOf(name).join('');

// يرجّع سبب التشابه (نص) أو null
export const similarityReason = (a: string, b: string): string | null => {
  const A = coreTokens(a), B = coreTokens(b);
  if (!A.length || !B.length) return null;
  const sa = new Set(A), sb = new Set(B);
  if (A.join('') === B.join('')) return 'نفس الاسم بعد تجاهل الكلمات العامة (مكتب/شركة/ال...)';
  const [small, big] = sa.size <= sb.size ? [sa, sb] : [sb, sa];
  const common = [...small].filter(t => big.has(t));
  if (common.length === small.size && [...small].join('').length >= 3) return `اسم جوه التاني (كلمة مشتركة: ${common.join(' ')})`;
  const union = new Set([...sa, ...sb]).size;
  if (common.length / union >= 0.5) return `كلمات مشتركة: ${common.join(' ')}`;
  return null;
};

const HEADER = /^(اسم التاجر|اسم المورد|اسم المورد \/ التاجر|الموردون والتجار|التاجر|التجار|المورد|الاسم|اسم|name|supplier|trader)\s*\*?$/i;

export const parseSupplierPaste = (text: string): PastedSupplierRow[] => {
  const rows: PastedSupplierRow[] = [];
  text.split(/\r?\n/).forEach((ln, i) => {
    const cell = (ln.includes('\t') ? ln.split('\t')[0] : ln).trim().replace(/^['"`]+|['"`]+$/g, '').trim().replace(/\s+/g, ' ');
    if (!cell) return;
    if (rows.length === 0 && HEADER.test(cell)) return;
    rows.push({ line: i + 1, name: cell });
  });
  return rows;
};

export const classifySupplierRows = (
  rows: PastedSupplierRow[],
  existing: ExistingName[],
): (PastedSupplierRow & { state: SupplierPasteState })[] => {
  const existingKeys = existing.map(e => ({ ...e, key: exactKey(e.name) }));
  const prior: { name: string; key: string; line: number }[] = [];
  return rows.map(r => {
    const push = (state: SupplierPasteState) => ({ ...r, state });
    const key = exactKey(r.name);
    if (key.length < 2 || /^\d+$/.test(key)) return push({ kind: 'error', reason: 'الاسم قصير أو مش مفهوم' });
    const ex = existingKeys.find(e => e.key === key);
    if (ex) { prior.push({ name: r.name, key, line: r.line }); return push({ kind: 'dupExisting', with: `${ex.name} (${ex.label})` }); }
    const pr = prior.find(p => p.key === key);
    if (pr) return push({ kind: 'dupInPaste', with: pr.name, firstLine: pr.line });
    prior.push({ name: r.name, key, line: r.line });
    for (const e of existing) {
      const why = similarityReason(r.name, e.name);
      if (why) return push({ kind: 'similar', with: `${e.name} (${e.label})`, source: 'existing', reason: why });
    }
    for (const p of prior) {
      if (p.line === r.line) continue;
      const why = similarityReason(r.name, p.name);
      if (why) return push({ kind: 'similar', with: p.name, source: 'paste', line: p.line, reason: why });
    }
    return push({ kind: 'ok' });
  });
};
