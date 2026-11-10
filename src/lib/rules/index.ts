export const RULES_VERSION = '2026.11-2';

export type Muscle = 'chest' | 'back' | 'front_delt' | 'side_delt' | 'rear_delt'
  | 'biceps' | 'triceps' | 'quads' | 'hamstrings' | 'glutes';
export type LoadType = 'barbell' | 'dumbbell_pair' | 'dumbbell_single' | 'machine'
  | 'cable' | 'bodyweight' | 'assisted';

export interface Exercise {
  code: string; primaryMuscle: Muscle; secondaryMuscles: Muscle[];
  loadType: LoadType; incrementKg: number;
  isCompound: boolean; unilateral: boolean; loadsLowerBack: boolean;
}
export interface LoggedSet { setNo: number; weightKg: number; reps: number; rir: number | null; side: 'both' | 'left' | 'right'; }
export interface Planned { sets: number; repMin: number; repMax: number; targetRir: number; targetWeightKg: number | null; }

// ---- 基本計算 ----
export function effectiveLoad(ex: Exercise, s: LoggedSet, bodyweightKg: number): number {
  switch (ex.loadType) {
    case 'dumbbell_pair': return s.weightKg * 2;            // weightKg 填單支
    case 'bodyweight':    return bodyweightKg + s.weightKg;  // weightKg 填掛重
    case 'assisted':      return Math.max(bodyweightKg - s.weightKg, 0);
    default:              return s.weightKg;
  }
}
export const setVolume = (ex: Exercise, s: LoggedSet, bw: number) => effectiveLoad(ex, s, bw) * s.reps;
export const e1rm = (loadKg: number, reps: number, rir: number) => loadKg * (1 + (reps + rir) / 30);
export const roundTo = (x: number, step: number) => Math.round(x / step) * step;

export function progressStatus(curr: number, prev: number | null): 'new' | 'up' | 'flat' | 'down' {
  if (prev == null) return 'new';
  const d = (curr - prev) / prev;
  return d >= 0.01 ? 'up' : d <= -0.02 ? 'down' : 'flat';
}

// 有效組數：RIR ≤ 3 才算；單手動作左右合算 1 組；主要肌群 1、輔助肌群 0.5
export function fractionalSets(ex: Exercise, sets: LoggedSet[]): Partial<Record<Muscle, number>> {
  const valid = new Set(sets.filter(s => (s.rir ?? 0) <= 3).map(s => s.setNo)).size;
  const out: Partial<Record<Muscle, number>> = { [ex.primaryMuscle]: valid };
  for (const m of ex.secondaryMuscles) out[m] = (out[m] ?? 0) + valid * 0.5;
  return out;
}

// ---- L：動作層級（決定下次重量）----
export interface LoadDecision { action: 'stop' | 'reduce' | 'increase' | 'hold'; weightKg: number | null; ruleId: string; }

export function nextLoad(ex: Exercise, p: Planned, sets: LoggedSet[], painScore: number, prevBelowMin: boolean): LoadDecision {
  const work = sets.filter(s => s.side !== 'left');          // 單手動作用右側判斷
  const w = p.targetWeightKg ?? work[0]?.weightKg ?? 0;
  const up = (steps: number, ruleId: string): LoadDecision => ({ action: 'increase', weightKg: w + ex.incrementKg * steps, ruleId });
  const hold = (ruleId: string): LoadDecision => ({ action: 'hold', weightKg: w, ruleId });

  if (painScore >= 4) return { action: 'stop', weightKg: null, ruleId: 'L1' };
  if (painScore >= 1) return { action: 'reduce', weightKg: roundTo(w * 0.9, ex.incrementKg), ruleId: 'L2' };
  if (work.length === 0) return hold('L0');

  const done = work.length >= p.sets;
  const minReps = Math.min(...work.map(s => s.reps));
  const minRir = Math.min(...work.map(s => s.rir ?? 0));
  const bigStep = w > 0 && ex.incrementKg / w >= 0.1;       // 級距 ≥ 10% 只加 1 級

  if (done && minReps >= p.repMax + 2) return up(bigStep ? 1 : 2, 'L3');
  if (done && minReps >= p.repMax && minRir >= 1) return up(1, 'L4');
  if (ex.isCompound && minRir === 0) return hold('L5');
  if (minReps < p.repMin) {
    return prevBelowMin
      ? { action: 'reduce', weightKg: roundTo(w * 0.925, ex.incrementKg), ruleId: 'L7' }
      : hold('L7');
  }
  return hold('L6');                                           // 目標：每組 +1 下
}

