/**
 * 画面状態まわりの純粋ロジック。
 * React に依存しないので、そのまま単体テストできる。
 */
import { DAYS, groupItemLabel } from './data'
import type { Day, DayKey, GroupSize, ItemGroup } from './data'
import { MAX_PRIORITY, prepareDay } from './solver'
import type { Option, PreparedDay } from './solver'

// 上限は重み付け（solver 側）と揃える必要があるので、solver の定義をそのまま使う
export { MAX_PRIORITY }
export const RANK_MARK = ['①', '②', '③', '④', '⑤'] as const

/** 編集中の 1 行。値は入力途中（"28" や ""）も保持したいので文字列で持つ */
export interface EditableItem {
  readonly id: string
  readonly label: string
  readonly raw: string
  /** 1個ずつ使う必要がある行（初期データから引き継ぐ。行動名や値を編集しても残る） */
  readonly oneByOne?: boolean
}

/**
 * 編集中のグループ（加速・結束）。
 * 基準値だけを状態として持ち、各サイズの値は毎回そこから計算する
 * （派生値を状態に持つと基準値とズレる余地が生まれるため）。
 * サイズ一覧や種別は編集できないので、定義（def）をそのまま参照する。
 */
export interface EditableGroup {
  /** 静的な定義（キー・種別・名前・サイズ一覧・基準値の初期値） */
  readonly def: ItemGroup
  /** 基準値の入力（入力途中も保持したいので文字列） */
  readonly raw: string
  /** 計算に使うサイズの key（加速は「持っている」、結束は「使う」単位） */
  readonly enabled: readonly string[]
}

export interface EditableDay {
  readonly key: DayKey
  readonly label: string
  readonly name: string
  readonly items: readonly EditableItem[]
  /** 基準値から展開するグループ。無い曜日では空配列 */
  readonly groups: readonly EditableGroup[]
}

/** 曜日ごとの優先アイテム（値の配列、先頭が①） */
export type PriorityMap = Partial<Record<DayKey, number[]>>

let uidSeq = 0
const uid = (): string => `r${uidSeq++}`

/** 「＋ 行を追加」で足す空行 */
export const newItem = (): EditableItem => ({ id: uid(), label: '', raw: '' })

/** 仕様書の初期値から編集用の状態を作る（グループは全サイズを選んだ状態で始める） */
export const toEditable = (): EditableDay[] =>
  DAYS.map((d) => ({
    key: d.key,
    label: d.label,
    name: d.name,
    items: d.items.map((i) => ({
      id: uid(),
      label: i.label,
      raw: String(i.value),
      ...(i.oneByOne ? { oneByOne: true } : {}),
    })),
    groups: (d.groups ?? []).map((g) => ({
      def: g,
      raw: String(g.base),
      enabled: g.sizes.map((s) => s.key),
    })),
  }))

/** 指定した曜日だけを初期値に戻す */
export function resetDayItems(days: readonly EditableDay[], key: DayKey): EditableDay[] {
  const fresh = toEditable().find((d) => d.key === key)
  return days.map((d) => (d.key === key && fresh ? fresh : d))
}

/** 一覧から曜日を引く。見つからない場合は先頭を返すので undefined にならない */
export function findDay<T extends { key: string }>(days: readonly T[], key: DayKey): T {
  return days.find((d) => d.key === key) ?? days[0]
}

export const fmt = (n: number): string =>
  n.toLocaleString('ja-JP', { maximumFractionDigits: 4 })

/**
 * 入力文字列 → 数値。数字と小数点以外は捨て、空なら null。
 * 先頭の `-` だけは残す。捨ててしまうと `-5` が 5 になり、
 * 「負数の行は計算対象から外して赤枠にする」（SPEC §3.4）が成立しないため。
 */
export function parseNumber(raw: string): number | null {
  // 全角の数字・記号を半角にそろえる。日本語入力のまま打った「２0500」のような混在を
  // そのまま通すと、全角の桁だけが捨てられて別の値（500）になってしまう
  const text = raw.normalize('NFKC')
  // マイナスに見える文字（− や、日本語入力で出やすい ー）も負号として扱う
  const negative = /^\s*[-−ー]/.test(text)
  const cleaned = text.replace(/[^0-9.]/g, '')
  if (cleaned === '') return null
  const n = Number((negative ? '-' : '') + cleaned)
  if (!Number.isFinite(n)) return null
  // 「-0」は 0 にそろえる（そのままだと 0 以上の判定を通り、画面に「-0」と出る）
  return n === 0 ? 0 : n
}

/**
 * min〜max の整数だけを受け付ける入力の解釈。
 * 空欄・範囲外・小数・不正な値は、どれも入力ミス（value: null）として返す。
 */
export function parseIntInRange(
  raw: string,
  min: number,
  max: number,
): { value: number | null; invalid: boolean } {
  const n = parseNumber(raw)
  if (n === null || !Number.isInteger(n) || n < min || n > max) {
    return { value: null, invalid: true }
  }
  return { value: n, invalid: false }
}

/**
 * 現在値の入力を解釈する。
 * 負数は「マイナスを打ち間違えた」以外に意味が無いので、黙って符号を落とさず入力ミスとして返す。
 */
export function parseCurrent(raw: string): { value: number | null; invalid: boolean } {
  const n = parseNumber(raw)
  if (n === null) return { value: null, invalid: false }
  if (n < 0) return { value: null, invalid: true }
  return { value: n, invalid: false }
}

/** 目標値の上限（8桁）。桁の打ち間違いを弾くためのもので、探索はこの範囲で実用的な速度で返る */
export const MAX_TARGET = 99_999_999

