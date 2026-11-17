import { describe, expect, it } from 'vitest'
import { HEALING_QUOTES, MOTIVATING_QUOTES, QUOTES, TODAYS_QUOTE, pickQuote } from './quotes'

describe('QUOTES', () => {
  it('やる気が出る名言20個と心が癒される名言20個の、合わせて40個ある', () => {
    expect(MOTIVATING_QUOTES).toHaveLength(20)
    expect(HEALING_QUOTES).toHaveLength(20)
    expect(QUOTES).toHaveLength(40)
  })

  it('どれも本文と人物名を持つ', () => {
    for (const q of QUOTES) {
      expect(q.text.trim()).not.toBe('')
      expect(q.author.trim()).not.toBe('')
    }
  })

  it('同じ名言が重複していない', () => {
    expect(new Set(QUOTES.map((q) => q.text)).size).toBe(QUOTES.length)
  })
})

describe('pickQuote', () => {
  it('乱数の値に応じて、先頭から末尾までどれも選ばれる', () => {
    const picked = QUOTES.map((_, i) => pickQuote(() => i / QUOTES.length))
    expect(picked).toEqual(QUOTES)
  })

  it('乱数が端の値でも範囲を外れない', () => {
    expect(pickQuote(() => 0)).toBe(QUOTES[0])
    expect(pickQuote(() => 0.999999)).toBe(QUOTES[QUOTES.length - 1])
    expect(pickQuote(() => 1)).toBe(QUOTES[QUOTES.length - 1]) // 1 を返す乱数でも落ちない
  })

  it('何度も引くと複数の名言が出る（毎回同じにならない）', () => {
    const seen = new Set(Array.from({ length: 200 }, () => pickQuote().text))
    expect(seen.size).toBeGreaterThan(1)
  })
})

describe('TODAYS_QUOTE', () => {
  it('一覧の中の1つ', () => {
    expect(QUOTES).toContain(TODAYS_QUOTE)
  })
})
