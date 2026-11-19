export type Difficulty = 'easy' | 'normal' | 'hard';
export type JudgmentType = 'PERFECT' | 'GREAT' | 'GOOD' | 'MISS';
export type GradeType = 'S' | 'A' | 'B' | 'C' | 'D';

export interface GameSettings {
  masterVol: number;
  musicVol: number;
  sfxVol: number;
  muted: boolean;
  noteSpeed: number;
  audioOffsetMs: number;
  vfxEnabled: boolean;
  keyBindings: [string, string, string, string];
}

export interface BestScoreEntry {
  score: number;
  accuracy: number;
  grade: GradeType;
  maxCombo: number;
}

export interface SaveState {
  settings: GameSettings;
  bestScores: Record<string, BestScoreEntry>;
  songsCompleted: number;
}

export type NeonAccent = '#00f0ff' | '#a855f7' | '#ff2a85' | '#fbbf24';

export interface PlayerProfile {
  email: string;
  username: string;
  accent: NeonAccent;
  passcodeHash: string;
  createdAt: string;
  save: SaveState;
}

export interface AccountStore {
  activeEmail: string | null;
  profiles: Record<string, PlayerProfile>;
}

export const NEON_ACCENTS: { color: NeonAccent; label: string }[] = [
  { color: '#00f0ff', label: 'Cyan' },
  { color: '#a855f7', label: 'Violet' },
  { color: '#ff2a85', label: 'Magenta' },
  { color: '#fbbf24', label: 'Gold' },
];

export interface ScoreStep {
  kick: boolean;
  snare: boolean;
  hat: boolean;
  hatOpen: boolean;
  bass: number;
  lead: number;
  leadDur: number;
  pad: number[] | null;
  intensity: number;
}

export interface Track {
  id: 'neon_pulse' | 'midnight_drive' | 'digital_dreams';
  name: string;
  genre: string;
  bpm: number;
  bassType: OscillatorType;
  leadType: OscillatorType;
  detune: number;
  diffLabels: Record<Difficulty, string>;
  score: ScoreStep[];
  stepDur: number;
  duration: number;
}

export interface ChartNote {
  id: number;
  time: number;
  lane: number;
  hit: boolean;
  missed: boolean;
}

export const STORAGE_KEY = 'beat_the_rhythm_v1';
export const ACCOUNTS_STORAGE_KEY = 'beat_the_rhythm_accounts_v1';
export const LEAD_IN_SECONDS = 1.8;
export const LANE_COLORS = ['#00f0ff', '#a855f7', '#e879f9', '#ff2a85'] as const;
export const DEFAULT_KEYS: [string, string, string, string] = ['d', 'f', 'j', 'k'];

export const JUDGMENT_WINDOWS = {
  PERFECT: 0.04,
  GREAT: 0.08,
  GOOD: 0.13,
  EARLY_MISS: 0.185,
} as const;

export const DEFAULT_SETTINGS: GameSettings = {
  masterVol: 85,
  musicVol: 85,
  sfxVol: 75,
  muted: false,
  noteSpeed: 1.5,
  audioOffsetMs: 0,
  vfxEnabled: true,
  keyBindings: [...DEFAULT_KEYS],
};

export function createDefaultSaveState(): SaveState {
  return {
    settings: { ...DEFAULT_SETTINGS, keyBindings: [...DEFAULT_KEYS] },
    bestScores: {},
    songsCompleted: 0,
  };
}

function normalizeSaveState(parsed: Partial<SaveState> | null | undefined): SaveState {
  const keys: [string, string, string, string] =
    Array.isArray(parsed?.settings?.keyBindings) && parsed.settings.keyBindings.length === 4
      ? (parsed.settings.keyBindings as [string, string, string, string])
      : ([...DEFAULT_KEYS] as [string, string, string, string]);
  return {
    settings: { ...DEFAULT_SETTINGS, ...(parsed?.settings || {}), keyBindings: keys },
    bestScores: parsed?.bestScores || {},
    songsCompleted: Number(parsed?.songsCompleted) || 0,
  };
}

export function loadSaveState(): SaveState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return normalizeSaveState(JSON.parse(raw));
    }
  } catch {
    // Ignore storage errors
  }
  return createDefaultSaveState();
}

