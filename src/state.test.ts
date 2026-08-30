import { describe, expect, it } from 'vitest'
import { DAYS } from './data'
import type { EditableDay, EditableItem } from './state'
import {
  MAX_PRIORITY,
  applyPriorityTap,
  isModified,
  parseCurrent,
  labelOf,
  parseNumber,
  prunePriority,
  toEditable,
  togglePriorityValue,
  toPrepared,
} from './state'

describe('parseNumber', () => {
  it.each<[string, number | null]>([
    ['6850000', 6850000],
    ['2812.5', 2812.5],
    ['6,850,000', 6850000], // カンマ入力を許容
    [' 100 ', 100],
    ['12abc3', 123],
    ['', null],
    ['   ', null],
    ['abc', null],
    // 先頭の `-` は残す。捨てると -5 が 5 になり、負数の行を弾けなくなる
    ['-5', -5],
    ['-2812.5', -2812.5],
    [' -100 ', -100],
    ['-', null],
    ['1-2', 12], // 先頭以外の `-` は今までどおり捨てる
  ])('%o → %o', (input, expected) => {
    expect(parseNumber(input)).toBe(expected)
  })
})

describe('parseCurrent', () => {
  it.each<[string, number | null, boolean]>([
    ['6850000', 6850000, false],
    ['', null, false],
    ['abc', null, false],
    ['-100', null, true], // 符号を黙って落とさず、入力ミスとして返す
    ['-0.5', null, true],
    ['0', 0, false],
  ])('%o → value=%o invalid=%o', (input, value, invalid) => {
    expect(parseCurrent(input)).toEqual({ value, invalid })
  })
})

describe('toPrepared', () => {
  const day = (rows: { label: string; raw: string }[]): EditableDay => ({
    key: 'mon',
    label: '月',
    name: 'x',
    items: rows.map((r, i) => ({ id: `r${i}`, ...r })),
  })

  it('入力途中の空欄・0・不正値の行は計算対象から外す', () => {
    const p = toPrepared(
      day([
        { label: 'a', raw: '100' },
        { label: 'b', raw: '' },
        { label: 'c', raw: '0' },
        { label: 'd', raw: 'abc' },
        { label: 'e', raw: '250' },
      ]),
    )
    expect(p.options.map((o) => o.value)).toEqual([250, 100])
  })

  it('行動名が空なら (名称未設定) で補う', () => {
    const p = toPrepared(day([{ label: '   ', raw: '100' }]))
    expect(p.options[0].labels).toEqual(['(名称未設定)'])
  })

  it('全行が無効なら選択肢0件になる', () => {
    expect(toPrepared(day([{ label: 'a', raw: '' }])).options).toEqual([])
  })

  it('負数の行は計算対象から外す（SPEC §3.4）', () => {
    const p = toPrepared(
      day([
        { label: 'a', raw: '100' },
        { label: 'b', raw: '-50' },
        { label: 'c', raw: '-2812.5' },
      ]),
    )
    expect(p.options.map((o) => o.value)).toEqual([100])
  })
})

describe('labelOf', () => {
  const prep = toPrepared({
    key: 'mon',
    label: '月',
    name: 'x',
    items: [
      { id: '1', label: '覚醒かけら', raw: '25000' },
      { id: '2', label: 'UR英雄かけら', raw: '25000' },
      { id: '3', label: '英雄募集', raw: '4200' },
    ],
  })

  it('同じ値のラベルは併記する', () => {
    expect(labelOf(prep, 25000)).toBe('覚醒かけら / UR英雄かけら')
  })

  it('存在しない値なら空文字', () => {
    expect(labelOf(prep, 999)).toBe('')
  })
})

describe('isModified', () => {
  it('初期状態では false', () => {
    expect(toEditable().every((d) => !isModified(d))).toBe(true)
  })

  it('値を変えると true', () => {
    const [mon] = toEditable()
    const edited = { ...mon, items: mon.items.map((i, n) => (n === 0 ? { ...i, raw: '1' } : i)) }
    expect(isModified(edited)).toBe(true)
  })

  it('行動名を変えると true', () => {
    const [mon] = toEditable()
    const edited = { ...mon, items: mon.items.map((i, n) => (n === 0 ? { ...i, label: 'x' } : i)) }
    expect(isModified(edited)).toBe(true)
  })

  it('行を削除・追加すると true', () => {
    const [mon] = toEditable()
    const extra: EditableItem = { id: 'n', label: '', raw: '' }
    expect(isModified({ ...mon, items: mon.items.slice(1) })).toBe(true)
    expect(isModified({ ...mon, items: [...mon.items, extra] })).toBe(true)
  })

  it('同じ値に戻せば false（"3750" と 3750 を同一視する）', () => {
    const [mon] = toEditable()
    const roundTrip = { ...mon, items: mon.items.map((i) => ({ ...i, raw: String(Number(i.raw)) })) }
    expect(isModified(roundTrip)).toBe(false)
  })
})

