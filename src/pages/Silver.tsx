import { useEffect, useState } from 'react'
import {
  DAILY_INCOME,
  DEFAULT_CARRY,
  DEFAULT_DAMAGE,
  EXCHANGE_LIMIT,
  EXCHANGE_UNIT,
  MAX_CARRY,
  MAX_DAMAGE,
  MONTHLY_CAP,
  SILVER_EVENTS,
  SURPLUS_PRIORITY,
  calendarWeeks,
  dailyIncome,
  exchangeTotal,
  exchangeYen,
  nextMonth,
  optionalTotal,
  parseCarry,
  parseDamage,
  planCalendar,
  recommendedCarry,
  snapCarry,
  todayYmd,
} from '../silver'
import type { EventPlan, MonthPlan, SilverEvent, YearMonth, Ymd } from '../silver'
import { pageDef } from '../pages'
import { fmt } from '../state'
import { load, save } from '../storage'

/** ページ名と説明は、目次と同じもの（pages.ts）を使う */
const PAGE = pageDef('silver')

const DAMAGE_KEY = 'lastwar-silver:damage'
const CARRY_KEY = 'lastwar-silver:carry'
/** イベントごとの「お金で上限まで買う」。オフにしたときだけ '0' を保存する */
const buyAllKey = (eventKey: string): string => `lastwar-silver:buyall:${eventKey}`
const DAMAGE_HINT_ID = 'silver-damage-hint'
const CARRY_HINT_ID = 'silver-carry-hint'

/** 任意の交換があるイベント（スイッチを出す対象） */
const OPTIONAL_EVENTS = SILVER_EVENTS.filter((e) => optionalTotal(e) > 0)

/**
 * ダメージ報酬の欄の初期表示。保存されていない・不正な値なら初期値。
 * parseDamage は空欄を 0 として扱うので、「保存されていない」は先に分けて初期値にする。
 */
const loadDamageRaw = (): string => {
  const stored = load(DAMAGE_KEY)
  if (stored === null || stored.trim() === '') return fmt(DEFAULT_DAMAGE)
  return fmt(parseDamage(stored).value ?? DEFAULT_DAMAGE)
}
/** 保存された前月繰越分。保存されていない・不正な値なら初期値。5,000 の倍数にそろえる */
const loadCarry = (): number => snapCarry(parseCarry(load(CARRY_KEY) ?? '').value ?? DEFAULT_CARRY)
const loadBuyAll = (): Record<string, boolean> =>
  Object.fromEntries(OPTIONAL_EVENTS.map((e) => [e.key, load(buyAllKey(e.key)) !== '0']))

/**
 * 銀塊必要量チェッカーのページ（SPEC §14）。
 * 開いた日の「今月」と「来月」の2か月を計算する。today はテストで日付を固定するためのもの。
 */
