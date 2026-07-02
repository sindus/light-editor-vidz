import { convertFileSrc } from "@tauri-apps/api/core";

/** Construit l'URL `asset://` d'un média importé, à partir du chemin relatif stocké sur l'élément. */
export function assetUrl(projectDir: string, relativePath: string): string {
  const sep = projectDir.endsWith("/") ? "" : "/";
  return convertFileSrc(`${projectDir}${sep}${relativePath}`);
}
