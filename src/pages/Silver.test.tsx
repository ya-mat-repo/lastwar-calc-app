// @vitest-environment jsdom
/**
 * 銀塊必要量チェッカーの画面のテスト（SPEC §14）。
 * 計算そのものは silver.test.ts で確認しているので、ここでは
 * 「入力がどう結果に反映されるか」「カレンダーの表示」「保存と復元」を見る。
 *
 * 画面は開いた日の今月と来月を出すので、日付は 2026-11-25 に固定する
 * （SPEC §14.6 の例と同じ 2026年11月・12月になる）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import Silver from './Silver'
import type { Ymd } from '../silver'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})
beforeEach(() => localStorage.clear())

const TODAY: Ymd = { year: 2026, month: 11, day: 25 }
const open = (today: Ymd = TODAY): ReturnType<typeof render> => render(<Silver today={today} />)

const DAMAGE_KEY = 'lastwar-silver:damage'
const CARRY_KEY = 'lastwar-silver:carry'
const BUYALL_KEY = 'lastwar-silver:buyall:gold'
const BUYALL_BOUNTY_KEY = 'lastwar-silver:buyall:bounty'

/** 前月繰越分を入れた状態で開く。繰越分は保存されないので、＋ を必要な回数だけ押す */
const openWithCarry = (carry: number): ReturnType<typeof render> => {
  const view = open()
  const plus = screen.getByRole('button', { name: '前月繰越分の銀塊量を 5,000 増やす' })
  for (let i = 0; i < carry / 5_000; i++) fireEvent.click(plus)
  return view
}

const damageInput = (): HTMLInputElement =>
  screen.getByLabelText(/ダメージ報酬でもらえる紫晶石/) as HTMLInputElement
const typeDamage = (value: string): void => {
  fireEvent.change(damageInput(), { target: { value } })
}
const goldSwitch = (): HTMLInputElement =>
  screen.getByRole('switch', { name: /閃金をお金で買える上限まで買う/ }) as HTMLInputElement
const bountySwitch = (): HTMLInputElement =>
  screen.getByRole('switch', { name: /賞金稼ぎ用弾丸をお金で買える上限まで買う/ }) as HTMLInputElement
/** 前月繰越分の表示（入力欄ではなく、＋ − でだけ変わる値） */
const carryValue = (): string => screen.getByLabelText('前月繰越分の銀塊量').textContent ?? ''
const carryPlus = (): HTMLButtonElement =>
  screen.getByRole('button', { name: '前月繰越分の銀塊量を 5,000 増やす' }) as HTMLButtonElement
const carryMinus = (): HTMLButtonElement =>
  screen.getByRole('button', { name: '前月繰越分の銀塊量を 5,000 減らす' }) as HTMLButtonElement

/** 見出しからそのカードを引く */
const card = (name: string): HTMLElement =>
  screen.getByRole('heading', { level: 2, name }).closest('section') as HTMLElement
const NOV = '11月の必要量'

/** 帳面（項目名 → 数字）の1行の数字 */
const ledger = (within_: HTMLElement, term: string): string =>
  within(within_).getByText(term).closest('div')?.querySelector('dd')?.textContent ?? ''
const need = (month: string): string => card(month).querySelector('.total__value')?.textContent ?? ''
/** 必要量の下に出る「◯月は ◯ 銀塊が不足します」（出ていなければ null） */
const alertText = (month: string): string | null =>
  card(month).querySelector('.total__alert')?.textContent ?? null
const exchanges = (month: string): string => ledger(card(month), '紫晶石との交換回数（月の上限 50回）')
const surplus = (month: string): string => ledger(card(month), '紫晶石の余り')
/** 入手量の内訳を開閉するボタン */
const incomeToggle = (): HTMLElement =>
  screen.getByRole('button', { name: /11月の入手量（紫晶石）/ })
/**
 * 今月のカードの「来月に向けて」を [来月の必要量, 来月の不足分, 今月の繰越推奨量, いまの見込みの繰越] にする
 */
const outlook = (month = '12月'): string[] =>
  [`${month}の必要量`, `${month}の不足分`, '今月の繰越推奨量', 'いまの見込みの繰越'].map((term) =>
    ledger(card(NOV), term),
  )

/**
 * 週ごとの流れを [期間, イベント, 繰越（入）, 入手量, 必要量, 結果の見出し, 結果の値] の配列にする。
 * 結果は、足りれば「次週への繰越」（最後は「翌月への繰越」）、足りなければ「銀塊の不足分」。
 */
const flow = (): string[][] =>
  [...card('週ごとの流れ').querySelectorAll('.week')].map((li) => {
    const dd = [...li.querySelectorAll('dd')].map((el) => el.textContent ?? '')
    const result = li.querySelector('.week__result dt')?.textContent?.replace('＝', '').trim() ?? ''
    return [
      li.querySelector('.week__no')?.textContent ?? '',
      li.querySelector('.week__name')?.textContent ?? '',
      dd[0] ?? '',
      dd[1] ?? '',
      dd[2] ?? '',
      result,
      dd[3] ?? '',
    ]
  })

