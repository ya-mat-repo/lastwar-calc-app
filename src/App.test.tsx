// @vitest-environment jsdom
/**
 * UI の配線（state.ts / solver.ts をどう繋いでいるか）のテスト。
 * 個々のロジックは state.test.ts / solver.test.ts で確認済みなので、
 * ここでは「画面の操作が期待どおりの状態変化になるか」だけを見る。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from './App'
import { TARGET } from './data'
import { MAX_PRIORITY, RANK_MARK } from './state'

afterEach(cleanup)
beforeEach(() => localStorage.clear())

/** 現在値の入力欄に値を入れる（1文字ずつだと毎回ソルバーが走るのでまとめて入れる） */
const typeCurrent = (value: string): void => {
  fireEvent.change(screen.getByLabelText('現在値'), { target: { value } })
}

const cards = (container: HTMLElement): HTMLElement[] => [
  ...container.querySelectorAll<HTMLElement>('.card'),
]

/** 「優先して使うアイテム」パネルを開いて中身を返す */
const openPriority = (container: HTMLElement): HTMLElement => {
  fireEvent.click(screen.getByRole('button', { name: /優先して使うアイテム/ }))
  const panel = container.querySelector<HTMLElement>('.priority__body')
  if (!panel) throw new Error('優先パネルが開いていない')
  return panel
}

const chip = (panel: HTMLElement, name: RegExp): HTMLElement =>
  within(panel).getByRole('button', { name })

/**
 * パネル内で付いている順位の印。
 * チップは獲得値パネルと同じ並びなので、タップ順とDOM順は一致しない。
 * 「どの順位が埋まっているか」だけを見たいので昇順に揃える。
 */
const ranksIn = (panel: HTMLElement): string[] =>
  [...panel.querySelectorAll('.chip__rank')].map((e) => e.textContent ?? '').sort()

/** 指定したチップに付いている順位の印（未選択なら空文字） */
const rankOf = (panel: HTMLElement, name: RegExp): string =>
  chip(panel, name).querySelector('.chip__rank')?.textContent ?? ''

/** チップの並び（ラベルの配列） */
const chipLabels = (panel: HTMLElement): string[] =>
  [...panel.querySelectorAll('.chip__label')].map((e) => e.textContent ?? '')

describe('App: 基本の流れ', () => {
  it('初期表示では目標値だけ出ていて、結果は出ない', () => {
    const { container } = render(<App />)
    expect(screen.getByText(TARGET.toLocaleString('ja-JP'))).toBeTruthy()
    expect(screen.getByText('現在値を入力してください')).toBeTruthy()
    expect(cards(container)).toHaveLength(0)
  })

  it('現在値を入れると月曜の組み合わせが出る', async () => {
    const { container } = render(<App />)
    typeCurrent('6850000')

    expect(await screen.findByText(`ぴったり ${TARGET.toLocaleString('ja-JP')} になる組み合わせ`))
      .toBeTruthy()
    await waitFor(() => expect(cards(container)).toHaveLength(20))

    // 最良手は SSR英雄かけら40枚消費×1（solver.test.ts と同じ期待値）
    const first = cards(container)[0]
    expect(within(first).getByText('SSR英雄かけら40枚消費')).toBeTruthy()
    expect(within(first).getByText('×1')).toBeTruthy()
    expect(within(first).getByText(`到達 ${TARGET.toLocaleString('ja-JP')}`)).toBeTruthy()
  })

  it('カンマ区切りで貼り付けても計算できる', async () => {
    const { container } = render(<App />)
    typeCurrent('6,850,000')
    await waitFor(() => expect(cards(container).length).toBeGreaterThan(0))
    const remaining = container.querySelector<HTMLElement>('.remaining')
    expect(within(remaining as HTMLElement).getByText('350,000')).toBeTruthy()
  })

  it('曜日タブを切り替えても現在値は保持され、その曜日の獲得値が出る', async () => {
    const { container } = render(<App />)
    typeCurrent('6850000')
    await waitFor(() => expect(cards(container).length).toBeGreaterThan(0))

    fireEvent.click(screen.getByRole('tab', { name: '火曜日' }))

    expect(screen.getByLabelText('現在値')).toHaveProperty('value', '6850000')
    expect(screen.getByRole('tab', { name: '火曜日' }).getAttribute('aria-selected')).toBe('true')
    await screen.findByLabelText('生存者募集1回の獲得値')
    // 火曜の 350,000 は 兵装素材10k（25,000）×14 でぴったり作れる
    expect(await screen.findByText(/ぴったり/)).toBeTruthy()
  })

  it('現在値だけ localStorage に保存され、再マウントで復元される', async () => {
    const first = render(<App />)
    typeCurrent('6850000')
    await waitFor(() => expect(localStorage.getItem('lastwar-calc:current')).toBe('6850000'))
    first.unmount()

    render(<App />)
    expect(screen.getByLabelText('現在値')).toHaveProperty('value', '6850000')
  })

  it('現在値が目標を超えていたら超過を知らせる', async () => {
    const { container } = render(<App />)
    typeCurrent('7300000')
    expect(await screen.findByText(/現在値が目標値を 100,000 超えています/)).toBeTruthy()
    expect(cards(container)).toHaveLength(0)
  })

  it('負数を入れたら計算せず、入力欄を無効として示す', async () => {
    const { container } = render(<App />)
    typeCurrent('-100')

    expect(await screen.findByText('0 以上の数値を入力してください')).toBeTruthy()
    expect(screen.getByLabelText('現在値').getAttribute('aria-invalid')).toBe('true')
    expect(cards(container)).toHaveLength(0)
  })
})

