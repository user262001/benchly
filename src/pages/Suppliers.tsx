import { useEffect, useState, useCallback } from 'react';
import { Truck, Plus, Search, Edit3, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { REGIONS, type Supplier } from '@/lib/types';
import { logAction } from '@/lib/analysis';
import { PageHeader, Card, Spinner, EmptyState, Button, Modal, Field, inputCls, ErrorBanner } from '@/components/ui';

export function Suppliers() {
  const { canWrite } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [offerCounts, setOfferCounts] = useState<Record<string, number>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [edit, setEdit] = useState<Supplier | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data, error: err }, { data: offers, error: offersErr }] = await Promise.all([
      supabase.from('suppliers').select('*').order('name'),
      supabase.from('offers').select('supplier_id').eq('is_reference', false),
    ]);
    if (err) setError(err.message);
    if (offersErr) setError(offersErr.message);
    const counts: Record<string, number> = {};
    for (const offer of offers ?? []) {
      if (offer.supplier_id) counts[offer.supplier_id] = (counts[offer.supplier_id] ?? 0) + 1;
    }
    setOfferCounts(counts);
    setSuppliers(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = suppliers.filter((s) => {
    const q = search.toLowerCase();
    return s.name.toLowerCase().includes(q) || (s.nif ?? '').includes(q) || (s.region ?? '').toLowerCase().includes(q);
  });

  const deleteSupplier = async (supplier: Supplier) => {
    const count = offerCounts[supplier.id] ?? 0;
    if (!window.confirm(`Supprimer « ${supplier.name} » ?${count > 0 ? ` Ses ${count} offre(s) resteront sans fournisseur.` : ''}`)) return;
    setError(null);
    const { error: err } = await supabase.from('suppliers').delete().eq('id', supplier.id);
    if (err) setError(err.message);
    else {
      await logAction('DELETE_SUPPLIER', 'suppliers', { name: supplier.name, offers: count });
      void load();
    }
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const values = {
      name: String(fd.get('name')),
      nif: String(fd.get('nif') || '') || null,
      region: String(fd.get('region')),
      contact_name: String(fd.get('contact_name') || '') || null,
      contact_email: String(fd.get('contact_email') || '') || null,
      contact_phone: String(fd.get('contact_phone') || '') || null,
    };
    const err = edit
      ? (await supabase.from('suppliers').update(values).eq('id', edit.id)).error
      : (await supabase.from('suppliers').insert(values)).error;
    if (err) setError(err.message);
    else { setModalOpen(false); setEdit(null); void load(); }
  };

  return (
    <div>
      <PageHeader
        title="Gestion des fournisseurs"
        subtitle="Créez et consultez le répertoire des fournisseurs."
        action={canWrite ? <Button onClick={() => { setEdit(null); setModalOpen(true); }}><Plus className="w-4 h-4" /> Créer un fournisseur</Button> : undefined}
      />
      {error && <ErrorBanner message={error} />}
      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher par nom, NIF ou région…" className={`${inputCls} pl-9`} />
      </div>
      {loading ? <Spinner /> : filtered.length === 0 ? (
        <Card><EmptyState icon={<Truck className="w-5 h-5" />} title="Aucun fournisseur" hint="Créez votre premier fournisseur avec son nom, son NIF, sa région et ses contacts." /></Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-200">
              <th className="px-4 py-3">Nom</th><th className="px-4 py-3">NIF</th><th className="px-4 py-3">Région</th><th className="px-4 py-3 text-center">Offres</th><th className="px-4 py-3">Contact</th><th className="px-4 py-3">Téléphone</th>
              {canWrite && <th className="px-4 py-3"></th>}
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-900">{s.name}</td>
                  <td className="px-4 py-3 text-slate-600 font-mono text-xs">{s.nif ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{s.region ?? '—'}</td>
                  <td className="px-4 py-3 text-center"><span className="inline-flex min-w-8 justify-center rounded-full bg-orange-50 px-2 py-1 text-xs font-bold text-orange-700">{offerCounts[s.id] ?? 0}</span></td>
                  <td className="px-4 py-3 text-slate-600">{s.contact_name ?? '—'}<br /><span className="text-xs text-slate-400">{s.contact_email ?? ''}</span></td>
                  <td className="px-4 py-3 text-slate-600">{s.contact_phone ?? '—'}</td>
                  {canWrite && (
                    <td className="px-4 py-3 text-right">
                      <button type="button" title="Modifier" aria-label={`Modifier ${s.name}`} onClick={() => { setEdit(s); setModalOpen(true); }} className="p-1.5 rounded-lg text-slate-400 hover:text-orange-600 hover:bg-orange-50 transition-colors"><Edit3 className="w-4 h-4" /></button>
                      <button type="button" title="Supprimer" aria-label={`Supprimer ${s.name}`} onClick={() => void deleteSupplier(s)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setEdit(null); }} title={edit ? 'Modifier le fournisseur' : 'Créer un fournisseur'}>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Nom du fournisseur"><input name="name" required defaultValue={edit?.name} className={inputCls} placeholder="Ex : SARL Électro Distribution" /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="NIF (identifiant fiscal)"><input name="nif" defaultValue={edit?.nif ?? ''} className={inputCls} placeholder="0987654321098" /></Field>
            <Field label="Région">
              <select name="region" required className={inputCls} defaultValue={edit?.region ?? 'Alger'}>
                {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Nom du contact"><input name="contact_name" defaultValue={edit?.contact_name ?? ''} className={inputCls} /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Email"><input name="contact_email" type="email" defaultValue={edit?.contact_email ?? ''} className={inputCls} /></Field>
            <Field label="Téléphone"><input name="contact_phone" defaultValue={edit?.contact_phone ?? ''} className={inputCls} /></Field>
          </div>
          <Button type="submit" className="w-full">{edit ? 'Enregistrer les modifications' : 'Créer le fournisseur'}</Button>
        </form>
      </Modal>
    </div>
  );
}
