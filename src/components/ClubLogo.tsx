import type React from 'react';
import { useState } from 'react';

const FALLBACK = './wappen.png';

/** Vereinswappen – fällt auf das mitgelieferte Wappen zurück, wenn ein eigenes Bild fehlt oder nicht lädt.
 *  (Die erste TeamTime-Version hat z. B. „/Wappen Sven.png“ gespeichert, das es hier nicht gibt.) */
export function ClubLogo({ src, className, style, alt = '' }: { src?: string; className?: string; style?: React.CSSProperties; alt?: string }) {
  const usable = src && /^(data:|https?:|blob:)/.test(src) ? src : FALLBACK;
  const [failed, setFailed] = useState(false);
  return <img src={failed ? FALLBACK : usable} alt={alt} className={className} style={style} onError={() => setFailed(true)} />;
}
