import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CARRY,
  DEFAULT_DAMAGE,
  EVENT_ORIGIN,
  EXCHANGE_LIMIT,
  EXCHANGE_UNIT,
  MAX_CARRY,
  MAX_DAMAGE,
  MONTHLY_CAP,
  SILVER_EVENTS,
  calendarWeeks,
  dailyIncome,
  daysInMonth,
  exchangeTotal,
  exchangeYen,
  exchangesNeeded,
  monthEvents,
  mustTotal,
  nextMonth,
  optionalTotal,
  parseCarry,
  parseDamage,
  planCalendar,
  recommendedCarry,
  snapCarry,
  todayYmd,
} from './silver'
import type { MonthPlan, YearMonth, Ymd } from './silver'

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

const NOV: YearMonth = { year: 2026, month: 11 }
const md = (d: Ymd): string => `${d.month}/${d.day}`

/** 2か月ぶんのイベントを [開始日, 名前, 繰越（入）, 入手量, 必要量, 不足分, 繰越（出）] の配列にする */
const flow = (months: readonly MonthPlan[]): (string | number)[][] =>
  months.flatMap((m) =>
    m.events.map((e) => [md(e.start), e.event.name, e.carryIn, e.gain, e.use, e.shortfall, e.carryOver]),
  )

/** 月ごとの結果を [必要量, 交換回数, 不足する銀塊, 入手量, 紫晶石の余り] の配列にする */
const summary = (months: readonly MonthPlan[]): number[][] =>
  months.map((m) => [m.need, m.exchanges, m.silverShortage, m.income, m.balance])

describe('イベントの予定（SPEC §14.6）', () => {
  it('起点は 2026-11-03（火）で、その週が閃金', () => {
    expect(EVENT_ORIGIN).toEqual({ year: 2026, month: 11, day: 3 })
    expect(monthEvents(NOV)[0]?.event.name).toBe('閃金')
  })

  it('2026年11月は4つ（閃金 → 百発百中 → 戦争準備 → 賞金稼ぎ）', () => {
    expect(monthEvents(NOV).map((e) => [md(e.start), md(e.end), e.event.name])).toEqual([
      ['11/3', '11/8', '閃金'],
      ['11/10', '11/15', '百発百中'],
      ['11/17', '11/22', '戦争準備'],
      ['11/24', '11/29', '賞金稼ぎ'],
    ])
  })

  it('2026年12月は火曜日が5回あり、閃金が2回入る', () => {
    expect(monthEvents({ year: 2026, month: 12 }).map((e) => [md(e.start), e.event.name])).toEqual([
      ['12/1', '閃金'],
      ['12/8', '百発百中'],
      ['12/15', '戦争準備'],
      ['12/22', '賞金稼ぎ'],
      ['12/29', '閃金'],
    ])
  })

  it('月をまたぐイベントは開始日の月に数え、その月の末日に精算する', () => {
    const last = monthEvents({ year: 2026, month: 12 })[4]
    expect(last?.start).toEqual({ year: 2026, month: 12, day: 29 })
    expect(last?.end).toEqual({ year: 2027, month: 1, day: 3 }) // 日曜日は翌年
    expect(last?.settle).toEqual({ year: 2026, month: 12, day: 31 })
    // 翌月（2027年1月）のイベントには入らない
    expect(monthEvents({ year: 2027, month: 1 }).map((e) => [md(e.start), e.event.name])).toEqual([
      ['1/5', '百発百中'],
      ['1/12', '戦争準備'],
      ['1/19', '賞金稼ぎ'],
      ['1/26', '閃金'],
    ])
  })

  it('月をまたがないイベントは、最終日（日曜日）に精算する', () => {
    for (const e of monthEvents(NOV)) expect(e.settle).toEqual(e.end)
  })

  it('起点より前の月にも、同じ周期をさかのぼって当てはめる', () => {
    expect(monthEvents({ year: 2026, month: 10 }).map((e) => [md(e.start), e.event.name])).toEqual([
      ['10/6', '閃金'],
      ['10/13', '百発百中'],
      ['10/20', '戦争準備'],
      ['10/27', '賞金稼ぎ'],
    ])
  })

  it('どの月も、イベントは火曜日に始まり4〜5回で、開催順が崩れない', () => {
    let ym: YearMonth = { year: 2025, month: 1 }
    const names: string[] = []
    for (let i = 0; i < 48; i++) {
      const events = monthEvents(ym)
      expect([4, 5]).toContain(events.length)
      for (const e of events) {
        expect(new Date(Date.UTC(e.start.year, e.start.month - 1, e.start.day)).getUTCDay()).toBe(2)
        names.push(e.event.name)
      }
      ym = nextMonth(ym)
    }
    const order = SILVER_EVENTS.map((e) => e.name)
    const offset = order.indexOf(names[0] as string)
    names.forEach((name, i) => expect(name).toBe(order[(offset + i) % order.length]))
  })
})

