import { describe, expect, it } from 'vitest'
import {
  APP_NAME,
  PAGES,
  THEME_COLOR,
  cupLabel,
  documentTitle,
  pageDef,
  pageFromHash,
  themeOf,
} from './pages'

describe('pageFromHash', () => {
  it.each<[string, string]>([
    ['', 'home'],
    ['#/', 'home'],
    ['#/calc', 'calc'],
    ['#/silver', 'silver'],
    ['#/unknown', 'home'], // 知らない URL はトップページ
    ['#/calc/extra', 'home'],
    ['#calc', 'home'],
  ])('%o → %o', (hash, page) => {
    expect(pageFromHash(hash)).toBe(page)
  })

  it('準備中かどうかはここでは見ない（views.ts の resolvePage が見る）', () => {
    expect(pageFromHash('#/shop')).toBe('shop')
  })
})

describe('PAGES', () => {
  it('URL とキーが重複していない', () => {
    expect(new Set(PAGES.map((p) => p.hash)).size).toBe(PAGES.length)
    expect(new Set(PAGES.map((p) => p.key)).size).toBe(PAGES.length)
  })

  it('どのページも #/ で始まる URL と、名前・説明を持つ', () => {
    for (const p of PAGES) {
      expect(p.hash).toMatch(/^#\/[a-z]+$/)
      expect(p.title).not.toBe('')
      expect(p.description).not.toBe('')
    }
  })
})

describe('並び順と配色', () => {
  it('1杯目 計算機、2杯目 銀塊必要量チェッカー、3杯目 最安イベント早見', () => {
    expect(PAGES.map((p) => p.key)).toEqual(['calc', 'silver', 'shop'])
  })

  it('pageDef でページの定義を引ける', () => {
    expect(pageDef('silver').title).toBe('銀塊必要量チェッカー')
    expect(pageDef('silver').description).not.toBe('')
  })

  it('配色ごとに、ブラウザ上部の色（theme-color）を持つ', () => {
    expect(THEME_COLOR.cafe).toMatch(/^#[0-9a-f]{6}$/)
    expect(THEME_COLOR.dark).toMatch(/^#[0-9a-f]{6}$/)
    expect(THEME_COLOR.cafe).not.toBe(THEME_COLOR.dark)
  })

  it('トップページと銀塊必要量チェッカーはカフェ、計算機は暗い配色', () => {
    expect(themeOf('home')).toBe('cafe')
    expect(themeOf('silver')).toBe('cafe')
    expect(themeOf('calc')).toBe('dark')
  })
})

describe('documentTitle', () => {
  it('トップページはアプリ名、各ページは「ページ名 | アプリ名」', () => {
    expect(documentTitle('home')).toBe(APP_NAME)
    expect(documentTitle('calc')).toBe(`ポイント計算機 | ${APP_NAME}`)
  })
})

describe('cupLabel', () => {
  it('算用数字で「◯杯目」を返す', () => {
    expect(cupLabel(0)).toBe('1杯目')
    expect(cupLabel(1)).toBe('2杯目')
    expect(cupLabel(9)).toBe('10杯目')
    expect(cupLabel(10)).toBe('11杯目')
  })
})
