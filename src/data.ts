export const TARGET = 7_200_000

export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri'

/** 1 回の行動と、それで得られるポイント */
export interface DayItem {
  readonly label: string
  readonly value: number
}

/**
 * 基準値に倍率を掛けて求めるグループの種別。
 * - speedup: 加速アイテム（1分あたりの値 × 分数）
 * - bundle:  結束（1個あたりの値 × 個数）。1個ずつでは使えず、結束単位でのみ使う
 */
export type GroupKind = 'speedup' | 'bundle'

/** グループ内の 1 サイズ。獲得ポイントは 基準値 × multiplier とする */
export interface GroupSize {
  readonly key: string
  readonly label: string
  readonly multiplier: number
}

export const SPEEDUP_SIZES: readonly GroupSize[] = [
  { key: '1m', label: '1分', multiplier: 1 },
  { key: '5m', label: '5分', multiplier: 5 },
  { key: '1h', label: '1時間', multiplier: 60 },
  { key: '3h', label: '3時間', multiplier: 180 },
  { key: '8h', label: '8時間', multiplier: 480 },
]

/** 結束単位。ラベルがそのままキーになり、倍率は「何個ぶんか」 */
const bundleSizes = (sizes: readonly (readonly [string, number])[]): readonly GroupSize[] =>
  sizes.map(([label, multiplier]) => ({ key: label, label, multiplier }))

/** 兵装素材の結束単位（1個 = 2.5 なので 10k で 25,000） */
export const MATERIAL_BUNDLES = bundleSizes([
  ['10k', 10_000],
  ['20k', 20_000],
  ['30k', 30_000],
  ['40k', 40_000],
  ['50k', 50_000],
])

/** 兵装コアの結束単位 */
export const CORE_BUNDLES = bundleSizes([
  ['10', 10],
  ['20', 20],
  ['30', 30],
  ['40', 40],
  ['50', 50],
  ['60', 60],
  ['70', 70],
])

/**
 * 曜日ごとのグループ。
 * 編集できるのは基準値（1分あたり / 1個あたり）だけで、各サイズはそこから計算する。
 */
export interface ItemGroup {
  /** 曜日内で一意なキー */
  readonly key: string
  readonly kind: GroupKind
  /** 「建造」「兵装素材」など。金曜の加速は3種を1つにまとめている */
  readonly name: string
  /** 基準の単位（「1分」「1個」）。編集欄の見出しに出る */
  readonly unitLabel: string
  /** 基準 1 単位あたりの獲得ポイント（初期値） */
  readonly base: number
  /**
   * 計算に使えるサイズ。
   * 結束はここに ×1 を入れない（1個ずつでは使えず、結束単位でしか使えないため）。
   */
  readonly sizes: readonly GroupSize[]
}

/** 編集パネルの見出しに付ける種別バッジ */
export const groupTag = (group: ItemGroup): string =>
  group.kind === 'speedup' ? '加速' : '結束'

/** 編集パネルのグループ見出し */
export const groupHeading = (group: ItemGroup): string =>
  group.kind === 'speedup' ? `${group.name}の残り時間短縮` : `${group.name}の結束`

/** チェックボックス一覧の見出し */
export const groupListTitle = (group: ItemGroup): string =>
  group.kind === 'speedup' ? '持っている加速アイテム' : '使う結束単位（1個ずつでは使えません）'

/**
 * グループから展開したアイテムの行動名。
 * 加速は「残り時間1時間短縮」。1曜日につき加速グループは1つだけなので、
 * 種類名（建造・科学研究…）は付けず、編集パネルの見出しで示す。
 * 結束は同じ曜日に複数グループが並ぶので「兵装素材10k個使う」と種類名を付ける。
 */
export const groupItemLabel = (group: ItemGroup, size: GroupSize): string =>
  group.kind === 'speedup'
    ? `残り時間${size.label}短縮`
    : `${group.name}${size.label}個使う`

export interface Day {
  readonly key: DayKey
  /** タブに出す1文字（月・火…） */
  readonly label: string
  readonly name: string
  readonly items: readonly DayItem[]
  /** 基準値から展開するグループ（加速・結束）。無い曜日もある */
  readonly groups?: readonly ItemGroup[]
}

/** グループを全サイズ展開した、その曜日の全アイテム */
export function expandDayItems(day: Day): DayItem[] {
  const fromGroups = (day.groups ?? []).flatMap((group) =>
    group.sizes.map((size) => ({
      label: groupItemLabel(group, size),
      value: group.base * size.multiplier,
    })),
  )
  return [...fromGroups, ...day.items]
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
    groups: [
      {
        key: 'speedup',
        kind: 'speedup',
        name: '建造',
        unitLabel: '1分',
        base: 150,
        sizes: SPEEDUP_SIZES,
      },
      {
        key: 'material',
        kind: 'bundle',
        name: '兵装素材',
        unitLabel: '1個',
        base: 2.5,
        sizes: MATERIAL_BUNDLES,
      },
      {
        key: 'core',
        kind: 'bundle',
        name: '兵装コア',
        unitLabel: '1個',
        base: 6250,
        sizes: CORE_BUNDLES,
      },
    ],
    items: [{ label: '生存者募集1回', value: 4500 }],
  },
  {
    key: 'wed',
    label: '水',
    name: '水曜日',
    groups: [
      {
        key: 'speedup',
        kind: 'speedup',
        name: '科学研究',
        unitLabel: '1分',
        base: 150,
        sizes: SPEEDUP_SIZES,
      },
    ],
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
    groups: [
      {
        key: 'speedup',
        kind: 'speedup',
        name: '建造・科学研究・訓練',
        unitLabel: '1分',
        base: 150,
        sizes: SPEEDUP_SIZES,
      },
    ],
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
