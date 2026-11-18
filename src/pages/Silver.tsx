import { useEffect, useState } from 'react'
import {
  DAILY_INCOME,
  DEFAULT_DAMAGE,
  EXCHANGE_LIMIT,
  EXCHANGE_UNIT,
  INCOME_DAYS,
  MAX_DAMAGE,
  MONTHLY_CAP,
  SILVER_EVENTS,
  exchangeTotal,
  exchangeYen,
  optionalTotal,
  parseDamage,
  planSilver,
  weeklyBaseIncome,
} from '../silver'
import type { SilverEvent, SilverPlan, WeekPlan } from '../silver'
import { pageDef } from '../pages'
import { fmt } from '../state'
import { load, save } from '../storage'

/** ページ名と説明は、目次と同じもの（pages.ts）を使う */
const PAGE = pageDef('silver')

const DAMAGE_KEY = 'lastwar-silver:damage'
/** イベントごとの「お金で上限まで買う」。オフにしたときだけ '0' を保存する */
const buyAllKey = (eventKey: string): string => `lastwar-silver:buyall:${eventKey}`
const DAMAGE_HINT_ID = 'silver-damage-hint'

/** 任意の交換があるイベント（スイッチを出す対象） */
const OPTIONAL_EVENTS = SILVER_EVENTS.filter((e) => optionalTotal(e) > 0)

const loadDamageRaw = (): string => fmt(parseDamage(load(DAMAGE_KEY) ?? '').value ?? DEFAULT_DAMAGE)
const loadBuyAll = (): Record<string, boolean> =>
  Object.fromEntries(OPTIONAL_EVENTS.map((e) => [e.key, load(buyAllKey(e.key)) !== '0']))

/** 銀塊必要量チェッカーのページ（SPEC §14） */
export default function Silver() {
  // 入力途中（空欄など）も保持したいので文字列で持つ
  const [damageRaw, setDamageRaw] = useState<string>(loadDamageRaw)
  const [buyAll, setBuyAll] = useState<Record<string, boolean>>(loadBuyAll)

  const { value: damage, invalid: damageInvalid } = parseDamage(damageRaw)

  // 保存するのは「初期値から変えた、有効な値」だけ（初期値を保存すると、初期値を変えても古い値が残る）。
  // 入力途中の不正な値では触らず、最後に有効だった値を残す
  useEffect(() => {
    if (damage === null) return
    save(DAMAGE_KEY, damage === DEFAULT_DAMAGE ? null : String(damage))
  }, [damage])
  useEffect(() => {
    for (const e of OPTIONAL_EVENTS) save(buyAllKey(e.key), buyAll[e.key] === false ? '0' : null)
  }, [buyAll])

  const plan = damage === null ? null : planSilver(damage, buyAll)

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

        <label className="field__label" htmlFor="silver-damage">
          ダメージ報酬でもらえる紫晶石（毎週）
        </label>
        <input
          id="silver-damage"
          className={'field__input' + (damageInvalid ? ' field__input--invalid' : '')}
          type="text"
          inputMode="numeric"
          value={damageRaw}
          aria-invalid={damageInvalid}
          aria-describedby={DAMAGE_HINT_ID}
          onChange={(e) => setDamageRaw(e.target.value)}
          // 入力を終えたら桁区切りつきに整える（入力中に整えるとカーソルが飛ぶ）
          onBlur={() => damage !== null && setDamageRaw(fmt(damage))}
        />
        <p
          className={'field__hint' + (damageInvalid ? ' field__hint--invalid' : '')}
          id={DAMAGE_HINT_ID}
          aria-live="polite"
        >
          {damageInvalid
            ? `0〜${fmt(MAX_DAMAGE)} の整数で入力してください`
            : '晶石ボスのダメージ報酬は人によって違います。'}
        </p>

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
                オンにすると、お金と同じレートの交換（銀塊 {fmt(optionalTotal(event))}）も必要量に入れます。
                上限まで買わないなら、必要なときにお金で買えばよいのでオフにします。
              </span>
            </span>
          </label>
        ))}
      </section>

      {plan === null ? (
        <p className="cafe__notice">ダメージ報酬を入力すると計算できます。</p>
      ) : (
        <>
          <Result plan={plan} />
          <Weeks plan={plan} />
        </>
      )}

      <Breakdown buyAll={buyAll} damage={damage} />
    </div>
  )
}

