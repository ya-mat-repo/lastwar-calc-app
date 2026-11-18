import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DAMAGE,
  EXCHANGE_LIMIT,
  EXCHANGE_UNIT,
  MAX_DAMAGE,
  MONTHLY_CAP,
  SILVER_EVENTS,
  exchangeTotal,
  exchangeYen,
  exchangesNeeded,
  mustTotal,
  optionalTotal,
  parseDamage,
  planSilver,
  weeklyBaseIncome,
  weeklyReserves,
} from './silver'

const event = (key: string) => {
  const e = SILVER_EVENTS.find((x) => x.key === key)
  if (!e) throw new Error(`${key} が無い`)
  return e
}

/** 総当たりの検算: 貯え S から始めて何か月回しても、週の途中で残りが負にならないか */
const survives = (uses: readonly number[], weekly: number, start: number): boolean => {
  let stock = start
  for (let month = 0; month < 6; month++) {
    for (const use of uses) {
      stock += weekly - use
      if (stock < 0) return false
    }
  }
  return true
}

describe('データ（SPEC §14.3）', () => {
  it('開催順は 閃金 → 百発百中 → 戦争準備 → 賞金稼ぎ', () => {
    expect(SILVER_EVENTS.map((e) => e.name)).toEqual(['閃金', '百発百中', '戦争準備', '賞金稼ぎ'])
  })

  it('イベントごとの必ず・任意の銀塊', () => {
    expect(SILVER_EVENTS.map((e) => [e.name, mustTotal(e), optionalTotal(e)])).toEqual([
      ['閃金', 30_000, 150_000],
      ['百発百中', 25_000, 0],
      ['戦争準備', 0, 0],
      ['賞金稼ぎ', 30_000, 0],
    ])
  })

  it('必ずの合計 85,000、任意の合計 150,000、月合計 235,000', () => {
    const must = SILVER_EVENTS.reduce((s, e) => s + mustTotal(e), 0)
    const optional = SILVER_EVENTS.reduce((s, e) => s + optionalTotal(e), 0)
    expect([must, optional, must + optional]).toEqual([85_000, 150_000, 235_000])
  })

  it('任意の交換があるのは閃金だけ', () => {
    expect(SILVER_EVENTS.filter((e) => optionalTotal(e) > 0).map((e) => e.name)).toEqual(['閃金'])
  })

  it('ダメージ報酬を除く週の入手量は (6,500 + 2,500) × 6 = 54,000', () => {
    expect(weeklyBaseIncome()).toBe(54_000)
  })
})

describe('お金に直した額（SPEC §14.4）', () => {
  it.each<[string, number, number]>([
    ['gold', 0, 1200], // 80 閃金
    ['gold', 1, 1500], // 100 閃金（お金と同じレート）
    ['shot', 0, 1250], // 10 弾丸
    ['bounty', 0, 1200], // 80 賞金稼ぎ用弾丸
  ])('%s の交換 %i は %i 円ぶん', (key, index, yen) => {
    const e = event(key)
    const x = e.exchanges[index]
    if (!x || !e.price) throw new Error('データが無い')
    expect(exchangeYen(x, e.price)).toBe(yen)
  })

  it('割り切れない組み合わせでも、円未満を四捨五入した整数になる', () => {
    const price = { amount: 12, yen: 1500 }
    const yen = (gain: number): number => exchangeYen({ cost: 5000, gain, times: 1, kind: 'must' }, price)
    expect(yen(7)).toBe(875)
    expect(yen(1)).toBe(125)
    expect(yen(5)).toBe(625)
    for (let gain = 1; gain <= 200; gain++) expect(Number.isInteger(yen(gain))).toBe(true)
    // 割り切れない値は四捨五入する
    expect(exchangeYen({ cost: 5000, gain: 1, times: 1, kind: 'must' }, { amount: 3, yen: 100 })).toBe(33)
    expect(exchangeYen({ cost: 5000, gain: 2, times: 1, kind: 'must' }, { amount: 3, yen: 100 })).toBe(67)
  })

  it('必ずの交換は、任意（基準）より銀塊あたりの額が大きい＝お得', () => {
    const perSilver = SILVER_EVENTS.flatMap((e) =>
      e.exchanges.map((x) => ({ kind: x.kind, rate: e.price ? exchangeYen(x, e.price) / x.cost : 0 })),
    )
    const base = Math.max(...perSilver.filter((x) => x.kind === 'optional').map((x) => x.rate))
    for (const x of perSilver.filter((p) => p.kind === 'must')) {
      expect(x.rate).toBeGreaterThan(base)
    }
  })

  it('交換の月の銀塊は 1回ぶん × 回数', () => {
    expect(event('gold').exchanges.map(exchangeTotal)).toEqual([30_000, 150_000])
  })
})

