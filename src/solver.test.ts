import { describe, expect, it } from 'vitest'
import { DAYS, TARGET, expandDayItems } from './data'
import type { Day } from './data'
import { MAX_PRIORITY, prepareDay, solveDay } from './solver'
import type { SolvedPattern } from './solver'

const prep = (values: readonly number[]) =>
  prepareDay({
    key: 'x',
    name: 'テスト',
    items: values.map((v, i) => ({ label: `V${i}`, value: v })),
  })

/** 実データの曜日を、加速グループを全サイズ展開したうえで前処理する */
const prepDay = (day: Day) => prepareDay({ ...day, items: expandDayItems(day) })

/** パターンを比較しやすい素朴な形に落とす */
const shape = (p: SolvedPattern) => ({
  values: p.parts.map((x) => x.option.value),
  counts: p.parts.map((x) => x.count),
  kinds: p.kinds,
  totalCount: p.totalCount,
  score: p.score,
})

// ---------------------------------------------------------------------------
// 総当たり参照実装（テスト専用の素朴な解法）
// ソルバーは拡張ユークリッド互除法で最小回数解を「計算」するが、
// こちらは全パターンを「数え上げ」て最小を出す。両者が一致することで正しさを担保する。
// ---------------------------------------------------------------------------

/** subset（降順の実数値）を各1回以上使って D ちょうどを作る、合計回数が最小の解 */
function bruteSubsetMin(D: number, subset: readonly number[]): number[] | null {
  const total = (a: readonly number[]) => a.reduce((x, y) => x + y, 0)
  let best: number[] | null = null
  const keep = (counts: number[]) => {
    if (!best || total(counts) < total(best)) best = counts
  }

  if (subset.length === 1) {
    const [a] = subset
    if (D % a === 0 && D / a >= 1) keep([D / a])
  } else if (subset.length === 2) {
    const [a, b] = subset
    for (let c1 = 1; c1 * a < D; c1++) {
      const rest = D - c1 * a
      if (rest % b === 0 && rest / b >= 1) keep([c1, rest / b])
    }
  } else {
    const [a, b, c] = subset
    for (let c1 = 1; c1 * a < D; c1++) {
      for (let c2 = 1; c1 * a + c2 * b < D; c2++) {
        const rest = D - c1 * a - c2 * b
        if (rest > 0 && rest % c === 0) keep([c1, c2, rest / c])
      }
    }
  }
  return best
}

/** ソルバーと同じ順序（1種類→2種類→3種類、値は降順）で全部分集合を列挙する */
function allSubsets(values: readonly number[]): number[][] {
  const sorted = [...values].sort((a, b) => b - a)
  const out: number[][] = []
  for (let i = 0; i < sorted.length; i++) out.push([sorted[i]])
  for (let i = 0; i < sorted.length; i++)
    for (let j = i + 1; j < sorted.length; j++) out.push([sorted[i], sorted[j]])
  for (let i = 0; i < sorted.length; i++)
    for (let j = i + 1; j < sorted.length; j++)
      for (let k = j + 1; k < sorted.length; k++) out.push([sorted[i], sorted[j], sorted[k]])
  return out
}

const scoreOf = (values: readonly number[], priority: readonly number[]): number =>
  values.reduce((s, v) => {
    const r = priority.indexOf(v)
    return s + (r < 0 ? 0 : MAX_PRIORITY - r)
  }, 0)

/** D を作る全パターンを、ソルバーと同じ規則で並べた期待値 */
interface BruteEntry {
  values: number[]
  counts: number[]
  kinds: number
  totalCount: number
  score: number
}

function bruteExpected(
  D: number,
  values: readonly number[],
  priority: readonly number[] = [],
  limit = 20,
): BruteEntry[] {
  const found: BruteEntry[] = []
  for (const subset of allSubsets(values)) {
    const counts = bruteSubsetMin(D, subset)
    if (!counts) continue
    found.push({
      values: subset,
      counts,
      kinds: subset.length,
      totalCount: counts.reduce((a, b) => a + b, 0),
      score: scoreOf(subset, priority),
    })
  }
  // Array.prototype.sort は安定ソートなので、同点は列挙順のまま＝ソルバーと同じ
  found.sort((a, b) => b.score - a.score || a.kinds - b.kinds || a.totalCount - b.totalCount)
  return found.slice(0, limit)
}

/** 3種類以内で D ちょうどを作れるか */
const bruteReachable = (D: number, values: readonly number[]): boolean =>
  allSubsets(values).some((subset) => bruteSubsetMin(D, subset) !== null)

