/**
 * ページの一覧定義とハッシュ URL の解釈（SPEC §12）。
 *
 * ページを足す手順:
 *   1. ToolKey に名前を足す
 *   2. PAGES に1件足す
 *   3. views.ts の VIEWS に画面を登録する（足し忘れると型エラーになる）
 * 作りかけのあいだは VIEWS に null を登録しておけば「準備中」として出る。
 * 「準備中かどうか」は VIEWS だけで決まる（ここには持たない）。
 */

export const APP_NAME = 'Last War ツール集'

/** トップページから開くツール */
export type ToolKey = 'calc' | 'silver' | 'shop'
export type PageKey = 'home' | ToolKey

/** ページの配色。cafe＝トップページと同じカフェの配色 / dark＝計算機の暗い背景 × ゴールド */
export type Theme = 'cafe' | 'dark'

export interface PageDef {
  readonly key: ToolKey
  /** ハッシュ URL（`#/calc`） */
  readonly hash: string
  readonly title: string
  /** トップページに出す一行の説明 */
  readonly description: string
  readonly theme: Theme
}

/** トップページから開くツール（並び順＝トップページの並び順） */
export const PAGES: readonly PageDef[] = [
  {
    key: 'calc',
    hash: '#/calc',
    title: 'ポイント計算機',
    description: '目標値ぴったりになる組み合わせを計算します。',
    theme: 'dark',
  },
  {
    key: 'silver',
    hash: '#/silver',
    title: '銀塊必要量チェッカー',
    description: '毎月どれだけ銀塊が必要かを確かめます。',
    theme: 'cafe',
  },
  {
    key: 'shop',
    hash: '#/shop',
    title: '最安イベント早見',
    description: 'どのイベントで買うと一番安いかを見比べます。',
    theme: 'cafe',
  },
]

export const HOME_HASH = '#/'

/**
 * ハッシュ → ページ。知らない URL はトップページにする。
 * 準備中のページかどうかはここでは見ない（views.ts の resolvePage が見る）。
 */
export function pageFromHash(hash: string): PageKey {
  return PAGES.find((p) => p.hash === hash)?.key ?? 'home'
}

/** ページの定義を引く。ページ名や説明をページの中でも使うためのもの */
export function pageDef(key: ToolKey): PageDef {
  const page = PAGES.find((p) => p.key === key)
  if (!page) throw new Error(`ページ ${key} が PAGES に無い`)
  return page
}

/** スマホのブラウザ上部などに使われる色（theme-color）。ページの背景の上端に合わせる */
export const THEME_COLOR: Record<Theme, string> = {
  cafe: '#33251d',
  dark: '#0b0e13',
}

/** そのページの配色（トップページはカフェ） */
export function themeOf(key: PageKey): Theme {
  return PAGES.find((p) => p.key === key)?.theme ?? 'cafe'
}

/** ブラウザのタブに出すタイトル */
export function documentTitle(key: PageKey): string {
  const page = PAGES.find((p) => p.key === key)
  return page ? `${page.title} | ${APP_NAME}` : APP_NAME
}

/** 目次の番号。カフェらしく「1杯目、2杯目 …」と数える */
export const cupLabel = (index: number): string => `${index + 1}杯目`
