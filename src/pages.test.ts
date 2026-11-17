import { describe, expect, it } from 'vitest'
import { APP_NAME, PAGES, cupLabel, documentTitle, pageFromHash } from './pages'

describe('pageFromHash', () => {
  it.each<[string, string]>([
    ['', 'home'],
    ['#/', 'home'],
    ['#/calc', 'calc'],
    ['#/unknown', 'home'], // 知らない URL はトップページ
    ['#/calc/extra', 'home'],
    ['#calc', 'home'],
  ])('%o → %o', (hash, page) => {
    expect(pageFromHash(hash)).toBe(page)
  })

  it('準備中のページは URL を直接開いてもトップページにする', () => {
    for (const p of PAGES.filter((x) => x.comingSoon)) {
      expect(pageFromHash(p.hash)).toBe('home')
    }
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
