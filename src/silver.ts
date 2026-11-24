/**
 * 銀塊必要量チェッカーのデータと計算（SPEC §14）。
 * 前半は交換のデータと入力の解釈、後半は暦に合わせた計算（イベントの予定と、2か月ぶんの流れ）。
 * React に依存しない純粋関数にして、そのまま単体テストできるようにしている。
 */
import { parseIntInRange } from './state'

/** 必ず＝お金で買うよりお得なので必ず交換する / 任意＝お金と同じレートなので利用者が選ぶ */
export type ExchangeKind = 'must' | 'optional'

/** 銀塊とイベントアイテムの交換1種類 */
export interface Exchange {
  /** 1回の交換に使う銀塊 */
  readonly cost: number
  /** 1回の交換でもらえるイベントアイテムの数 */
  readonly gain: number
  /** 月に交換できる回数 */
  readonly times: number
  readonly kind: ExchangeKind
}

/** お金で買う場合の値段（amount 個で yen 円） */
export interface Price {
  readonly amount: number
  readonly yen: number
}

export interface SilverEvent {
  readonly key: string
  readonly name: string
  /** イベントアイテムの名前（交換が無いイベントでは空） */
  readonly item: string
  readonly price: Price | null
  readonly exchanges: readonly Exchange[]
}

/** 月に開催されるイベント。並び順＝開催順（1週に1つ、火曜日〜日曜日） */
export const SILVER_EVENTS: readonly SilverEvent[] = [
  {
    key: 'gold',
    name: '閃金',
    item: '閃金',
    price: { amount: 100, yen: 1500 },
    exchanges: [
      { cost: 5000, gain: 80, times: 6, kind: 'must' },
      { cost: 10000, gain: 100, times: 15, kind: 'optional' },
    ],
  },
  {
    key: 'shot',
    name: '百発百中',
    item: '弾丸',
    price: { amount: 12, yen: 1500 },
    exchanges: [{ cost: 5000, gain: 10, times: 5, kind: 'must' }],
  },
  { key: 'war', name: '戦争準備', item: '', price: null, exchanges: [] },
  {
    key: 'bounty',
    name: '賞金稼ぎ',
    item: '賞金稼ぎ用弾丸',
    price: { amount: 200, yen: 3000 },
    exchanges: [
      { cost: 5000, gain: 80, times: 6, kind: 'must' },
      { cost: 10000, gain: 100, times: 6, kind: 'optional' },
    ],
  },
]

/** 毎日もらえる紫晶石（全員共通） */
export const DAILY_INCOME: readonly { readonly label: string; readonly perDay: number }[] = [
  { label: '連盟対決報酬', perDay: 6500 },
  { label: '晶石ボス', perDay: 2500 },
]
/** ダメージ報酬（週）の初期値。人によって違うので入力欄にする */
export const DEFAULT_DAMAGE = 20_500
/** ダメージ報酬の上限（桁の打ち間違いを弾くためのもの） */
export const MAX_DAMAGE = 9_999_999
/** 前月繰越分の銀塊の初期値と上限。画面では EXCHANGE_UNIT（5,000）きざみでしか変えられない */
export const DEFAULT_CARRY = 0
export const MAX_CARRY = 9_995_000

/** 紫晶石 → 銀塊の交換は、銀塊 5,000 個を1単位として行う（紫晶石 1 個 = 銀塊 1 個） */
export const EXCHANGE_UNIT = 5_000
/** 1か月に交換できる回数の上限 */
export const EXCHANGE_LIMIT = 50
/** 1か月に交換できる銀塊の上限（250,000） */
export const MONTHLY_CAP = EXCHANGE_UNIT * EXCHANGE_LIMIT

/** その量の銀塊を手に入れるのに必要な交換回数（単位に満たない端数は1回ぶんに切り上げる） */
export const exchangesNeeded = (silver: number): number => Math.ceil(silver / EXCHANGE_UNIT)

/** 紫晶石の余りを銀塊以外に回すときの、交換の優先順位（先頭ほど優先） */
export const SURPLUS_PRIORITY: readonly string[] = [
  '金塊',
  '高級パス交換券',
  '特級パス交換券',
  '戦争準備パック交換券',
  '週間配達一括交換券',
]


/** その交換で月に使う銀塊 */
export const exchangeTotal = (e: Exchange): number => e.cost * e.times

/**
 * 1回の交換でもらえるぶんを、お金で買うといくらか（円未満は四捨五入）。
 * 先に割ると 10 ÷ 12 のような割り切れない値で誤差が出るので、掛けてから割る。
 */
export const exchangeYen = (e: Exchange, price: Price): number =>
  Math.round((e.gain * price.yen) / price.amount)

