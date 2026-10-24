import { isNative } from './native';

// Hinweis auf neue Versionen.
// Web: index.html ohne Cache laden und das Haupt-Skript vergleichen (GitHub Pages cacht sonst bis zu 10 Min.).
// App (APK): neueste Version bei GitHub nachsehen und mit der installierten vergleichen.

export type Update = { kind: 'web' } | { kind: 'app'; version: string; url: string };

const RELEASES = 'https://api.github.com/repos/CyberMolch/TeamTime2/releases/latest';
const RELEASE_PAGE = 'https://github.com/CyberMolch/TeamTime2/releases/latest';

const currentScript = () => {
  const s = [...document.querySelectorAll<HTMLScriptElement>('script[type=module][src]')].map((x) => x.getAttribute('src') || '');
  return s.find((x) => /assets\/index-[\w-]+\.js/.test(x))?.match(/assets\/index-[\w-]+\.js/)?.[0];
};

const newer = (a: string, b: string) => {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
};

export async function checkForUpdate(): Promise<Update | null> {
  try {
    if (isNative()) {
      const { App } = await import('@capacitor/app');
      const info = await App.getInfo();
      const r = await fetch(RELEASES, { cache: 'no-store' });
      if (!r.ok) return null;
      const rel = await r.json();
      const latest = String(rel.tag_name || '').replace(/^v/, '');
      if (!latest || !newer(latest, info.version)) return null;
      const apk = (rel.assets || []).find((a: any) => /\.apk$/i.test(a.name));
      return { kind: 'app', version: latest, url: apk?.browser_download_url || RELEASE_PAGE };
    }
    const mine = currentScript();
    if (!mine) return null; // lokale Entwicklungsversion
    const r = await fetch(`./index.html?v=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return null;
    const live = (await r.text()).match(/assets\/index-[\w-]+\.js/)?.[0];
    return live && live !== mine ? { kind: 'web' } : null;
  } catch {
    return null;
  }
}
