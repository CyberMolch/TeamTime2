// Kleine Brücke zwischen Browser und Android-App (Capacitor).
// Die Capacitor-Module werden nur in der App geladen, im Browser nie.

export const isNative = (): boolean => !!(window as any).Capacitor?.isNativePlatform?.();

export const newId = () =>
  (crypto as any).randomUUID ? crypto.randomUUID().replace(/-/g, '').slice(0, 20) : Math.random().toString(36).slice(2, 12) + Date.now().toString(36);

/** Text teilen (WhatsApp & Co.). Fällt auf "In Zwischenablage kopieren" zurück. */
export async function shareText(title: string, text: string): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (isNative()) {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title, text, dialogTitle: title });
      return 'shared';
    }
    if (navigator.share) {
      await navigator.share({ title, text });
      return 'shared';
    }
  } catch (e: any) {
    if (e?.name === 'AbortError' || /cancel/i.test(String(e?.message))) return 'shared';
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}

/** Datei speichern: im Browser als Download, in der App über das Teilen-Menü. */
export async function saveFile(filename: string, content: string, mime: string): Promise<void> {
  if (isNative()) {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const res = await Filesystem.writeFile({ path: filename, data: content, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: filename, url: res.uri, dialogTitle: 'Datei speichern oder senden' });
    return;
  }
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function pickFile(accept: string): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    };
    input.click();
  });
}

/** Bild auswählen und als kleines quadratisches JPEG (data-URL) zurückgeben. */
export function pickImage(size = 256): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d')!;
        const s = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => resolve(null);
      img.src = URL.createObjectURL(file);
    };
    input.click();
  });
}

/** Android-Zurück-Taste: ruft den Handler auf; liefert er false, wird die App minimiert. */
export async function onAndroidBack(handler: () => boolean): Promise<() => void> {
  if (!isNative()) return () => {};
  const { App } = await import('@capacitor/app');
  const sub = await App.addListener('backButton', () => {
    if (!handler()) App.minimizeApp();
  });
  return () => sub.remove();
}

export function toCSV(rows: (string | number)[][]): string {
  const esc = (v: string | number) => {
    const s = String(v ?? '');
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // Semikolon + BOM: öffnet sich in deutschem Excel direkt richtig
  return '﻿' + rows.map((r) => r.map(esc).join(';')).join('\r\n');
}

/** Kurzes Antippen-Feedback (nur in der Android-App). */
export function haptic(kind: 'light' | 'medium' = 'light') {
  if (!isNative()) return;
  import('@capacitor/haptics')
    .then(({ Haptics, ImpactStyle }) => Haptics.impact({ style: kind === 'light' ? ImpactStyle.Light : ImpactStyle.Medium }))
    .catch(() => {});
}

/** Statusleiste an Farbschema anpassen (nur in der Android-App). */
export async function styleStatusBar(dark: boolean, color: string) {
  if (!isNative()) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setOverlaysWebView({ overlay: false });
    await StatusBar.setBackgroundColor({ color });
    // Dunkle Symbole auf hellem Grund, helle Symbole im Dunkelmodus
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
  } catch {
    /* ältere Geräte: egal */
  }
}

export async function hideSplash() {
  if (!isNative()) return;
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide({ fadeOutDuration: 200 });
  } catch {
    /* egal */
  }
}

/** Tastatur: Eingabefeld immer sichtbar halten.
 *  In der Android-App meldet das Keyboard-Plugin die Höhe; im Browser hilft scrollIntoView. */
export function setupKeyboardAvoidance() {
  const root = document.documentElement;
  const reveal = () => {
    const el = document.activeElement as HTMLElement | null;
    if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };
  document.addEventListener('focusin', () => setTimeout(reveal, 300));
  window.visualViewport?.addEventListener('resize', () => setTimeout(reveal, 50));
  if (!isNative()) return;
  import('@capacitor/keyboard')
    .then(({ Keyboard }) => {
      // Android verkleinert das Fenster meist schon selbst (adjustResize). Dann darf die App nicht noch
      // einmal Platz für die Tastatur abziehen – nur den Teil, den das Fenster NICHT geschrumpft ist.
      let base = window.innerHeight;
      let kbh = 0;
      const apply = () => {
        const shrunk = Math.max(0, base - window.innerHeight);
        root.style.setProperty('--kb', `${Math.max(0, kbh - shrunk)}px`);
      };
      Keyboard.addListener('keyboardWillShow', (info) => {
        if (!root.classList.contains('kb-open')) base = window.innerHeight;
        kbh = info.keyboardHeight;
        root.style.setProperty('--kb', '0px');
        root.classList.add('kb-open');
      });
      Keyboard.addListener('keyboardDidShow', () => {
        apply();
        setTimeout(() => {
          apply();
          reveal();
        }, 120);
      });
      Keyboard.addListener('keyboardWillHide', () => {
        kbh = 0;
        root.style.setProperty('--kb', '0px');
        root.classList.remove('kb-open');
      });
    })
    .catch(() => {});
}