export default function Silver({ today: fixedToday }: { today?: Ymd }) {
  // 開いているあいだに日付が変わっても表示を切り替えない（最初に開いた日のままにする）
  const [today] = useState<Ymd>(() => fixedToday ?? todayYmd())
  const thisMonth: YearMonth = { year: today.year, month: today.month }
  // 前月繰越分は「＋」「−」でしか変えないので、数値のまま持つ（不正な値にならない）
  const [carry, setCarry] = useState<number>(loadCarry)
  // ダメージ報酬は入力途中（空欄など）も保持したいので文字列で持つ
  const [damageRaw, setDamageRaw] = useState<string>(loadDamageRaw)
  const [buyAll, setBuyAll] = useState<Record<string, boolean>>(loadBuyAll)

  const damage = parseDamage(damageRaw).value

  // 保存するのは「初期値から変えた、有効な値」だけ（初期値を保存すると、初期値を変えても古い値が残る）。
  // 入力途中の不正な値では触らず、最後に有効だった値を残す
  useEffect(() => {
    save(CARRY_KEY, carry === DEFAULT_CARRY ? null : String(carry))
  }, [carry])
  useEffect(() => {
    if (damage === null) return
    save(DAMAGE_KEY, damage === DEFAULT_DAMAGE ? null : String(damage))
  }, [damage])
  useEffect(() => {
    for (const e of OPTIONAL_EVENTS) save(buyAllKey(e.key), buyAll[e.key] === false ? '0' : null)
  }, [buyAll])

  const months = damage === null ? null : planCalendar(thisMonth, damage, buyAll, carry)
  const current = months?.[0]
  const next = months?.[1]
  // 来月に不足を出さないために、今月から繰り越したい銀塊の量
  const recommended =
    damage === null ? null : recommendedCarry(nextMonth(thisMonth), damage, buyAll)

  return (
    <div className="cafe">
      <header className="cafe__head">
        <h1 className="cafe__title">{PAGE.title}</h1>
        <p className="cafe__lead">{PAGE.description}</p>
      </header>

      <section className="cafe__card" aria-labelledby="silver-input">
        <h2 className="cafe__heading" id="silver-input">
          あなたの条件
        </h2>

        <CarryStepper carry={carry} onChange={setCarry} />
        <NumberField
          id="silver-damage"
          hintId={DAMAGE_HINT_ID}
          label="ダメージ報酬でもらえる紫晶石（毎週）"
          raw={damageRaw}
          value={damage}
          onChange={setDamageRaw}
          hint="晶石ボスのダメージ報酬は人によって違います。"
          error={`0〜${fmt(MAX_DAMAGE)} の整数で入力してください`}
        />

        {OPTIONAL_EVENTS.map((event) => (
          <label className="switch" key={event.key}>
            <input
              type="checkbox"
              role="switch"
              className="switch__input"
              checked={buyAll[event.key] !== false}
              onChange={(e) => setBuyAll((prev) => ({ ...prev, [event.key]: e.target.checked }))}
            />
            <span className="switch__track" aria-hidden="true" />
            <span className="switch__text">
              <span className="switch__title">{event.item}をお金で買える上限まで買う</span>
              <span className="switch__desc">
                {`オンにすると、お金と同じレートの交換（銀塊 ${fmt(optionalTotal(event))}）も必要量に入れます。` +
                  '上限まで買わないなら、必要なときにお金で買えばよいのでオフにします。'}
              </span>
            </span>
          </label>
        ))}
      </section>

      <Calendar months={[thisMonth, nextMonth(thisMonth)]} today={today} />

      {!current || !next || damage === null || recommended === null ? (
        <p className="cafe__notice">ダメージ報酬に 0 以上の整数を入れると計算できます。</p>
      ) : (
        <>
          <MonthResult plan={current} next={next} recommended={recommended} damage={damage} />
          <Surplus />
          <Flow plan={current} damage={damage} />
        </>
      )}

      <Breakdown buyAll={buyAll} />
    </div>
  )
}

/**
 * 前月繰越分の銀塊量。直接は入力させず、「−」「＋」で 5,000 ずつ変える（SPEC §14.5）。
 * 銀塊は 5,000 個単位で交換するので、繰越分も同じきざみにそろえておくと計算が半端にならない。
 */
function CarryStepper({ carry, onChange }: { carry: number; onChange: (carry: number) => void }) {
  const label = '前月繰越分の銀塊量'
  return (
    <div className="field">
      <label className="field__label" htmlFor="silver-carry">
        {label}
      </label>
      <div className="field__stepper">
        <button
          type="button"
          className="field__step"
          onClick={() => onChange(snapCarry(carry - EXCHANGE_UNIT))}
          disabled={carry <= 0}
          aria-label={`${label}を ${fmt(EXCHANGE_UNIT)} 減らす`}
        >
          −
        </button>
        {/* 入力欄ではなく表示だけ。値が変わったら読み上げられるよう output にしている */}
        <output id="silver-carry" className="field__value" aria-describedby={CARRY_HINT_ID}>
          {fmt(carry)}
        </output>
        <button
          type="button"
          className="field__step"
          onClick={() => onChange(snapCarry(carry + EXCHANGE_UNIT))}
          disabled={carry >= MAX_CARRY}
          aria-label={`${label}を ${fmt(EXCHANGE_UNIT)} 増やす`}
        >
          ＋
        </button>
      </div>
      <p className="field__hint" id={CARRY_HINT_ID}>
        {`今月の1日の時点で持っていた銀塊の数です。＋ − で ${fmt(EXCHANGE_UNIT)} ずつ変えられます。`}
      </p>
    </div>
  )
}

