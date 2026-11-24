// @vitest-environment jsdom
/**
 * 銀塊必要量チェッカーの画面のテスト（SPEC §14）。
 * 計算そのものは silver.test.ts で確認しているので、ここでは
 * 「入力がどう結果に反映されるか」「保存と復元」を見る。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import Silver from './Silver'

afterEach(cleanup)
beforeEach(() => localStorage.clear())

const DAMAGE_KEY = 'lastwar-silver:damage'
const BUYALL_KEY = 'lastwar-silver:buyall:gold'
const BUYALL_BOUNTY_KEY = 'lastwar-silver:buyall:bounty'

const damageInput = (): HTMLInputElement =>
  screen.getByLabelText(/ダメージ報酬でもらえる紫晶石/) as HTMLInputElement
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
const typeDamage = (value: string): void => {
  fireEvent.change(damageInput(), { target: { value } })
}
const CARRY_KEY = 'lastwar-silver:carry'
/** 前月繰越分を入れた状態で開く（大きな値は ＋ を何十回も押す代わりに、保存値から始める） */
const renderWithCarry = (carry: number): ReturnType<typeof render> => {
  localStorage.setItem(CARRY_KEY, String(carry))
  return render(<Silver />)
}

/** 必要量の下に出る「今月は ◯ 銀塊が不足します」（出ていなければ null） */
const alertText = (): string | null =>
  card('毎月の必要量').querySelector('.total__alert')?.textContent ?? null

/** 入手量の内訳を開閉するボタン */
const incomeToggle = (): HTMLElement =>
  screen.getByRole('button', { name: /毎月の入手量（紫晶石）/ })

/** 見出しからそのカードを引く */
const card = (name: string): HTMLElement =>
  screen.getByRole('heading', { level: 2, name }).closest('section') as HTMLElement

/** 帳面（項目名 → 数字）の1行の数字 */
const ledger = (within_: HTMLElement, term: string): string =>
  within(within_).getByText(term).closest('div')?.querySelector('dd')?.textContent ?? ''

/**
 * 4週間の流れを [イベント, 繰越（入）, 入手量, 必要量, 結果の見出し, 結果の値] の配列にする。
 * 結果は、足りれば「次週への繰越」（4週目は「翌月への繰越」）、足りなければ「銀塊の不足分」。
 */
const weeks = (): string[][] =>
  [...card('4週間の流れ').querySelectorAll('.week')].map((li) => {
    const dd = [...li.querySelectorAll('dd')].map((el) => el.textContent ?? '')
    const result = li.querySelector('.week__result dt')?.textContent?.replace('＝', '').trim() ?? ''
    return [li.querySelector('.week__name')?.textContent ?? '', dd[0], dd[1], dd[2], result, dd[3]].map(
      (v) => v ?? '',
    )
  })

