import { useEffect, useState } from 'react'
import {
  DAILY_INCOME,
  DEFAULT_CARRY,
  DEFAULT_DAMAGE,
  EXCHANGE_LIMIT,
  EXCHANGE_UNIT,
  INCOME_DAYS,
  MAX_CARRY,
  MAX_DAMAGE,
  MONTHLY_CAP,
  SILVER_EVENTS,
  SURPLUS_PRIORITY,
  exchangeTotal,
  exchangeYen,
  optionalTotal,
  parseCarry,
  parseDamage,
  planSilver,
  snapCarry,
  weeklyBaseIncome,
} from '../silver'
import type { SilverEvent, SilverPlan, WeekPlan } from '../silver'
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
const INCOME_DETAIL_ID = 'silver-income-detail'

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

/** 銀塊必要量チェッカーのページ（SPEC §14） */
export default function Silver() {
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

  const plan = damage === null ? null : planSilver(damage, buyAll, carry)

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

      {plan === null ? (
        <p className="cafe__notice">ダメージ報酬に 0 以上の整数を入れると計算できます。</p>
      ) : (
        <>
          <Result plan={plan} damage={damage ?? 0} />
          <Weeks plan={plan} />
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
        {`先月から持ち越した銀塊の数です。＋ − で ${fmt(EXCHANGE_UNIT)} ずつ変えられます。`}
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

/** 月の必要量と、前月繰越分・入手量・交換回数 */
function Result({ plan, damage }: { plan: SilverPlan; damage: number }) {
  const [incomeOpen, setIncomeOpen] = useState(false)
  return (
    <section className="cafe__card" aria-labelledby="silver-result">
      <h2 className="cafe__heading" id="silver-result">
        毎月の必要量
      </h2>
      <p className="total">
        <span className="total__unit">銀塊</span>
        <span className="total__value">{fmt(plan.monthlyNeed)}</span>
      </p>
      {/* 交換できるだけ交換しても足りないとき（月の上限か、紫晶石の不足による） */}
      {plan.silverShortage > 0 && (
        <p className="total__alert" role="alert">
          今月は {fmt(plan.silverShortage)} 銀塊が不足します。どこかで調整して下さい。
        </p>
      )}
      <dl className="ledger">
        <div>
          <dt>前月繰越分の銀塊量</dt>
          <dd>{fmt(plan.carry)}</dd>
        </div>
        <div>
          <dt>
            <button
              type="button"
              className="ledger__toggle"
              aria-expanded={incomeOpen}
              aria-controls={INCOME_DETAIL_ID}
              onClick={() => setIncomeOpen((v) => !v)}
            >
              毎月の入手量（紫晶石）
              <span className="ledger__caret" aria-hidden="true">
                {incomeOpen ? '🔼' : '🔽'}
              </span>
            </button>
          </dt>
          <dd>{fmt(plan.monthlyIncome)}</dd>
        </div>
        {/* 入手量の内訳。閉じているあいだは中身ごと出さない */}
        <div className="ledger__detail" id={INCOME_DETAIL_ID} hidden={!incomeOpen}>
          {incomeOpen && (
            <dl className="ledger ledger--sub" aria-label="紫晶石の入手量の内訳">
              {DAILY_INCOME.map((s) => (
                <div key={s.label}>
                  <dt>{s.label}</dt>
                  <dd>{fmt(s.perDay)} / 日</dd>
                </div>
              ))}
              <div>
                <dt>ダメージ報酬</dt>
                <dd>{fmt(damage)} / 週</dd>
              </div>
              <div>
                <dt>1週間の合計（月〜土の{INCOME_DAYS}日）</dt>
                <dd>{fmt(weeklyBaseIncome() + damage)}</dd>
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
      <p className="cafe__note">
        {`紫晶石 ${fmt(EXCHANGE_UNIT)} 個を銀塊 ${fmt(EXCHANGE_UNIT)} 個と交換できます` +
          `（月に ${EXCHANGE_LIMIT}回、${fmt(MONTHLY_CAP)} まで）。`}
      </p>
      {/* 上限まで交換したいのに、紫晶石が足りずに届いていないとき */}
      {plan.amethystLimited && (
        <p className="cafe__note cafe__note--warn">
          {`紫晶石が足りないので、交換できるのは ${fmt(plan.exchanges)}回（${fmt(plan.exchangeAmount)}）までです。`}
        </p>
      )}
      <p className="cafe__note">紫晶石の余りは銀塊以外の交換に回せます。</p>
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
 * 4週間の流れ。数字はすべて銀塊にそろえる（紫晶石は、交換して銀塊になったぶんだけを入手量として出す）。
 */
function Weeks({ plan }: { plan: SilverPlan }) {
  return (
    <section className="cafe__card" aria-labelledby="silver-weeks">
      <h2 className="cafe__heading" id="silver-weeks">
        4週間の流れ
      </h2>
      <p className="cafe__note">
        {`毎週獲得できる紫晶石（${fmt(plan.weeklyIncome)}）を、今月の必要銀塊量か銀塊の交換上限量（${fmt(MONTHLY_CAP)}）に達するまで、` +
          `${fmt(EXCHANGE_UNIT)} 個ずつ銀塊に交換していった場合の流れです。数字はすべて銀塊です。`}
      </p>
      <ol className="weeks">
        {plan.weeks.map((w) => (
          <Week key={w.event.key} week={w} last={w.week === plan.weeks.length} />
        ))}
      </ol>
      <p className="cafe__note">4週目の「翌月への繰越」が、翌月の「前月繰越分の銀塊量」になります。</p>
    </section>
  )
}

/**
 * 1週ぶんの計算書。上から順に足し引きすると最後の行になる:
 *   前週からの繰越 ＋ 銀塊入手量 − 銀塊必要量 ＝ 次週への繰越（足りなければ 銀塊の不足分）
 */
function Week({ week, last }: { week: WeekPlan; last: boolean }) {
  const short = week.shortfall > 0
  return (
    <li className="week">
      <p className="week__head">
        <span className="week__no">{week.week}週目</span>
        <span className="week__name">{week.event.name}</span>
      </p>
      <dl className="week__sheet">
        <div>
          {/* 1週目の繰越は、入力した前月繰越分 */}
          <dt>{week.week === 1 ? '前月からの繰越' : '前週からの繰越'}</dt>
          <dd>{fmt(week.carryIn)}</dd>
        </div>
        <div>
          <dt>
            <span className="week__sign" aria-hidden="true">
              ＋
            </span>
            銀塊入手量<small>（{fmt(week.gainTimes)}回交換）</small>
          </dt>
          <dd>{fmt(week.gain)}</dd>
        </div>
        <div>
          <dt>
            <span className="week__sign" aria-hidden="true">
              −
            </span>
            銀塊必要量
          </dt>
          <dd>{fmt(week.use)}</dd>
        </div>
        <div className={'week__result' + (short ? ' week__short' : '')}>
          <dt>
            <span className="week__sign" aria-hidden="true">
              ＝
            </span>
            {short ? '銀塊の不足分' : last ? '翌月への繰越' : '次週への繰越'}
          </dt>
          <dd>{fmt(short ? week.shortfall : week.carryOver)}</dd>
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
