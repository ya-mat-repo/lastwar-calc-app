/**
 * ページごとの画面の登録（SPEC §12.8）。
 * 「まだ作っていない（準備中）」かどうかは、ここで null かどうかだけで決まる。
 */
import type { ComponentType } from 'react'
import { pageFromHash } from './pages'
import type { PageKey, ToolKey } from './pages'
import Calc from './pages/Calc'
import Silver from './pages/Silver'

/**
 * ToolKey をすべて並べる必要があるので、ページを足してここへの登録を忘れると型エラーになる。
 * まだ作っていないページは null。
 */
export const VIEWS: Record<ToolKey, ComponentType | null> = {
  calc: Calc,
  silver: Silver,
  shop: null,
}

/** 画面ができていて、開けるページか */
export const isReady = (key: ToolKey): boolean => VIEWS[key] !== null

/** ハッシュ → 実際に出すページ。知らない URL と準備中のページはトップページにする */
export function resolvePage(hash: string): PageKey {
  const page = pageFromHash(hash)
  return page !== 'home' && !isReady(page) ? 'home' : page
}