/**
 * 0 以上の整数を入れる欄。value が null なら入力ミスとして赤くし、説明文の代わりに error を出す。
 * 桁の打ち間違いに気づけるよう、入力を終えたら桁区切りつきに整える（入力中に整えるとカーソルが飛ぶ）。
 */
function NumberField({
  id,
  hintId,
  label,
  raw,
  value,
  onChange,
  hint,
  error,
}: {
  id: string
  hintId: string
  label: string
  raw: string
  value: number | null
  onChange: (raw: string) => void
  hint: string
  error: string
}) {
  const invalid = value === null
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={'field__input' + (invalid ? ' field__input--invalid' : '')}
        type="text"
        inputMode="numeric"
        value={raw}
        aria-invalid={invalid}
        aria-describedby={hintId}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => value !== null && onChange(fmt(value))}
      />
      <p className={'field__hint' + (invalid ? ' field__hint--invalid' : '')} id={hintId} aria-live="polite">
        {invalid ? error : hint}
      </p>
    </div>
  )
}

const WEEKDAYS = ['月', '火', '水', '木', '金', '土', '日'] as const
const monthLabel = (ym: YearMonth): string => `${ym.month}月`
const md = (d: Ymd): string => `${d.month}/${d.day}`
const sameYm = (a: YearMonth, b: YearMonth): boolean => a.year === b.year && a.month === b.month

/**
 * イベントカレンダー（SPEC §14.7）。今月と来月を、月曜始まりの表で出す。
 * 各週は「日付の行」と「イベントの帯の行」の2行。帯は火〜日のうち、その月の日にだけ引く。
 */
function Calendar({ months, today }: { months: readonly YearMonth[]; today: Ymd }) {
  return (
    <section className="cafe__card" aria-labelledby="silver-calendar">
      <h2 className="cafe__heading" id="silver-calendar">
        イベントカレンダー
      </h2>
      {months.map((ym) => (
        <table className="cal" key={`${ym.year}-${ym.month}`}>
          <caption className="cal__caption">
            {ym.year}年{ym.month}月
          </caption>
          <thead>
            <tr>
              {WEEKDAYS.map((w) => (
                <th key={w} scope="col" className="cal__weekday">
                  {w}
                </th>
              ))}
            </tr>
          </thead>
          {calendarWeeks(ym).map((week, i) => (
            <tbody key={i} className="cal__week">
              <tr>
                {week.days.map((day, col) => {
                  const isToday = day !== null && sameYm(ym, today) && day === today.day
                  return (
                    <td
                      key={col}
                      className={'cal__day' + (isToday ? ' cal__day--today' : '')}
                      aria-current={isToday ? 'date' : undefined}
                    >
                      {day}
                    </td>
                  )
                })}
              </tr>
              <tr className="cal__bandRow">
                {week.band === null ? (
                  <td colSpan={7} />
                ) : (
                  <>
                    {week.band.from > 0 && <td colSpan={week.band.from} />}
                    <td
                      colSpan={week.band.to - week.band.from + 1}
                      className={'cal__band' + (week.band.continued ? ' cal__band--continued' : '')}
                      data-event={week.band.event.key}
                    >
                      {week.band.event.name}
                      {/* 前の月に始まったイベントの続き。この月のイベントには数えない。
                          1〜2日ぶんの短い帯には入りきらないので、3日以上のときだけ添える */}
                      {week.band.continued && week.band.to - week.band.from >= 2 && (
                        <small>（前月から）</small>
                      )}
                    </td>
                    {week.band.to < 6 && <td colSpan={6 - week.band.to} />}
                  </>
                )}
              </tr>
            </tbody>
          ))}
        </table>
      ))}
      <p className="cafe__note">
        イベントは毎週 火曜日〜日曜日です。月をまたぐイベントは、始まった月のぶんとして計算します。
      </p>
    </section>
  )
}

