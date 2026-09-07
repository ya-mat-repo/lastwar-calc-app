/**
 * 目標値との差分を、その曜日の獲得値の組み合わせで作るソルバー。
 *
 * 前提と方針:
 * - 各獲得値は何回使ってもよい（0回でもよい）＝ 無制限ナップサック / コイン問題。
 * - 「組み合わせる値の数が少ないものを優先」を「使う値の"種類数"が少ない順」と解釈し、
 *   同数のときは「合計回数が少ない順」を第2キーにしている。
 * - 「優先して使うアイテム」が指定されていれば、それを多く含むパターンを最優先で並べる。
 * - 種類数 k = 1, 2, 3 について、値の組み合わせ（部分集合）ごとに
 *   合計回数が最小になる解を 1 件だけ求め、優先度順に上位 20 件を返す。
 * - 同じ値を持つ行動（例: 木曜の 25000 が3種）は 1 つの選択肢にまとめ、
 *   ラベルを併記する。
 */
import type { DayItem } from './data'

const MAX_RESULTS = 20
/** 「優先して使うアイテム」に指定できる件数。重みは ①=MAX_PRIORITY … 最下位=1 */
export const MAX_PRIORITY = 5
const MAX_OVERSHOOT_STEPS = 5000
const K3_ITERATION_BUDGET = 2_000_000

/** prepareDay() に渡せる曜日データ。実データの Day のほか、テスト用の仮データも受け付ける */
export interface DaySource {
  readonly key: string
  readonly name: string
  readonly label?: string
  readonly items: readonly DayItem[]
}

/** 同じ値の行動をまとめた 1 つの選択肢 */
export interface Option {
  readonly value: number
  /** 同じ値を持つ行動名（複数ありうる） */
  readonly labels: readonly string[]
  /**
   * 入力（＝獲得値パネル）に最初に現れた順。
   * options 自体は探索の都合で値の降順に並ぶので、
   * 画面の並びに戻したいところ（優先チップ）はこれで並べ替える。
   */
  readonly order: number
  /** value を整数化した値（value * scaleFactor） */
  readonly scaled: number
  /** scaled を全体の GCD で割った、探索に使う単位 */
  readonly unit: number
}

/** 2 種類の一次不定方程式を O(1) で解くための事前計算値 */
interface PairParams {
  readonly g: number
  readonly a: number
  readonly b: number
  /** a の mod b 逆元（b === 1 のときは未使用） */
  readonly inv: number
}

export interface PreparedDay extends DaySource {
  /** 値の降順 */
  readonly options: readonly Option[]
  readonly scaleFactor: number
  readonly unitScale: number
  readonly pairs: readonly (readonly (PairParams | null)[])[]
}

export interface PatternPart {
  readonly option: Option
  readonly count: number
}

export interface Pattern {
  readonly parts: readonly PatternPart[]
  /** 使う値の種類数（= parts.length） */
  readonly kinds: number
  /** 合計回数 */
  readonly totalCount: number
  /** 優先アイテムの重みの合計（①=3, ②=2, ③=1） */
  readonly score: number
}

export interface SolvedPattern extends Pattern {
  /** このパターンで得られる合計ポイント */
  readonly gain: number
  /** 現在値 + gain */
  readonly reached: number
}

export type SolveStatus =
  /** 選択肢が 1 件もない */
  | 'empty'
  /** すでに目標値ちょうど */
  | 'reached'
  /** 現在値が目標値を超えている */
  | 'over'
  /** 目標値ぴったりの組み合わせが見つかった */
  | 'exact'
  /** ぴったりは作れないので、目標値を超える最も近い値を返した */
  | 'over-shoot'
  /** 組み合わせが見つからなかった（選択肢がある限り起きない想定） */
  | 'none'

export interface SolveResult {
  readonly status: SolveStatus
  /** 目標値 - 現在値 */
  readonly diff: number
  readonly patterns: readonly SolvedPattern[]
}

/** 3 種類探索の総計算量の上限（超過値の探索ループ全体で共有する） */
interface Budget {
  left: number
}