describe('Silver: 初期表示（SPEC §14.6 の例）', () => {
  it('ダメージ報酬 20,500・スイッチはどちらもオンで始まる', () => {
    render(<Silver />)
    expect(damageInput().value).toBe('20,500')
    expect(goldSwitch().checked).toBe(true)
    expect(bountySwitch().checked).toBe(true)
  })

  it('毎月の必要量 295,000、繰越 0、入手量 298,000', () => {
    render(<Silver />)
    const result = card('毎月の必要量')
    expect(result.querySelector('.total__value')?.textContent).toBe('295,000')
    expect(ledger(result, '前月繰越分の銀塊量')).toBe('0')
    expect(ledger(result, '毎月の入手量（紫晶石）')).toBe('298,000')
  })

  // 任意の交換を両方入れると 295,000 で、月に交換できる 250,000 を超える
  it('初期状態では 45,000 不足するので、必要量の下に赤字で出す', () => {
    render(<Silver />)
    expect(alertText()).toBe('今月は 45,000 銀塊が不足します。どこかで調整して下さい。')
    // 必要量のすぐ下（帳面より前）に出る
    const result = card('毎月の必要量')
    const order = [...result.children].map((el) => el.className)
    expect(order.indexOf('total__alert')).toBe(order.indexOf('total') + 1)
  })

  it('交換回数は上限の 50 で止まり、紫晶石の余りは交換に使わないぶん', () => {
    render(<Silver />)
    const result = card('毎月の必要量')
    expect(ledger(result, '紫晶石との交換回数（月の上限 50回）')).toBe('50 / 50回')
    expect(ledger(result, '紫晶石の余り')).toBe('48,000') // 298,000 − 250,000
    expect(within(result).getByText(/月に 50回、250,000 まで/)).toBeTruthy()
  })

  it('以前の注意「交換できるのは月に〜」は出さない', () => {
    render(<Silver />)
    expect(document.body.textContent).not.toContain('交換できるのは月に')
    expect(document.body.textContent).not.toContain('この流れどおりには交換できません')
  })

  it('どちらかのスイッチをオフにすれば足りて、不足の知らせは消える', () => {
    render(<Silver />)
    fireEvent.click(bountySwitch())
    const result = card('毎月の必要量')
    expect(ledger(result, '紫晶石との交換回数（月の上限 50回）')).toBe('47 / 50回')
    expect(alertText()).toBeNull()

    fireEvent.click(bountySwitch())
    fireEvent.click(goldSwitch())
    expect(ledger(result, '紫晶石との交換回数（月の上限 50回）')).toBe('29 / 50回')
    expect(alertText()).toBeNull()
  })

  it('4週間の流れが、週ごとの計算書で出る（繰越 ＋ 入手 − 必要 ＝ 結果）', () => {
    render(<Silver />)
    expect(weeks()).toEqual([
      ['閃金', '0', '70,000', '180,000', '銀塊の不足分', '110,000'],
      ['百発百中', '0', '75,000', '25,000', '次週への繰越', '50,000'],
      ['戦争準備', '50,000', '75,000', '0', '次週への繰越', '125,000'],
      ['賞金稼ぎ', '125,000', '30,000', '90,000', '翌月への繰越', '65,000'],
    ])
  })

  it('各週は 繰越・＋入手・−必要・＝結果 の4行で、入手量には交換回数を添える', () => {
    render(<Silver />)
    const rows = [...card('4週間の流れ').querySelectorAll('.week')]
    const labels = (li: Element): string[] =>
      [...li.querySelectorAll('dt')].map((dt) => dt.textContent ?? '')
    expect(rows.map(labels)).toEqual([
      ['前月からの繰越', '＋銀塊入手量（14回交換）', '−銀塊必要量', '＝銀塊の不足分'],
      ['前週からの繰越', '＋銀塊入手量（15回交換）', '−銀塊必要量', '＝次週への繰越'],
      ['前週からの繰越', '＋銀塊入手量（15回交換）', '−銀塊必要量', '＝次週への繰越'],
      ['前週からの繰越', '＋銀塊入手量（6回交換）', '−銀塊必要量', '＝翌月への繰越'], // 月の上限に達する
    ])
    // 記号は見た目のためのもの。読み上げでは項目名だけを読ませる
    for (const sign of card('4週間の流れ').querySelectorAll('.week__sign')) {
      expect(sign.getAttribute('aria-hidden')).toBe('true')
    }
  })

  it('前の週の結果（繰越）が、次の週の最初の行になる', () => {
    render(<Silver />)
    const w = weeks()
    for (let i = 1; i < w.length; i++) {
      const prev = w[i - 1] as string[]
      // 不足した週は何も残らないので、次の週は 0 から始まる
      expect((w[i] as string[])[1]).toBe(prev[4] === '銀塊の不足分' ? '0' : prev[5])
    }
  })

  it('カードの説明に、毎週の紫晶石と交換の上限量が出る', () => {
    render(<Silver />)
    const c = card('4週間の流れ')
    expect(c.querySelector('.cafe__note')?.textContent).toBe(
      '毎週獲得できる紫晶石（74,500）を、今月の必要銀塊量か銀塊の交換上限量（250,000）に達するまで、' +
        '5,000 個ずつ銀塊に交換していった場合の流れです。数字はすべて銀塊です。',
    )
    expect(
      within(c).getByText('4週目の「翌月への繰越」が、翌月の「前月繰越分の銀塊量」になります。'),
    ).toBeTruthy()
  })

  it('不足する週だけ、結果の行を赤くする', () => {
    render(<Silver />)
    const rows = [...card('4週間の流れ').querySelectorAll('.week')]
    expect(rows.map((li) => li.querySelector('.week__short') !== null)).toEqual([
      true,
      false,
      false,
      false,
    ])
  })

  it('内訳に、交換の区分・月の銀塊・お金に直した額が出る', () => {
    render(<Silver />)
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

  it('内訳のカードには、銀塊で交換するものだけが出る（入手量の内訳は結果のカードに移した）', () => {
    render(<Silver />)
    expect(card('内訳').textContent).not.toContain('連盟対決報酬')
    expect(card('内訳').querySelectorAll('.ledger')).toHaveLength(0)
  })
})

describe('Silver: 紫晶石の余りの使い道', () => {
  const priority = (): string[] =>
    [...card('毎月の必要量').querySelectorAll('.priority-list li')].map((li) => li.textContent ?? '')

  it('「紫晶石の余りは銀塊以外の交換に回せます。」の下に、優先順位が上から順に出る', () => {
    render(<Silver />)
    const result = card('毎月の必要量')
    const note = within(result).getByText('紫晶石の余りは銀塊以外の交換に回せます。')
    expect(priority()).toEqual([
      '金塊',
      '高級パス交換券',
      '特級パス交換券',
      '戦争準備パック交換券',
      '週間配達一括交換券',
    ])
    // 説明文のすぐ下にある
    expect(note.nextElementSibling?.className).toBe('priority-list')
    // 交換の上限の説明は、余りの説明の上にある
    expect(note.previousElementSibling?.textContent).toBe(
      '紫晶石 5,000 個を銀塊 5,000 個と交換できます（月に 50回、250,000 まで）。',
    )
    // 順位があることが伝わるよう、番号つきの一覧にしている
    expect(result.querySelector('.priority-list ol')).not.toBeNull()
    expect(within(result).getByText('交換の優先順位（上ほど優先）')).toBeTruthy()
  })

  it('紫晶石が足りないときも、余り（端数）の使い道として出したままにする', () => {
    render(<Silver />)
    typeDamage('0')
    expect(ledger(card('毎月の必要量'), '紫晶石の余り')).toBe('1,000')
    expect(priority()).toHaveLength(5)
  })
})

describe('Silver: 入手量の内訳（🔽 で開く）', () => {
  it('最初は閉じていて、内訳は出ていない', () => {
    render(<Silver />)
    expect(incomeToggle().getAttribute('aria-expanded')).toBe('false')
    expect(incomeToggle().textContent).toContain('🔽')
    expect(screen.queryByText('連盟対決報酬')).toBeNull()
  })

  it('押すと開いて内訳が出て、もう一度押すと閉じる', () => {
    render(<Silver />)
    fireEvent.click(incomeToggle())
    expect(incomeToggle().getAttribute('aria-expanded')).toBe('true')
    expect(incomeToggle().textContent).toContain('🔼')
    const result = card('毎月の必要量')
    expect(ledger(result, '連盟対決報酬')).toBe('6,500 / 日')
    expect(ledger(result, '晶石ボス')).toBe('2,500 / 日')
    expect(ledger(result, 'ダメージ報酬')).toBe('20,500 / 週')
    expect(ledger(result, '1週間の合計（月〜土の6日）')).toBe('74,500')
    // 開いても、入手量の行そのものの数字は変わらない
    expect(ledger(result, '毎月の入手量（紫晶石）')).toBe('298,000')

    fireEvent.click(incomeToggle())
    expect(incomeToggle().getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('連盟対決報酬')).toBeNull()
  })

  it('ボタンは開く対象の内訳と結びついている', () => {
    render(<Silver />)
    const id = incomeToggle().getAttribute('aria-controls')
    expect(id).toBe('silver-income-detail')
    expect(document.getElementById(id as string)).not.toBeNull()
  })

  it('開いたままダメージ報酬を変えると、内訳も変わる', () => {
    render(<Silver />)
    fireEvent.click(incomeToggle())
    typeDamage('30000')
    const result = card('毎月の必要量')
    expect(ledger(result, 'ダメージ報酬')).toBe('30,000 / 週')
    expect(ledger(result, '1週間の合計（月〜土の6日）')).toBe('84,000')
  })
})

describe('Silver: 前月繰越分の銀塊量', () => {
  it('ダメージ報酬の上にあり、初期値は 0', () => {
    render(<Silver />)
    expect(carryValue()).toBe('0')
    const fields = [...card('あなたの条件').querySelectorAll('.field')]
    expect(fields.map((f) => f.querySelector('label')?.textContent)).toEqual([
      '前月繰越分の銀塊量',
      'ダメージ報酬でもらえる紫晶石（毎週）',
    ])
  })

  it('直接は入力できない（入力欄ではなく、＋ − だけで変える）', () => {
    render(<Silver />)
    const value = screen.getByLabelText('前月繰越分の銀塊量')
    expect(value.tagName.toLowerCase()).toBe('output')
    // 入力欄はダメージ報酬の1つだけ
    expect(card('あなたの条件').querySelectorAll('input[type="text"]')).toHaveLength(1)
    expect(screen.getByText('先月から持ち越した銀塊の数です。＋ − で 5,000 ずつ変えられます。')).toBeTruthy()
  })

  it('＋ で 5,000 ずつ増え、− で 5,000 ずつ減る', () => {
    render(<Silver />)
    fireEvent.click(carryPlus())
    expect(carryValue()).toBe('5,000')
    fireEvent.click(carryPlus())
    fireEvent.click(carryPlus())
    expect(carryValue()).toBe('15,000')
    fireEvent.click(carryMinus())
    expect(carryValue()).toBe('10,000')
    // 計算にも反映される（必要 295,000 − 繰越 10,000 − 上限 250,000 = 35,000）
    expect(alertText()).toBe('今月は 35,000 銀塊が不足します。どこかで調整して下さい。')
  })

  it('0 のときは − を押せない', () => {
    render(<Silver />)
    expect(carryMinus().disabled).toBe(true)
    fireEvent.click(carryPlus())
    expect(carryMinus().disabled).toBe(false)
    fireEvent.click(carryMinus())
    expect(carryValue()).toBe('0')
    expect(carryMinus().disabled).toBe(true)
  })

  it('上限（9,995,000）で ＋ を押せなくなる', () => {
    renderWithCarry(9_990_000)
    fireEvent.click(carryPlus())
    expect(carryValue()).toBe('9,995,000')
    expect(carryPlus().disabled).toBe(true)
  })

  it.each<[number, string, string | null]>([
    [10_000, '50 / 50回', '今月は 35,000 銀塊が不足します。どこかで調整して下さい。'],
    [40_000, '50 / 50回', '今月は 5,000 銀塊が不足します。どこかで調整して下さい。'],
    [45_000, '50 / 50回', null], // 必要量 − 繰越 = 250,000 ちょうどなら足りる
    [100_000, '39 / 50回', null],
    [295_000, '0 / 50回', null],
  ])('繰越 %i → 交換回数 %s、不足の知らせ %o', (carry, times, alert) => {
    renderWithCarry(carry)
    const result = card('毎月の必要量')
    expect(ledger(result, '紫晶石との交換回数（月の上限 50回）')).toBe(times)
    expect(alertText()).toBe(alert)
    // 必要量そのものは変わらない
    expect(result.querySelector('.total__value')?.textContent).toBe('295,000')
  })

  it('繰越分は4週間の流れの1週目から使える', () => {
    renderWithCarry(110_000)
    expect(weeks()).toEqual([
      ['閃金', '110,000', '70,000', '180,000', '次週への繰越', '0'], // 110,000 + 70,000 でちょうど足りる
      ['百発百中', '0', '75,000', '25,000', '次週への繰越', '50,000'],
      ['戦争準備', '50,000', '40,000', '0', '次週への繰越', '90,000'],
      ['賞金稼ぎ', '90,000', '0', '90,000', '翌月への繰越', '0'],
    ])
  })

  it('結果のカードに、繰越分の行が出る', () => {
    renderWithCarry(100_000)
    const result = card('毎月の必要量')
    expect(ledger(result, '前月繰越分の銀塊量')).toBe('100,000')
    expect(ledger(result, '紫晶石の余り')).toBe('103,000') // 298,000 − 195,000
  })

  it('保存され、再マウントで復元される。0 に戻すと保存も消える', async () => {
    const first = render(<Silver />)
    fireEvent.click(carryPlus())
    await waitFor(() => expect(localStorage.getItem(CARRY_KEY)).toBe('5000'))
    first.unmount()

    render(<Silver />)
    expect(carryValue()).toBe('5,000')
    fireEvent.click(carryMinus())
    await waitFor(() => expect(localStorage.getItem(CARRY_KEY)).toBeNull())
  })

  it.each<[string, string]>([
    ['12345', '10,000'], // 以前は手入力できたので、5,000 の倍数でない値が残っていることがある
    ['abc', '0'],
    ['-5000', '0'],
    ['99999999', '0'], // 上限を超えた値は不正として初期値にする
  ])('保存されていた値 %o は %s として始める', (stored, shown) => {
    localStorage.setItem(CARRY_KEY, stored)
    render(<Silver />)
    expect(carryValue()).toBe(shown)
  })

  it('前月繰越分が原因で計算が止まることはない（不正な値にならない）', () => {
    render(<Silver />)
    fireEvent.click(carryPlus())
    fireEvent.click(carryMinus())
    fireEvent.click(carryMinus())
    expect(screen.getByRole('heading', { level: 2, name: '毎月の必要量' })).toBeTruthy()
  })
})

describe('Silver: スイッチ（お金で買える上限まで買う）', () => {
  it('スイッチが出るのは、任意の交換がある閃金と賞金稼ぎ', () => {
    render(<Silver />)
    expect(screen.getAllByRole('switch')).toHaveLength(2)
    expect(goldSwitch()).toBeTruthy()
    expect(bountySwitch()).toBeTruthy()
  })

  it('閃金をオフにすると、閃金の任意 150,000 だけが必要量から外れる', () => {
    render(<Silver />)
    fireEvent.click(goldSwitch())

    const result = card('毎月の必要量')
    expect(result.querySelector('.total__value')?.textContent).toBe('145,000')
    expect(ledger(result, '紫晶石の余り')).toBe('153,000')
    expect(weeks()).toEqual([
      ['閃金', '0', '70,000', '30,000', '次週への繰越', '40,000'],
      ['百発百中', '40,000', '75,000', '25,000', '次週への繰越', '90,000'],
      ['戦争準備', '90,000', '0', '0', '次週への繰越', '90,000'],
      ['賞金稼ぎ', '90,000', '0', '90,000', '翌月への繰越', '0'],
    ])
    const off = [...card('内訳').querySelectorAll('.exchange--off')]
    expect(off.map((li) => li.querySelector('.exchange__what')?.textContent)).toEqual([
      '銀塊 10,000 → 100 閃金 × 15回',
    ])
    expect(off[0]?.querySelector('.exchange__tag')?.textContent).toBe('任意・入れない')
  })

  it('賞金稼ぎをオフにすると、賞金稼ぎの任意 60,000 だけが必要量から外れる', () => {
    render(<Silver />)
    fireEvent.click(bountySwitch())

    const result = card('毎月の必要量')
    expect(result.querySelector('.total__value')?.textContent).toBe('235,000')
    expect(ledger(result, '紫晶石の余り')).toBe('63,000')
    expect(weeks()).toEqual([
      ['閃金', '0', '70,000', '180,000', '銀塊の不足分', '110,000'],
      ['百発百中', '0', '75,000', '25,000', '次週への繰越', '50,000'],
      ['戦争準備', '50,000', '75,000', '0', '次週への繰越', '125,000'],
      ['賞金稼ぎ', '125,000', '15,000', '30,000', '翌月への繰越', '110,000'],
    ])
    const off = [...card('内訳').querySelectorAll('.exchange--off')]
    expect(off.map((li) => li.querySelector('.exchange__what')?.textContent)).toEqual([
      '銀塊 10,000 → 100 賞金稼ぎ用弾丸 × 6回',
    ])
  })

  it('両方オフにすると必ずの 85,000 だけになり、貯えも要らなくなる', () => {
    render(<Silver />)
    fireEvent.click(goldSwitch())
    fireEvent.click(bountySwitch())

    const result = card('毎月の必要量')
    expect(result.querySelector('.total__value')?.textContent).toBe('85,000')
    expect(ledger(result, '紫晶石の余り')).toBe('213,000')
    expect(ledger(result, '紫晶石との交換回数（月の上限 50回）')).toBe('17 / 50回')
    // どの週も足りる（不足の行にならない）
    expect(weeks().map((w) => [w[4], w[5]])).toEqual([
      ['次週への繰越', '40,000'],
      ['次週への繰越', '30,000'],
      ['次週への繰越', '30,000'],
      ['翌月への繰越', '0'],
    ])
  })

  it('説明文の途中に余計な空白が入らない', () => {
    render(<Silver />)
    expect(goldSwitch().closest('label')?.querySelector('.switch__desc')?.textContent).toBe(
      'オンにすると、お金と同じレートの交換（銀塊 150,000）も必要量に入れます。' +
        '上限まで買わないなら、必要なときにお金で買えばよいのでオフにします。',
    )
  })

  it('スイッチの説明に、そのイベントの任意の交換ぶんの銀塊が出る', () => {
    render(<Silver />)
    expect(goldSwitch().closest('label')?.textContent).toContain('銀塊 150,000')
    expect(bountySwitch().closest('label')?.textContent).toContain('銀塊 60,000')
  })
})

describe('Silver: ダメージ報酬', () => {
  it('変えると入手量と余りが変わる', () => {
    render(<Silver />)
    typeDamage('30000')
    const result = card('毎月の必要量')
    expect(ledger(result, '毎月の入手量（紫晶石）')).toBe('336,000') // (54,000 + 30,000) × 4
    expect(ledger(result, '紫晶石の余り')).toBe('86,000') // 336,000 − 250,000（交換は上限まで）
  })

  it('入力を終えると桁区切りつきに整う', () => {
    render(<Silver />)
    typeDamage('30000')
    fireEvent.blur(damageInput())
    expect(damageInput().value).toBe('30,000')
  })

  // 紫晶石が足りないときは、実際に交換できる量で計算する（結果のカードと4週間の流れが食い違わない）
  it('紫晶石が足りないときは、交換できる回数と、足りない銀塊を出す', () => {
    render(<Silver />)
    typeDamage('0')
    const result = card('毎月の必要量')
    expect(ledger(result, '毎月の入手量（紫晶石）')).toBe('216,000')
    expect(ledger(result, '紫晶石との交換回数（月の上限 50回）')).toBe('43 / 50回')
    expect(ledger(result, '紫晶石の余り')).toBe('1,000')
    // 上限で足りない 45,000 と、紫晶石で足りない 35,000 を合わせた量
    expect(alertText()).toBe('今月は 80,000 銀塊が不足します。どこかで調整して下さい。')
    expect(result.querySelector('.cafe__note--warn')?.textContent).toBe(
      '紫晶石が足りないので、交換できるのは 43回（215,000）までです。',
    )
    expect(weeks()).toEqual([
      ['閃金', '0', '50,000', '180,000', '銀塊の不足分', '130,000'],
      ['百発百中', '0', '55,000', '25,000', '次週への繰越', '30,000'],
      ['戦争準備', '30,000', '55,000', '0', '次週への繰越', '85,000'],
      ['賞金稼ぎ', '85,000', '55,000', '90,000', '翌月への繰越', '50,000'],
    ])
    // 「紫晶石の不足」という行は出さない（交換できたぶんしか使わないので、負にならない）
    expect(result.textContent).not.toContain('紫晶石の不足')
  })

  it('上限には収まっていても、紫晶石が足りなければ不足の知らせを出す', () => {
    render(<Silver />)
    typeDamage('0')
    fireEvent.click(bountySwitch()) // 必要 235,000（47回）。上限以内だが紫晶石は 43回ぶん
    expect(ledger(card('毎月の必要量'), '紫晶石との交換回数（月の上限 50回）')).toBe('43 / 50回')
    expect(alertText()).toBe('今月は 20,000 銀塊が不足します。どこかで調整して下さい。')
  })

  it('紫晶石が足りていれば、紫晶石の注意は出ない', () => {
    render(<Silver />)
    expect(card('毎月の必要量').querySelector('.cafe__note--warn')).toBeNull()
  })

  it('足りなくても、スイッチをオフにすれば足りる', () => {
    render(<Silver />)
    typeDamage('0')
    fireEvent.click(bountySwitch())
    fireEvent.click(goldSwitch())
    const result = card('毎月の必要量')
    expect(alertText()).toBeNull()
    expect(ledger(result, '紫晶石の余り')).toBe('131,000') // 216,000 − 85,000
    expect(result.querySelector('.cafe__note--warn')).toBeNull()
    expect(weeks().some((w) => w[4] === '銀塊の不足分')).toBe(false)
  })

  // 打ち直すために値を消した瞬間に結果が消えないよう、空欄は 0 として計算する
  it('欄を空にすると 0 として計算し、エラーにはしない', () => {
    render(<Silver />)
    typeDamage('')
    expect(damageInput().value).toBe('') // 入力の途中なので、欄は空のまま
    expect(damageInput().getAttribute('aria-invalid')).toBe('false')
    expect(document.getElementById('silver-damage-hint')?.textContent).toBe(
      '晶石ボスのダメージ報酬は人によって違います。',
    )
    const result = card('毎月の必要量')
    expect(ledger(result, '毎月の入手量（紫晶石）')).toBe('216,000') // 54,000 × 4
    expect(screen.queryByText('ダメージ報酬に 0 以上の整数を入れると計算できます。')).toBeNull()
  })

  it('空のまま入力を終えると、欄に 0 が入る', async () => {
    render(<Silver />)
    typeDamage('')
    fireEvent.blur(damageInput())
    expect(damageInput().value).toBe('0')
    await waitFor(() => expect(localStorage.getItem(DAMAGE_KEY)).toBe('0'))
  })

  it('空にしてから打ち直しても、結果のカードは出たまま', () => {
    render(<Silver />)
    fireEvent.click(incomeToggle()) // 内訳を開いておく
    typeDamage('')
    typeDamage('3')
    typeDamage('30000')
    expect(incomeToggle().getAttribute('aria-expanded')).toBe('true') // 開いた状態が保たれる
    expect(ledger(card('毎月の必要量'), 'ダメージ報酬')).toBe('30,000 / 週')
  })

  it.each(['abc', '-1', '100.5', '10000000'])('不正な値 %o では計算せず、入力を促す', (bad) => {
    render(<Silver />)
    typeDamage(bad)
    expect(damageInput().getAttribute('aria-invalid')).toBe('true')
    expect(document.getElementById('silver-damage-hint')?.textContent).toBe(
      '0〜9,999,999 の整数で入力してください',
    )
    expect(screen.getByText('ダメージ報酬に 0 以上の整数を入れると計算できます。')).toBeTruthy()
    expect(screen.queryByRole('heading', { level: 2, name: '毎月の必要量' })).toBeNull()
    // 内訳（固定の値）は出したままにする
    expect(card('内訳').querySelectorAll('.exchange')).toHaveLength(5)
  })

  it('説明文は入力欄に紐づいていて、変化が読み上げられる', () => {
    render(<Silver />)
    const hint = document.getElementById('silver-damage-hint')
    expect(damageInput().getAttribute('aria-describedby')).toBe('silver-damage-hint')
    expect(hint?.getAttribute('aria-live')).toBe('polite')
  })
})

describe('Silver: 保存と復元', () => {
  it('初期値のままなら何も保存しない', async () => {
    render(<Silver />)
    typeDamage('20,500')
    await waitFor(() => expect(localStorage.length).toBe(0))
  })

  it('変えたダメージ報酬とスイッチは保存され、再マウントで復元される', async () => {
    const first = render(<Silver />)
    typeDamage('30000')
    fireEvent.click(goldSwitch())
    await waitFor(() => expect(localStorage.getItem(DAMAGE_KEY)).toBe('30000'))
    expect(localStorage.getItem(BUYALL_KEY)).toBe('0')
    expect(localStorage.getItem(BUYALL_BOUNTY_KEY)).toBeNull() // オンのままのほうは保存しない
    first.unmount()

    render(<Silver />)
    expect(damageInput().value).toBe('30,000')
    expect(goldSwitch().checked).toBe(false)
    expect(bountySwitch().checked).toBe(true)
    expect(card('毎月の必要量').querySelector('.total__value')?.textContent).toBe('145,000')
  })

  it('スイッチはイベントごとに別々に保存される', async () => {
    const first = render(<Silver />)
    fireEvent.click(bountySwitch())
    await waitFor(() => expect(localStorage.getItem(BUYALL_BOUNTY_KEY)).toBe('0'))
    expect(localStorage.getItem(BUYALL_KEY)).toBeNull()
    first.unmount()

    render(<Silver />)
    expect(goldSwitch().checked).toBe(true)
    expect(bountySwitch().checked).toBe(false)
  })

  it('初期値に戻すと保存も消える', async () => {
    render(<Silver />)
    typeDamage('30000')
    fireEvent.click(goldSwitch())
    await waitFor(() => expect(localStorage.getItem(DAMAGE_KEY)).toBe('30000'))

    typeDamage('20500')
    fireEvent.click(goldSwitch())
    await waitFor(() => expect(localStorage.length).toBe(0))
  })

  it('入力途中の不正な値は保存せず、最後に有効だった値を残す', async () => {
    render(<Silver />)
    typeDamage('30000')
    await waitFor(() => expect(localStorage.getItem(DAMAGE_KEY)).toBe('30000'))
    typeDamage('abc')
    expect(localStorage.getItem(DAMAGE_KEY)).toBe('30000')
  })

  it.each(['', 'abc', '-5', '1.5'])('不正な値 %o が保存されていたら初期値で始める', (stored) => {
    localStorage.setItem(DAMAGE_KEY, stored)
    render(<Silver />)
    expect(damageInput().value).toBe('20,500')
  })
})
