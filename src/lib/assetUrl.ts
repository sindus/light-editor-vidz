import { convertFileSrc } from "@tauri-apps/api/core";

/** Construit l'URL `asset://` d'un média importé, à partir du chemin relatif stocké sur l'élément. */
export function assetUrl(projectDir: string, relativePath: string): string {
  const sep = projectDir.endsWith("/") ? "" : "/";
  return convertFileSrc(`${projectDir}${sep}${relativePath}`);
}

const MEDIA_MIME_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mkv: "video/x-matroska",
  avi: "video/x-msvideo",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  flac: "audio/flac",
};

/** Type MIME déduit de l'extension du fichier, pour construire un `Blob` média côté frontend.
 * Repli sur `video/mp4` : WebKitGTK accepte mieux un type concret (quitte à sniffer le contenu)
 * qu'un `application/octet-stream` qu'il peut refuser net. */
export function mediaMimeType(relativePath: string): string {
  const ext = relativePath.split(".").pop()?.toLowerCase() ?? "";
  return MEDIA_MIME_TYPES[ext] ?? "video/mp4";
}