/** カレンダーの1か月ぶんを、週ごとの「日付 | 帯」の文字列にする */
const calendar = (caption: string): string[] => {
  const table = screen.getByRole('table', { name: caption })
  return [...table.querySelectorAll('tbody')].map((week) => {
    const days = [...week.querySelectorAll('.cal__day')].map((td) => td.textContent || '--').join(' ')
    const band = week.querySelector('.cal__band')
    return band ? `${days} | ${band.textContent}×${band.getAttribute('colspan')}` : days
  })
}

describe('Silver: 初期表示', () => {
  it('繰越 0・ダメージ報酬 20,500・スイッチはどちらもオンで始まる', () => {
    open()
    expect(carryValue()).toBe('0')
    expect(damageInput().value).toBe('20,500')
    expect(goldSwitch().checked).toBe(true)
    expect(bountySwitch().checked).toBe(true)
  })

  it('カードは 条件 → カレンダー → 今月 → 余りの使い道 → 週ごとの流れ → 内訳 の順（来月のカードは無い）', () => {
    const { container } = open()
    expect([...container.querySelectorAll('h2')].map((h) => h.textContent)).toEqual([
      'あなたの条件',
      'イベントカレンダー',
      '11月の必要量',
      '紫晶石の余りの使い道',
      '週ごとの流れ',
      '内訳',
    ])
  })
})

describe('Silver: イベントカレンダー', () => {
  it('今月（2026年11月）と来月（2026年12月）を出す', () => {
    open()
    const tables = within(card('イベントカレンダー')).getAllByRole('table')
    expect(tables.map((t) => t.querySelector('caption')?.textContent)).toEqual([
      '2026年11月',
      '2026年12月',
    ])
  })

  it('月曜始まりで、曜日の見出しが付く', () => {
    open()
    const table = screen.getByRole('table', { name: '2026年11月' })
    expect([...table.querySelectorAll('th')].map((th) => th.textContent)).toEqual([
      '月',
      '火',
      '水',
      '木',
      '金',
      '土',
      '日',
    ])
  })

  it('11月: 火〜日にイベントの帯が引かれる', () => {
    open()
    expect(calendar('2026年11月')).toEqual([
      '-- -- -- -- -- -- 1 | 賞金稼ぎ（前月から）×1', // 10/27 に始まった賞金稼ぎの最終日（読み上げ用の文字を含む）
      '2 3 4 5 6 7 8 | 閃金×6',
      '9 10 11 12 13 14 15 | 百発百中×6',
      '16 17 18 19 20 21 22 | 戦争準備×6',
      '23 24 25 26 27 28 29 | 賞金稼ぎ×6',
      '30 -- -- -- -- -- --', // 月曜日だけの週は帯が無い
    ])
  })

  it('12月: 閃金が2回あり、月をまたぐ2回目は月末までの帯になる', () => {
    open()
    expect(calendar('2026年12月')).toEqual([
      '-- 1 2 3 4 5 6 | 閃金×6',
      '7 8 9 10 11 12 13 | 百発百中×6',
      '14 15 16 17 18 19 20 | 戦争準備×6',
      '21 22 23 24 25 26 27 | 賞金稼ぎ×6',
      '28 29 30 31 -- -- -- | 閃金×3',
    ])
  })

  it('前の月に始まったイベントの続きは、薄い帯で出す', () => {
    open()
    const first = screen.getByRole('table', { name: '2026年11月' }).querySelector('.cal__band')
    expect(first?.className).toContain('cal__band--continued')
    // この月に始まったイベントの帯には付かない
    const own = [...screen.getByRole('table', { name: '2026年12月' }).querySelectorAll('.cal__band')]
    expect(own.some((b) => b.className.includes('continued'))).toBe(false)
  })

  it('1日ぶんの帯は字を小さくし、「前月から」は読み上げにだけ伝える', () => {
    open()
    const first = screen.getByRole('table', { name: '2026年11月' }).querySelector('.cal__band')
    expect(first?.className).toContain('cal__band--narrow')
    expect(first?.querySelector('.visually-hidden')?.textContent).toBe('（前月から）')
    expect(first?.querySelector('small')).toBeNull()
    // 6日ぶんの帯には付かない
    const full = [...screen.getByRole('table', { name: '2026年12月' }).querySelectorAll('.cal__band')]
    expect(full.slice(0, 4).some((b) => b.className.includes('narrow'))).toBe(false)
  })

  it('3日以上続く「続き」の帯には（前月から）と添える', () => {
    open({ year: 2027, month: 1, day: 10 })
    expect(calendar('2027年1月')[0]).toBe('-- -- -- -- 1 2 3 | 閃金（前月から）×3')
  })

  it('今日の日付に印が付く（今月のカレンダーだけ）', () => {
    open()
    const marked = [...card('イベントカレンダー').querySelectorAll('[aria-current="date"]')]
    expect(marked.map((td) => td.textContent)).toEqual(['25'])
    expect(marked[0]?.closest('table')?.querySelector('caption')?.textContent).toBe('2026年11月')
  })

  it('帯にはイベントごとの色の目印が付く', () => {
    open()
    const bands = [...screen.getByRole('table', { name: '2026年12月' }).querySelectorAll('.cal__band')]
    expect(bands.map((b) => b.getAttribute('data-event'))).toEqual([
      'gold',
      'shot',
      'war',
      'bounty',
      'gold',
    ])
  })

  it('開いた日によって、出す2か月が変わる（年もまたぐ）', () => {
    open({ year: 2026, month: 12, day: 1 })
    const tables = within(card('イベントカレンダー')).getAllByRole('table')
    expect(tables.map((t) => t.querySelector('caption')?.textContent)).toEqual([
      '2026年12月',
      '2027年1月',
    ])
    expect(screen.getByRole('heading', { level: 2, name: '12月の必要量' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 3, name: '来月（1月）に向けて' })).toBeTruthy()
    expect(screen.queryByRole('heading', { level: 2, name: '1月の必要量' })).toBeNull()
  })

  it('ダメージ報酬が不正でも、カレンダーは出したままにする', () => {
    open()
    typeDamage('abc')
    expect(within(card('イベントカレンダー')).getAllByRole('table')).toHaveLength(2)
  })
})