const sumKind = (event: SilverEvent, kind: ExchangeKind): number =>
  event.exchanges.filter((e) => e.kind === kind).reduce((sum, e) => sum + exchangeTotal(e), 0)

/** 必ず交換するぶんの銀塊 */
export const mustTotal = (event: SilverEvent): number => sumKind(event, 'must')
/** 任意の交換ぶんの銀塊（無ければ 0） */
export const optionalTotal = (event: SilverEvent): number => sumKind(event, 'optional')

/**
 * ダメージ報酬の入力を解釈する。
 * 受け付けるのは 0〜MAX_DAMAGE の整数だけで、それ以外は入力ミス（value: null）として返す。
 */
export function parseDamage(raw: string): { value: number | null; invalid: boolean } {
  // 欄を空にしたときは 0 として扱う（打ち直しの途中で結果が消えないように。SPEC §14.5）
  if (raw.trim() === '') return { value: 0, invalid: false }
  return parseIntInRange(raw, 0, MAX_DAMAGE)
}

/** 保存されていた前月繰越分を解釈する。受け付けるのは 0〜MAX_CARRY の整数だけ */
export function parseCarry(raw: string): { value: number | null; invalid: boolean } {
  return parseIntInRange(raw, 0, MAX_CARRY)
}

/** 前月繰越分を 0〜MAX_CARRY の範囲に収め、EXCHANGE_UNIT の倍数に切り下げる */
export function snapCarry(carry: number): number {
  const clamped = Math.min(MAX_CARRY, Math.max(0, carry))
  return Math.floor(clamped / EXCHANGE_UNIT) * EXCHANGE_UNIT
}

/* ==========================================================================
   暦に合わせた計算（SPEC §14.6）
   日付は { year, month, day }（month は 1〜12）で持ち、計算には
   「1970-01-01 からの日数」を使う。UTC で数えるので、端末のタイムゾーンや夏時間の影響を受けない。
   ========================================================================== */

/** 暦の日付。month は 1〜12 */
export interface Ymd {
  readonly year: number
  readonly month: number
  readonly day: number
}

/** 暦の月。month は 1〜12 */
export interface YearMonth {
  readonly year: number
  readonly month: number
}

const DAY_MS = 86_400_000
const toEpoch = (d: Ymd): number => Math.round(Date.UTC(d.year, d.month - 1, d.day) / DAY_MS)
const fromEpoch = (epoch: number): Ymd => {
  const t = new Date(epoch * DAY_MS)
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() }
}
/** 曜日。0=月曜 … 5=土曜、6=日曜（1970-01-01 は木曜） */
const weekdayOf = (epoch: number): number => (((epoch + 3) % 7) + 7) % 7
const MONDAY = 0
const TUESDAY = 1
const SUNDAY = 6

/** その月の日数 */
export const daysInMonth = (ym: YearMonth): number =>
  new Date(Date.UTC(ym.year, ym.month, 0)).getUTCDate()

/** 次の月 */
export const nextMonth = (ym: YearMonth): YearMonth =>
  ym.month === 12 ? { year: ym.year + 1, month: 1 } : { year: ym.year, month: ym.month + 1 }

/** 端末の時計での今日の日付。テストでは now を渡して固定する */
export function todayYmd(now: Date = new Date()): Ymd {
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() }
}

/**
 * イベントの周期の起点。2026-11-03（火）から始まる週が閃金（SILVER_EVENTS の先頭）で、
 * 以後1週ごとに SILVER_EVENTS の順に繰り返す。起点より前にも同じ周期をさかのぼって当てはめる。
 */
export const EVENT_ORIGIN: Ymd = { year: 2026, month: 11, day: 3 }

/** その火曜日から始まる週のイベント */
function eventOfTuesday(tuesday: number): SilverEvent {
  const weeks = Math.round((tuesday - toEpoch(EVENT_ORIGIN)) / 7)
  const n = SILVER_EVENTS.length
  const event = SILVER_EVENTS[((weeks % n) + n) % n]
  if (!event) throw new Error('SILVER_EVENTS が空')
  return event
}

/** 予定に入ったイベント */
export interface ScheduledEvent {
  readonly event: SilverEvent
  /** 開始日（火曜日）。イベントはこの日の月に数える */
  readonly start: Ymd
  /** 最終日（日曜日）。翌月にまたがることがある */
  readonly end: Ymd
  /**
   * 必要量を精算する日。最終日だが、月をまたぐイベントは開始日の月の末日にする
   * （開始日の月の上限と入手だけでまかなう。SPEC §14.6）。
   */
  readonly settle: Ymd
}