function gcd(a: number, b: number): number {
  a = Math.abs(a)
  b = Math.abs(b)
  while (b) {
    const t = a % b
    a = b
    b = t
  }
  return a
}

/** gcd(a, m) === 1 を前提とした a の mod m 逆元 */
function modInverse(a: number, m: number): number {
  if (m === 1) return 0
  let oldR = ((a % m) + m) % m
  let r = m
  let oldS = 1
  let s = 0
  while (r !== 0) {
    const q = Math.floor(oldR / r)
    ;[oldR, r] = [r, oldR - q * r]
    ;[oldS, s] = [s, oldS - q * s]
  }
  return ((oldS % m) + m) % m
}

/** 小数点以下の桁数（最大 MAX_DECIMALS 桁まで） */
const MAX_DECIMALS = 4
const DECIMAL_LIMIT = 10 ** MAX_DECIMALS
function decimalPlaces(n: number): number {
  const s = String(n)
  const dot = s.indexOf('.')
  if (dot < 0 || s.includes('e')) return 0
  return Math.min(s.length - dot - 1, MAX_DECIMALS)
}

/**
 * 扱える桁数（MAX_DECIMALS）に丸めた値。
 * 整数化のときだけ丸めると、探索に使う値（scaled）と表示・集計に使う値（value）がずれ、
 * 「ぴったり作れるのに exact を取り逃す」「over-shoot なのに到達値が目標ちょうど」が起きる。
 * 先に丸めて両者を必ず一致させる。
 */
function roundToLimit(n: number): number {
  return Math.round(n * DECIMAL_LIMIT) / DECIMAL_LIMIT
}

/**
 * 曜日データを解きやすい形に前処理する。
 * 値に小数（2812.5 等）があるので 10^n 倍して整数化し、さらに全体の GCD で割って縮小する。
 * 値は編集されうるので、この関数は入力に依存しない純粋関数として毎回呼び直してよい。
 */
export function prepareDay(day: DaySource): PreparedDay {
  const byValue = new Map<number, string[]>()
  for (const item of day.items) {
    if (!Number.isFinite(item.value)) continue
    // 5桁以上の小数はここで 4 桁に丸める。以降 value と scaled は必ず整合する。
    // 丸めて 0 以下になる極小値（0.00001 など）はここで落ちる
    const value = roundToLimit(item.value)
    if (value <= 0) continue
    const labels = byValue.get(value)
    if (labels) labels.push(item.label)
    else byValue.set(value, [item.label])
  }

  const scaleFactor = 10 ** Math.max(0, ...[...byValue.keys()].map(decimalPlaces))

  // Map は挿入順を保つので、entries の並び＝獲得値パネルの並び
  const scaled = [...byValue.entries()]
    .map(([value, labels], order) => ({
      value,
      labels,
      order,
      scaled: Math.round(value * scaleFactor),
    }))
    // MAX_DECIMALS の丸めで 0 になる極小値（0.00001 など）は探索単位が 0 になり、
    // GCD も割り算も破綻するので選択肢にしない
    .filter((o) => o.scaled > 0)
    .sort((a, b) => b.value - a.value)

  if (scaled.length === 0) {
    return { ...day, options: [], scaleFactor, unitScale: 0, pairs: [] }
  }

  const unitScale = scaled.reduce((g, o) => gcd(g, o.scaled), 0)
  const options: Option[] = scaled.map((o) => ({ ...o, unit: o.scaled / unitScale }))

  // ペアごとの Diophantine 用パラメータを事前計算（i < j、unit は降順）
  const pairs: (PairParams | null)[][] = []
  for (let i = 0; i < options.length; i++) {
    const row: (PairParams | null)[] = []
    for (let j = 0; j < options.length; j++) {
      if (j <= i) {
        row.push(null)
        continue
      }
      const u1 = options[i].unit
      const u2 = options[j].unit
      const g = gcd(u1, u2)
      const a = u1 / g
      const b = u2 / g
      row.push({ g, a, b, inv: b === 1 ? 0 : modInverse(a, b) })
    }
    pairs.push(row)
  }

  return { ...day, options, scaleFactor, unitScale, pairs }
}

