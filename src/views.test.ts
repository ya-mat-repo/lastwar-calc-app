import { describe, expect, it } from 'vitest'
import { PAGES } from './pages'
import { VIEWS, isReady, resolvePage } from './views'

describe('VIEWS', () => {
  it('PAGES のすべてのページが登録されている', () => {
    expect(Object.keys(VIEWS).sort()).toEqual(PAGES.map((p) => p.key).sort())
  })

  it('計算機と銀塊必要量チェッカーは開けて、最安イベント早見は準備中', () => {
    expect(PAGES.map((p) => [p.key, isReady(p.key)])).toEqual([
      ['calc', true],
      ['silver', true],
      ['shop', false],
    ])
  })
})

describe('resolvePage', () => {
  it.each<[string, string]>([
    ['', 'home'],
    ['#/', 'home'],
    ['#/calc', 'calc'],
    ['#/silver', 'silver'],
    ['#/shop', 'home'], // 準備中のページは URL を直接開いてもトップページ
    ['#/unknown', 'home'],
  ])('%o → %o', (hash, page) => {
    expect(resolvePage(hash)).toBe(page)
  })

  // 「準備中」の判定は VIEWS の1か所だけ。開けるページは必ず URL からも開ける
  it('開けるページはどれも、自分の URL でそのページになる', () => {
    for (const p of PAGES.filter((x) => isReady(x.key))) {
      expect(resolvePage(p.hash)).toBe(p.key)
    }
  })
})
