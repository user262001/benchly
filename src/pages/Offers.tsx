import { useEffect, useState, useCallback } from 'react';
import { FileSpreadsheet, Upload, Eye, FileUp, CheckCircle2, AlertCircle, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { formatDA } from '@/lib/format';
import { parseOfferFile } from '@/lib/xlsxParser';
import { logAction } from '@/lib/analysis';
import type { Offer, OfferItem, Project, Supplier } from '@/lib/types';
import { PageHeader, Card, Spinner, EmptyState, Button, Modal, Field, inputCls, ErrorBanner, Badge } from '@/components/ui';

export function Offers() {
  const { canWrite } = useAuth();
  const [loading, setLoading] = useState(true);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [analysedOfferIds, setAnalysedOfferIds] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<Offer | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [o, p, s, a] = await Promise.all([
      supabase.from('offers').select('*').eq('is_reference', false).order('created_at', { ascending: false }),
      supabase.from('projects').select('*').order('title'),
      supabase.from('suppliers').select('*').order('name'),
      supabase.from('analyses').select('offer_id'),
    ]);
    if (o.error) setError(o.error.message);
    if (a.error) setError(a.error.message);
    setOffers(o.data ?? []);
    setProjects(p.data ?? []);
    setSuppliers(s.data ?? []);
    setAnalysedOfferIds(
      new Set((a.data ?? []).map((row: { offer_id: string | null }) => row.offer_id).filter((id): id is string => Boolean(id)))
    );
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const deleteOffer = async (offer: Offer) => {
    if (!window.confirm(`Supprimer définitivement l'offre « ${offer.file_name ?? offer.id.slice(0, 8)} » et ses items ?`)) return;
    setError(null);
    const { error: analysisError } = await supabase.from('analyses').delete().eq('offer_id', offer.id);
    if (analysisError) { setError(analysisError.message); return; }
    const { error: offerError } = await supabase.from('offers').delete().eq('id', offer.id);
    if (offerError) setError(offerError.message);
    else {
      await logAction('DELETE_OFFER', 'offers', { file: offer.file_name ?? offer.id });
      void load();
    }
  };

  if (detail) return <OfferDetail offer={detail} onBack={() => setDetail(null)} />;

  return (
    <div>
      <PageHeader
        title="Consulter toutes les offres"
        subtitle="Répertoire global des offres fournisseurs importées."
        action={canWrite ? <Button onClick={() => setUploadOpen(true)}><Upload className="w-4 h-4" /> Importer une offre</Button> : undefined}
      />
      {error && <ErrorBanner message={error} />}
      {loading ? <Spinner /> : offers.length === 0 ? (
        <Card><EmptyState icon={<FileSpreadsheet className="w-5 h-5" />} title="Aucune offre importée" hint="Importez un fichier Excel lié à un projet et un fournisseur." /></Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-200">
              <th className="px-4 py-3">Fichier</th><th className="px-4 py-3">Projet</th><th className="px-4 py-3">Fournisseur</th>
              <th className="px-4 py-3">Date</th><th className="px-4 py-3 text-center">Nombre d'items</th><th className="px-4 py-3 text-center">Analyse</th><th className="px-4 py-3 text-right">Montant total de l'offre</th><th className="px-4 py-3"></th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {offers.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-900">{o.file_name ?? o.id.slice(0, 8)}</td>
                  <td className="px-4 py-3 text-slate-600">{projects.find((p) => p.id === o.project_id)?.title ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{suppliers.find((s) => s.id === o.supplier_id)?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{o.offer_date ?? '—'}</td>
                  <td className="px-4 py-3 text-center"><Badge>{o.item_count}</Badge></td>
                  <td className="px-4 py-3 text-center"><Badge tone={analysedOfferIds.has(o.id) ? 'green' : 'slate'}>{analysedOfferIds.has(o.id) ? 'Analysée' : 'Non analysée'}</Badge></td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatDA(o.total_amount)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Button variant="ghost" className="!px-2 !py-1 !text-xs" onClick={() => setDetail(o)}><Eye className="w-3.5 h-3.5" /> Détail</Button>
                    {canWrite && <Button variant="ghost" className="!px-2 !py-1 !text-xs !text-rose-600 hover:!bg-rose-50" onClick={() => void deleteOffer(o)}><Trash2 className="w-3.5 h-3.5" /> Supprimer</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <OfferFormModal open={uploadOpen} onClose={() => setUploadOpen(false)} initialProjectId={null} onSaved={() => void load()} />
    </div>
  );
}

export function OfferFormModal({ open, onClose, initialProjectId, onSaved }: {
  open: boolean; onClose: () => void; initialProjectId: string | null; onSaved: () => void;
}) {
  const { canWrite } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<{ total: number; count: number } | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const [p, s] = await Promise.all([
        supabase.from('projects').select('*').order('title'),
        supabase.from('suppliers').select('*').order('name'),
      ]);
      setProjects(p.data ?? []);
      setSuppliers(s.data ?? []);
    })();
  }, [open]);

  useEffect(() => { setFile(null); setParsed(null); setError(null); }, [open]);

  const onFile = async (f: File | null) => {
    setFile(f); setParsed(null); setError(null);
    if (!f) return;
    setParsing(true);
    try {
      const res = await parseOfferFile(f);
      setParsed({ total: res.total, count: res.count });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fichier illisible.');
    }
    setParsing(false);
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!file || !parsed) return;
    setSaving(true); setError(null);
    const fd = new FormData(e.currentTarget);
    const projectId = String(fd.get('project_id'));
    const supplierId = String(fd.get('supplier_id'));
    try {
      const parsedFull = await parseOfferFile(file);
      const { data: offer, error: err1 } = await supabase.from('offers').insert({
        project_id: projectId || null,
        supplier_id: supplierId || null,
        is_reference: false,
        offer_date: String(fd.get('offer_date') || '') || null,
        total_amount: parsedFull.total,
        item_count: parsedFull.count,
        file_name: file.name,
      }).select('id').single();
      if (err1) throw err1;
      const { error: err2 } = await supabase.from('offer_items').insert(
        parsedFull.items.map((it) => ({ ...it, offer_id: offer.id })),
      );
      if (err2) throw err2;
      await logAction('IMPORT_OFFER', 'offers', { file: file.name, items: parsedFull.count, project: projectId });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de l'enregistrement.");
    }
    setSaving(false);
  };

  return (
    <Modal open={open} onClose={onClose} title="Importer une offre (fichier Excel)">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Projet lié">
          <select name="project_id" required defaultValue={initialProjectId ?? ''} className={inputCls}>
            <option value="" disabled>Choisir un projet…</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </Field>
        <Field label="Fournisseur">
          <select name="supplier_id" required className={inputCls}>
            <option value="" disabled>Choisir un fournisseur…</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Date de l'offre"><input name="offer_date" type="date" className={inputCls} /></Field>
        <Field label="Fichier Excel (.xlsx, .xls, .csv)">
          <label className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg px-4 py-6 cursor-pointer transition-colors ${file ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-300 hover:border-orange-400 hover:bg-orange-50/40'}`}>
            <FileUp className={`w-6 h-6 ${file ? 'text-emerald-600' : 'text-slate-400'}`} />
            <span className="text-sm text-slate-600">{file ? file.name : 'Cliquez pour sélectionner un fichier'}</span>
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => void onFile(e.target.files?.[0] ?? null)} />
          </label>
        </Field>
        {parsing && <p className="text-sm text-slate-500">Analyse du fichier en cours…</p>}
        {parsed && (
          <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-3 py-2.5 text-sm">
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
            <span>Fichier analysé : <strong>{parsed.count} items</strong> détectés — Montant total : <strong>{formatDA(parsed.total)}</strong></span>
          </div>
        )}
        {error && (
          <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg px-3 py-2.5 text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{error}
          </div>
        )}
        <Button type="submit" disabled={!parsed || saving || !canWrite} className="w-full">
          {saving ? 'Enregistrement…' : 'Importer l\'offre'}
        </Button>
      </form>
    </Modal>
  );
}

function OfferDetail({ offer, onBack }: { offer: Offer; onBack: () => void }) {
  const { canWrite } = useAuth();
  const [items, setItems] = useState<OfferItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offerTotal, setOfferTotal] = useState(offer.total_amount);
  const [itemCount, setItemCount] = useState(offer.item_count);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from('offer_items').select('*').eq('offer_id', offer.id).order('designation');
      setItems(data ?? []);
      setLoading(false);
    })();
  }, [offer.id]);

  const deleteItem = async (item: OfferItem) => {
    if (!window.confirm(`Supprimer l'item « ${item.designation} » de cette offre ?`)) return;
    setError(null);
    const { error: analysisError } = await supabase.from('analysis_items').delete().eq('offer_item_id', item.id);
    if (analysisError) { setError(analysisError.message); return; }
    const { error: itemError } = await supabase.from('offer_items').delete().eq('id', item.id);
    if (itemError) { setError(itemError.message); return; }
    const remaining = items.filter((current) => current.id !== item.id);
    const nextTotal = remaining.reduce((sum, current) => sum + current.total_price, 0);
    const { error: offerError } = await supabase.from('offers').update({ item_count: remaining.length, total_amount: nextTotal }).eq('id', offer.id);
    if (offerError) { setError(offerError.message); return; }
    setItems(remaining);
    setItemCount(remaining.length);
    setOfferTotal(nextTotal);
    await logAction('DELETE_OFFER_ITEM', 'offer_items', { offer: offer.file_name ?? offer.id, designation: item.designation });
  };

  return (
    <div>
      <PageHeader
        title={offer.file_name ?? 'Détail de l’offre'}
        subtitle={`${itemCount} items · Montant total ${formatDA(offerTotal)}`}
        action={<Button variant="secondary" onClick={onBack}>Retour</Button>}
      />
      {loading ? <Spinner /> : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-200">
              <th className="px-4 py-3">Code</th><th className="px-4 py-3">Désignation</th><th className="px-4 py-3">Unité</th>
              <th className="px-4 py-3 text-right">Quantité</th><th className="px-4 py-3 text-right">Prix unitaire</th><th className="px-4 py-3 text-right">Montant total</th>{canWrite && <th className="px-4 py-3"></th>}
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((it) => (
                <tr key={it.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{it.code ?? '—'}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{it.designation}</td>
                  <td className="px-4 py-3 text-slate-600">{it.unit ?? '—'}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{it.quantity}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{formatDA(it.unit_price)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatDA(it.total_price)}</td>
                  {canWrite && <td className="px-4 py-3 text-right"><button type="button" title="Supprimer l'item" aria-label={`Supprimer ${it.designation}`} onClick={() => void deleteItem(it)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"><Trash2 className="w-4 h-4" /></button></td>}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50">
                <td colSpan={canWrite ? 6 : 5} className="px-4 py-3 text-right font-semibold text-slate-700">Montant total de l'offre</td>
                <td className="px-4 py-3 text-right font-bold text-orange-600">{formatDA(offerTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </Card>
      )}
    </div>
  );
}
