import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CARRY,
  DEFAULT_DAMAGE,
  EXCHANGE_LIMIT,
  EXCHANGE_UNIT,
  MAX_CARRY,
  MAX_DAMAGE,
  MONTHLY_CAP,
  SILVER_EVENTS,
  exchangeTotal,
  exchangeYen,
  exchangesNeeded,
  mustTotal,
  optionalTotal,
  parseCarry,
  parseDamage,
  planSilver,
  snapCarry,
  weeklyBaseIncome,
} from './silver'

const event = (key: string) => {
  const e = SILVER_EVENTS.find((x) => x.key === key)
  if (!e) throw new Error(`${key} が無い`)
  return e
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
      ['賞金稼ぎ', 30_000, 60_000],
    ])
  })

  it('必ずの合計 85,000、任意の合計 210,000、月合計 295,000', () => {
    const must = SILVER_EVENTS.reduce((s, e) => s + mustTotal(e), 0)
    const optional = SILVER_EVENTS.reduce((s, e) => s + optionalTotal(e), 0)
    expect([must, optional, must + optional]).toEqual([85_000, 210_000, 295_000])
  })

  it('任意の交換があるのは閃金と賞金稼ぎ', () => {
    expect(SILVER_EVENTS.filter((e) => optionalTotal(e) > 0).map((e) => e.name)).toEqual([
      '閃金',
      '賞金稼ぎ',
    ])
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
    ['bounty', 0, 1200], // 80 賞金稼ぎ用弾丸（200 個で 3,000 円）
    ['bounty', 1, 1500], // 100 賞金稼ぎ用弾丸（お金と同じレート）
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

  // 任意の交換を両方入れると 295,000（59回ぶん）で、月の上限 250,000（50回）を超える。
  // 交換回数は上限の 50 で止め、足りない銀塊を silverShortage に出す
  it.each<[boolean, boolean, number, number, number, number]>([
    [true, true, 295_000, 50, 45_000, 48_000],
    [true, false, 235_000, 47, 0, 63_000],
    [false, true, 145_000, 29, 0, 153_000],
    [false, false, 85_000, 17, 0, 213_000],
  ])(
    '閃金 %o・賞金稼ぎ %o → 必要量 %i、交換 %i 回、銀塊の不足 %i、紫晶石の余り %i',
    (gold, bounty, need, times, shortage, balance) => {
      const p = planSilver(DEFAULT_DAMAGE, { gold, bounty })
      expect([p.monthlyNeed, p.exchanges, p.silverShortage, p.balance]).toEqual([
        need,
        times,
        shortage,
        balance,
      ])
      expect(p.exchangeAmount).toBe(times * EXCHANGE_UNIT)
      expect(p.exchanges).toBeLessThanOrEqual(EXCHANGE_LIMIT)
    },
  )

  it('必ずの交換だけなら、上限に収まる', () => {
    const must = SILVER_EVENTS.reduce((s, e) => s + mustTotal(e), 0)
    expect(must).toBeLessThanOrEqual(MONTHLY_CAP)
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
    ['', 0, false], // 欄を空にしたときは 0 として扱う
    ['   ', 0, false],
    ['abc', null, true], // 空欄以外の不正な値は、これまでどおり入力ミス
    ['-', null, true],
    ['-1', null, true],
    ['100.5', null, true],
    [String(MAX_DAMAGE + 1), null, true],
  ])('%o → value=%o invalid=%o', (input, value, invalid) => {
    expect(parseDamage(input)).toEqual({ value, invalid })
  })
})

/** 4週間の流れを [必要量, 入手量, 交換回数, 不足分, 繰越量（出）] の配列にする */
const flow = (p: ReturnType<typeof planSilver>): number[][] =>
  p.weeks.map((w) => [w.use, w.gain, w.gainTimes, w.shortfall, w.carryOver])