describe('Silver: 今月の結果（SPEC §14.6 の例）', () => {
  it('11月: 必要量 295,000、110,000 不足、交換 50 / 50回、余り 77,500', () => {
    open()
    expect(need(NOV)).toBe('295,000')
    expect(alertText(NOV)).toBe('11月は 110,000 銀塊が不足します。どこかで調整して下さい。')
    expect(ledger(card(NOV), '前月繰越分の銀塊量')).toBe('0')
    expect(ledger(card(NOV), '11月の入手量（紫晶石）')).toBe('327,500')
    expect(surplus(NOV)).toBe('77,500')
    expect(exchanges(NOV)).toBe('50 / 50回')
  })

  it('不足の知らせは、必要量のすぐ下（帳面より前）に出る', () => {
    open()
    const order = [...card(NOV).children].map((el) => el.className)
    expect(order.indexOf('total__alert')).toBe(order.indexOf('total') + 1)
  })

  it('不足しなければ、知らせを出さない', () => {
    open()
    fireEvent.click(goldSwitch())
    expect(alertText(NOV)).toBeNull()
  })

  it('来月（12月）のカードは出さない', () => {
    open()
    expect(screen.queryByRole('heading', { level: 2, name: '12月の必要量' })).toBeNull()
    expect(document.querySelectorAll('.total__value')).toHaveLength(1)
  })
})

describe('Silver: 来月に向けて（今月のカードの中）', () => {
  it('見出しと4つの行が、今月の行のあとに出る', () => {
    open()
    const c = card(NOV)
    expect(within(c).getByRole('heading', { level: 3, name: '来月（12月）に向けて' })).toBeTruthy()
    const terms = [...c.querySelectorAll('.ledger:not(.ledger--sub) > div > dt')].map((dt) =>
      dt.textContent?.replace('🔽', ''),
    )
    expect(terms).toEqual([
      '前月繰越分の銀塊量',
      '11月の入手量（紫晶石）',
      '紫晶石の余り',
      '紫晶石との交換回数（月の上限 50回）',
      '12月の必要量',
      '12月の不足分',
      '今月の繰越推奨量',
      'いまの見込みの繰越',
    ])
  })

  it('12月は閃金が2回あるので必要量 475,000。不足しないための繰越推奨量は 225,000', () => {
    open()
    // 必要量, 不足分, 繰越推奨量（475,000 − 上限 250,000）, いまの見込みの繰越
    expect(outlook()).toEqual(['475,000', '160,000', '225,000', '65,000'])
  })

  it('説明に、見込みとの差が出る', () => {
    open()
    expect(
      within(card(NOV)).getByText(
        '繰越推奨量は、12月に不足しないために、11月末に持っておきたい銀塊の量です。いまの見込みでは、あと 160,000 足りません。',
      ),
    ).toBeTruthy()
  })

  it('来月の不足分があるときだけ、その行を赤くする', () => {
    open()
    const row = (): Element | null =>
      within(card(NOV)).getByText('12月の不足分').closest('div')
    expect(row()?.className).toBe('ledger__short')
    fireEvent.click(goldSwitch())
    expect(row()?.className).toBe('')
  })

  it('賞金稼ぎをオフにすると、来月の必要量と繰越推奨量が下がる', () => {
    open()
    fireEvent.click(bountySwitch())
    // 見込みの繰越は、11月に使う量が減るぶん増える
    expect(outlook()).toEqual(['415,000', '40,000', '165,000', '125,000'])
  })

  it('見込みの繰越で足りるときは、その旨を出す', () => {
    open()
    fireEvent.click(goldSwitch())
    expect(outlook()).toEqual(['175,000', '0', '0', '105,000'])
    expect(
      within(card(NOV)).getByText(
        '繰越推奨量は、12月に不足しないために、11月末に持っておきたい銀塊の量です。いまの見込みで足ります。',
      ),
    ).toBeTruthy()
  })

  it('前月繰越分を増やしても、来月の見通しは変わらない（今月の不足が先に埋まる）', () => {
    openWithCarry(110_000)
    expect(alertText(NOV)).toBeNull()
    expect(outlook()).toEqual(['475,000', '160,000', '225,000', '65,000'])
  })

  it('今月ぶんより多く繰り越していれば、そのぶん来月の見込みが増える', () => {
    openWithCarry(270_000) // 11/3 の不足 110,000 を埋めた残り 160,000 が、そのまま12月に回る
    expect(outlook()).toEqual(['475,000', '0', '225,000', '225,000'])
  })

  it('年をまたぐ月でも、来月の名前で出る', () => {
    open({ year: 2026, month: 12, day: 1 })
    const c = card('12月の必要量')
    expect(ledger(c, '1月の必要量')).toBe('295,000')
    expect(ledger(c, '今月の繰越推奨量')).toBe('45,000')
  })
})

