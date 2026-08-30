export const TARGET = 7_200_000

export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri'

/** 1 回の行動と、それで得られるポイント */
export interface DayItem {
  readonly label: string
  readonly value: number
}

export interface Day {
  readonly key: DayKey
  /** タブに出す1文字（月・火…） */
  readonly label: string
  readonly name: string
  readonly items: readonly DayItem[]
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
    items: [
      { label: '建造の残り時間1分短縮', value: 150 },
      { label: '生存者募集1回', value: 4500 },
    ],
  },
  {
    key: 'wed',
    label: '水',
    name: '水曜日',
    items: [
      { label: '科学研究の残り時間1分短縮', value: 150 },
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
    items: [
      { label: '建造の残り時間1分短縮', value: 150 },
      { label: '科学研究の残り時間1分短縮', value: 150 },
      { label: '訓練の残り時間1分短縮', value: 150 },
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
