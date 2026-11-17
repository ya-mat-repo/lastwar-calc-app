export const TARGET = 7_200_000

export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri'

/** 1 回の行動と、それで得られるポイント */
export interface DayItem {
  readonly label: string
  readonly value: number
  /**
   * まとめて使うと合計が変わるので、1個ずつ使う必要があるアイテム。
   * 画面に「1個ずつ使ってください」の注意を出す（SPEC §8-12）。
   */
  readonly oneByOne?: boolean
}

/** 1個ずつ使う必要があるアイテムについての注意書き（編集パネルに出す） */
export const ONE_BY_ONE_HINT =
  'まとめて使うと端数の扱いが変わり、合計がズレます' +
  '（例: チップ宝箱(R) 10個 → 1個ずつなら 28,130、まとめて使うと 28,125）。'

/** 結果カードで、該当アイテムを2回以上使う行に付ける注意 */
export const ONE_BY_ONE_TAG = '⚠ 1個ずつ使う（まとめて使うとズレる）'

/**
 * 基準値に倍率を掛けて求めるグループの種別。
 * - speedup: 加速アイテム（1分あたりの値 × 分数）
 * - bundle:  結束（1個あたりの値 × 個数）。1個ずつでは使えず、結束単位でのみ使う
 */
export type GroupKind = 'speedup' | 'bundle'

/**
 * グループ内の 1 サイズ。獲得ポイントは 基準値 × multiplier とする。
 * label は助数詞まで含んだ表示名（`10k個` `10枚` `1時間`）で、行動名にもそのまま使う。
 */
export interface GroupSize {
  readonly key: string
  readonly label: string
  readonly multiplier: number
}

const sizes = (rows: readonly (readonly [string, string, number])[]): readonly GroupSize[] =>
  rows.map(([key, label, multiplier]) => ({ key, label, multiplier }))

export const SPEEDUP_SIZES: readonly GroupSize[] = [
  { key: '1m', label: '1分', multiplier: 1 },
  { key: '5m', label: '5分', multiplier: 5 },
  { key: '1h', label: '1時間', multiplier: 60 },
  { key: '3h', label: '3時間', multiplier: 180 },
  { key: '8h', label: '8時間', multiplier: 480 },
]

/** 兵装素材の結束単位（1個 = 2.5 なので 10k で 25,000） */
export const MATERIAL_BUNDLES = sizes([
  ['10k', '10k個', 10_000],
  ['20k', '20k個', 20_000],
  ['30k', '30k個', 30_000],
  ['40k', '40k個', 40_000],
  ['50k', '50k個', 50_000],
])

/** 兵装コアの結束単位 */
export const CORE_BUNDLES = sizes([
  ['10', '10個', 10],
  ['20', '20個', 20],
  ['30', '30個', 30],
  ['40', '40個', 40],
  ['50', '50個', 50],
  ['60', '60個', 60],
  ['70', '70個', 70],
])

/** かけらの結束単位。兵装素材・兵装コアと同じく、1枚ずつでは使わないので ×1 は持たない */
export const SHARD_BUNDLES = sizes([
  ['10', '10枚', 10],
  ['20', '20枚', 20],
  ['30', '30枚', 30],
  ['40', '40枚', 40],
  ['50', '50枚', 50],
])

/**
 * 曜日ごとのグループ。
 * 編集できるのは基準値（1分あたり / 1個あたり）だけで、各サイズはそこから計算する。
 */
interface GroupBase {
  /** 曜日内で一意なキー */
  readonly key: string
  /** 「建造」「兵装素材」など。金曜の加速は3種を1つにまとめている */
  readonly name: string
  /** 基準の単位（「1分」「1個」「1枚」）。編集欄の見出しに出る */
  readonly unitLabel: string
  /** 基準 1 単位あたりの獲得ポイント（初期値） */
  readonly base: number
  /**
   * 計算に使えるサイズ。
   * 結束はここに ×1 を入れない（結束単位でしか使わないため）。
   * 基準値は各サイズの値を出すための係数でしかなく、それ自体は選択肢にならない。
   */
  readonly sizes: readonly GroupSize[]
}

export interface SpeedupGroup extends GroupBase {
  readonly kind: 'speedup'
}