describe('紫晶石 → 銀塊の交換の上限（SPEC §14.2）', () => {
  it('銀塊 5,000 個を1単位として月に50回、250,000 まで', () => {
    expect([EXCHANGE_UNIT, EXCHANGE_LIMIT, MONTHLY_CAP]).toEqual([5_000, 50, 250_000])
  })

  it.each<[number, number]>([
    [0, 0],
    [5_000, 1],
    [85_000, 17],
    [235_000, 47],
    [250_000, 50],
    [250_001, 51], // 端数は1回ぶんに切り上げる
  ])('銀塊 %i には %i 回の交換が要る', (silver, times) => {
    expect(exchangesNeeded(silver)).toBe(times)
  })

  it('すべて交換しても 47回で、上限の50回に収まる', () => {
    const p = planSilver(DEFAULT_DAMAGE)
    expect([p.exchanges, p.overCap]).toEqual([47, false])
  })

  it('任意の交換を入れなければ 17回', () => {
    const p = planSilver(DEFAULT_DAMAGE, { gold: false })
    expect([p.exchanges, p.overCap]).toEqual([17, false])
  })

  it('いまのデータでは、どの条件でも上限を超えない', () => {
    const max = SILVER_EVENTS.reduce((s, e) => s + mustTotal(e) + optionalTotal(e), 0)
    expect(max).toBeLessThanOrEqual(MONTHLY_CAP)
  })

  it('どの交換も、1単位（5,000）の倍数の銀塊を使う', () => {
    for (const x of SILVER_EVENTS.flatMap((e) => e.exchanges)) {
      expect(x.cost % EXCHANGE_UNIT).toBe(0)
    }
  })
})

describe('parseDamage', () => {
  it.each<[string, number | null, boolean]>([
    ['20500', 20500, false],
    ['20,500', 20500, false],
    ['0', 0, false], // ダメージ報酬が無い人もいる
    ['-0', 0, false], // 0 として扱う（「-0 / 週」と出さない）
    ['２0500', 20500, false], // 全角まじりでも桁を落とさない（以前は 500 になっていた）
    ['２０，５００', 20500, false],
    [String(MAX_DAMAGE), MAX_DAMAGE, false],
    ['', null, true],
    ['abc', null, true],
    ['-1', null, true],
    ['100.5', null, true],
    [String(MAX_DAMAGE + 1), null, true],
  ])('%o → value=%o invalid=%o', (input, value, invalid) => {
    expect(parseDamage(input)).toEqual({ value, invalid })
  })
})

