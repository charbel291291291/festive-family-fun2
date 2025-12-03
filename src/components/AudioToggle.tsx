import React from "react";
import { useAudio } from "@/hooks/useAudio";

export function AudioToggle() {
  const { muted, setMuted } = useAudio();
  return (
    <button
      title={muted ? "Unmute" : "Mute"}
      aria-pressed={muted}
      className="btn-audio-toggle"
      onClick={() => setMuted(!muted)}
    >
      {muted ? "🔇" : "🔊"}
    </button>
  );
}
