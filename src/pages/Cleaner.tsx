import { useMemo, useState } from 'react';
import type { CleanerCategoryId, CleanerCategoryResult } from '@shared/types';
import { api } from '@/lib/api';
import { useAsyncData } from '@/lib/hooks';
import { formatBytes } from '@/lib/format';
import { Card, Checkbox, EmptyState, LoadingRows, SectionTitle, useConfirmDialog, useToast } from '@/components/ui';
import { Icon } from '@/components/Icon';

export function Cleaner() {
  const toast = useToast();
  const { confirm, node } = useConfirmDialog();
  const { data, loading, error, reload } = useAsyncData<CleanerCategoryResult[]>(() => api.cleaner.analyze());
  const [selected, setSelected] = useState<Set<CleanerCategoryId>>(new Set());
  const [expanded, setExpanded] = useState<CleanerCategoryId | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const categories = data ?? [];

  // Az ajánlott kategóriák alapból kijelölve (első betöltéskor).
  if (!initialized && categories.length) {
    setSelected(new Set(categories.filter((c) => c.recommended && c.sizeBytes > 0).map((c) => c.id)));
    setInitialized(true);
  }

  const selectedList = useMemo(() => categories.filter((c) => selected.has(c.id)), [categories, selected]);
  const totalSelectedBytes = selectedList.reduce((s, c) => s + c.sizeBytes, 0);
  const totalSelectedFiles = selectedList.reduce((s, c) => s + c.fileCount, 0);
  const totalFound = categories.reduce((s, c) => s + c.sizeBytes, 0);

  function toggle(id: CleanerCategoryId) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function performClean(ids: CleanerCategoryId[], title: string) {
    const targets = categories.filter((c) => ids.includes(c.id));
    if (!targets.length) {
      toast({ kind: 'info', title: 'Nincs kijelölt kategória' });
      return;
    }

    const bytes = targets.reduce((s, c) => s + c.sizeBytes, 0);
    const files = targets.reduce((s, c) => s + c.fileCount, 0);
    const hasRecycleBin = ids.includes('recycle-bin');

    const okToProceed = await confirm({
      title,
      message: `${formatBytes(bytes)} szabadul fel ${files.toLocaleString('hu-HU')} fájl törlésével. A művelet nem vonható vissza.`,
      danger: true,
      confirmLabel: `Törlés (${formatBytes(bytes)})`,
      requiresAdmin: targets.some((c) => c.requiresAdmin),
      details: [
        {
          label: 'Pontosan ezek törlődnek',
          items: targets.map((c) => `${c.name} — ${formatBytes(c.sizeBytes)}, ${c.fileCount} fájl. ${c.whatWillBeDeleted}`),
        },
        {
          label: 'Amit NEM érintünk',
          items: [
            'Rendszerfájlok, System32 tartalma, illesztőprogramok',
            'Böngésző jelszavak, előzmények, könyvjelzők, sütik',
            'Dokumentumok, Asztal, Képek és bármely felhasználói mappa',
            'Telepített programok és biztonsági szoftverek komponensei',
            ...(hasRecycleBin ? [] : ['A Lomtár tartalma (nincs kijelölve)']),
          ],
        },
      ],
    });
    if (!okToProceed) return;

    setCleaning(true);
    const result = await api.cleaner.clean(ids);
    setCleaning(false);

    if (!result.ok) {
      toast({ kind: 'error', title: 'A tisztítás nem sikerült', message: result.error });
      return;
    }
    const failed = result.data.items.filter((i) => !i.success);
    toast({
      kind: failed.length ? 'info' : 'success',
      title: `${formatBytes(result.data.totalFreedBytes)} felszabadítva`,
      message: `${result.data.totalDeletedFiles.toLocaleString('hu-HU')} fájl törölve${
        failed.length ? `, ${failed.length} kategória részben sikertelen (zárolt fájlok)` : ''
      }.`,
    });
    void reload();
  }

  const quickIds = categories.filter((c) => c.recommended && c.sizeBytes > 0).map((c) => c.id);

  return (
    <div className="page">
      {node}

      <div className="banner info">
        <Icon name="shield" size={16} />
        <span>
          A Cleaner kizárólag ismert, biztonságos gyorsítótár- és ideiglenes könyvtárakból töröl, és a
          rendszerkönyvtárakat egy beépített védettlista zárja ki. A használatban lévő, zárolt fájlokat kihagyja.
        </span>
      </div>

      <div className="grid cols-3">
        <Card>
          <div className="metric-label">Összesen található</div>
          <div className="metric-value" style={{ marginTop: 6 }}>
            {formatBytes(totalFound)}
          </div>
          <div className="metric-sub">{categories.reduce((s, c) => s + c.fileCount, 0).toLocaleString('hu-HU')} fájl</div>
        </Card>
        <Card>
          <div className="metric-label">Kijelölve</div>
          <div className="metric-value" style={{ marginTop: 6, color: 'var(--accent)' }}>
            {formatBytes(totalSelectedBytes)}
          </div>
          <div className="metric-sub">{totalSelectedFiles.toLocaleString('hu-HU')} fájl, {selectedList.length} kategória</div>
        </Card>
        <Card>
          <div className="metric-label">Műveletek</div>
          <div className="col gap-8" style={{ marginTop: 10 }}>
            <button
              className="btn btn-primary"
              disabled={cleaning || loading || !quickIds.length}
              onClick={() => performClean(quickIds, 'Quick Clean megerősítése')}
            >
              {cleaning ? <span className="spinner sm" /> : <Icon name="zap" size={15} />} Quick Clean
            </button>
            <button
              className="btn btn-secondary"
              disabled={cleaning || loading || !selected.size}
              onClick={() => performClean([...selected], 'Custom Clean megerősítése')}
            >
              <Icon name="broom" size={15} /> Custom Clean ({selected.size})
            </button>
          </div>
        </Card>
      </div>

      <div className="section">
        <SectionTitle
          action={
            <button className="btn btn-ghost btn-sm" onClick={() => void reload()} disabled={loading || cleaning}>
              <Icon name="refresh" size={14} /> Újraelemzés
            </button>
          }
        >
          Kategóriák
        </SectionTitle>

        {loading ? (
          <LoadingRows count={6} />
        ) : error ? (
          <EmptyState icon="alert" title="Az elemzés nem sikerült" message={error} />
        ) : (
          <div className="list">
            {categories.map((cat) => (
              <div key={cat.id}>
                <div className="list-row">
                  <Checkbox
                    checked={selected.has(cat.id)}
                    onChange={() => toggle(cat.id)}
                    disabled={cat.sizeBytes === 0 || cleaning}
                    label={cat.name}
                  />
                  <div className="list-main">
                    <div className="list-title">
                      {cat.name}
                      {cat.recommended && <span className="chip accent">Ajánlott</span>}
                      {cat.requiresAdmin && (
                        <span className="chip warning">
                          <Icon name="lock" size={10} /> Admin
                        </span>
                      )}
                      {cat.error && <span className="chip danger">Hiba</span>}
                    </div>
                    <div className="list-sub">{cat.description}</div>
                  </div>
                  <div className="list-actions">
                    <div style={{ textAlign: 'right' }}>
                      <div className="tabular" style={{ fontWeight: 620 }}>
                        {formatBytes(cat.sizeBytes)}
                      </div>
                      <div className="text-xs text-dim tabular">{cat.fileCount.toLocaleString('hu-HU')} fájl</div>
                    </div>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setExpanded(expanded === cat.id ? null : cat.id)}
                      aria-expanded={expanded === cat.id}
                    >
                      <Icon name="chevron" size={14} className={expanded === cat.id ? 'rotate' : ''} />
                    </button>
                  </div>
                </div>

                {expanded === cat.id && (
                  <div style={{ padding: '0 16px 16px 50px', background: 'var(--bg-base)' }}>
                    <div className="detail-box" style={{ marginTop: 12 }}>
                      <h4>Mit töröl pontosan</h4>
                      <p>{cat.whatWillBeDeleted}</p>
                    </div>
                    {cat.targets.length > 0 && (
                      <div className="detail-box">
                        <h4>Érintett útvonalak</h4>
                        <ul>
                          {cat.targets.map((t) => (
                            <li key={t.path} className="mono">
                              {t.path} — {formatBytes(t.sizeBytes)} ({t.fileCount.toLocaleString('hu-HU')} fájl)
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {cat.targets.some((t) => t.sampleFiles.length > 0) && (
                      <div className="detail-box">
                        <h4>Példa fájlok</h4>
                        <ul>
                          {cat.targets
                            .flatMap((t) => t.sampleFiles)
                            .slice(0, 8)
                            .map((f) => (
                              <li key={f} className="mono truncate">
                                {f}
                              </li>
                            ))}
                        </ul>
                      </div>
                    )}
                    {cat.error && (
                      <div className="banner danger" style={{ marginTop: 12, marginBottom: 0 }}>
                        <Icon name="alert" size={15} /> {cat.error}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