describe('Silver: 入手量の内訳（🔽 で開く）', () => {
  it('最初は閉じていて、内訳は出ていない', () => {
    open()
    expect(incomeToggle().getAttribute('aria-expanded')).toBe('false')
    expect(incomeToggle().textContent).toContain('🔽')
    expect(screen.queryByText(/連盟対決報酬/)).toBeNull()
  })

  it('押すと、その月の日数と月曜日の回数で内訳が出る', () => {
    open()
    fireEvent.click(incomeToggle())
    expect(incomeToggle().getAttribute('aria-expanded')).toBe('true')
    expect(incomeToggle().textContent).toContain('🔼')
    const c = card(NOV)
    expect(ledger(c, '連盟対決報酬（6,500 × 25日）')).toBe('162,500')
    expect(ledger(c, '晶石ボス（2,500 × 25日）')).toBe('62,500')
    expect(ledger(c, 'ダメージ報酬（20,500 × 月曜 5回）')).toBe('102,500')
    // 162,500 + 62,500 + 102,500 = 327,500（入手量の行と合う）
    expect(ledger(c, '11月の入手量（紫晶石）')).toBe('327,500')
  })

  it('もう一度押すと閉じる', () => {
    open()
    fireEvent.click(incomeToggle())
    fireEvent.click(incomeToggle())
    expect(incomeToggle().getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText(/連盟対決報酬/)).toBeNull()
  })

  it('ボタンは開く対象の内訳と結びついている', () => {
    open()
    const id = incomeToggle().getAttribute('aria-controls')
    expect(document.getElementById(id as string)).not.toBeNull()
  })

  it('開いたままダメージ報酬を変えると、内訳も変わる', () => {
    open()
    fireEvent.click(incomeToggle())
    typeDamage('30000')
    expect(ledger(card(NOV), 'ダメージ報酬（30,000 × 月曜 5回）')).toBe('150,000')
  })
})

describe('Silver: 紫晶石の余りの使い道', () => {
  it('交換のきまり → 余りの説明 → 優先順位 の順に、1回だけ出る', () => {
    open()
    const c = card('紫晶石の余りの使い道')
    const notes = [...c.querySelectorAll('.cafe__note')].map((p) => p.textContent)
    expect(notes).toEqual([
      '紫晶石 5,000 個を銀塊 5,000 個と交換できます（月に 50回、250,000 まで。上限は毎月1日に戻ります）。',
      '紫晶石の余りは銀塊以外の交換に回せます。翌月には持ち越さない前提で計算しています。',
    ])
    expect(within(c).getByText('交換の優先順位（上ほど優先）')).toBeTruthy()
    expect([...c.querySelectorAll('.priority-list li')].map((li) => li.textContent)).toEqual([
      '金塊',
      '高級パス交換券',
      '特級パス交換券',
      '戦争準備パック交換券',
      '週間配達一括交換券',
    ])
    expect(document.querySelectorAll('.priority-list')).toHaveLength(1)
  })
})