describe('App: 獲得値の編集', () => {
  it('値を変えるとバッジとタブの印が出て、初期値に戻せる', async () => {
    render(<App />)
    const reset = screen.getByRole('button', { name: /初期値に戻す/ })
    expect(reset).toHaveProperty('disabled', true)
    expect(screen.queryByText('編集済み')).toBeNull()

    fireEvent.change(screen.getByLabelText('チップ宝箱(UR)開封の獲得値'), {
      target: { value: '30000' },
    })

    expect(await screen.findByText('編集済み')).toBeTruthy()
    expect(within(screen.getByRole('tab', { name: '月曜日' })).getByLabelText('編集済み')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /初期値に戻す/ }))
    await waitFor(() => expect(screen.queryByText('編集済み')).toBeNull())
    expect(screen.getByLabelText('チップ宝箱(UR)開封の獲得値')).toHaveProperty('value', '281250')
  })

  it('編集した値が計算に反映される', async () => {
    const { container } = render(<App />)
    typeCurrent('7199000')
    await waitFor(() => expect(cards(container).length).toBeGreaterThan(0))

    // 1000 ちょうどの行動を足せば、それ1回で ぴったり になる
    fireEvent.click(screen.getByRole('button', { name: /行を追加/ }))
    const rows = container.querySelectorAll('.row')
    const added = rows[rows.length - 1]
    // 空行の値の欄は「行動の獲得値」、行動名を入れると「◯◯の獲得値」に変わる
    fireEvent.change(within(added as HTMLElement).getByLabelText('行動の獲得値'), {
      target: { value: '1000' },
    })
    fireEvent.change(within(added as HTMLElement).getByLabelText('行動名'), {
      target: { value: 'テスト行動' },
    })

    await waitFor(() => {
      const first = cards(container)[0]
      expect(within(first).queryByText('テスト行動')).toBeTruthy()
    })
    expect(within(cards(container)[0]).getByText('×1')).toBeTruthy()
  })

  it('値を空・0にした行は計算対象から外れる', async () => {
    const { container } = render(<App />)
    typeCurrent('6850000')
    await waitFor(() => expect(cards(container).length).toBeGreaterThan(0))

    fireEvent.change(screen.getByLabelText('チップ宝箱(UR)開封の獲得値'), { target: { value: '' } })

    await waitFor(() => {
      const chips = [...container.querySelectorAll('.card .part__label')]
      expect(chips.some((e) => e.textContent?.includes('チップ宝箱(UR)開封'))).toBe(false)
    })
  })

  it('行を削除できる', async () => {
    render(<App />)
    expect(screen.getByLabelText('チップ宝箱(R)開封の獲得値')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'チップ宝箱(R)開封を削除' }))
    await waitFor(() => expect(screen.queryByLabelText('チップ宝箱(R)開封の獲得値')).toBeNull())
  })
})

