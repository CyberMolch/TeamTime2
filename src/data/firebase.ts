// Anbindung an das Firebase-Projekt, das Google AI Studio für die erste TeamTime-Version
// angelegt hat. Gleiche Sammlungen, gleiche Sicherheitsregeln – vorhandene Daten bleiben.
import { initializeApp } from 'firebase/app';
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  linkWithCredential,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  initializeFirestore,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  query,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { ClubSettings, DEFAULT_CLUB, Player, TeamData, TeamEvent } from '../types';
import type { Backend, SyncMeta } from './backend';

const firebaseConfig = {
  projectId: 'gen-lang-client-0858511587',
  appId: '1:1039859855808:web:43adf326acafe551fad825',
  apiKey: 'AIzaSyDdzDijE7Q4SslEeZqEgyrWTC5-k44zPD4',
  authDomain: 'gen-lang-client-0858511587.firebaseapp.com',
  storageBucket: 'gen-lang-client-0858511587.firebasestorage.app',
  messagingSenderId: '1039859855808',
};
const DATABASE_ID = 'ai-studio-teamtime-2a56eed9-2a9f-4a2f-8f6f-c743b5407c8c';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
auth.languageCode = 'de';

let db: ReturnType<typeof initializeFirestore>;
try {
  // Offline-Speicher: Die App funktioniert auch am Platz ohne Netz und gleicht später ab.
  db = initializeFirestore(
    app,
    { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }), ignoreUndefinedProperties: true },
    DATABASE_ID,
  );
} catch {
  db = initializeFirestore(app, { ignoreUndefinedProperties: true }, DATABASE_ID);
}

// ---------- Anmeldung ----------

export const watchUser = (cb: (u: User | null) => void) => onAuthStateChanged(auth, cb);
export const loginGoogle = () => signInWithPopup(auth, new GoogleAuthProvider());
export const loginEmail = (email: string, pw: string) => signInWithEmailAndPassword(auth, email.trim(), pw);
export const registerEmail = (email: string, pw: string) => createUserWithEmailAndPassword(auth, email.trim(), pw);
export const resetPassword = (email: string) => sendPasswordResetEmail(auth, email.trim());
export const logout = () => signOut(auth);

/** Ergänzt ein Google-Konto um ein Passwort, damit man sich in der Android-App per E-Mail anmelden kann. */
export async function addPasswordToAccount(pw: string) {
  const u = auth.currentUser;
  if (!u?.email) throw new Error('Kein Konto mit E-Mail-Adresse angemeldet.');
  await linkWithCredential(u, EmailAuthProvider.credential(u.email, pw));
}

export const hasPasswordLogin = () => !!auth.currentUser?.providerData.some((p) => p.providerId === 'password');

export function authErrorText(e: any): string {
  const code: string = e?.code || '';
  const map: Record<string, string> = {
    'auth/invalid-credential': 'E-Mail oder Passwort stimmt nicht.',
    'auth/wrong-password': 'E-Mail oder Passwort stimmt nicht.',
    'auth/user-not-found': 'Zu dieser E-Mail gibt es kein Konto.',
    'auth/invalid-email': 'Das ist keine gültige E-Mail-Adresse.',
    'auth/email-already-in-use': 'Für diese E-Mail gibt es schon ein Konto. Melde dich an.',
    'auth/weak-password': 'Das Passwort muss mindestens 6 Zeichen haben.',
    'auth/too-many-requests': 'Zu viele Versuche. Warte kurz und probiere es dann erneut.',
    'auth/network-request-failed': 'Keine Internetverbindung.',
    'auth/popup-closed-by-user': 'Anmeldung abgebrochen.',
    'auth/popup-blocked': 'Der Browser hat das Anmeldefenster blockiert. Erlaube Pop-ups für diese Seite.',
    'auth/unauthorized-domain':
      'Diese Adresse ist in Firebase noch nicht freigegeben. Trage sie unter Authentication → Einstellungen → Autorisierte Domains ein.',
    'auth/operation-not-allowed': 'Diese Anmeldeart ist in Firebase nicht aktiviert (Authentication → Anmeldemethode).',
    'auth/provider-already-linked': 'Für dieses Konto ist schon ein Passwort festgelegt.',
    'auth/requires-recent-login': 'Bitte melde dich einmal ab und wieder an, dann klappt es.',
    'auth/credential-already-in-use': 'Diese E-Mail ist bereits mit einem anderen Konto verbunden.',
  };
  return map[code] || e?.message || 'Unbekannter Fehler.';
}

