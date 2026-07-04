/** Fenêtre (ms) pendant laquelle deux mutations portant la même clé fusionnent en une seule
 * entrée d'historique. Assez long pour couvrir un drag ou une frappe continue, assez court pour
 * que deux gestes distincts restent deux entrées d'annulation. */
export const COALESCE_WINDOW_MS = 1000;

export interface LastMutation {
  key: string | null;
  time: number;
}

/**
 * Décide si une mutation doit fusionner avec la précédente dans l'historique d'annulation,
 * plutôt que de créer une nouvelle entrée. Sans coalescence, un drag d'élément (une mutation
 * par `pointermove`) ou la frappe dans un champ texte crée des dizaines d'entrées : annuler
 * reviendrait alors pixel par pixel / caractère par caractère.
 */
export function shouldCoalesce(last: LastMutation, key: string | undefined, now: number): boolean {
  return key !== undefined && last.key === key && now - last.time < COALESCE_WINDOW_MS;
}