describe('App: グループ（加速・結束）', () => {
  /** グループの「サイズ名 → 表示値」 */
  const sizeRows = (container: HTMLElement, groupKey: string): [string, string][] =>
    [...container.querySelectorAll(`[data-group="${groupKey}"] .size`)].map((row) => [
      row.querySelector('.size__label')?.textContent ?? '',
      row.querySelector('.size__value')?.textContent ?? '',
    ])

  const checkbox = (container: HTMLElement, groupKey: string, label: string): HTMLInputElement => {
    const row = [...container.querySelectorAll(`[data-group="${groupKey}"] .size`)].find(
      (r) => r.querySelector('.size__label')?.textContent === label,
    )
    if (!row) throw new Error(`${groupKey}/${label} の行が無い`)
    return row.querySelector('input[type=checkbox]') as HTMLInputElement
  }

  const openTue = (): ReturnType<typeof render> => {
    const view = render(<App />)
    fireEvent.click(screen.getByRole('tab', { name: '火曜日' }))
    return view
  }

  it('火曜には加速グループが出て、1分の値から全サイズが計算される', () => {
    const { container } = openTue()

    expect(screen.getByText('建造の残り時間短縮')).toBeTruthy()
    expect(screen.getByLabelText('建造の基準値（1分あたり）')).toHaveProperty('value', '150')
    expect(sizeRows(container, 'speedup')).toEqual([
      ['1分', '150'],
      ['5分', '750'],
      ['1時間', '9,000'],
      ['3時間', '27,000'],
      ['8時間', '72,000'],
    ])
  })

  it('火曜には結束グループが2つ出て、1個の値から結束単位が計算される', () => {
    const { container } = openTue()

    expect(screen.getByText('兵装素材の結束')).toBeTruthy()
    expect(screen.getByText('兵装コアの結束')).toBeTruthy()
    expect(screen.getByLabelText('兵装素材の基準値（1個あたり）')).toHaveProperty('value', '2.5')
    expect(screen.getByLabelText('兵装コアの基準値（1個あたり）')).toHaveProperty('value', '6250')

    expect(sizeRows(container, 'material')).toEqual([
      ['10k個', '25,000'],
      ['20k個', '50,000'],
      ['30k個', '75,000'],
      ['40k個', '100,000'],
      ['50k個', '125,000'],
    ])
    expect(sizeRows(container, 'core')).toEqual([
      ['10個', '62,500'],
      ['20個', '125,000'],
      ['30個', '187,500'],
      ['40個', '250,000'],
      ['50個', '312,500'],
      ['60個', '375,000'],
      ['70個', '437,500'],
    ])
  })

  it('結束は「1個ずつでは使えません」と示し、1個ぶんの行は出さない', () => {
    const { container } = openTue()
    expect(screen.getAllByText('使う結束単位（1個ずつでは使えません）')).toHaveLength(2)
    // ×1 の行が無い＝基準値そのものは選択肢にならない
    expect(sizeRows(container, 'material').map(([, v]) => v)).not.toContain('2.5')
    expect(container.querySelectorAll('[data-group="material"] .size')).toHaveLength(5)
  })

  it('派生サイズには入力欄を出さない（編集できるのは基準だけ）', () => {
    const { container } = openTue()

    for (const key of ['speedup', 'material', 'core']) {
      const group = container.querySelector(`[data-group="${key}"]`) as HTMLElement
      const textInputs = group.querySelectorAll('input:not([type=checkbox])')
      expect(textInputs).toHaveLength(1)
      expect((textInputs[0] as HTMLInputElement).id).toBe(`group-base-${key}`)
    }
  })

  it('基準値を変えると全サイズが追従する', async () => {
    const { container } = openTue()

    fireEvent.change(screen.getByLabelText('建造の基準値（1分あたり）'), {
      target: { value: '200' },
    })
    fireEvent.change(screen.getByLabelText('兵装素材の基準値（1個あたり）'), {
      target: { value: '5' },
    })

    await waitFor(() =>
      expect(sizeRows(container, 'speedup')).toEqual([
        ['1分', '200'],
        ['5分', '1,000'],
        ['1時間', '12,000'],
        ['3時間', '36,000'],
        ['8時間', '96,000'],
      ]),
    )
    expect(sizeRows(container, 'material')).toEqual([
      ['10k個', '50,000'],
      ['20k個', '100,000'],
      ['30k個', '150,000'],
      ['40k個', '200,000'],
      ['50k個', '250,000'],
    ])
  })

  it('基準値が空なら値を出さず、注意書きを赤くする', async () => {
    const { container } = openTue()

    fireEvent.change(screen.getByLabelText('建造の基準値（1分あたり）'), { target: { value: '' } })

    expect(await screen.findByText('1分あたりの値を入れてください')).toBeTruthy()
    expect(screen.getByLabelText('建造の基準値（1分あたり）').getAttribute('aria-invalid')).toBe(
      'true',
    )
    expect(sizeRows(container, 'speedup').map(([, v]) => v)).toEqual(['—', '—', '—', '—', '—'])
    // 他のグループは巻き込まれない
    expect(sizeRows(container, 'material')[0][1]).toBe('25,000')
  })

  it('結束の基準値が空なら 1個あたりの値を求める', async () => {
    const { container } = openTue()

    fireEvent.change(screen.getByLabelText('兵装コアの基準値（1個あたり）'), {
      target: { value: '' },
    })

    expect(await screen.findByText('1個あたりの値を入れてください')).toBeTruthy()
    expect(sizeRows(container, 'core').map(([, v]) => v)).toEqual([
      '—',
      '—',
      '—',
      '—',
      '—',
      '—',
      '—',
    ])
  })

  it('加速が計算に使われる（7,199,850 は 1分短縮×1 でぴったり）', async () => {
    const { container } = openTue()
    typeCurrent('7199850')

    await waitFor(() => expect(cards(container).length).toBeGreaterThan(0))
    const first = cards(container)[0]
    expect(within(first).getByText('残り時間1分短縮')).toBeTruthy()
    expect(within(first).getByText('×1')).toBeTruthy()
  })

  it('結束が計算に使われる（7,137,500 は 兵装コア10×1 でぴったり）', async () => {
    const { container } = openTue()
    typeCurrent('7137500') // 不足 62,500 ＝ 兵装コア10個ぶん

    await waitFor(() => expect(cards(container).length).toBeGreaterThan(0))
    const first = cards(container)[0]
    expect(within(first).getByText('兵装コア10個使う')).toBeTruthy()
    expect(within(first).getByText('×1')).toBeTruthy()
  })

  it('同じ値の結束単位は1つの選択肢にまとまる', async () => {
    const { container } = openTue()
    typeCurrent('7075000') // 不足 125,000 ＝ 兵装素材50k ＝ 兵装コア20

    await waitFor(() => expect(cards(container).length).toBeGreaterThan(0))
    expect(
      within(cards(container)[0]).getByText('兵装素材50k個使う / 兵装コア20個使う'),
    ).toBeTruthy()
  })

  it('持っていないサイズのチェックを外すと候補から消える', async () => {
    const { container } = openTue()
    typeCurrent('7128000') // 不足 72,000 ＝ 8時間×1

    await waitFor(() => {
      expect(within(cards(container)[0]).queryByText('残り時間8時間短縮')).toBeTruthy()
    })

    fireEvent.click(checkbox(container, 'speedup', '8時間'))

    // 8時間が無くなるので、8時間×1 の解は出せなくなる
    await waitFor(() => {
      expect(within(cards(container)[0]).queryByText('残り時間8時間短縮')).toBeNull()
    })
    expect(checkbox(container, 'speedup', '8時間').checked).toBe(false)
    // 外した行も一覧には残る（値は見える）
    expect(sizeRows(container, 'speedup').map(([s]) => s)).toContain('8時間')
  })

  it('使わない結束単位のチェックを外すと候補から消える', async () => {
    const { container } = openTue()
    typeCurrent('7137500') // 不足 62,500 ＝ 兵装コア10×1

    await waitFor(() => {
      expect(within(cards(container)[0]).queryByText('兵装コア10個使う')).toBeTruthy()
    })

    fireEvent.click(checkbox(container, 'core', '10個'))

    await waitFor(() => {
      expect(within(cards(container)[0]).queryByText('兵装コア10個使う')).toBeNull()
    })
    expect(checkbox(container, 'core', '10個').checked).toBe(false)
  })

  it('チェックを外すと件数表示が減り、編集済みになる', async () => {
    const { container } = openTue()
    // 加速5 + 兵装素材5 + 兵装コア7 + 生存者募集1
    expect(screen.getByText('18件')).toBeTruthy()

    fireEvent.click(checkbox(container, 'speedup', '3時間'))
    expect(await screen.findByText('17件')).toBeTruthy()

    fireEvent.click(checkbox(container, 'core', '70個'))
    expect(await screen.findByText('16件')).toBeTruthy()
    expect(screen.getByText('編集済み')).toBeTruthy()
  })

  it('チェックを外したサイズは優先チップからも消え、優先指定も外れる', async () => {
    const { container } = openTue()
    typeCurrent('6850000')
    await waitFor(() => expect(cards(container).length).toBeGreaterThan(0))

    const panel = openPriority(container)
    fireEvent.click(chip(panel, /8時間短縮/))
    await waitFor(() => expect(ranksIn(panel)).toEqual(['①']))

    fireEvent.click(checkbox(container, 'speedup', '8時間'))

    await waitFor(() =>
      expect(within(panel).queryByRole('button', { name: /8時間短縮/ })).toBeNull(),
    )
    expect(ranksIn(panel)).toEqual([])
  })

  it('グループごと削除できて、初期値に戻せる', async () => {
    const { container } = openTue()

    fireEvent.click(screen.getByRole('button', { name: '建造の残り時間短縮を削除' }))
    await waitFor(() => expect(container.querySelector('[data-group="speedup"]')).toBeNull())
    expect(screen.getByText('編集済み')).toBeTruthy()
    // 他のグループは残る
    expect(container.querySelectorAll('.group')).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: '兵装素材の結束を削除' }))
    await waitFor(() => expect(container.querySelectorAll('.group')).toHaveLength(1))

    fireEvent.click(screen.getByRole('button', { name: /初期値に戻す/ }))
    await waitFor(() => expect(container.querySelectorAll('.group')).toHaveLength(3))
    expect(sizeRows(container, 'speedup').map(([, v]) => v)).toEqual([
      '150',
      '750',
      '9,000',
      '27,000',
      '72,000',
    ])
    expect(sizeRows(container, 'material').map(([, v]) => v)).toEqual([
      '25,000',
      '50,000',
      '75,000',
      '100,000',
      '125,000',
    ])
  })

  it('「初期値に戻す」でチェックも全部戻る', async () => {
    const { container } = openTue()
    fireEvent.click(checkbox(container, 'speedup', '3時間'))
    fireEvent.click(checkbox(container, 'core', '70個'))
    await waitFor(() => expect(checkbox(container, 'core', '70個').checked).toBe(false))

    fireEvent.click(screen.getByRole('button', { name: /初期値に戻す/ }))
    await waitFor(() => expect(checkbox(container, 'speedup', '3時間').checked).toBe(true))
    expect(checkbox(container, 'core', '70個').checked).toBe(true)
  })

  it('月曜・木曜にはかけらの結束グループが並ぶ', () => {
    const { container } = render(<App />)
    expect(container.querySelectorAll('.group')).toHaveLength(3)
    expect(screen.getByText('UR英雄かけらの結束')).toBeTruthy()
    // かけらも結束単位でしか使わないので、1枚ぶんの行は出ない
    expect(screen.getAllByText('使う結束単位（1枚ずつでは使えません）')).toHaveLength(3)
    expect(sizeRows(container, 'ur')).toEqual([
      ['10枚', '250,000'],
      ['20枚', '500,000'],
      ['30枚', '750,000'],
      ['40枚', '1,000,000'],
      ['50枚', '1,250,000'],
    ])

    fireEvent.click(screen.getByRole('tab', { name: '木曜日' }))
    expect(container.querySelectorAll('.group')).toHaveLength(5)
    expect(screen.getByText('専用武装のかけらの結束')).toBeTruthy()
    expect(screen.getByText('覚醒かけらの結束')).toBeTruthy()
  })

  it('金曜は建造・科学研究・訓練が1グループにまとまっている', () => {
    const { container } = render(<App />)
    fireEvent.click(screen.getByRole('tab', { name: '金曜日' }))
    expect(screen.getByText('建造・科学研究・訓練の残り時間短縮')).toBeTruthy()
    expect(container.querySelectorAll('.group')).toHaveLength(1)
  })
})

