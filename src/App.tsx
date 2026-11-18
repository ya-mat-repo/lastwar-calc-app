import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { HOME_HASH, PAGES, THEME_COLOR, documentTitle, themeOf } from './pages'
import type { PageKey, ToolKey } from './pages'
import Home from './pages/Home'
import { VIEWS, resolvePage } from './views'

const currentPage = (): PageKey => resolvePage(window.location.hash)

/**
 * URL（ハッシュ）を見てページを出し分ける（SPEC §12.3）。
 * ページ数が少ないので、ルーティング用のライブラリは使わず hashchange だけを見る。
 */
export default function App() {
  const [page, setPage] = useState<PageKey>(currentPage)
  // 一度開いたページは、トップページに戻っても外さずに隠しておく。
  // 外すと計算機の獲得値の編集や優先アイテムの選択が消えてしまう（SPEC §12.6）
  const [opened, setOpened] = useState<readonly ToolKey[]>(page === 'home' ? [] : [page])
  const rootRef = useRef<HTMLDivElement>(null)
  const firstRender = useRef(true)

  useEffect(() => {
    const onChange = (): void => {
      const next = currentPage()
      setPage(next)
      if (next !== 'home') setOpened((prev) => (prev.includes(next) ? prev : [...prev, next]))
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  // 描画の前に済ませる。描画のあとだと、前のページのスクロール位置で1コマ描かれてから先頭に飛ぶ
  useLayoutEffect(() => {
    document.title = documentTitle(page)
    // 配色ごとに背景（スクロールの外側まで）を変えるための目印
    const theme = themeOf(page)
    document.documentElement.dataset.theme = theme
    // スマホのブラウザ上部の色も、ページの配色に合わせる
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme])

    // ここから先はページを切り替えたときだけ。最初の表示ではフォーカスを奪わない
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    window.scrollTo(0, 0)
    // フォーカスを新しいページに移す。移さないと、消えた（隠れた）ページに取り残されて、
    // キーボードやスクリーンリーダーではページが変わったことが分からない
    rootRef.current
      ?.querySelector<HTMLElement>('[data-page-root]:not([hidden])')
      ?.focus({ preventScroll: true })
  }, [page])

  return (
    <div ref={rootRef}>
      {page === 'home' && <Home />}
      {PAGES.map((def) => {
        const View = VIEWS[def.key]
        if (!View || !opened.includes(def.key)) return null
        return (
          <div
            key={def.key}
            className={`page page--${def.theme}`}
            role="region"
            aria-label={def.title}
            tabIndex={-1}
            data-page-root
            hidden={page !== def.key}
          >
            <PageBar title={def.title} />
            <View />
          </div>
        )
      })}
    </div>
  )
}

/** 各ページ共通のバー（SPEC §12.5）。「← ホーム」とページ名だけを出す */
function PageBar({ title }: { title: string }) {
  return (
    <nav className="pagebar" aria-label="ページ移動">
      <a className="pagebar__home" href={HOME_HASH}>
        ← ホーム
      </a>
      <span className="pagebar__title">{title}</span>
    </nav>
  )
}
