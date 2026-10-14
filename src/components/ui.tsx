import { createContext, ReactNode, type TouchEvent, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Icon, IconName } from './Icon';
import { AttendanceStatus, Player, STATUS_LABEL } from '../types';
import { initials } from '../lib/stats';

// ---------- Zurück-Taste (Android) & Escape ----------
// Offene Fenster melden sich hier an; die Zurück-Taste schließt immer das oberste.
const backStack: (() => void)[] = [];
export function handleBack(): boolean {
  const top = backStack[backStack.length - 1];
  if (top) {
    top();
    return true;
  }
  return false;
}
function useBackClose(onClose: () => void, active = true) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    if (!active) return;
    const fn = () => ref.current();
    backStack.push(fn);
    return () => {
      const i = backStack.lastIndexOf(fn);
      if (i >= 0) backStack.splice(i, 1);
    };
  }, [active]);
}
export function registerBack(fn: () => void) {
  backStack.push(fn);
  return () => {
    const i = backStack.lastIndexOf(fn);
    if (i >= 0) backStack.splice(i, 1);
  };
}

// ---------- Sheet: unten auf dem Handy, mittig am PC ----------
export function Sheet({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useBackClose(onClose);
  useEffect(() => {
    document.body.classList.add('no-scroll');
    return () => document.body.classList.remove('no-scroll');
  }, []);

  // Auf dem Handy: am Kopf nach unten wischen schließt das Fenster
  const sheetRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y0: number; dy: number } | null>(null);
  const onTouchStart = (e: TouchEvent) => {
    drag.current = { y0: e.touches[0].clientY, dy: 0 };
  };
  const onTouchMove = (e: TouchEvent) => {
    if (!drag.current || !sheetRef.current) return;
    const dy = Math.max(0, e.touches[0].clientY - drag.current.y0);
    drag.current.dy = dy;
    sheetRef.current.style.transform = `translateY(${dy}px)`;
    sheetRef.current.style.transition = 'none';
  };
  const onTouchEnd = () => {
    const el = sheetRef.current;
    const d = drag.current;
    drag.current = null;
    if (!el || !d) return;
    el.style.transition = 'transform .18s ease-out';
    if (d.dy > 90) {
      el.style.transform = 'translateY(100%)';
      setTimeout(onClose, 160);
    } else el.style.transform = '';
  };

  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={sheetRef} className={'sheet' + (wide ? ' sheet-wide' : '')} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
        <header className="sheet-head" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
          <span className="sheet-grip" aria-hidden="true" />
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Schließen">
            <Icon name="x" />
          </button>
        </header>
        <div className="sheet-body">{children}</div>
        {footer && <footer className="sheet-foot">{footer}</footer>}
      </div>
    </div>
  );
}

// ---------- Hinweise & Rückfragen ----------
interface DialogApi {
  toast: (msg: string, action?: { label: string; run: () => void }) => void;
  confirm: (msg: string, opts?: { title?: string; ok?: string; danger?: boolean }) => Promise<boolean>;
}
const DialogCtx = createContext<DialogApi | null>(null);
export const useDialog = () => useContext(DialogCtx)!;

export function DialogProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ id: number; msg: string; action?: { label: string; run: () => void } } | null>(null);
  const [ask, setAsk] = useState<{ msg: string; title?: string; ok?: string; danger?: boolean; resolve: (v: boolean) => void } | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const api: DialogApi = {
    toast: useCallback((msg, action) => {
      window.clearTimeout(timer.current);
      setToast({ id: Date.now(), msg, action });
      timer.current = window.setTimeout(() => setToast(null), action ? 6000 : 3000);
    }, []),
    confirm: useCallback((msg, opts = {}) => new Promise<boolean>((resolve) => setAsk({ msg, ...opts, resolve })), []),
  };
  const close = (v: boolean) => {
    ask?.resolve(v);
    setAsk(null);
  };

  return (
    <DialogCtx.Provider value={api}>
      {children}
      {toast && (
        <div className="toast" role="status" key={toast.id}>
          <span>{toast.msg}</span>
          {toast.action && (
            <button
              onClick={() => {
                toast.action!.run();
                setToast(null);
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
      {ask && (
        <Sheet
          title={ask.title || 'Bist du sicher?'}
          onClose={() => close(false)}
          footer={
            <>
              <button className="btn" onClick={() => close(false)}>
                Abbrechen
              </button>
              <button className={'btn ' + (ask.danger ? 'btn-danger' : 'btn-primary')} onClick={() => close(true)} autoFocus>
                {ask.ok || 'OK'}
              </button>
            </>
          }
        >
          <p className="confirm-text">{ask.msg}</p>
        </Sheet>
      )}
    </DialogCtx.Provider>
  );
}

// ---------- Kleine Bausteine ----------
export function Avatar({ player, size = 36 }: { player?: Pick<Player, 'name' | 'avatarUrl' | 'jerseyNumber'>; size?: number }) {
  if (!player) return <span className="avatar" style={{ width: size, height: size }} />;
  if (player.avatarUrl) return <img className="avatar" src={player.avatarUrl} alt="" style={{ width: size, height: size }} />;
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.4 }} aria-hidden="true">
      {player.jerseyNumber || initials(player.name)}
    </span>
  );
}

export const STATUS_ORDER: AttendanceStatus[] = ['present', 'unsure', 'excused', 'absent', 'injured', 'none'];

export function StatusDot({ status }: { status: AttendanceStatus }) {
  return <span className={`dot st-${status}`} title={STATUS_LABEL[status]} />;
}

export function Empty({ icon, title, children, action }: { icon: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} size={30} stroke={1.5} />
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Field({ label, children, hint, wide }: { label: string; children: ReactNode; hint?: ReactNode; wide?: boolean }) {
  return (
    <label className={'field' + (wide ? ' field-wide' : '')}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function PageHead({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Meter({ value, tone }: { value: number | null; tone?: 'good' | 'mid' | 'low' }) {
  const v = value ?? 0;
  const t = tone || (v >= 75 ? 'good' : v >= 50 ? 'mid' : 'low');
  return (
    <span className="meter" aria-hidden="true">
      <span className={`meter-fill m-${value === null ? 'none' : t}`} style={{ width: `${v}%` }} />
    </span>
  );
}