describe('Silver: 週ごとの流れ', () => {
  it('今月のイベントが、日付つきの計算書で並ぶ（SPEC §14.6 の例）。来月ぶんは出さない', () => {
    open()
    expect(flow()).toEqual([
      ['11/3〜11/8', '閃金', '0', '70,000', '180,000', '銀塊の不足分', '110,000'],
      ['11/10〜11/15', '百発百中', '0', '75,000', '25,000', '次週への繰越', '50,000'],
      ['11/17〜11/22', '戦争準備', '50,000', '75,000', '0', '次週への繰越', '125,000'],
      ['11/24〜11/29', '賞金稼ぎ', '125,000', '30,000', '90,000', '翌月への繰越', '65,000'],
    ])
  })

  it('月をまたぐイベントは、始まった月の流れに出る（12月の最後は 12/29〜1/3 の閃金）', () => {
    open({ year: 2026, month: 12, day: 1 })
    expect(flow().map((r) => [r[0], r[1]])).toEqual([
      ['12/1〜12/6', '閃金'],
      ['12/8〜12/13', '百発百中'],
      ['12/15〜12/20', '戦争準備'],
      ['12/22〜12/27', '賞金稼ぎ'],
      ['12/29〜1/3', '閃金'],
    ])
  })

  it('各イベントは 繰越・＋入手・−必要・＝結果 の4行で、入手量には交換回数を添える', () => {
    open()
    const rows = [...card('週ごとの流れ').querySelectorAll('.week')]
    const labels = (li: Element | undefined): string[] =>
      [...(li?.querySelectorAll('dt') ?? [])].map((dt) => dt.textContent ?? '')
    // いちばん最初の繰越は、入力した前月繰越分
    expect(labels(rows[0])).toEqual([
      '前月からの繰越',
      '＋銀塊入手量（14回交換）',
      '−銀塊必要量',
      '＝銀塊の不足分',
    ])
    expect(labels(rows[1])).toEqual([
      '前週からの繰越',
      '＋銀塊入手量（15回交換）',
      '−銀塊必要量',
      '＝次週への繰越',
    ])
    // 月の最後のイベントは「翌月への繰越」
    expect(labels(rows[3])[3]).toBe('＝翌月への繰越')
    // 記号は見た目のためのもの。読み上げでは項目名だけを読ませる
    for (const sign of card('週ごとの流れ').querySelectorAll('.week__sign')) {
      expect(sign.getAttribute('aria-hidden')).toBe('true')
    }
  })

  it('前のイベントの結果（繰越）が、次のイベントの最初の行になる', () => {
    open()
    const rows = flow()
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1] as string[]
      // 不足したあとは何も残らないので、次は 0 から始まる
      expect((rows[i] as string[])[2]).toBe(prev[5] === '銀塊の不足分' ? '0' : prev[6])
    }
  })

  it('不足するイベントだけ、結果の行を赤くする', () => {
    open()
    const rows = [...card('週ごとの流れ').querySelectorAll('.week')]
    expect(rows.map((li) => li.querySelector('.week__short') !== null)).toEqual([
      true,
      false,
      false,
      false,
    ])
  })

  it('カードの説明に、毎週の紫晶石と交換の上限量が出る', () => {
    open()
    const c = card('週ごとの流れ')
    expect(c.querySelector('.cafe__note')?.textContent).toBe(
      '毎週獲得できる紫晶石（74,500）を、2か月ぶんの必要銀塊量か、月ごとの銀塊の交換上限量（250,000）に達するまで、' +
        '5,000 個ずつ銀塊に交換していった場合の流れです。数字はすべて銀塊です。',
    )
    expect(within(c).getByText(/上限に余裕があれば、来月ぶんも先に交換します。/)).toBeTruthy()
  })
})

describe('Silver: スイッチ（お金で買える上限まで買う）', () => {
  it('スイッチが出るのは、任意の交換がある閃金と賞金稼ぎ', () => {
    open()
    expect(screen.getAllByRole('switch')).toHaveLength(2)
  })

  it('賞金稼ぎをオフにすると、賞金稼ぎの任意 60,000 が必要量から外れる', () => {
    open()
    fireEvent.click(bountySwitch())
    expect(need(NOV)).toBe('235,000')
    expect(alertText(NOV)).toBe('11月は 110,000 銀塊が不足します。どこかで調整して下さい。')
    const off = [...card('内訳').querySelectorAll('.exchange--off')]
    expect(off.map((li) => li.querySelector('.exchange__what')?.textContent)).toEqual([
      '銀塊 10,000 → 100 賞金稼ぎ用弾丸 × 6回',
    ])
    expect(off[0]?.querySelector('.exchange__tag')?.textContent).toBe('任意・入れない')
  })

  it('閃金をオフにすると不足が消える（来月ぶんを前倒しで交換するので、上限までは使う）', () => {
    open()
    fireEvent.click(goldSwitch())
    expect(need(NOV)).toBe('145,000')
    expect(alertText(NOV)).toBeNull()
    expect(exchanges(NOV)).toBe('50 / 50回')
  })

  it('両方オフにすると、2か月ぶんを11月のうちに交換し終える', () => {
    open()
    fireEvent.click(goldSwitch())
    fireEvent.click(bountySwitch())
    expect(need(NOV)).toBe('85,000')
    expect(exchanges(NOV)).toBe('40 / 50回') // 85,000 ＋ 来月ぶん 115,000 ＝ 200,000
    expect(surplus(NOV)).toBe('127,500')
    expect(flow().map((r) => r[3])).toEqual(['70,000', '75,000', '55,000', '0'])
    expect(outlook()).toEqual(['115,000', '0', '0', '115,000'])
  })

  it('スイッチの説明に、そのイベントの任意の交換ぶんの銀塊が出る（途中に余計な空白は入らない）', () => {
    open()
    expect(goldSwitch().closest('label')?.querySelector('.switch__desc')?.textContent).toBe(
      'オンにすると、お金と同じレートの交換（銀塊 150,000）も必要量に入れます。' +
        '上限まで買わないなら、必要なときにお金で買えばよいのでオフにします。',
    )
    expect(bountySwitch().closest('label')?.textContent).toContain('銀塊 60,000')
  })
})

