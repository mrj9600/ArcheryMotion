let audio: AudioContext | undefined;

/** Short tone. Call once from a user gesture first (e.g. "Start") so audio is allowed. */
export function beep(frequency = 880, durationMs = 120): void {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.3, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + durationMs / 1000);
    osc.connect(gain).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + durationMs / 1000);
  } catch {
    /* no audio available */
  }
}

/** Loud warning: three high tones and a long vibration, meant to be heard from a pocket. */
export function alarm(): void {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
    for (let i = 0; i < 3; i++) {
      const at = audio.currentTime + i * 0.3;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'square'; // carries further than a sine at the same volume
      osc.frequency.value = i % 2 ? 1000 : 1400;
      gain.gain.setValueAtTime(0.9, at);
      gain.gain.setValueAtTime(0.9, at + 0.18);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.22);
      osc.connect(gain).connect(audio.destination);
      osc.start(at);
      osc.stop(at + 0.22);
    }
  } catch {
    /* no audio available */
  }
  try {
    navigator.vibrate?.([400, 150, 400, 150, 400]);
  } catch {
    /* not supported */
  }
}

export function vibrate(ms = 80): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not supported */
  }
}

/** Keeps the screen on while recording. Re-acquired when the page becomes visible again. */
export class ScreenWakeLock {
  private lock?: WakeLockSentinel;
  private wanted = false;

  async enable(): Promise<void> {
    this.wanted = true;
    document.addEventListener('visibilitychange', this.onVisibility);
    await this.acquire();
  }

  async disable(): Promise<void> {
    this.wanted = false;
    document.removeEventListener('visibilitychange', this.onVisibility);
    try {
      await this.lock?.release();
    } catch {
      /* already released */
    }
    this.lock = undefined;
  }

  private async acquire(): Promise<void> {
    try {
      this.lock = await navigator.wakeLock?.request('screen');
    } catch {
      /* not supported or not allowed */
    }
  }

  private readonly onVisibility = () => {
    if (this.wanted && document.visibilityState === 'visible') void this.acquire();
  };
}

/** Several tones in a row, e.g. [1320, 1320] for "done". */
export function beeps(frequencies: number[], durationMs = 120, gapMs = 80): void {
  frequencies.forEach((f, i) => setTimeout(() => beep(f, durationMs), i * (durationMs + gapMs)));
}

/** Reads a short text aloud in Danish, if the device has a voice for it. */
export function speak(text: string): void {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'da-DK';
    const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith('da'));
    if (voice) u.voice = voice;
    synth.speak(u);
  } catch {
    /* no speech available */
  }
}