/** u1*c1 + u2*c2 = D (c1,c2 >= 0) のうち c1+c2 最小の解。無ければ null */
function solve2(D: number, p: PairParams): [number, number] | null {
  if (D < 0 || D % p.g !== 0) return null
  const d = D / p.g
  const { a, b } = p
  if (b === 1) {
    // u2 が u1 を割り切るケース。u1 側を最大限使うのが最小回数
    const c1 = Math.floor(d / a)
    return [c1, d - a * c1]
  }
  const r = ((d % b) * p.inv) % b // c1 ≡ r (mod b)
  const cMax = Math.floor(d / a)
  if (r > cMax) return null
  // 合計 = c1 + (d - a*c1)/b なので、a > b なら c1 最大、そうでなければ c1 最小が最適
  const c1 = a > b ? r + Math.floor((cMax - r) / b) * b : r
  return [c1, (d - a * c1) / b]
}

/** 指定した部分集合ちょうどで D を作る（全て 1 回以上）最小回数解を返す */
function solveSubset(
  D: number,
  idx: readonly number[],
  prep: PreparedDay,
  budget: Budget,
): number[] | null {
  const { options, pairs } = prep

  if (idx.length === 1) {
    const u = options[idx[0]].unit
    if (D <= 0 || D % u !== 0) return null
    return [D / u]
  }

  if (idx.length === 2) {
    const [i, j] = idx
    const pair = pairs[i][j]
    if (!pair) return null
    const rest = D - options[i].unit - options[j].unit
    const sol = solve2(rest, pair)
    return sol ? [sol[0] + 1, sol[1] + 1] : null
  }

  const [i, j, k] = idx
  const u1 = options[i].unit
  const u2 = options[j].unit
  const rest = D - u1 - u2 - options[k].unit
  if (rest < 0) return null

  const pair = pairs[j][k]
  if (!pair) return null

  let best: number[] | null = null
  let bestTotal = Infinity
  for (let c1 = Math.floor(rest / u1); c1 >= 0; c1--) {
    const R = rest - c1 * u1
    const lowerBound = c1 + Math.ceil(R / u2)
    if (lowerBound >= bestTotal) break
    if (--budget.left < 0) break
    const sol = solve2(R, pair)
    if (sol) {
      const total = c1 + sol[0] + sol[1]
      if (total < bestTotal) {
        bestTotal = total
        best = [c1 + 1, sol[0] + 1, sol[1] + 1]
      }
    }
  }
  return best
}

/**
 * 「優先して使うアイテム」の重み表を作る。先頭ほど重い（①=5, ②=4, … ⑤=1）。
 * 優先スコア = パターンが含む優先アイテムの重みの合計。
 */
function priorityWeights(priority: readonly number[]): Map<number, number> {
  const w = new Map<number, number>()
  priority.slice(0, MAX_PRIORITY).forEach((value, i) => w.set(value, MAX_PRIORITY - i))
  return w
}

/**
 * D（縮小済み単位）を作るパターンを集めて優先度順に並べる。
 * 並び順は「優先スコアが高い順 → 種類数が少ない順 → 合計回数が少ない順」。
 */
function collectPatterns(
  D: number,
  prep: PreparedDay,
  limit: number,
  budget: Budget,
  weights: Map<number, number>,
): Pattern[] {
  const { options } = prep
  const n = options.length
  const found: Pattern[] = []
  // 優先指定があると上位20件の顔ぶれが変わるため、打ち切らず全ての組み合わせを見る
  const exhaustive = weights.size > 0

  const push = (idx: readonly number[]): void => {
    const counts = solveSubset(D, idx, prep, budget)
    if (!counts) return
    const parts: PatternPart[] = idx.map((optIndex, p) => ({
      option: options[optIndex],
      count: counts[p],
    }))
    found.push({
      parts,
      kinds: parts.length,
      totalCount: counts.reduce((a, b) => a + b, 0),
      score: parts.reduce((s, part) => s + (weights.get(part.option.value) ?? 0), 0),
    })
  }

  for (let i = 0; i < n; i++) push([i])
  if (exhaustive || found.length < limit) {
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) push([i, j])
  }
  if ((exhaustive || found.length < limit) && n >= 3) {
    outer: for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        for (let k = j + 1; k < n; k++) {
          push([i, j, k])
          if (budget.left < 0) break outer
        }
      }
    }
  }

  found.sort((a, b) => b.score - a.score || a.kinds - b.kinds || a.totalCount - b.totalCount)
  return found.slice(0, limit)
}

