import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Analysis, AnalysisItemRow, Project, Supplier } from './types';
import { DECISION_LABELS, METHOD_LABELS } from './types';
import { formatDA, formatDate } from './format';

export function exportExcel(analysis: Analysis, project: Project, supplier: Supplier | null, items: AnalysisItemRow[]): void {
  const wb = XLSX.utils.book_new();

  // Synthèse
  const synth: (string | number)[][] = [
    ['Rapport de benchmarking Benchly'],
    ['Projet', project.title],
    ['Région', project.region],
    ['Année de référence', project.target_year],
    ['Budget notifié', project.budget],
    ['Fournisseur', supplier?.name ?? '—'],
    [],
    ['Montant total de l\'offre', analysis.summary?.offreTotal ?? 0],
    ['Montant total estimé', analysis.summary?.estimeTotal ?? 0],
    ['Différence', analysis.summary?.difference ?? 0],
    ['Écart en pourcentage', (analysis.summary?.ecartPct ?? 0)],
    [],
    ['Méthode de calcul', analysis.params.method ? METHOD_LABELS[analysis.params.method] : '—'],
    ['Seuil de similarité', analysis.params.similarityThreshold],
    ['Top-K', analysis.params.topK],
    ['Seuil de négociation', analysis.params.negotiationThreshold],
  ];
  const wsS = XLSX.utils.aoa_to_sheet(synth);
  XLSX.utils.book_append_sheet(wb, wsS, 'Synthèse');

  // Items validés
  const head1 = ['Désignation', 'Unité', 'Prix unitaire', 'Montant offre', 'Prix de référence validé', 'Montant estimé', 'Écart montant', 'Écart %', 'Catégorie', 'Prix minimum', 'Prix maximum', 'Écart min-max'];
  const body1 = items.map((it) => {
    const prices = it.matches.map((m) => m.adjustedUnitPrice);
    const min = prices.length ? Math.min(...prices) : null;
    const max = prices.length ? Math.max(...prices) : null;
    const estime = (it.referencePrice ?? 0) * it.quantity;
    return [
      it.designation, it.unit ?? '—', it.unitPrice, it.totalPrice,
      it.referencePrice ?? '—', estime,
      it.referencePrice === null ? '—' : it.totalPrice - estime,
      it.referencePrice ? ((it.unitPrice - it.referencePrice) / it.referencePrice) * 100 : '—',
      DECISION_LABELS[it.decision],
      min ?? '—', max ?? '—',
      min !== null && max !== null ? max - min : '—',
    ];
  });
  const ws1 = XLSX.utils.aoa_to_sheet([head1, ...body1]);
  XLSX.utils.book_append_sheet(wb, ws1, 'Items validés');

  // Correspondances
  const head2 = ['Désignation', 'Unité', 'Prix unitaire', 'Désignation correspondance', 'Taux de similarité', 'Année', 'Unité', 'Prix unitaire (ajusté)', 'Prix unitaire (brut)', 'Contrat de référence', 'Entrepreneur'];
  const body2: (string | number)[][] = [];
  for (const it of items) {
    for (const m of it.matches) {
      body2.push([it.designation, it.unit ?? '—', it.unitPrice, m.designation, m.similarity * 100, m.year, m.unit ?? '—', m.adjustedUnitPrice, m.rawUnitPrice, m.contractRef, m.entrepreneur]);
    }
  }
  const ws2 = XLSX.utils.aoa_to_sheet([head2, ...body2]);
  XLSX.utils.book_append_sheet(wb, ws2, 'Correspondances sélectionnées');

  XLSX.writeFile(wb, `benchly_rapport_${project.title.replace(/\s+/g, '_')}.xlsx`);
}