describe('Silver: 前月繰越分の銀塊量', () => {
  it('ダメージ報酬の上にあり、直接は入力できない（＋ − だけで変える）', () => {
    open()
    const fields = [...card('あなたの条件').querySelectorAll('.field')]
    expect(fields.map((f) => f.querySelector('label')?.textContent)).toEqual([
      '前月繰越分の銀塊量',
      'ダメージ報酬でもらえる紫晶石（毎週）',
    ])
    expect(screen.getByLabelText('前月繰越分の銀塊量').tagName.toLowerCase()).toBe('output')
    // 入力欄はダメージ報酬の1つだけ
    expect(card('あなたの条件').querySelectorAll('input[type="text"]')).toHaveLength(1)
    expect(
      screen.getByText(
        '今月の1日の時点で持っていた銀塊の数です。＋ − で 5,000 ずつ変えられます（保存はされません）。',
      ),
    ).toBeTruthy()
  })

  it('＋ で 5,000 ずつ増え、− で 5,000 ずつ減り、計算にも反映される', () => {
    open()
    fireEvent.click(carryPlus())
    expect(carryValue()).toBe('5,000')
    fireEvent.click(carryPlus())
    fireEvent.click(carryPlus())
    expect(carryValue()).toBe('15,000')
    fireEvent.click(carryMinus())
    expect(carryValue()).toBe('10,000')
    expect(ledger(card(NOV), '前月繰越分の銀塊量')).toBe('10,000')
    expect(alertText(NOV)).toBe('11月は 100,000 銀塊が不足します。どこかで調整して下さい。')
  })

  it('0 のときは − を押せない', () => {
    open()
    expect(carryMinus().disabled).toBe(true)
    fireEvent.click(carryPlus())
    expect(carryMinus().disabled).toBe(false)
    fireEvent.click(carryMinus())
    expect(carryValue()).toBe('0')
    expect(carryMinus().disabled).toBe(true)
  })

  it('繰越 110,000 なら、11/3 の閃金が足りる', () => {
    openWithCarry(110_000)
    expect(flow()[0]).toEqual(['11/3〜11/8', '閃金', '110,000', '70,000', '180,000', '次週への繰越', '0'])
    expect(alertText(NOV)).toBeNull()
  })

  // 月ごとに変わる値なので、ブラウザには保存しない（SPEC §14.5）
  it('保存されず、開き直すと 0 に戻る', async () => {
    const first = open()
    fireEvent.click(carryPlus())
    fireEvent.click(carryPlus())
    expect(carryValue()).toBe('10,000')
    expect(localStorage.getItem(CARRY_KEY)).toBeNull()
    first.unmount()

    open()
    expect(carryValue()).toBe('0')
  })

  it('以前のバージョンで保存されていた値は使わず、消す', async () => {
    localStorage.setItem(CARRY_KEY, '110000')
    open()
    expect(carryValue()).toBe('0')
    await waitFor(() => expect(localStorage.getItem(CARRY_KEY)).toBeNull())
  })
})

