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

const ranksIn = (panel: HTMLElement): string[] =>
  [...panel.querySelectorAll('.chip__rank')].map((e) => e.textContent ?? '')

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

    // 最良手は UR英雄かけら×14（solver.test.ts と同じ期待値）
    const first = cards(container)[0]
    expect(within(first).getByText('UR英雄かけら1枚消費')).toBeTruthy()
    expect(within(first).getByText('×14')).toBeTruthy()
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
    // 火曜の 350,000 は 150/4500 では作れないので超過側になる
    expect(await screen.findByText(/目標値を超える最も近い値/)).toBeTruthy()
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

    fireEvent.change(screen.getByLabelText('UR英雄かけら1枚消費の獲得値'), {
      target: { value: '30000' },
    })

    expect(await screen.findByText('編集済み')).toBeTruthy()
    expect(within(screen.getByRole('tab', { name: '月曜日' })).getByLabelText('編集済み')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /初期値に戻す/ }))
    await waitFor(() => expect(screen.queryByText('編集済み')).toBeNull())
    expect(screen.getByLabelText('UR英雄かけら1枚消費の獲得値')).toHaveProperty('value', '25000')
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

    fireEvent.change(screen.getByLabelText('UR英雄かけら1枚消費の獲得値'), { target: { value: '' } })

    // 25000 が消えるので UR英雄かけら×14 の解は出せなくなる
    await waitFor(() => {
      expect(within(cards(container)[0]).queryByText('UR英雄かけら1枚消費')).toBeNull()
    })
  })

  it('行を削除できる', async () => {
    render(<App />)
    expect(screen.getByLabelText('SR英雄かけら1枚消費の獲得値')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'SR英雄かけら1枚消費を削除' }))
    await waitFor(() => expect(screen.queryByLabelText('SR英雄かけら1枚消費の獲得値')).toBeNull())
  })
})