export function persistSaveState(state: SaveState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors
  }
}

export async function hashPasscode(email: string, passcode: string): Promise<string> {
  const input = `${email.trim().toLowerCase()}::${passcode}`;
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const encoded = new TextEncoder().encode(input);
      const digest = await crypto.subtle.digest('SHA-256', encoded);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }
  } catch {
    // Fallback for file:// or restricted WebViews without crypto.subtle
  }
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ (c + i), 0x85ebca6b);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

export function loadAccountStore(): AccountStore {
  try {
    const raw = localStorage.getItem(ACCOUNTS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AccountStore>;
      const profiles: Record<string, PlayerProfile> = {};
      if (parsed.profiles && typeof parsed.profiles === 'object') {
        Object.entries(parsed.profiles).forEach(([k, prof]) => {
          if (prof && prof.email && prof.username) {
            profiles[k] = {
              ...prof,
              save: normalizeSaveState(prof.save),
            };
          }
        });
      }
      const activeEmail =
        parsed.activeEmail && profiles[parsed.activeEmail] ? parsed.activeEmail : null;
      return { activeEmail, profiles };
    }
  } catch {
    // Ignore storage errors
  }
  return { activeEmail: null, profiles: {} };
}

export function persistAccountStore(store: AccountStore): void {
  try {
    localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Ignore storage errors
  }
}

export function getBestKey(trackId: string, diff: Difficulty): string {
  return `${trackId}_${diff}`;
}

export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}