// ---------- Daten ----------

export function createCloudBackend(user: User): Backend {
  const uid = user.uid;
  const clubRef = doc(db, 'settings', uid);
  const withOwner = <T extends object>(x: T) => ({ ...x, userId: uid });
  const strip = <T,>(raw: any): T => {
    const { userId, ...rest } = raw;
    return rest as T;
  };

  return {
    kind: 'cloud',
    account: user.email || user.displayName || 'Konto',

    subscribe(cb, onError) {
      let players: Player[] | null = null;
      let events: TeamEvent[] | null = null;
      let club: ClubSettings | null = null;
      const meta = { p: { fromCache: true, pending: false }, e: { fromCache: true, pending: false }, c: { fromCache: true, pending: false } };
      const emit = () => {
        if (!players || !events || !club) return;
        const m: SyncMeta = {
          fromCache: meta.p.fromCache || meta.e.fromCache || meta.c.fromCache,
          pending: meta.p.pending || meta.e.pending || meta.c.pending,
        };
        cb({ players, events, club }, m);
      };
      const opts = { includeMetadataChanges: true };
      const u1 = onSnapshot(
        query(collection(db, 'players'), where('userId', '==', uid)),
        opts,
        (s) => {
          players = s.docs.map((d) => ({ ...strip<Player>(d.data()), id: d.id }));
          meta.p = { fromCache: s.metadata.fromCache, pending: s.metadata.hasPendingWrites };
          emit();
        },
        onError,
      );
      const u2 = onSnapshot(
        query(collection(db, 'events'), where('userId', '==', uid)),
        opts,
        (s) => {
          events = s.docs.map((d) => {
            const e = strip<TeamEvent>(d.data());
            return { ...e, id: d.id, attendance: e.attendance || {} };
          });
          meta.e = { fromCache: s.metadata.fromCache, pending: s.metadata.hasPendingWrites };
          emit();
        },
        onError,
      );
      const u3 = onSnapshot(
        clubRef,
        opts,
        (s) => {
          const raw = (s.data() || {}) as ClubSettings;
          club = { ...DEFAULT_CLUB, ...raw };
          if (!raw.theme && typeof raw.darkTheme === 'boolean') club.theme = raw.darkTheme ? 'dark' : 'light';
          meta.c = { fromCache: s.metadata.fromCache, pending: s.metadata.hasPendingWrites };
          emit();
        },
        onError,
      );
      return () => {
        u1();
        u2();
        u3();
      };
    },

    // Schreibvorgänge warten nicht auf den Server: Firestore speichert sofort lokal
    // und schickt die Änderung los, sobald Netz da ist.
    async savePlayer(p) {
      setDoc(doc(db, 'players', p.id), withOwner(p)).catch(console.error);
    },
    async deletePlayer(id) {
      const b = writeBatch(db);
      b.delete(doc(db, 'players', id));
      b.commit().catch(console.error);
    },
    async saveEvents(es) {
      for (let i = 0; i < es.length; i += 400) {
        const b = writeBatch(db);
        es.slice(i, i + 400).forEach((e) => b.set(doc(db, 'events', e.id), withOwner(e)));
        b.commit().catch(console.error);
      }
    },
    async deleteEvents(ids) {
      for (let i = 0; i < ids.length; i += 400) {
        const b = writeBatch(db);
        ids.slice(i, i + 400).forEach((id) => b.delete(doc(db, 'events', id)));
        b.commit().catch(console.error);
      }
    },
    async saveClub(patch) {
      setDoc(clubRef, patch, { merge: true }).catch(console.error);
    },
    async replaceAll(d) {
      // Import einer Sicherung: vorhandene Einträge mit gleicher ID werden überschrieben,
      // es wird nichts gelöscht.
      const writes: [string, string, object][] = [
        ...d.players.map((p) => ['players', p.id, withOwner(p)] as [string, string, object]),
        ...d.events.map((e) => ['events', e.id, withOwner(e)] as [string, string, object]),
      ];
      for (let i = 0; i < writes.length; i += 400) {
        const b = writeBatch(db);
        writes.slice(i, i + 400).forEach(([c, id, data]) => b.set(doc(db, c, id), data));
        await b.commit();
      }
      await setDoc(clubRef, d.club, { merge: true });
    },
  };
}