/** 月の必要量と、入手量との差 */
function Result({ plan }: { plan: SilverPlan }) {
  const short = plan.balance < 0
  return (
    <section className="cafe__card" aria-labelledby="silver-result">
      <h2 className="cafe__heading" id="silver-result">
        毎月の必要量
      </h2>
      <p className="total">
        <span className="total__unit">銀塊</span>
        <span className="total__value">{fmt(plan.monthlyNeed)}</span>
      </p>
      <dl className="ledger">
        <div>
          <dt>毎月の入手量（紫晶石）</dt>
          <dd>{fmt(plan.monthlyIncome)}</dd>
        </div>
        <div className={short ? 'ledger__short' : 'ledger__ok'}>
          <dt>{short ? '不足' : '余り'}</dt>
          <dd>{fmt(Math.abs(plan.balance))}</dd>
        </div>
        <div className={plan.overCap ? 'ledger__short' : undefined}>
          <dt>紫晶石との交換回数（月の上限 {EXCHANGE_LIMIT}回）</dt>
          <dd>
            {fmt(plan.exchanges)} / {EXCHANGE_LIMIT}回
          </dd>
        </div>
      </dl>
      <p className="cafe__note">
        {short
          ? '毎月の入手では足りません。ダメージ報酬を増やすか、お金と同じレートの交換を減らす必要があります。'
          : '余りは銀塊以外の交換に回せます。'}
      </p>
      {plan.overCap && (
        <p className="cafe__note cafe__note--warn">
          交換できるのは月に {fmt(MONTHLY_CAP)} までなので、必要量をすべては交換できません。
        </p>
      )}
      <p className="cafe__note">
        紫晶石 {fmt(EXCHANGE_UNIT)} 個を銀塊 {fmt(EXCHANGE_UNIT)} 個と交換できます（月に {EXCHANGE_LIMIT}回、
        {fmt(MONTHLY_CAP)} まで）。
      </p>
    </section>
  )
}

/** 4週間の流れ。各イベントの開始までに貯めておく量が分かるようにする */
function Weeks({ plan }: { plan: SilverPlan }) {
  return (
    <section className="cafe__card" aria-labelledby="silver-weeks">
      <h2 className="cafe__heading" id="silver-weeks">
        4週間の流れ
      </h2>
      {plan.balance < 0 ? (
        <p className="cafe__note">入手が足りないあいだは、週ごとの貯えは計算できません。</p>
      ) : (
        <>
          <p className="cafe__note">
            1週間に入手できるのは {fmt(plan.weeklyIncome)}。足りない週は、前の週までに貯めておきます。
          </p>
          <ol className="weeks">
            {plan.weeks.map((w) => (
              <Week key={w.event.key} week={w} income={plan.weeklyIncome} />
            ))}
          </ol>
        </>
      )}
    </section>
  )
}

function Week({ week, income }: { week: WeekPlan; income: number }) {
  const reserve = week.reserve ?? 0
  return (
    <li className="week">
      <p className="week__head">
        <span className="week__no">{week.week}週目</span>
        <span className="week__name">{week.event.name}</span>
      </p>
      {reserve > 0 ? (
        <p className="week__reserve">
          始まるまでに <strong>{fmt(reserve)}</strong> を貯めておく
        </p>
      ) : (
        <p className="week__reserve week__reserve--none">貯えは要りません</p>
      )}
      <dl className="week__flow">
        <div>
          <dt>入手</dt>
          <dd>{fmt(income)}</dd>
        </div>
        <div>
          <dt>使う</dt>
          <dd>{fmt(week.use)}</dd>
        </div>
        <div>
          <dt>自由に使える</dt>
          <dd>{fmt(week.free ?? 0)}</dd>
        </div>
      </dl>
    </li>
  )
}

/** 計算のもとになっている値の一覧 */
function Breakdown({
  buyAll,
  damage,
}: {
  buyAll: Readonly<Record<string, boolean>>
  damage: number | null
}) {
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

      <h3 className="cafe__sub">紫晶石の入手量（月〜土の{INCOME_DAYS}日）</h3>
      <dl className="ledger">
        {DAILY_INCOME.map((s) => (
          <div key={s.label}>
            <dt>{s.label}</dt>
            <dd>{fmt(s.perDay)} / 日</dd>
          </div>
        ))}
        <div>
          <dt>ダメージ報酬</dt>
          <dd>{damage === null ? '—' : `${fmt(damage)} / 週`}</dd>
        </div>
        <div>
          <dt>1週間の合計</dt>
          <dd>{damage === null ? '—' : fmt(weeklyBaseIncome() + damage)}</dd>
        </div>
      </dl>
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