/**
 * 目標値の入力を解釈する。
 * 受け付けるのは 1〜MAX_TARGET の整数だけで、それ以外は入力ミス（value: null）として返す。
 * - ゲームのポイントは整数なので、小数の目標値はどう組み合わせても作れない
 * - 現在値と違い「未入力」の状態は無い（初期値 TARGET が入っている）ので、空欄も invalid にする
 */
export function parseTarget(raw: string): { value: number | null; invalid: boolean } {
  return parseIntInRange(raw, 1, MAX_TARGET)
}

/** 現在値と目標値の差。remaining=まだ足りない / exact=ちょうど / over=超えている */
export interface Gap {
  readonly kind: 'remaining' | 'exact' | 'over'
  /** 差の大きさ（常に 0 以上） */
  readonly amount: number
}

/**
 * 現在値が目標値に対してどこにあるか。
 * 計算機の「目標まで ◯◯」とトップページの「前回のつづき」で同じ判定を使う。
 */
export function gapToTarget(current: number, target: number): Gap {
  const diff = target - current
  if (diff > 0) return { kind: 'remaining', amount: diff }
  if (diff === 0) return { kind: 'exact', amount: 0 }
  return { kind: 'over', amount: -diff }
}

/** グループの1行ぶんの表示データ */
export interface GroupRow {
  readonly size: GroupSize
  readonly label: string
  /** 基準値が無効なら null（値を出せない） */
  readonly value: number | null
  readonly enabled: boolean
}

/** グループの全サイズを、基準値から計算して返す（チェックの有無に関わらず全件） */
export function groupRows(group: EditableGroup): GroupRow[] {
  const base = parseNumber(group.raw)
  const valid = base !== null && base > 0
  return group.def.sizes.map((size) => ({
    size,
    label: groupItemLabel(group.def, size),
    value: valid ? base * size.multiplier : null,
    enabled: group.enabled.includes(size.key),
  }))
}

/** 全グループのうち、実際に計算に使うアイテム（チェックが入っていて値が有効なもの） */
export function groupItems(
  groups: readonly EditableGroup[],
): { label: string; value: number }[] {
  return groups.flatMap((group) =>
    groupRows(group)
      .filter((r): r is GroupRow & { value: number } => r.enabled && r.value !== null && r.value > 0)
      .map((r) => ({ label: r.label, value: r.value })),
  )
}

/** サイズのチェックを切り替える */
export function toggleGroupSize(enabled: readonly string[], key: string): string[] {
  return enabled.includes(key) ? enabled.filter((k) => k !== key) : [...enabled, key]
}

/** グループごと削除する */
export function removeGroup(day: EditableDay, key: string): EditableDay {
  return { ...day, groups: day.groups.filter((g) => g.def.key !== key) }
}

/** 計算対象になりうる行数（見出しの「N件」） */
export const countRows = (day: EditableDay): number =>
  day.items.length + day.groups.reduce((n, g) => n + g.enabled.length, 0)

/** 編集状態 → ソルバー入力。空欄・0・負数・不正な値の行は計算対象から外す */
export function toPrepared(day: EditableDay): PreparedDay {
  const rows = day.items
    .map((i) => ({
      label: i.label.trim() || '(名称未設定)',
      value: parseNumber(i.raw),
      oneByOne: i.oneByOne === true,
    }))
    .filter(
      (i): i is { label: string; value: number; oneByOne: boolean } =>
        i.value !== null && i.value > 0,
    )
  return prepareDay({ ...day, items: [...groupItems(day.groups), ...rows] })
}

/** 値からアイテム名（同値はまとめて併記）を引く */
export function labelOf(prep: PreparedDay, value: number): string {
  return prep.options.find((o) => o.value === value)?.labels.join(' / ') ?? ''
}

/** グループが初期状態から変わっているか（基準値の変更・チェック外し・グループ削除） */
function groupsModified(base: Day, day: EditableDay): boolean {
  if ((base.groups ?? []).length !== day.groups.length) return true
  return day.groups.some(
    (g) => g.raw !== String(g.def.base) || g.enabled.length !== g.def.sizes.length,
  )
}

/** その曜日が初期値から変更されているか */
export function isModified(day: EditableDay): boolean {
  const base = DAYS.find((d) => d.key === day.key)
  if (!base) return true
  if (groupsModified(base, day)) return true
  if (base.items.length !== day.items.length) return true
  return day.items.some(
    (i, idx) => i.label !== base.items[idx].label || i.raw !== String(base.items[idx].value),
  )
}

/**
 * 優先アイテムのタップ処理。
 * 未選択なら末尾に追加（上限 MAX_PRIORITY）、選択済みなら外して後ろの順位を繰り上げる。
 */
export function togglePriorityValue(current: number[], value: number): number[] {
  if (current.includes(value)) return current.filter((v) => v !== value)
  if (current.length >= MAX_PRIORITY) return current
  return [...current, value]
}

/** 値が編集・削除されて実在しなくなった優先指定を落とす */
export function prunePriority(
  priority: readonly number[],
  options: readonly Pick<Option, 'value'>[],
): number[] {
  return priority.filter((v) => options.some((o) => o.value === v))
}

/**
 * チップのタップを保存済みの優先指定に適用する。
 * 保存側に実在しない値が残っていると MAX_PRIORITY の判定が狂い
 * （画面は2件表示なのに追加できない）、剪定した結果も保存されないため、
 * 必ず prune してから toggle する。
 */
export function applyPriorityTap(
  stored: readonly number[],
  value: number,
  options: readonly Pick<Option, 'value'>[],
): number[] {
  return togglePriorityValue(prunePriority(stored, options), value)
}
