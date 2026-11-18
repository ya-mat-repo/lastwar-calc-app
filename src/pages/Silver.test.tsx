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

const damageInput = (): HTMLInputElement =>
  screen.getByLabelText(/ダメージ報酬でもらえる紫晶石/) as HTMLInputElement
const goldSwitch = (): HTMLInputElement =>
  screen.getByRole('switch', { name: /閃金をお金で買える上限まで買う/ }) as HTMLInputElement
const typeDamage = (value: string): void => {
  fireEvent.change(damageInput(), { target: { value } })
}

/** 見出しからそのカードを引く */
const card = (name: string): HTMLElement =>
  screen.getByRole('heading', { level: 2, name }).closest('section') as HTMLElement

/** 帳面（項目名 → 数字）の1行の数字 */
const ledger = (within_: HTMLElement, term: string): string =>
  within(within_).getByText(term).parentElement?.querySelector('dd')?.textContent ?? ''

/** 4週間の流れを [週, イベント, 貯えの文, 入手, 使う, 自由に使える] の配列にする */
const weeks = (): string[][] =>
  [...card('4週間の流れ').querySelectorAll('.week')].map((li) => [
    li.querySelector('.week__no')?.textContent ?? '',
    li.querySelector('.week__name')?.textContent ?? '',
    li.querySelector('.week__reserve')?.textContent ?? '',
    ...[...li.querySelectorAll('dd')].map((dd) => dd.textContent ?? ''),
  ])

describe('Silver: 初期表示（SPEC §14.6 の例）', () => {
  it('ダメージ報酬 20,500・スイッチはオンで始まる', () => {
    render(<Silver />)
    expect(damageInput().value).toBe('20,500')
    expect(goldSwitch().checked).toBe(true)
  })

  it('毎月の必要量 235,000、入手量 298,000、余り 63,000', () => {
    render(<Silver />)
    const result = card('毎月の必要量')
    expect(result.querySelector('.total__value')?.textContent).toBe('235,000')
    expect(ledger(result, '毎月の入手量（紫晶石）')).toBe('298,000')
    expect(ledger(result, '余り')).toBe('63,000')
  })

  it('紫晶石との交換回数と、月の上限が出る', () => {
    render(<Silver />)
    const result = card('毎月の必要量')
    expect(ledger(result, '紫晶石との交換回数（月の上限 50回）')).toBe('47 / 50回')
    expect(within(result).getByText(/月に 50回、\s*250,000 まで/)).toBeTruthy()
    // 上限に収まっているので、警告は出ない
    expect(result.querySelector('.cafe__note--warn')).toBeNull()

    fireEvent.click(goldSwitch())
    expect(ledger(result, '紫晶石との交換回数（月の上限 50回）')).toBe('17 / 50回')
  })

  it('4週間の流れ', () => {
    render(<Silver />)
    expect(weeks()).toEqual([
      ['1週目', '閃金', '始まるまでに 105,500 を貯めておく', '74,500', '180,000', '0'],
      ['2週目', '百発百中', '貯えは要りません', '74,500', '25,000', '49,500'],
      ['3週目', '戦争準備', '貯えは要りません', '74,500', '0', '13,500'],
      ['4週目', '賞金稼ぎ', '始まるまでに 61,000 を貯めておく', '74,500', '30,000', '0'],
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
    ])
    expect(within(card('内訳')).getByText('銀塊での交換はありません')).toBeTruthy() // 戦争準備
  })

  it('内訳に、紫晶石の入手量が出る', () => {
    render(<Silver />)
    const c = card('内訳')
    expect(ledger(c, '連盟対決報酬')).toBe('6,500 / 日')
    expect(ledger(c, '晶石ボス')).toBe('2,500 / 日')
    expect(ledger(c, 'ダメージ報酬')).toBe('20,500 / 週')
    expect(ledger(c, '1週間の合計')).toBe('74,500')
  })
})

describe('Silver: スイッチ（お金で買える上限まで買う）', () => {
  it('オフにすると、任意の 150,000 が必要量から外れ、貯えも要らなくなる', () => {
    render(<Silver />)
    fireEvent.click(goldSwitch())

    const result = card('毎月の必要量')
    expect(result.querySelector('.total__value')?.textContent).toBe('85,000')
    expect(ledger(result, '余り')).toBe('213,000')
    expect(weeks().map((w) => [w[1], w[2], w[4]])).toEqual([
      ['閃金', '貯えは要りません', '30,000'],
      ['百発百中', '貯えは要りません', '25,000'],
      ['戦争準備', '貯えは要りません', '0'],
      ['賞金稼ぎ', '貯えは要りません', '30,000'],
    ])
    const off = card('内訳').querySelector('.exchange--off')
    expect(off?.querySelector('.exchange__tag')?.textContent).toBe('任意・入れない')
  })

  it('スイッチが出るのは、任意の交換がある閃金だけ', () => {
    render(<Silver />)
    expect(screen.getAllByRole('switch')).toHaveLength(1)
  })
})

describe('Silver: ダメージ報酬', () => {
  it('変えると入手量と余りが変わる', () => {
    render(<Silver />)
    typeDamage('30000')
    const result = card('毎月の必要量')
    expect(ledger(result, '毎月の入手量（紫晶石）')).toBe('336,000') // (54,000 + 30,000) × 4
    expect(ledger(result, '余り')).toBe('101,000')
    expect(ledger(card('内訳'), '1週間の合計')).toBe('84,000')
  })

  it('入力を終えると桁区切りつきに整う', () => {
    render(<Silver />)
    typeDamage('30000')
    fireEvent.blur(damageInput())
    expect(damageInput().value).toBe('30,000')
  })

  it('入手が足りないときは不足を出し、週ごとの貯えは出さない', () => {
    render(<Silver />)
    typeDamage('0')
    const result = card('毎月の必要量')
    expect(ledger(result, '毎月の入手量（紫晶石）')).toBe('216,000')
    expect(ledger(result, '不足')).toBe('19,000')
    expect(within(result).getByText(/毎月の入手では足りません/)).toBeTruthy()
    expect(card('4週間の流れ').querySelectorAll('.week')).toHaveLength(0)
    expect(within(card('4週間の流れ')).getByText(/週ごとの貯えは計算できません/)).toBeTruthy()
  })

  it('足りなくても、スイッチをオフにすれば足りる', () => {
    render(<Silver />)
    typeDamage('0')
    fireEvent.click(goldSwitch())
    expect(ledger(card('毎月の必要量'), '余り')).toBe('131,000') // 216,000 − 85,000
    expect(weeks()).toHaveLength(4)
  })

  it.each(['', 'abc', '-1', '100.5', '10000000'])('不正な値 %o では計算せず、入力を促す', (bad) => {
    render(<Silver />)
    typeDamage(bad)
    expect(damageInput().getAttribute('aria-invalid')).toBe('true')
    expect(document.getElementById('silver-damage-hint')?.textContent).toBe(
      '0〜9,999,999 の整数で入力してください',
    )
    expect(screen.getByText('ダメージ報酬を入力すると計算できます。')).toBeTruthy()
    expect(screen.queryByRole('heading', { level: 2, name: '毎月の必要量' })).toBeNull()
    // 内訳（固定の値）は出したままにする
    expect(ledger(card('内訳'), 'ダメージ報酬')).toBe('—')
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
    first.unmount()

    render(<Silver />)
    expect(damageInput().value).toBe('30,000')
    expect(goldSwitch().checked).toBe(false)
    expect(card('毎月の必要量').querySelector('.total__value')?.textContent).toBe('85,000')
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
