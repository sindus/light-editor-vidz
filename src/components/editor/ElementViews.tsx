import { memo, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Element } from "../../bindings/Element";
import { assetUrl } from "../../lib/assetUrl";
import { acquireMediaObjectUrl } from "../../lib/mediaCache";

/**
 * Vues de rendu des éléments du canvas (texte, image, vidéo — les formes ont déjà `ShapeView`).
 * Mémoïsées : pendant la lecture, le parent re-rend à chaque frame mais les props de ces vues
 * ne changent que si l'élément lui-même change (ou, pour la vidéo, le temps local — nécessaire
 * à la synchronisation).
 */

export const TextElementView = memo(function TextElementView({
  element,
  content,
}: {
  element: Extract<Element, { type: "text" }>;
  content: string;
}) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems:
          element.vertical_alignment === "top"
            ? "flex-start"
            : element.vertical_alignment === "bottom"
              ? "flex-end"
              : "center",
        justifyContent:
          element.alignment === "left" ? "flex-start" : element.alignment === "right" ? "flex-end" : "center",
        textAlign: element.alignment,
        color: element.color,
        background: element.background_color ?? undefined,
        fontSize: `${element.font_size ?? 4}cqw`,
        fontFamily: element.font_family ?? undefined,
        fontWeight: element.font_weight === "bold" ? 800 : 500,
        fontStyle: element.font_style ?? undefined,
        letterSpacing: element.letter_spacing ? `${element.letter_spacing}cqw` : undefined,
        lineHeight: element.line_height ?? undefined,
        textShadow: element.text_shadow ? `2px 2px 4px ${element.text_shadow}` : undefined,
        textDecoration:
          element.underline && element.strikethrough
            ? "underline line-through"
            : element.underline
              ? "underline"
              : element.strikethrough
                ? "line-through"
                : undefined,
        padding: "0 4px",
        pointerEvents: "none",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {content}
    </div>
  );
});

export const ImageElementView = memo(function ImageElementView({
  element,
  projectDir,
  panTransform,
}: {
  element: Extract<Element, { type: "image" }>;
  projectDir: string;
  panTransform: string;
}) {
  const objectFit = element.fit_mode === "stretch" ? "fill" : element.fit_mode === "cover" ? "cover" : "contain";
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        borderRadius: element.corner_radius ? `${element.corner_radius}px` : undefined,
        border: element.border_color ? `${element.border_width ?? 2}px solid ${element.border_color}` : undefined,
        boxSizing: "border-box",
      }}
    >
      <img
        src={assetUrl(projectDir, element.src)}
        alt={element.name}
        style={{
          width: "100%",
          height: "100%",
          objectFit,
          background: element.background_color ?? "rgba(255,255,255,0.04)",
          pointerEvents: "none",
          transform: panTransform || undefined,
        }}
      />
    </div>
  );
});

export const VideoElementView = memo(function VideoElementView({
  element,
  projectDir,
  localTime,
  playing,
  panTransform,
}: {
  element: Extract<Element, { type: "video" }>;
  projectDir: string;
  localTime: number;
  playing: boolean;
  panTransform: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const objectFit = element.fit_mode === "stretch" ? "fill" : element.fit_mode === "cover" ? "cover" : "contain";
  const [error, setError] = useState<{ code: number; message: string } | null>(null);
  const [blobSrc, setBlobSrc] = useState<string | null>(null);
  const { t } = useTranslation();

  // Chargement des octets bruts via `read_media_file` plutôt que `asset://` (voir
  // `read_media_file` côté Rust) : WebKitGTK rejette parfois `<video src="asset://...">` avec
  // MEDIA_ERR_SRC_NOT_SUPPORTED alors que le fichier est décodable. L'URL blob est partagée
  // entre tous les éléments pointant sur la même source (voir `mediaCache`).
  useEffect(() => {
    let cancelled = false;
    const { promise, release } = acquireMediaObjectUrl(projectDir, element.src);
    promise
      .then((url) => {
        if (cancelled) return;
        setError(null);
        setBlobSrc(url);
      })
      .catch((e) => {
        if (cancelled) return;
        setError({ code: 0, message: String(e) });
      });
    return () => {
      cancelled = true;
      release();
    };
  }, [projectDir, element.src]);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const speed = element.playback_speed > 0.01 ? element.playback_speed : 1;
    let targetTime = Math.max(0, localTime - element.start_time) * speed + element.video_offset;
    // Une fois la source vidéo épuisée (élément plus long que la source), soit on boucle
    // (retour au point d'entrée `video_offset`), soit on fige sur la dernière frame — sans quoi
    // `currentTime` continue de dépasser `duration`, ce que le navigateur clamp en boucle et
    // qui produit un scintillement visible.
    const sourceDuration = video.duration;
    if (sourceDuration > 0 && targetTime >= sourceDuration) {
      const loopSpan = sourceDuration - element.video_offset;
      targetTime =
        element.loop_video && loopSpan > 0.05
          ? ((targetTime - element.video_offset) % loopSpan) + element.video_offset
          : sourceDuration - 0.05;
      targetTime = Math.max(0, targetTime);
    }
    if (Math.abs(video.currentTime - targetTime) > 0.25) {
      video.currentTime = targetTime;
    }
    video.playbackRate = speed;
    // Le volume et le muet de l'élément s'appliquent aussi en preview (même comportement
    // qu'à l'export).
    video.volume = Math.min(1, Math.max(0, element.volume));
    video.muted = element.muted || element.volume <= 0.001;
    const atFrozenEnd = !element.loop_video && sourceDuration > 0 && video.currentTime >= sourceDuration - 0.1;
    if (playing && !atFrozenEnd) {
      video.play().catch(() => {
        // Politique d'autoplay : si la lecture avec son est refusée, rejouer en muet plutôt
        // que de figer la vidéo.
        video.muted = true;
        video.play().catch(() => {});
      });
    } else {
      video.pause();
    }
  }, [
    localTime,
    playing,
    // `blobSrc` : re-synchronise la frame affichée dès que la source est chargée (sinon une
    // vidéo en pause resterait sur sa première frame jusqu'au prochain déplacement du playhead).
    blobSrc,
    element.start_time,
    element.video_offset,
    element.playback_speed,
    element.loop_video,
    element.volume,
    element.muted,
  ]);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        borderRadius: element.corner_radius ? `${element.corner_radius}px` : undefined,
        border: element.border_color ? `${element.border_width ?? 2}px solid ${element.border_color}` : undefined,
        boxSizing: "border-box",
      }}
    >
      <video
        ref={ref}
        src={blobSrc ?? undefined}
        style={{
          width: "100%",
          height: "100%",
          objectFit,
          background: element.background_color ?? "rgba(255,255,255,0.04)",
          pointerEvents: "none",
          transform: panTransform || undefined,
        }}
        preload="auto"
        loop={element.loop_video}
        onError={(e) => {
          const mediaError = e.currentTarget.error;
          setError({ code: mediaError?.code ?? 0, message: mediaError?.message ?? "" });
        }}
        onLoadedData={() => setError(null)}
      />
      {error && (
        <div className="video-error-overlay">
          <span>{t("canvas.videoDecodeError")}</span>
          <span className="video-error-detail">
            {t("canvas.videoDecodeErrorCode", { code: error.code })}
            {error.message ? ` — ${error.message}` : ""}
          </span>
        </div>
      )}
    </div>
  );
});