describe('App: 加速アイテム', () => {
  /** 加速グループの「サイズ名 → 表示値」 */
  const sizeRows = (container: HTMLElement): [string, string][] =>
    [...container.querySelectorAll('.speedup__list .size')].map((row) => [
      row.querySelector('.size__label')?.textContent ?? '',
      row.querySelector('.size__value')?.textContent ?? '',
    ])

  const checkbox = (container: HTMLElement, label: string): HTMLInputElement => {
    const row = [...container.querySelectorAll('.speedup__list .size')].find(
      (r) => r.querySelector('.size__label')?.textContent === label,
    )
    if (!row) throw new Error(`${label} の行が無い`)
    return row.querySelector('input[type=checkbox]') as HTMLInputElement
  }

  it('火曜には加速グループが出て、1分の値から全サイズが計算される', () => {
    const { container } = render(<App />)
    fireEvent.click(screen.getByRole('tab', { name: '火曜日' }))

    expect(screen.getByText('建造の残り時間短縮')).toBeTruthy()
    expect(screen.getByLabelText('基準 1分 =')).toHaveProperty('value', '150')
    expect(sizeRows(container)).toEqual([
      ['1分', '150'],
      ['5分', '750'],
      ['1時間', '9,000'],
      ['3時間', '27,000'],
      ['8時間', '72,000'],
    ])
  })

  it('派生サイズには入力欄を出さない（編集できるのは基準だけ）', () => {
    const { container } = render(<App />)
    fireEvent.click(screen.getByRole('tab', { name: '火曜日' }))

    const group = container.querySelector('.speedup') as HTMLElement
    const textInputs = group.querySelectorAll('input:not([type=checkbox])')
    expect(textInputs).toHaveLength(1)
    expect((textInputs[0] as HTMLInputElement).id).toBe('speedup-base')
  })

  it('基準値を変えると全サイズが追従する', async () => {
    const { container } = render(<App />)
    fireEvent.click(screen.getByRole('tab', { name: '火曜日' }))

    fireEvent.change(screen.getByLabelText('基準 1分 ='), { target: { value: '200' } })

    await waitFor(() =>
      expect(sizeRows(container)).toEqual([
        ['1分', '200'],
        ['5分', '1,000'],
        ['1時間', '12,000'],
        ['3時間', '36,000'],
        ['8時間', '96,000'],
      ]),
    )
  })

  it('基準値が空なら値を出さず、注意書きを赤くする', async () => {
    const { container } = render(<App />)
    fireEvent.click(screen.getByRole('tab', { name: '火曜日' }))

    fireEvent.change(screen.getByLabelText('基準 1分 ='), { target: { value: '' } })

    expect(await screen.findByText('1分あたりの値を入れてください')).toBeTruthy()
    expect(screen.getByLabelText('基準 1分 =').getAttribute('aria-invalid')).toBe('true')
    expect(sizeRows(container).map(([, v]) => v)).toEqual(['—', '—', '—', '—', '—'])
  })

  it('加速が計算に使われる（7,199,850 は 1分短縮×1 でぴったり）', async () => {
    const { container } = render(<App />)
    fireEvent.click(screen.getByRole('tab', { name: '火曜日' }))
    typeCurrent('7199850')

    await waitFor(() => expect(cards(container).length).toBeGreaterThan(0))
    const first = cards(container)[0]
    expect(within(first).getByText('残り時間1分短縮')).toBeTruthy()
    expect(within(first).getByText('×1')).toBeTruthy()
  })

  it('持っていないサイズのチェックを外すと候補から消える', async () => {
    const { container } = render(<App />)
    fireEvent.click(screen.getByRole('tab', { name: '火曜日' }))
    typeCurrent('7128000') // 不足 72,000 ＝ 8時間×1

    await waitFor(() => {
      expect(within(cards(container)[0]).queryByText('残り時間8時間短縮')).toBeTruthy()
    })

    fireEvent.click(checkbox(container, '8時間'))

    // 8時間が無くなるので、8時間×1 の解は出せなくなる
    await waitFor(() => {
      expect(within(cards(container)[0]).queryByText('残り時間8時間短縮')).toBeNull()
    })
    expect(checkbox(container, '8時間').checked).toBe(false)
    // 外した行も一覧には残る（値は見える）
    expect(sizeRows(container).map(([s]) => s)).toContain('8時間')
  })

  it('チェックを外すと件数表示が減り、編集済みになる', async () => {
    const { container } = render(<App />)
    fireEvent.click(screen.getByRole('tab', { name: '火曜日' }))
    expect(screen.getByText('6件')).toBeTruthy() // 加速5 + 生存者募集1

    fireEvent.click(checkbox(container, '3時間'))

    expect(await screen.findByText('5件')).toBeTruthy()
    expect(screen.getByText('編集済み')).toBeTruthy()
  })

  it('チェックを外したサイズは優先チップからも消え、優先指定も外れる', async () => {
    const { container } = render(<App />)
    fireEvent.click(screen.getByRole('tab', { name: '火曜日' }))
    typeCurrent('6850000')
    await waitFor(() => expect(cards(container).length).toBeGreaterThan(0))

    const panel = openPriority(container)
    fireEvent.click(chip(panel, /8時間短縮/))
    await waitFor(() => expect(ranksIn(panel)).toEqual(['①']))

    fireEvent.click(checkbox(container, '8時間'))

    await waitFor(() =>
      expect(within(panel).queryByRole('button', { name: /8時間短縮/ })).toBeNull(),
    )
    expect(ranksIn(panel)).toEqual([])
  })

  it('加速グループごと削除できて、初期値に戻せる', async () => {
    const { container } = render(<App />)
    fireEvent.click(screen.getByRole('tab', { name: '火曜日' }))

    fireEvent.click(screen.getByRole('button', { name: '加速グループを削除' }))
    await waitFor(() => expect(container.querySelector('.speedup')).toBeNull())
    expect(screen.getByText('編集済み')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /初期値に戻す/ }))
    await waitFor(() => expect(container.querySelector('.speedup')).toBeTruthy())
    expect(sizeRows(container).map(([, v]) => v)).toEqual([
      '150',
      '750',
      '9,000',
      '27,000',
      '72,000',
    ])
  })

  it('「初期値に戻す」でチェックも全部戻る', async () => {
    const { container } = render(<App />)
    fireEvent.click(screen.getByRole('tab', { name: '火曜日' }))
    fireEvent.click(checkbox(container, '3時間'))
    fireEvent.click(checkbox(container, '8時間'))
    await waitFor(() => expect(checkbox(container, '8時間').checked).toBe(false))

    fireEvent.click(screen.getByRole('button', { name: /初期値に戻す/ }))
    await waitFor(() => expect(checkbox(container, '3時間').checked).toBe(true))
    expect(checkbox(container, '8時間').checked).toBe(true)
  })

  it('加速のない月曜にはグループを出さない', () => {
    const { container } = render(<App />)
    expect(container.querySelector('.speedup')).toBeNull()
  })

  it('金曜は建造・科学研究・訓練が1グループにまとまっている', () => {
    const { container } = render(<App />)
    fireEvent.click(screen.getByRole('tab', { name: '金曜日' }))
    expect(screen.getByText('建造・科学研究・訓練の残り時間短縮')).toBeTruthy()
    expect(container.querySelectorAll('.speedup')).toHaveLength(1)
  })
})

