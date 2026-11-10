/** 預定減量週：組數減半（奇數向上取整），RIR 3–4 以 3 為目標。 */
export function scheduledSets(sets: number, deload: boolean): number {
  return deload ? Math.ceil(sets * 0.5) : sets
}
export function scheduledRir(rir: number, deload: boolean): number {
  return deload ? 3 : rir
}
