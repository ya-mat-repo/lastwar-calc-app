import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { DAYS, TARGET } from './data'
import type { DayKey } from './data'
import { solveDay } from './solver'
import type { SolveResult } from './solver'
import {
  MAX_PRIORITY,
  RANK_MARK,
  applyPriorityTap,
  countRows,
  findDay,
  fmt,
  isModified,
  labelOf,
  newItem,
  parseCurrent,
  parseNumber,
  prunePriority,
  removeSpeedup,
  resetDayItems,
  speedupRows,
  toEditable,
  toggleSpeedupSize,
  toPrepared,
} from './state'
import type { EditableDay, EditableItem, EditableSpeedup, PriorityMap } from './state'

const STORAGE_KEY = 'lastwar-calc:current'
const PANEL_ID = 'day-panel'

// サイトデータをブロックした環境やプライベートブラウズでは localStorage への
// アクセス自体が throw する。保存できなくても計算には影響しないので黙って諦める。
const loadRaw = (): string => {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}
const saveRaw = (value: string): void => {
  try {
    localStorage.setItem(STORAGE_KEY, value)
  } catch {
    /* 保存できない環境ではメモリ上だけで動かす */
  }
}

export default function App() {
  const [days, setDays] = useState<EditableDay[]>(toEditable)
  const [dayKey, setDayKey] = useState<DayKey>(DAYS[0].key)
  const [raw, setRaw] = useState<string>(loadRaw)
  // 計算に使う値を先に確認してほしいので、獲得値の一覧は最初から開いておく
  const [editing, setEditing] = useState(true)
  // 曜日ごとの「優先して使うアイテム」。値の配列で、先頭が①（最大3件）
  const [priorities, setPriorities] = useState<PriorityMap>({})
  const [pickingPriority, setPickingPriority] = useState(false)

  useEffect(() => {
    saveRaw(raw)
  }, [raw])

  const day = findDay(days, dayKey)
  const { value: current, invalid: currentInvalid } = parseCurrent(raw)

  // 入力/編集の反応を優先し、重い探索は遅延させる
  const deferredDays = useDeferredValue(days)
  const deferredCurrent = useDeferredValue(current)
  const prepared = useMemo(() => deferredDays.map(toPrepared), [deferredDays])
  const prep = findDay(prepared, dayKey)

  // 値が編集・削除された優先アイテムは自動的に外れるよう、実在する値だけに絞る
  const priority = useMemo(
    () => prunePriority(priorities[dayKey] ?? [], prep.options),
    [priorities, dayKey, prep],
  )
  const deferredPriority = useDeferredValue(priority)

  const result = useMemo(
    () => (deferredCurrent === null ? null : solveDay(prep, deferredCurrent, TARGET, deferredPriority)),
    [prep, deferredCurrent, deferredPriority],
  )

  const remaining = current === null ? null : TARGET - current
  const modified = isModified(day)

  const updateDay = (updater: (d: EditableDay) => EditableDay): void =>
    setDays((prev) => prev.map((d) => (d.key === dayKey ? updater(d) : d)))

  const editItem = (id: string, patch: Partial<EditableItem>): void =>
    updateDay((d) => ({
      ...d,
      items: d.items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    }))

  const removeItem = (id: string): void =>
    updateDay((d) => ({ ...d, items: d.items.filter((i) => i.id !== id) }))

  const addItem = (): void => updateDay((d) => ({ ...d, items: [...d.items, newItem()] }))

  const resetDay = (): void => setDays((prev) => resetDayItems(prev, dayKey))

  /** 加速の基準値（1分あたり）。変えると全サイズが追従する */
  const editSpeedupBase = (raw: string): void =>
    updateDay((d) => (d.speedup ? { ...d, speedup: { ...d.speedup, raw } } : d))

  const toggleSize = (key: string): void =>
    updateDay((d) =>
      d.speedup
        ? { ...d, speedup: { ...d.speedup, enabled: toggleSpeedupSize(d.speedup.enabled, key) } }
        : d,
    )

  const removeSpeedupGroup = (): void => updateDay(removeSpeedup)

  /** タップ順に①②③。選択済みをもう一度押すと外れ、後ろの順位が繰り上がる */
  const togglePriority = (value: number): void =>
    setPriorities((prev) => ({
      ...prev,
      // 実在しなくなった値を先に落としてから適用する（落とした結果もそのまま保存する）
      [dayKey]: applyPriorityTap(prev[dayKey] ?? [], value, prep.options),
    }))

  const clearPriority = (): void => setPriorities((prev) => ({ ...prev, [dayKey]: [] }))

  return (
    <div className="app">
      <header className="header">
        <div className="header__bar" />
        <h1 className="header__title">
          LAST WAR<span>ぼくのかんがえた　さいきょうの　けいさんき</span>
        </h1>
        <div className="target">
          <span className="target__label">目標値</span>
          <span className="target__value">{fmt(TARGET)}</span>
        </div>
      </header>

      <section className="input-card">
        <label className="input-card__label" htmlFor="current">
          現在値
        </label>
        <input
          id="current"
          className={'input-card__input' + (currentInvalid ? ' input-card__input--invalid' : '')}
          type="text"
          inputMode="decimal"
          placeholder="例: 6850000"
          value={raw}
          aria-invalid={currentInvalid}
          onChange={(e) => setRaw(e.target.value)}
        />
        <div className="remaining">
          {currentInvalid ? (
            <span className="remaining__invalid">0 以上の数値を入力してください</span>
          ) : remaining === null ? (
            <span className="remaining__idle">現在値を入力してください</span>
          ) : remaining > 0 ? (
            <>
              <span className="remaining__label">目標まで</span>
              <span className="remaining__value">{fmt(remaining)}</span>
            </>
          ) : remaining === 0 ? (
            <span className="remaining__done">目標値ちょうどです</span>
          ) : (
            <>
              <span className="remaining__label">超過</span>
              <span className="remaining__over">{fmt(-remaining)}</span>
            </>
          )}
        </div>
      </section>

      <nav className="tabs" role="tablist" aria-label="曜日">
        {days.map((d) => (
          <button
            key={d.key}
            id={`tab-${d.key}`}
            role="tab"
            aria-selected={d.key === dayKey}
            aria-controls={PANEL_ID}
            aria-label={d.name}
            className={'tab' + (d.key === dayKey ? ' tab--active' : '')}
            onClick={() => setDayKey(d.key)}
          >
            {d.label}
            {isModified(d) && <i className="tab__dot" aria-label="編集済み" />}
          </button>
        ))}
      </nav>

      <main className="results" id={PANEL_ID} role="tabpanel" aria-labelledby={`tab-${dayKey}`}>
        <section className="editor">
          <button className="editor__toggle" onClick={() => setEditing((v) => !v)}>
            <span className="editor__title">{day.name}の獲得値</span>
            <span className="editor__count">{countRows(day)}件</span>
            {modified && <span className="editor__badge">編集済み</span>}
            <span className="editor__note">※最初に確認してね</span>
            <span className="editor__caret">{editing ? '▲' : '▼'}</span>
          </button>

          {editing && (
            <div className="editor__body">
              <p className="editor__hint">
                値は自由に変更できます。変更はこのページ内だけで有効で、リロードすると初期値に戻ります。
              </p>

              {day.speedup && (
                <SpeedupEditor
                  speedup={day.speedup}
                  onChangeBase={editSpeedupBase}
                  onToggleSize={toggleSize}
                  onRemove={removeSpeedupGroup}
                />
              )}

              <ul className="editor__list">
                {day.items.map((item) => {
                  const value = parseNumber(item.raw)
                  const invalid = item.raw.trim() !== '' && (value === null || value <= 0)
                  return (
                    <li key={item.id} className="row">
                      <input
                        className="row__label"
                        type="text"
                        value={item.label}
                        placeholder="行動名"
                        aria-label="行動名"
                        onChange={(e) => editItem(item.id, { label: e.target.value })}
                      />
                      <input
                        className={'row__value' + (invalid ? ' row__value--invalid' : '')}
                        type="text"
                        inputMode="decimal"
                        value={item.raw}
                        placeholder="0"
                        aria-label={`${item.label.trim() || '行動'}の獲得値`}
                        aria-invalid={invalid}
                        onChange={(e) => editItem(item.id, { raw: e.target.value })}
                      />
                      <button
                        className="row__remove"
                        onClick={() => removeItem(item.id)}
                        aria-label={`${item.label.trim() || 'この行'}を削除`}
                      >
                        ✕
                      </button>
                    </li>
                  )
                })}
              </ul>
              <div className="editor__actions">
                <button className="btn" onClick={addItem}>
                  ＋ 行を追加
                </button>
                <button className="btn btn--ghost" onClick={resetDay} disabled={!modified}>
                  ↺ 初期値に戻す
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="priority">
          <button
            className="priority__toggle"
            onClick={() => setPickingPriority((v) => !v)}
            disabled={prep.options.length === 0}
          >
            <span className="editor__title">優先して使うアイテム</span>
            {priority.length === 0 ? (
              <span className="editor__count">未選択</span>
            ) : (
              <span className="priority__summary">
                {priority.map((v, i) => (
                  <span key={v} className="priority__summaryItem">
                    {RANK_MARK[i]}
                    {labelOf(prep, v)}
                  </span>
                ))}
              </span>
            )}
            <span className="editor__caret">{pickingPriority ? '▲' : '▼'}</span>
          </button>

          {pickingPriority && (
            <div className="priority__body">
              <p className="editor__hint">
                タップした順に①②③が付き、優先アイテムを多く含むパターンが上位に並びます
                （①ほど重視）。優先外のパターンもその下に表示されます。
              </p>
              <div className="chips">
                {prep.options.map((o) => {
                  const rank = priority.indexOf(o.value)
                  const full = rank < 0 && priority.length >= MAX_PRIORITY
                  return (
                    <button
                      key={o.value}
                      className={
                        'chip' + (rank >= 0 ? ' chip--on' : '') + (full ? ' chip--full' : '')
                      }
                      onClick={() => togglePriority(o.value)}
                      aria-pressed={rank >= 0}
                    >
                      {rank >= 0 && <i className="chip__rank">{RANK_MARK[rank]}</i>}
                      <span className="chip__label">{o.labels.join(' / ')}</span>
                      <span className="chip__value">{fmt(o.value)}</span>
                    </button>
                  )
                })}
              </div>
              <div className="editor__actions">
                <button
                  className="btn btn--ghost"
                  onClick={clearPriority}
                  disabled={priority.length === 0}
                >
                  優先指定をクリア
                </button>
              </div>
            </div>
          )}
        </section>

        <StatusNotice result={result} day={day} />

        <PatternList result={result} priority={priority} />
      </main>

      <footer className="footer">
        表示順:{priority.length > 0 && ' 優先アイテムを多く含む順 →'} 組み合わせる値の種類が少ない順
        → 合計回数が少ない順（上位20件）
      </footer>
    </div>
  )
}

/**
 * 加速アイテムの編集。
 * 編集できるのは「1分あたり」だけで、他のサイズはそこから計算した読み取り専用の値を出す。
 * disabled な入力欄にすると「押せば編集できそう」に見えるので、あえて input にしていない。
 */
function SpeedupEditor({
  speedup,
  onChangeBase,
  onToggleSize,
  onRemove,
}: {
  speedup: EditableSpeedup
  onChangeBase: (raw: string) => void
  onToggleSize: (key: string) => void
  onRemove: () => void
}) {
  const rows = speedupRows(speedup)
  const base = parseNumber(speedup.raw)
  const invalid = base === null || base <= 0

  return (
    <section className="speedup">
      <div className="speedup__head">
        <span className="speedup__tag">加速</span>
        <span className="speedup__name">{speedup.name}の残り時間短縮</span>
        <button className="speedup__remove" onClick={onRemove} aria-label="加速グループを削除">
          ✕
        </button>
      </div>

      <div className="speedup__base">
        <label className="speedup__baseLabel" htmlFor="speedup-base">
          基準 1分 =
        </label>
        <input
          id="speedup-base"
          className={'speedup__baseInput' + (invalid ? ' speedup__baseInput--invalid' : '')}
          type="text"
          inputMode="decimal"
          placeholder="0"
          value={speedup.raw}
          aria-invalid={invalid}
          aria-describedby="speedup-base-note"
          onChange={(e) => onChangeBase(e.target.value)}
        />
      </div>
      <p
        className={'speedup__note' + (invalid ? ' speedup__note--invalid' : '')}
        id="speedup-base-note"
      >
        {invalid
          ? '1分あたりの値を入れてください'
          : '編集できるのはここだけです。ほかのサイズは自動で計算されます。'}
      </p>

      <p className="speedup__listTitle">持っている加速アイテム</p>
      <ul className="speedup__list">
        {rows.map((row) => (
          <li key={row.size.key}>
            <label className={'size' + (row.enabled ? '' : ' size--off')}>
              <input
                type="checkbox"
                className="size__check"
                checked={row.enabled}
                onChange={() => onToggleSize(row.size.key)}
              />
              <span className="size__label">{row.size.label}</span>
              <span className="size__value">{row.value === null ? '—' : fmt(row.value)}</span>
              <span className="size__formula">
                {row.size.minutes === 1 ? '基準' : `1分 × ${row.size.minutes}`}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** 結果の見出しメッセージ（結果カードの直前に置く） */
function StatusNotice({ result, day }: { result: SolveResult | null; day: EditableDay }) {
  if (!result) {
    return <p className="notice">現在値を入力すると、{day.name}の組み合わせを計算します。</p>
  }
  switch (result.status) {
    case 'empty':
      return <p className="notice notice--warn">{day.name}の獲得値が1件も設定されていません。</p>
    case 'reached':
      return <p className="notice notice--ok">すでに目標値ちょうどです。追加は不要です。</p>
    case 'over':
      return (
        <p className="notice notice--warn">現在値が目標値を {fmt(-result.diff)} 超えています。</p>
      )
    case 'none':
      return <p className="notice notice--warn">組み合わせが見つかりませんでした。</p>
    case 'exact':
      return <p className="notice notice--ok">ぴったり {fmt(TARGET)} になる組み合わせ</p>
    case 'over-shoot':
      return (
        <p className="notice notice--warn">
          ぴったり一致する組み合わせが無いため、目標値を超える最も近い値を表示しています
        </p>
      )
  }
}

function PatternList({
  result,
  priority,
}: {
  result: SolveResult | null
  priority: readonly number[]
}) {
  if (!result || result.patterns.length === 0) return null

  return (
    <ol className="cards">
      {result.patterns.map((p, i) => (
        <li className="card" key={i}>
          <div className="card__head">
            <span className="card__rank">#{i + 1}</span>
            <span className="card__meta">
              {p.kinds}種 / 計{fmt(p.totalCount)}回
            </span>
          </div>
          <ul className="card__parts">
            {p.parts.map((part, j) => {
              const rank = priority.indexOf(part.option.value)
              return (
                <li key={j}>
                  <span className="part__label">
                    {rank >= 0 && <i className="part__rank">{RANK_MARK[rank]}</i>}
                    {part.option.labels.join(' / ')}
                  </span>
                  <span className="part__count">×{fmt(part.count)}</span>
                  <span className="part__value">{fmt(part.option.value * part.count)}</span>
                </li>
              )
            })}
          </ul>
          <div className="card__foot">
            <span>獲得 {fmt(p.gain)}</span>
            <span className={p.reached === TARGET ? 'is-exact' : 'is-over'}>
              到達 {fmt(p.reached)}
              {p.reached !== TARGET && `（+${fmt(p.reached - TARGET)}）`}
            </span>
          </div>
        </li>
      ))}
    </ol>
  )
}
