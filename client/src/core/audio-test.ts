import { routeToSpeaker } from './devices.ts';

export class LevelMeter {
  private context = new AudioContext();
  private analyser = this.context.createAnalyser();
  private samples: Float32Array<ArrayBuffer>;

  constructor(track: MediaStreamTrack) {
    this.analyser.fftSize = 1024;
    this.samples = new Float32Array(this.analyser.fftSize);
    this.context.createMediaStreamSource(new MediaStream([track])).connect(this.analyser);
  }

  /** Loudness from 0 (silence, -60 dBFS or below) to 1 (full scale). */
  level() {
    this.analyser.getFloatTimeDomainData(this.samples);
    let sum = 0;
    for (const sample of this.samples) sum += sample * sample;
    const db = 20 * Math.log10(Math.sqrt(sum / this.samples.length) || 1e-8);
    return Math.min(1, Math.max(0, (db + 60) / 60));
  }

  close() {
    this.context.close();
  }
}

export async function recordClip(track: MediaStreamTrack, durationMs = 3000): Promise<Blob> {
  const recorder = new MediaRecorder(new MediaStream([track]));
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => chunks.push(event.data);
  const stopped = new Promise((done) => (recorder.onstop = done));
  recorder.start();
  setTimeout(() => recorder.stop(), durationMs);
  await stopped;
  return new Blob(chunks, { type: recorder.mimeType });
}

export async function playClip(clip: Blob, speakerId?: string) {
  const url = URL.createObjectURL(clip);
  const audio = new Audio(url);
  try {
    await routeToSpeaker(audio, speakerId);
    await audio.play();
    await new Promise((done) => (audio.onended = done));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function playTestTone(speakerId?: string, durationMs = 1000) {
  const context = new AudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const destination = context.createMediaStreamDestination();
  oscillator.frequency.value = 440;
  gain.gain.setValueAtTime(0.2, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + durationMs / 1000);
  oscillator.connect(gain).connect(destination);

  const audio = new Audio();
  audio.srcObject = destination.stream;
  try {
    await routeToSpeaker(audio, speakerId);
    oscillator.start();
    await audio.play();
    await new Promise((done) => setTimeout(done, durationMs));
  } finally {
    oscillator.stop();
    audio.srcObject = null;
    await context.close();
  }
}
