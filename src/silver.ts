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
    price: { amount: 100, yen: 1500 },
    exchanges: [{ cost: 5000, gain: 80, times: 6, kind: 'must' }],
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

/** 紫晶石 → 銀塊の交換は、銀塊 5,000 個を1単位として行う（紫晶石 1 個 = 銀塊 1 個） */
export const EXCHANGE_UNIT = 5_000
/** 1か月に交換できる回数の上限 */
export const EXCHANGE_LIMIT = 50
/** 1か月に交換できる銀塊の上限（250,000） */
export const MONTHLY_CAP = EXCHANGE_UNIT * EXCHANGE_LIMIT

/** その量の銀塊を手に入れるのに必要な交換回数（単位に満たない端数は1回ぶんに切り上げる） */
export const exchangesNeeded = (silver: number): number => Math.ceil(silver / EXCHANGE_UNIT)

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

/**
 * 各週の始めに持っておくべき最小の貯え。
 *
 *   S_i = max(0, U_i − W + S_{i+1})   （最後の週の次は最初の週に戻る）
 *
 * を満たす最小の S を返す。毎月の入手が必要量に届かないとき（ΣU > W × 週数）は
 * いくら貯めても足りないので null を返す。
 */
export function weeklyReserves(uses: readonly number[], weekly: number): number[] | null {
  const n = uses.length
  if (uses.reduce((a, b) => a + b, 0) > weekly * n) return null
  const reserve: number[] = uses.map(() => 0)
  // 0 から始めて後ろの週から順に更新すると、値は増える一方で最小の解に収束する。
  // 貯えは多くても1周ぶん先までしか影響しないので、2周あれば止まる（念のため余裕を見る）
  for (let pass = 0; pass < n + 2; pass++) {
    let changed = false
    for (let i = n - 1; i >= 0; i--) {
      const next = Math.max(0, (uses[i] ?? 0) - weekly + (reserve[(i + 1) % n] ?? 0))
      if (next !== reserve[i]) {
        reserve[i] = next
        changed = true
      }
    }
    if (!changed) break
  }
  return reserve
}

export interface WeekPlan {
  /** 1 始まりの週番号 */
  readonly week: number
  readonly event: SilverEvent
  /** この週のイベントで使う銀塊 */
  readonly use: number
  /** そのうち任意の交換ぶん（必要量に入れていなければ 0） */
  readonly optionalUse: number
  /** この週の始めに持っておくべき貯え。入手が足りないときは null */
  readonly reserve: number | null
  /** この週に、貯えに回さず自由に使える量。入手が足りないときは null */
  readonly free: number | null
}

export interface SilverPlan {
  /** 1週間の紫晶石の入手量 */
  readonly weeklyIncome: number
  /** 月（4週間）の入手量 */
  readonly monthlyIncome: number
  /** 月の必要量 */
  readonly monthlyNeed: number
  /** 入手量 − 必要量。0 以上なら余り、負なら不足 */
  readonly balance: number
  /** 必要量を手に入れるのに必要な、紫晶石 → 銀塊の交換回数 */
  readonly exchanges: number
  /** 交換回数が月の上限（EXCHANGE_LIMIT）を超えている */
  readonly overCap: boolean
  readonly weeks: readonly WeekPlan[]
}

/**
 * 月の必要量と、週ごとの貯えを求める。
 * buyAll はイベントの key →「お金で買える分を上限まで買う」。
 * true のイベントだけ、任意の交換ぶんを必要量に入れる（指定が無ければ true）。
 */
export function planSilver(
  damage: number,
  buyAll: Readonly<Record<string, boolean>> = {},
): SilverPlan {
  const weeklyIncome = weeklyBaseIncome() + damage
  const rows = SILVER_EVENTS.map((event) => {
    const optionalUse = buyAll[event.key] === false ? 0 : optionalTotal(event)
    return { event, optionalUse, use: mustTotal(event) + optionalUse }
  })
  const uses = rows.map((r) => r.use)
  const monthlyNeed = uses.reduce((a, b) => a + b, 0)
  const monthlyIncome = weeklyIncome * rows.length
  const reserves = weeklyReserves(uses, weeklyIncome)

  const weeks = rows.map((r, i): WeekPlan => {
    const reserve = reserves ? (reserves[i] ?? 0) : null
    const next = reserves ? (reserves[(i + 1) % rows.length] ?? 0) : null
    return {
      week: i + 1,
      ...r,
      reserve,
      free: reserve === null || next === null ? null : reserve + weeklyIncome - r.use - next,
    }
  })
  const exchanges = exchangesNeeded(monthlyNeed)
  return {
    weeklyIncome,
    monthlyIncome,
    monthlyNeed,
    balance: monthlyIncome - monthlyNeed,
    exchanges,
    overCap: exchanges > EXCHANGE_LIMIT,
    weeks,
  }
}