describe('planSilver: 月の集計', () => {
  it('初期値・すべて交換', () => {
    const p = planSilver(DEFAULT_DAMAGE)
    expect(p.weeklyIncome).toBe(74_500)
    expect(p.monthlyIncome).toBe(298_000)
    expect(p.monthlyNeed).toBe(295_000)
    expect(p.carry).toBe(DEFAULT_CARRY)
    // 交換できるのは 250,000 までなので、紫晶石は 298,000 − 250,000 = 48,000 余る
    expect(p.balance).toBe(48_000)
  })

  it('どちらもお金で上限まで買わないなら、任意の 210,000 を必要量に入れない', () => {
    const p = planSilver(DEFAULT_DAMAGE, { gold: false, bounty: false })
    expect(p.monthlyNeed).toBe(85_000)
    expect(p.balance).toBe(213_000)
    expect(p.weeks.map((w) => [w.use, w.optionalUse])).toEqual([
      [30_000, 0],
      [25_000, 0],
      [0, 0],
      [30_000, 0],
    ])
  })

  it('指定が無いイベントは「上限まで買う」として扱う', () => {
    expect(planSilver(DEFAULT_DAMAGE, {}).monthlyNeed).toBe(295_000)
    const p = planSilver(DEFAULT_DAMAGE, { gold: true })
    expect([p.weeks[0]?.optionalUse, p.weeks[3]?.optionalUse]).toEqual([150_000, 60_000])
  })

})

describe('planSilver: 紫晶石が足りないとき（実際に交換できる量で計算する）', () => {
  it('交換回数は、手持ちの紫晶石で交換できるぶんまで', () => {
    const p = planSilver(0) // 入手 216,000。交換したいのは上限の 250,000（50回）
    expect([p.exchanges, p.exchangeAmount]).toEqual([43, 215_000])
    expect(p.amethystLimited).toBe(true)
    // 4週間の流れの交換回数の合計と一致する
    expect(p.weeks.reduce((s, w) => s + w.gainTimes, 0)).toBe(p.exchanges)
  })

  it('銀塊の不足は、上限で足りないぶんと紫晶石で足りないぶんを合わせた量', () => {
    const p = planSilver(0)
    expect(p.silverShortage).toBe(80_000) // 295,000 − 215,000（上限ぶん 45,000 ＋ 紫晶石ぶん 35,000）
  })

  it('上限には収まっていても、紫晶石が足りなければ銀塊は不足する', () => {
    // 必要 235,000（47回）は上限以内だが、紫晶石 216,000 では 43回（215,000）しか交換できない
    const p = planSilver(0, { bounty: false })
    expect([p.monthlyNeed, p.exchanges, p.exchangeAmount]).toEqual([235_000, 43, 215_000])
    expect(p.silverShortage).toBe(20_000)
    expect(p.amethystLimited).toBe(true)
  })

  it('紫晶石の余りは負にならない（交換できたぶんしか使わない）', () => {
    for (const damage of [0, 1_000, 10_000, 19_750, 20_500]) {
      for (const gold of [true, false]) {
        for (const bounty of [true, false]) {
          const p = planSilver(damage, { gold, bounty })
          expect(p.balance).toBeGreaterThanOrEqual(0)
          expect(p.balance).toBe(p.monthlyIncome - p.exchangeAmount)
        }
      }
    }
    expect(planSilver(0).balance).toBe(1_000) // 216,000 − 215,000。5,000 に満たない端数
  })

  it('紫晶石が足りていれば、交換したい量をそのまま交換できる', () => {
    const p = planSilver(DEFAULT_DAMAGE)
    expect([p.exchanges, p.amethystLimited, p.silverShortage]).toEqual([50, false, 45_000])
    const q = planSilver(0, { gold: false, bounty: false }) // 必要 85,000 なら紫晶石 216,000 で足りる
    expect([q.exchanges, q.amethystLimited, q.silverShortage]).toEqual([17, false, 0])
  })

  it('どの条件でも、銀塊の不足 ＝ 必要量 − 繰越 − 交換で手に入る銀塊（負にはならない）', () => {
    for (const damage of [0, 10_000, 20_500]) {
      for (const carry of [0, 45_000, 110_000, 295_000]) {
        for (const gold of [true, false]) {
          const p = planSilver(damage, { gold }, carry)
          expect(p.silverShortage).toBe(Math.max(0, p.monthlyNeed - carry - p.exchangeAmount))
          expect(p.exchanges).toBeLessThanOrEqual(EXCHANGE_LIMIT)
        }
      }
    }
  })
})