/**
 * @param prep prepareDay() の結果
 * @param current 現在値
 * @param target 目標値
 * @param priority 優先して使うアイテムの値（先頭が①、最大3件）
 */
export function solveDay(
  prep: PreparedDay,
  current: number,
  target: number,
  priority: readonly number[] = [],
): SolveResult {
  const diff = target - current
  if (prep.options.length === 0) return { status: 'empty', diff, patterns: [] }
  if (diff === 0) return { status: 'reached', diff: 0, patterns: [] }
  if (diff < 0) return { status: 'over', diff, patterns: [] }

  const { unitScale, scaleFactor, options } = prep
  const budget: Budget = { left: K3_ITERATION_BUDGET }
  const weights = priorityWeights(priority)

  // 不足額を整数化する。丸め誤差の範囲なら整数とみなすが、
  // 現在値に端数があって本当に小数が残る場合は「整数化できない」＝ぴったりは作れない。
  // ここで Math.round に丸めてしまうと、目標を下回るパターンを exact として返してしまう
  // （例: 木曜 / 現在値 7,197,499.75 → 不足 2500.25 を 2500 と誤認して 2500×1 を提示）。
  const rawScaled = diff * scaleFactor
  const scaledDiff = Math.round(rawScaled)
  const isIntegral = Math.abs(rawScaled - scaledDiff) <= Math.max(1e-6, Math.abs(rawScaled) * 1e-12)

  // 目標ぴったり（scaledDiff が 0 のときは「各回数 1 以上」を満たす解が無いので探さない）
  if (isIntegral && scaledDiff > 0 && scaledDiff % unitScale === 0) {
    const patterns = collectPatterns(scaledDiff / unitScale, prep, MAX_RESULTS, budget, weights)
    if (patterns.length > 0) {
      return { status: 'exact', diff, patterns: decorate(patterns, current) }
    }
  }

  // ぴったり作れない場合は「目標値を超える中で最も近い値」を 1 単位ずつ上げながら探す。
  // 1 種類だけで作れる最小の超過値は必ず到達可能なので、それを探索の上限にする
  // （＝ここまで見れば必ず解が見つかる。値の編集で刻みが極端に粗くなっても破綻しない）。
  // 端数が残るときは切り上げてから走査する。切り捨てると目標を下回る解を拾ってしまう。
  // また現在値の端数で不足額が 1 単位未満になっても「1 単位以上の超過」から探す
  // （0 のままだと走査が 1 度も回らず none になってしまう）。
  const startScaled = isIntegral ? scaledDiff : Math.ceil(rawScaled)
  const start = Math.max(1, Math.ceil(startScaled / unitScale))
  const guaranteed = Math.min(...options.map((o) => Math.ceil(start / o.unit) * o.unit))
  const limit = Math.min(start + MAX_OVERSHOOT_STEPS, guaranteed)

  for (let unitTarget = start; unitTarget <= limit; unitTarget++) {
    const patterns = collectPatterns(unitTarget, prep, MAX_RESULTS, budget, weights)
    if (patterns.length > 0) {
      return { status: 'over-shoot', diff, patterns: decorate(patterns, current) }
    }
  }

  // 走査上限に達した場合の保険（1 種類だけの解は必ず存在する）
  const patterns = collectPatterns(guaranteed, prep, MAX_RESULTS, budget, weights)
  return patterns.length > 0
    ? { status: 'over-shoot', diff, patterns: decorate(patterns, current) }
    : { status: 'none', diff, patterns: [] }
}

function decorate(patterns: readonly Pattern[], current: number): SolvedPattern[] {
  return patterns.map((p) => {
    const gain = p.parts.reduce((sum, part) => sum + part.option.value * part.count, 0)
    return { ...p, gain, reached: current + gain }
  })
}
