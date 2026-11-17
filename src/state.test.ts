import { describe, expect, it } from 'vitest'
import { DAYS } from './data'
import type { ItemGroup } from './data'
import type { EditableDay, EditableGroup, EditableItem } from './state'
import {
  MAX_PRIORITY,
  applyPriorityTap,
  countRows,
  groupItems,
  groupRows,
  isModified,
  parseCurrent,
  MAX_TARGET,
  parseTarget,
  labelOf,
  parseNumber,
  prunePriority,
  removeGroup,
  toEditable,
  togglePriorityValue,
  toggleGroupSize,
  toPrepared,
} from './state'

/** DAYS からグループ定義を引く */
const groupDef = (dayKey: string, groupKey: string): ItemGroup => {
  const g = DAYS.find((d) => d.key === dayKey)?.groups?.find((x) => x.key === groupKey)
  if (!g) throw new Error(`${dayKey}/${groupKey} が無い`)
  return g
}

/** 全サイズを選んだ初期状態のグループ */
const editableGroup = (def: ItemGroup): EditableGroup => ({
  def,
  raw: String(def.base),
  enabled: def.sizes.map((s) => s.key),
})

/** 曜日の中の 1 グループだけを差し替える */
const withGroup = (
  day: EditableDay,
  key: string,
  patch: Partial<EditableGroup>,
): EditableDay => ({
  ...day,
  groups: day.groups.map((g) => (g.def.key === key ? { ...g, ...patch } : g)),
})

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

describe('parseTarget', () => {
  it.each<[string, number | null, boolean]>([
    ['7200000', 7200000, false],
    ['7,000,000', 7000000, false],
    ['1', 1, false],
    [String(MAX_TARGET), MAX_TARGET, false],
    ['99,999,999', MAX_TARGET, false],
    ['', null, true], // 現在値と違い、空欄も入力ミス扱い（計算できないため）
    ['100.5', null, true], // ポイントは整数なので、小数の目標値は作れない
    ['7200000.5', null, true],
    [String(MAX_TARGET + 1), null, true], // 桁の打ち間違いを弾く
    ['72000000000', null, true],
    ['abc', null, true],
    ['0', null, true],
    ['-100', null, true],
  ])('%o → value=%o invalid=%o', (input, value, invalid) => {
    expect(parseTarget(input)).toEqual({ value, invalid })
  })
})

