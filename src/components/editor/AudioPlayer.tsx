import { useEffect, useRef } from "react";
import type { AudioTrack } from "../../bindings/AudioTrack";
import { assetUrl } from "../../lib/assetUrl";
import { isAudioTrackActive } from "../../lib/audio";

interface TrackProps {
  track: AudioTrack;
  projectDir: string;
  currentTime: number;
  playing: boolean;
}

function SingleAudio({ track, projectDir, currentTime, playing }: TrackProps) {
  const ref = useRef<HTMLAudioElement>(null);
  const active = isAudioTrackActive(track, currentTime);

  useEffect(() => {
    const audio = ref.current;
    if (!audio) return;
    audio.volume = track.volume;
    if (!active) {
      audio.pause();
      return;
    }
    const targetTime = currentTime - track.start_time + track.audio_offset;
    if (Math.abs(audio.currentTime - targetTime) > 0.25) {
      audio.currentTime = Math.max(0, targetTime);
    }
    if (playing) audio.play().catch(() => {});
    else audio.pause();
  }, [active, currentTime, playing, track.volume, track.start_time, track.audio_offset]);

  return <audio ref={ref} src={assetUrl(projectDir, track.src)} />;
}

/** Lecture des pistes audio, synchronisée sur l'horloge globale de l'éditeur (invisible). */
export default function AudioPlayer({
  tracks,
  projectDir,
  currentTime,
  playing,
}: {
  tracks: AudioTrack[];
  projectDir: string;
  currentTime: number;
  playing: boolean;
}) {
  return (
    <>
      {tracks.map((t) => (
        <SingleAudio key={t.id} track={t} projectDir={projectDir} currentTime={currentTime} playing={playing} />
      ))}
    </>
  );
}