describe('App: 優先して使うアイテム', () => {
  it('タップした順に①②③が付き、結果カードにも印が出る', async () => {
    const { container } = render(<App />)
    typeCurrent('6850000')
    await waitFor(() => expect(cards(container).length).toBeGreaterThan(0))

    const panel = openPriority(container)
    fireEvent.click(chip(panel, /UR英雄かけら/))
    await waitFor(() => expect(ranksIn(panel)).toEqual(['①']))
    fireEvent.click(chip(panel, /20APを消費/))
    await waitFor(() => expect(ranksIn(panel)).toEqual(['①', '②']))

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
    fireEvent.click(chip(panel, /UR英雄かけら/))
    await waitFor(() => expect(ranksIn(panel)).toEqual(['①', '②', '③']))

    fireEvent.click(chip(panel, /チップ宝箱\(SSR\)/)) // ② を外す
    await waitFor(() => expect(ranksIn(panel)).toEqual(['①', '②']))
    expect(chip(panel, /UR英雄かけら/).getAttribute('aria-pressed')).toBe('true')
    expect(chip(panel, /チップ宝箱\(SSR\)/).getAttribute('aria-pressed')).toBe('false')
  })

  it('上限3件を超えては選べない', async () => {
    const { container } = render(<App />)
    const panel = openPriority(container)
    for (const name of [/チップ宝箱\(UR\)/, /チップ宝箱\(SSR\)/, /UR英雄かけら/]) {
      fireEvent.click(chip(panel, name))
    }
    await waitFor(() => expect(ranksIn(panel)).toEqual(['①', '②', '③']))

    fireEvent.click(chip(panel, /20APを消費/))
    await waitFor(() => expect(ranksIn(panel)).toHaveLength(3))
    expect(chip(panel, /20APを消費/).getAttribute('aria-pressed')).toBe('false')
  })

  // レビュー指摘 #2 の回帰テスト。
  // 保存済みの優先指定を剪定せずに上限を数えていたため、
  // 「画面は2件なのに3件目が選べない（タップしても無反応）」状態になっていた。
  it('選択中のアイテムを削除したら、その枠が空いて別のものを選べる', async () => {
    const { container } = render(<App />)
    const panel = openPriority(container)
    for (const name of [/チップ宝箱\(UR\)/, /チップ宝箱\(SSR\)/, /UR英雄かけら/]) {
      fireEvent.click(chip(panel, name))
    }
    await waitFor(() => expect(ranksIn(panel)).toEqual(['①', '②', '③']))

    // ③ に指定した UR英雄かけら の行を削除する
    fireEvent.click(screen.getByRole('button', { name: 'UR英雄かけら1枚消費を削除' }))
    await waitFor(() => expect(ranksIn(panel)).toEqual(['①', '②']))

    // 空いた枠に別のアイテムを入れられる
    fireEvent.click(chip(panel, /20APを消費/))
    await waitFor(() => expect(ranksIn(panel)).toEqual(['①', '②', '③']))
    expect(chip(panel, /20APを消費/).getAttribute('aria-pressed')).toBe('true')
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
    fireEvent.click(screen.getByRole('button', { name: '加速グループを削除' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /優先して使うアイテム/ })).toHaveProperty(
        'disabled',
        true,
      ),
    )
  })
})