describe('暦の小さな関数', () => {
  it('daysInMonth', () => {
    expect(daysInMonth({ year: 2026, month: 11 })).toBe(30)
    expect(daysInMonth({ year: 2026, month: 12 })).toBe(31)
    expect(daysInMonth({ year: 2027, month: 2 })).toBe(28)
    expect(daysInMonth({ year: 2028, month: 2 })).toBe(29) // うるう年
  })

  it('nextMonth は年をまたぐ', () => {
    expect(nextMonth({ year: 2026, month: 11 })).toEqual({ year: 2026, month: 12 })
    expect(nextMonth({ year: 2026, month: 12 })).toEqual({ year: 2027, month: 1 })
  })

  it('todayYmd は端末の時計の日付を返す', () => {
    expect(todayYmd(new Date(2026, 10, 25, 23, 59))).toEqual({ year: 2026, month: 11, day: 25 })
    expect(todayYmd(new Date(2027, 0, 1, 0, 0))).toEqual({ year: 2027, month: 1, day: 1 })
  })

  it('毎日の入手は 連盟対決報酬 6,500 ＋ 晶石ボス 2,500 ＝ 9,000', () => {
    expect(dailyIncome()).toBe(9_000)
  })
})

describe('calendarWeeks（月曜始まりのカレンダーと、イベントの帯）', () => {
  const rows = (ym: YearMonth): string[] =>
    calendarWeeks(ym).map((w) => {
      const days = w.days.map((d) => (d === null ? '--' : String(d).padStart(2, '0'))).join(' ')
      const band = w.band
        ? ` ${w.band.event.name}[${w.band.from}-${w.band.to}]${w.band.continued ? '（続き）' : ''}`
        : ''
      return days + band
    })

  it('2026年11月（1日が日曜日）', () => {
    expect(rows(NOV)).toEqual([
      '-- -- -- -- -- -- 01 賞金稼ぎ[6-6]（続き）', // 10/27 に始まった賞金稼ぎの最終日
      '02 03 04 05 06 07 08 閃金[1-6]',
      '09 10 11 12 13 14 15 百発百中[1-6]',
      '16 17 18 19 20 21 22 戦争準備[1-6]',
      '23 24 25 26 27 28 29 賞金稼ぎ[1-6]',
      '30 -- -- -- -- -- --', // 月曜日だけの週は、帯が無い
    ])
  })

  it('2026年12月（月をまたぐ閃金は、月末までの帯になる）', () => {
    expect(rows({ year: 2026, month: 12 })).toEqual([
      '-- 01 02 03 04 05 06 閃金[1-6]',
      '07 08 09 10 11 12 13 百発百中[1-6]',
      '14 15 16 17 18 19 20 戦争準備[1-6]',
      '21 22 23 24 25 26 27 賞金稼ぎ[1-6]',
      '28 29 30 31 -- -- -- 閃金[1-3]',
    ])
  })

  it('2027年1月（前の月に始まった閃金の続きから始まる）', () => {
    expect(rows({ year: 2027, month: 1 })[0]).toBe('-- -- -- -- 01 02 03 閃金[4-6]（続き）')
  })

  it('帯の「続き」でない週の数は、その月のイベントの数と同じ', () => {
    let ym: YearMonth = { year: 2026, month: 1 }
    for (let i = 0; i < 24; i++) {
      const own = calendarWeeks(ym).filter((w) => w.band && !w.band.continued)
      expect(own.map((w) => w.band?.event.name)).toEqual(monthEvents(ym).map((e) => e.event.name))
      ym = nextMonth(ym)
    }
  })

  it('日付は 1 から月末まで、抜けも重複も無く並ぶ', () => {
    for (const ym of [NOV, { year: 2026, month: 12 }, { year: 2027, month: 2 }, { year: 2028, month: 2 }]) {
      const days = calendarWeeks(ym).flatMap((w) => w.days.filter((d): d is number => d !== null))
      expect(days).toEqual(Array.from({ length: daysInMonth(ym) }, (_, i) => i + 1))
    }
  })
})