describe('planSilver: 4週間の流れ（SPEC §14.6。数字はすべて銀塊）', () => {
  it('初期値・すべて交換（SPEC §14.6 の表）', () => {
    const p = planSilver(DEFAULT_DAMAGE)
    expect(p.weeks.map((w) => w.event.name)).toEqual(['閃金', '百発百中', '戦争準備', '賞金稼ぎ'])
    expect(flow(p)).toEqual([
      // 必要量, 入手量, 交換回数, 不足分, 繰越量
      [180_000, 70_000, 14, 110_000, 0],
      [25_000, 75_000, 15, 0, 50_000],
      [0, 75_000, 15, 0, 125_000],
      [90_000, 30_000, 6, 0, 65_000], // 月の上限（50回）に達するので 6回まで
    ])
  })

  it('入手量の合計は今月交換する量と同じで、交換回数の合計も一致する', () => {
    for (const [gold, bounty, carry] of [
      [true, true, 0],
      [true, false, 0],
      [false, true, 0],
      [false, false, 0],
      [true, true, 65_000],
      [true, true, 110_000],
      [true, false, 110_000],
      [true, true, 295_000],
      [false, false, 3_000],
    ] as const) {
      const p = planSilver(DEFAULT_DAMAGE, { gold, bounty }, carry)
      expect(p.weeks.reduce((s, w) => s + w.gain, 0)).toBe(p.exchangeAmount)
      expect(p.weeks.reduce((s, w) => s + w.gainTimes, 0)).toBe(p.exchanges)
    }
  })

  it('入手量は 5,000 きざみで、端数の紫晶石は翌週に回る', () => {
    const p = planSilver(DEFAULT_DAMAGE)
    for (const w of p.weeks) expect(w.gain % EXCHANGE_UNIT).toBe(0)
    // 1週目は 74,500 → 70,000（端数 4,500）。2週目は 4,500 + 74,500 = 79,000 → 75,000
    expect(p.weeks.map((w) => w.gain).slice(0, 2)).toEqual([70_000, 75_000])
  })

  it('銀塊の出入りが合う: 繰越 ＋ 入手 ＝ 使えたぶん ＋ 次への繰越', () => {
    for (const carry of [0, 3_000, 65_000, 110_000, 295_000]) {
      for (const gold of [true, false]) {
        for (const bounty of [true, false]) {
          const p = planSilver(DEFAULT_DAMAGE, { gold, bounty }, carry)
          let silver = carry
          for (const w of p.weeks) {
            const used = w.use - w.shortfall // 実際に使えたぶん
            expect(silver + w.gain).toBe(used + w.carryOver)
            // 不足と繰越が同時に出ることはない
            expect(w.shortfall === 0 || w.carryOver === 0).toBe(true)
            silver = w.carryOver
          }
        }
      }
    }
  })

  it('月全体の不足: 週の不足分の合計 − 月末の繰越 ＝ 上限で足りない量（紫晶石が足りているとき）', () => {
    const p = planSilver(DEFAULT_DAMAGE)
    const shortfall = p.weeks.reduce((s, w) => s + w.shortfall, 0)
    expect(shortfall).toBe(110_000)
    expect(shortfall - (p.weeks[3]?.carryOver ?? 0)).toBe(p.silverShortage) // 110,000 − 65,000 = 45,000
  })

  it('閃金だけ任意を入れる（賞金稼ぎはお金で上限まで買わない）', () => {
    const p = planSilver(DEFAULT_DAMAGE, { bounty: false })
    expect([p.monthlyNeed, p.exchanges, p.balance]).toEqual([235_000, 47, 63_000])
    expect(flow(p)).toEqual([
      [180_000, 70_000, 14, 110_000, 0],
      [25_000, 75_000, 15, 0, 50_000],
      [0, 75_000, 15, 0, 125_000],
      [30_000, 15_000, 3, 0, 110_000],
    ])
  })

  it('賞金稼ぎだけ任意を入れる（閃金はお金で上限まで買わない）', () => {
    const p = planSilver(DEFAULT_DAMAGE, { gold: false })
    expect([p.monthlyNeed, p.exchanges, p.balance]).toEqual([145_000, 29, 153_000])
    // 今月ぶん（145,000）に達したら、それ以上は交換しない
    expect(flow(p)).toEqual([
      [30_000, 70_000, 14, 0, 40_000],
      [25_000, 75_000, 15, 0, 90_000],
      [0, 0, 0, 0, 90_000],
      [90_000, 0, 0, 0, 0],
    ])
  })

  it('任意を入れないなら、不足は出ない', () => {
    const p = planSilver(DEFAULT_DAMAGE, { gold: false, bounty: false })
    expect(flow(p)).toEqual([
      [30_000, 70_000, 14, 0, 40_000],
      [25_000, 15_000, 3, 0, 30_000],
      [0, 0, 0, 0, 30_000],
      [30_000, 0, 0, 0, 0],
    ])
  })

  it('紫晶石が足りないと、今月交換するぶんに届かない', () => {
    const p = planSilver(0) // 入手は週 54,000
    expect(flow(p)).toEqual([
      [180_000, 50_000, 10, 130_000, 0],
      [25_000, 55_000, 11, 0, 30_000],
      [0, 55_000, 11, 0, 85_000],
      [90_000, 55_000, 11, 0, 50_000],
    ])
    expect(p.weeks.reduce((s, w) => s + w.gain, 0)).toBe(215_000) // 交換したい 250,000 に届かない
  })
})

