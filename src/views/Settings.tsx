import { useEffect, useState } from 'react';
import { useStore } from '../data/store';
import { ClubSettings, TeamData } from '../types';
import { formatDateNumeric, isOver, todayISO } from '../lib/dates';
import { isNative, pickFile, pickImage, saveFile } from '../lib/native';
import { exportCalendar, loadReminderPrefs, ReminderPrefs, requestNotificationPermission, saveReminderPrefs, scheduleReminders } from '../lib/reminders';
import { buildReport, savePDF } from '../lib/pdf';
import { Icon } from '../components/Icon';
import { Field, PageHead, Segmented, useDialog } from '../components/ui';

export const APP_VERSION = '2.2';
export const REPO_URL = 'https://github.com/CyberMolch/TeamTime2';
export const WEB_URL = 'https://cybermolch.github.io/TeamTime2/';

export function SettingsView() {
  const { club, saveClub, backend, data, signOut, replaceAll, events, allPlayers } = useStore();
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

  const rosterPDF = async () => {
    const list = allPlayers.filter((p) => !p.inactive);
    const bytes = await buildReport({
      title: 'Kaderliste',
      subtitle: `${list.length} Spieler · Stand ${formatDateNumeric(todayISO())}`,
      clubName: [club.clubName, club.teamName].filter(Boolean).join(' · '),
      logo: club.clubLogoUrl || undefined,
      sections: [
        {
          columns: [
            { title: 'Nr.', width: 0.8, align: 'right' },
            { title: 'Name', width: 4 },
            { title: 'Position', width: 2 },
            { title: 'Geburtsdatum', width: 2 },
            { title: 'Telefon', width: 2.6 },
          ],
          rows: [...list]
            .sort((a, b) => (Number(a.jerseyNumber) || 999) - (Number(b.jerseyNumber) || 999) || a.name.localeCompare(b.name, 'de'))
            .map((p) => [p.jerseyNumber || '', p.name, p.position || '', p.birthDate ? formatDateNumeric(p.birthDate) : '', p.phone || '']),
        },
      ],
    });
    await savePDF(`kaderliste-${todayISO()}.pdf`, bytes);
    toast('Kaderliste erstellt.');
  };

  return (
    <>
      <PageHead title="Einstellungen" />
      <div className="grid-2">
        <div className="stack">
          <section className="panel panel-pad">
            <h2 className="panel-title">Verein & Mannschaft</h2>
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
              <Field label="Saison beginnt im" hint="Für Auswertung, Bilanz und Beiträge">
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

          <RemindersPanel />

          <section className="panel panel-pad">
            <h2 className="panel-title">Berichte & Daten</h2>
            <div className="settings-rows">
              <div className="settings-row">
                <div className="grow">
                  <b>Kaderliste als PDF</b>
                  <p className="small muted">Nummer, Name, Position, Geburtsdatum, Telefon</p>
                </div>
                <button className="btn btn-sm" onClick={rosterPDF}>
                  <Icon name="file" size={18} /> Erstellen
                </button>
              </div>
              <div className="settings-row">
                <div className="grow">
                  <b>Termine für den Kalender</b>
                  <p className="small muted">Alle anstehenden Termine als Kalenderdatei (.ics)</p>
                </div>
                <button
                  className="btn btn-sm"
                  onClick={async () => {
                    await exportCalendar(
                      events.filter((e) => !isOver(e.date, e.time)),
                      [club.clubName, club.teamName].filter(Boolean).join(' '),
                    );
                    toast('Kalenderdatei erstellt – öffne sie mit deinem Kalender.');
                  }}
                >
                  <Icon name="calendarPlus" size={18} /> Exportieren
                </button>
              </div>
              <div className="settings-row">
                <div className="grow">
                  <b>Sicherung</b>
                  <p className="small muted">Kader, Termine, Kasse und Einstellungen als Datei</p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn btn-sm" onClick={exportBackup}>
                    <Icon name="download" size={18} /> Speichern
                  </button>
                  <button className="btn btn-sm btn-ghost" onClick={importBackup}>
                    <Icon name="upload" size={18} /> Einspielen
                  </button>
                </div>
              </div>
            </div>
            <p className="small muted" style={{ marginTop: 10 }}>
              Anwesenheits- und Kassenberichte findest du direkt unter „Auswertung“ und „Kasse“.
            </p>
          </section>
        </div>

        <div className="stack">
          <AccountPanel />
          <section className="panel panel-pad">
            <h2 className="panel-title">Darstellung</h2>
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
            <h2 className="panel-title">App</h2>
            <dl className="kv">
              <dt>Version</dt>
              <dd>{APP_VERSION}</dd>
              <dt>Daten</dt>
              <dd>{backend?.kind === 'cloud' ? 'In deinem Konto, auf allen Geräten gleich' : 'Beispielmannschaft auf diesem Gerät'}</dd>
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
          {backend?.kind === 'demo' && (
            <button className="btn btn-block" onClick={signOut}>
              <Icon name="logout" /> Demo beenden und anmelden
            </button>
          )}
        </div>
      </div>
    </>
  );
}

