// @vitest-environment jsdom
/**
 * ページ切り替え（SPEC §12）のテスト。
 * 計算機そのものの振る舞いは pages/Calc.test.tsx で確認しているので、
 * ここでは「どの URL でどのページが出るか」「行き来しても状態が残るか」だけを見る。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import App from './App'
import { APP_NAME, PAGES, THEME_COLOR } from './pages'
import { QUOTES } from './quotes'
import { setCalcTargetInvalid } from './storage'

/** URL を変えて、ブラウザと同じように hashchange を届ける */
const go = (hash: string): void => {
  act(() => {
    window.history.replaceState(null, '', hash === '' ? window.location.pathname : hash)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

const calcPage = (container: HTMLElement): HTMLElement | null =>
  container.querySelector<HTMLElement>('.page')

// jsdom は scrollTo を実装していない（呼ぶたびにエラーを出力する）ので差し替える
const scrollTo = vi.fn()

beforeEach(() => {
  localStorage.clear()
  window.history.replaceState(null, '', window.location.pathname)
  window.scrollTo = scrollTo
  // index.html にある theme-color を再現する（App がページの配色に合わせて書き換える）
  document.head.querySelector('meta[name="theme-color"]')?.remove()
  const meta = document.createElement('meta')
  meta.name = 'theme-color'
  meta.content = '#0b0e13'
  document.head.append(meta)
  scrollTo.mockClear()
  setCalcTargetInvalid(false) // メモリ上の目印なので、テストごとに戻す
})
afterEach(cleanup)

describe('App: ページ切り替え', () => {
  it('最初はトップページが出て、計算機は出ない', () => {
    const { container } = render(<App />)
    // 見出しの文言は変わりうるので、トップページの見出しが1つあることだけを見る
    expect(container.querySelector('.home h1')?.textContent).not.toBe('')
    expect(calcPage(container)).toBeNull()
    expect(document.title).toBe(APP_NAME)
    expect(document.documentElement.dataset.theme).toBe('cafe')
  })

  it('#/calc を直接開くと計算機が出る', () => {
    window.history.replaceState(null, '', '#/calc')
    const { container } = render(<App />)
    expect(screen.getByLabelText('現在値')).toBeTruthy()
    expect(container.querySelector('.home')).toBeNull()
    expect(document.title).toBe(`ポイント計算機 | ${APP_NAME}`)
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('目次のリンクは計算機の URL を指し、移動すると計算機が出る', () => {
    const { container } = render(<App />)
    const link = screen.getByRole('link', { name: /ポイント計算機/ })
    expect(link.getAttribute('href')).toBe('#/calc')

    go('#/calc')
    expect(container.querySelector('.home')).toBeNull()
    expect(calcPage(container)?.hidden).toBe(false)
  })

  it('計算機には「← ホーム」とページ名のバーが出て、トップページに戻れる', () => {
    window.history.replaceState(null, '', '#/calc')
    const { container } = render(<App />)
    const bar = screen.getByRole('navigation', { name: 'ページ移動' })
    expect(within(bar).getByText('ポイント計算機')).toBeTruthy()
    expect(within(bar).getByRole('link', { name: '← ホーム' }).getAttribute('href')).toBe('#/')

    go('#/')
    expect(container.querySelector('.home')).not.toBeNull()
    expect(calcPage(container)?.hidden).toBe(true)
  })

  it.each(['#/unknown', '#/shop', '#calc'])('知らない URL・準備中の URL %o はトップページ', (hash) => {
    window.history.replaceState(null, '', hash)
    const { container } = render(<App />)
    expect(container.querySelector('.home')).not.toBeNull()
    expect(calcPage(container)).toBeNull()
  })

  it('#/silver を開くと銀塊必要量チェッカーが、カフェの配色で出る', () => {
    window.history.replaceState(null, '', '#/silver')
    const { container } = render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: '銀塊必要量チェッカー' })).toBeTruthy()
    expect(container.querySelector('.page--cafe')).not.toBeNull()
    expect(document.title).toBe(`銀塊必要量チェッカー | ${APP_NAME}`)
    expect(document.documentElement.dataset.theme).toBe('cafe')
    const bar = screen.getByRole('navigation', { name: 'ページ移動' })
    expect(within(bar).getByRole('link', { name: '← ホーム' }).getAttribute('href')).toBe('#/')
  })

  it('ページを渡り歩いても、出ているのは1ページだけで、開いたページは隠して残す', () => {
    const { container } = render(<App />)
    go('#/calc')
    go('#/silver')
    const pages = [...container.querySelectorAll<HTMLElement>('.page')]
    expect(pages.map((p) => [p.getAttribute('aria-label'), p.hidden])).toEqual([
      ['ポイント計算機', true],
      ['銀塊必要量チェッカー', false],
    ])
    expect(document.activeElement).toBe(pages[1])
  })

  it('ブラウザ上部の色（theme-color）を、ページの配色に合わせる', () => {
    const color = (): string | null =>
      document.head.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? null
    render(<App />)
    expect(color()).toBe(THEME_COLOR.cafe) // トップページ
    go('#/calc')
    expect(color()).toBe(THEME_COLOR.dark)
    go('#/silver')
    expect(color()).toBe(THEME_COLOR.cafe)
  })

  it('ページの中の見出しと説明は、目次と同じもの（pages.ts）を使う', () => {
    window.history.replaceState(null, '', '#/silver')
    const { container } = render(<App />)
    const def = PAGES.find((p) => p.key === 'silver')
    expect(container.querySelector('.cafe__title')?.textContent).toBe(def?.title)
    expect(container.querySelector('.cafe__lead')?.textContent).toBe(def?.description)
  })

  it('最初の表示ではスクロールもフォーカスも動かさない', () => {
    render(<App />)
    expect(scrollTo).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(document.body)
  })

  it('ページを切り替えると先頭に戻り、フォーカスが新しいページに移る', () => {
    const { container } = render(<App />)

    go('#/calc')
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0)
    const calc = calcPage(container) as HTMLElement
    expect(document.activeElement).toBe(calc)
    expect(calc.getAttribute('aria-label')).toBe('ポイント計算機')

    // 計算機の中にフォーカスがある状態で戻っても、隠れたページに取り残されない
    screen.getByLabelText('現在値').focus()
    go('#/')
    expect(scrollTo).toHaveBeenCalledTimes(2)
    const home = container.querySelector<HTMLElement>('.home') as HTMLElement
    expect(document.activeElement).toBe(home)
    expect(home.getAttribute('aria-label')).toBe(APP_NAME)
  })

  // SPEC §12.6: トップページに戻っただけで編集内容が消えないこと
  it('トップページと行き来しても、計算機の編集内容と選択中の曜日が残る', () => {
    window.history.replaceState(null, '', '#/calc')
    render(<App />)
    fireEvent.click(screen.getByRole('tab', { name: '火曜日' }))
    const value = screen.getByLabelText('建造の基準値（1分あたり）') as HTMLInputElement
    fireEvent.change(value, { target: { value: '160' } })

    go('#/')
    go('#/calc')

    expect(screen.getByRole('tab', { name: '火曜日' }).getAttribute('aria-selected')).toBe('true')
    expect((screen.getByLabelText('建造の基準値（1分あたり）') as HTMLInputElement).value).toBe('160')
  })
})

describe('App: トップページ', () => {
  it('ツールが目次として「◯杯目」の番号つきで並ぶ', () => {
    render(<App />)
    const nav = screen.getByRole('navigation', { name: /目次/ })
    const items = within(nav).getAllByRole('listitem')
    expect(items.map((li) => li.querySelector('.home__no')?.textContent)).toEqual(['1杯目', '2杯目', '3杯目'])
    expect(items.map((li) => li.querySelector('.home__name')?.textContent)).toEqual([
      'ポイント計算機',
      '銀塊必要量チェッカー',
      '最安イベント早見',
    ])
  })

  it('見出しの下に、名言の一覧のどれか1つが人物名つきで出る', () => {
    const { container } = render(<App />)
    const text = container.querySelector('.home__lead')?.textContent
    const author = container.querySelector('.home__author')?.textContent
    const quote = QUOTES.find((q) => q.text === text)
    expect(quote).toBeDefined()
    expect(author).toBe(`― ${quote?.author}`)
  })

  it('計算機と行き来しただけでは名言は変わらない（変わるのはリロードしたとき）', () => {
    const { container } = render(<App />)
    const before = container.querySelector('.home__lead')?.textContent
    go('#/calc')
    go('#/')
    expect(container.querySelector('.home__lead')?.textContent).toBe(before)
  })

  it('「◯杯目」の先頭に、読み上げ対象外のイラストが付く', () => {
    const { container } = render(<App />)
    const labels = [...container.querySelectorAll('.home__no')]
    expect(labels).toHaveLength(3)
    for (const label of labels) {
      const icon = label.firstElementChild
      expect(icon?.tagName.toLowerCase()).toBe('svg')
      expect(icon?.getAttribute('aria-hidden')).toBe('true')
    }
    // 項目ごとに違うイラストにしている
    expect(labels[0].querySelector('svg')?.innerHTML).not.toBe(labels[1].querySelector('svg')?.innerHTML)
  })

  it('準備中のページはリンクにせず「準備中」と出す', () => {
    render(<App />)
    expect(screen.queryByRole('link', { name: /最安イベント早見/ })).toBeNull()
    const soon = screen.getByText('最安イベント早見').closest('.home__chapter') as HTMLElement
    expect(soon.getAttribute('aria-disabled')).toBe('true')
    expect(within(soon).getByText('準備中')).toBeTruthy()
  })

  it('現在値が保存されていなければ「前回のつづき」は出ない', () => {
    render(<App />)
    expect(screen.queryByText(/前回のつづき/)).toBeNull()
  })

  it('保存された現在値と目標値から「前回のつづき」を出す', () => {
    localStorage.setItem('lastwar-calc:current', '6850000')
    const first = render(<App />)
    expect(screen.getByText('前回のつづき ― 目標まで 350,000')).toBeTruthy()
    first.unmount()

    localStorage.setItem('lastwar-calc:target', '7000000')
    render(<App />)
    expect(screen.getByText('前回のつづき ― 目標まで 150,000')).toBeTruthy()
  })

  it('計算機で現在値を入れてトップページに戻ると、その値が反映される', async () => {
    window.history.replaceState(null, '', '#/calc')
    render(<App />)
    fireEvent.change(screen.getByLabelText('現在値'), { target: { value: '7,000,000' } })

    go('#/')
    expect(await screen.findByText('前回のつづき ― 目標まで 200,000')).toBeTruthy()
  })

  // 計算機が「目標値を入力してください」と出しているあいだは、トップページも不足額を出さない
  it('計算機の目標値が不正なままトップページに戻ると「前回のつづき」は出さない', async () => {
    window.history.replaceState(null, '', '#/calc')
    render(<App />)
    fireEvent.change(screen.getByLabelText('現在値'), { target: { value: '6850000' } })
    fireEvent.change(screen.getByLabelText('目標値'), { target: { value: '' } })

    go('#/')
    expect(screen.queryByText(/前回のつづき/)).toBeNull()

    // 直せばまた出る
    go('#/calc')
    fireEvent.change(screen.getByLabelText('目標値'), { target: { value: '7000000' } })
    go('#/')
    expect(await screen.findByText('前回のつづき ― 目標まで 150,000')).toBeTruthy()
  })

  it('目標値ちょうど・超過のときの文言', () => {
    localStorage.setItem('lastwar-calc:current', '7200000')
    const first = render(<App />)
    expect(screen.getByText('前回のつづき ― 目標値ちょうど')).toBeTruthy()
    first.unmount()

    localStorage.setItem('lastwar-calc:current', '7300000')
    render(<App />)
    expect(screen.getByText('前回のつづき ― 目標を 100,000 超過')).toBeTruthy()
  })
})