describe('planSilver: 前の週からの繰越（carryIn）', () => {
  it('1週目は前月繰越分、2週目からは前の週の繰越量', () => {
    for (const carry of [0, 65_000, 110_000, 295_000]) {
      const p = planSilver(DEFAULT_DAMAGE, {}, carry)
      expect(p.weeks[0]?.carryIn).toBe(carry)
      for (let i = 1; i < p.weeks.length; i++) {
        expect(p.weeks[i]?.carryIn).toBe(p.weeks[i - 1]?.carryOver)
      }
    }
  })

  it('どの週も 繰越（入）＋ 入手 − 必要 ＝ 繰越（出）− 不足分 になる', () => {
    for (const carry of [0, 3_000, 65_000, 110_000]) {
      for (const gold of [true, false]) {
        for (const bounty of [true, false]) {
          for (const w of planSilver(DEFAULT_DAMAGE, { gold, bounty }, carry).weeks) {
            expect(w.carryIn + w.gain - w.use).toBe(w.carryOver - w.shortfall)
          }
        }
      }
    }
  })

  it('初期状態の繰越（入）', () => {
    expect(planSilver(DEFAULT_DAMAGE).weeks.map((w) => w.carryIn)).toEqual([0, 0, 50_000, 125_000])
  })
})

describe('planSilver: 4週間の流れと前月繰越分', () => {
  it('前月繰越分は1週目から使える', () => {
    // 前月の4週目の繰越量（65,000）を入れた翌月
    const p = planSilver(DEFAULT_DAMAGE, {}, 65_000)
    expect([p.exchanges, p.silverShortage]).toEqual([46, 0])
    expect(flow(p)).toEqual([
      [180_000, 70_000, 14, 45_000, 0], // 65,000 + 70,000 = 135,000 で、まだ 45,000 足りない
      [25_000, 75_000, 15, 0, 50_000],
      [0, 75_000, 15, 0, 125_000],
      [90_000, 10_000, 2, 0, 45_000],
    ])
  })

  it('繰越が 110,000 あれば、閃金の週も足りる', () => {
    const p = planSilver(DEFAULT_DAMAGE, {}, 110_000)
    expect(flow(p)).toEqual([
      [180_000, 70_000, 14, 0, 0], // 110,000 + 70,000 = 180,000 ちょうど
      [25_000, 75_000, 15, 0, 50_000],
      [0, 40_000, 8, 0, 90_000],
      [90_000, 0, 0, 0, 0],
    ])
    expect(p.weeks.every((w) => w.shortfall === 0)).toBe(true)
  })

  it('繰越だけで足りるなら交換せず、使ったぶんだけ繰越が減っていく', () => {
    const p = planSilver(DEFAULT_DAMAGE, {}, 295_000)
    expect(flow(p)).toEqual([
      [180_000, 0, 0, 0, 115_000],
      [25_000, 0, 0, 0, 90_000],
      [0, 0, 0, 0, 90_000],
      [90_000, 0, 0, 0, 0],
    ])
  })

  it('5,000 の倍数でない繰越は、使い切れずに残る', () => {
    // 必要 85,000 − 繰越 3,000 = 82,000 → 17回（85,000）交換するので、3,000 が残る
    const p = planSilver(DEFAULT_DAMAGE, { gold: false, bounty: false }, 3_000)
    expect(p.weeks[3]?.carryOver).toBe(3_000)
  })

  // 翌月のための前倒しはしない（SPEC §14.6）。今月の必要量ぶんしか交換しないので、
  // 月末の繰越が翌月の閃金に足りるかは、4週目の繰越量を見て利用者が判断する
  it('月末の繰越量を翌月の前月繰越分に入れると、続きの月を計算できる', () => {
    const first = planSilver(DEFAULT_DAMAGE, { bounty: false })
    const carry = first.weeks[3]?.carryOver ?? 0
    expect(carry).toBe(110_000)
    const second = planSilver(DEFAULT_DAMAGE, { bounty: false }, carry)
    expect(flow(second)).toEqual([
      [180_000, 70_000, 14, 0, 0],
      [25_000, 55_000, 11, 0, 30_000],
      [0, 0, 0, 0, 30_000],
      [30_000, 0, 0, 0, 0],
    ])
  })
})