/** D 以上で到達可能な最小の値 */
function bruteMinAtLeast(D: number, values: readonly number[], span = 3000): number | null {
  for (let s = D; s <= D + span; s++) if (bruteReachable(s, values)) return s
  return null
}

// ---------------------------------------------------------------------------

describe('prepareDay', () => {
  it('同じ値の行動を1つの選択肢にまとめ、ラベルを併記する', () => {
    const p = prepareDay({
      key: 'thu',
      name: '木',
      items: [
        { label: '覚醒かけら', value: 25000 },
        { label: '専用武装のかけら', value: 25000 },
        { label: 'UR英雄かけら', value: 25000 },
        { label: '英雄募集', value: 4200 },
      ],
    })
    expect(p.options).toHaveLength(2)
    expect(p.options[0].value).toBe(25000)
    expect(p.options[0].labels).toEqual(['覚醒かけら', '専用武装のかけら', 'UR英雄かけら'])
  })

  it('値を降順に並べる', () => {
    expect(prep([100, 900, 300]).options.map((o) => o.value)).toEqual([900, 300, 100])
  })

  it('小数を含む値は倍率をかけて整数化し、GCD で縮小する', () => {
    const p = prep([2812.5, 25000, 3750])
    expect(p.scaleFactor).toBe(10)
    // 実質の刻み = unitScale / scaleFactor
    expect(p.unitScale / p.scaleFactor).toBe(312.5)
    expect(p.options.map((o) => o.unit * (p.unitScale / p.scaleFactor))).toEqual([
      25000, 3750, 2812.5,
    ])
  })

  it('小数の丸めで 0 になる極小値は選択肢から除外する', () => {
    // 0.00001 は MAX_DECIMALS(4桁) の丸めで scaled が 0 になる。
    // 残してしまうと unit が 0 になり、超過探索の上限が NaN になって解が返らなくなる。
    const p = prep([150, 0.00001])
    expect(p.options.map((o) => o.value)).toEqual([150])
    expect(p.options.every((o) => o.unit > 0)).toBe(true)
  })

  it('0・負数・NaN の行は選択肢から除外する', () => {
    const p = prepareDay({
      key: 'x',
      name: 'x',
      items: [
        { label: 'ok', value: 100 },
        { label: 'zero', value: 0 },
        { label: 'minus', value: -50 },
        { label: 'nan', value: NaN },
      ],
    })
    expect(p.options.map((o) => o.value)).toEqual([100])
  })

  it('選択肢が0件でも壊れない', () => {
    const p = prepareDay({ key: 'x', name: 'x', items: [] })
    expect(p.options).toEqual([])
    expect(solveDay(p, 0, TARGET).status).toBe('empty')
  })
})