// ---- M：肌群組數 ----
export function muscleSetDelta(m: { status: 'new' | 'up' | 'flat' | 'down'; flatWeeks: number; avgFatigue: number;
  completion: number; currentSets: number; cap: number; planDelta: number }): { delta: number; ruleId: string } {
  if (m.completion < 0.8) return { delta: 0, ruleId: 'M4' };
  if (m.status === 'down' || m.avgFatigue >= 7) return { delta: -Math.max(1, Math.round(m.currentSets * 0.25)), ruleId: 'M3' };
  if (m.status === 'up' && m.avgFatigue <= 6) return { delta: Math.max(0, Math.min(m.planDelta, m.cap - m.currentSets)), ruleId: 'M1' };
  if (m.flatWeeks >= 2 && m.avgFatigue <= 6) return { delta: m.currentSets < m.cap ? 1 : 0, ruleId: 'M2' };
  return { delta: 0, ruleId: 'M0' };
}

// ---- D：減量 ----
export function deloadDecision(w: { mainLiftsDown2Weeks: number; fatigueHigh2Weeks: boolean; avgSleep: number;
  anyDown: boolean; scheduledDeload: boolean; allMainUp: boolean; avgFatigue: number; anyPain: boolean;
  weeksSinceDeload: number; postponedWeeks?: number }): { deload: boolean; ruleId: string } {
  if (w.mainLiftsDown2Weeks >= 2) return { deload: true, ruleId: 'D1' };
  if (w.fatigueHigh2Weeks) return { deload: true, ruleId: 'D2' };
  if (w.avgSleep < 6.5 && w.anyDown) return { deload: true, ruleId: 'D3' };
  if (w.scheduledDeload) {
    const postpone = w.allMainUp && w.avgFatigue <= 5 && !w.anyPain && (w.postponedWeeks == null ? w.weeksSinceDeload < 5 : w.postponedWeeks < 2); // 最多延 2 週
    return { deload: !postpone, ruleId: postpone ? 'D4-postpone' : 'D4' };
  }
  return { deload: false, ruleId: 'D0' };
}

// ---- N：飲食與體重 ----
export const bmr = (sex: 'male' | 'female', kg: number, cm: number, age: number) =>
  10 * kg + 6.25 * cm - 5 * age + (sex === 'male' ? 5 : -161);
export const ACTIVITY = { sedentary: 1.2, light: 1.375, moderate: 1.55 } as const;
export const tdee = (bmrKcal: number, activity: keyof typeof ACTIVITY, sessionsPerWeek: number) =>
  bmrKcal * ACTIVITY[activity] + (300 * sessionsPerWeek) / 7;

export function dailyStatus(t: { kcal: number; proteinMin: number }, d: { kcal: number; protein: number }) {
  const kcalOk = Math.abs(d.kcal - t.kcal) <= t.kcal * 0.1;
  const proteinOk = d.protein >= t.proteinMin;
  return kcalOk && proteinOk ? 'met' : kcalOk || proteinOk ? 'partial' : 'missed';
}

export function weeklyKcalDelta(i: { logCompleteness: number; weeklyGains: number[]; // 最近兩週，kg/週（由 7 日平均算）
  waistChange4w: number; weeksSinceLastAdjust: number }): { delta: number; ruleId: string } {
  if (i.logCompleteness < 0.7) return { delta: 0, ruleId: 'N1' };
  if (i.weeksSinceLastAdjust < 2) return { delta: 0, ruleId: 'N5' };
  const last = i.weeklyGains[i.weeklyGains.length - 1] ?? 0;
  if (last > 0.35 || i.waistChange4w >= 2) return { delta: -150, ruleId: 'N3' };
  if (i.weeklyGains.length >= 2 && i.weeklyGains.slice(-2).every(g => g < 0.1)) return { delta: 150, ruleId: 'N2' };
  return { delta: 0, ruleId: 'N0' };
}
