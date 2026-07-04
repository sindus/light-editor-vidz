import { load } from "@tauri-apps/plugin-store";

/**
 * Réglages persistants de l'app (store `settings.json`, même fichier que celui lu côté Rust
 * par `commands/stock.rs` pour les recherches d'assets). Chaque moteur d'assets libres a sa
 * clé API, fournie par l'utilisateur ; Openverse fonctionne sans clé et n'apparaît pas ici.
 */

export interface ApiKeys {
  pexels?: string;
  pixabay?: string;
  freesound?: string;
}

const STORE_FILE = "settings.json";
const API_KEYS_KEY = "apiKeys";

export async function loadApiKeys(): Promise<ApiKeys> {
  const store = await load(STORE_FILE);
  return ((await store.get(API_KEYS_KEY)) as ApiKeys | undefined) ?? {};
}

export async function saveApiKeys(keys: ApiKeys): Promise<void> {
  const store = await load(STORE_FILE);
  await store.set(API_KEYS_KEY, keys);
  await store.save();
}
