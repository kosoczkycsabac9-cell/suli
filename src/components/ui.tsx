import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Icon, type IconName } from './Icon';

/* --------------------------------- Toast --------------------------------- */

type ToastKind = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
}

const ToastContext = createContext<(t: Omit<Toast, 'id'>) => void>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { ...t, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), t.kind === 'error' ? 8000 : 5000);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <Icon
              name={t.kind === 'success' ? 'check' : t.kind === 'error' ? 'alert' : 'info'}
              size={16}
              className={t.kind === 'success' ? 'text-success' : ''}
            />
            <div style={{ minWidth: 0 }}>
              <div className="toast-title">{t.title}</div>
              {t.message && <div className="toast-msg">{t.message}</div>}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ------------------------------ Confirm modal ----------------------------- */

export interface ConfirmDetail {
  label: string;
  items: string[];
}

export interface ConfirmOptions {
  title: string;
  message: string;
  /** Pontosan mit fog módosítani az alkalmazás – kötelező a rendszermódosításoknál. */
  details?: ConfirmDetail[];
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  requiresAdmin?: boolean;
  /** Ha igaz, az alkalmazás restore pointot próbál készíteni a művelet előtt. */
  restorePointNotice?: boolean;
}

export function ConfirmDialog({
  options,
  onConfirm,
  onCancel,
  busy,
}: {
  options: ConfirmOptions;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancel, busy]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onCancel()}>
      <div className="modal" role="alertdialog" aria-modal="true" aria-label={options.title}>
        <div className="modal-head">
          <div className={`modal-icon ${options.danger ? 'danger' : 'accent'}`}>
            <Icon name={options.danger ? 'alert' : 'shield'} size={20} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h2>{options.title}</h2>
            <p className="modal-sub">{options.message}</p>
          </div>
        </div>

        <div className="modal-body">
          {options.requiresAdmin && (
            <div className="banner warning" style={{ marginBottom: 12 }}>
              <Icon name="lock" size={16} />
              <span>
                Ehhez a művelethez <strong>rendszergazdai jogosultság</strong> szükséges. A Windows UAC megerősítést
                kérhet.
              </span>
            </div>
          )}

          {options.restorePointNotice && (
            <div className="banner info" style={{ marginBottom: 12 }}>
              <Icon name="history" size={16} />
              <span>
                A módosítás előtt az alkalmazás <strong>biztonsági mentést</strong> készít az érintett értékekről, és –
                ha engedélyezett és van jogosultsága – <strong>rendszer-visszaállítási pontot</strong> is létrehoz.
              </span>
            </div>
          )}

          {options.details?.map((d) => (
            <div className="detail-box" key={d.label}>
              <h4>{d.label}</h4>
              <ul>
                {d.items.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            {options.cancelLabel ?? 'Mégse'}
          </button>
          <button className={`btn ${options.danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} disabled={busy}>
            {busy && <span className="spinner sm" />}
            {options.confirmLabel ?? 'Megerősítés'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Ígéret-alapú confirm hook: `const confirm = useConfirm(); if (await confirm({...})) {...}` */
export function useConfirmDialog() {
  const [state, setState] = useState<{ options: ConfirmOptions; resolve: (v: boolean) => void } | null>(null);
  const [busy, setBusy] = useState(false);

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ options, resolve })),
    [],
  );

  const node = state ? (
    <ConfirmDialog
      options={state.options}
      busy={busy}
      onCancel={() => {
        state.resolve(false);
        setState(null);
      }}
      onConfirm={() => {
        setBusy(false);
        state.resolve(true);
        setState(null);
      }}
    />
  ) : null;

  return { confirm, node, setBusy };
}

/* --------------------------------- Widgets -------------------------------- */

export function Card({
  children,
  className = '',
  interactive,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  return <div className={`card ${interactive ? 'interactive' : ''} ${className}`}>{children}</div>;
}

export function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      className={`switch ${checked ? 'on' : ''}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
      aria-label={label}
    />
  );
}

export function Checkbox({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      className={`checkbox ${checked ? 'checked' : ''}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
    >
      {checked && <Icon name="check" size={12} strokeWidth={3} />}
    </button>
  );
}

export function ProgressBar({ value, tone }: { value: number; tone?: 'warn' | 'danger' | 'success' }) {
  const auto = value > 90 ? 'danger' : value > 75 ? 'warn' : undefined;
  return (
    <div className="progress">
      <div className={`progress-fill ${tone ?? auto ?? ''}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function Ring({ value, size = 132 }: { value: number; size?: number }) {
  const r = size / 2 - 9;
  const c = 2 * Math.PI * r;
  const tone = value >= 80 ? 'var(--success)' : value >= 60 ? 'var(--warning)' : 'var(--danger)';
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.07)" strokeWidth="9" fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={tone}
          strokeWidth="9"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * Math.min(100, Math.max(0, value))) / 100}
          style={{ transition: 'stroke-dashoffset 1s var(--ease)', filter: `drop-shadow(0 0 8px ${tone})` }}
        />
      </svg>
      <div className="ring-center">
        <div>
          <div className="ring-score" style={{ color: tone }}>
            {Math.round(value)}
          </div>
          <div className="ring-max">/ 100</div>
        </div>
      </div>
    </div>
  );
}

export function Sparkline({ data, color }: { data: number[]; color?: string }) {
  const points = useMemo(() => {
    if (data.length < 2) return '';
    const max = Math.max(100, ...data);
    return data
      .map((v, i) => `${(i / (data.length - 1)) * 100},${40 - (v / max) * 36}`)
      .join(' ');
  }, [data]);

  if (!points) return <div className="sparkline" />;
  const stroke = color ?? 'var(--accent)';
  return (
    <svg className="sparkline" viewBox="0 0 100 40" preserveAspectRatio="none">
      <polyline points={`0,40 ${points} 100,40`} fill={stroke} opacity="0.1" stroke="none" />
      <polyline points={points} fill="none" stroke={stroke} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function EmptyState({ icon, title, message }: { icon: IconName; title: string; message?: string }) {
  return (
    <div className="empty">
      <Icon name={icon} size={30} />
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>{title}</div>
        {message && <div className="text-sm" style={{ marginTop: 4 }}>{message}</div>}
      </div>
    </div>
  );
}

export function LoadingRows({ count = 4 }: { count?: number }) {
  return (
    <div className="col gap-8">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 62 }} />
      ))}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="section-title">
      {children}
      {action && <div style={{ marginLeft: 'auto' }}>{action}</div>}
    </div>
  );
}
