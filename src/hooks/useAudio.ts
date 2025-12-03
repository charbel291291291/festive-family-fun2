import { useEffect, useState } from "react";
import {
  setMuted as setMutedInLib,
  isMuted as isMutedInLib,
  resumeAudioContext,
} from "@/lib/audio";

export function useAudio() {
  const [muted, setMuted] = useState<boolean>(() => {
    try {
      const val = localStorage.getItem("tombola:audio_muted");
      return val === "1";
    } catch (err) {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("tombola:audio_muted", muted ? "1" : "0");
      setMutedInLib(muted);
    } catch (err) {
      console.warn("useAudio: localStorage not available", err);
    }
  }, [muted]);

  useEffect(() => {
    // Try to resume/unlock audio on first user gesture so audio isn't blocked by the browser autoplay policy
    const onUserGesture = () => {
      try {
        if (!muted) resumeAudioContext();
      } catch (err) {
        /* ignore */
      }
      document.removeEventListener("pointerdown", onUserGesture);
      document.removeEventListener("keydown", onUserGesture);
      document.removeEventListener("touchstart", onUserGesture);
    };
    document.addEventListener("pointerdown", onUserGesture, { once: true });
    document.addEventListener("keydown", onUserGesture, { once: true });
    document.addEventListener("touchstart", onUserGesture, { once: true });
    return () => {
      document.removeEventListener("pointerdown", onUserGesture);
      document.removeEventListener("keydown", onUserGesture);
      document.removeEventListener("touchstart", onUserGesture);
    };
  }, [muted]);

  return { muted, setMuted } as const;
}
