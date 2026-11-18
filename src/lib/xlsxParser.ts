import * as XLSX from 'xlsx';
import type { OfferItem } from './types';

export interface ParsedFile {
  items: OfferItem[];
  total: number;
  count: number;
}

const DESIGNATION_KEYS = ['designation', 'désignation', 'designation', 'description', 'libelle', 'libellé', 'article', 'denomination'];
const UNIT_KEYS = ['unit', 'unité', 'unite', 'unite_de_mesure', 'um'];
const QTY_KEYS = ['quantity', 'quantité', 'quantite', 'qte', 'qté', 'quantite'];
const PRICE_KEYS = ['unitprice', 'prixunitaire', 'prix_unitaire', 'prixunit', 'pu'];
const CODE_KEYS = ['code', 'ref', 'référence', 'reference'];

function normKey(k: string): string {
  return k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

function toNum(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const cleaned = v.replace(/[^\d,.-]/g, '').replace(/\s/g, '').replace(',', '.');
    const n = parseFloat(cleaned);
    return Number.isNaN(n) ? 0 : n;
  }
  return 0;
}

// Heuristic parser: reads the first sheet, finds the header row containing a
// designation-like column, then maps known columns. Rows without a price are skipped.
export async function parseOfferFile(file: File): Promise<ParsedFile> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('Le fichier ne contient aucune feuille lisible.');
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: null });

  if (rows.length === 0) throw new Error('La première feuille du fichier est vide.');

  const firstKeys = Object.keys(rows[0]);
  const findCol = (candidates: string[]) => firstKeys.find((k) => candidates.includes(normKey(k)));

  const desigCol = findCol(DESIGNATION_KEYS);
  const priceCol = findCol(PRICE_KEYS);

  if (!desigCol || !priceCol) {
    throw new Error('Colonnes attendues introuvables. Le fichier doit contenir au minimum une colonne "Désignation" et une colonne "Prix unitaire".');
  }
  const unitCol = findCol(UNIT_KEYS);
  const qtyCol = findCol(QTY_KEYS);
  const codeCol = findCol(CODE_KEYS);

  const items: OfferItem[] = [];
  for (const row of rows) {
    const designation = row[desigCol];
    const unitPrice = toNum(row[priceCol]);
    if (!designation || typeof designation !== 'string' || unitPrice <= 0) continue;
    const quantity = qtyCol ? Math.max(1, toNum(row[qtyCol])) : 1;
    items.push({
      id: crypto.randomUUID(),
      offer_id: '',
      code: codeCol ? String(row[codeCol] ?? '') : null,
      designation: designation.trim(),
      unit: unitCol ? String(row[unitCol] ?? '') : null,
      quantity,
      unit_price: unitPrice,
      total_price: Math.round(unitPrice * quantity),
    });
  }
  if (items.length === 0) throw new Error('Aucune ligne d\'item exploitable n\'a été trouvée dans le fichier.');
  return {
    items,
    total: items.reduce((s, i) => s + i.total_price, 0),
    count: items.length,
  };
}
