export const TARGET = 7_200_000

export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri'

/** 1 回の行動と、それで得られるポイント */
export interface DayItem {
  readonly label: string
  readonly value: number
}

/** 加速アイテムのサイズ。獲得ポイントは 1分あたりの値 × minutes とする */
export interface SpeedupSize {
  readonly key: string
  readonly label: string
  readonly minutes: number
}

export const SPEEDUP_SIZES: readonly SpeedupSize[] = [
  { key: '1m', label: '1分', minutes: 1 },
  { key: '5m', label: '5分', minutes: 5 },
  { key: '1h', label: '1時間', minutes: 60 },
  { key: '3h', label: '3時間', minutes: 180 },
  { key: '8h', label: '8時間', minutes: 480 },
]

/**
 * 曜日ごとの加速グループ。
 * 編集できるのは 1分あたりの値だけで、他のサイズはそこから計算する。
 */
export interface SpeedupGroup {
  /** 「建造」「科学研究」「建造・科学研究・訓練」など。金曜は3種を1つにまとめている */
  readonly name: string
  /** 1分あたりの獲得ポイント（初期値） */
  readonly perMinute: number
}

/**
 * 加速アイテムの行動名。例: 「残り時間1時間短縮」。
 * 1曜日につき加速グループは1つだけなので、種類名（建造・科学研究…）は付けない。
 * どの時間の短縮かは編集パネルのグループ見出しに出る。
 */
export const speedupLabel = (size: SpeedupSize): string => `残り時間${size.label}短縮`

export interface Day {
  readonly key: DayKey
  /** タブに出す1文字（月・火…） */
  readonly label: string
  readonly name: string
  readonly items: readonly DayItem[]
  /** 加速アイテムがある曜日のみ */
  readonly speedup?: SpeedupGroup
}

/** 加速グループを全サイズ展開した、その曜日の全アイテム */
export function expandDayItems(day: Day): DayItem[] {
  const speedup = day.speedup
  if (!speedup) return [...day.items]
  return [
    ...SPEEDUP_SIZES.map((size) => ({
      label: speedupLabel(size),
      value: speedup.perMinute * size.minutes,
    })),
    ...day.items,
  ]
}

/**
 * 曜日ごとの獲得値。仕様書「アプリ仕様書.md」の値をそのまま転記している。
 * 同じ値を持つ行動は prepareDay() が 1 つの選択肢にまとめる。
 */
export const DAYS: readonly Day[] = [
  {
    key: 'mon',
    label: '月',
    name: '月曜日',
    items: [
      { label: '10APを消費（野良ゾンビ倒す）', value: 3750 },
      { label: '20APを消費（終末精鋭集結）', value: 7500 },
      { label: 'チップ宝箱(R)開封', value: 2812.5 },
      { label: 'チップ宝箱(SR)開封', value: 14062.5 },
      { label: 'チップ宝箱(SSR)開封', value: 84375 },
      { label: 'チップ宝箱(UR)開封', value: 281250 },
      { label: 'UR英雄かけら1枚消費', value: 25000 },
      { label: 'SSR英雄かけら1枚消費', value: 8750 },
      { label: 'SR英雄かけら1枚消費', value: 2500 },
    ],
  },
  {
    key: 'tue',
    label: '火',
    name: '火曜日',
    speedup: { name: '建造', perMinute: 150 },
    items: [{ label: '生存者募集1回', value: 4500 }],
  },
  {
    key: 'wed',
    label: '水',
    name: '水曜日',
    speedup: { name: '科学研究', perMinute: 150 },
    items: [
      { label: 'Lv1ドローン部品宝箱開封', value: 2750 },
      { label: 'Lv2ドローン部品宝箱開封', value: 8250 },
      { label: 'Lv3ドローン部品宝箱開封', value: 25000 },
      { label: 'Lv4ドローン部品宝箱開封', value: 75000 },
      { label: 'Lv5ドローン部品宝箱開封', value: 225000 },
      { label: 'Lv6ドローン部品宝箱開封', value: 675000 },
    ],
  },
  {
    key: 'thu',
    label: '木',
    name: '木曜日',
    items: [
      { label: '英雄募集1回', value: 4200 },
      { label: '覚醒かけら1枚消費', value: 25000 },
      { label: '専用武装のかけら1枚消費', value: 25000 },
      { label: 'UR英雄かけら1枚消費', value: 25000 },
      { label: 'SSR英雄かけら1枚消費', value: 8750 },
      { label: 'SR英雄かけら1枚消費', value: 2500 },
    ],
  },
  {
    key: 'fri',
    label: '金',
    name: '金曜日',
    // 建造・科学研究・訓練は3種とも同じ値なので、ソルバーの同値まとめに合わせて1グループにする
    speedup: { name: '建造・科学研究・訓練', perMinute: 150 },
    items: [
      { label: 'Lv1兵士を1体訓練', value: 56 },
      { label: 'Lv2兵士を1体訓練', value: 84 },
      { label: 'Lv3兵士を1体訓練', value: 112 },
      { label: 'Lv4兵士を1体訓練', value: 140 },
      { label: 'Lv5兵士を1体訓練', value: 168 },
      { label: 'Lv6兵士を1体訓練', value: 196 },
      { label: 'Lv7兵士を1体訓練', value: 224 },
      { label: 'Lv8兵士を1体訓練', value: 252 },
      { label: 'Lv9兵士を1体訓練', value: 280 },
      { label: 'Lv10兵士を1体訓練', value: 308 },
      { label: 'Lv11兵士を1体訓練', value: 336 },
    ],
  },
]