describe('Silver: ダメージ報酬', () => {
  it('変えると、月曜日の回数ぶんだけ入手量が変わる', () => {
    open()
    typeDamage('30000')
    expect(ledger(card(NOV), '11月の入手量（紫晶石）')).toBe('375,000') // 225,000 + 30,000 × 5
  })

  it('入力を終えると桁区切りつきに整う', () => {
    open()
    typeDamage('30000')
    fireEvent.blur(damageInput())
    expect(damageInput().value).toBe('30,000')
  })

  // 紫晶石が足りないときは、実際に交換できる量で計算する
  it('紫晶石が足りないときは、交換できる回数と、足りない銀塊を出す', () => {
    open()
    typeDamage('0')
    expect(exchanges(NOV)).toBe('45 / 50回')
    expect(surplus(NOV)).toBe('0')
    expect(alertText(NOV)).toBe('11月は 130,000 銀塊が不足します。どこかで調整して下さい。')
    // 来月も、紫晶石が足りないぶんだけ繰越推奨量が増える（48回 ＝ 240,000 までしか交換できない）
    expect(outlook()).toEqual(['475,000', '175,000', '235,000', '60,000'])
    expect(card(NOV).querySelector('.cafe__note--warn')?.textContent).toBe(
      '紫晶石が足りないので、交換できるのは 45回（225,000）までです。',
    )
  })

  it('紫晶石が足りていれば、紫晶石の注意は出ない', () => {
    open()
    expect(document.querySelector('.cafe__note--warn')).toBeNull()
  })

  // 来月ぶんの前倒しができないだけで、今月は足りているときには出さない
  it('今月が足りていれば、紫晶石が少なくても注意は出ない', () => {
    openWithCarry(130_000) // ダメージ報酬 0 のときの 11/3 の不足ぶんを、繰越で埋める
    typeDamage('0')
    expect(alertText(NOV)).toBeNull()
    expect(exchanges(NOV)).toBe('45 / 50回') // 紫晶石は使い切っているが、今月は足りている
    expect(document.querySelector('.cafe__note--warn')).toBeNull()
  })

  // 打ち直すために値を消した瞬間に結果が消えないよう、空欄は 0 として計算する
  it('欄を空にすると 0 として計算し、エラーにはしない', () => {
    open()
    typeDamage('')
    expect(damageInput().value).toBe('') // 入力の途中なので、欄は空のまま
    expect(damageInput().getAttribute('aria-invalid')).toBe('false')
    expect(document.getElementById('silver-damage-hint')?.textContent).toBe(
      '晶石ボスのダメージ報酬は人によって違います。',
    )
    expect(ledger(card(NOV), '11月の入手量（紫晶石）')).toBe('225,000')
    expect(screen.queryByText('ダメージ報酬に 0 以上の整数を入れると計算できます。')).toBeNull()
  })

  it('空のまま入力を終えると、欄に 0 が入る', async () => {
    open()
    typeDamage('')
    fireEvent.blur(damageInput())
    expect(damageInput().value).toBe('0')
    await waitFor(() => expect(localStorage.getItem(DAMAGE_KEY)).toBe('0'))
  })

  it('空にしてから打ち直しても、結果のカードは出たまま', () => {
    open()
    fireEvent.click(incomeToggle()) // 内訳を開いておく
    typeDamage('')
    typeDamage('3')
    typeDamage('30000')
    expect(incomeToggle().getAttribute('aria-expanded')).toBe('true') // 開いた状態が保たれる
    expect(ledger(card(NOV), 'ダメージ報酬（30,000 × 月曜 5回）')).toBe('150,000')
  })

  it.each(['abc', '-1', '100.5', '10000000'])('不正な値 %o では計算せず、入力を促す', (bad) => {
    open()
    typeDamage(bad)
    expect(damageInput().getAttribute('aria-invalid')).toBe('true')
    expect(document.getElementById('silver-damage-hint')?.textContent).toBe(
      '0〜9,999,999 の整数で入力してください',
    )
    expect(screen.getByText('ダメージ報酬に 0 以上の整数を入れると計算できます。')).toBeTruthy()
    expect(screen.queryByRole('heading', { level: 2, name: NOV })).toBeNull()
    expect(screen.queryByRole('heading', { level: 2, name: '週ごとの流れ' })).toBeNull()
    // 内訳（固定の値）は出したままにする
    expect(card('内訳').querySelectorAll('.exchange')).toHaveLength(5)
  })

  it('説明文は入力欄に紐づいていて、変化が読み上げられる', () => {
    open()
    const hint = document.getElementById('silver-damage-hint')
    expect(damageInput().getAttribute('aria-describedby')).toBe('silver-damage-hint')
    expect(hint?.getAttribute('aria-live')).toBe('polite')
  })
})

describe('Silver: 内訳', () => {
  it('交換の区分・月の銀塊・お金に直した額が出る', () => {
    open()
    const rows = [...card('内訳').querySelectorAll('.exchange')].map((li) => [
      li.querySelector('.exchange__tag')?.textContent,
      li.querySelector('.exchange__what')?.textContent,
      li.querySelector('.exchange__total')?.textContent,
      li.querySelector('.exchange__yen')?.textContent,
    ])
    expect(rows).toEqual([
      ['必ず', '銀塊 5,000 → 80 閃金 × 6回', '30,000', '80閃金はお金なら 1,200 円（銀塊のほうがお得）'],
      ['任意・入れる', '銀塊 10,000 → 100 閃金 × 15回', '150,000', '100閃金はお金なら 1,500 円（銀塊と同じレート）'],
      ['必ず', '銀塊 5,000 → 10 弾丸 × 5回', '25,000', '10弾丸はお金なら 1,250 円（銀塊のほうがお得）'],
      ['必ず', '銀塊 5,000 → 80 賞金稼ぎ用弾丸 × 6回', '30,000', '80賞金稼ぎ用弾丸はお金なら 1,200 円（銀塊のほうがお得）'],
      ['任意・入れる', '銀塊 10,000 → 100 賞金稼ぎ用弾丸 × 6回', '60,000', '100賞金稼ぎ用弾丸はお金なら 1,500 円（銀塊と同じレート）'],
    ])
    expect(within(card('内訳')).getByText('銀塊での交換はありません')).toBeTruthy() // 戦争準備
  })
})