/**
 * 今月の結果（必要量、不足の知らせ、繰越、紫晶石の入手量と余り、交換回数）と、
 * 来月に向けた見通し（来月の必要量・不足分と、今月の繰越推奨量）。
 * 来月ぶんのカードは出さない。来月の数字は「今月どれだけ繰り越すか」を決めるために、ここに出す。
 */
function MonthResult({
  plan,
  next,
  recommended,
  damage,
}: {
  plan: MonthPlan
  next: MonthPlan
  recommended: number
  damage: number
}) {
  const [incomeOpen, setIncomeOpen] = useState(false)
  const id = `silver-result-${plan.year}-${plan.month}`
  const detailId = `${id}-income`
  const label = monthLabel(plan)
  const perDay = dailyIncome()
  return (
    <section className="cafe__card" aria-labelledby={id}>
      <h2 className="cafe__heading" id={id}>
        {label}の必要量
      </h2>
      <p className="total">
        <span className="total__unit">銀塊</span>
        <span className="total__value">{fmt(plan.need)}</span>
      </p>
      {/* 交換できるだけ交換しても足りないとき（月の上限か、紫晶石の不足か、週の入手が間に合わないため） */}
      {plan.silverShortage > 0 && (
        <p className="total__alert" role="alert">
          {label}は {fmt(plan.silverShortage)} 銀塊が不足します。どこかで調整して下さい。
        </p>
      )}
      <dl className="ledger">
        <div>
          <dt>前月繰越分の銀塊量</dt>
          <dd>{fmt(plan.carryIn)}</dd>
        </div>
        <div>
          <dt>
            <button
              type="button"
              className="ledger__toggle"
              aria-expanded={incomeOpen}
              aria-controls={detailId}
              onClick={() => setIncomeOpen((v) => !v)}
            >
              {label}の入手量（紫晶石）
              <span className="ledger__caret" aria-hidden="true">
                {incomeOpen ? '🔼' : '🔽'}
              </span>
            </button>
          </dt>
          <dd>{fmt(plan.income)}</dd>
        </div>
        {/* 入手量の内訳。閉じているあいだは中身ごと出さない */}
        <div className="ledger__detail" id={detailId} hidden={!incomeOpen}>
          {incomeOpen && (
            <dl className="ledger ledger--sub" aria-label={`${label}の紫晶石の入手量の内訳`}>
              {DAILY_INCOME.map((s) => (
                <div key={s.label}>
                  <dt>
                    {s.label}（{fmt(s.perDay)} × {plan.incomeDays}日）
                  </dt>
                  <dd>{fmt(s.perDay * plan.incomeDays)}</dd>
                </div>
              ))}
              <div>
                <dt>
                  ダメージ報酬（{fmt(damage)} × 月曜 {plan.mondays}回）
                </dt>
                <dd>{fmt(damage * plan.mondays)}</dd>
              </div>
              <div>
                <dt>月〜土の1日あたり</dt>
                <dd>{fmt(perDay)}</dd>
              </div>
            </dl>
          )}
        </div>
        <div className="ledger__ok">
          <dt>紫晶石の余り</dt>
          <dd>{fmt(plan.balance)}</dd>
        </div>
        <div>
          <dt>紫晶石との交換回数（月の上限 {EXCHANGE_LIMIT}回）</dt>
          <dd>
            {fmt(plan.exchanges)} / {EXCHANGE_LIMIT}回
          </dd>
        </div>
      </dl>
      {/* まだ交換したいのに、上限が残っていて紫晶石が足りなかったとき */}
      {plan.amethystLimited && (
        <p className="cafe__note cafe__note--warn">
          {`紫晶石が足りないので、交換できるのは ${fmt(plan.exchanges)}回（${fmt(plan.exchangeAmount)}）までです。`}
        </p>
      )}

      <h3 className="cafe__sub outlook__title">来月（{monthLabel(next)}）に向けて</h3>
      <dl className="ledger">
        <div>
          <dt>{monthLabel(next)}の必要量</dt>
          <dd>{fmt(next.need)}</dd>
        </div>
        <div className={next.silverShortage > 0 ? 'ledger__short' : undefined}>
          <dt>{monthLabel(next)}の不足分</dt>
          <dd>{fmt(next.silverShortage)}</dd>
        </div>
        <div className="outlook__recommended">
          <dt>今月の繰越推奨量</dt>
          <dd>{fmt(recommended)}</dd>
        </div>
        <div>
          <dt>いまの見込みの繰越</dt>
          <dd>{fmt(next.carryIn)}</dd>
        </div>
      </dl>
      <p className="cafe__note">
        {`繰越推奨量は、${monthLabel(next)}に不足しないために、${monthLabel(plan)}末に持っておきたい銀塊の量です。` +
          (recommended > next.carryIn
            ? `いまの見込みでは、あと ${fmt(recommended - next.carryIn)} 足りません。`
            : 'いまの見込みで足ります。')}
      </p>
    </section>
  )
}

