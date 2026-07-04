import { readMediaFile } from "./commands";
import { mediaMimeType } from "./assetUrl";

/**
 * Cache refcounté d'URLs `blob:` pour les sources vidéo (voir `read_media_file` côté Rust pour
 * le pourquoi du chargement en octets bruts). Sans cache, chaque élément vidéo relit tout le
 * fichier et crée son propre blob : dupliquer ou splitter un clip de 200 Mo doublerait la
 * mémoire et le temps de chargement. L'URL est révoquée quand plus personne ne la référence.
 */

interface Entry {
  promise: Promise<string>;
  url: string | null;
  refs: number;
}

const entries = new Map<string, Entry>();

function releaseEntry(key: string, entry: Entry) {
  entry.refs -= 1;
  if (entry.refs > 0) return;
  if (entry.url) URL.revokeObjectURL(entry.url);
  entry.url = null;
  entries.delete(key);
}

/**
 * Retourne (ou charge) l'URL blob de la source, et une fonction `release` à appeler au
 * démontage. `release` est idempotente ; l'URL est révoquée quand le dernier consommateur
 * la relâche (y compris si le relâchement survient avant la fin du chargement).
 */
export function acquireMediaObjectUrl(
  projectDir: string,
  relativeSrc: string,
): { promise: Promise<string>; release: () => void } {
  const key = `${projectDir}\n${relativeSrc}`;
  let entry = entries.get(key);
  if (!entry) {
    const created: Entry = { promise: Promise.resolve(""), url: null, refs: 0 };
    created.promise = readMediaFile(projectDir, relativeSrc).then((bytes) => {
      const url = URL.createObjectURL(new Blob([bytes], { type: mediaMimeType(relativeSrc) }));
      if (entries.get(key) !== created || created.refs <= 0) {
        // Tous les consommateurs ont disparu pendant le chargement : rien ne référencera
        // cette URL, on la révoque immédiatement.
        URL.revokeObjectURL(url);
      } else {
        created.url = url;
      }
      return url;
    });
    // Un échec ne doit pas rester en cache (le fichier peut apparaître/être réparé ensuite).
    created.promise.catch(() => {
      if (entries.get(key) === created) entries.delete(key);
    });
    entries.set(key, created);
    entry = created;
  }
  entry.refs += 1;
  let released = false;
  const acquired = entry;
  return {
    promise: entry.promise,
    release: () => {
      if (released) return;
      released = true;
      // Ne décrémente que si l'entrée du cache est toujours celle qu'on a acquise (elle peut
      // avoir été remplacée après un échec de chargement).
      if (entries.get(key) === acquired) releaseEntry(key, acquired);
    },
  };
}

/** Nombre d'entrées vivantes — exposé pour les tests uniquement. */
export function cacheSizeForTests(): number {
  return entries.size;
}
