import { useState } from 'react';
import type { Tweak, TweakId } from '@shared/types';
import { api } from '@/lib/api';
import { useAsyncData } from '@/lib/hooks';
import { Card, EmptyState, LoadingRows, SectionTitle, useConfirmDialog, useToast } from '@/components/ui';
import { Icon } from '@/components/Icon';

function TweakCard({
  tweak,
  busy,
  onApply,
  onUndo,
}: {
  tweak: Tweak;
  busy: boolean;
  onApply: () => void;
  onUndo: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Card interactive>
      <div className="card-header" style={{ marginBottom: 10 }}>
        <div className="metric-icon">
          <Icon name={tweak.category === 'storage' ? 'disk' : 'zap'} size={16} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="card-title">{tweak.name}</div>
          <div className="row gap-8 wrap" style={{ marginTop: 5 }}>
            {tweak.applied ? <span className="chip success">Alkalmazva</span> : <span className="chip">Nincs alkalmazva</span>}
            {tweak.risk === 'moderate' && <span className="chip warning">Mérlegelendő</span>}
            {tweak.requiresAdmin && (
              <span className="chip warning">
                <Icon name="lock" size={10} /> Admin
              </span>
            )}
            {tweak.reversible && <span className="chip">Visszavonható</span>}
          </div>
        </div>
      </div>

      <p className="text-sm text-dim" style={{ marginBottom: 12 }}>
        {tweak.description}
      </p>

      <div className="row gap-16 text-sm" style={{ marginBottom: 12 }}>
        <div>
          <div className="text-xs text-dim">Jelenlegi állapot</div>
          <div style={{ fontWeight: 570 }}>{tweak.currentState}</div>
        </div>
        <Icon name="chevron" size={14} className="text-dim" />
        <div>
          <div className="text-xs text-dim">Ajánlott</div>
          <div style={{ fontWeight: 570, color: 'var(--accent)' }}>{tweak.recommendedState}</div>
        </div>
      </div>

      {open && (
        <div className="detail-box">
          <h4>Technikai részletek</h4>
          <p className="mono">{tweak.technicalDetails}</p>
        </div>
      )}

      {tweak.error && (
        <div className="banner danger" style={{ marginTop: 10, marginBottom: 0 }}>
          <Icon name="alert" size={15} /> {tweak.error}
        </div>
      )}

      <div className="row gap-8" style={{ marginTop: 14 }}>
        <button className="btn btn-primary btn-sm" onClick={onApply} disabled={busy || tweak.applied}>
          {busy ? <span className="spinner sm" /> : <Icon name="check" size={14} />} Apply
        </button>
        <button className="btn btn-secondary btn-sm" onClick={onUndo} disabled={busy || !tweak.applied}>
          <Icon name="undo" size={14} /> Undo
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen((v) => !v)}>
          {open ? 'Részletek elrejtése' : 'Részletek'}
        </button>
      </div>
    </Card>
  );
}

export function Performance() {
  const toast = useToast();
  const { confirm, node } = useConfirmDialog();
  const { data, loading, error, reload, setData } = useAsyncData<Tweak[]>(() => api.performance.list());
  const [busyId, setBusyId] = useState<TweakId | null>(null);

  const tweaks = data ?? [];

  async function apply(tweak: Tweak) {
    const proceed = await confirm({
      title: `„${tweak.name}” alkalmazása`,
      message: tweak.description,
      confirmLabel: 'Alkalmazás',
      requiresAdmin: tweak.requiresAdmin,
      restorePointNotice: true,
      danger: tweak.risk === 'moderate',
      details: [
        {
          label: 'Amit pontosan módosítunk',
          items: [tweak.technicalDetails, `Jelenlegi érték: ${tweak.currentState}`, `Új érték: ${tweak.recommendedState}`],
        },
        {
          label: 'Visszavonás',
          items: [
            'Az eredeti érték mentésre kerül, és az „Undo” gombbal vagy a Restore Centerből bármikor visszaállítható.',
          ],
        },
      ],
    });
    if (!proceed) return;

    setBusyId(tweak.id);
    const result = await api.performance.apply(tweak.id);
    setBusyId(null);
    if (!result.ok) {
      toast({ kind: 'error', title: 'Nem sikerült alkalmazni', message: result.error });
      return;
    }
    setData(tweaks.map((t) => (t.id === tweak.id ? result.data : t)));
    toast({ kind: 'success', title: `${tweak.name} alkalmazva`, message: 'A módosítás a Restore Centerből visszavonható.' });
  }

  async function undo(tweak: Tweak) {
    const proceed = await confirm({
      title: `„${tweak.name}” visszavonása`,
      message: 'Az alkalmazás visszaállítja a módosítás előtti eredeti értéket.',
      confirmLabel: 'Visszavonás',
      requiresAdmin: tweak.requiresAdmin,
    });
    if (!proceed) return;

    setBusyId(tweak.id);
    const result = await api.performance.undo(tweak.id);
    setBusyId(null);
    if (!result.ok) {
      toast({ kind: 'error', title: 'A visszavonás nem sikerült', message: result.error });
      return;
    }
    setData(tweaks.map((t) => (t.id === tweak.id ? result.data : t)));
    toast({ kind: 'success', title: `${tweak.name} visszaállítva` });
  }

  const performance = tweaks.filter((t) => t.category === 'performance');
  const storage = tweaks.filter((t) => t.category === 'storage');

  return (
    <div className="page">
      {node}

      <div className="banner info">
        <Icon name="info" size={16} />
        <span>
          Csak dokumentált, a Microsoft által is támogatott beállításokat kínálunk. Nem használunk kétes registry
          „boostereket”, mert azok instabilitást okozhatnak, és <strong>valós gyorsulást nem hoznak</strong>. A várható
          hatás jellemzően szerény, de mérhető – főleg gyengébb gépeken.
        </span>
      </div>

      {loading ? (
        <LoadingRows count={4} />
      ) : error ? (
        <EmptyState icon="alert" title="Nem sikerült beolvasni az optimalizációkat" message={error} />
      ) : (
        <>
          <SectionTitle
            action={
              <button className="btn btn-ghost btn-sm" onClick={() => void reload()}>
                <Icon name="refresh" size={14} /> Frissítés
              </button>
            }
          >
            Teljesítmény
          </SectionTitle>
          <div className="grid cols-2">
            {performance.map((t) => (
              <TweakCard
                key={t.id}
                tweak={t}
                busy={busyId === t.id}
                onApply={() => void apply(t)}
                onUndo={() => void undo(t)}
              />
            ))}
          </div>

          <div className="section">
            <SectionTitle>Tárhely</SectionTitle>
            <div className="grid cols-2">
              {storage.map((t) => (
                <TweakCard
                  key={t.id}
                  tweak={t}
                  busy={busyId === t.id}
                  onApply={() => void apply(t)}
                  onUndo={() => void undo(t)}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