describe('solveDay: 総当たり参照実装との一致', () => {
  const cases = [
    { values: [7, 11, 13], targets: [100, 137, 500, 1001] },
    { values: [50, 84, 175, 500], targets: [1000, 1234, 5000, 20000] },
    { values: [3, 55, 165, 500], targets: [600, 997, 3000] },
    { values: [150, 4500], targets: [4650, 9000, 13500] },
    { values: [56, 84, 112, 140, 168, 150], targets: [560, 1000, 2000] },
  ]

  for (const { values, targets } of cases) {
    for (const D of targets) {
      it(`values=[${values}] D=${D} で上位20件が一致する`, () => {
        const r = solveDay(prep(values), 0, D)
        const expected = bruteExpected(D, values)

        expect(r.status).toBe(expected.length > 0 ? 'exact' : 'over-shoot')
        if (expected.length === 0) return

        // 使うアイテムの組み合わせと、その最小合計回数が総当たりと一致する
        expect(r.patterns.map((p) => shape(p).values)).toEqual(expected.map((e) => e.values))
        expect(r.patterns.map((p) => p.totalCount)).toEqual(expected.map((e) => e.totalCount))
        // 回数の内訳は同点解が複数ありうるので、「合計がちょうど D になる」ことを確認する
        for (const p of r.patterns) {
          expect(p.parts.reduce((s, x) => s + x.option.value * x.count, 0)).toBe(D)
        }
      })
    }
  }

  it('優先指定つきでも上位20件が一致する', () => {
    const values = [50, 84, 175, 500]
    for (const priority of [[500], [50, 500], [175, 50, 500], [84]]) {
      for (const D of [1234, 5000, 20000]) {
        const r = solveDay(prep(values), 0, D, priority)
        const expected = bruteExpected(D, values, priority)
        expect(r.patterns.map((p) => shape(p).values), `D=${D} priority=[${priority}]`).toEqual(
          expected.map((e) => e.values),
        )
        expect(r.patterns.map((p) => p.score)).toEqual(expected.map((e) => e.score))
      }
    }
  })

  // 優先指定が無いときは20件揃った時点で3種類の探索を打ち切る最適化が入っている。
  // 優先指定があるとその打ち切りは上位20件の顔ぶれを変えてしまうため、
  // 「打ち切りが効くだけ選択肢が多い」ケースで全組み合わせを見ていることを確かめる。
  it('打ち切りが効くケースでも、優先指定時は3種類の組み合わせまで探す', () => {
    const values = [7, 11, 13, 17, 19, 23, 29, 31]
    for (const D of [200, 301, 500]) {
      // 前提: 優先指定なしだと2種類までで20件埋まる（＝3種類は探索されない）
      const plain = solveDay(prep(values), 0, D)
      expect(plain.patterns).toHaveLength(20)
      expect(plain.patterns.every((p) => p.kinds <= 2), `D=${D}`).toBe(true)

      for (const priority of [
        [7, 11, 13],
        [31, 7],
        [29, 31, 23],
      ]) {
        const r = solveDay(prep(values), 0, D, priority)
        const expected = bruteExpected(D, values, priority)
        const label = `D=${D} priority=[${priority}]`
        expect(r.patterns.map((p) => shape(p).values), label).toEqual(expected.map((e) => e.values))
        expect(r.patterns.map((p) => p.score), label).toEqual(expected.map((e) => e.score))
      }
    }
  })

  it('ぴったり作れないときの超過値が本当に最小である', () => {
    const cases = [
      { values: [7, 11, 13], D: 5 },
      { values: [50, 84, 175, 500], D: 33 },
      { values: [50, 84, 175, 500], D: 1233 },
      { values: [150, 4500], D: 4649 },
      { values: [1000], D: 1 },
      { values: [900, 1000], D: 1234 },
      { values: [2500, 3750, 8750, 25000], D: 312.5 * 4 },
    ]
    // 到達可能かどうかも総当たりで判定するので、ケースの想定違いで誤検知しない
    let overshootCases = 0
    for (const { values, D } of cases) {
      const r = solveDay(prep(values), 0, D)
      const label = `values=[${values}] D=${D}`
      if (bruteReachable(D, values)) {
        expect(r.status, label).toBe('exact')
        expect(r.patterns[0].reached, label).toBe(D)
        continue
      }
      overshootCases++
      expect(r.status, label).toBe('over-shoot')
      expect(r.patterns[0].reached, label).toBe(bruteMinAtLeast(D, values))
      // 超過パターンは全て同じ到達値
      expect(new Set(r.patterns.map((p) => p.reached)).size, label).toBe(1)
    }
    expect(overshootCases).toBeGreaterThan(0)
  })

  // 超過フォールバックは「1種類だけで作れる最小値」を上限に1単位ずつ走査している。
  // その途中にある複数種類の解を取りこぼすと非最小の答えを返すため、
  // 取りこぼしが起きやすい値の組で不足額を全数走査して最小性を検証する。
  // 例: [23,14,51] で不足29 → 真の最小超過は 37(=14+23) だが、1種類だけだと 42(=14×3)。
  it('超過フォールバックの最小性を不足額の全数走査で確認する', () => {
    const systems = [
      [23, 14, 51],
      [42, 49, 31],
      [20, 32, 19],
      [11, 30, 54],
      [18, 34, 46, 57],
      [7, 11, 13],
    ]
    for (const values of systems) {
      const p = prep(values)
      for (let D = 1; D <= 120; D++) {
        const r = solveDay(p, 0, D)
        const label = `values=[${values}] D=${D}`
        if (bruteReachable(D, values)) {
          expect(r.status, label).toBe('exact')
          expect(r.patterns[0].reached, label).toBe(D)
        } else {
          expect(r.status, label).toBe('over-shoot')
          expect(r.patterns[0].reached, label).toBe(bruteMinAtLeast(D, values))
        }
      }
    }
  })
})

