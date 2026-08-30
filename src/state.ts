/**
 * 画面状態まわりの純粋ロジック。
 * React に依存しないので、そのまま単体テストできる。
 */
import { DAYS } from './data'
import type { DayKey } from './data'
import { prepareDay } from './solver'
import type { Option, PreparedDay } from './solver'

export const MAX_PRIORITY = 3
export const RANK_MARK = ['①', '②', '③'] as const

/** 編集中の 1 行。値は入力途中（"28" や ""）も保持したいので文字列で持つ */
export interface EditableItem {
  readonly id: string
  readonly label: string
  readonly raw: string
}

export interface EditableDay {
  readonly key: DayKey
  readonly label: string
  readonly name: string
  readonly items: readonly EditableItem[]
}

/** 曜日ごとの優先アイテム（値の配列、先頭が①） */
export type PriorityMap = Partial<Record<DayKey, number[]>>

let uidSeq = 0
const uid = (): string => `r${uidSeq++}`

/** 「＋ 行を追加」で足す空行 */
export const newItem = (): EditableItem => ({ id: uid(), label: '', raw: '' })

/** 仕様書の初期値から編集用の状態を作る */
export const toEditable = (): EditableDay[] =>
  DAYS.map((d) => ({
    ...d,
    items: d.items.map((i) => ({ id: uid(), label: i.label, raw: String(i.value) })),
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

/** 入力文字列 → 数値。数字と小数点以外は捨て、空なら null */
export function parseNumber(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.]/g, '')
  if (cleaned === '') return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

/** 編集状態 → ソルバー入力。空欄・0・不正な値の行は計算対象から外す */
export function toPrepared(day: EditableDay): PreparedDay {
  return prepareDay({
    ...day,
    items: day.items
      .map((i) => ({ label: i.label.trim() || '(名称未設定)', value: parseNumber(i.raw) }))
      .filter((i): i is { label: string; value: number } => i.value !== null && i.value > 0),
  })
}

/** 値からアイテム名（同値はまとめて併記）を引く */
export function labelOf(prep: PreparedDay, value: number): string {
  return prep.options.find((o) => o.value === value)?.labels.join(' / ') ?? ''
}

/** その曜日が初期値から変更されているか */
export function isModified(day: EditableDay): boolean {
  const base = DAYS.find((d) => d.key === day.key)
  if (!base || base.items.length !== day.items.length) return true
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