describe('App: 優先して使うアイテム', () => {
  it('タップした順に①②③が付き、結果カードにも印が出る', async () => {
    const { container } = render(<App />)
    typeCurrent('6850000')
    await waitFor(() => expect(cards(container).length).toBeGreaterThan(0))

    const panel = openPriority(container)
    fireEvent.click(chip(panel, /チップ宝箱\(UR\)/))
    await waitFor(() => expect(ranksIn(panel)).toEqual(['①']))
    fireEvent.click(chip(panel, /20APを消費/))
    await waitFor(() => expect(ranksIn(panel)).toEqual(['①', '②']))
    expect(rankOf(panel, /チップ宝箱\(UR\)/)).toBe('①')
    expect(rankOf(panel, /20APを消費/)).toBe('②')

    // 上位のパターンは優先アイテムを含み、カードにも順位の印が付く
    await waitFor(() => {
      const first = cards(container)[0]
      expect(first.querySelector('.part__rank')).toBeTruthy()
    })
  })

  it('もう一度タップすると外れ、後ろの順位が繰り上がる', async () => {
    const { container } = render(<App />)
    const panel = openPriority(container)
    fireEvent.click(chip(panel, /チップ宝箱\(UR\)/))
    fireEvent.click(chip(panel, /チップ宝箱\(SSR\)/))
    fireEvent.click(chip(panel, /10APを消費/))
    await waitFor(() => expect(ranksIn(panel)).toEqual(['①', '②', '③']))

    fireEvent.click(chip(panel, /チップ宝箱\(SSR\)/)) // ② を外す
    await waitFor(() => expect(ranksIn(panel)).toEqual(['①', '②']))
    // ③ だった 10AP が ② に繰り上がる
    expect(rankOf(panel, /チップ宝箱\(UR\)/)).toBe('①')
    expect(rankOf(panel, /10APを消費/)).toBe('②')
    expect(chip(panel, /チップ宝箱\(SSR\)/).getAttribute('aria-pressed')).toBe('false')
  })

  it(`上限${MAX_PRIORITY}件を超えては選べない`, async () => {
    const { container } = render(<App />)
    const panel = openPriority(container)
    for (const name of [
      /チップ宝箱\(UR\)/,
      /チップ宝箱\(SSR\)/,
      /チップ宝箱\(SR\)/,
      /チップ宝箱\(R\)/,
      /10APを消費/,
    ]) {
      fireEvent.click(chip(panel, name))
    }
    await waitFor(() => expect(ranksIn(panel)).toEqual(['①', '②', '③', '④', '⑤']))

    fireEvent.click(chip(panel, /20APを消費/))
    await waitFor(() => expect(ranksIn(panel)).toHaveLength(MAX_PRIORITY))
    expect(chip(panel, /20APを消費/).getAttribute('aria-pressed')).toBe('false')
  })

  // レビュー指摘 #2 の回帰テスト。
  // 保存済みの優先指定を剪定せずに上限を数えていたため、
  // 「画面は4件なのに5件目が選べない（タップしても無反応）」状態になっていた。
  // 上限まで埋めてから1件消さないと再現しないので、必ず MAX_PRIORITY 件選ぶこと。
  it('上限まで選んだあとその1つを削除したら、空いた枠に別のものを選べる', async () => {
    const { container } = render(<App />)
    const panel = openPriority(container)
    for (const name of [
      /チップ宝箱\(UR\)/,
      /チップ宝箱\(SSR\)/,
      /チップ宝箱\(SR\)/,
      /チップ宝箱\(R\)/,
      /10APを消費/,
    ]) {
      fireEvent.click(chip(panel, name))
    }
    await waitFor(() => expect(ranksIn(panel)).toHaveLength(MAX_PRIORITY))

    // ⑤ に指定した 10AP の行を削除する
    fireEvent.click(screen.getByRole('button', { name: /10APを消費.*を削除/ }))
    await waitFor(() => expect(ranksIn(panel)).toHaveLength(MAX_PRIORITY - 1))

    // 空いた枠に別のアイテムを入れられる
    fireEvent.click(chip(panel, /20APを消費/))
    await waitFor(() => expect(ranksIn(panel)).toHaveLength(MAX_PRIORITY))
    expect(rankOf(panel, /20APを消費/)).toBe(RANK_MARK[MAX_PRIORITY - 1])
  })

  // 値の降順で並べると編集パネルと食い違って探しにくいので、パネルと同じ並びにする
  it('チップは獲得値パネルと同じ並びになる', () => {
    const { container } = render(<App />)
    fireEvent.click(screen.getByRole('tab', { name: '火曜日' }))
    const panel = openPriority(container)

    expect(chipLabels(panel)).toEqual([
      '残り時間1分短縮',
      '残り時間5分短縮',
      '残り時間1時間短縮',
      '残り時間3時間短縮',
      '残り時間8時間短縮',
      '兵装素材10k個使う',
      '兵装素材20k個使う',
      '兵装素材30k個使う',
      '兵装素材40k個使う',
      '兵装素材50k個使う / 兵装コア20個使う',
      '兵装コア10個使う',
      '兵装コア30個使う',
      '兵装コア40個使う',
      '兵装コア50個使う',
      '兵装コア60個使う',
      '兵装コア70個使う',
      '生存者募集1回',
    ])
  })

  it('「優先指定をクリア」で一括解除できる', async () => {
    const { container } = render(<App />)
    const panel = openPriority(container)
    fireEvent.click(chip(panel, /チップ宝箱\(UR\)/))
    await waitFor(() => expect(ranksIn(panel)).toEqual(['①']))

    fireEvent.click(within(panel).getByRole('button', { name: /優先指定をクリア/ }))
    await waitFor(() => expect(ranksIn(panel)).toEqual([]))
  })

  it('優先指定は曜日ごとに独立している', async () => {
    const { container } = render(<App />)
    const panel = openPriority(container)
    fireEvent.click(chip(panel, /チップ宝箱\(UR\)/))
    await waitFor(() => expect(ranksIn(panel)).toEqual(['①']))

    fireEvent.click(screen.getByRole('tab', { name: '火曜日' }))
    const tuePanel = container.querySelector<HTMLElement>('.priority__body')
    expect(tuePanel).toBeTruthy()
    await waitFor(() => expect(ranksIn(tuePanel as HTMLElement)).toEqual([]))

    fireEvent.click(screen.getByRole('tab', { name: '月曜日' }))
    const monPanel = container.querySelector<HTMLElement>('.priority__body')
    await waitFor(() => expect(ranksIn(monPanel as HTMLElement)).toEqual(['①']))
  })
})