describe('solveDay: 並び順の契約', () => {
  const ordered = (patterns: readonly SolvedPattern[]): boolean =>
    patterns.every((p, i) => {
      if (i === 0) return true
      const q = patterns[i - 1]
      return (
        q.score > p.score ||
        (q.score === p.score &&
          (q.kinds < p.kinds || (q.kinds === p.kinds && q.totalCount <= p.totalCount)))
      )
    })

  it('優先指定なしは 種類数 → 合計回数 の昇順', () => {
    for (const day of DAYS.map(prepDay)) {
      const r = solveDay(day, 6_850_000, TARGET)
      expect(ordered(r.patterns), day.name).toBe(true)
      expect(r.patterns.every((p) => p.score === 0)).toBe(true)
    }
  })

  it('優先指定ありは 優先スコア降順 → 種類数 → 合計回数', () => {
    for (const day of DAYS.map(prepDay)) {
      const values = day.options.map((o) => o.value)
      const priority = values.slice(0, 3)
      const r = solveDay(day, 6_850_000, TARGET, priority)
      expect(ordered(r.patterns), day.name).toBe(true)
      // スコアは ①=3, ②=2, ③=1 の合計
      for (const p of r.patterns) {
        expect(p.score).toBe(
          scoreOf(
            p.parts.map((x) => x.option.value),
            priority,
          ),
        )
      }
    }
  })

  it('優先指定は絞り込みではなく並び替え（件数が変わらない）', () => {
    for (const day of DAYS.map(prepDay)) {
      const values = day.options.map((o) => o.value)
      const plain = solveDay(day, 6_850_000, TARGET)
      for (const priority of [[values[0]], values.slice(0, 2), values.slice(-3)]) {
        const r = solveDay(day, 6_850_000, TARGET, priority)
        expect(r.patterns.length, `${day.name} / [${priority}]`).toBe(plain.patterns.length)
      }
    }
  })

  it('優先アイテムを含むパターンが必ず先頭に来る', () => {
    const day = prepDay(DAYS[0])
    // 不足 350,000 をこの値だけで作れる（×14）。
    // 最小値の 2,813 は他の値と互いに素で 350,000 を作る組み合わせに入れないので使わない
    const target = 25000 // SR英雄かけら10枚消費
    expect(day.options.some((o) => o.value === target)).toBe(true)
    const r = solveDay(day, 6_850_000, TARGET, [target])
    expect(r.patterns[0].parts.some((x) => x.option.value === target)).toBe(true)
  })

  it('存在しない値を優先指定しても無視される', () => {
    const day = prepDay(DAYS[0])
    const a = solveDay(day, 6_850_000, TARGET, [99999])
    const b = solveDay(day, 6_850_000, TARGET)
    expect(a.patterns.map(shape)).toEqual(b.patterns.map(shape))
  })
})

describe('solveDay: 実データ（月〜金）の不変条件', () => {
  const currents = [0, 12_345, 3_000_000, 6_850_000, 7_000_000, 7_199_000, 7_199_850, 7_199_999]

  for (const base of DAYS) {
    const day = prepDay(base)
    it(`${day.name}: どの現在値でも結果が仕様を満たす`, () => {
      for (const current of currents) {
        const r = solveDay(day, current, TARGET)
        expect(r.patterns.length, `${day.name}/${current}`).toBeGreaterThan(0)
        expect(r.patterns.length).toBeLessThanOrEqual(20)

        for (const p of r.patterns) {
          const gain = p.parts.reduce((s, x) => s + x.option.value * x.count, 0)
          // 主張している獲得値・到達値が実際の合計と一致する
          expect(p.gain).toBeCloseTo(gain, 6)
          expect(p.reached).toBeCloseTo(current + gain, 6)
          // 目標を下回らない
          expect(p.reached).toBeGreaterThanOrEqual(TARGET)
          if (r.status === 'exact') expect(p.reached).toBe(TARGET)
          // 各アイテムは1回以上、回数は整数、同じアイテムの重複なし
          expect(p.parts.every((x) => Number.isInteger(x.count) && x.count >= 1)).toBe(true)
          expect(new Set(p.parts.map((x) => x.option.value)).size).toBe(p.parts.length)
          expect(p.kinds).toBe(p.parts.length)
          expect(p.totalCount).toBe(p.parts.reduce((s, x) => s + x.count, 0))
        }
      }
    })
  }

  // かけらに結束単位が付いたので、不足 350,000 は SSR英雄かけら40枚（8,750 × 40）1回で埋まる
  it('月曜 6,850,000 の最良手は SSR英雄かけら40枚消費×1', () => {
    const r = solveDay(prepDay(DAYS[0]), 6_850_000, TARGET)
    expect(r.status).toBe('exact')
    expect(shape(r.patterns[0])).toMatchObject({ values: [350000], counts: [1], kinds: 1 })
    expect(r.patterns[0].parts[0].option.labels).toEqual(['SSR英雄かけら40枚消費'])
  })

  it('火曜 7,199,850 は 建造1分短縮×1 でぴったり', () => {
    const r = solveDay(prepDay(DAYS[1]), 7_199_850, TARGET)
    expect(r.status).toBe('exact')
    expect(shape(r.patterns[0])).toMatchObject({ values: [150], counts: [1] })
  })

  it('月曜 7,199,999 はぴったり作れず、最小超過は チップ宝箱(R)×1', () => {
    const r = solveDay(prepDay(DAYS[0]), 7_199_999, TARGET)
    expect(r.status).toBe('over-shoot')
    expect(r.patterns[0].reached).toBe(7_199_999 + 2813)
  })
})