describe('前月繰越分（SPEC §14.6）', () => {
  it.each<[number, number, number, number, number]>([
    // 繰越, 交換回数, 交換に使う紫晶石, 銀塊の不足, 紫晶石の余り
    [0, 50, 250_000, 45_000, 48_000],
    [10_000, 50, 250_000, 35_000, 48_000],
    [44_999, 50, 250_000, 1, 48_000],
    [45_000, 50, 250_000, 0, 48_000], // ちょうど上限いっぱいで足りる
    [45_001, 50, 250_000, 0, 48_000], // 249,999 は 50回に切り上げ
    [50_000, 49, 245_000, 0, 53_000],
    [100_000, 39, 195_000, 0, 103_000],
    [295_000, 0, 0, 0, 298_000], // 繰越だけで足りる
    [400_000, 0, 0, 0, 298_000], // 必要量より多くても負にならない
  ])('繰越 %i → 交換 %i 回（%i）、銀塊の不足 %i、紫晶石の余り %i', (carry, times, amount, shortage, balance) => {
    const p = planSilver(DEFAULT_DAMAGE, {}, carry)
    expect([p.carry, p.exchanges, p.exchangeAmount, p.silverShortage, p.balance]).toEqual([
      carry,
      times,
      amount,
      shortage,
      balance,
    ])
  })

  it('必要量そのものは繰越で変わらない', () => {
    expect(planSilver(DEFAULT_DAMAGE, {}, 100_000).monthlyNeed).toBe(295_000)
  })

  it('紫晶石が足りているときの不足の条件は「必要量 − 繰越 > 250,000」', () => {
    for (const carry of [0, 44_999, 45_000, 45_001]) {
      const p = planSilver(DEFAULT_DAMAGE, {}, carry)
      expect(p.silverShortage > 0).toBe(p.monthlyNeed - carry > MONTHLY_CAP)
      expect(p.silverShortage).toBe(Math.max(0, p.monthlyNeed - carry - MONTHLY_CAP))
    }
  })

  it('指定しなければ繰越は 0', () => {
    expect(planSilver(DEFAULT_DAMAGE).carry).toBe(0)
  })
})

describe('snapCarry（前月繰越分を 5,000 きざみ・0〜上限にそろえる）', () => {
  it.each<[number, number]>([
    [0, 0],
    [5_000, 5_000],
    [12_345, 10_000], // 5,000 の倍数に切り下げる
    [4_999, 0],
    [-5_000, 0], // 0 より下がらない
    [MAX_CARRY, MAX_CARRY],
    [MAX_CARRY + 5_000, MAX_CARRY], // 上限を超えない
  ])('%i → %i', (input, expected) => {
    expect(snapCarry(input)).toBe(expected)
  })

  it('上限は 5,000 の倍数', () => {
    expect(MAX_CARRY % EXCHANGE_UNIT).toBe(0)
  })
})

describe('parseCarry', () => {
  it.each<[string, number | null, boolean]>([
    ['0', 0, false],
    ['45,000', 45000, false],
    ['４５０００', 45000, false],
    ['', null, true],
    ['-1', null, true],
    ['1.5', null, true],
    ['10000000', null, true],
  ])('%o → value=%o invalid=%o', (input, value, invalid) => {
    expect(parseCarry(input)).toEqual({ value, invalid })
  })
})
