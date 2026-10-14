import { FormEvent, useState } from 'react';
import { useStore } from '../data/store';
import { isNative } from '../lib/native';
import { Field } from '../components/ui';

export function Login() {
  const { enterCloud, enterDemo, error: storeError } = useStore();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const native = isNative();

  const run = async (fn: (fb: typeof import('../data/firebase')) => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const fb = await import('../data/firebase');
      await fn(fb);
      enterCloud();
    } catch (e) {
      const fb = await import('../data/firebase').catch(() => null);
      setError(fb ? fb.authErrorText(e) : 'Keine Verbindung zum Anmeldedienst.');
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    run((fb) => (mode === 'login' ? fb.loginEmail(email, pw) : fb.registerEmail(email, pw)));
  };

  const forgot = async () => {
    if (!email) {
      setError('Trag zuerst deine E-Mail-Adresse ein.');
      return;
    }
    setError(null);
    try {
      const fb = await import('../data/firebase');
      await fb.resetPassword(email);
      setInfo('Wir haben dir eine E-Mail zum Zurücksetzen geschickt.');
    } catch (e) {
      const fb = await import('../data/firebase');
      setError(fb.authErrorText(e));
    }
  };

  return (
    <div className="login">
      <section className="login-main">
        <div className="login-box login-card">
          <div className="login-brand">
            <img src="./wappen.png" alt="" />
            <h1>{mode === 'login' ? 'Willkommen zurück' : 'Konto anlegen'}</h1>
            <p className="muted">Termine, Zusagen, Kader und Kasse – für Trainer und Betreuer.</p>
          </div>

          {!native && (
            <>
              <button className="btn btn-block" disabled={busy} onClick={() => run((fb) => fb.loginGoogle())}>
                <GoogleMark /> Mit Google anmelden
              </button>
              <div className="divider">oder mit E-Mail</div>
            </>
          )}
          {native && (
            <p className="small muted">
              Du hast dich bisher mit Google angemeldet? Öffne TeamTime einmal am PC, geh zu <b>Einstellungen → Konto</b> und lege ein Passwort fest. Danach meldest du dich
              hier mit deiner Google-E-Mail und diesem Passwort an.
            </p>
          )}

          <form onSubmit={submit} className="login-box" style={{ gap: 12 }}>
            <Field label="E-Mail">
              <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Passwort">
              <input
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
                minLength={6}
                value={pw}
                onChange={(e) => setPw(e.target.value)}
              />
            </Field>
            {(error || storeError) && <p className="error-text">{error || storeError}</p>}
            {info && <p className="small" style={{ color: 'var(--green-ink)' }}>{info}</p>}
            <button className="btn btn-primary btn-block" disabled={busy} type="submit">
              {busy ? 'Einen Moment …' : mode === 'login' ? 'Anmelden' : 'Konto anlegen'}
            </button>
          </form>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <button className="link" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
              {mode === 'login' ? 'Neues Konto anlegen' : 'Ich habe schon ein Konto'}
            </button>
            {mode === 'login' && (
              <button className="link" onClick={forgot}>
                Passwort vergessen?
              </button>
            )}
          </div>

          <div className="divider">oder erst einmal schauen</div>
          <button className="btn btn-block" onClick={enterDemo}>
            Mit Beispielmannschaft ausprobieren
          </button>
        </div>
      </section>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