// §6-12「選択肢が1件以上あれば、必ず1件以上のパターンが返る」は
// 実データ×整数の現在値でしか確認していなかったため、
// 端数のある現在値・編集された値の集合まで広げて検証する。
describe('solveDay: 不変条件 §6-12（選択肢があれば必ず解が返る）', () => {
  /** §6 の不変条件をまとめて確認する */
  const expectInvariants = (
    r: ReturnType<typeof solveDay>,
    current: number,
    target: number,
    label: string,
  ): void => {
    expect(r.status, label).not.toBe('none')
    expect(r.patterns.length, label).toBeGreaterThan(0)
    expect(r.patterns.length, label).toBeLessThanOrEqual(20)
    for (const p of r.patterns) {
      const gain = p.parts.reduce((s, x) => s + x.option.value * x.count, 0)
      expect(p.gain, label).toBeCloseTo(gain, 6) // §6-1
      expect(p.reached, label).toBeCloseTo(current + gain, 6) // §6-2
      expect(p.reached, label).toBeGreaterThanOrEqual(target) // §6-3
      if (r.status === 'exact') expect(p.reached, label).toBe(target) // §6-4
      expect(p.parts.every((x) => Number.isInteger(x.count) && x.count >= 1), label).toBe(true) // §6-5
      expect(new Set(p.parts.map((x) => x.option.value)).size, label).toBe(p.parts.length) // §6-6
      expect(p.kinds, label).toBe(p.parts.length) // §6-7
      expect(p.totalCount, label).toBe(p.parts.reduce((s, x) => s + x.count, 0))
    }
    // §6-9: over-shoot なら全パターンが同じ到達値
    if (r.status === 'over-shoot') {
      expect(new Set(r.patterns.map((p) => p.reached)).size, label).toBe(1)
    }
  }

  // 火〜金は全値が整数なので scaleFactor が 1。現在値に端数があると
  // 不足額が 1 単位未満になり、以前は scaledDiff が 0 に丸まって none を返していた。
  it('現在値に端数があっても解が返る（不足額が1単位未満のケース）', () => {
    for (const base of DAYS) {
      const day = prepDay(base)
      const minValue = Math.min(...day.options.map((o) => o.value))
      for (const current of [
        TARGET - 0.4,
        TARGET - 0.01,
        TARGET - 0.0001,
        TARGET - 1.5,
        TARGET - 2500.25,
      ]) {
        const label = `${day.name} / current=${current}`
        const r = solveDay(day, current, TARGET)
        expectInvariants(r, current, TARGET, label)
        // 不足額が最小の獲得値より小さいときは、最小の獲得値1回が唯一の最小超過になる
        if (TARGET - current < minValue) {
          expect(r.status, label).toBe('over-shoot')
          expect(r.patterns[0].reached, label).toBeCloseTo(current + minValue, 6)
        }
      }
    }
  })

  it('端数の現在値でも優先指定の有無で件数が変わらない（§6-10）', () => {
    for (const base of DAYS) {
      const day = prepDay(base)
      const current = TARGET - 0.4
      const plain = solveDay(day, current, TARGET)
      const withPriority = solveDay(
        day,
        current,
        TARGET,
        day.options.slice(0, 3).map((o) => o.value),
      )
      expect(withPriority.patterns.length, day.name).toBe(plain.patterns.length)
    }
  })

  it('丸めて 0 になる極小値が混ざっていても、他の値で解が返る', () => {
    // 以前は unit が 0 になり、超過探索の上限が NaN → 1度も走査されず none だった
    for (const values of [
      [150, 0.00001],
      [4500, 150, 0.000001],
      [3750, 7500, 2812.5, 25000, 0.00002],
    ]) {
      const p = prep(values)
      expect(p.options.length, `${values}`).toBeGreaterThan(0)
      for (const current of [7_199_000, 6_850_000, 7_199_999.5]) {
        expectInvariants(
          solveDay(p, current, TARGET),
          current,
          TARGET,
          `values=[${values}] current=${current}`,
        )
      }
    }
  })

  // 実データの不変条件チェック（§6-1〜7）は優先指定なしでしか回していなかったので、
  // 優先指定ありでも同じ不変条件が保たれることを確認する
  it('優先指定があっても §6 の不変条件が保たれる', () => {
    for (const base of DAYS) {
      const day = prepDay(base)
      const values = day.options.map((o) => o.value)
      const priorities = [
        [values[0]],
        values.slice(0, 2),
        values.slice(0, 3),
        values.slice(-3),
        [99999], // 存在しない値
      ]
      for (const priority of priorities) {
        for (const current of [0, 6_850_000, 7_199_999, 7_199_999.6]) {
          const label = `${day.name} / [${priority}] / ${current}`
          const r = solveDay(day, current, TARGET, priority)
          expectInvariants(r, current, TARGET, label)
          // §5.4: 優先スコアは重み（①=3, ②=2, ③=1）の合計
          for (const p of r.patterns) {
            expect(
              p.score,
              label,
            ).toBe(scoreOf(p.parts.map((x) => x.option.value), priority))
          }
        }
      }
    }
  })

  it('編集されうる色々な値の集合と現在値で、必ず解が返る', () => {
    const valueSets = [
      [1],
      [7],
      [10_000_000],
      [3, 5],
      [999_983, 7919],
      [0.0001],
      [0.5, 0.25],
      [1234.5678, 99.25],
      [150, 150, 150], // 同値のみ（まとめて1件になる）
      [56, 84, 112, 140, 168, 196, 224, 252, 280, 308, 336, 150],
    ]
    const currents = [0, 1, 6_850_000, 7_199_999, 7_199_999.6, 7_199_999.9999, 6_849_999.75]
    for (const values of valueSets) {
      const p = prep(values)
      expect(p.options.length, `${values}`).toBeGreaterThan(0)
      for (const current of currents) {
        expectInvariants(
          solveDay(p, current, TARGET),
          current,
          TARGET,
          `values=[${values}] current=${current}`,
        )
      }
    }
  })
})

