import { invoke } from "@tauri-apps/api/core";
import type { Project } from "../bindings/Project";

export interface NewProjectArgs {
  parent_dir: string;
  name: string;
  width: number;
  height: number;
  fps: number;
}

export interface RecentProject {
  path: string;
  name: string;
  width: number;
  height: number;
  duration: number;
}

/** Crée un nouveau dossier de projet `.lvproj/`, retourne son chemin. */
export function newProject(args: NewProjectArgs): Promise<string> {
  return invoke("new_project", { args });
}

export function loadProject(projectDir: string): Promise<Project> {
  return invoke("load_project", { projectDir });
}

export function saveProject(projectDir: string, project: Project): Promise<void> {
  return invoke("save_project", { projectDir, project });
}

export function listRecentProjects(): Promise<RecentProject[]> {
  return invoke("list_recent_projects");
}

export type AssetKind = "image" | "video" | "audio";

export interface AssetInfo {
  filename: string;
  relative_path: string;
}

/** Copie un fichier choisi par l'utilisateur dans `<project_dir>/assets/<kind>s/`. */
export function importAsset(projectDir: string, kind: AssetKind, sourcePath: string): Promise<string> {
  return invoke("import_asset", { projectDir, kind, sourcePath });
}

export function listAssets(projectDir: string, kind: AssetKind): Promise<AssetInfo[]> {
  return invoke("list_assets", { projectDir, kind });
}

export interface ExportOptions {
  width: number | null;
  height: number | null;
  fps: number | null;
  crf: number | null;
}

/** Exporte le projet en mp4 (bloquant côté Rust — ffmpeg doit être installé). */
export function exportProject(
  projectDir: string,
  project: Project,
  outputPath: string,
  options: ExportOptions,
): Promise<void> {
  return invoke("export_project", { projectDir, project, outputPath, options });
}

export function readTextFile(path: string): Promise<string> {
  return invoke("read_text_file", { path });
}

/** Lit un média en octets bruts (contournement `asset://` pour la vidéo, voir CanvasStage). */
export function readMediaFile(projectDir: string, relativeSrc: string): Promise<ArrayBuffer> {
  return invoke("read_media_file", { projectDir, relativeSrc });
}

/** Résultat normalisé d'une recherche d'assets libres de droit (voir `stock.rs` côté Rust). */
export interface StockResult {
  provider: string;
  kind: string;
  thumbnail_url: string | null;
  download_url: string;
  page_url: string | null;
  author: string | null;
  license: string | null;
  duration: number | null;
  filename: string;
}

export interface StockSearchResponse {
  results: StockResult[];
  /** Erreurs par moteur (clé invalide, réseau…), non bloquantes. */
  errors: string[];
  /** Moteurs interrogés — vide = aucun moteur configuré pour ce type de média. */
  providers: string[];
}

/** Recherche en parallèle sur tous les moteurs d'assets libres configurés. */
export function searchStockAssets(kind: AssetKind, query: string): Promise<StockSearchResponse> {
  return invoke("search_stock_assets", { kind, query });
}

/** Télécharge un asset choisi dans `assets/` du projet, retourne son chemin relatif. */
export function importStockAsset(projectDir: string, kind: AssetKind, url: string, filename: string): Promise<string> {
  return invoke("import_stock_asset", { projectDir, kind, url, filename });
}
