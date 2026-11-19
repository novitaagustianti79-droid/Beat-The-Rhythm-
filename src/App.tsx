import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LogOut, Mail, ShieldCheck, UserPlus } from 'lucide-react';
import {
  AccountStore,
  AudioEngine,
  ChartNote,
  createDefaultSaveState,
  DEFAULT_KEYS,
  Difficulty,
  formatKeyLabel,
  formatTime,
  generateChart,
  getBestKey,
  GradeType,
  hashPasscode,
  JUDGMENT_WINDOWS,
  JudgmentType,
  LANE_COLORS,
  LEAD_IN_SECONDS,
  loadAccountStore,
  loadSaveState,
  NEON_ACCENTS,
  NeonAccent,
  persistAccountStore,
  persistSaveState,
  PlayerProfile,
  SaveState,
  Track,
  TRACKS,
} from './rhythmEngine';
import { OfflineIndicator, PWAInstallButton, StandaloneHtmlExport } from './PWAInstallButton';

type ScreenName = 'auth' | 'menu' | 'songs' | 'howto' | 'settings' | 'gameplay' | 'result';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
}

interface ShockRing {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: string;
  life: number;
}

interface JudgmentPopup {
  text: JudgmentType;
  color: string;
  x: number;
  y: number;
  life: number;
}

interface MilestoneBanner {
  text: string;
  color: string;
  x: number;
  y: number;
  life: number;
}

interface HudSnapshot {
  score: number;
  accuracy: number;
  bestCombo: number;
  counts: Record<JudgmentType, number>;
  songTime: number;
  duration: number;
}

interface ResultData {
  track: Track;
  diff: Difficulty;
  score: number;
  accuracy: number;
  maxCombo: number;
  grade: GradeType;
  isNewBest: boolean;
  savedBestScore: number;
  counts: Record<JudgmentType, number>;
}

function hexAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function roundRect(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

export default function App() {
  const [accountStore, setAccountStore] = useState<AccountStore>(() => loadAccountStore());
  const initialActiveProfile = accountStore.activeEmail
    ? accountStore.profiles[accountStore.activeEmail] ?? null
    : null;
  const [saveState, setSaveState] = useState<SaveState>(() =>
    initialActiveProfile ? initialActiveProfile.save : loadSaveState()
  );
  const [screen, setScreen] = useState<ScreenName>(() =>
    initialActiveProfile ? 'menu' : 'auth'
  );
  const [authMode, setAuthMode] = useState<'register' | 'signin'>(() =>
    Object.keys(accountStore.profiles).length > 0 ? 'signin' : 'register'
  );
  const [authUsername, setAuthUsername] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPasscode, setAuthPasscode] = useState('');
  const [authAccent, setAuthAccent] = useState<NeonAccent>('#00f0ff');
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [settingsReturn, setSettingsReturn] = useState<'menu' | 'pause'>('menu');
  const [selectedTrackId, setSelectedTrackId] = useState<Track['id']>(TRACKS[0].id);
  const [selectedDiff, setSelectedDiff] = useState<Difficulty>('normal');
  const [previewingTrackId, setPreviewingTrackId] = useState<string | null>(null);
  const [listeningLaneBind, setListeningLaneBind] = useState<number>(-1);
  const [isPaused, setIsPaused] = useState(false);
  const [clearedBanner, setClearedBanner] = useState(false);
  const [laneActiveUi, setLaneActiveUi] = useState<[boolean, boolean, boolean, boolean]>([
    false,
    false,
    false,
    false,
  ]);
  const [hud, setHud] = useState<HudSnapshot>({
    score: 0,
    accuracy: 100,
    bestCombo: 0,
    counts: { PERFECT: 0, GREAT: 0, GOOD: 0, MISS: 0 },
    songTime: 0,
    duration: TRACKS[0].duration,
  });
  const [resultData, setResultData] = useState<ResultData | null>(null);

  const audioRef = useRef<AudioEngine | null>(null);
  if (!audioRef.current) {
    audioRef.current = new AudioEngine();
  }

  const saveRef = useRef(saveState);
  saveRef.current = saveState;

  const screenRef = useRef(screen);
  screenRef.current = screen;

  const listeningLaneRef = useRef(listeningLaneBind);
  listeningLaneRef.current = listeningLaneBind;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const activeCanvasPointers = useRef<Map<number, number>>(new Map());

  const gameRef = useRef({
    active: false,
    paused: false,
    track: TRACKS[0] as Track,
    diff: 'normal' as Difficulty,
    notes: [] as ChartNote[],
    nextCheckIdx: 0,
    nextScheduleStep: 0,
    songOriginTime: 0,
    songBus: null as GainNode | null,
    rafId: null as number | null,
    score: 0,
    combo: 0,
    bestCombo: 0,
    counts: { PERFECT: 0, GREAT: 0, GOOD: 0, MISS: 0 } as Record<JudgmentType, number>,
    lanePressed: [false, false, false, false],
    laneFlash: [0, 0, 0, 0],
    particles: [] as Particle[],
    rings: [] as ShockRing[],
    popups: [] as JudgmentPopup[],
    milestones: [] as MilestoneBanner[],
    comboScale: 1,
    shakeTime: 0,
    shakeDuration: 0.4,
    shakeIntensity: 0,
    milestoneFlash: 0,
    lastFrameTime: 0,
    lastHudSync: 0,
  });

  const activeEmailRef = useRef<string | null>(accountStore.activeEmail);
  activeEmailRef.current = accountStore.activeEmail;

  const updateSave = useCallback((updater: (prev: SaveState) => SaveState) => {
    setSaveState((prev) => {
      const next = updater(prev);
      saveRef.current = next;
      persistSaveState(next);
      const email = activeEmailRef.current;
      if (email) {
        setAccountStore((prevStore) => {
          const existing = prevStore.profiles[email];
          if (!existing) return prevStore;
          const nextStore: AccountStore = {
            ...prevStore,
            profiles: {
              ...prevStore.profiles,
              [email]: { ...existing, save: next },
            },
          };
          persistAccountStore(nextStore);
          return nextStore;
        });
      }
      return next;
    });
  }, []);

  const navigate = useCallback((nextScreen: ScreenName) => {
    if (screenRef.current === 'songs' && nextScreen !== 'songs') {
      audioRef.current?.stopPreview();
      setPreviewingTrackId(null);
    }
    setScreen(nextScreen);
  }, []);

  const stopGameLoopOnly = useCallback(() => {
    const g = gameRef.current;
    if (g.rafId !== null) {
      cancelAnimationFrame(g.rafId);
      g.rafId = null;
    }
    audioRef.current?.stopSongBus();
    g.songBus = null;
  }, []);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    const rect = stage.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(300, Math.floor(rect.width * dpr));
    canvas.height = Math.max(240, Math.floor(rect.height * dpr));
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, []);

  const getHighwayMetrics = (viewW: number, viewH: number) => {
    const hwWidth = Math.min(460, Math.max(260, viewW * 0.88));
    const hwLeft = (viewW - hwWidth) / 2;
    const laneW = hwWidth / 4;
    const hitY = viewH * 0.84;
    return { hwWidth, hwLeft, laneW, hitY };
  };

  const registerJudgment = useCallback(
    (type: JudgmentType, lane: number, viewW: number, viewH: number) => {
      const g = gameRef.current;
      const m = getHighwayMetrics(viewW, viewH);
      const x = m.hwLeft + (lane + 0.5) * m.laneW;
      const y = m.hitY;

      g.counts[type]++;

      if (type === 'MISS') {
        g.combo = 0;
        audioRef.current?.playHitSfx(lane, 'MISS');
        g.popups.push({
          text: 'MISS',
          color: '#fb7185',
          x: m.hwLeft + m.hwWidth / 2,
          y: m.hitY - 95,
          life: 1.0,
        });
      } else {
        g.combo++;
        if (g.combo > g.bestCombo) g.bestCombo = g.combo;
        g.comboScale = Math.min(1.5, 1.18 + g.combo * 0.004);

        const basePts = type === 'PERFECT' ? 300 : type === 'GREAT' ? 200 : 100;
        const mult = 1 + Math.min(g.combo, 50) * 0.01;
        g.score += Math.round(basePts * mult);

        audioRef.current?.playHitSfx(lane, type);

        const color = type === 'PERFECT' ? '#00f0ff' : type === 'GREAT' ? '#34d399' : '#fbbf24';
        g.popups.push({
          text: type,
          color,
          x: m.hwLeft + m.hwWidth / 2,
          y: m.hitY - 95,
          life: 1.0,
        });

        if (saveRef.current.settings.vfxEnabled) {
          g.rings.push({
            x,
            y,
            radius: m.laneW * 0.16,
            maxRadius: m.laneW * (type === 'PERFECT' ? 0.68 : 0.48),
            color: type === 'PERFECT' ? LANE_COLORS[lane] : color,
            life: 1.0,
          });

          const pCount = type === 'PERFECT' ? 20 : type === 'GREAT' ? 10 : 5;
          for (let i = 0; i < pCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = (type === 'PERFECT' ? 120 : 80) + Math.random() * 190;
            g.particles.push({
              x,
              y,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed - 60,
              size: (type === 'PERFECT' ? 3.5 : 2.5) + Math.random() * 2.5,
              color: i % 3 === 0 ? '#ffffff' : LANE_COLORS[lane],
              life: 1.0,
            });
          }
        }

        // Trigger special screen-shake & particle explosion on combo milestones (50, 100, 200, 300, ...)
        const isMilestone =
          g.combo === 50 ||
          g.combo === 100 ||
          (g.combo >= 200 && g.combo % 100 === 0);

        if (isMilestone) {
          audioRef.current?.playMilestoneSfx(g.combo);
          if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            try {
              navigator.vibrate(g.combo >= 100 ? [35, 25, 50] : 35);
            } catch {
              // Ignore vibration errors
            }
          }

          const tier = g.combo >= 200 ? 3 : g.combo >= 100 ? 2 : 1;
          const centerX = m.hwLeft + m.hwWidth / 2;
          const centerY = viewH * 0.32;
          const milestoneColor =
            tier === 3 ? '#fde047' : tier === 2 ? '#ff2a85' : '#00f0ff';

          g.milestones.push({
            text: `${g.combo} COMBO${tier === 3 ? '!!!' : tier === 2 ? '!!' : '!'}`,
            color: milestoneColor,
            x: centerX,
            y: viewH * 0.17,
            life: 1.0,
          });

          const reducedMotion =
            typeof window !== 'undefined' &&
            window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

          if (saveRef.current.settings.vfxEnabled && !reducedMotion) {
            g.shakeDuration = tier === 3 ? 0.6 : tier === 2 ? 0.48 : 0.38;
            g.shakeTime = g.shakeDuration;
            g.shakeIntensity = tier === 3 ? 18 : tier === 2 ? 13 : 8;
            g.milestoneFlash = tier === 3 ? 0.95 : tier === 2 ? 0.75 : 0.55;
          }

          if (saveRef.current.settings.vfxEnabled) {
            const palette = ['#00f0ff', '#a855f7', '#ff2a85', '#fde047', '#ffffff'];
            const ringCount = tier === 3 ? 4 : tier === 2 ? 3 : 2;
            for (let r = 0; r < ringCount; r++) {
              g.rings.push({
                x: centerX,
                y: centerY,
                radius: 24 + r * 14,
                maxRadius: m.hwWidth * (0.58 + r * 0.18),
                color: palette[r % palette.length],
                life: 1.0,
              });
            }

            const burstCount = tier === 3 ? 110 : tier === 2 ? 75 : 48;
            for (let i = 0; i < burstCount; i++) {
              const angle = (Math.PI * 2 * i) / burstCount + (Math.random() - 0.5) * 0.25;
              const speed = 150 + Math.random() * (tier === 3 ? 420 : tier === 2 ? 340 : 260);
              g.particles.push({
                x: centerX,
                y: centerY,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 40,
                size: 3.5 + Math.random() * (tier === 3 ? 4.5 : 3.2),
                color: palette[i % palette.length],
                life: 1.15,
              });
            }
          }
        }
      }
    },
    []
  );

  const finishSong = useCallback(() => {
    const g = gameRef.current;
    g.active = false;
    stopGameLoopOnly();

    const { counts, score, bestCombo, track, diff } = g;
    const total = counts.PERFECT + counts.GREAT + counts.GOOD + counts.MISS;
    const accuracy =
      total === 0
        ? 100
        : ((counts.PERFECT * 1.0 + counts.GREAT * 0.75 + counts.GOOD * 0.4) / total) * 100;

    let grade: GradeType = 'D';
    if (accuracy >= 95 && counts.MISS === 0) grade = 'S';
    else if (accuracy >= 88) grade = 'A';
    else if (accuracy >= 75) grade = 'B';
    else if (accuracy >= 60) grade = 'C';

    const key = getBestKey(track.id, diff);
    const prevBest = saveRef.current.bestScores[key];
    const isNewBest = !prevBest || score > prevBest.score;
    const savedBestScore = isNewBest ? score : prevBest.score;

    updateSave((prev) => ({
      ...prev,
      songsCompleted: prev.songsCompleted + 1,
      bestScores: isNewBest
        ? { ...prev.bestScores, [key]: { score, accuracy, grade, maxCombo: bestCombo } }
        : prev.bestScores,
    }));

    setResultData({
      track,
      diff,
      score,
      accuracy,
      maxCombo: bestCombo,
      grade,
      isNewBest,
      savedBestScore,
      counts: { ...counts },
    });
    navigate('result');
  }, [navigate, stopGameLoopOnly, updateSave]);

  const renderPlayfield = useCallback((songTime: number, viewW: number, viewH: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const g = gameRef.current;
    const settings = saveRef.current.settings;
    const audio = audioRef.current;

    ctx.clearRect(0, 0, viewW, viewH);
    const { hwWidth, hwLeft, laneW, hitY } = getHighwayMetrics(viewW, viewH);

    // Apply Screen-Shake transform when active
    let isShaking = false;
    if (g.shakeTime > 0 && settings.vfxEnabled) {
      const progress = g.shakeTime / Math.max(0.01, g.shakeDuration);
      const amp = g.shakeIntensity * progress * progress;
      const sx = (Math.random() * 2 - 1) * amp;
      const sy = (Math.random() * 2 - 1) * amp;
      ctx.save();
      ctx.translate(sx, sy);
      isShaking = true;
    }

    // 1. Background Audio Spectrum Visualizer
    let bassEnergy = 0;
    if (audio?.analyser && audio.freqData && settings.vfxEnabled) {
      audio.analyser.getByteFrequencyData(audio.freqData);
      const bins = 28;
      const barSpan = viewW / bins;
      for (let i = 0; i < bins; i++) {
        const val = audio.freqData[i] / 255;
        if (i < 5) bassEnergy += val;
        const barH = val * viewH * 0.42;
        const alpha = 0.08 + val * 0.22;
        const grad = ctx.createLinearGradient(0, viewH, 0, viewH - barH);
        grad.addColorStop(0, `rgba(157, 78, 221, ${alpha})`);
        grad.addColorStop(0.5, `rgba(0, 240, 255, ${alpha * 0.9})`);
        grad.addColorStop(1, `rgba(255, 42, 133, ${alpha * 0.8})`);
        ctx.fillStyle = grad;
        ctx.fillRect(i * barSpan + 2, viewH - barH, barSpan - 4, barH);
      }
      bassEnergy /= 5;
    }

    // 2. Highway Backdrop
    ctx.fillStyle = 'rgba(10, 12, 24, 0.86)';
    ctx.fillRect(hwLeft, 0, hwWidth, viewH);

    // Lane Press Beams
    for (let l = 0; l < 4; l++) {
      const lx = hwLeft + l * laneW;
      const flash = g.laneFlash[l];
      if (flash > 0.01) {
        const beamGrad = ctx.createLinearGradient(0, hitY, 0, 0);
        beamGrad.addColorStop(0, hexAlpha(LANE_COLORS[l], 0.34 * flash));
        beamGrad.addColorStop(0.55, hexAlpha(LANE_COLORS[l], 0.1 * flash));
        beamGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = beamGrad;
        ctx.fillRect(lx + 1, 0, laneW - 2, hitY);
      }
    }

    // Lane Dividers
    ctx.lineWidth = 1;
    for (let l = 0; l <= 4; l++) {
      const lx = hwLeft + l * laneW;
      ctx.strokeStyle =
        l === 0 || l === 4
          ? `rgba(0, 240, 255, ${0.35 + bassEnergy * 0.35})`
          : 'rgba(255, 255, 255, 0.08)';
      ctx.beginPath();
      ctx.moveTo(lx, 0);
      ctx.lineTo(lx, viewH);
      ctx.stroke();
    }

    // 3. Scrolling Beat Lines
    const approachTime = 1.55 / settings.noteSpeed;
    const pixelsPerSec = hitY / approachTime;
    const beatSec = 60 / g.track.bpm;
    const firstBeat = Math.floor((songTime - 0.1) / beatSec);
    const lastBeat = Math.ceil((songTime + approachTime) / beatSec);

    ctx.lineWidth = 1;
    for (let b = firstBeat; b <= lastBeat; b++) {
      const bTime = b * beatSec;
      const y = hitY - (bTime - songTime) * pixelsPerSec;
      if (y >= 0 && y <= hitY + 10) {
        ctx.strokeStyle =
          b % 4 === 0 ? 'rgba(255, 255, 255, 0.14)' : 'rgba(255, 255, 255, 0.045)';
        ctx.beginPath();
        ctx.moveTo(hwLeft, y);
        ctx.lineTo(hwLeft + hwWidth, y);
        ctx.stroke();
      }
    }

    // 4. Hit Line & Receptors
    ctx.save();
    ctx.strokeStyle = `rgba(0, 240, 255, ${0.65 + bassEnergy * 0.35})`;
    ctx.lineWidth = 3;
    if (settings.vfxEnabled) {
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 12 + bassEnergy * 10;
    }
    ctx.beginPath();
    ctx.moveTo(hwLeft, hitY);
    ctx.lineTo(hwLeft + hwWidth, hitY);
    ctx.stroke();
    ctx.restore();

    const noteW = laneW * 0.72;
    const noteH = 20;

    for (let l = 0; l < 4; l++) {
      const cx = hwLeft + (l + 0.5) * laneW;
      const pressed = g.lanePressed[l];
      const col = LANE_COLORS[l];
      ctx.save();
      ctx.fillStyle = pressed ? hexAlpha(col, 0.36) : 'rgba(255, 255, 255, 0.04)';
      ctx.strokeStyle = pressed ? col : hexAlpha(col, 0.45);
      ctx.lineWidth = pressed ? 2.5 : 1.5;
      if (pressed && settings.vfxEnabled) {
        ctx.shadowColor = col;
        ctx.shadowBlur = 16;
      }
      roundRect(ctx, cx - noteW / 2, hitY - noteH / 2, noteW, noteH, 7);
      ctx.fill();
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.fillStyle = pressed ? '#ffffff' : 'rgba(255, 255, 255, 0.48)';
      ctx.font = '700 12px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(formatKeyLabel(settings.keyBindings[l]), cx, hitY);
      ctx.restore();
    }

    // 5. Falling Notes
    for (let i = g.nextCheckIdx; i < g.notes.length; i++) {
      const n = g.notes[i];
      if (n.hit || n.missed) continue;
      const dtNote = n.time - songTime;
      if (dtNote > approachTime + 0.08) break;
      const y = hitY - dtNote * pixelsPerSec;
      if (y < -30 || y > viewH + 30) continue;

      const cx = hwLeft + (n.lane + 0.5) * laneW;
      const col = LANE_COLORS[n.lane];

      ctx.save();
      if (settings.vfxEnabled) {
        ctx.shadowColor = col;
        ctx.shadowBlur = 16;
      }
      const grad = ctx.createLinearGradient(
        cx - noteW / 2,
        y - noteH / 2,
        cx + noteW / 2,
        y + noteH / 2
      );
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.25, col);
      grad.addColorStop(1, col);
      ctx.fillStyle = grad;
      roundRect(ctx, cx - noteW / 2, y - noteH / 2, noteW, noteH, 7);
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
      roundRect(ctx, cx - noteW * 0.34, y - 3, noteW * 0.68, 6, 3);
      ctx.fill();
      ctx.restore();
    }

    // 6. Shockwave Rings
    for (const r of g.rings) {
      const progress = 1 - r.life;
      const rad = r.radius + (r.maxRadius - r.radius) * progress;
      ctx.save();
      ctx.strokeStyle = hexAlpha(r.color, r.life * 0.85);
      ctx.lineWidth = 3 * r.life;
      ctx.beginPath();
      ctx.arc(r.x, r.y, rad, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 7. Particles
    for (const p of g.particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      if (settings.vfxEnabled) {
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 8. Center Combo Counter
    if (g.combo > 0) {
      ctx.save();
      const centerX = hwLeft + hwWidth / 2;
      const centerY = viewH * 0.28;
      ctx.translate(centerX, centerY);
      ctx.scale(g.comboScale, g.comboScale);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const comboColor = g.combo >= 50 ? '#ff2a85' : g.combo >= 20 ? '#00f0ff' : '#ffffff';
      if (settings.vfxEnabled && g.combo >= 10) {
        ctx.shadowColor = comboColor;
        ctx.shadowBlur = g.combo >= 30 ? 22 : 12;
      }
      ctx.fillStyle = comboColor;
      ctx.font = '900 46px system-ui, sans-serif';
      ctx.fillText(String(g.combo), 0, 0);

      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
      ctx.font = '700 12px system-ui, sans-serif';
      ctx.fillText('COMBO', 0, 32);
      ctx.restore();
    }

    // 9. Judgment Popups
    for (const pop of g.popups) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, pop.life * 1.4);
      const popScale = 0.92 + (1 - pop.life) * 0.16;
      ctx.translate(pop.x, pop.y);
      ctx.scale(popScale, popScale);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '900 26px system-ui, sans-serif';
      if (settings.vfxEnabled) {
        ctx.shadowColor = pop.color;
        ctx.shadowBlur = 14;
      }
      ctx.fillStyle = pop.color;
      ctx.fillText(pop.text, 0, 0);
      ctx.restore();
    }

    // 10. Milestone Explosion Flash & Celebration Banner
    if (g.milestoneFlash > 0.01 && settings.vfxEnabled) {
      ctx.save();
      ctx.strokeStyle = `rgba(253, 224, 71, ${g.milestoneFlash * 0.85})`;
      ctx.lineWidth = 4;
      ctx.shadowColor = '#ff2a85';
      ctx.shadowBlur = 28 * g.milestoneFlash;
      ctx.strokeRect(hwLeft, 2, hwWidth, viewH - 4);
      ctx.restore();
    }

    for (const mb of g.milestones) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, mb.life * 1.6);
      const scale = 1 + (1 - mb.life) * 0.25;
      ctx.translate(mb.x, mb.y);
      ctx.scale(scale, scale);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '900 30px system-ui, sans-serif';
      if (settings.vfxEnabled) {
        ctx.shadowColor = mb.color;
        ctx.shadowBlur = 20;
      }
      ctx.fillStyle = mb.color;
      ctx.fillText(mb.text, 0, 0);
      ctx.restore();
    }

    if (isShaking) {
      ctx.restore();
    }
  }, []);

  const gameLoop = useCallback(
    (now: number) => {
      const g = gameRef.current;
      if (!g.active) return;
      const dt = Math.min(0.05, (now - g.lastFrameTime) / 1000);
      g.lastFrameTime = now;

      const audio = audioRef.current;
      if (!g.paused && audio?.ctx) {
        const audioTime = audio.ctx.currentTime - g.songOriginTime;
        const songTime = audioTime - saveRef.current.settings.audioOffsetMs / 1000;

        // Schedule upcoming audio steps
        const scheduleHorizon = audioTime + 0.22;
        const { track } = g;
        while (g.nextScheduleStep < track.score.length) {
          const stepSongTime = g.nextScheduleStep * track.stepDur;
          if (stepSongTime <= scheduleHorizon) {
            const when = g.songOriginTime + stepSongTime;
            if (when >= audio.ctx.currentTime - 0.05) {
              audio.scheduleStep(
                track,
                track.score[g.nextScheduleStep],
                Math.max(audio.ctx.currentTime, when),
                g.songBus
              );
            }
            g.nextScheduleStep++;
          } else {
            break;
          }
        }

        // Check missed notes
        const rect = stageRef.current?.getBoundingClientRect();
        const viewW = rect?.width || 480;
        const viewH = rect?.height || 600;

        while (g.nextCheckIdx < g.notes.length) {
          const n = g.notes[g.nextCheckIdx];
          if (n.hit || n.missed) {
            g.nextCheckIdx++;
            continue;
          }
          if (songTime - n.time > JUDGMENT_WINDOWS.GOOD) {
            n.missed = true;
            registerJudgment('MISS', n.lane, viewW, viewH);
            g.nextCheckIdx++;
          } else {
            break;
          }
        }

        // Update visual state
        for (let l = 0; l < 4; l++) {
          if (!g.lanePressed[l] && g.laneFlash[l] > 0) {
            g.laneFlash[l] = Math.max(0, g.laneFlash[l] - dt * 5.5);
          } else if (g.lanePressed[l]) {
            g.laneFlash[l] = 1.0;
          }
        }

        g.comboScale += (1 - g.comboScale) * Math.min(1, dt * 12);

        for (let i = g.particles.length - 1; i >= 0; i--) {
          const p = g.particles[i];
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vy += 320 * dt;
          p.life -= dt * 2.2;
          if (p.life <= 0) g.particles.splice(i, 1);
        }

        for (let i = g.rings.length - 1; i >= 0; i--) {
          const r = g.rings[i];
          r.life -= dt * 3.1;
          if (r.life <= 0) g.rings.splice(i, 1);
        }

        for (let i = g.popups.length - 1; i >= 0; i--) {
          const pop = g.popups[i];
          pop.y -= 28 * dt;
          pop.life -= dt * 2.0;
          if (pop.life <= 0) g.popups.splice(i, 1);
        }

        for (let i = g.milestones.length - 1; i >= 0; i--) {
          const mb = g.milestones[i];
          mb.y -= 18 * dt;
          mb.life -= dt * 0.95;
          if (mb.life <= 0) g.milestones.splice(i, 1);
        }

        if (g.shakeTime > 0) {
          g.shakeTime = Math.max(0, g.shakeTime - dt);
        }
        if (g.milestoneFlash > 0) {
          g.milestoneFlash = Math.max(0, g.milestoneFlash - dt * 1.8);
        }

        // Sync HUD ~15fps or on score change
        if (now - g.lastHudSync > 60) {
          g.lastHudSync = now;
          const totalJudged =
            g.counts.PERFECT + g.counts.GREAT + g.counts.GOOD + g.counts.MISS;
          const accuracy =
            totalJudged === 0
              ? 100
              : ((g.counts.PERFECT * 1.0 + g.counts.GREAT * 0.75 + g.counts.GOOD * 0.4) /
                  totalJudged) *
                100;
          setHud({
            score: g.score,
            accuracy,
            bestCombo: g.bestCombo,
            counts: { ...g.counts },
            songTime: Math.max(0, Math.min(track.duration, songTime)),
            duration: track.duration,
          });
        }

        renderPlayfield(songTime, viewW, viewH);

        if (songTime >= track.duration) {
          finishSong();
          return;
        }
      }

      g.rafId = requestAnimationFrame(gameLoop);
    },
    [finishSong, registerJudgment, renderPlayfield]
  );

  const startGame = useCallback(
    (trackId: Track['id'] = selectedTrackId, diff: Difficulty = selectedDiff) => {
      const audio = audioRef.current!;
      audio.stopPreview();
      setPreviewingTrackId(null);
      audio.ensureContext(saveRef.current.settings);
      if (audio.ctx?.state === 'suspended') {
        void audio.ctx.resume();
      }

      stopGameLoopOnly();

      const track = TRACKS.find((t) => t.id === trackId) || TRACKS[0];
      setSelectedTrackId(track.id);
      setSelectedDiff(diff);

      const g = gameRef.current;
      g.active = true;
      g.paused = false;
      g.track = track;
      g.diff = diff;
      g.notes = generateChart(track, diff);
      g.nextCheckIdx = 0;
      g.nextScheduleStep = 0;
      g.score = 0;
      g.combo = 0;
      g.bestCombo = 0;
      g.counts = { PERFECT: 0, GREAT: 0, GOOD: 0, MISS: 0 };
      g.lanePressed = [false, false, false, false];
      g.laneFlash = [0, 0, 0, 0];
      g.particles = [];
      g.rings = [];
      g.popups = [];
      g.milestones = [];
      g.comboScale = 1;
      g.shakeTime = 0;
      g.shakeIntensity = 0;
      g.milestoneFlash = 0;
      g.lastFrameTime = performance.now();
      g.lastHudSync = 0;

      g.songBus = audio.createSongBus();
      g.songOriginTime = audio.ctx!.currentTime + LEAD_IN_SECONDS;

      setIsPaused(false);
      setLaneActiveUi([false, false, false, false]);
      setHud({
        score: 0,
        accuracy: 100,
        bestCombo: 0,
        counts: { PERFECT: 0, GREAT: 0, GOOD: 0, MISS: 0 },
        songTime: 0,
        duration: track.duration,
      });
      navigate('gameplay');

      requestAnimationFrame(() => {
        resizeCanvas();
        g.rafId = requestAnimationFrame(gameLoop);
      });
    },
    [gameLoop, navigate, resizeCanvas, selectedDiff, selectedTrackId, stopGameLoopOnly]
  );

  const pauseGame = useCallback(async () => {
    const g = gameRef.current;
    if (!g.active || g.paused) return;
    g.paused = true;
    g.lanePressed = [false, false, false, false];
    setLaneActiveUi([false, false, false, false]);
    setIsPaused(true);
    await audioRef.current?.suspend();
  }, []);

  const resumeGame = useCallback(async () => {
    const g = gameRef.current;
    if (!g.active || !g.paused) return;
    setIsPaused(false);
    await audioRef.current?.resume();
    g.lastFrameTime = performance.now();
    g.paused = false;
  }, []);

  const quitToScreen = useCallback(
    async (target: ScreenName) => {
      const g = gameRef.current;
      g.active = false;
      g.paused = false;
      setIsPaused(false);
      stopGameLoopOnly();
      await audioRef.current?.resume();
      navigate(target);
    },
    [navigate, stopGameLoopOnly]
  );

  const handleLanePress = useCallback(
    (lane: number) => {
      const g = gameRef.current;
      if (!g.active || g.paused) return;
      if (g.lanePressed[lane]) return;
      g.lanePressed[lane] = true;
      g.laneFlash[lane] = 1.0;

      setLaneActiveUi((prev) => {
        const next: [boolean, boolean, boolean, boolean] = [...prev];
        next[lane] = true;
        return next;
      });

      const audio = audioRef.current;
      if (!audio?.ctx) return;

      const audioTime = audio.ctx.currentTime - g.songOriginTime;
      const songTime = audioTime - saveRef.current.settings.audioOffsetMs / 1000;

      let bestNote: ChartNote | null = null;
      let bestDiff = Infinity;
      for (let i = g.nextCheckIdx; i < g.notes.length; i++) {
        const n = g.notes[i];
        if (n.time - songTime > JUDGMENT_WINDOWS.EARLY_MISS) break;
        if (n.lane === lane && !n.hit && !n.missed) {
          const diff = Math.abs(n.time - songTime);
          if (diff < bestDiff) {
            bestDiff = diff;
            bestNote = n;
          }
        }
      }

      const rect = stageRef.current?.getBoundingClientRect();
      const viewW = rect?.width || 480;
      const viewH = rect?.height || 600;

      if (bestNote && bestDiff <= JUDGMENT_WINDOWS.EARLY_MISS) {
        if (bestDiff <= JUDGMENT_WINDOWS.PERFECT) {
          bestNote.hit = true;
          registerJudgment('PERFECT', lane, viewW, viewH);
        } else if (bestDiff <= JUDGMENT_WINDOWS.GREAT) {
          bestNote.hit = true;
          registerJudgment('GREAT', lane, viewW, viewH);
        } else if (bestDiff <= JUDGMENT_WINDOWS.GOOD) {
          bestNote.hit = true;
          registerJudgment('GOOD', lane, viewW, viewH);
        } else {
          bestNote.missed = true;
          registerJudgment('MISS', lane, viewW, viewH);
        }
      }
    },
    [registerJudgment]
  );

  const handleLaneRelease = useCallback((lane: number) => {
    gameRef.current.lanePressed[lane] = false;
    setLaneActiveUi((prev) => {
      if (!prev[lane]) return prev;
      const next: [boolean, boolean, boolean, boolean] = [...prev];
      next[lane] = false;
      return next;
    });
  }, []);

  // Global keyboard, resize, and visibility listeners
  useEffect(() => {
    const onResize = () => {
      if (gameRef.current.active) resizeCanvas();
    };
    const onVisibility = () => {
      if (document.hidden && gameRef.current.active && !gameRef.current.paused) {
        void pauseGame();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const keyLower = e.key.toLowerCase();

      if (screenRef.current === 'settings' && listeningLaneRef.current !== -1) {
        e.preventDefault();
        if (keyLower === 'escape') {
          setListeningLaneBind(-1);
          return;
        }
        const allowedArrows = ['arrowleft', 'arrowdown', 'arrowup', 'arrowright'];
        if ((keyLower.length === 1 && ![' ', 'p'].includes(keyLower)) || allowedArrows.includes(keyLower)) {
          const targetIdx = listeningLaneRef.current;
          updateSave((prev) => {
            const nextKeys: [string, string, string, string] = [...prev.settings.keyBindings];
            const existingIdx = nextKeys.indexOf(keyLower);
            if (existingIdx !== -1 && existingIdx !== targetIdx) {
              nextKeys[existingIdx] = nextKeys[targetIdx];
            }
            nextKeys[targetIdx] = keyLower;
            return { ...prev, settings: { ...prev.settings, keyBindings: nextKeys } };
          });
          setListeningLaneBind(-1);
        }
        return;
      }

      if (screenRef.current === 'gameplay' && gameRef.current.active) {
        if (keyLower === 'escape' || keyLower === 'p') {
          e.preventDefault();
          if (gameRef.current.paused) void resumeGame();
          else void pauseGame();
          return;
        }
        if (!gameRef.current.paused && !e.repeat) {
          const lane = saveRef.current.settings.keyBindings.indexOf(keyLower);
          if (lane !== -1) {
            e.preventDefault();
            handleLanePress(lane);
          }
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const keyLower = e.key.toLowerCase();
      const lane = saveRef.current.settings.keyBindings.indexOf(keyLower);
      if (lane !== -1) handleLaneRelease(lane);
    };

    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [handleLanePress, handleLaneRelease, pauseGame, resizeCanvas, resumeGame, updateSave]);

  // Cleanup on unmount
  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      stopGameLoopOnly();
      audio?.stopPreview();
    };
  }, [stopGameLoopOnly]);

  // Derived UI stats
  let topScore = 0;
  Object.values(saveState.bestScores).forEach((entry) => {
    if (entry && entry.score > topScore) topScore = entry.score;
  });
  const selectedTrack = TRACKS.find((t) => t.id === selectedTrackId) || TRACKS[0];

  const handleToggleMute = () => {
    updateSave((prev) => {
      const next = { ...prev, settings: { ...prev.settings, muted: !prev.settings.muted } };
      audioRef.current?.applyVolumes(next.settings);
      return next;
    });
  };

  const activeProfile = accountStore.activeEmail
    ? accountStore.profiles[accountStore.activeEmail] ?? null
    : null;
  const savedProfilesList = Object.values(accountStore.profiles);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (authBusy) return;
    setAuthError('');

    const normalizedEmail = authEmail.trim().toLowerCase();
    const trimmedUser = authUsername.trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setAuthError('Please enter a valid email address.');
      return;
    }
    if (authPasscode.length < 4) {
      setAuthError('Passcode must be at least 4 characters.');
      return;
    }

    setAuthBusy(true);
    try {
      const passHash = await hashPasscode(normalizedEmail, authPasscode);

      if (authMode === 'register') {
        if (trimmedUser.length < 2 || trimmedUser.length > 20) {
          setAuthError('Gamer Tag must be 2 to 20 characters.');
          return;
        }
        if (accountStore.profiles[normalizedEmail]) {
          setAuthError('This email is already registered. Switch to Sign In.');
          return;
        }

        // Preserve guest progress if this is the very first registered account on the device
        const legacyGuest =
          Object.keys(accountStore.profiles).length === 0 ? loadSaveState() : null;
        const initialSave =
          legacyGuest &&
          (legacyGuest.songsCompleted > 0 || Object.keys(legacyGuest.bestScores).length > 0)
            ? legacyGuest
            : createDefaultSaveState();

        const newProfile: PlayerProfile = {
          email: normalizedEmail,
          username: trimmedUser,
          accent: authAccent,
          passcodeHash: passHash,
          createdAt: new Date().toISOString(),
          save: initialSave,
        };

        const nextStore: AccountStore = {
          activeEmail: normalizedEmail,
          profiles: { ...accountStore.profiles, [normalizedEmail]: newProfile },
        };
        persistAccountStore(nextStore);
        persistSaveState(initialSave);
        setAccountStore(nextStore);
        setSaveState(initialSave);
        saveRef.current = initialSave;
        setAuthPasscode('');
        setScreen('menu');
      } else {
        const existing = accountStore.profiles[normalizedEmail];
        if (!existing) {
          setAuthError('No account found for this email. Switch to Register.');
          return;
        }
        if (existing.passcodeHash !== passHash) {
          setAuthError('Incorrect passcode. Please try again.');
          return;
        }

        const nextStore: AccountStore = {
          ...accountStore,
          activeEmail: normalizedEmail,
        };
        persistAccountStore(nextStore);
        persistSaveState(existing.save);
        setAccountStore(nextStore);
        setSaveState(existing.save);
        saveRef.current = existing.save;
        setAuthPasscode('');
        setScreen('menu');
      }
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLogout = () => {
    const nextStore: AccountStore = {
      ...accountStore,
      activeEmail: null,
    };
    persistAccountStore(nextStore);
    setAccountStore(nextStore);
    setAuthMode('signin');
    setAuthPasscode('');
    setAuthError('');
    if (activeProfile) {
      setAuthEmail(activeProfile.email);
    }
    navigate('auth');
  };

  return (
    <div
      className="relative w-full h-full overflow-hidden text-[#f5f7ff]"
      style={{
        background:
          'radial-gradient(circle at 20% 15%, rgba(157, 78, 221, 0.14), transparent 45%), radial-gradient(circle at 82% 85%, rgba(0, 240, 255, 0.12), transparent 45%), radial-gradient(circle at 50% 50%, #0d1020 0%, #07080f 100%)',
      }}
    >
      <div className="bg-arcade-grid absolute inset-0 pointer-events-none z-0" />
      {screen !== 'gameplay' && <OfflineIndicator />}

      {/* PLAYER REGISTRATION / SIGN IN */}
      {screen === 'auth' && (
        <section
          aria-label="Player Registration"
          className="relative z-10 w-full h-full flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
        >
          <div className="w-full max-w-[460px] bg-[#101220]/92 border border-white/10 rounded-2xl p-5 sm:p-7 shadow-2xl backdrop-blur-md">
            <div className="flex flex-col items-center text-center gap-2 mb-5">
              <div className="flex items-end gap-1.5 h-6" aria-hidden="true">
                <div className="w-1.5 h-3 rounded bg-[#00f0ff] eq-bar-1" />
                <div className="w-1.5 h-5.5 rounded bg-[#a855f7] eq-bar-2" />
                <div className="w-1.5 h-4 rounded bg-[#ff2a85] eq-bar-3" />
                <div className="w-1.5 h-6 rounded bg-[#00f0ff] eq-bar-4" />
              </div>
              <h1
                className="text-2xl sm:text-3xl font-black tracking-wider bg-clip-text text-transparent"
                style={{
                  backgroundImage:
                    'linear-gradient(95deg, #ffffff 10%, #00f0ff 48%, #ff2a85 92%)',
                }}
              >
                BEAT THE RHYTHM
              </h1>
              <p className="text-xs text-[#a2a9c8] tracking-widest uppercase">
                Player Pass · Register or Sign In
              </p>
            </div>

            <div
              className="grid grid-cols-2 p-1 bg-[#07080f] border border-white/10 rounded-xl gap-1 mb-5"
              role="tablist"
              aria-label="Account Mode"
            >
              <button
                type="button"
                role="tab"
                aria-selected={authMode === 'register'}
                onClick={() => {
                  setAuthMode('register');
                  setAuthError('');
                }}
                className={`py-2 rounded-lg text-xs font-bold tracking-wider uppercase flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                  authMode === 'register'
                    ? 'bg-[#00f0ff]/15 text-[#00f0ff] ring-1 ring-[#00f0ff]/40'
                    : 'text-[#a2a9c8] hover:text-white'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                Register
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={authMode === 'signin'}
                onClick={() => {
                  setAuthMode('signin');
                  setAuthError('');
                }}
                className={`py-2 rounded-lg text-xs font-bold tracking-wider uppercase flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                  authMode === 'signin'
                    ? 'bg-[#a855f7]/15 text-[#a855f7] ring-1 ring-[#a855f7]/40'
                    : 'text-[#a2a9c8] hover:text-white'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                Sign In
              </button>
            </div>

            {authMode === 'signin' && savedProfilesList.length > 0 && (
              <div className="mb-4">
                <div className="text-[11px] text-[#6c7496] uppercase tracking-wider mb-2">
                  Registered Profiles on Device
                </div>
                <div className="flex flex-col gap-1.5 max-h-28 overflow-y-auto">
                  {savedProfilesList.map((prof) => (
                    <button
                      key={prof.email}
                      type="button"
                      onClick={() => {
                        setAuthEmail(prof.email);
                        setAuthError('');
                      }}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-left transition-colors cursor-pointer ${
                        authEmail.trim().toLowerCase() === prof.email
                          ? 'bg-[#171a2d] border-[#00f0ff]/55'
                          : 'bg-[#07080f]/80 border-white/10 hover:border-white/25'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black text-[#06070d] shrink-0"
                          style={{ backgroundColor: prof.accent }}
                        >
                          {prof.username.charAt(0).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate">
                            {prof.username}
                          </div>
                          <div className="text-[11px] text-[#6c7496] truncate">{prof.email}</div>
                        </div>
                      </div>
                      <span className="text-[11px] font-mono text-[#a2a9c8] shrink-0">
                        {prof.save.songsCompleted} plays
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={(e) => void handleAuthSubmit(e)} className="flex flex-col gap-3.5">
              {authMode === 'register' && (
                <div>
                  <label
                    htmlFor="auth-username"
                    className="block text-[11px] text-[#a2a9c8] uppercase tracking-wider mb-1"
                  >
                    Gamer Tag / Player Name
                  </label>
                  <input
                    id="auth-username"
                    type="text"
                    maxLength={20}
                    required
                    placeholder="e.g. NEON_ACE"
                    value={authUsername}
                    onChange={(e) => setAuthUsername(e.target.value)}
                    className="w-full rounded-xl bg-[#07080f] border border-white/15 px-3.5 py-2.5 text-sm text-white placeholder-[#565e7d] focus:outline-none focus:border-[#00f0ff]"
                  />
                </div>
              )}

              <div>
                <label
                  htmlFor="auth-email"
                  className="block text-[11px] text-[#a2a9c8] uppercase tracking-wider mb-1"
                >
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-[#6c7496] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="auth-email"
                    type="email"
                    required
                    placeholder="player@example.com"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    className="w-full rounded-xl bg-[#07080f] border border-white/15 pl-10 pr-3.5 py-2.5 text-sm text-white placeholder-[#565e7d] focus:outline-none focus:border-[#00f0ff]"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="auth-passcode"
                  className="block text-[11px] text-[#a2a9c8] uppercase tracking-wider mb-1"
                >
                  Passcode / Password (min 4 chars)
                </label>
                <input
                  id="auth-passcode"
                  type="password"
                  required
                  minLength={4}
                  placeholder="••••"
                  value={authPasscode}
                  onChange={(e) => setAuthPasscode(e.target.value)}
                  className="w-full rounded-xl bg-[#07080f] border border-white/15 px-3.5 py-2.5 text-sm text-white placeholder-[#565e7d] focus:outline-none focus:border-[#00f0ff]"
                />
              </div>

              {authMode === 'register' && (
                <div>
                  <span className="block text-[11px] text-[#a2a9c8] uppercase tracking-wider mb-1.5">
                    Neon Badge Color
                  </span>
                  <div className="grid grid-cols-4 gap-2">
                    {NEON_ACCENTS.map((item) => {
                      const active = authAccent === item.color;
                      return (
                        <button
                          key={item.color}
                          type="button"
                          onClick={() => setAuthAccent(item.color)}
                          className={`py-2 px-2 rounded-xl border text-[11px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                            active
                              ? 'bg-[#171a2d] border-white text-white shadow-[0_0_12px_rgba(255,255,255,0.18)]'
                              : 'bg-[#07080f] border-white/10 text-[#a2a9c8] hover:border-white/25'
                          }`}
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-sm shrink-0"
                            style={{ backgroundColor: item.color }}
                          />
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {authError && (
                <div className="rounded-xl bg-[#fb7185]/12 border border-[#fb7185]/40 px-3 py-2 text-xs text-[#fb7185]">
                  {authError}
                </div>
              )}

              <button
                type="submit"
                disabled={authBusy}
                className="mt-1 w-full py-3.5 px-6 rounded-xl text-sm font-extrabold tracking-widest uppercase text-[#06070d] shadow-[0_0_24px_rgba(0,240,255,0.28)] hover:shadow-[0_0_32px_rgba(0,240,255,0.48)] active:scale-[0.98] transition-all cursor-pointer disabled:opacity-60"
                style={{
                  background: 'linear-gradient(135deg, #00f0ff 0%, #5b6cff 55%, #ff2a85 100%)',
                }}
              >
                {authMode === 'register' ? 'REGISTER & PLAY' : 'SIGN IN & PLAY'}
              </button>
            </form>
          </div>
        </section>
      )}

      {/* MAIN MENU */}
      {screen === 'menu' && (
        <section
          aria-label="Main Menu"
          className="relative z-10 w-full h-full flex items-center justify-center p-5 overflow-y-auto"
        >
          <div className="w-full max-w-[520px] flex flex-col items-center text-center gap-5">
            {activeProfile && (
              <div className="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-[#101220]/90 border border-white/10">
                <div className="flex items-center gap-2.5 min-w-0 text-left">
                  <span
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black text-[#06070d] shrink-0"
                    style={{ backgroundColor: activeProfile.accent }}
                  >
                    {activeProfile.username.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">
                      {activeProfile.username}
                    </div>
                    <div className="text-[11px] text-[#6c7496] truncate">
                      {activeProfile.email}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="px-2.5 py-1.5 rounded-lg border border-white/10 hover:border-[#fb7185]/50 text-[11px] font-bold tracking-wider uppercase text-[#a2a9c8] hover:text-[#fb7185] flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Switch
                </button>
              </div>
            )}
            <div className="flex flex-col items-center gap-2.5">
              <div className="flex items-end gap-1.5 h-7 mb-1" aria-hidden="true">
                <div className="w-1.5 h-3.5 rounded bg-[#00f0ff] eq-bar-1" />
                <div className="w-1.5 h-6.5 rounded bg-[#a855f7] eq-bar-2" />
                <div className="w-1.5 h-4.5 rounded bg-[#ff2a85] eq-bar-3" />
                <div className="w-1.5 h-7 rounded bg-[#00f0ff] eq-bar-4" />
                <div className="w-1.5 h-4 rounded bg-[#ff2a85] eq-bar-5" />
              </div>
              <h1
                className="text-4xl sm:text-5xl font-black tracking-wider leading-tight bg-clip-text text-transparent"
                style={{
                  backgroundImage:
                    'linear-gradient(95deg, #ffffff 10%, #00f0ff 48%, #ff2a85 92%)',
                }}
              >
                BEAT THE RHYTHM
              </h1>
              <p className="text-xs sm:text-sm text-[#a2a9c8] tracking-[0.18em] uppercase">
                4-Lane Neon Music Arcade
              </p>
            </div>

            <div className="w-full grid grid-cols-2 gap-3">
              <div className="bg-[#101220]/85 border border-white/10 rounded-xl p-4 flex flex-col gap-1">
                <span className="text-[11px] text-[#6c7496] tracking-widest uppercase">
                  Best Score
                </span>
                <span className="font-mono tabular-nums text-2xl font-bold text-[#f5f7ff]">
                  {topScore.toLocaleString()}
                </span>
              </div>
              <div className="bg-[#101220]/85 border border-white/10 rounded-xl p-4 flex flex-col gap-1">
                <span className="text-[11px] text-[#6c7496] tracking-widest uppercase">
                  Songs Completed
                </span>
                <span className="font-mono tabular-nums text-2xl font-bold text-[#f5f7ff]">
                  {saveState.songsCompleted}
                </span>
              </div>
            </div>

            <div className="w-full flex flex-col gap-3">
              <button
                type="button"
                onClick={() => startGame(selectedTrackId, selectedDiff)}
                className="w-full py-4 px-7 rounded-xl text-lg font-extrabold tracking-widest uppercase text-[#06070d] shadow-[0_0_24px_rgba(0,240,255,0.28)] hover:shadow-[0_0_32px_rgba(0,240,255,0.48)] active:scale-[0.98] transition-all cursor-pointer"
                style={{
                  background: 'linear-gradient(135deg, #00f0ff 0%, #5b6cff 55%, #ff2a85 100%)',
                }}
              >
                PLAY
              </button>
              <p className="text-sm text-[#a2a9c8]">
                Selected:{' '}
                <strong className="text-[#00f0ff] font-semibold">
                  {selectedTrack.name} — {selectedDiff.toUpperCase()}
                </strong>
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => navigate('songs')}
                  className="py-3 px-4 rounded-xl bg-[#171a2d] border border-white/10 hover:border-[#00f0ff]/50 text-sm font-bold tracking-wider uppercase transition-colors cursor-pointer whitespace-nowrap"
                >
                  SONG SELECT
                </button>
                <button
                  type="button"
                  onClick={() => navigate('howto')}
                  className="py-3 px-4 rounded-xl bg-[#171a2d] border border-white/10 hover:border-[#00f0ff]/50 text-sm font-bold tracking-wider uppercase transition-colors cursor-pointer whitespace-nowrap"
                >
                  HOW TO PLAY
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSettingsReturn('menu');
                  navigate('settings');
                }}
                className="w-full py-3 px-4 rounded-xl bg-[#171a2d] border border-white/10 hover:border-[#00f0ff]/50 text-sm font-bold tracking-wider uppercase transition-colors cursor-pointer"
              >
                SETTINGS
              </button>
              <PWAInstallButton />
              <StandaloneHtmlExport />
            </div>
          </div>
        </section>
      )}

      {/* SONG SELECT */}
      {screen === 'songs' && (
        <section
          aria-label="Song Select"
          className="relative z-10 w-full h-full flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
        >
          <div className="w-full max-w-[780px] bg-[#101220]/90 border border-white/10 rounded-2xl p-5 sm:p-7 shadow-2xl backdrop-blur-md">
            <div className="flex items-center justify-between gap-4 pb-4 mb-5 border-b border-white/10">
              <h2 className="text-xl sm:text-2xl font-bold tracking-wider">SONG SELECT</h2>
              <button
                type="button"
                onClick={() => navigate('menu')}
                className="px-4 py-2 rounded-lg border border-white/10 text-xs font-bold tracking-wider uppercase text-[#a2a9c8] hover:text-white hover:border-white/25 cursor-pointer"
              >
                BACK
              </button>
            </div>

            <div
              className="inline-flex p-1 bg-[#07080f] border border-white/10 rounded-xl gap-1 mb-5"
              role="tablist"
              aria-label="Difficulty"
            >
              {(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => {
                const active = selectedDiff === d;
                const activeClass =
                  d === 'easy'
                    ? 'bg-[#34d399]/15 text-[#34d399] ring-1 ring-[#34d399]/40'
                    : d === 'normal'
                      ? 'bg-[#00f0ff]/15 text-[#00f0ff] ring-1 ring-[#00f0ff]/40'
                      : 'bg-[#ff2a85]/15 text-[#ff2a85] ring-1 ring-[#ff2a85]/40';
                return (
                  <button
                    key={d}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setSelectedDiff(d)}
                    className={`px-4 py-2 rounded-lg text-xs font-bold tracking-wider uppercase transition-colors cursor-pointer ${
                      active ? activeClass : 'text-[#a2a9c8] hover:text-white'
                    }`}
                  >
                    {d.toUpperCase()}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col gap-3 mb-6">
              {TRACKS.map((track) => {
                const isSelected = track.id === selectedTrackId;
                const isPreviewing = previewingTrackId === track.id;
                const best = saveState.bestScores[getBestKey(track.id, selectedDiff)];
                return (
                  <div
                    key={track.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedTrackId(track.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedTrackId(track.id);
                      }
                    }}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'border-[#00f0ff] bg-gradient-to-r from-[#00f0ff]/10 to-[#9d4edd]/10 shadow-[0_0_24px_rgba(0,240,255,0.12)]'
                        : 'border-white/10 bg-[#171a2d] hover:border-white/25'
                    }`}
                  >
                    <div className="flex flex-col gap-1">
                      <div className="text-lg font-bold text-white">{track.name}</div>
                      <div className="text-xs sm:text-sm text-[#a2a9c8] flex flex-wrap items-center gap-1.5">
                        <span>{track.genre}</span>
                        <span className="text-[#6c7496]">·</span>
                        <span>{track.bpm} BPM</span>
                        <span className="text-[#6c7496]">·</span>
                        <span>{track.diffLabels[selectedDiff]}</span>
                        <span className="text-[#6c7496]">·</span>
                        <span>{formatTime(track.duration)}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                      <div className="sm:text-right font-mono tabular-nums">
                        {best ? (
                          <>
                            <div className="text-sm font-bold text-white">
                              {best.score.toLocaleString()}
                            </div>
                            <div className="text-xs text-[#6c7496]">
                              Grade {best.grade} · {best.accuracy.toFixed(1)}%
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="text-sm font-bold text-white">—</div>
                            <div className="text-xs text-[#6c7496]">No record</div>
                          </>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTrackId(track.id);
                          const audio = audioRef.current!;
                          if (previewingTrackId === track.id) {
                            audio.stopPreview();
                            setPreviewingTrackId(null);
                          } else {
                            setPreviewingTrackId(track.id);
                            audio.startPreview(track, saveRef.current.settings, () =>
                              setPreviewingTrackId(null)
                            );
                          }
                        }}
                        className={`px-3.5 py-2 rounded-lg text-xs font-bold tracking-wider uppercase border transition-colors cursor-pointer ${
                          isPreviewing
                            ? 'bg-[#ff2a85]/20 border-[#ff2a85] text-white'
                            : 'bg-white/5 border-white/10 text-[#f5f7ff] hover:border-white/30'
                        }`}
                      >
                        {isPreviewing ? 'STOP' : 'PREVIEW'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-4">
              <span className="text-xs sm:text-sm text-[#a2a9c8]">
                {selectedTrack.name} · {selectedDiff.toUpperCase()} ·{' '}
                {formatTime(selectedTrack.duration)}
              </span>
              <button
                type="button"
                onClick={() => startGame(selectedTrackId, selectedDiff)}
                className="px-6 py-3 rounded-xl font-bold text-sm tracking-wider uppercase text-[#06070d] cursor-pointer whitespace-nowrap"
                style={{
                  background: 'linear-gradient(135deg, #00f0ff 0%, #5b6cff 55%, #ff2a85 100%)',
                }}
              >
                PLAY TRACK
              </button>
            </div>
          </div>
        </section>
      )}

      {/* HOW TO PLAY */}
      {screen === 'howto' && (
        <section
          aria-label="How To Play"
          className="relative z-10 w-full h-full flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
        >
          <div className="w-full max-w-[780px] bg-[#101220]/90 border border-white/10 rounded-2xl p-5 sm:p-7 shadow-2xl backdrop-blur-md">
            <div className="flex items-center justify-between gap-4 pb-4 mb-5 border-b border-white/10">
              <h2 className="text-xl sm:text-2xl font-bold tracking-wider">HOW TO PLAY</h2>
              <button
                type="button"
                onClick={() => navigate('menu')}
                className="px-4 py-2 rounded-lg border border-white/10 text-xs font-bold tracking-wider uppercase text-[#a2a9c8] hover:text-white cursor-pointer"
              >
                BACK
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="bg-[#171a2d] border border-white/10 rounded-xl p-4 flex flex-col gap-3">
                <h3 className="text-sm font-bold tracking-wider text-[#00f0ff]">CONTROLS</h3>
                <p className="text-sm text-[#a2a9c8] leading-relaxed">
                  Press the matching key or tap the bottom lane pad right when a falling note
                  reaches the glowing hit line.
                </p>
                <div className="flex gap-2 my-1">
                  {saveState.settings.keyBindings.map((k, idx) => (
                    <div
                      key={idx}
                      className="flex-1 h-11 rounded-lg bg-[#07080f] border border-white/20 flex items-center justify-center font-mono font-bold text-base text-white"
                    >
                      {formatKeyLabel(k)}
                    </div>
                  ))}
                </div>
                <p className="text-sm text-[#a2a9c8] leading-relaxed">
                  Press <strong className="text-white">ESC</strong> or{' '}
                  <strong className="text-white">P</strong> anytime during a song to pause. Touch
                  controls are always active at the bottom on mobile and tablet.
                </p>
              </div>

              <div className="bg-[#171a2d] border border-white/10 rounded-xl p-4 flex flex-col gap-3">
                <h3 className="text-sm font-bold tracking-wider text-[#00f0ff]">
                  TIMING &amp; SCORING
                </h3>
                <ul className="flex flex-col gap-2 font-mono text-xs sm:text-sm">
                  <li className="flex justify-between">
                    <span className="text-[#00f0ff] font-bold">PERFECT (≤ 40ms)</span>
                    <span className="text-[#a2a9c8]">300 pts · 100%</span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-[#34d399] font-bold">GREAT (≤ 80ms)</span>
                    <span className="text-[#a2a9c8]">200 pts · 75%</span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-[#fbbf24] font-bold">GOOD (≤ 130ms)</span>
                    <span className="text-[#a2a9c8]">100 pts · 40%</span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-[#fb7185] font-bold">MISS (&gt; 130ms)</span>
                    <span className="text-[#a2a9c8]">0 pts · Reset Combo</span>
                  </li>
                </ul>
                <p className="text-sm text-[#a2a9c8] leading-relaxed">
                  Consecutive hits build your <strong className="text-white">Combo</strong> for
                  bonus points. Accuracy determines your final Grade (
                  <strong className="text-white">S / A / B / C / D</strong>).
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <span className="text-xs sm:text-sm text-[#a2a9c8]">
                Tip: Tune Audio Offset in Settings if notes feel early or late.
              </span>
              <button
                type="button"
                onClick={() => startGame(selectedTrackId, selectedDiff)}
                className="px-6 py-3 rounded-xl font-bold text-sm tracking-wider uppercase text-[#06070d] cursor-pointer whitespace-nowrap"
                style={{
                  background: 'linear-gradient(135deg, #00f0ff 0%, #5b6cff 55%, #ff2a85 100%)',
                }}
              >
                PLAY NOW
              </button>
            </div>
          </div>
        </section>
      )}

      {/* SETTINGS */}
      {screen === 'settings' && (
        <section
          aria-label="Settings"
          className="relative z-10 w-full h-full flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
        >
          <div className="w-full max-w-[780px] bg-[#101220]/90 border border-white/10 rounded-2xl p-5 sm:p-7 shadow-2xl backdrop-blur-md">
            <div className="flex items-center justify-between gap-4 pb-4 mb-5 border-b border-white/10">
              <h2 className="text-xl sm:text-2xl font-bold tracking-wider">SETTINGS</h2>
              <button
                type="button"
                onClick={() => {
                  setListeningLaneBind(-1);
                  if (settingsReturn === 'pause' && gameRef.current.active) {
                    setIsPaused(true);
                    navigate('gameplay');
                  } else {
                    navigate('menu');
                  }
                }}
                className="px-4 py-2 rounded-lg border border-white/10 text-xs font-bold tracking-wider uppercase text-[#a2a9c8] hover:text-white cursor-pointer"
              >
                BACK
              </button>
            </div>

            <div className="flex flex-col gap-3 max-h-[56vh] overflow-y-auto pr-1 mb-6">
              {/* Master Volume */}
              <div className="flex items-center justify-between gap-4 p-3.5 rounded-xl bg-[#171a2d] border border-white/10">
                <div>
                  <div className="text-sm font-semibold">Master Volume</div>
                  <div className="text-xs text-[#6c7496]">Overall game audio output</div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={saveState.settings.masterVol}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      updateSave((prev) => {
                        const next = {
                          ...prev,
                          settings: { ...prev.settings, masterVol: val },
                        };
                        audioRef.current?.applyVolumes(next.settings);
                        return next;
                      });
                    }}
                    className="w-28 sm:w-36 accent-[#00f0ff] cursor-pointer"
                  />
                  <span className="w-12 text-right font-mono tabular-nums text-sm text-[#00f0ff]">
                    {saveState.settings.masterVol}%
                  </span>
                </div>
              </div>

              {/* Music Volume */}
              <div className="flex items-center justify-between gap-4 p-3.5 rounded-xl bg-[#171a2d] border border-white/10">
                <div>
                  <div className="text-sm font-semibold">Music Volume</div>
                  <div className="text-xs text-[#6c7496]">Synthesized beat, bass &amp; melody</div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={saveState.settings.musicVol}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      updateSave((prev) => {
                        const next = {
                          ...prev,
                          settings: { ...prev.settings, musicVol: val },
                        };
                        audioRef.current?.applyVolumes(next.settings);
                        return next;
                      });
                    }}
                    className="w-28 sm:w-36 accent-[#00f0ff] cursor-pointer"
                  />
                  <span className="w-12 text-right font-mono tabular-nums text-sm text-[#00f0ff]">
                    {saveState.settings.musicVol}%
                  </span>
                </div>
              </div>

              {/* SFX Volume */}
              <div className="flex items-center justify-between gap-4 p-3.5 rounded-xl bg-[#171a2d] border border-white/10">
                <div>
                  <div className="text-sm font-semibold">SFX Volume</div>
                  <div className="text-xs text-[#6c7496]">Note hit feedback sounds</div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={saveState.settings.sfxVol}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      updateSave((prev) => {
                        const next = { ...prev, settings: { ...prev.settings, sfxVol: val } };
                        audioRef.current?.applyVolumes(next.settings);
                        return next;
                      });
                    }}
                    className="w-28 sm:w-36 accent-[#00f0ff] cursor-pointer"
                  />
                  <span className="w-12 text-right font-mono tabular-nums text-sm text-[#00f0ff]">
                    {saveState.settings.sfxVol}%
                  </span>
                </div>
              </div>

              {/* Mute */}
              <div className="flex items-center justify-between gap-4 p-3.5 rounded-xl bg-[#171a2d] border border-white/10">
                <div>
                  <div className="text-sm font-semibold">Mute All Audio</div>
                  <div className="text-xs text-[#6c7496]">Silence music and sound effects</div>
                </div>
                <button
                  type="button"
                  onClick={handleToggleMute}
                  className={`min-w-[72px] py-1.5 px-3.5 rounded-lg text-xs font-bold border cursor-pointer ${
                    saveState.settings.muted
                      ? 'bg-[#00f0ff]/15 border-[#00f0ff] text-[#00f0ff]'
                      : 'bg-[#07080f] border-white/10 text-[#a2a9c8]'
                  }`}
                >
                  {saveState.settings.muted ? 'ON' : 'OFF'}
                </button>
              </div>

              {/* Note Speed */}
              <div className="flex items-center justify-between gap-4 p-3.5 rounded-xl bg-[#171a2d] border border-white/10">
                <div>
                  <div className="text-sm font-semibold">Note Speed</div>
                  <div className="text-xs text-[#6c7496]">Scroll speed of falling notes</div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <input
                    type="range"
                    min={1.0}
                    max={2.5}
                    step={0.1}
                    value={saveState.settings.noteSpeed}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      updateSave((prev) => ({
                        ...prev,
                        settings: { ...prev.settings, noteSpeed: val },
                      }));
                    }}
                    className="w-28 sm:w-36 accent-[#00f0ff] cursor-pointer"
                  />
                  <span className="w-12 text-right font-mono tabular-nums text-sm text-[#00f0ff]">
                    {saveState.settings.noteSpeed.toFixed(1)}x
                  </span>
                </div>
              </div>

              {/* Audio Offset */}
              <div className="flex items-center justify-between gap-4 p-3.5 rounded-xl bg-[#171a2d] border border-white/10">
                <div>
                  <div className="text-sm font-semibold">Audio Offset (Calibration)</div>
                  <div className="text-xs text-[#6c7496]">
                    Shift note timing relative to audio (-150 to +150ms)
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <input
                    type="range"
                    min={-150}
                    max={150}
                    step={5}
                    value={saveState.settings.audioOffsetMs}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      updateSave((prev) => ({
                        ...prev,
                        settings: { ...prev.settings, audioOffsetMs: val },
                      }));
                    }}
                    className="w-28 sm:w-36 accent-[#00f0ff] cursor-pointer"
                  />
                  <span className="w-14 text-right font-mono tabular-nums text-sm text-[#00f0ff]">
                    {saveState.settings.audioOffsetMs > 0 ? '+' : ''}
                    {saveState.settings.audioOffsetMs}ms
                  </span>
                </div>
              </div>

              {/* Key Bindings */}
              <div className="flex flex-wrap items-center justify-between gap-4 p-3.5 rounded-xl bg-[#171a2d] border border-white/10">
                <div>
                  <div className="text-sm font-semibold">Key Bindings</div>
                  <div className="text-xs text-[#6c7496]">
                    Click a lane box then press a key to rebind
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {saveState.settings.keyBindings.map((k, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() =>
                        setListeningLaneBind((prev) => (prev === idx ? -1 : idx))
                      }
                      className={`w-11 h-9 rounded-lg font-mono font-bold text-sm border cursor-pointer ${
                        listeningLaneBind === idx
                          ? 'bg-[#07080f] border-[#ff2a85] text-[#ff2a85] shadow-[0_0_12px_rgba(255,42,133,0.35)]'
                          : 'bg-[#07080f] border-white/20 text-white hover:border-[#00f0ff]'
                      }`}
                    >
                      {formatKeyLabel(k)}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setListeningLaneBind(-1);
                      updateSave((prev) => ({
                        ...prev,
                        settings: { ...prev.settings, keyBindings: [...DEFAULT_KEYS] },
                      }));
                    }}
                    className="px-2.5 py-2 rounded-lg border border-white/10 text-[11px] font-bold text-[#a2a9c8] hover:text-white cursor-pointer"
                  >
                    RESET
                  </button>
                </div>
              </div>

              {/* Visual Effects */}
              <div className="flex items-center justify-between gap-4 p-3.5 rounded-xl bg-[#171a2d] border border-white/10">
                <div>
                  <div className="text-sm font-semibold">Visual Effects</div>
                  <div className="text-xs text-[#6c7496]">
                    Particles, shockwaves &amp; background visualizer
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateSave((prev) => ({
                      ...prev,
                      settings: { ...prev.settings, vfxEnabled: !prev.settings.vfxEnabled },
                    }))
                  }
                  className={`min-w-[72px] py-1.5 px-3.5 rounded-lg text-xs font-bold border cursor-pointer ${
                    saveState.settings.vfxEnabled
                      ? 'bg-[#00f0ff]/15 border-[#00f0ff] text-[#00f0ff]'
                      : 'bg-[#07080f] border-white/10 text-[#a2a9c8]'
                  }`}
                >
                  {saveState.settings.vfxEnabled ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <button
                type="button"
                onClick={() => {
                  updateSave((prev) => ({ ...prev, bestScores: {}, songsCompleted: 0 }));
                  setClearedBanner(true);
                  setTimeout(() => setClearedBanner(false), 1200);
                }}
                className="px-3.5 py-2 rounded-lg bg-[#fb7185]/15 border border-[#fb7185]/40 text-[#fb7185] text-xs font-bold tracking-wider uppercase cursor-pointer"
              >
                {clearedBanner ? 'CLEARED' : 'RESET SCORES'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setListeningLaneBind(-1);
                  if (settingsReturn === 'pause' && gameRef.current.active) {
                    setIsPaused(true);
                    navigate('gameplay');
                  } else {
                    navigate('menu');
                  }
                }}
                className="px-6 py-2.5 rounded-xl font-bold text-sm tracking-wider uppercase text-[#06070d] cursor-pointer"
                style={{
                  background: 'linear-gradient(135deg, #00f0ff 0%, #5b6cff 55%, #ff2a85 100%)',
                }}
              >
                DONE
              </button>
            </div>
          </div>
        </section>
      )}

      {/* GAMEPLAY */}
      {screen === 'gameplay' && (
        <section
          aria-label="Gameplay"
          className="relative z-10 w-full h-full flex flex-col overflow-hidden touch-none"
        >
          <header className="w-full flex items-center justify-between gap-3 px-4 py-2.5 bg-gradient-to-b from-[#07080f]/95 to-[#07080f]/60 border-b border-white/10 shrink-0">
            <div className="flex flex-col gap-1 min-w-[115px] max-w-[260px]">
              <div className="text-sm font-bold text-white truncate">{selectedTrack.name}</div>
              <div className="text-[11px] text-[#a2a9c8] font-mono tabular-nums">
                {selectedDiff.toUpperCase()} · {formatTime(hud.songTime)} /{' '}
                {formatTime(hud.duration)}
              </div>
              <div className="w-full h-1.5 bg-white/10 rounded overflow-hidden">
                <div
                  className="h-full rounded transition-[width] duration-75 ease-linear"
                  style={{
                    width: `${Math.min(100, (hud.songTime / hud.duration) * 100).toFixed(2)}%`,
                    background: 'linear-gradient(90deg, #00f0ff, #a855f7, #ff2a85)',
                  }}
                />
              </div>
            </div>

            <div className="flex items-center gap-4 sm:gap-6">
              <div className="flex flex-col items-center">
                <span className="text-[10px] tracking-widest uppercase text-[#6c7496]">Score</span>
                <span className="font-mono tabular-nums text-base sm:text-xl font-bold">
                  {hud.score.toLocaleString()}
                </span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[10px] tracking-widest uppercase text-[#6c7496]">
                  Accuracy
                </span>
                <span className="font-mono tabular-nums text-base sm:text-xl font-bold">
                  {hud.accuracy.toFixed(1)}%
                </span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[10px] tracking-widest uppercase text-[#6c7496]">
                  Best Combo
                </span>
                <span className="font-mono tabular-nums text-base sm:text-xl font-bold">
                  {hud.bestCombo}
                </span>
              </div>
              <div className="hidden md:flex items-center gap-3 font-mono tabular-nums text-xs">
                <div className="flex flex-col items-center">
                  <span className="text-[10px] text-[#6c7496]">PERF</span>
                  <span className="text-[#00f0ff] font-bold">{hud.counts.PERFECT}</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-[10px] text-[#6c7496]">GREAT</span>
                  <span className="text-[#34d399] font-bold">{hud.counts.GREAT}</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-[10px] text-[#6c7496]">GOOD</span>
                  <span className="text-[#fbbf24] font-bold">{hud.counts.GOOD}</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-[10px] text-[#6c7496]">MISS</span>
                  <span className="text-[#fb7185] font-bold">{hud.counts.MISS}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleToggleMute}
                className="px-3 py-2 rounded-lg text-xs font-bold tracking-wider bg-white/5 border border-white/10 hover:border-[#00f0ff] cursor-pointer"
              >
                {saveState.settings.muted ? 'UNMUTE' : 'MUTE'}
              </button>
              <button
                type="button"
                onClick={() => (isPaused ? void resumeGame() : void pauseGame())}
                className="px-3 py-2 rounded-lg text-xs font-bold tracking-wider bg-white/5 border border-white/10 hover:border-[#00f0ff] cursor-pointer"
              >
                PAUSE
              </button>
            </div>
          </header>

          <div ref={stageRef} className="relative flex-1 w-full min-h-0 overflow-hidden">
            <canvas
              ref={canvasRef}
              onPointerDown={(e) => {
                if (!gameRef.current.active || gameRef.current.paused) return;
                e.preventDefault();
                const rect = e.currentTarget.getBoundingClientRect();
                const m = getHighwayMetrics(rect.width, rect.height);
                const x = e.clientX - rect.left;
                const lane = Math.floor((x - m.hwLeft) / m.laneW);
                if (lane >= 0 && lane < 4) {
                  activeCanvasPointers.current.set(e.pointerId, lane);
                  handleLanePress(lane);
                }
              }}
              onPointerUp={(e) => {
                const lane = activeCanvasPointers.current.get(e.pointerId);
                if (lane !== undefined) {
                  activeCanvasPointers.current.delete(e.pointerId);
                  handleLaneRelease(lane);
                }
              }}
              onPointerCancel={(e) => {
                const lane = activeCanvasPointers.current.get(e.pointerId);
                if (lane !== undefined) {
                  activeCanvasPointers.current.delete(e.pointerId);
                  handleLaneRelease(lane);
                }
              }}
              className="block w-full h-full touch-none"
            />
          </div>

          <div className="w-full flex justify-center px-3 py-2.5 bg-[#07080f]/95 border-t border-white/10 shrink-0 touch-none">
            <div className="w-full max-w-[480px] grid grid-cols-4 gap-2">
              {saveState.settings.keyBindings.map((keyChar, laneIdx) => {
                const active = laneActiveUi[laneIdx];
                const col = LANE_COLORS[laneIdx];
                return (
                  <button
                    key={laneIdx}
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      try {
                        e.currentTarget.setPointerCapture(e.pointerId);
                      } catch {
                        // Ignore
                      }
                      handleLanePress(laneIdx);
                    }}
                    onPointerUp={(e) => {
                      e.preventDefault();
                      handleLaneRelease(laneIdx);
                    }}
                    onPointerCancel={(e) => {
                      e.preventDefault();
                      handleLaneRelease(laneIdx);
                    }}
                    style={
                      active
                        ? {
                            backgroundColor: hexAlpha(col, 0.26),
                            borderColor: col,
                            color: '#ffffff',
                            boxShadow: `0 0 22px ${hexAlpha(col, 0.45)}`,
                            transform: 'translateY(2px)',
                          }
                        : undefined
                    }
                    className="h-16 sm:h-[62px] rounded-xl bg-[#131629] border border-white/15 text-[#a2a9c8] font-mono text-lg font-extrabold uppercase flex items-center justify-center touch-none transition-transform duration-75"
                  >
                    {formatKeyLabel(keyChar)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* PAUSE MODAL */}
          {isPaused && (
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Game Paused"
              className="absolute inset-0 z-20 bg-[#05060c]/80 backdrop-blur-md flex items-center justify-center p-5"
            >
              <div className="w-full max-w-[360px] bg-[#101220] border border-white/20 rounded-2xl p-6 flex flex-col gap-3.5 text-center shadow-2xl">
                <h2 className="text-2xl font-bold tracking-widest mb-1">PAUSED</h2>
                <button
                  type="button"
                  onClick={() => void resumeGame()}
                  className="py-3 px-6 rounded-xl font-bold text-sm tracking-wider uppercase text-[#06070d] cursor-pointer"
                  style={{
                    background: 'linear-gradient(135deg, #00f0ff 0%, #5b6cff 55%, #ff2a85 100%)',
                  }}
                >
                  RESUME
                </button>
                <button
                  type="button"
                  onClick={() => startGame(gameRef.current.track.id, gameRef.current.diff)}
                  className="py-3 px-6 rounded-xl bg-[#171a2d] border border-white/10 hover:border-[#00f0ff]/50 text-sm font-bold tracking-wider uppercase cursor-pointer"
                >
                  RESTART
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSettingsReturn('pause');
                    setIsPaused(false);
                    navigate('settings');
                  }}
                  className="py-3 px-6 rounded-xl bg-[#171a2d] border border-white/10 hover:border-[#00f0ff]/50 text-sm font-bold tracking-wider uppercase cursor-pointer"
                >
                  SETTINGS
                </button>
                <button
                  type="button"
                  onClick={() => void quitToScreen('menu')}
                  className="py-2.5 px-6 rounded-xl border border-white/10 text-xs font-bold tracking-wider uppercase text-[#a2a9c8] hover:text-white cursor-pointer"
                >
                  MAIN MENU
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* RESULT SCREEN */}
      {screen === 'result' && resultData && (
        <section
          aria-label="Results"
          className="relative z-10 w-full h-full flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
        >
          <div className="w-full max-w-[640px] bg-[#101220]/90 border border-white/10 rounded-2xl p-5 sm:p-7 shadow-2xl backdrop-blur-md">
            <div className="pb-4 mb-5 border-b border-white/10">
              <h2 className="text-2xl font-bold tracking-wider">{resultData.track.name}</h2>
              <p className="text-xs sm:text-sm text-[#a2a9c8] mt-1">
                {resultData.diff.toUpperCase()} · {resultData.track.genre} · {resultData.track.bpm}{' '}
                BPM
              </p>
            </div>

            <div className="flex items-center justify-between gap-5 p-4 sm:p-5 rounded-xl bg-[#171a2d] border border-white/10 mb-4">
              <div
                className={`w-20 h-20 rounded-xl flex items-center justify-center text-5xl font-black border-2 shrink-0 ${
                  resultData.grade === 'S'
                    ? 'border-[#00f0ff] text-[#00f0ff] bg-[#00f0ff]/10'
                    : resultData.grade === 'A'
                      ? 'border-[#34d399] text-[#34d399] bg-[#34d399]/10'
                      : resultData.grade === 'B'
                        ? 'border-[#a855f7] text-[#a855f7] bg-[#a855f7]/10'
                        : resultData.grade === 'C'
                          ? 'border-[#fbbf24] text-[#fbbf24] bg-[#fbbf24]/10'
                          : 'border-[#fb7185] text-[#fb7185] bg-[#fb7185]/10'
                }`}
              >
                {resultData.grade}
              </div>
              <div className="flex-1 flex flex-col gap-0.5">
                {resultData.isNewBest && (
                  <span className="text-xs font-bold tracking-widest text-[#fbbf24] uppercase">
                    NEW PERSONAL BEST
                  </span>
                )}
                <span className="text-[11px] text-[#6c7496] tracking-widest uppercase">
                  Final Score
                </span>
                <span className="font-mono tabular-nums text-3xl sm:text-4xl font-extrabold">
                  {resultData.score.toLocaleString()}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2.5 mb-3">
              <div className="bg-[#171a2d] border border-white/10 rounded-xl p-3 text-center">
                <div className="text-[11px] text-[#6c7496] uppercase tracking-wider mb-1">
                  Accuracy
                </div>
                <div className="font-mono tabular-nums text-lg font-bold text-[#00f0ff]">
                  {resultData.accuracy.toFixed(1)}%
                </div>
              </div>
              <div className="bg-[#171a2d] border border-white/10 rounded-xl p-3 text-center">
                <div className="text-[11px] text-[#6c7496] uppercase tracking-wider mb-1">
                  Max Combo
                </div>
                <div className="font-mono tabular-nums text-lg font-bold text-[#a855f7]">
                  {resultData.maxCombo}
                </div>
              </div>
              <div className="bg-[#171a2d] border border-white/10 rounded-xl p-3 text-center">
                <div className="text-[11px] text-[#6c7496] uppercase tracking-wider mb-1">
                  Best Saved
                </div>
                <div className="font-mono tabular-nums text-lg font-bold">
                  {resultData.savedBestScore.toLocaleString()}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-6">
              <div className="bg-[#171a2d] border border-white/10 rounded-xl p-3 text-center">
                <div className="text-[11px] text-[#6c7496] uppercase tracking-wider mb-1">
                  Perfect
                </div>
                <div className="font-mono tabular-nums text-lg font-bold text-[#00f0ff]">
                  {resultData.counts.PERFECT}
                </div>
              </div>
              <div className="bg-[#171a2d] border border-white/10 rounded-xl p-3 text-center">
                <div className="text-[11px] text-[#6c7496] uppercase tracking-wider mb-1">
                  Great
                </div>
                <div className="font-mono tabular-nums text-lg font-bold text-[#34d399]">
                  {resultData.counts.GREAT}
                </div>
              </div>
              <div className="bg-[#171a2d] border border-white/10 rounded-xl p-3 text-center">
                <div className="text-[11px] text-[#6c7496] uppercase tracking-wider mb-1">
                  Good
                </div>
                <div className="font-mono tabular-nums text-lg font-bold text-[#fbbf24]">
                  {resultData.counts.GOOD}
                </div>
              </div>
              <div className="bg-[#171a2d] border border-white/10 rounded-xl p-3 text-center">
                <div className="text-[11px] text-[#6c7496] uppercase tracking-wider mb-1">
                  Miss
                </div>
                <div className="font-mono tabular-nums text-lg font-bold text-[#fb7185]">
                  {resultData.counts.MISS}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => navigate('menu')}
                className="px-4 py-2.5 rounded-xl border border-white/10 text-xs font-bold tracking-wider uppercase text-[#a2a9c8] hover:text-white cursor-pointer"
              >
                MAIN MENU
              </button>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => navigate('songs')}
                  className="px-4 py-2.5 rounded-xl bg-[#171a2d] border border-white/10 hover:border-[#00f0ff]/50 text-xs font-bold tracking-wider uppercase cursor-pointer"
                >
                  SONG SELECT
                </button>
                <button
                  type="button"
                  onClick={() => startGame(resultData.track.id, resultData.diff)}
                  className="px-6 py-2.5 rounded-xl font-bold text-xs sm:text-sm tracking-wider uppercase text-[#06070d] cursor-pointer"
                  style={{
                    background: 'linear-gradient(135deg, #00f0ff 0%, #5b6cff 55%, #ff2a85 100%)',
                  }}
                >
                  RETRY
                </button>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