describe('togglePriorityValue', () => {
  it('タップ順に追加される', () => {
    let p: number[] = []
    p = togglePriorityValue(p, 10)
    p = togglePriorityValue(p, 20)
    p = togglePriorityValue(p, 30)
    expect(p).toEqual([10, 20, 30])
  })

  it(`${MAX_PRIORITY}件を超えて追加できない`, () => {
    const full = [10, 20, 30]
    expect(togglePriorityValue(full, 40)).toBe(full) // 変化なし（同一参照）
  })

  it('選択済みをもう一度押すと外れ、後ろの順位が繰り上がる', () => {
    expect(togglePriorityValue([10, 20, 30], 10)).toEqual([20, 30])
    expect(togglePriorityValue([10, 20, 30], 20)).toEqual([10, 30])
  })

  it('上限まで選んだあとでも、外せば別のものを選べる', () => {
    let p = [10, 20, 30]
    p = togglePriorityValue(p, 20)
    p = togglePriorityValue(p, 40)
    expect(p).toEqual([10, 30, 40])
  })

  it('元の配列を破壊しない', () => {
    const orig = [10, 20]
    togglePriorityValue(orig, 30)
    togglePriorityValue(orig, 10)
    expect(orig).toEqual([10, 20])
  })
})

describe('prunePriority', () => {
  const options = [{ value: 100 }, { value: 200 }]

  it('実在する値だけを残す', () => {
    expect(prunePriority([200, 999, 100], options)).toEqual([200, 100])
  })

  it('選択肢が空なら全て落ちる', () => {
    expect(prunePriority([100], [])).toEqual([])
  })
})

describe('applyPriorityTap', () => {
  const options = [{ value: 100 }, { value: 200 }, { value: 300 }, { value: 400 }]

  it('通常のタップは togglePriorityValue と同じ', () => {
    expect(applyPriorityTap([100], 200, options)).toEqual([100, 200])
    expect(applyPriorityTap([100, 200], 100, options)).toEqual([200])
  })

  // 保存済みの配列を剪定せずに上限を数えると、画面が2件表示なのに
  // 3件目を追加できない（タップしても無反応）状態になる
  it('消えた値が残っていても、実在する分だけで上限を判定する', () => {
    const stored = [100, 999, 200] // 999 は値を編集・削除されて実在しない
    expect(applyPriorityTap(stored, 300, options)).toEqual([100, 200, 300])
  })

  it('剪定した結果がそのまま保存される（消えた値が復活しない）', () => {
    expect(applyPriorityTap([100, 999, 200], 400, options)).not.toContain(999)
  })

  it('実在する値が3件あれば、やはり4件目は追加できない', () => {
    const stored = [100, 200, 300, 999]
    expect(applyPriorityTap(stored, 400, options)).toEqual([100, 200, 300])
  })

  it('全ての選択肢が消えていれば、タップした値だけが残る', () => {
    expect(applyPriorityTap([100, 200, 300], 400, [{ value: 400 }])).toEqual([400])
  })

  it('元の配列を破壊しない', () => {
    const stored = [100, 999]
    applyPriorityTap(stored, 200, options)
    expect(stored).toEqual([100, 999])
  })
})

describe('toEditable', () => {
  it('仕様書の全曜日ぶんを文字列の値で作る', () => {
    const days = toEditable()
    expect(days.map((d) => d.key)).toEqual(DAYS.map((d) => d.key))
    expect(days[0].items[2]).toMatchObject({ label: 'チップ宝箱(R)開封', raw: '2812.5' })
    expect(days.flatMap((d) => d.items).every((i) => typeof i.raw === 'string')).toBe(true)
  })

  it('行ごとに一意な id が振られる', () => {
    const ids = toEditable().flatMap((d) => d.items.map((i) => i.id))
    expect(new Set(ids).size).toBe(ids.length)
  })
})