describe('planCalendar: 紫晶石の入手（SPEC §14.6）', () => {
  it('11月は 月〜土 25日 × 9,000 ＋ 月曜 5回 × 20,500 ＝ 327,500', () => {
    const [nov] = planCalendar(NOV, DEFAULT_DAMAGE)
    expect([nov?.incomeDays, nov?.mondays, nov?.income]).toEqual([25, 5, 327_500])
  })

  it('12月は 27日 × 9,000 ＋ 月曜 4回 × 20,500 ＝ 325,000', () => {
    const dec = planCalendar(NOV, DEFAULT_DAMAGE)[1]
    expect([dec?.incomeDays, dec?.mondays, dec?.income]).toEqual([27, 4, 325_000])
  })

  it('ダメージ報酬は月曜日の回数ぶんだけ効く', () => {
    const [nov, dec] = planCalendar(NOV, 0)
    expect([nov?.income, dec?.income]).toEqual([225_000, 243_000])
  })
})

describe('planCalendar: 2026年11月・12月（SPEC §14.6 の例）', () => {
  it('初期値・スイッチは両方オン', () => {
    const p = planCalendar(NOV, DEFAULT_DAMAGE)
    expect(p.map((m) => [m.year, m.month])).toEqual([
      [2026, 11],
      [2026, 12],
    ])
    expect(flow(p)).toEqual([
      // 開始日, 名前, 繰越（入）, 入手量, 必要量, 不足分, 繰越（出）
      ['11/3', '閃金', 0, 70_000, 180_000, 110_000, 0],
      ['11/10', '百発百中', 0, 75_000, 25_000, 0, 50_000],
      ['11/17', '戦争準備', 50_000, 75_000, 0, 0, 125_000],
      ['11/24', '賞金稼ぎ', 125_000, 30_000, 90_000, 0, 65_000], // 11月の上限（50回）に達する
      ['12/1', '閃金', 65_000, 45_000, 180_000, 70_000, 0], // 11/30 の紫晶石は持ち越さない
      ['12/8', '百発百中', 0, 70_000, 25_000, 0, 45_000],
      ['12/15', '戦争準備', 45_000, 75_000, 0, 0, 120_000],
      ['12/22', '賞金稼ぎ', 120_000, 60_000, 90_000, 0, 90_000], // 12月の上限に達する
      ['12/29', '閃金', 90_000, 0, 180_000, 90_000, 0],
    ])
    expect(summary(p)).toEqual([
      // 必要量, 交換回数, 不足する銀塊, 入手量, 紫晶石の余り
      [295_000, 50, 110_000, 327_500, 77_500],
      [475_000, 50, 160_000, 325_000, 75_000],
    ])
    expect(p.map((m) => m.carryIn)).toEqual([0, 65_000]) // 2か月目は1か月目の月末の残りから始まる
  })

  it('賞金稼ぎのスイッチをオフ', () => {
    const p = planCalendar(NOV, DEFAULT_DAMAGE, { bounty: false })
    expect(summary(p)).toEqual([
      [235_000, 50, 110_000, 327_500, 77_500],
      [415_000, 50, 40_000, 325_000, 75_000],
    ])
    expect(flow(p).map((r) => [r[0], r[5]]).filter((r) => r[1] !== 0)).toEqual([
      ['11/3', 110_000],
      ['12/1', 10_000],
      ['12/29', 30_000],
    ])
  })

  it('閃金のスイッチをオフ（翌月ぶんを前倒しで交換するので、11月は上限まで使う）', () => {
    const p = planCalendar(NOV, DEFAULT_DAMAGE, { gold: false })
    expect(summary(p)).toEqual([
      [145_000, 50, 0, 327_500, 77_500],
      [175_000, 14, 0, 325_000, 255_000],
    ])
  })

  it('スイッチを両方オフ（2か月ぶんを11月のうちに交換し終える）', () => {
    const p = planCalendar(NOV, DEFAULT_DAMAGE, { gold: false, bounty: false })
    expect(summary(p)).toEqual([
      [85_000, 40, 0, 327_500, 127_500], // 85,000 ＋ 115,000 ＝ 200,000 を前倒しで交換
      [115_000, 0, 0, 325_000, 325_000],
    ])
    expect(flow(p).map((r) => r[3])).toEqual([70_000, 75_000, 55_000, 0, 0, 0, 0, 0, 0])
    expect(p[1]?.events.at(-1)?.carryOver).toBe(0) // ちょうど使い切る
  })

  it('前月繰越分 110,000（11/3 の閃金が足りる）', () => {
    const p = planCalendar(NOV, DEFAULT_DAMAGE, {}, 110_000)
    expect(flow(p)[0]).toEqual(['11/3', '閃金', 110_000, 70_000, 180_000, 0, 0])
    expect(summary(p)).toEqual([
      [295_000, 50, 0, 327_500, 77_500],
      [475_000, 50, 160_000, 325_000, 75_000],
    ])
    expect(p.map((m) => m.carryIn)).toEqual([110_000, 65_000])
  })

  it('ダメージ報酬 0（紫晶石が足りず、上限まで交換できない）', () => {
    const p = planCalendar(NOV, 0)
    expect(summary(p)).toEqual([
      [295_000, 45, 130_000, 225_000, 0],
      [475_000, 48, 175_000, 243_000, 3_000],
    ])
    expect(p.map((m) => m.amethystLimited)).toEqual([true, true])
  })

  it('紫晶石が足りていれば amethystLimited は false', () => {
    expect(planCalendar(NOV, DEFAULT_DAMAGE).map((m) => m.amethystLimited)).toEqual([false, false])
  })
})