describe('toPrepared', () => {
  const day = (rows: { label: string; raw: string }[]): EditableDay => ({
    key: 'mon',
    label: '月',
    name: 'x',
    items: rows.map((r, i) => ({ id: `r${i}`, ...r })),
    groups: [],
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

describe('toPrepared: 1個ずつ使う行', () => {
  it('行動名や値を編集しても oneByOne は選択肢に引き継がれる', () => {
    const mon = toEditable()[0]
    const edited = {
      ...mon,
      items: mon.items.map((i) => (i.oneByOne ? { ...i, label: '宝箱', raw: '999' } : i)),
    }
    const p = toPrepared(edited)
    expect(p.options.filter((o) => o.oneByOne).map((o) => o.value)).toEqual([999])
  })

  it('グループや印の無い行は oneByOne にならない', () => {
    const tue = toPrepared(toEditable()[1])
    expect(tue.options.some((o) => o.oneByOne)).toBe(false)
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
    groups: [],
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
    const full = [10, 20, 30, 40, 50]
    expect(full).toHaveLength(MAX_PRIORITY)
    expect(togglePriorityValue(full, 60)).toBe(full) // 変化なし（同一参照）
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

describe('加速グループ', () => {
  const speedupDef = groupDef('tue', 'speedup')
  const speedup = editableGroup(speedupDef)

  it('1分あたりの値から全サイズを計算する', () => {
    expect(groupRows(speedup).map((r) => [r.size.label, r.value])).toEqual([
      ['1分', 150],
      ['5分', 750],
      ['1時間', 9000],
      ['3時間', 27000],
      ['8時間', 72000],
    ])
  })

  // 1曜日に加速グループは1つしかないので、行動名に種類名（建造など）は付けない
  it('行動名は「残り時間◯◯短縮」になる', () => {
    expect(groupRows(speedup).map((r) => r.label)).toEqual([
      '残り時間1分短縮',
      '残り時間5分短縮',
      '残り時間1時間短縮',
      '残り時間3時間短縮',
      '残り時間8時間短縮',
    ])
  })

  it('グループ名を変えても行動名は変わらない', () => {
    const renamed = { ...speedup, def: { ...speedupDef, name: '建造・科学研究・訓練' } }
    expect(groupRows(renamed).map((r) => r.label)).toEqual(groupRows(speedup).map((r) => r.label))
  })

  it('基準値を変えると全サイズが追従する', () => {
    expect(groupRows({ ...speedup, raw: '200' }).map((r) => r.value)).toEqual([
      200, 1000, 12000, 36000, 96000,
    ])
  })

  it('基準値が空・0・負数なら値を出さず、計算にも使わない', () => {
    for (const raw of ['', '0', '-150', 'abc']) {
      expect(groupRows({ ...speedup, raw }).every((r) => r.value === null), raw).toBe(true)
      expect(groupItems([{ ...speedup, raw }]), raw).toEqual([])
    }
  })

  it('チェックを外したサイズは計算に使わない（表示は残る）', () => {
    const partial = { ...speedup, enabled: ['1m', '1h'] }
    expect(groupItems([partial]).map((i) => i.value)).toEqual([150, 9000])
    // 外したものも「持っていない」として一覧には並ぶ
    expect(groupRows(partial).map((r) => r.enabled)).toEqual([true, false, true, false, false])
  })

  it('チェックを全部外すと計算対象が0件になる', () => {
    expect(groupItems([{ ...speedup, enabled: [] }])).toEqual([])
  })

  it('グループが無ければ何も足さない', () => {
    expect(groupItems([])).toEqual([])
  })

  it('toggleGroupSize は追加と解除を切り替える', () => {
    expect(toggleGroupSize(['1m', '5m'], '1h')).toEqual(['1m', '5m', '1h'])
    expect(toggleGroupSize(['1m', '5m'], '5m')).toEqual(['1m'])
    const orig = ['1m']
    toggleGroupSize(orig, '5m')
    expect(orig).toEqual(['1m']) // 元の配列を壊さない
  })

  it('removeGroup で指定したグループだけが消える', () => {
    const tue = toEditable().find((d) => d.key === 'tue')!
    expect(tue.groups.map((g) => g.def.key)).toEqual(['speedup', 'material', 'core'])
    expect(removeGroup(tue, 'speedup').groups.map((g) => g.def.key)).toEqual(['material', 'core'])
  })
})

describe('結束グループ（火曜の兵装素材・兵装コア）', () => {
  const material = editableGroup(groupDef('tue', 'material'))
  const core = editableGroup(groupDef('tue', 'core'))

  it('兵装素材は 1個 = 2.5 から結束単位の値を出す', () => {
    expect(groupRows(material).map((r) => [r.size.label, r.value])).toEqual([
      ['10k個', 25000],
      ['20k個', 50000],
      ['30k個', 75000],
      ['40k個', 100000],
      ['50k個', 125000],
    ])
  })

  it('兵装コアは 1個 = 6250 から結束単位の値を出す', () => {
    expect(groupRows(core).map((r) => [r.size.label, r.value])).toEqual([
      ['10個', 62500],
      ['20個', 125000],
      ['30個', 187500],
      ['40個', 250000],
      ['50個', 312500],
      ['60個', 375000],
      ['70個', 437500],
    ])
  })

  // 同じ曜日に結束グループが2つ並ぶので、行動名には種類名を付ける
  it('行動名は「◯◯◯個使う」で、種類名が付く', () => {
    expect(groupRows(material).map((r) => r.label)).toEqual([
      '兵装素材10k個使う',
      '兵装素材20k個使う',
      '兵装素材30k個使う',
      '兵装素材40k個使う',
      '兵装素材50k個使う',
    ])
    expect(groupRows(core)[0].label).toBe('兵装コア10個使う')
  })

  // 「結束単位でしか使えない」＝ 1個ぶん（×1）の選択肢は作らない
  it('1個ぶん単体は選択肢にならない', () => {
    for (const g of [material, core]) {
      expect(g.def.sizes.every((s) => s.multiplier > 1)).toBe(true)
      expect(groupItems([g]).map((i) => i.value)).not.toContain(g.def.base)
    }
  })

  it('基準値を変えると結束単位の値が追従する', () => {
    expect(groupRows({ ...material, raw: '5' }).map((r) => r.value)).toEqual([
      50000, 100000, 150000, 200000, 250000,
    ])
  })

  it('基準値が無効なら値を出さず、計算にも使わない', () => {
    expect(groupRows({ ...material, raw: '' }).every((r) => r.value === null)).toBe(true)
    expect(groupItems([{ ...material, raw: '0' }])).toEqual([])
  })

  it('チェックを外した結束単位は計算に使わない', () => {
    const partial = { ...core, enabled: ['10', '70'] }
    expect(groupItems([partial]).map((i) => i.value)).toEqual([62500, 437500])
    expect(groupRows(partial).map((r) => r.enabled)).toEqual([
      true,
      false,
      false,
      false,
      false,
      false,
      true,
    ])
  })
})

describe('toPrepared: グループの展開', () => {
  const tue = (): EditableDay => toEditable().find((d) => d.key === 'tue')!

  it('チェックが入っているサイズだけが選択肢になる', () => {
    const p = toPrepared(tue())
    // 加速5 + 兵装素材5 + 兵装コア7 + 生存者募集1 のうち、125,000 が重複して 17 件
    expect(p.options.map((o) => o.value)).toEqual([
      437500, 375000, 312500, 250000, 187500, 125000, 100000, 75000, 72000, 62500, 50000, 27000,
      25000, 9000, 4500, 750, 150,
    ])
  })

  it('値が同じ結束単位は1つの選択肢にまとまる（兵装素材50k と 兵装コア20）', () => {
    const p = toPrepared(tue())
    expect(p.options.find((o) => o.value === 125000)?.labels).toEqual([
      '兵装素材50k個使う',
      '兵装コア20個使う',
    ])
  })

  it('チェックを外すとその値が選択肢から消える', () => {
    const p = toPrepared(withGroup(tue(), 'speedup', { enabled: ['1m', '5m'] }))
    expect(p.options.map((o) => o.value)).toContain(750)
    expect(p.options.map((o) => o.value)).not.toContain(72000)
  })

  it('基準値が無効ならそのグループだけ外れ、他のグループと行は残る', () => {
    const p = toPrepared(withGroup(tue(), 'speedup', { raw: '' }))
    expect(p.options.map((o) => o.value)).toEqual([
      437500, 375000, 312500, 250000, 187500, 125000, 100000, 75000, 62500, 50000, 25000, 4500,
    ])
  })

  it('グループを削除するとその値だけ消える', () => {
    const p = toPrepared(removeGroup(tue(), 'core'))
    expect(p.options.map((o) => o.value)).toEqual([
      125000, 100000, 75000, 72000, 50000, 27000, 25000, 9000, 4500, 750, 150,
    ])
  })

  it('件数表示は全グループのチェック数と行数の合計', () => {
    expect(countRows(tue())).toBe(18) // 5 + 5 + 7 + 1
    expect(countRows(removeGroup(tue(), 'core'))).toBe(11)
  })

  it('金曜は建造・科学研究・訓練を1グループとして展開する', () => {
    const fri = toEditable().find((d) => d.key === 'fri')!
    const p = toPrepared(fri)
    expect(p.options.find((o) => o.value === 9000)?.labels).toEqual(['残り時間1時間短縮'])
    // 兵士訓練11種 + 加速5種
    expect(p.options).toHaveLength(16)
  })

  it('月曜はかけら3種がグループになり、残りは通常の行のまま', () => {
    const mon = toEditable().find((d) => d.key === 'mon')!
    expect(mon.groups.map((g) => g.def.name)).toEqual([
      'UR英雄かけら',
      'SSR英雄かけら',
      'SR英雄かけら',
    ])
    expect(mon.items.map((i) => i.label)).toEqual([
      '10APを消費（野良ゾンビ倒す）',
      '20APを消費（終末精鋭集結）',
      'チップ宝箱(R)開封',
      'チップ宝箱(SR)開封',
      'チップ宝箱(SSR)開封',
      'チップ宝箱(UR)開封',
    ])
    // かけら3種×5サイズ + 通常6行 = 21。重なる値は無いので選択肢も 21 件
    expect(countRows(mon)).toBe(21)
    expect(toPrepared(mon).options).toHaveLength(21)
  })
})

describe('isModified: グループ', () => {
  const tue = (): EditableDay => toEditable().find((d) => d.key === 'tue')!

  it('初期状態では false', () => {
    expect(isModified(tue())).toBe(false)
  })

  it('基準値を変えると true', () => {
    expect(isModified(withGroup(tue(), 'speedup', { raw: '200' }))).toBe(true)
    expect(isModified(withGroup(tue(), 'material', { raw: '3' }))).toBe(true)
  })

  it('チェックを外すと true', () => {
    expect(isModified(withGroup(tue(), 'speedup', { enabled: ['1m'] }))).toBe(true)
    expect(isModified(withGroup(tue(), 'core', { enabled: [] }))).toBe(true)
  })

  it('グループごと削除すると true', () => {
    expect(isModified(removeGroup(tue(), 'material'))).toBe(true)
  })
})

describe('かけらの結束グループ（月曜・木曜）', () => {
  const ur = editableGroup(groupDef('mon', 'ur'))
  const awaken = editableGroup(groupDef('thu', 'awaken'))

  it('1枚あたりの値から 10〜50枚 の値を出す', () => {
    expect(groupRows(ur).map((r) => [r.size.label, r.value])).toEqual([
      ['10枚', 250000],
      ['20枚', 500000],
      ['30枚', 750000],
      ['40枚', 1000000],
      ['50枚', 1250000],
    ])
  })

  // 兵装素材・兵装コアと同じく、かけらも結束単位でしか使わない
  it('1枚ぶん（×1）は選択肢にならない', () => {
    expect(ur.def.sizes.every((s) => s.multiplier >= 10)).toBe(true)
    expect(groupItems([ur]).map((i) => i.value)).not.toContain(ur.def.base)
  })

  it('行動名は「◯◯◯枚消費」で、種類名が付く', () => {
    expect(groupRows(ur).map((r) => r.label)).toEqual([
      'UR英雄かけら10枚消費',
      'UR英雄かけら20枚消費',
      'UR英雄かけら30枚消費',
      'UR英雄かけら40枚消費',
      'UR英雄かけら50枚消費',
    ])
    expect(groupRows(awaken)[0].label).toBe('覚醒かけら10枚消費')
  })

  it('木曜は5種すべてがグループになり、英雄募集だけが通常の行として残る', () => {
    const thu = toEditable().find((d) => d.key === 'thu')!
    expect(thu.groups.map((g) => g.def.name)).toEqual([
      '覚醒かけら',
      '専用武装のかけら',
      'UR英雄かけら',
      'SSR英雄かけら',
      'SR英雄かけら',
    ])
    expect(thu.items.map((i) => i.label)).toEqual(['英雄募集1回'])
    expect(countRows(thu)).toBe(26) // 5種×5サイズ + 1行
  })

  it('同じ値のかけらは1つの選択肢にまとまる（木曜の 1枚=25,000 は3種）', () => {
    const thu = toEditable().find((d) => d.key === 'thu')!
    const p = toPrepared(thu)
    expect(p.options.find((o) => o.value === 250000)?.labels).toEqual([
      '覚醒かけら10枚消費',
      '専用武装のかけら10枚消費',
      'UR英雄かけら10枚消費',
    ])
    // 1枚ぶんは選択肢にならないので 25,000 は SR英雄かけら10枚だけ
    expect(p.options.find((o) => o.value === 25000)?.labels).toEqual(['SR英雄かけら10枚消費'])
    expect(p.options).toHaveLength(16)
  })
})

describe('Option.order（優先チップの並び順）', () => {
  it('獲得値パネルと同じ並び（グループ → 通常の行）になる', () => {
    const tue = toEditable().find((d) => d.key === 'tue')!
    const byOrder = [...toPrepared(tue).options].sort((a, b) => a.order - b.order)
    expect(byOrder.map((o) => o.labels[0])).toEqual([
      '残り時間1分短縮',
      '残り時間5分短縮',
      '残り時間1時間短縮',
      '残り時間3時間短縮',
      '残り時間8時間短縮',
      '兵装素材10k個使う',
      '兵装素材20k個使う',
      '兵装素材30k個使う',
      '兵装素材40k個使う',
      '兵装素材50k個使う', // 兵装コア20個 と同値なのでここにまとまる
      '兵装コア10個使う',
      '兵装コア30個使う',
      '兵装コア40個使う',
      '兵装コア50個使う',
      '兵装コア60個使う',
      '兵装コア70個使う',
      '生存者募集1回',
    ])
  })

  it('order は連番で、値の降順（探索用の並び）とは独立している', () => {
    const p = toPrepared(toEditable().find((d) => d.key === 'tue')!)
    expect([...p.options].map((o) => o.order).sort((a, b) => a - b)).toEqual(
      p.options.map((_, i) => i),
    )
    expect(p.options.map((o) => o.value)).toEqual(
      [...p.options].map((o) => o.value).sort((a, b) => b - a),
    )
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

  it(`実在する値が${MAX_PRIORITY}件あれば、それ以上は追加できない`, () => {
    const many = [100, 200, 300, 400, 500, 600].slice(0, MAX_PRIORITY)
    const full = many.map((value) => ({ value }))
    expect(applyPriorityTap([...many, 999], 700, [...full, { value: 700 }])).toEqual(many)
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
    expect(days[0].items[2]).toMatchObject({
      label: 'チップ宝箱(R)開封',
      raw: '2813',
      oneByOne: true,
    })
    expect(days[0].items[3]).toMatchObject({
      label: 'チップ宝箱(SR)開封',
      raw: '14063',
      oneByOne: true,
    })
    // 印が付くのはこの2行だけ
    expect(days.flatMap((d) => d.items).filter((i) => i.oneByOne)).toHaveLength(2)
    expect(days.flatMap((d) => d.items).every((i) => typeof i.raw === 'string')).toBe(true)
  })

  it('行ごとに一意な id が振られる', () => {
    const ids = toEditable().flatMap((d) => d.items.map((i) => i.id))
    expect(new Set(ids).size).toBe(ids.length)
  })
})