/** その月のイベント（開始日の火曜日がその月にあるもの）。日付順 */
export function monthEvents(ym: YearMonth): ScheduledEvent[] {
  const first = toEpoch({ ...ym, day: 1 })
  const last = first + daysInMonth(ym) - 1
  const out: ScheduledEvent[] = []
  for (let day = first; day <= last; day++) {
    if (weekdayOf(day) !== TUESDAY) continue
    const end = day + (SUNDAY - TUESDAY)
    out.push({
      event: eventOfTuesday(day),
      start: fromEpoch(day),
      end: fromEpoch(end),
      settle: fromEpoch(Math.min(end, last)),
    })
  }
  return out
}

/** カレンダーの1週ぶん（月曜始まり） */
export interface CalendarWeek {
  /** 月〜日の7マス。その月に無い日は null */
  readonly days: readonly (number | null)[]
  /** この週のイベントの帯。この月に火〜日が1日も無い週は null */
  readonly band: {
    readonly event: SilverEvent
    /** 帯の始まりと終わりの列（0=月曜 … 6=日曜）。その月の日だけに引く */
    readonly from: number
    readonly to: number
    /** 前の月に始まったイベントの続き（この月のイベントには数えない） */
    readonly continued: boolean
  } | null
}

/** その月のカレンダー（月曜始まりの週の並び）と、イベントの帯 */
export function calendarWeeks(ym: YearMonth): CalendarWeek[] {
  const first = toEpoch({ ...ym, day: 1 })
  const last = first + daysInMonth(ym) - 1
  const weeks: CalendarWeek[] = []
  for (let monday = first - weekdayOf(first); monday <= last; monday += 7) {
    const days = Array.from({ length: 7 }, (_, col) => {
      const day = monday + col
      return day >= first && day <= last ? day - first + 1 : null
    })
    // 帯は火曜〜日曜のうち、この月に入っている日だけに引く
    const cols = days.map((d, col) => (d !== null && col >= TUESDAY ? col : -1)).filter((c) => c >= 0)
    const tuesday = monday + TUESDAY
    weeks.push({
      days,
      band:
        cols.length === 0
          ? null
          : {
              event: eventOfTuesday(tuesday),
              from: Math.min(...cols),
              to: Math.max(...cols),
              continued: tuesday < first,
            },
    })
  }
  return weeks
}

/** 月〜土の毎日もらえる紫晶石（連盟対決報酬 ＋ 晶石ボス） */
export const dailyIncome = (): number => DAILY_INCOME.reduce((sum, s) => sum + s.perDay, 0)

/** イベント1つぶんの計算書。数字はすべて銀塊 */
export interface EventPlan extends ScheduledEvent {
  /** 銀塊必要量 */
  readonly use: number
  /** そのうち任意の交換ぶん（必要量に入れていなければ 0） */
  readonly optionalUse: number
  /** 前のイベントからの繰越。精算の前に持っていた銀塊のうち、前から持ち越したぶん */
  readonly carryIn: number
  /** 銀塊入手量。前のイベントの精算のあとから、このイベントの精算までに交換した銀塊 */
  readonly gain: number
  /** その交換回数（gain ÷ EXCHANGE_UNIT） */
  readonly gainTimes: number
  /** 銀塊の不足分。繰越と入手を合わせても足りない量（足りていれば 0） */
  readonly shortfall: number
  /** 次のイベントへの繰越 */
  readonly carryOver: number
}

/** 1か月ぶんの結果 */
export interface MonthPlan extends YearMonth {
  /** 月の始めに持っている銀塊（1か月目は前月繰越分、2か月目は1か月目の月末の残り） */
  readonly carryIn: number
  /** 必要量。その月のイベントの必要量の合計 */
  readonly need: number
  /** その月のうちに紫晶石と交換した回数（EXCHANGE_LIMIT を超えない） */
  readonly exchanges: number
  /** 交換に使った紫晶石（＝交換で手に入れた銀塊）。exchanges × EXCHANGE_UNIT */
  readonly exchangeAmount: number
  /** 不足する銀塊。その月のイベントの不足分の合計 */
  readonly silverShortage: number
  /** 月末の時点で、まだ交換したいのに、上限が残っていて紫晶石が足りなかった */
  readonly amethystLimited: boolean
  /** その月に入手した紫晶石 */
  readonly income: number
  /** 紫晶石が入手できる日（月〜土）の数 */
  readonly incomeDays: number
  /** 月曜日（ダメージ報酬が入る日）の数 */
  readonly mondays: number
  /** 紫晶石の余り。入手 − 交換に使った量。翌月には持ち越さない */
  readonly balance: number
  readonly events: readonly EventPlan[]
}