describe('planCalendar: ほかの月', () => {
  it('2026年12月・2027年1月', () => {
    const p = planCalendar({ year: 2026, month: 12 }, DEFAULT_DAMAGE)
    expect(p.map((m) => [m.year, m.month])).toEqual([
      [2026, 12],
      [2027, 1],
    ])
    expect(flow(p)).toEqual([
      ['12/1', '閃金', 0, 45_000, 180_000, 135_000, 0],
      ['12/8', '百発百中', 0, 70_000, 25_000, 0, 45_000],
      ['12/15', '戦争準備', 45_000, 75_000, 0, 0, 120_000],
      ['12/22', '賞金稼ぎ', 120_000, 60_000, 90_000, 0, 90_000],
      ['12/29', '閃金', 90_000, 0, 180_000, 90_000, 0],
      ['1/5', '百発百中', 0, 90_000, 25_000, 0, 65_000], // 1/1〜1/2 の入手も、次のイベントの行に入る
      ['1/12', '戦争準備', 65_000, 75_000, 0, 0, 140_000],
      ['1/19', '賞金稼ぎ', 140_000, 75_000, 90_000, 0, 125_000],
      ['1/26', '閃金', 125_000, 10_000, 180_000, 45_000, 0],
    ])
    expect(summary(p)).toEqual([
      [475_000, 50, 225_000, 325_000, 75_000],
      [295_000, 50, 45_000, 316_000, 66_000],
    ])
  })

  it('2026年10月・11月（上限が残っていても、週の入手が足りなければ不足する）', () => {
    const p = planCalendar({ year: 2026, month: 10 }, DEFAULT_DAMAGE)
    expect(summary(p)).toEqual([
      [295_000, 50, 80_000, 325_000, 75_000],
      [295_000, 37, 75_000, 327_500, 142_500], // 上限は 13回残るが、11/3 の閃金に間に合わない
    ])
  })
})