describe('weeklyReserves', () => {
  it('SPEC §14.6 の例', () => {
    expect(weeklyReserves([180_000, 25_000, 0, 30_000], 74_500)).toEqual([105_500, 0, 0, 61_000])
  })

  it('どの週も入手でまかなえるなら、貯えは要らない', () => {
    expect(weeklyReserves([30_000, 25_000, 0, 30_000], 74_500)).toEqual([0, 0, 0, 0])
  })

  it('入手がちょうど必要量と同じでも解がある', () => {
    expect(weeklyReserves([40, 0, 0, 0], 10)).toEqual([30, 0, 10, 20])
  })

  it('毎月の入手が必要量に届かなければ null', () => {
    expect(weeklyReserves([41, 0, 0, 0], 10)).toBeNull()
  })

  it('返した貯えで回り続けられ、それより1少ないと途中で足りなくなる（最小である）', () => {
    const cases: [number[], number][] = [
      [[180_000, 25_000, 0, 30_000], 74_500],
      [[180_000, 25_000, 0, 30_000], 58_750], // 入手 = 必要量
      [[0, 0, 0, 200], 60],
      [[100, 100, 0, 0], 55],
      [[10, 300, 10, 10], 90],
    ]
    for (const [uses, weekly] of cases) {
      const reserve = weeklyReserves(uses, weekly)
      if (!reserve) throw new Error('解があるはず')
      // 週 i から始めたときの並びで確かめる
      uses.forEach((_, i) => {
        const rotated = [...uses.slice(i), ...uses.slice(0, i)]
        const start = reserve[i] ?? 0
        expect(survives(rotated, weekly, start)).toBe(true)
        if (start > 0) expect(survives(rotated, weekly, start - 1)).toBe(false)
      })
    }
  })
})

describe('planSilver', () => {
  it('初期値・すべて交換（SPEC §14.6 の表）', () => {
    const p = planSilver(DEFAULT_DAMAGE)
    expect(p.weeklyIncome).toBe(74_500)
    expect(p.monthlyIncome).toBe(298_000)
    expect(p.monthlyNeed).toBe(235_000)
    expect(p.balance).toBe(63_000)
    expect(p.weeks.map((w) => [w.week, w.event.name, w.reserve, w.use, w.free])).toEqual([
      [1, '閃金', 105_500, 180_000, 0],
      [2, '百発百中', 0, 25_000, 49_500],
      [3, '戦争準備', 0, 0, 13_500],
      [4, '賞金稼ぎ', 61_000, 30_000, 0],
    ])
  })

  it('自由に使える量の合計は、月の余りに一致する', () => {
    for (const damage of [4_750, 10_000, 20_500, 100_000]) {
      for (const gold of [true, false]) {
        const p = planSilver(damage, { gold })
        expect(p.weeks.reduce((s, w) => s + (w.free ?? 0), 0)).toBe(p.balance)
        expect(p.weeks.every((w) => (w.free ?? 0) >= 0 && (w.reserve ?? 0) >= 0)).toBe(true)
      }
    }
  })

  it('閃金をお金で上限まで買わないなら、任意の 150,000 を必要量に入れない', () => {
    const p = planSilver(DEFAULT_DAMAGE, { gold: false })
    expect(p.monthlyNeed).toBe(85_000)
    expect(p.balance).toBe(213_000)
    expect(p.weeks[0]?.use).toBe(30_000)
    expect(p.weeks[0]?.optionalUse).toBe(0)
    // どの週も入手でまかなえるので、貯えは要らない
    expect(p.weeks.map((w) => w.reserve)).toEqual([0, 0, 0, 0])
  })

  it('指定が無いイベントは「上限まで買う」として扱う', () => {
    expect(planSilver(DEFAULT_DAMAGE, {}).monthlyNeed).toBe(235_000)
    expect(planSilver(DEFAULT_DAMAGE, { gold: true }).weeks[0]?.optionalUse).toBe(150_000)
  })

  it('ダメージ報酬が週 4,750 なら入手と必要量がちょうど同じ', () => {
    const p = planSilver(4_750)
    expect(p.balance).toBe(0)
    expect(p.weeks.every((w) => w.reserve !== null)).toBe(true)
  })

  it('それより少ないと不足し、週ごとの貯えは求めない', () => {
    const p = planSilver(4_749)
    expect(p.balance).toBe(-4)
    expect(p.weeks.map((w) => [w.reserve, w.free])).toEqual(Array(4).fill([null, null]))
    expect(p.weeks.map((w) => w.use)).toEqual([180_000, 25_000, 0, 30_000])
  })
})