function RemindersPanel() {
  const { events, players, backend } = useStore();
  const { toast } = useDialog();
  const [prefs, setPrefs] = useState<ReminderPrefs>(loadReminderPrefs);
  const [count, setCount] = useState<number | null>(null);
  const native = isNative();

  const update = async (patch: Partial<ReminderPrefs>) => {
    let next = { ...prefs, ...patch };
    if (patch.enabled) {
      const ok = await requestNotificationPermission();
      if (!ok) {
        toast('Benachrichtigungen sind für TeamTime nicht erlaubt. Erlaube sie in den Android-Einstellungen.');
        next = { ...next, enabled: false };
      }
    }
    setPrefs(next);
    saveReminderPrefs(next);
    if (backend?.kind === 'cloud') {
      const n = await scheduleReminders(events, players, next).catch(() => 0);
      setCount(n);
    }
  };

  return (
    <section className="panel panel-pad">
      <h2 className="panel-title">Erinnerungen</h2>
      {!native ? (
        <p className="small muted">
          Erinnerungen vor Trainings und Spielen bekommst du in der Android-App aufs Handy. Für deinen Kalender am PC nutze unten „Termine für den Kalender“.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          <label className="switch-row">
            <span className="grow">
              <b>Vor jedem Termin erinnern</b>
              <span className="small muted" style={{ display: 'block' }}>
                Mit Stand der Zusagen, z. B. „12 dabei · 4 ohne Rückmeldung“
              </span>
            </span>
            <input type="checkbox" className="switch" checked={prefs.enabled} onChange={(e) => update({ enabled: e.target.checked })} />
          </label>
          {prefs.enabled && (
            <>
              <Segmented
                label="Zeitpunkt"
                value={prefs.when}
                onChange={(v) => update({ when: v })}
                options={[
                  { value: 'eve', label: 'Am Vorabend' },
                  { value: 'before', label: 'Am selben Tag' },
                ]}
              />
              {prefs.when === 'eve' ? (
                <Field label="Uhrzeit am Vortag">
                  <input type="time" value={prefs.time} onChange={(e) => e.target.value && update({ time: e.target.value })} style={{ maxWidth: 160 }} />
                </Field>
              ) : (
                <Field label="Wie viele Stunden vorher?">
                  <select value={prefs.hoursBefore} onChange={(e) => update({ hoursBefore: Number(e.target.value) })} style={{ maxWidth: 160 }}>
                    {[1, 2, 3, 4, 6].map((h) => (
                      <option key={h} value={h}>
                        {h} Stunde{h > 1 ? 'n' : ''}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <label className="check">
                <input type="checkbox" checked={prefs.onlyOpen} onChange={(e) => update({ onlyOpen: e.target.checked })} />
                Nur erinnern, wenn noch Rückmeldungen fehlen
              </label>
              {count !== null && <p className="small muted">{count ? `${count} Erinnerungen für die nächsten 30 Tage geplant.` : 'Gerade keine Erinnerung geplant.'}</p>}
            </>
          )}
        </div>
      )}
    </section>
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
        <h2 className="panel-title">Konto</h2>
        <p className="small muted">Du schaust dir gerade die Beispielmannschaft an. Mit einem Konto siehst du deine eigenen Daten am PC und auf dem Handy.</p>
      </section>
    );
  }

  // Daten aus dem früheren Modus „ohne Konto“ auf diesem Gerät
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
      <h2 className="panel-title">Konto</h2>
      <p className="small muted" style={{ marginBottom: 12 }}>
        Angemeldet als <b style={{ color: 'var(--ink)' }}>{backend.account}</b>. Änderungen werden automatisch abgeglichen, auch wenn du zwischendurch offline bist.
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
            Auf diesem Gerät liegen noch Daten aus der Zeit ohne Konto ({localData.players.length} Spieler, {localData.events.length} Termine).
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