export function exportCsv(items: AnalysisItemRow[]): void {
  const head = ['Désignation', 'Unité', 'Quantité', 'Prix unitaire', 'Montant offre', 'Prix de référence validé', 'Catégorie', 'Nombre de correspondances'];
  const rows = items.map((it) => [
    it.designation, it.unit ?? '', it.quantity, it.unitPrice, it.totalPrice,
    it.referencePrice ?? '', DECISION_LABELS[it.decision], it.matches.length,
  ]);
  const csv = [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'benchly_resultats.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export function exportPdf(analysis: Analysis, project: Project, supplier: Supplier | null, items: AnalysisItemRow[]): void {
  const doc = new jsPDF();
  const s = analysis.summary;

  doc.setFillColor(255, 107, 0);
  doc.rect(0, 0, 210, 34, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.text('Benchly', 14, 15);
  doc.setFontSize(11);
  doc.text('Rapport officiel de benchmarking des prix', 14, 24);
  doc.setTextColor(30, 41, 59);

  doc.setFontSize(13);
  doc.text('Synthèse des résultats', 14, 46);
  autoTable(doc, {
    startY: 50,
    styles: { font: 'helvetica', fontSize: 9 },
    headStyles: { fillColor: [255, 107, 0] },
    head: [['Indicateur', 'Valeur']],
    body: [
      ['Projet', project.title],
      ['Fournisseur', supplier?.name ?? '—'],
      ['Région', project.region],
      ['Année de référence cible', String(project.target_year)],
      ['Montant total de l\'offre', formatDA(s?.offreTotal ?? 0)],
      ['Montant total estimé', formatDA(s?.estimeTotal ?? 0)],
      ['Différence', formatDA(s?.difference ?? 0)],
      ['Écart en pourcentage', `${s?.ecartPct?.toFixed(1) ?? '—'} %`],
      ['Budget notifié', formatDA(project.budget)],
      ['Écart Offre vs Budget', `${formatDA(s?.budgetDiffOffre ?? 0)} (${s?.budgetDiffOffrePct?.toFixed(1) ?? '—'} %)`],
      ['Écart Montant Estimé vs Budget', `${formatDA(s?.budgetDiffEstime ?? 0)} (${s?.budgetDiffEstimePct?.toFixed(1) ?? '—'} %)`],
      ['Date du rapport', formatDate(new Date().toISOString())],
    ],
  });

  type DocWithTable = jsPDF & { lastAutoTable?: { finalY: number } };
  const d = doc as DocWithTable;
  let y = (d.lastAutoTable?.finalY ?? 120) + 12;
  doc.setFontSize(13);
  doc.text('Répartition des items', 14, y);
  autoTable(doc, {
    startY: y + 4,
    styles: { font: 'helvetica', fontSize: 9 },
    headStyles: { fillColor: [30, 41, 59] },
    head: [['Catégorie', 'Nombre d\'items', 'Montant total']],
    body: (['a_negocier', 'prix_correct', 'bon_prix'] as const).map((k) => [
      DECISION_LABELS[k],
      String(s?.counts?.[k] ?? 0),
      formatDA(s?.amounts?.[k] ?? 0),
    ]),
  });

  y = (d.lastAutoTable?.finalY ?? 160) + 12;
  doc.setFontSize(13);
  doc.text('Items validés', 14, y);
  autoTable(doc, {
    startY: y + 4,
    styles: { font: 'helvetica', fontSize: 7 },
    headStyles: { fillColor: [255, 107, 0] },
    head: [['Désignation', 'Unité', 'Prix unitaire', 'Prix de référence', 'Écart %', 'Catégorie']],
    body: items.map((it) => [
      it.designation, it.unit ?? '—', formatDA(it.unitPrice),
      it.referencePrice === null ? '—' : formatDA(it.referencePrice),
      it.referencePrice ? `${(((it.unitPrice - it.referencePrice) / it.referencePrice) * 100).toFixed(1)} %` : '—',
      DECISION_LABELS[it.decision],
    ]),
  });

  doc.save(`benchly_rapport_${project.title.replace(/\s+/g, '_')}.pdf`);
}