describe('planCalendar: 不変条件', () => {
  const cases = (): MonthPlan[][] => {
    const out: MonthPlan[][] = []
    let ym: YearMonth = { year: 2026, month: 1 }
    for (let i = 0; i < 18; i++) {
      for (const damage of [0, 20_500, 100_000]) {
        for (const gold of [true, false]) {
          for (const carry of [0, 45_000, 300_000]) {
            out.push(planCalendar(ym, damage, { gold }, carry))
          }
        }
      }
      ym = nextMonth(ym)
    }
    return out
  }

  it('銀塊の出入りが合う: 繰越（入）＋ 入手 − 必要 ＝ 繰越（出）− 不足分', () => {
    for (const months of cases()) {
      for (const e of months.flatMap((m) => m.events)) {
        expect(e.carryIn + e.gain - e.use).toBe(e.carryOver - e.shortfall)
        expect(e.shortfall === 0 || e.carryOver === 0).toBe(true)
        expect(e.gain).toBe(e.gainTimes * EXCHANGE_UNIT)
      }
    }
  })

  it('前のイベントの繰越（出）が、次のイベントの繰越（入）になる（月をまたいでも）', () => {
    for (const months of cases()) {
      const events = months.flatMap((m) => m.events)
      for (let i = 1; i < events.length; i++) {
        expect(events[i]?.carryIn).toBe(events[i - 1]?.carryOver)
      }
      // 2か月目の月初の銀塊は、1か月目の最後のイベントの繰越以上になる
      // （最後の精算のあと、月末までに前倒しで交換したぶんが上乗せされることがある）
      const lastCarry = months[0]?.events.at(-1)?.carryOver ?? 0
      expect(months[1]?.carryIn ?? 0).toBeGreaterThanOrEqual(lastCarry)
      expect(((months[1]?.carryIn ?? 0) - lastCarry) % EXCHANGE_UNIT).toBe(0)
    }
  })

  it('例: 11/30（月）に前倒しで交換したぶんは、12月の月初の銀塊に入る', () => {
    // ダメージ報酬 0・閃金オフだと、上限が月末まで残り、11/30 にも交換が続く
    const p = planCalendar({ year: 2026, month: 11 }, 0, { gold: false })
    const last = p[0]?.events.at(-1)?.carryOver ?? 0
    expect((p[1]?.carryIn ?? 0) - last).toBe(10_000) // 手持ちの端数 ＋ 11/30 の 9,000 で2回交換
    expect(p[1]?.events[0]?.carryIn).toBe(last)
    expect(p[1]?.events[0]?.gain).toBeGreaterThanOrEqual(5_000) // そのぶんは 12/1 のイベントの入手量に入る
  })

  it('交換回数は月 50 回を超えず、紫晶石の余りは負にならない', () => {
    for (const months of cases()) {
      for (const m of months) {
        expect(m.exchanges).toBeLessThanOrEqual(EXCHANGE_LIMIT)
        expect(m.exchangeAmount).toBe(m.exchanges * EXCHANGE_UNIT)
        expect(m.balance).toBe(m.income - m.exchangeAmount)
        expect(m.balance).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('イベントの入手量の合計は、2か月の交換量の合計と同じ', () => {
    for (const months of cases()) {
      const gained = months.flatMap((m) => m.events).reduce((s, e) => s + e.gain, 0)
      expect(gained).toBe(months.reduce((s, m) => s + m.exchangeAmount, 0))
    }
  })

  it('月の必要量と不足は、その月のイベントの合計', () => {
    for (const months of cases()) {
      for (const m of months) {
        expect(m.need).toBe(m.events.reduce((s, e) => s + e.use, 0))
        expect(m.silverShortage).toBe(m.events.reduce((s, e) => s + e.shortfall, 0))
      }
    }
  })

  it('必要以上には交換しない（2か月の終わりに残る銀塊は、5,000 に満たない端数だけ）', () => {
    for (const months of cases()) {
      const start = months[0]?.carryIn ?? 0
      const left = months[1]?.events.at(-1)?.carryOver ?? 0
      // 前月繰越分がもともと余っている場合を除く
      const need = months.reduce((s, m) => s + m.need, 0)
      if (start <= need) expect(left).toBeLessThan(EXCHANGE_UNIT)
    }
  })

  it('指定が無いイベントは「上限まで買う」として扱い、指定しなければ繰越は 0', () => {
    const p = planCalendar(NOV, DEFAULT_DAMAGE)
    expect(p[0]?.need).toBe(295_000)
    expect(p[0]?.carryIn).toBe(DEFAULT_CARRY)
    expect(p[0]?.events.map((e) => e.optionalUse)).toEqual([150_000, 0, 0, 60_000])
  })
})

describe('recommendedCarry（その月に不足を出さないための、月初の銀塊。SPEC §14.6）', () => {
  const DEC: YearMonth = { year: 2026, month: 12 }

  it.each<[string, Record<string, boolean>, number, number]>([
    ['両方オン', {}, DEFAULT_DAMAGE, 225_000], // 必要 475,000 − 上限 250,000
    ['賞金稼ぎオフ', { bounty: false }, DEFAULT_DAMAGE, 165_000], // 必要 415,000 − 250,000
    ['閃金オフ', { gold: false }, DEFAULT_DAMAGE, 0],
    ['両方オフ', { gold: false, bounty: false }, DEFAULT_DAMAGE, 0],
    ['ダメージ報酬 0', {}, 0, 235_000], // 紫晶石が足りず 48回（240,000）までしか交換できない
  ])('2026年12月・%s → %i', (_label, buyAll, damage, expected) => {
    expect(recommendedCarry(DEC, damage, buyAll)).toBe(expected)
  })

  it('月によって変わる（11月は閃金の週に間に合わせる 110,000、2027年1月は 45,000）', () => {
    expect(recommendedCarry(NOV, DEFAULT_DAMAGE)).toBe(110_000)
    expect(recommendedCarry({ year: 2027, month: 1 }, DEFAULT_DAMAGE)).toBe(45_000)
  })

  it('その量を持っていれば不足せず、5,000 少ないと不足する（最小である）', () => {
    let ym: YearMonth = { year: 2026, month: 1 }
    for (let i = 0; i < 18; i++) {
      for (const damage of [0, 20_500]) {
        for (const gold of [true, false]) {
          const carry = recommendedCarry(ym, damage, { gold })
          expect(carry % EXCHANGE_UNIT).toBe(0)
          expect(planCalendar(ym, damage, { gold }, carry)[0]?.silverShortage).toBe(0)
          if (carry > 0) {
            expect(
              planCalendar(ym, damage, { gold }, carry - EXCHANGE_UNIT)[0]?.silverShortage,
            ).toBeGreaterThan(0)
          }
        }
      }
      ym = nextMonth(ym)
    }
  })

  it('繰越推奨量 − いまの見込みの繰越 が、来月を足りさせるのに足りない量', () => {
    const [, dec] = planCalendar(NOV, DEFAULT_DAMAGE)
    const recommended = recommendedCarry(DEC, DEFAULT_DAMAGE)
    expect([recommended, dec?.carryIn, recommended - (dec?.carryIn ?? 0)]).toEqual([
      225_000, 65_000, 160_000,
    ])
    expect(dec?.silverShortage).toBe(160_000)
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
