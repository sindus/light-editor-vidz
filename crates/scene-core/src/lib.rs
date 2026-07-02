//! Modèle de scène et moteur de résolution, partagé entre la preview (wasm) et l'export (natif).
//! Modules ajoutés au fil des phases : model, timeline, project, animate, raster (export), wasm (à venir).

pub mod animate;
pub mod ffmpeg_path;
pub mod model;
pub mod project;
pub mod raster;
pub mod timeline;
