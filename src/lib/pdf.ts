// PDF-Berichte (Anwesenheit, Kasse, Kader) – erzeugt direkt im Gerät mit pdf-lib.
import type { PDFFont, PDFImage, PDFPage } from 'pdf-lib';
import { formatDateNumeric, todayISO } from './dates';
import { isNative } from './native';

export interface Column {
  title: string;
  width: number; // Anteil, wird auf die Seitenbreite verteilt
  align?: 'left' | 'right' | 'center';
}
export interface Section {
  heading?: string;
  note?: string;
  columns?: Column[];
  rows?: (string | number)[][];
  /** Zeilen, die fett und mit Linie darüber gesetzt werden (z. B. Summen) */
  footer?: (string | number)[];
  /** Schlüssel-Wert-Paare statt Tabelle */
  pairs?: [string, string][];
}

const GREEN = { r: 10 / 255, g: 107 / 255, b: 58 / 255 };
const INK = { r: 0.09, g: 0.13, b: 0.11 };
const MUTED = { r: 0.36, g: 0.42, b: 0.38 };
const LINE = { r: 0.85, g: 0.89, b: 0.86 };
const ZEBRA = { r: 0.965, g: 0.975, b: 0.965 };

// Standardschrift kennt nur westeuropäische Zeichen – alles andere ersetzen.
const ALLOWED = /[\x20-\x7E -ÿ€„“”‚‘’–—…•]/;
const clean = (s: string | number) =>
  String(s ?? '')
    .split('')
    .map((ch) => (ALLOWED.test(ch) ? ch : ch === '\n' ? ' ' : ''))
    .join('');

async function loadLogo(pdf: import('pdf-lib').PDFDocument, src: string): Promise<PDFImage | null> {
  try {
    const bytes = await fetch(src).then((r) => r.arrayBuffer());
    const head = new Uint8Array(bytes.slice(0, 4));
    return head[0] === 0x89 ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
  } catch {
    return null;
  }
}

export async function buildReport(opts: { title: string; subtitle?: string; clubName: string; logo?: string; sections: Section[] }): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  pdf.setTitle(opts.title);
  pdf.setCreator('TeamTime');
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await loadLogo(pdf, opts.logo || './wappen.png');
  const c = (x: { r: number; g: number; b: number }) => rgb(x.r, x.g, x.b);

  const W = 595.28;
  const H = 841.89;
  const M = 42;
  const inner = W - 2 * M;
  let page: PDFPage;
  let y = 0;
  let pageNo = 0;

  const text = (p: PDFPage, s: string | number, x: number, yy: number, size: number, f: PDFFont = font, color = INK) =>
    p.drawText(clean(s), { x, y: yy, size, font: f, color: c(color) });

  const fit = (s: string, f: PDFFont, size: number, max: number) => {
    let t = clean(s);
    if (f.widthOfTextAtSize(t, size) <= max) return t;
    while (t.length > 1 && f.widthOfTextAtSize(t + '…', size) > max) t = t.slice(0, -1);
    return t + '…';
  };

  const newPage = () => {
    page = pdf.addPage([W, H]);
    pageNo++;
    // Kopf
    let x = M;
    if (logo) {
      const h = 38;
      const w = (logo.width / logo.height) * h;
      page.drawImage(logo, { x: M, y: H - M - h + 4, width: w, height: h });
      x = M + w + 12;
    }
    text(page, opts.clubName, x, H - M - 6, 9, font, MUTED);
    text(page, opts.title, x, H - M - 26, 17, bold, INK);
    if (opts.subtitle) text(page, opts.subtitle, x, H - M - 40, 9, font, MUTED);
    page.drawRectangle({ x: M, y: H - M - 52, width: inner, height: 2, color: c(GREEN) });
    // Fuß
    text(page, `Erstellt am ${formatDateNumeric(todayISO())} mit TeamTime`, M, M - 16, 8, font, MUTED);
    const pn = `Seite ${pageNo}`;
    text(page, pn, W - M - font.widthOfTextAtSize(pn, 8), M - 16, 8, font, MUTED);
    y = H - M - 74;
  };
  newPage();
  const ensure = (need: number) => {
    if (y - need < M + 10) newPage();
  };

  for (const sec of opts.sections) {
    if (sec.heading) {
      ensure(40);
      text(page!, sec.heading, M, y, 12, bold, INK);
      y -= 8;
    }
    if (sec.note) {
      y -= 8;
      text(page!, sec.note, M, y, 8.5, font, MUTED);
      y -= 4;
    }
    if (sec.pairs) {
      y -= 6;
      for (const [k, v] of sec.pairs) {
        ensure(18);
        y -= 14;
        text(page!, k, M, y, 9.5, font, MUTED);
        text(page!, v, M + 170, y, 9.5, bold, INK);
      }
      y -= 26;
    }
    if (sec.columns && sec.rows) {
      const total = sec.columns.reduce((s, col) => s + col.width, 0);
      const widths = sec.columns.map((col) => (col.width / total) * inner);
      const rowH = 17;
      const drawHeader = () => {
        y -= 6;
        page!.drawRectangle({ x: M, y: y - rowH + 4, width: inner, height: rowH, color: c(ZEBRA) });
        let x = M;
        sec.columns!.forEach((col, i) => {
          drawCell(col.title, x, widths[i], col.align, bold, 8, MUTED);
          x += widths[i];
        });
        y -= rowH;
      };
      const drawCell = (v: string | number, x: number, w: number, align: Column['align'], f: PDFFont, size: number, color = INK) => {
        const s = fit(String(v ?? ''), f, size, w - 8);
        const tw = f.widthOfTextAtSize(s, size);
        const tx = align === 'right' ? x + w - 4 - tw : align === 'center' ? x + (w - tw) / 2 : x + 4;
        text(page!, s, tx, y - rowH + 9, size, f, color);
      };
      ensure(rowH * 3);
      drawHeader();
      sec.rows.forEach((r, ri) => {
        if (y - rowH < M + 10) {
          newPage();
          drawHeader();
        }
        if (ri % 2 === 1) page!.drawRectangle({ x: M, y: y - rowH + 4, width: inner, height: rowH, color: c(ZEBRA) });
        let x = M;
        r.forEach((v, i) => {
          drawCell(v, x, widths[i], sec.columns![i].align, font, 9);
          x += widths[i];
        });
        y -= rowH;
      });
      if (sec.footer) {
        ensure(rowH + 4);
        page!.drawRectangle({ x: M, y: y + 3, width: inner, height: 0.8, color: c(INK) });
        let x = M;
        sec.footer.forEach((v, i) => {
          drawCell(v, x, widths[i], sec.columns![i].align, bold, 9);
          x += widths[i];
        });
        y -= rowH;
      }
      page!.drawRectangle({ x: M, y: y + 3, width: inner, height: 0.5, color: c(LINE) });
      y -= 18;
    }
  }
  return pdf.save();
}

/** PDF speichern: Browser → Download, App → Teilen-Menü */
export async function savePDF(filename: string, bytes: Uint8Array) {
  if (isNative()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const res = await Filesystem.writeFile({ path: filename, data: btoa(bin), directory: Directory.Cache });
    await Share.share({ title: filename, url: res.uri, dialogTitle: 'PDF speichern oder senden' });
    return;
  }
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
