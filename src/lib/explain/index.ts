export const templates = {
  L0: '{name} 尚無同動作實績；先以 RIR 2 試重，不判定進退步。',
  L1: '{name} 相關疼痛 {pain} 分（{painKind}），先停止或換用替代動作；未接受前不更動課表。',
  'L1-medical': '{name} 連續 2 次出現疼痛 ≥ 4 分或刺痛，建議停止該動作並就醫評估。',
  L2: '{name} 疼痛 {pain} 分，依器材級距將 {beforeWeight} kg 降至 {afterWeight} kg，組數不變。',
  L3: '{name} 完成 {sets} 組，每組至少 {minReps} 下，超過上限 {repMax} 下達 2 下；由 {beforeWeight} kg 加至 {afterWeight} kg。',
  L4: '{name} 完成 {sets} 組，每組達上限 {repMax} 下，最低 RIR {minRir}；由 {beforeWeight} kg 加至 {afterWeight} kg，組數不變。',
  L5: '{name} 本次最低 RIR 0，屬複合動作；維持 {afterWeight} kg，提醒保留 1–2 下。',
  L6: '{name} 本次最低 {minReps} 下，範圍 {repMin}–{repMax} 下；維持 {afterWeight} kg，下次每組目標 {targetReps} 下。',
  L7: '{name} 最低 {minReps} 下，低於下限 {repMin}；{belowCount} 次低於下限，目標重量 {afterWeight} kg。',
  S1: '本週腰部疼痛 {pain} 分；{name} 會壓下背，改用俯臥腿彎舉，重新試重。',
  M0: '{name} 本週有效 {effectiveSets} 組，沒有足夠條件加減組，維持組數。',
  M1: '{name} 的相關動作都進步，平均疲勞 {fatigue}；直接組數（不含輔助折算）由 {beforeSets} 調整為 {afterSets}。',
  M2: '{name} 在有紀錄的週次中已連續停滯 {flatWeeks} 週，平均疲勞 {fatigue}；直接組數（不含輔助折算）由 {beforeSets} 調整為 {afterSets}。',
  M3: '{name} 退步或平均疲勞 {fatigue} ≥ 7；直接組數（不含輔助折算）由 {beforeSets} 調整為 {afterSets}。',
  M4: '本週完成率 {completion}%，低於 80%；先找出時間與恢復因素，本週不加組。',
  'M-defer': '{name} 原可調整組數，但本次先處理重量或已達單次 12 組／120 分鐘上限，暫維持 {beforeSets} 組。',
  D0: '平均疲勞 {fatigue}、睡眠 {sleep} 小時；未觸發額外減量，延續正常週目標。',
  D1: '{downLifts} 個主動作已連續 2 週退步；第 {nextWeek} 週建議減量：組數減半、重量不變、RIR 3。',
  D2: '連續 2 週平均疲勞 ≥ 7，本週 {fatigue}；第 {nextWeek} 週建議減量。',
  D3: '本週平均睡眠 {sleep} 小時，低於 6.5，且有動作退步；第 {nextWeek} 週建議減量。',
  D4: '第 {nextWeek} 週為減量週（原定第 {originWeek} 週，已延後 {postponed} 週）；組數減半、重量不變、RIR 3，最多延後 2 週且不超過第 12 週。',
  'D4-postpone': '三個主動作都進步、疲勞 {fatigue} ≤ 5、沒有疼痛；將原定第 {originWeek} 週的減量延到第 {deferredWeek} 週，累計延後 {postponed} 週。',
  'D-restore': '第 {sourceWeek} 週已減量；第 {nextWeek} 週回到減量前的組數、重量與 RIR。',
  N0: '目前體重與飲食資料未觸發熱量調整，維持 {kcal} kcal。',
  N1: '飲食紀錄完整率 {completion}%，低於 70%；先補紀錄，不調整熱量。',
  N2: '連續 2 週增重低於 0.1 kg／週，建議每日增加 150 kcal。',
  N3: '本週增重 {gain} kg／週、4 週腰圍變化 {waist} cm，建議每日減少 150 kcal。',
  N4: '蛋白質週平均 {protein} g，低於 130 g，先補蛋白質，不因此修改熱量。',
  N5: '距上次熱量調整 {weeks} 週，未滿 2 週，維持觀察。',
  USER_EDIT: '使用者修改：{name} 的{field}由 {before} 調整為 {after}。',
} as const
export type RuleId = keyof typeof templates
export function explain(ruleId: RuleId, data: Record<string, string | number | null | undefined>): string {
  return templates[ruleId].replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = data[key]
    if (value == null) return '未填'
    if (typeof value === 'number') return Number.isFinite(value) ? value.toLocaleString('zh-TW', { maximumFractionDigits: 2 }) : '未填'
    return value
  })
}