describe('App: 画面の並び順（SPEC §3.1）', () => {
  /** results 内の主要ブロックを出現順に並べる */
  const blocks = (container: HTMLElement): string[] =>
    [...(container.querySelector('.results') as HTMLElement).querySelectorAll(
      '.editor, .priority, .notice, .cards',
    )].map((e) => e.className.split(' ')[0])

  it('編集パネル → 優先パネル → 結果メッセージ → 結果カード の順に並ぶ', async () => {
    const { container } = render(<App />)
    typeCurrent('6850000')
    await waitFor(() => expect(cards(container).length).toBeGreaterThan(0))

    // 計算に使う値を先に確認させ、メッセージは結果カードの見出しとして直前に置く
    expect(blocks(container)).toEqual(['editor', 'priority', 'notice', 'cards'])
  })

  it('結果が出ない状態でもメッセージは編集パネルより下に出る', () => {
    const { container } = render(<App />)
    expect(blocks(container)).toEqual(['editor', 'priority', 'notice'])
  })
})

describe('App: アクセシビリティの配線', () => {
  it('タブが結果パネルを指しており、選択状態が排他になっている', () => {
    render(<App />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(5)
    expect(tabs.filter((t) => t.getAttribute('aria-selected') === 'true')).toHaveLength(1)

    const panel = screen.getByRole('tabpanel')
    expect(panel.id).toBe(tabs[0].getAttribute('aria-controls'))
    expect(panel.getAttribute('aria-labelledby')).toBe(tabs[0].id)
  })

  it('獲得値が0件なら優先パネルを開けない', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('tab', { name: '火曜日' }))
    fireEvent.click(screen.getByRole('button', { name: '生存者募集1回を削除' }))
    for (const name of ['建造の残り時間短縮', '兵装素材の結束', '兵装コアの結束']) {
      fireEvent.click(screen.getByRole('button', { name: `${name}を削除` }))
    }
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /優先して使うアイテム/ })).toHaveProperty(
        'disabled',
        true,
      ),
    )
  })
})