/** 紫晶石の交換のきまりと、余りの使い道。月ごとの結果のあとに1回だけ出す */
function Surplus() {
  return (
    <section className="cafe__card" aria-labelledby="silver-surplus">
      <h2 className="cafe__heading" id="silver-surplus">
        紫晶石の余りの使い道
      </h2>
      <p className="cafe__note">
        {`紫晶石 ${fmt(EXCHANGE_UNIT)} 個を銀塊 ${fmt(EXCHANGE_UNIT)} 個と交換できます` +
          `（月に ${EXCHANGE_LIMIT}回、${fmt(MONTHLY_CAP)} まで。上限は毎月1日に戻ります）。`}
      </p>
      <p className="cafe__note">
        紫晶石の余りは銀塊以外の交換に回せます。翌月には持ち越さない前提で計算しています。
      </p>
      <div className="priority-list">
        <p className="priority-list__title" id="silver-priority">
          交換の優先順位（上ほど優先）
        </p>
        <ol aria-labelledby="silver-priority">
          {SURPLUS_PRIORITY.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ol>
      </div>
    </section>
  )
}

/**
 * 今月のイベントごとの流れ。数字はすべて銀塊にそろえる
 * （紫晶石は、交換して銀塊になったぶんだけを入手量として出す）。来月ぶんは出さない。
 */
function Flow({ plan, damage }: { plan: MonthPlan; damage: number }) {
  return (
    <section className="cafe__card" aria-labelledby="silver-weeks">
      <h2 className="cafe__heading" id="silver-weeks">
        週ごとの流れ
      </h2>
      <p className="cafe__note">
        {`毎週獲得できる紫晶石（${fmt(dailyIncome() * 6 + damage)}）を、2か月ぶんの必要銀塊量か、月ごとの銀塊の交換上限量（${fmt(MONTHLY_CAP)}）に達するまで、` +
          `${fmt(EXCHANGE_UNIT)} 個ずつ銀塊に交換していった場合の流れです。数字はすべて銀塊です。`}
      </p>
      <ol className="weeks">
        {plan.events.map((e, i) => (
          <EventSheet
            key={md(e.start)}
            plan={e}
            first={i === 0}
            last={i === plan.events.length - 1}
          />
        ))}
      </ol>
      <p className="cafe__note">
        上限に余裕があれば、来月ぶんも先に交換します。最後の「翌月への繰越」のあと、月末までに交換したぶんは「いまの見込みの繰越」に入ります。
      </p>
    </section>
  )
}

/**
 * イベント1つぶんの計算書。上から順に足し引きすると最後の行になる:
 *   前週からの繰越 ＋ 銀塊入手量 − 銀塊必要量 ＝ 次週への繰越（足りなければ 銀塊の不足分）
 */
function EventSheet({ plan, first, last }: { plan: EventPlan; first: boolean; last: boolean }) {
  const short = plan.shortfall > 0
  return (
    <li className="week">
      <p className="week__head">
        <span className="week__no">
          {md(plan.start)}〜{md(plan.end)}
        </span>
        <span className="week__name">{plan.event.name}</span>
      </p>
      <dl className="week__sheet">
        <div>
          {/* いちばん最初の繰越は、入力した前月繰越分 */}
          <dt>{first ? '前月からの繰越' : '前週からの繰越'}</dt>
          <dd>{fmt(plan.carryIn)}</dd>
        </div>
        <div>
          <dt>
            <span className="week__sign" aria-hidden="true">
              ＋
            </span>
            銀塊入手量<small>（{fmt(plan.gainTimes)}回交換）</small>
          </dt>
          <dd>{fmt(plan.gain)}</dd>
        </div>
        <div>
          <dt>
            <span className="week__sign" aria-hidden="true">
              −
            </span>
            銀塊必要量
          </dt>
          <dd>{fmt(plan.use)}</dd>
        </div>
        <div className={'week__result' + (short ? ' week__short' : '')}>
          <dt>
            <span className="week__sign" aria-hidden="true">
              ＝
            </span>
            {short ? '銀塊の不足分' : last ? '翌月への繰越' : '次週への繰越'}
          </dt>
          <dd>{fmt(short ? plan.shortfall : plan.carryOver)}</dd>
        </div>
      </dl>
    </li>
  )
}

/** 銀塊で交換するものの一覧 */
function Breakdown({ buyAll }: { buyAll: Readonly<Record<string, boolean>> }) {
  return (
    <section className="cafe__card" aria-labelledby="silver-breakdown">
      <h2 className="cafe__heading" id="silver-breakdown">
        内訳
      </h2>

      <h3 className="cafe__sub">銀塊で交換するもの</h3>
      <ul className="events">
        {SILVER_EVENTS.map((event) => (
          <EventRows key={event.key} event={event} included={buyAll[event.key] !== false} />
        ))}
      </ul>
    </section>
  )
}

function EventRows({ event, included }: { event: SilverEvent; included: boolean }) {
  return (
    <li className="event">
      <p className="event__name">{event.name}</p>
      {event.exchanges.length === 0 ? (
        <p className="event__none">銀塊での交換はありません</p>
      ) : (
        <ul className="event__list">
          {event.exchanges.map((x) => {
            const optional = x.kind === 'optional'
            const off = optional && !included
            return (
              <li key={`${x.cost}-${x.gain}`} className={'exchange' + (off ? ' exchange--off' : '')}>
                <span className={'exchange__tag' + (optional ? ' exchange__tag--optional' : '')}>
                  {optional ? (off ? '任意・入れない' : '任意・入れる') : '必ず'}
                </span>
                <span className="exchange__what">
                  銀塊 {fmt(x.cost)} → {fmt(x.gain)} {event.item} × {x.times}回
                </span>
                <span className="exchange__total">{fmt(exchangeTotal(x))}</span>
                {event.price && (
                  <span className="exchange__yen">
                    {fmt(x.gain)}
                    {event.item}はお金なら {fmt(exchangeYen(x, event.price))} 円
                    {optional ? '（銀塊と同じレート）' : '（銀塊のほうがお得）'}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </li>
  )
}