/**
 * first の月と、その次の月の2か月ぶんを計算する（SPEC §14.6）。
 *
 * 1日ずつ進めながら、次のことをする。
 * - 月の1日に、交換の上限（EXCHANGE_LIMIT）を戻し、手持ちの紫晶石を 0 にする
 *   （紫晶石は月をまたいで持ち越さない。余りはその月のうちにほかの交換へ回す前提）
 * - 月〜土に dailyIncome()、月曜日に damage を入手する
 * - 「まだ終わっていないイベントの必要量の合計 − 手持ちの銀塊」に達するまで、
 *   手持ちの紫晶石と上限の残りの範囲で交換する（上限に余裕があれば翌月ぶんも先に交換する）
 * - イベントの精算日に、必要量を手持ちの銀塊から引く。足りないぶんは不足分になり、持ち越さない
 *
 * carry は前月繰越分の銀塊（first の月の1日に持っていた量）。
 * buyAll はイベントの key →「お金で買える分を上限まで買う」（指定が無ければ true）。
 */
export function planCalendar(
  first: YearMonth,
  damage: number,
  buyAll: Readonly<Record<string, boolean>> = {},
  carry: number = DEFAULT_CARRY,
): MonthPlan[] {
  const months = [first, nextMonth(first)]
  const perDay = dailyIncome()

  let silver = carry
  const pending = months.flatMap((ym) =>
    monthEvents(ym).map((scheduled) => {
      const optionalUse = buyAll[scheduled.event.key] === false ? 0 : optionalTotal(scheduled.event)
      return { ...scheduled, optionalUse, use: mustTotal(scheduled.event) + optionalUse }
    }),
  )
  let carryIn = silver // 次に精算するイベントの「前からの繰越」
  let gain = 0 // 前の精算のあとに交換した銀塊

  return months.map((ym): MonthPlan => {
    const firstDay = toEpoch({ ...ym, day: 1 })
    const lastDay = firstDay + daysInMonth(ym) - 1
    const monthCarryIn = silver
    let amethyst = 0
    let capLeft = EXCHANGE_LIMIT
    let income = 0
    let incomeDays = 0
    let mondays = 0
    let amethystLimited = false
    const events: EventPlan[] = []

    for (let day = firstDay; day <= lastDay; day++) {
      const weekday = weekdayOf(day)
      if (weekday !== SUNDAY) {
        income += perDay
        amethyst += perDay
        incomeDays++
      }
      if (weekday === MONDAY) {
        income += damage
        amethyst += damage
        mondays++
      }

      const remaining = pending.reduce((sum, e) => sum + e.use, 0)
      const wanted = exchangesNeeded(Math.max(0, remaining - silver))
      const times = Math.min(wanted, Math.floor(amethyst / EXCHANGE_UNIT), capLeft)
      amethyst -= times * EXCHANGE_UNIT
      capLeft -= times
      silver += times * EXCHANGE_UNIT
      gain += times * EXCHANGE_UNIT
      // 月末まで持ち越された状態が残る（その日の交換のあとも、まだ交換したくて上限も残っている）
      amethystLimited = wanted > times && capLeft > 0

      while (pending[0] && toEpoch(pending[0].settle) === day) {
        const e = pending.shift()
        if (!e) break
        const available = silver
        silver = Math.max(0, available - e.use)
        events.push({
          ...e,
          carryIn,
          gain,
          gainTimes: gain / EXCHANGE_UNIT,
          shortfall: Math.max(0, e.use - available),
          carryOver: silver,
        })
        carryIn = silver
        gain = 0
      }
    }

    const exchanges = EXCHANGE_LIMIT - capLeft
    return {
      ...ym,
      carryIn: monthCarryIn,
      need: events.reduce((sum, e) => sum + e.use, 0),
      exchanges,
      exchangeAmount: exchanges * EXCHANGE_UNIT,
      silverShortage: events.reduce((sum, e) => sum + e.shortfall, 0),
      amethystLimited,
      income,
      incomeDays,
      mondays,
      balance: income - exchanges * EXCHANGE_UNIT,
      events,
    }
  })
}

/**
 * 繰越推奨量。その月に不足を出さないために、月の1日に持っているべき銀塊の最小の量
 * （EXCHANGE_UNIT きざみ）。前の月からこれだけ繰り越せば、その月のイベントはすべて足りる。
 *
 * 月の1日に持っている銀塊を増やすほど不足は減る（増えることはない）ので、二分探索で求める。
 * 必要量ぶんを丸ごと持っていれば必ず足りるので、答えは 0〜必要量の範囲にある。
 */
export function recommendedCarry(
  month: YearMonth,
  damage: number,
  buyAll: Readonly<Record<string, boolean>> = {},
): number {
  const shortage = (carry: number): number =>
    planCalendar(month, damage, buyAll, carry)[0]?.silverShortage ?? 0
  let low = 0
  let high = exchangesNeeded(planCalendar(month, damage, buyAll, 0)[0]?.need ?? 0)
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if (shortage(mid * EXCHANGE_UNIT) === 0) high = mid
    else low = mid + 1
  }
  return low * EXCHANGE_UNIT
}
