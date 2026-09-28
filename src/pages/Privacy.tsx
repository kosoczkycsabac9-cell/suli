import { useState } from 'react';
import type { PrivacyTweak, PrivacyTweakId } from '@shared/types';
import { api } from '@/lib/api';
import { useAsyncData } from '@/lib/hooks';
import { Card, EmptyState, LoadingRows, SectionTitle, useConfirmDialog, useToast } from '@/components/ui';
import { Icon } from '@/components/Icon';

const APP_PERMISSION_LINKS: { label: string; uri: string; icon: 'eye' | 'globe' | 'shield' | 'activity' }[] = [
  { label: 'Alkalmazásengedélyek áttekintése', uri: 'ms-settings:privacy', icon: 'shield' },
  { label: 'Helyadatok', uri: 'ms-settings:privacy-location', icon: 'globe' },
  { label: 'Kamera', uri: 'ms-settings:privacy-webcam', icon: 'eye' },
  { label: 'Mikrofon', uri: 'ms-settings:privacy-microphone', icon: 'activity' },
  { label: 'Diagnosztika és visszajelzés', uri: 'ms-settings:privacy-feedback', icon: 'shield' },
  { label: 'Háttérben futó alkalmazások', uri: 'ms-settings:privacy-backgroundapps', icon: 'activity' },
];

export function Privacy() {
  const toast = useToast();
  const { confirm, node } = useConfirmDialog();
  const { data, loading, error, reload, setData } = useAsyncData<PrivacyTweak[]>(() => api.privacy.list());
  const [busyId, setBusyId] = useState<PrivacyTweakId | null>(null);

  const tweaks = data ?? [];

  async function apply(tweak: PrivacyTweak) {
    if (tweak.openSettingsUri) {
      const result = await api.privacy.openSettings(tweak.openSettingsUri);
      if (!result.ok) toast({ kind: 'error', title: 'Nem sikerült megnyitni', message: result.error });
      return;
    }

    const proceed = await confirm({
      title: `„${tweak.name}” alkalmazása`,
      message: tweak.description,
      confirmLabel: 'Alkalmazás',
      requiresAdmin: tweak.requiresAdmin,
      restorePointNotice: true,
      details: [
        {
          label: 'Amit pontosan módosítunk',
          items: [tweak.technicalDetails, `Jelenlegi: ${tweak.currentState}`, `Új érték: ${tweak.recommendedState}`],
        },
        {
          label: 'Amit NEM módosítunk',
          items: [
            'Windows Defender / Microsoft Defender beállításai',
            'Tűzfal, SmartScreen, Secure Boot, BitLocker',
            'Windows Update biztonsági frissítései',
          ],
        },
      ],
    });
    if (!proceed) return;

    setBusyId(tweak.id);
    const result = await api.privacy.apply(tweak.id);
    setBusyId(null);
    if (!result.ok) {
      toast({ kind: 'error', title: 'Nem sikerült alkalmazni', message: result.error });
      return;
    }
    setData(tweaks.map((t) => (t.id === tweak.id ? result.data : t)));
    toast({ kind: 'success', title: `${tweak.name} alkalmazva` });
  }

  async function undo(tweak: PrivacyTweak) {
    setBusyId(tweak.id);
    const result = await api.privacy.undo(tweak.id);
    setBusyId(null);
    if (!result.ok) {
      toast({ kind: 'error', title: 'A visszavonás nem sikerült', message: result.error });
      return;
    }
    setData(tweaks.map((t) => (t.id === tweak.id ? result.data : t)));
    toast({ kind: 'success', title: `${tweak.name} visszaállítva` });
  }

  async function openSettings(uri: string) {
    const result = await api.privacy.openSettings(uri);
    if (!result.ok) toast({ kind: 'error', title: 'Nem sikerült megnyitni', message: result.error });
  }

  return (
    <div className="page">
      {node}

      <div className="banner warning">
        <Icon name="shield" size={16} />
        <span>
          Az alkalmazás <strong>soha nem kapcsolja ki</strong> a Windows Defendert, a tűzfalat, a SmartScreent vagy
          bármely más biztonsági funkciót. Csak a telemetriát és a reklámcélú adatgyűjtést érintő, visszavonható
          beállításokat kínáljuk.
        </span>
      </div>

      {loading ? (
        <LoadingRows count={5} />
      ) : error ? (
        <EmptyState icon="alert" title="Nem sikerült beolvasni az adatvédelmi beállításokat" message={error} />
      ) : (
        <>
          <SectionTitle
            action={
              <button className="btn btn-ghost btn-sm" onClick={() => void reload()}>
                <Icon name="refresh" size={14} /> Frissítés
              </button>
            }
          >
            Adatvédelmi beállítások
          </SectionTitle>

          <div className="list">
            {tweaks.map((tweak) => (
              <div className="list-row" key={tweak.id}>
                <div className="metric-icon" style={{ width: 34, height: 34 }}>
                  <Icon name="shield" size={16} />
                </div>
                <div className="list-main">
                  <div className="list-title">
                    {tweak.name}
                    {tweak.applied ? <span className="chip success">Alkalmazva</span> : <span className="chip">Aktív adatgyűjtés</span>}
                    {tweak.requiresAdmin && (
                      <span className="chip warning">
                        <Icon name="lock" size={10} /> Admin
                      </span>
                    )}
                  </div>
                  <div className="list-sub">{tweak.description}</div>
                  <div className="list-sub mono text-xs">{tweak.technicalDetails}</div>
                  <div className="list-sub">
                    Jelenlegi: <strong>{tweak.currentState}</strong> → Ajánlott:{' '}
                    <strong style={{ color: 'var(--accent)' }}>{tweak.recommendedState}</strong>
                  </div>
                </div>
                <div className="list-actions">
                  {busyId === tweak.id ? (
                    <span className="spinner sm" />
                  ) : tweak.openSettingsUri ? (
                    <button className="btn btn-secondary btn-sm" onClick={() => void openSettings(tweak.openSettingsUri!)}>
                      <Icon name="external" size={13} /> Beállítások
                    </button>
                  ) : (
                    <>
                      <button className="btn btn-primary btn-sm" onClick={() => void apply(tweak)} disabled={tweak.applied}>
                        Apply
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={() => void undo(tweak)} disabled={!tweak.applied}>
                        <Icon name="undo" size={13} /> Undo
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="section">
            <SectionTitle>Alkalmazásengedélyek</SectionTitle>
            <div className="banner info">
              <Icon name="info" size={16} />
              <span>
                Az app-, kamera-, mikrofon- és helyengedélyeket szándékosan a natív Windows Beállításokban kezeljük –
                ez a biztonságos és a Microsoft által támogatott módszer.
              </span>
            </div>
            <div className="grid cols-3">
              {APP_PERMISSION_LINKS.map((link) => (
                <Card key={link.uri} interactive>
                  <div className="row gap-12">
                    <div className="metric-icon">
                      <Icon name={link.icon} size={16} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="card-title truncate">{link.label}</div>
                      <div className="text-xs text-dim mono truncate">{link.uri}</div>
                    </div>
                  </div>
                  <button className="btn btn-secondary btn-sm" style={{ marginTop: 12 }} onClick={() => void openSettings(link.uri)}>
                    <Icon name="external" size={13} /> Megnyitás
                  </button>
                </Card>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
