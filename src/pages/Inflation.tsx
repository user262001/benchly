import { useEffect, useState, useCallback } from 'react';
import { Percent, Save, RotateCcw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import type { InflationRate } from '@/lib/types';
import { PageHeader, Card, Spinner, Button, ErrorBanner, inputCls } from '@/components/ui';

export function Inflation() {
  const { canWrite } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [rows, setRows] = useState<{ year: number; rate: string; id: string | null }[]>([]);
  const [loadedSnapshot, setLoadedSnapshot] = useState<{ year: number; rate: string; id: string | null }[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase.from('inflation_rates').select('*').order('year');
    if (err) setError(err.message);
    const mapped = (data ?? []).map((r: InflationRate) => ({ year: r.year, rate: String(r.rate), id: r.id }));
    setRows(mapped);
    setLoadedSnapshot(mapped);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const update = (year: number, rate: string) => {
    setRows((rs) => rs.map((r) => (r.year === year ? { ...r, rate } : r)));
    setSaved(false);
  };

  const addYear = () => {
    const max = rows.length ? Math.max(...rows.map((r) => r.year)) : 2017;
    setRows((rs) => [...rs, { year: max + 1, rate: '0', id: null }].sort((a, b) => a.year - b.year));
    setSaved(false);
  };

  const save = async () => {
    setSaving(true); setError(null);
    const toUpsert = rows
      .map((r) => ({ year: r.year, rate: Number(r.rate.replace(',', '.')) || 0, id: r.id ?? undefined }))
      .filter((r) => Number.isFinite(r.rate));
    const { error: err } = await supabase.from('inflation_rates').upsert(toUpsert, { onConflict: 'year' });
    if (err) setError(err.message);
    else { setSaved(true); void load(); }
    setSaving(false);
  };

  const reset = () => {
    setRows(loadedSnapshot);
    setSaved(false);
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="Gestion des taux d'inflation"
        action={canWrite ? (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={reset}><RotateCcw className="w-4 h-4" /> Réinitialiser</Button>
            <Button onClick={() => void save()} disabled={saving}><Save className="w-4 h-4" /> {saving ? 'Enregistrement…' : 'Enregistrer'}</Button>
          </div>
        ) : undefined}
      />
      {error && <ErrorBanner message={error} />}
      {saved && <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-4 py-3 text-sm mb-4">Taux d'inflation enregistrés avec succès.</div>}
      <Card className="max-w-2xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-200">
            <th className="px-4 py-3">Année</th>
            <th className="px-4 py-3">Taux d'inflation annuel (%)</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.year}>
                <td className="px-4 py-2.5 font-medium text-slate-900">{r.year}</td>
                <td className="px-4 py-2.5 w-48">
                  <input
                    value={r.rate}
                    onChange={(e) => update(r.year, e.target.value)}
                    disabled={!canWrite}
                    inputMode="decimal"
                    className={`${inputCls} !py-1.5 !px-2.5 text-right`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {canWrite && (
          <div className="px-4 py-3 border-t border-slate-200">
            <Button variant="ghost" onClick={addYear} className="!text-xs"><Percent className="w-3.5 h-3.5" /> Ajouter une année</Button>
          </div>
        )}
      </Card>
    </div>
  );
}
