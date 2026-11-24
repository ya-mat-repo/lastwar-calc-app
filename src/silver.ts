/**
 * 銀塊必要量チェッカーのデータと計算（SPEC §14）。
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
/** 紫晶石が入手できる日数（月曜日〜土曜日） */
export const INCOME_DAYS = 6
/** ダメージ報酬（週）の初期値。人によって違うので入力欄にする */
export const DEFAULT_DAMAGE = 20_500
/** ダメージ報酬の上限（桁の打ち間違いを弾くためのもの） */
export const MAX_DAMAGE = 9_999_999
/** 前月繰越分の銀塊の初期値と上限 */
export const DEFAULT_CARRY = 0
export const MAX_CARRY = 9_999_999

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

/** ダメージ報酬を除いた、1週間の紫晶石の入手量 */
export const weeklyBaseIncome = (): number =>
  DAILY_INCOME.reduce((sum, s) => sum + s.perDay, 0) * INCOME_DAYS

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
  return parseIntInRange(raw, 0, MAX_DAMAGE)
}

/** 前月繰越分の銀塊の入力を解釈する。受け付けるのは 0〜MAX_CARRY の整数だけ */
export function parseCarry(raw: string): { value: number | null; invalid: boolean } {
  return parseIntInRange(raw, 0, MAX_CARRY)
}

/** 4週間の流れの1週ぶん。数字はすべて銀塊 */
export interface WeekPlan {
  /** 1 始まりの週番号 */
  readonly week: number
  readonly event: SilverEvent
  /** 前の週からの繰越。この週の始めに持っている銀塊（1週目は前月繰越分） */
  readonly carryIn: number
  /** 銀塊必要量。この週のイベントで使う銀塊 */
  readonly use: number
  /** そのうち任意の交換ぶん（必要量に入れていなければ 0） */
  readonly optionalUse: number
  /** 銀塊入手量。この週に紫晶石と交換して手に入れる銀塊（EXCHANGE_UNIT きざみ） */
  readonly gain: number
  /** その交換回数（gain ÷ EXCHANGE_UNIT） */
  readonly gainTimes: number
  /** 銀塊の不足分。前の週からの繰越と、この週の入手を合わせても足りない量（足りていれば 0） */
  readonly shortfall: number
  /** 銀塊繰越量。この週を終えて残り、次の週に持ち越す銀塊（4週目のぶんは翌月の前月繰越分になる） */
  readonly carryOver: number
}

export interface SilverPlan {
  /** 1週間の紫晶石の入手量 */
  readonly weeklyIncome: number
  /** 月（4週間）の入手量 */
  readonly monthlyIncome: number
  /** 月の必要量（銀塊） */
  readonly monthlyNeed: number
  /** 前月繰越分の銀塊 */
  readonly carry: number
  /**
   * 今月、紫晶石と交換する回数。
   * 必要量から前月繰越分を引いたぶんを交換するが、月の上限（EXCHANGE_LIMIT）までしか交換できない。
   */
  readonly exchanges: number
  /** 交換に使う紫晶石（＝交換で手に入る銀塊）。exchanges × EXCHANGE_UNIT */
  readonly exchangeAmount: number
  /**
   * 今月不足する銀塊。上限いっぱいまで交換しても足りない量
   * （必要量 − 前月繰越分 − 月の上限。足りていれば 0）。
   */
  readonly silverShortage: number
  /** 入手量 − 交換に使う紫晶石。0 以上なら紫晶石の余り、負なら紫晶石の不足 */
  readonly balance: number
  /** 4週間の流れ（SPEC §14.6）。銀塊の入手・不足・繰越を週ごとに追ったもの */
  readonly weeks: readonly WeekPlan[]
}

/**
 * 今月の交換を週ごとに割りふり、銀塊の入手・不足・繰越を追う。
 *
 * - 今月交換する量（target）に達するまで、毎週、手持ちの紫晶石で交換できるだけ交換する。
 *   交換は EXCHANGE_UNIT きざみで、端数の紫晶石は翌週に回す。
 * - その週に使える銀塊は「前の週からの繰越 ＋ この週の入手」。使う量に足りなければ不足分になり、
 *   余れば次の週に繰り越す。足りなかったぶんを翌週に持ち越すことはしない（イベントは週で終わるため）。
 * - 翌月のための前倒しはしない。今月の必要量ぶん（target）しか交換しない。
 */
function simulateWeeks(
  rows: readonly { event: SilverEvent; use: number; optionalUse: number }[],
  weeklyIncome: number,
  carry: number,
  target: number,
): WeekPlan[] {
  let amethyst = 0 // 手持ちの紫晶石（交換の端数が残る）
  let silver = carry // 手持ちの銀塊
  let remaining = target // 今月まだ交換していない量
  return rows.map((r, i): WeekPlan => {
    amethyst += weeklyIncome
    const gain = Math.min(remaining, Math.floor(amethyst / EXCHANGE_UNIT) * EXCHANGE_UNIT)
    amethyst -= gain
    remaining -= gain
    const carryIn = silver
    const available = carryIn + gain
    silver = Math.max(0, available - r.use)
    return {
      week: i + 1,
      ...r,
      carryIn,
      gain,
      gainTimes: gain / EXCHANGE_UNIT,
      shortfall: Math.max(0, r.use - available),
      carryOver: silver,
    }
  })
}

/**
 * 月の必要量と、今月の交換、4週間の流れを求める。carry は前月繰越分の銀塊（今月の交換を減らす）。
 * buyAll はイベントの key →「お金で買える分を上限まで買う」。
 * true のイベントだけ、任意の交換ぶんを必要量に入れる（指定が無ければ true）。
 */
export function planSilver(
  damage: number,
  buyAll: Readonly<Record<string, boolean>> = {},
  carry: number = DEFAULT_CARRY,
): SilverPlan {
  const weeklyIncome = weeklyBaseIncome() + damage
  const rows = SILVER_EVENTS.map((event) => {
    const optionalUse = buyAll[event.key] === false ? 0 : optionalTotal(event)
    return { event, optionalUse, use: mustTotal(event) + optionalUse }
  })
  const monthlyNeed = rows.reduce((sum, r) => sum + r.use, 0)
  const monthlyIncome = weeklyIncome * rows.length

  // 前月繰越分があれば、そのぶんは交換しなくてよい
  const toExchange = Math.max(0, monthlyNeed - carry)
  const exchanges = Math.min(EXCHANGE_LIMIT, exchangesNeeded(toExchange))
  const exchangeAmount = exchanges * EXCHANGE_UNIT
  return {
    weeklyIncome,
    monthlyIncome,
    monthlyNeed,
    carry,
    exchanges,
    exchangeAmount,
    silverShortage: Math.max(0, toExchange - MONTHLY_CAP),
    balance: monthlyIncome - exchangeAmount,
    weeks: simulateWeeks(rows, weeklyIncome, carry, exchangeAmount),
  }
}
