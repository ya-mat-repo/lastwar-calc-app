/**
 * ページの一覧定義とハッシュ URL の解釈（SPEC §12）。
 * ページを足すときは PAGES に1件足し、App.tsx の出し分けに1行足す。
 */

export const APP_NAME = 'Last War ツール集'

export type PageKey = 'home' | 'calc' | 'shop'

export interface PageDef {
  readonly key: PageKey
  /** ハッシュ URL（`#/calc`） */
  readonly hash: string
  readonly title: string
  /** トップページに出す一行の説明 */
  readonly description: string
  /** まだ作っていないページ。トップページには「準備中」として出し、開けない */
  readonly comingSoon?: boolean
}

/** トップページから開くツール（並び順＝トップページの並び順） */
export const PAGES: readonly PageDef[] = [
  {
    key: 'calc',
    hash: '#/calc',
    title: 'ポイント計算機',
    description: '目標値ぴったりになる組み合わせを計算します。',
  },
  {
    key: 'shop',
    hash: '#/shop',
    title: '最安イベント早見',
    description: 'どのイベントで買うと一番安いかを見比べます。',
    comingSoon: true,
  },
]

export const HOME_HASH = '#/'

/** ハッシュ → ページ。知らない URL と準備中のページはトップページにする */
export function pageFromHash(hash: string): PageKey {
  const page = PAGES.find((p) => p.hash === hash)
  return page && !page.comingSoon ? page.key : 'home'
}

/** ブラウザのタブに出すタイトル */
export function documentTitle(key: PageKey): string {
  const page = PAGES.find((p) => p.key === key)
  return page ? `${page.title} | ${APP_NAME}` : APP_NAME
}

/** 目次の番号。カフェらしく「1杯目、2杯目 …」と数える */
export const cupLabel = (index: number): string => `${index + 1}杯目`
