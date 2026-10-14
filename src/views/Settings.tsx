import { useEffect, useState } from 'react';
import { useStore } from '../data/store';
import { ClubSettings, TeamData } from '../types';
import { todayISO } from '../lib/dates';
import { isNative, pickFile, pickImage, saveFile } from '../lib/native';
import { Icon } from '../components/Icon';
import { Field, PageHead, Segmented, useDialog } from '../components/ui';

export const APP_VERSION = '2.0.0';
export const REPO_URL = 'https://github.com/CyberMolch/TeamTime2';
export const WEB_URL = 'https://cybermolch.github.io/TeamTime2/';

export function SettingsView() {
  const { club, saveClub, backend, data, signOut, replaceAll } = useStore();
  const { toast, confirm } = useDialog();
  const [form, setForm] = useState<ClubSettings>(club);
  useEffect(() => setForm(club), [club]);
  const set = (patch: Partial<ClubSettings>) => setForm((f) => ({ ...f, ...patch }));
  const commit = (patch: Partial<ClubSettings>) => {
    set(patch);
    saveClub(patch);
  };
  const blurSave = (key: keyof ClubSettings) => () => {
    if (form[key] !== club[key]) saveClub({ [key]: form[key] } as Partial<ClubSettings>);
  };

  const seasonMonth = Number((club.seasonStart || '2000-07-01').split('-')[1]);

  const exportBackup = async () => {
    const payload = { app: 'TeamTime', version: 2, exportedAt: new Date().toISOString(), ...data };
    await saveFile(`teamtime-sicherung-${todayISO()}.json`, JSON.stringify(payload, null, 2), 'application/json');
    toast('Sicherung gespeichert.');
  };

  const importBackup = async () => {
    const text = await pickFile('application/json,.json');
    if (!text) return;
    let parsed: TeamData;
    try {
      const raw = JSON.parse(text);
      if (!Array.isArray(raw.players) || !Array.isArray(raw.events)) throw new Error();
      parsed = { players: raw.players, events: raw.events.map((e: any) => ({ ...e, attendance: e.attendance || {} })), club: raw.club || raw.settings || {} };
    } catch {
      toast('Das ist keine TeamTime-Sicherung.');
      return;
    }
    const ok = await confirm(
      `Die Sicherung enthält ${parsed.players.length} Spieler und ${parsed.events.length} Termine. Einträge mit gleicher Kennung werden überschrieben, alles andere bleibt erhalten.`,
      { title: 'Sicherung einspielen?', ok: 'Einspielen' },
    );
    if (!ok) return;
    await replaceAll(parsed);
    toast('Sicherung eingespielt.');
  };

  return (
    <>
      <PageHead title="Einstellungen" />
      <div className="grid-2">
        <div style={{ display: 'grid', gap: 16 }}>
          <section className="panel panel-pad">
            <h2 style={{ marginBottom: 14 }}>Verein & Mannschaft</h2>
            <div className="form-grid">
              <div className="full" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <img src={form.clubLogoUrl || './wappen.png'} alt="Vereinswappen" style={{ width: 56, height: 64, objectFit: 'contain' }} />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    className="btn btn-sm"
                    onClick={async () => {
                      const img = await pickImage(256);
                      if (img) commit({ clubLogoUrl: img });
                    }}
                  >
                    Wappen ändern
                  </button>
                  {form.clubLogoUrl && (
                    <button className="btn btn-sm btn-ghost" onClick={() => commit({ clubLogoUrl: '' })}>
                      Standard
                    </button>
                  )}
                </div>
              </div>
              <Field label="Verein">
                <input value={form.clubName} onChange={(e) => set({ clubName: e.target.value })} onBlur={blurSave('clubName')} />
              </Field>
              <Field label="Mannschaft">
                <input value={form.teamName || ''} onChange={(e) => set({ teamName: e.target.value })} onBlur={blurSave('teamName')} placeholder="z. B. 1. Herren" />
              </Field>
              <Field label="Dein Name">
                <input value={form.coachName} onChange={(e) => set({ coachName: e.target.value })} onBlur={blurSave('coachName')} />
              </Field>
              <Field label="Heimspielstätte" hint="Wird bei neuen Terminen vorgeschlagen">
                <input value={form.defaultLocation || ''} onChange={(e) => set({ defaultLocation: e.target.value })} onBlur={blurSave('defaultLocation')} />
              </Field>
              <Field label="Saison beginnt im" hint="Für Auswertung und Bilanz">
                <select value={seasonMonth} onChange={(e) => commit({ seasonStart: `2000-${String(e.target.value).padStart(2, '0')}-01` })}>
                  {['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'].map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </section>

          <section className="panel panel-pad">
            <h2 style={{ marginBottom: 14 }}>Darstellung</h2>
            <Segmented
              label="Farbschema"
              value={form.theme || 'system'}
              onChange={(v) => commit({ theme: v })}
              options={[
                { value: 'system', label: 'Wie das Gerät' },
                { value: 'light', label: 'Hell' },
                { value: 'dark', label: 'Dunkel' },
              ]}
            />
          </section>

          <section className="panel panel-pad">
            <h2 style={{ marginBottom: 6 }}>Daten sichern</h2>
            <p className="small muted" style={{ marginBottom: 12 }}>
              Die Sicherung enthält Kader, Termine, Kasse und Einstellungen als Datei. Damit kannst du auch Daten von „Nur auf diesem Gerät“ in ein Konto umziehen.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn" onClick={exportBackup}>
                <Icon name="download" /> Sicherung speichern
              </button>
              <button className="btn" onClick={importBackup}>
                <Icon name="upload" /> Sicherung einspielen
              </button>
            </div>
          </section>
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          <AccountPanel />
          <section className="panel panel-pad">
            <h2 style={{ marginBottom: 10 }}>App</h2>
            <dl className="kv">
              <dt>Version</dt>
              <dd>{APP_VERSION}</dd>
              <dt>Speicherort</dt>
              <dd>{backend?.kind === 'cloud' ? 'Firebase (mit Konto)' : backend?.kind === 'demo' ? 'Demo auf diesem Gerät' : 'Nur auf diesem Gerät'}</dd>
            </dl>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
              {isNative() ? (
                <a className="btn btn-sm" href={WEB_URL} target="_blank" rel="noreferrer">
                  Web-Version am PC
                </a>
              ) : (
                <a className="btn btn-sm" href={`${REPO_URL}/releases/latest`} target="_blank" rel="noreferrer">
                  Android-App herunterladen
                </a>
              )}
            </div>
          </section>
          {backend?.kind !== 'cloud' && (
            <button className="btn btn-block" onClick={signOut}>
              <Icon name="logout" /> {backend?.kind === 'demo' ? 'Demo beenden' : 'Zur Anmeldung'}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

function AccountPanel() {
  const { backend, signOut, replaceAll } = useStore();
  const { toast, confirm } = useDialog();
  const [hasPw, setHasPw] = useState<boolean | null>(null);
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (backend?.kind === 'cloud') import('../data/firebase').then((fb) => setHasPw(fb.hasPasswordLogin()));
  }, [backend]);

  if (backend?.kind !== 'cloud') {
    return (
      <section className="panel panel-pad">
        <h2 style={{ marginBottom: 6 }}>Konto</h2>
        <p className="small muted">
          Du nutzt TeamTime ohne Konto. Die Daten liegen nur auf diesem Gerät. Mit einem Konto siehst du dieselben Daten am PC und auf dem Handy.
        </p>
      </section>
    );
  }

  // Daten, die vorher ohne Konto auf diesem Gerät erfasst wurden
  let localData: TeamData | null = null;
  try {
    const raw = localStorage.getItem('teamtime2:local');
    const d = raw && JSON.parse(raw);
    if (d && (d.players?.length || d.events?.length)) localData = d;
  } catch {
    /* nichts */
  }

  const setPassword = async () => {
    setBusy(true);
    setErr(null);
    const fb = await import('../data/firebase');
    try {
      await fb.addPasswordToAccount(pw);
      setHasPw(true);
      setPw('');
      toast('Passwort gespeichert. Du kannst dich jetzt auch in der Android-App anmelden.');
    } catch (e) {
      setErr(fb.authErrorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel panel-pad">
      <h2 style={{ marginBottom: 6 }}>Konto</h2>
      <p className="small muted" style={{ marginBottom: 12 }}>
        Angemeldet als <b style={{ color: 'var(--ink)' }}>{backend.account}</b>. Alle Änderungen werden automatisch abgeglichen, auch wenn du zwischendurch offline bist.
      </p>
      {hasPw === false && (
        <div className="banner banner-info" style={{ display: 'grid', gap: 10 }}>
          <span>
            <b>Für die Android-App:</b> Dort geht die Google-Anmeldung nicht. Leg hier ein Passwort fest und melde dich in der App mit deiner E-Mail und diesem Passwort an.
          </span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input className="input" type="password" autoComplete="new-password" placeholder="Neues Passwort (mind. 6 Zeichen)" value={pw} onChange={(e) => setPw(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
            <button className="btn btn-primary" disabled={busy || pw.length < 6} onClick={setPassword}>
              <Icon name="key" /> Festlegen
            </button>
          </div>
          {err && <span className="error-text">{err}</span>}
        </div>
      )}
      {localData && (
        <div className="banner banner-info" style={{ display: 'grid', gap: 10 }}>
          <span>
            Auf diesem Gerät liegen noch Daten von früher ohne Konto ({localData.players.length} Spieler, {localData.events.length} Termine).
          </span>
          <button
            className="btn btn-sm"
            style={{ justifySelf: 'start' }}
            onClick={async () => {
              if (await confirm('Die Gerätedaten werden in dein Konto übernommen. Vorhandene Daten im Konto bleiben erhalten.', { title: 'Daten übernehmen?', ok: 'Übernehmen' })) {
                await replaceAll({ ...localData!, club: {} as ClubSettings });
                localStorage.removeItem('teamtime2:local');
                toast('Daten übernommen.');
              }
            }}
          >
            In mein Konto übernehmen
          </button>
        </div>
      )}
      <button className="btn btn-block" onClick={signOut}>
        <Icon name="logout" /> Abmelden
      </button>
    </section>
  );
}