// レビューで見つかった具体的な不具合を、そのままの値で固定しておく
describe('solveDay: 回帰（レビュー指摘の修正）', () => {
  it('#1 不足額が丸めて0になっても none にならない（火曜 7,199,999.6）', () => {
    const r = solveDay(prepDay(DAYS[1]), 7_199_999.6, TARGET)
    expect(r.status).toBe('over-shoot')
    expect(shape(r.patterns[0])).toMatchObject({ values: [150], counts: [1] })
    expect(r.patterns[0].reached).toBeCloseTo(7_200_149.6, 6)
  })

  it('#1 月曜（scaleFactor=10）でも同様（7,199,999.99）', () => {
    const r = solveDay(prepDay(DAYS[0]), 7_199_999.99, TARGET)
    expect(r.status).toBe('over-shoot')
    expect(shape(r.patterns[0])).toMatchObject({ values: [2813], counts: [1] })
  })

  it('#4 不足額の端数を切り捨てて目標を下回る解を返さない（木曜 7,197,499.75）', () => {
    // 不足 2500.25。2500 に丸めると「2500×1 でぴったり」に見えてしまうが、
    // 実際の到達値は 7,199,999.75 で目標を下回る。
    const current = 7_197_499.75
    const r = solveDay(prepDay(DAYS[3]), current, TARGET)
    expect(r.status).toBe('over-shoot')
    expect(shape(r.patterns[0])).toMatchObject({ values: [4500], counts: [1] })
    expect(r.patterns[0].reached).toBeCloseTo(7_201_999.75, 6)
    expect(r.patterns.every((p) => p.reached >= TARGET)).toBe(true)
  })

  it('#4 端数の切り捨てで exact を誤検出しない（単一の値 1）', () => {
    const current = 6_849_999.75
    const r = solveDay(prep([1]), current, TARGET)
    expect(r.status).toBe('over-shoot')
    expect(r.patterns[0].reached).toBeCloseTo(7_200_000.75, 6)
  })

  it('#4 丸め誤差レベルのズレは今までどおり ぴったり と判定する', () => {
    // 7,200,000 - 14062.5 は浮動小数の再計算で微小な誤差が出るが exact のまま
    // （実データから小数の獲得値が無くなったので、仮の値で確認する）
    const r = solveDay(prep([25000, 14062.5, 3750]), TARGET - 14062.5, TARGET)
    expect(r.status).toBe('exact')
    expect(r.patterns[0].reached).toBe(TARGET)
  })

  // 実機での報告: 現在値 4,346,250 に UR30枚×3 + SSR20枚×3 + チップ宝箱(R)×28 を足したら
  // アプリの表示は 7,200,000 ちょうどなのに、実際は 7,200,014 になった。
  // 原因は チップ宝箱(R) の 2,812.5 で、ゲーム側は1回の使用ごとに切り上げて
  // 整数（2,813）で付与している。0.5 × 28回 = 14。獲得値を整数にして解消した。
  // まとめて使うと合計に対して1回だけ切り上げるので（10個で 28,125）、1個ずつ使う前提の値。
  it('#5 チップ宝箱(R)開封 は整数の 2,813（小数だと使用回数ぶんズレる）', () => {
    const box = DAYS[0].items.find((i) => i.label === 'チップ宝箱(R)開封')
    expect(box?.value).toBe(2813)
    expect(2813 * 28).toBe(78_764) // 2812.5 なら 78,750 で 14 少ない
  })

  it('#5 チップ宝箱(SR)開封 も1個ずつ使ったときの 14,063', () => {
    const box = DAYS[0].items.find((i) => i.label === 'チップ宝箱(SR)開封')
    expect(box?.value).toBe(14063)
  })

  it('#5 実データの獲得値はすべて整数', () => {
    const frac = DAYS.flatMap(expandDayItems).filter((i) => !Number.isInteger(i.value))
    expect(frac.map((i) => i.label)).toEqual([])
  })

  it('#5 1個ずつ使う必要があるのは チップ宝箱(R) と (SR) だけ', () => {
    const flagged = DAYS.flatMap((d) => d.items).filter((i) => i.oneByOne)
    expect(flagged.map((i) => i.label)).toEqual(['チップ宝箱(R)開封', 'チップ宝箱(SR)開封'])
    // 選択肢にも引き継がれる
    const day = prepDay(DAYS[0])
    expect(day.options.filter((o) => o.oneByOne).map((o) => o.value)).toEqual([14063, 2813])
  })

  it('#5 同じ値にまとまった選択肢は、1件でも該当すれば oneByOne になる', () => {
    const p = prepareDay({
      key: 'x',
      name: 'テスト',
      items: [
        { label: 'a', value: 100 },
        { label: 'b', value: 100, oneByOne: true },
        { label: 'c', value: 300 },
      ],
    })
    expect(p.options.map((o) => [o.value, o.oneByOne])).toEqual([
      [300, false],
      [100, true],
    ])
  })

  it('#5 報告のあった現在値 4,346,250 では、端数の出ない組み合わせだけを出す', () => {
    const r = solveDay(prepDay(DAYS[0]), 4_346_250, TARGET)
    expect(r.status).toBe('exact')
    for (const p of r.patterns) {
      expect(p.reached).toBe(TARGET)
      expect(Number.isInteger(p.gain)).toBe(true)
    }
  })

  it('#3 極小値の行があっても他の値で解が返る（150 + 0.00001）', () => {
    // 不足 1000 は 150 の倍数ではないので over-shoot。以前は none で 0 件だった。
    const r = solveDay(prep([150, 0.00001]), 7_199_000, TARGET)
    expect(r.status).toBe('over-shoot')
    expect(shape(r.patterns[0])).toMatchObject({ values: [150], counts: [7] })
    expect(r.patterns[0].reached).toBe(7_200_050)
  })

  it('#3 極小値の行があっても ぴったり を見つけられる（150 + 0.00001）', () => {
    const r = solveDay(prep([150, 0.00001]), 7_199_100, TARGET)
    expect(r.status).toBe('exact')
    expect(shape(r.patterns[0])).toMatchObject({ values: [150], counts: [6] })
  })

  it('#5 小数5桁以上の値は4桁に丸め、探索値と表示値を一致させる', () => {
    const p = prep([100.12345, 7])
    expect(p.options.map((o) => o.value)).toEqual([100.1235, 7])
    // 丸めずに整数化していたときは scaled と value*scaleFactor がずれていた
    for (const o of p.options) {
      expect(Math.round(o.value * p.scaleFactor)).toBe(o.scaled)
    }
  })

  it('#5 over-shoot なのに到達値が目標値ちょうど、にならない', () => {
    // 修正前は [100.12345, 7] / 不足 1001.2345 が
    // 「over-shoot」なのに到達 7,200,000（超過 0）になっていた
    const valueSets = [[100.12345, 7], [0.00012345], [1.23456789, 5], [2812.5, 2500]]
    const currents = [TARGET - 1001.2345, TARGET - 1234.5, TARGET - 0.5, 6_850_000]
    for (const values of valueSets) {
      const p = prep(values)
      for (const current of currents) {
        const r = solveDay(p, current, TARGET)
        const label = `values=[${values}] current=${current} status=${r.status}`
        for (const x of r.patterns) {
          if (r.status === 'exact') expect(x.reached, label).toBe(TARGET)
          else expect(x.reached - TARGET, label).toBeGreaterThan(1e-6)
        }
      }
    }
  })
})

