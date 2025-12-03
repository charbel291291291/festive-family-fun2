// Minimal audio helpers: chime with WebAudio and TTS speak the number
declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
let _muted = false;
let _audioCtx: AudioContext | null = null;
// load initial value from localStorage if available
try {
  if (typeof window !== "undefined") {
    const v = localStorage.getItem("tombola:audio_muted");
    _muted = v === "1";
  }
} catch (err) {
  // ignore (privacy mode / no access)
}

export function isMuted() {
  return _muted;
}
export function setMuted(v: boolean) {
  _muted = Boolean(v);
  try {
    if (typeof window !== "undefined") {
      localStorage.setItem("tombola:audio_muted", _muted ? "1" : "0");
    }
  } catch (err) {
    /* ignore */
  }
}

export async function resumeAudioContext() {
  try {
    if (typeof window === "undefined") return;
    const win = window as Window & { webkitAudioContext?: typeof AudioContext };
    const AudioCtor = win.AudioContext ?? win.webkitAudioContext;
    if (!AudioCtor) return;
    if (!_audioCtx && AudioCtor) {
      try {
        _audioCtx = new AudioCtor();
      } catch (e) {
        console.debug("AudioContext instantiation failed", e);
        _audioCtx = null;
      }
    }
    if (_audioCtx && _audioCtx.state === "suspended") {
      await _audioCtx.resume();
    }
  } catch (err) {
    // ignore: audio errors should not block UI
    console.debug("resumeAudioContext error", err);
  }
}

export function playChime() {
  try {
    if (_muted) return;
    if (typeof window === "undefined") return;
    const win = window as Window & { webkitAudioContext?: typeof AudioContext };
    const AudioCtor = win.AudioContext ?? win.webkitAudioContext;
    if (!AudioCtor) return;
    if (!_audioCtx) {
      try {
        _audioCtx = new AudioCtor();
      } catch (e) {
        console.debug("AudioContext instantiation failed", e);
        _audioCtx = null;
      }
    }
    const ctx = _audioCtx;
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 880; // A5-ish
    g.gain.value = 0.0001;
    o.connect(g);
    g.connect(ctx.destination);
    const now = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.22, now + 0.01);
    o.start(now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    o.stop(now + 0.36);
    // Keep context open for future sounds; browsers may suspend until user gesture
    if (ctx.state === "suspended") {
      try {
        ctx.resume();
      } catch (e) {
        console.debug("AudioContext resume error", e);
      }
    }
  } catch (err) {
    // don't throw in UI for audio issues
    console.error("playChime error", err);
  }
}

function chooseVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window))
    return null;
  const voices = speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;
  // Prefer common female voices or english ones
  const femaleCandidates = voices.filter((v) =>
    /female|zira|samantha|alloy|amy|kendra|google uk english/i.test(v.name)
  );
  if (femaleCandidates.length) return femaleCandidates[0];
  const enCandidate = voices.find((v) => v.lang?.startsWith("en"));
  return enCandidate ?? voices[0];
}

export function speakNumber(n: number | string) {
  try {
    if (_muted) return;
    if (typeof window === "undefined") return;
    // Speech
    if (!("speechSynthesis" in window)) return;
    const text = String(n);
    const speak = () => {
      const utt = new SpeechSynthesisUtterance(text);
      utt.lang = "en-US";
      utt.rate = 0.95;
      utt.pitch = 1.05;
      const voice = chooseVoice();
      if (voice) utt.voice = voice;
      // we speak after a short delay so the chime plays first
      try {
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utt);
      } catch (err) {
        console.error("speakNumber error", err);
      }
    };

    // Some browsers load voices async; ensure they are loaded - then speak
    if (speechSynthesis.getVoices().length === 0) {
      const onVoicesChanged = () => {
        try {
          speak();
        } catch (e) {
          console.debug("speech speak error", e);
        }
        speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged);
      };
      speechSynthesis.addEventListener("voiceschanged", onVoicesChanged);
    } else {
      speak();
    }
  } catch (err) {
    console.error("speakNumber global error", err);
  }
}

// removed earlier default export intentionally; the main default export is exported at the end

export function playShuffle() {
  // no-op: sound effects intentionally disabled in this build
}

export function playDrop() {
  // no-op: sound effects intentionally disabled in this build
}

export default { speakNumber, playShuffle, playDrop };