export interface BundleGroup extends GroupBase {
  readonly kind: 'bundle'
  /** 行動名の末尾に付ける動詞（「使う」「消費」） */
  readonly action: string
}

export type ItemGroup = SpeedupGroup | BundleGroup

/** 編集パネルの見出しに付ける種別バッジ */
export const groupTag = (group: ItemGroup): string =>
  group.kind === 'speedup' ? '加速' : '結束'

/** 編集パネルのグループ見出し */
export const groupHeading = (group: ItemGroup): string =>
  group.kind === 'speedup' ? `${group.name}の残り時間短縮` : `${group.name}の結束`

/**
 * チェックボックス一覧の見出し。
 * 結束が ×1 を持つ場合（今は無い）だけ、単体でも使える旨を落とす。
 */
export const groupListTitle = (group: ItemGroup): string => {
  if (group.kind === 'speedup') return '持っている加速アイテム'
  const single = group.sizes.some((s) => s.multiplier === 1)
  return single ? '使う結束単位' : `使う結束単位（${group.unitLabel}ずつでは使えません）`
}

/**
 * グループから展開したアイテムの行動名。
 * 加速は「残り時間1時間短縮」。1曜日につき加速グループは1つだけなので、
 * 種類名（建造・科学研究…）は付けず、編集パネルの見出しで示す。
 * 結束は同じ曜日に複数グループが並ぶので「兵装素材10k個使う」と種類名を付ける。
 * サイズ名に助数詞（個・枚）が入っているので、末尾の動詞だけをグループごとに持つ。
 */
export const groupItemLabel = (group: ItemGroup, size: GroupSize): string =>
  group.kind === 'speedup'
    ? `残り時間${size.label}短縮`
    : `${group.name}${size.label}${group.action}`

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
 * かけらのグループ。月曜・木曜に同じ形で並ぶので、名前と1枚あたりの値だけで作る。
 * 行動名は「UR英雄かけら10枚消費」のように結束単位ぶんになる。
 */
const shardGroup = (key: string, name: string, base: number): BundleGroup => ({
  key,
  kind: 'bundle',
  name,
  unitLabel: '1枚',
  base,
  action: '消費',
  sizes: SHARD_BUNDLES,
})

/**
 * 曜日ごとの獲得値。仕様書「アプリ仕様書.md」の値をそのまま転記している。
 * 同じ値を持つ行動は prepareDay() が 1 つの選択肢にまとめる。
 */
export const DAYS: readonly Day[] = [
  {
    key: 'mon',
    label: '月',
    name: '月曜日',
    groups: [
      shardGroup('ur', 'UR英雄かけら', 25000),
      shardGroup('ssr', 'SSR英雄かけら', 8750),
      shardGroup('sr', 'SR英雄かけら', 2500),
    ],
    items: [
      { label: '10APを消費（野良ゾンビ倒す）', value: 3750 },
      { label: '20APを消費（終末精鋭集結）', value: 7500 },
      // 原典は 2812.5 / 14062.5 だが、ゲームは1回の使用ごとに端数を切り上げて整数で付与する。
      // 1個ずつ使うと 2813 / 14063、10個まとめて使うと 28125 / 140625 になり結果が変わる
      // （実測: チップ宝箱(R) を 28 回使って、2812.5 換算より +14 多かった）。
      // アプリは「1個ずつ使う」前提の値で計算し、画面でもそう促す（oneByOne）。
      { label: 'チップ宝箱(R)開封', value: 2813, oneByOne: true },
      { label: 'チップ宝箱(SR)開封', value: 14063, oneByOne: true },
      { label: 'チップ宝箱(SSR)開封', value: 84375 },
      { label: 'チップ宝箱(UR)開封', value: 281250 },
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
        action: '使う',
        sizes: MATERIAL_BUNDLES,
      },
      {
        key: 'core',
        kind: 'bundle',
        name: '兵装コア',
        unitLabel: '1個',
        base: 6250,
        action: '使う',
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
    groups: [
      shardGroup('awaken', '覚醒かけら', 25000),
      shardGroup('weapon', '専用武装のかけら', 25000),
      shardGroup('ur', 'UR英雄かけら', 25000),
      shardGroup('ssr', 'SSR英雄かけら', 8750),
      shardGroup('sr', 'SR英雄かけら', 2500),
    ],
    items: [{ label: '英雄募集1回', value: 4500 }],
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
