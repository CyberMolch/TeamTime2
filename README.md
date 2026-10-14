# TeamTime 2 – Mannschaftsverwaltung

Für Trainer und Betreuer: Termine, Zusagen, Kader, Aufstellung, Torschützen, Mannschaftskasse und Trikotwäsche.
Läuft im Browser am PC und als Android-App, beide mit denselben Daten.

- **Web-Version:** https://cybermolch.github.io/TeamTime2/
- **Android-App:** unter [Releases](https://github.com/CyberMolch/TeamTime2/releases/latest) die Datei `TeamTime.apk` aufs Handy laden und öffnen.

## Was die App kann

| Bereich | Funktionen |
| --- | --- |
| Übersicht | Nächster Termin mit Zusagen auf einen Blick, Bilanz, offene Strafen, Geburtstage, wer selten da ist oder verletzt |
| Termine | Training, Punkt- und Testspiele, Treffen; Trainings als wöchentliche Serie; Absagen, Kopieren; Zusagen mit einem Tipp erfassen; Text für die WhatsApp-Gruppe |
| Spiele | Ergebnis, Startelf und Bank, Tore, Vorlagen, Karten, wer die Trikots mitnimmt |
| Kader | Spielerprofile mit Foto, Nummer, Position, Kontakt, Notizen; viele Spieler auf einmal per Namensliste; inaktive Spieler |
| Auswertung | Anwesenheitsquoten (Saison, 8 Wochen, gesamt), Beteiligung pro Termin, Torschützenliste, Bilanz und Form; Export als Tabelle |
| Kasse | Strafenkatalog, Strafen für mehrere Spieler auf einmal, „bezahlt“ mit Rückgängig, offene Beträge in die Gruppe schicken, Kassenbuch |
| Trikots | Reihenfolge zum Waschen, Vorschlag fürs nächste Spiel, wer sie noch nicht zurückgebracht hat |
| Einstellungen | Verein, Wappen, Saisonbeginn, hell/dunkel, Sicherung speichern und einspielen |

Die App funktioniert auch ohne Netz (z. B. am Sportplatz) und gleicht Änderungen ab, sobald wieder Verbindung besteht.

## Daten

Die Daten liegen im selben Firebase-Projekt wie die erste TeamTime-Version aus Google AI Studio
(Sammlungen `players`, `events` und Dokument `settings/{uid}`). Vorhandene Spieler und Termine bleiben also erhalten.
Strafen, Kassenbuch und Trikot-Reihenfolge stehen im Einstellungsdokument – dafür musste an den Firestore-Regeln nichts geändert werden.

### Anmeldung in der Android-App

Google-Anmeldung funktioniert nur im Browser. Wer bisher mit Google angemeldet war:
Web-Version öffnen → **Einstellungen → Konto → Passwort festlegen**. Danach in der App mit derselben E-Mail und diesem Passwort anmelden.
Voraussetzung: In der [Firebase-Konsole](https://console.firebase.google.com/project/gen-lang-client-0858511587/authentication/providers) ist die Anmeldemethode **E-Mail/Passwort** aktiviert.

### Google-Anmeldung auf der Web-Version

In der Firebase-Konsole unter **Authentication → Einstellungen → Autorisierte Domains** einmal `cybermolch.github.io` hinzufügen.

## Bauen

Das macht GitHub bei jeder Änderung automatisch (`.github/workflows/build.yml`): Web-Version → GitHub Pages, Android-App → neues Release.
Damit Pages funktioniert, einmal unter **Settings → Pages → Source** „GitHub Actions“ auswählen.

Lokal:

```bash
npm install
npm run dev              # Entwicklungsserver auf http://localhost:3000
npm run android:prepare  # Android-Projekt erzeugen (braucht Android Studio / SDK)
npx cap open android
```

Die Datei `android-signing/teamtime.keystore` sorgt dafür, dass neue APK-Versionen über die alte installiert werden können.
Sie gehört nur zu dieser selbst verteilten App und ist nicht für den Play Store gedacht.