export function formatKeyLabel(k: string): string {
  if (k === 'arrowleft') return '←';
  if (k === 'arrowdown') return '↓';
  if (k === 'arrowup') return '↑';
  if (k === 'arrowright') return '→';
  return k.toUpperCase();
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function buildTrackScore(trackId: Track['id']): ScoreStep[] {
  const steps: ScoreStep[] = [];
  if (trackId === 'neon_pulse') {
    const totalSteps = 28 * 16;
    const bassRoots = [45, 41, 48, 43];
    const arpPatterns = [
      [69, 72, 76, 72, 79, 76, 72, 76],
      [65, 69, 72, 69, 77, 72, 69, 72],
      [72, 76, 79, 76, 84, 79, 76, 79],
      [67, 71, 74, 71, 79, 74, 71, 74],
    ];
    const hookLead = [
      76, 0, 79, 0, 81, 0, 79, 76, 72, 0, 74, 0, 76, 0, 0, 0,
      77, 0, 81, 0, 84, 0, 81, 77, 76, 0, 74, 0, 72, 0, 71, 0,
    ];

    for (let i = 0; i < totalSteps; i++) {
      const bar = Math.floor(i / 16);
      const s = i % 16;
      const chordIdx = bar % 4;
      const root = bassRoots[chordIdx];
      const intensity = bar < 4 ? 0 : bar < 12 ? 1 : bar < 16 ? 2 : bar < 24 ? 3 : 1;

      const kick = s % 4 === 0 && !(bar === 15 && s >= 8);
      const snare = (bar >= 2 && (s === 4 || s === 12)) || (bar === 15 && s >= 8 && s % 2 === 0);
      const hat = s % 2 === 1 || (intensity >= 2 && s % 2 === 0);
      const hatOpen = s === 14 && intensity >= 1;

      let bass = 0;
      if (bar >= 1) {
        if (s % 4 === 2) bass = root - 12;
        else if (s % 4 === 0 && intensity >= 2) bass = root;
      }

      let lead = 0;
      let leadDur = 0.14;
      if (bar < 4) {
        if (s % 2 === 0) lead = arpPatterns[chordIdx][(s / 2) % 8];
      } else if (bar < 12) {
        lead = hookLead[i % 32];
        leadDur = 0.22;
      } else if (bar < 16) {
        lead = arpPatterns[chordIdx][s % 8] + (bar >= 14 ? 12 : 0);
        leadDur = 0.12;
      } else if (bar < 24) {
        lead = s % 2 === 0 ? arpPatterns[chordIdx][(s / 2) % 8] + 12 : hookLead[i % 32] || 0;
        leadDur = 0.15;
      } else {
        if (s % 4 === 0) lead = arpPatterns[chordIdx][(s / 4) % 4];
        leadDur = 0.28;
      }

      const pad = s === 0 && bar % 2 === 0 ? [root + 12, root + 15, root + 19] : null;
      steps.push({ kick, snare, hat, hatOpen, bass, lead, leadDur, pad, intensity });
    }
    return steps;
  }

  if (trackId === 'midnight_drive') {
    const totalSteps = 24 * 16;
    const bassRoots = [38, 34, 36, 33];
    const chords = [
      [62, 65, 69],
      [58, 62, 65],
      [60, 64, 67],
      [57, 60, 64],
    ];
    const melodyBar = [
      74, 0, 0, 77, 0, 0, 76, 0, 74, 0, 72, 0, 69, 0, 0, 0,
      70, 0, 0, 74, 0, 0, 72, 0, 70, 0, 69, 0, 67, 0, 0, 0,
      72, 0, 0, 76, 0, 0, 79, 0, 77, 0, 76, 0, 72, 0, 0, 0,
      69, 0, 72, 0, 76, 0, 74, 0, 72, 0, 69, 0, 67, 0, 69, 0,
    ];

    for (let i = 0; i < totalSteps; i++) {
      const bar = Math.floor(i / 16);
      const s = i % 16;
      const chordIdx = bar % 4;
      const root = bassRoots[chordIdx];
      const intensity = bar < 4 ? 0 : bar < 12 ? 1 : bar < 20 ? 2 : 1;

      const kick = s === 0 || s === 8 || (intensity >= 2 && s === 14);
      const snare = bar >= 2 && (s === 4 || s === 12);
      const hat = s % 2 === 0 && bar >= 1;
      const hatOpen = s === 10 && intensity >= 1;
      const bass = s % 2 === 0 ? (s % 8 === 6 ? root + 12 : root) : 0;

      let lead = 0;
      let leadDur = 0.28;
      if (bar >= 4 && bar < 20) {
        lead = melodyBar[i % 64];
        if (bar >= 12 && lead === 0 && s % 4 === 2) {
          lead = chords[chordIdx][s % 3] + 12;
          leadDur = 0.14;
        }
      } else if (s % 4 === 0) {
        lead = chords[chordIdx][(s / 4) % 3];
      }

      const pad = s === 0 ? chords[chordIdx] : null;
      steps.push({ kick, snare, hat, hatOpen, bass, lead, leadDur, pad, intensity });
    }
    return steps;
  }

  const totalSteps = 32 * 16;
  const bassRoots = [40, 36, 38, 35];
  const arcadeTheme = [
    76, 0, 79, 0, 83, 0, 79, 0, 84, 0, 83, 0, 79, 0, 76, 0,
    72, 0, 76, 0, 79, 0, 76, 0, 81, 0, 79, 0, 76, 0, 72, 0,
    74, 0, 78, 0, 81, 0, 78, 0, 83, 0, 81, 0, 78, 0, 74, 0,
    71, 0, 74, 0, 78, 0, 79, 0, 83, 0, 81, 0, 78, 0, 74, 0,
  ];
  for (let i = 0; i < totalSteps; i++) {
    const bar = Math.floor(i / 16);
    const s = i % 16;
    const chordIdx = bar % 4;
    const root = bassRoots[chordIdx];
    const intensity = bar < 4 ? 0 : bar < 12 ? 1 : bar < 24 ? 2 : 1;

    const kick = s === 0 || s === 6 || s === 8 || (intensity >= 2 && s === 12);
    const snare = bar >= 1 && (s === 4 || s === 12 || (bar % 4 === 3 && s === 15));
    const hat = s % 2 === 1 || (intensity >= 2 && s % 4 === 0);
    const hatOpen = s === 14 && intensity >= 1;
    const bass = s % 2 === 0 ? (s % 4 === 2 ? root + 12 : root) : 0;

    let lead = arcadeTheme[i % 64];
    let leadDur = 0.14;
    if (bar < 4 && s % 4 !== 0) lead = 0;
    if (bar >= 16 && bar < 24 && lead === 0 && s % 2 === 1) {
      const prev = arcadeTheme[(i + 63) % 64];
      lead = prev ? prev + 5 : 0;
      leadDur = 0.09;
    }

    const pad = s === 0 && bar % 2 === 0 ? [root + 24, root + 27, root + 31] : null;
    steps.push({ kick, snare, hat, hatOpen, bass, lead, leadDur, pad, intensity });
  }
  return steps;
}

export const TRACKS: Track[] = (
  [
    {
      id: 'neon_pulse',
      name: 'Neon Pulse',
      genre: 'Electronic',
      bpm: 136,
      bassType: 'sawtooth',
      leadType: 'sawtooth',
      detune: 7,
      diffLabels: { easy: 'Lv. 3', normal: 'Lv. 6', hard: 'Lv. 9' },
    },
    {
      id: 'midnight_drive',
      name: 'Midnight Drive',
      genre: 'Synthwave',
      bpm: 108,
      bassType: 'sawtooth',
      leadType: 'triangle',
      detune: 12,
      diffLabels: { easy: 'Lv. 2', normal: 'Lv. 5', hard: 'Lv. 8' },
    },
    {
      id: 'digital_dreams',
      name: 'Digital Dreams',
      genre: 'Arcade',
      bpm: 152,
      bassType: 'square',
      leadType: 'square',
      detune: 4,
      diffLabels: { easy: 'Lv. 4', normal: 'Lv. 7', hard: 'Lv. 10' },
    },
  ] as const
).map((t) => {
  const score = buildTrackScore(t.id);
  const stepDur = 60 / t.bpm / 4;
  const duration = score.length * stepDur + 1.4;
  return { ...t, score, stepDur, duration };
});

export function generateChart(track: Track, difficulty: Difficulty): ChartNote[] {
  const notes: ChartNote[] = [];
  const { score, stepDur } = track;
  let lastLane = 1;
  let dir = 1;

  function pickNextLane(midi: number, allowJump: boolean): number {
    if (midi > 0) {
      const mapped = Math.min(3, Math.max(0, Math.floor(((midi - 62) / 22) * 4)));
      if (mapped !== lastLane || allowJump) {
        lastLane = mapped;
        return mapped;
      }
    }
    let next = lastLane + dir;
    if (next > 3 || next < 0) {
      dir = -dir;
      next = lastLane + dir;
    }
    lastLane = Math.max(0, Math.min(3, next));
    return lastLane;
  }

  for (let i = 0; i < score.length; i++) {
    const st = score[i];
    const time = i * stepDur;
    const bar = Math.floor(i / 16);
    const s = i % 16;

    if (difficulty === 'easy') {
      const trigger = s === 0 || s === 8 || (bar >= 8 && st.snare && s === 12);
      if (trigger && (st.lead || st.kick || st.snare)) {
        const lane = pickNextLane(st.lead, false);
        notes.push({ id: notes.length, time, lane, hit: false, missed: false });
      }
    } else if (difficulty === 'normal') {
      if (s % 2 === 0 && (st.lead > 0 || st.kick || st.snare)) {
        const lane = pickNextLane(st.lead, true);
        notes.push({ id: notes.length, time, lane, hit: false, missed: false });
        if (st.intensity >= 2 && s === 0 && bar % 4 === 0) {
          const pairLane = (lane + 2) % 4;
          notes.push({ id: notes.length, time, lane: pairLane, hit: false, missed: false });
        }
      }
    } else {
      const isBurst = st.intensity >= 2 && st.lead > 0;
      const trigger =
        isBurst ||
        (s % 2 === 0 && (st.lead > 0 || st.kick || st.snare)) ||
        (st.intensity >= 2 && st.snare);
      if (trigger) {
        const lane = pickNextLane(st.lead, true);
        notes.push({ id: notes.length, time, lane, hit: false, missed: false });
        if (st.intensity >= 2 && (s === 0 || (st.snare && bar % 2 === 1 && s === 4))) {
          const pairLane = lane + (lane < 2 ? 2 : -2);
          notes.push({ id: notes.length, time, lane: pairLane, hit: false, missed: false });
        }
      }
    }
  }
  return notes;
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  masterGain: GainNode | null = null;
  musicGain: GainNode | null = null;
  sfxGain: GainNode | null = null;
  analyser: AnalyserNode | null = null;
  freqData: Uint8Array<ArrayBuffer> | null = null;
  songBus: GainNode | null = null;
  noiseBuffer: AudioBuffer | null = null;
  previewTimer: ReturnType<typeof setTimeout> | null = null;
  previewTrackId: string | null = null;

  ensureContext(settings: GameSettings): void {
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();

      this.masterGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 128;
      this.analyser.smoothingTimeConstant = 0.78;
      this.freqData = new Uint8Array(this.analyser.frequencyBinCount);

      this.musicGain.connect(this.analyser);
      this.analyser.connect(this.masterGain);
      this.sfxGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      const bufSize = this.ctx.sampleRate;
      this.noiseBuffer = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    this.applyVolumes(settings);
  }

  applyVolumes(settings: GameSettings): void {
    if (!this.ctx || !this.masterGain || !this.musicGain || !this.sfxGain) return;
    const m = settings.muted ? 0 : settings.masterVol / 100;
    this.masterGain.gain.setTargetAtTime(m, this.ctx.currentTime, 0.015);
    this.musicGain.gain.setTargetAtTime((settings.musicVol / 100) * 0.85, this.ctx.currentTime, 0.015);
    this.sfxGain.gain.setTargetAtTime((settings.sfxVol / 100) * 0.7, this.ctx.currentTime, 0.015);
  }

  createSongBus(): GainNode {
    this.stopSongBus();
    if (!this.ctx || !this.musicGain) {
      throw new Error('AudioContext not initialized');
    }
    this.songBus = this.ctx.createGain();
    this.songBus.gain.value = 1;
    this.songBus.connect(this.musicGain);
    return this.songBus;
  }

  stopSongBus(): void {
    if (this.songBus) {
      try {
        this.songBus.disconnect();
      } catch {
        // Ignore
      }
      this.songBus = null;
    }
  }

  async suspend(): Promise<void> {
    if (this.ctx && this.ctx.state === 'running') {
      await this.ctx.suspend();
    }
  }

  async resume(): Promise<void> {
    if (this.ctx && this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  scheduleStep(track: Track, step: ScoreStep, when: number, bus: GainNode | null): void {
    if (!bus || !this.ctx) return;

    if (step.kick) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(148, when);
      osc.frequency.exponentialRampToValueAtTime(42, when + 0.12);
      g.gain.setValueAtTime(0.65, when);
      g.gain.exponentialRampToValueAtTime(0.001, when + 0.19);
      osc.connect(g);
      g.connect(bus);
      osc.start(when);
      osc.stop(when + 0.21);
    }

    if (step.snare && this.noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1900, when);
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(0.32, when);
      ng.gain.exponentialRampToValueAtTime(0.001, when + 0.14);
      noise.connect(filter);
      filter.connect(ng);
      ng.connect(bus);
      noise.start(when);
      noise.stop(when + 0.16);

      const body = this.ctx.createOscillator();
      const bg = this.ctx.createGain();
      body.type = 'triangle';
      body.frequency.setValueAtTime(195, when);
      body.frequency.exponentialRampToValueAtTime(95, when + 0.08);
      bg.gain.setValueAtTime(0.28, when);
      bg.gain.exponentialRampToValueAtTime(0.001, when + 0.1);
      body.connect(bg);
      bg.connect(bus);
      body.start(when);
      body.stop(when + 0.11);
    }

    if ((step.hat || step.hatOpen) && this.noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.setValueAtTime(7200, when);
      const hg = this.ctx.createGain();
      const dur = step.hatOpen ? 0.16 : 0.045;
      hg.gain.setValueAtTime(step.hatOpen ? 0.14 : 0.09, when);
      hg.gain.exponentialRampToValueAtTime(0.001, when + dur);
      noise.connect(hp);
      hp.connect(hg);
      hg.connect(bus);
      noise.start(when);
      noise.stop(when + dur + 0.01);
    }

    if (step.bass > 0) {
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const g = this.ctx.createGain();
      osc.type = track.bassType;
      osc.frequency.setValueAtTime(midiToFreq(step.bass), when);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(950, when);
      filter.frequency.exponentialRampToValueAtTime(220, when + 0.16);
      g.gain.setValueAtTime(0.24, when);
      g.gain.exponentialRampToValueAtTime(0.001, when + 0.18);
      osc.connect(filter);
      filter.connect(g);
      g.connect(bus);
      osc.start(when);
      osc.stop(when + 0.2);
    }

    if (step.lead > 0) {
      const dur = step.leadDur || 0.15;
      const freq = midiToFreq(step.lead);
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const g = this.ctx.createGain();

      osc1.type = track.leadType;
      osc2.type = track.leadType;
      osc1.frequency.setValueAtTime(freq, when);
      osc2.frequency.setValueAtTime(freq, when);
      osc1.detune.setValueAtTime(-track.detune, when);
      osc2.detune.setValueAtTime(track.detune, when);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(3400, when);
      filter.frequency.exponentialRampToValueAtTime(1100, when + dur);

      g.gain.setValueAtTime(0.001, when);
      g.gain.linearRampToValueAtTime(0.14, when + 0.012);
      g.gain.exponentialRampToValueAtTime(0.001, when + dur);

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(g);
      g.connect(bus);

      osc1.start(when);
      osc2.start(when);
      osc1.stop(when + dur + 0.02);
      osc2.stop(when + dur + 0.02);
    }

    if (step.pad) {
      const padDur = track.stepDur * 14;
      step.pad.forEach((m) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(midiToFreq(m), when);
        g.gain.setValueAtTime(0.001, when);
        g.gain.linearRampToValueAtTime(0.045, when + 0.08);
        g.gain.exponentialRampToValueAtTime(0.001, when + padDur);
        osc.connect(g);
        g.connect(bus);
        osc.start(when);
        osc.stop(when + padDur + 0.03);
      });
    }
  }

  playHitSfx(lane: number, judgment: JudgmentType): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const baseFreqs = [523.25, 587.33, 659.25, 783.99];
    if (judgment === 'MISS') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(135, now);
      osc.frequency.exponentialRampToValueAtTime(75, now + 0.11);
      g.gain.setValueAtTime(0.16, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.connect(g);
      g.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.13);
      return;
    }
    osc.type = judgment === 'PERFECT' ? 'sine' : 'triangle';
    const freq = baseFreqs[lane] * (judgment === 'PERFECT' ? 1.5 : 1.0);
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.15, now + 0.055);
    g.gain.setValueAtTime(judgment === 'PERFECT' ? 0.22 : 0.15, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  playMilestoneSfx(combo: number): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const notes = combo >= 200 ? [523.25, 659.25, 783.99, 1046.5] : combo >= 100 ? [440, 554.37, 659.25, 880] : [392, 493.88, 587.33];
    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.sfxGain) return;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const start = now + idx * 0.035;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.04, start + 0.28);
      g.gain.setValueAtTime(0.001, start);
      g.gain.linearRampToValueAtTime(0.16, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.34);
      osc.connect(g);
      g.connect(this.sfxGain);
      osc.start(start);
      osc.stop(start + 0.36);
    });
  }

  startPreview(track: Track, settings: GameSettings, onEnd: () => void): void {
    this.stopPreview();
    this.ensureContext(settings);
    const bus = this.createSongBus();
    this.previewTrackId = track.id;
    let stepIdx = Math.min(64, Math.floor(track.score.length * 0.25));
    let nextTime = this.ctx!.currentTime + 0.04;
    const maxPreviewSteps = 48;
    let count = 0;

    const tick = () => {
      if (this.previewTrackId !== track.id || !this.ctx) return;
      while (nextTime < this.ctx.currentTime + 0.18 && count < maxPreviewSteps) {
        this.scheduleStep(track, track.score[stepIdx % track.score.length], nextTime, bus);
        nextTime += track.stepDur;
        stepIdx++;
        count++;
      }
      if (count >= maxPreviewSteps) {
        this.stopPreview();
        onEnd();
        return;
      }
      this.previewTimer = setTimeout(tick, 45);
    };
    tick();
  }

  stopPreview(): void {
    if (this.previewTimer) {
      clearTimeout(this.previewTimer);
      this.previewTimer = null;
    }
    this.previewTrackId = null;
    this.stopSongBus();
  }
}
