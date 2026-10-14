import { Icon } from '../components/Icon';
import { isNative } from '../lib/native';
import { REPO_URL } from './Settings';

// Startseite vor der Anmeldung: zeigt, was TeamTime kann, und führt zur Anmeldung oder Demo.

const FEATURES: { icon: string; title: string; text: string }[] = [
  { icon: 'calendar', title: 'Termine & Zusagen', text: 'Trainings als Serie für die ganze Saison, Zusagen mit einem Tipp, Text für die WhatsApp-Gruppe.' },
  { icon: 'trophy', title: 'Spieltag', text: 'Startelf und Bank, Ergebnis, Tore, Vorlagen und Karten – direkt am Spielfeldrand.' },
  { icon: 'users', title: 'Kader', text: 'Spielerprofile mit Nummer, Position und Kontakt. Einsätze und Tore von fussball.de übernehmen.' },
  { icon: 'chart', title: 'Auswertung', text: 'Anwesenheitsquoten, Raster über alle Termine, Torschützen und Bilanz – auch als PDF.' },
  { icon: 'wallet', title: 'Mannschaftskasse', text: 'Strafenkatalog, Mitgliedsbeiträge pro Monat und Kassenbuch mit Kassenbericht.' },
  { icon: 'shirt', title: 'Trikotwäsche', text: 'Wer ist dran? TeamTime verteilt reihum und merkt sich, was noch nicht zurück ist.' },
  { icon: 'bell', title: 'Erinnerungen & Kalender', text: 'Hinweis vor jedem Termin mit Stand der Zusagen, alle Termine im Handy-Kalender.' },
  { icon: 'cloud', title: 'PC und Handy synchron', text: 'Gleiche Daten überall, funktioniert auch ohne Netz am Sportplatz.' },
];

export function Welcome({ onLogin, onRegister, onDemo }: { onLogin: () => void; onRegister: () => void; onDemo: () => void }) {
  const native = isNative();
  return (
    <div className="welcome">
      <header className="welcome-top">
        <img src="./wappen.png" alt="" />
        <span className="grow">
          <strong>TeamTime</strong>
          <small>SV Grün-Weiß Annaburg</small>
        </span>
        <button className="btn btn-sm" onClick={onLogin}>
          Anmelden
        </button>
      </header>

      <section className="welcome-hero">
        <div className="welcome-copy">
          <img className="welcome-crest" src="./wappen.png" alt="Wappen SV Grün-Weiß Annaburg" />
          <h1>Die Mannschaft im Griff – am PC und auf dem Handy.</h1>
          <p className="welcome-lead">Termine, Zusagen, Kader, Mannschaftskasse und Trikotwäsche an einem Ort. Gemacht für Trainer und Betreuer.</p>
          <div className="welcome-cta">
            <button className="btn btn-primary" onClick={onLogin}>
              Anmelden
            </button>
            <button className="btn btn-soft" onClick={onRegister}>
              Konto anlegen
            </button>
          </div>
          <button className="link" onClick={onDemo}>
            Erst einmal mit der Beispielmannschaft ausprobieren
          </button>
        </div>

        <div className="welcome-preview" aria-hidden="true">
          <div className="card nx">
            <div className="nx-head">
              <span className="chip-soft">Punktspiel · Samstag</span>
            </div>
            <div className="nx-vs">
              <div className="nx-side">
                <span className="nx-crest">
                  <img src="./wappen.png" alt="" />
                </span>
                <span className="nx-team">Annaburg</span>
              </div>
              <span className="nx-time">
                14:00<small>Treffpunkt 13:00</small>
              </span>
              <div className="nx-side">
                <span className="nx-crest nx-opp">GO</span>
                <span className="nx-team">Gegner</span>
              </div>
            </div>
            <div className="abar">
              <div className="abar-track">
                <i className="st-present" style={{ flexGrow: 12 }} />
                <i className="st-unsure" style={{ flexGrow: 2 }} />
                <i className="st-absent" style={{ flexGrow: 1 }} />
                <i className="st-none" style={{ flexGrow: 3 }} />
              </div>
              <div className="abar-legend">
                <span>
                  <i className="dot st-present" />
                  <b>12</b> dabei
                </span>
                <span>
                  <i className="dot st-unsure" />
                  <b>2</b> unsicher
                </span>
                <span>
                  <i className="dot st-absent" />
                  <b>1</b> fehlt
                </span>
                <span>
                  <i className="dot st-none" />
                  <b>3</b> offen
                </span>
              </div>
            </div>
          </div>
          <div className="welcome-mini">
            <div className="stat">
              <div className="stat-value">4–2–2</div>
              <div className="stat-label">Bilanz</div>
            </div>
            <div className="stat">
              <div className="stat-value">76 %</div>
              <div className="stat-label">Beteiligung</div>
            </div>
          </div>
        </div>
      </section>

      <section className="welcome-features">
        <h2>Was TeamTime kann</h2>
        <div className="feature-grid">
          {FEATURES.map((f) => (
            <div className="feature" key={f.title}>
              <span className="feature-ico">
                <Icon name={f.icon} size={20} />
              </span>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="welcome-foot">
        <button className="btn btn-primary" onClick={onLogin}>
          Jetzt anmelden
        </button>
        {!native && (
          <a className="link" href={`${REPO_URL}/releases/latest`} target="_blank" rel="noreferrer">
            Android-App herunterladen
          </a>
        )}
      </footer>
    </div>
  );
}