describe('solveDay: 境界と異常系', () => {
  const day = prepDay(DAYS[0])

  it('現在値が目標ちょうどなら reached', () => {
    expect(solveDay(day, TARGET, TARGET)).toMatchObject({ status: 'reached', patterns: [] })
  })

  it('現在値が目標を超えていたら over', () => {
    const r = solveDay(day, TARGET + 1, TARGET)
    expect(r.status).toBe('over')
    expect(r.diff).toBe(-1)
  })

  it('選択肢が1件でも解ける', () => {
    const r = solveDay(prep([1000]), 0, 7000)
    expect(shape(r.patterns[0])).toMatchObject({ values: [1000], counts: [7] })
  })

  it('目標より大きい値しかなくても最小超過を返す', () => {
    const r = solveDay(prep([8_000_000]), 0, TARGET)
    expect(r.status).toBe('over-shoot')
    expect(r.patterns[0].reached).toBe(8_000_000)
  })

  it('刻みが極端に粗くても必ず解が返る（走査上限で打ち切らない）', () => {
    const r = solveDay(prep([1234.5678, 99.25]), 7_199_999, TARGET)
    expect(r.status).toBe('over-shoot')
    expect(r.patterns.length).toBeGreaterThan(0)
    expect(r.patterns[0].reached).toBeGreaterThan(TARGET)
  })

  it('現在値・獲得値に小数が入ってもぴったり一致を見つけられる', () => {
    // 不足 14062.5 ＝ 小数の値 ×1 ちょうど（実データに小数は無いので仮の値）
    const r = solveDay(prep([25000, 14062.5, 3750]), TARGET - 14062.5, TARGET)
    expect(r.status).toBe('exact')
    expect(shape(r.patterns[0])).toMatchObject({ values: [14062.5], counts: [1] })
    expect(r.patterns[0].reached).toBe(TARGET)
  })

  // §5.5: 最小の獲得値より小さい到達値は作れないので、そこまで走査を飛ばす。
  // 月曜は刻み 1 に対して最小の獲得値が 2,813 なので、飛ばさないと
  // 到達しようのない値を 2,800 ステップあまり走査することになる。
  it('刻み（GCD）と一致するだけでは作れない不足額は超過側に回る', () => {
    expect(day.unitScale / day.scaleFactor).toBe(1) // 月曜の刻み
    const r = solveDay(day, TARGET - 1, TARGET)
    expect(r.status).toBe('over-shoot')
    expect(r.patterns[0].reached).toBe(TARGET - 1 + 2813)
  })

  // §5.5 / §9-2: 走査が MAX_OVERSHOOT_STEPS(5000) に達しても
  // 「1種類だけで作れる最小の超過値」で必ず解を返す
  it('超過探索の走査上限に達しても解が返る', () => {
    // unit が 100 万規模なので、start から 5000 ステップでは何も見つからない
    const r = solveDay(prep([999983, 999979]), 0, TARGET)
    expect(r.status).toBe('over-shoot')
    expect(r.patterns.length).toBeGreaterThan(0)
    expect(r.patterns[0].reached).toBeGreaterThanOrEqual(TARGET)
    // 保証値は 1 種類だけで作れる最小の超過値
    expect(shape(r.patterns[0])).toMatchObject({ values: [999979], counts: [8] })
    expect(r.patterns[0].reached).toBe(999979 * 8)
    expect(new Set(r.patterns.map((p) => p.reached)).size).toBe(1)
  })

  it('選択肢が多い曜日でも実用的な速度で返る', () => {
    const fri = prepDay(DAYS[4])
    const priority = fri.options.slice(0, 5).map((o) => o.value)
    const t0 = performance.now()
    solveDay(fri, 6_850_000, TARGET, priority)
    expect(performance.now() - t0).toBeLessThan(1000)
  })

  // §5.5: 超過探索は「最小の獲得値」から始める。飛ばさないと月曜
  // （刻み 1 に対して最小の獲得値が 2,813）で、到達しようのない値を
  // 数千ステップ走査することになる（刻みが 0.5 だったときは 170ms 超かかっていた）。
  it('刻みが最小の獲得値よりずっと細かくても、超過探索が重くならない', () => {
    const day = prepDay(DAYS[0])
    expect(day.unitScale / day.scaleFactor).toBe(1)
    expect(day.options[day.options.length - 1].value).toBe(2813)

    solveDay(day, 7_199_999, TARGET) // ウォームアップ（初回は JIT のぶん遅い）
    const t0 = performance.now()
    const r = solveDay(day, 7_199_999, TARGET)
    expect(performance.now() - t0).toBeLessThan(100)
    expect(r.patterns[0].reached).toBe(7_199_999 + 2813)
  })
})
