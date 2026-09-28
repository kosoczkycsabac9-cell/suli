import { useState } from 'react';
import type { ToolDefinition, ToolId } from '@shared/types';
import { api } from '@/lib/api';
import { useAsyncData } from '@/lib/hooks';
import { Card, EmptyState, LoadingRows, SectionTitle, useConfirmDialog, useToast } from '@/components/ui';
import { Icon, type IconName } from '@/components/Icon';

const ICONS: Record<string, IconName> = {
  broom: 'broom',
  activity: 'activity',
  cpu: 'cpu',
  server: 'server',
  list: 'list',
  info: 'info',
  gauge: 'gauge',
  disc: 'disc',
  terminal: 'terminal',
  'terminal-square': 'terminal-square',
  database: 'database',
  refresh: 'refresh',
};

export function Tools() {
  const toast = useToast();
  const { confirm, node } = useConfirmDialog();
  const { data, loading, error } = useAsyncData<ToolDefinition[]>(() => api.tools.list());
  const [busy, setBusy] = useState<ToolId | null>(null);

  async function launch(tool: ToolDefinition) {
    // A Registry Editor esetén külön figyelmeztetünk.
    if (tool.id === 'registry-editor') {
      const proceed = await confirm({
        title: 'Registry Editor megnyitása',
        message: 'A rendszerleíró adatbázis helytelen módosítása a Windows működésképtelenségét okozhatja.',
        danger: true,
        confirmLabel: 'Megnyitás',
        requiresAdmin: true,
        details: [
          {
            label: 'Mielőtt folytatod',
            items: [
              'A WinOptimizer nem módosít semmit – csak megnyitja a natív Windows eszközt.',
              'Módosítás előtt készíts exportot az érintett kulcsról (Fájl → Exportálás).',
            ],
          },
        ],
      });
      if (!proceed) return;
    }

    setBusy(tool.id);
    const result = await api.tools.launch(tool.id);
    setBusy(null);
    if (!result.ok) {
      toast({ kind: 'error', title: `Nem sikerült elindítani: ${tool.name}`, message: result.error });
      return;
    }
    toast({ kind: 'success', title: `${tool.name} elindítva` });
  }

  return (
    <div className="page">
      {node}

      <div className="banner info">
        <Icon name="info" size={16} />
        <span>
          Ezek natív Windows eszközök – az alkalmazás csak elindítja őket, nem helyettesíti és nem módosítja a
          működésüket. Az admin jogot igénylő eszközöknél a Windows UAC megerősítést kér.
        </span>
      </div>

      <SectionTitle>Windows eszközök</SectionTitle>

      {loading ? (
        <LoadingRows count={4} />
      ) : error ? (
        <EmptyState icon="alert" title="Nem sikerült betölteni az eszközlistát" message={error} />
      ) : (
        <div className="grid cols-3">
          {(data ?? []).map((tool) => (
            <Card key={tool.id} interactive>
              <div className="row gap-12" style={{ alignItems: 'flex-start' }}>
                <div className="metric-icon">
                  <Icon name={ICONS[tool.icon] ?? 'tools'} size={17} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="card-title">{tool.name}</div>
                  <div className="card-desc">{tool.description}</div>
                </div>
              </div>
              <div className="row gap-8" style={{ marginTop: 14 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => void launch(tool)} disabled={busy !== null}>
                  {busy === tool.id ? <span className="spinner sm" /> : <Icon name="external" size={13} />} Indítás
                </button>
                {tool.requiresAdmin && (
                  <span className="chip warning">
                    <Icon name="lock" size={10} /> Admin
                  </span>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