describe('Silver: 保存と復元', () => {
  it('初期値のままなら何も保存しない', async () => {
    open()
    typeDamage('20,500')
    await waitFor(() => expect(localStorage.length).toBe(0))
  })

  it('変えたダメージ報酬とスイッチは保存され、再マウントで復元される', async () => {
    const first = open()
    typeDamage('30000')
    fireEvent.click(goldSwitch())
    await waitFor(() => expect(localStorage.getItem(DAMAGE_KEY)).toBe('30000'))
    expect(localStorage.getItem(BUYALL_KEY)).toBe('0')
    expect(localStorage.getItem(BUYALL_BOUNTY_KEY)).toBeNull() // オンのままのほうは保存しない
    first.unmount()

    open()
    expect(damageInput().value).toBe('30,000')
    expect(goldSwitch().checked).toBe(false)
    expect(bountySwitch().checked).toBe(true)
    expect(need(NOV)).toBe('145,000')
  })

  it('スイッチはイベントごとに別々に保存される', async () => {
    const first = open()
    fireEvent.click(bountySwitch())
    await waitFor(() => expect(localStorage.getItem(BUYALL_BOUNTY_KEY)).toBe('0'))
    expect(localStorage.getItem(BUYALL_KEY)).toBeNull()
    first.unmount()

    open()
    expect(goldSwitch().checked).toBe(true)
    expect(bountySwitch().checked).toBe(false)
  })

  it('初期値に戻すと保存も消える', async () => {
    open()
    typeDamage('30000')
    fireEvent.click(goldSwitch())
    await waitFor(() => expect(localStorage.getItem(DAMAGE_KEY)).toBe('30000'))

    typeDamage('20500')
    fireEvent.click(goldSwitch())
    await waitFor(() => expect(localStorage.length).toBe(0))
  })

  it('入力途中の不正な値は保存せず、最後に有効だった値を残す', async () => {
    open()
    typeDamage('30000')
    await waitFor(() => expect(localStorage.getItem(DAMAGE_KEY)).toBe('30000'))
    typeDamage('abc')
    expect(localStorage.getItem(DAMAGE_KEY)).toBe('30000')
  })

  it.each(['', 'abc', '-5', '1.5'])('不正な値 %o が保存されていたら初期値で始める', (stored) => {
    localStorage.setItem(DAMAGE_KEY, stored)
    open()
    expect(damageInput().value).toBe('20,500')
  })
})

describe('Silver: 今日の日付', () => {
  /** 端末の時計を固定する（日付を渡さずに開いたときの動きを見るため） */
  const setClock = (year: number, month: number, day: number): void => {
    vi.setSystemTime(new Date(year, month - 1, day, 12, 0, 0))
  }
  const captions = (): (string | null | undefined)[] =>
    screen.getAllByRole('table').map((t) => t.querySelector('caption')?.textContent)
  const comeBack = (): void => {
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
  })

  it('日付を渡さなければ、端末の今日の月から始まる', () => {
    setClock(2026, 11, 30)
    render(<Silver />)
    expect(captions()).toEqual(['2026年11月', '2026年12月'])
    expect(document.querySelector('[aria-current="date"]')?.textContent).toBe('30')
  })

  // ページは一度開くと隠されるだけで残るので、開いたまま月が替わることがある
  it('開いたまま月が替わってから戻ってくると、新しい月で計算し直す', () => {
    setClock(2026, 11, 30)
    render(<Silver />)
    expect(screen.getByRole('heading', { level: 2, name: '11月の必要量' })).toBeTruthy()

    setClock(2026, 12, 1)
    comeBack()
    expect(captions()).toEqual(['2026年12月', '2027年1月'])
    expect(screen.getByRole('heading', { level: 2, name: '12月の必要量' })).toBeTruthy()
    expect(screen.queryByRole('heading', { level: 2, name: '11月の必要量' })).toBeNull()
    expect(document.querySelector('[aria-current="date"]')?.textContent).toBe('1')
  })

  it('月が替わったら、前月繰越分は前の月のものなので 0 に戻す', () => {
    setClock(2026, 11, 30)
    render(<Silver />)
    fireEvent.click(carryPlus())
    fireEvent.click(carryPlus())
    expect(carryValue()).toBe('10,000')

    setClock(2026, 12, 1)
    comeBack()
    expect(carryValue()).toBe('0')
  })

  it('同じ月のうちに日付だけ進んだときは、今日の印だけ動き、前月繰越分は残る', () => {
    setClock(2026, 11, 25)
    render(<Silver />)
    fireEvent.click(carryPlus())

    setClock(2026, 11, 26)
    comeBack()
    expect(document.querySelector('[aria-current="date"]')?.textContent).toBe('26')
    expect(carryValue()).toBe('5,000')
    expect(captions()).toEqual(['2026年11月', '2026年12月'])
  })

  it('ほかのページから戻ってきたとき（URL が変わったとき）にも確かめ直す', () => {
    setClock(2026, 11, 30)
    render(<Silver />)
    setClock(2026, 12, 1)
    act(() => {
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(captions()).toEqual(['2026年12月', '2027年1月'])
  })

  it('日付を渡したときは、時計が進んでもその日付のまま', () => {
    setClock(2027, 5, 5)
    open()
    comeBack()
    expect(captions()).toEqual(['2026年11月', '2026年12月'])
  })
})