describe('App: 1個ずつ使うアイテムの注意', () => {
  const HINT = /必ず1個ずつ/

  it('月曜の獲得値パネルに、チップ宝箱(R)・(SR) を1個ずつ使う注意が出る', () => {
    render(<App />)
    const note = screen.getByRole('note')
    expect(note.textContent).toMatch(HINT)
    expect(note.textContent).toContain('チップ宝箱(R)開封・チップ宝箱(SR)開封')
    expect(note.textContent).toContain('28,130')
    expect(note.textContent).toContain('28,125')
  })

  it('該当アイテムの無い曜日には出ない', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('tab', { name: '火曜日' }))
    expect(screen.queryByRole('note')).toBeNull()
  })

  it('結果カードでは、2回以上使う行にだけ注意が付く', async () => {
    const { container } = render(<App />)

    // 不足 5,626 ＝ チップ宝箱(R) ×2
    typeCurrent(String(TARGET - 2813 * 2))
    await waitFor(() => expect(cards(container).length).toBeGreaterThan(0))
    const first = cards(container)[0]
    expect(within(first).getByText(/チップ宝箱\(R\)開封/)).toBeTruthy()
    expect(within(first).getByText('×2')).toBeTruthy()
    expect(first.querySelector('.part__note')?.textContent).toMatch(/1個ずつ使う/)

    // 不足 2,813 ＝ チップ宝箱(R) ×1 なら、まとめて使う余地が無いので出さない
    typeCurrent(String(TARGET - 2813))
    await waitFor(() => expect(within(cards(container)[0]).getByText('×1')).toBeTruthy())
    expect(cards(container)[0].querySelector('.part__note')).toBeNull()
  })

  it('かけらなど該当しない行には付かない', async () => {
    const { container } = render(<App />)
    typeCurrent('6850000')
    await waitFor(() => expect(cards(container)).toHaveLength(20))
    expect(cards(container)[0].querySelector('.part__note')).toBeNull()
  })
})
