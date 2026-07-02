import type { PointerEvent as ReactPointerEvent } from "react";

/**
 * Démarre un drag horizontal au clic (utilisé par la timeline pour déplacer/redimensionner
 * scènes, clips d'éléments et pistes audio). Factorise le boilerplate d'écouteurs
 * pointermove/pointerup sur `window`, dupliqué 3× avant cette extraction.
 */
export function startHorizontalDrag(e: ReactPointerEvent, onMove: (deltaPx: number) => void) {
  e.stopPropagation();
  e.preventDefault();
  const startX = e.clientX;

  function move(ev: PointerEvent) {
    onMove(ev.clientX - startX);
  }
  function up() {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
  }
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}
