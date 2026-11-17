import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { HOME_HASH, PAGES, documentTitle, pageFromHash } from './pages'
import type { PageKey } from './pages'
import Calc from './pages/Calc'
import Home from './pages/Home'

const currentPage = (): PageKey => pageFromHash(window.location.hash)
const titleOf = (page: PageKey): string => PAGES.find((p) => p.key === page)?.title ?? ''

/**
 * URL（ハッシュ）を見てページを出し分ける（SPEC §12.3）。
 * ページ数が少ないので、ルーティング用のライブラリは使わず hashchange だけを見る。
 */
export default function App() {
  const [page, setPage] = useState<PageKey>(currentPage)
  // 一度開いた計算機は、トップページに戻っても外さずに隠しておく。
  // 外すと獲得値の編集や優先アイテムの選択が消えてしまう（SPEC §12.6）
  const [calcOpened, setCalcOpened] = useState(page === 'calc')
  const rootRef = useRef<HTMLDivElement>(null)
  const firstRender = useRef(true)

  useEffect(() => {
    const onChange = (): void => {
      const next = currentPage()
      setPage(next)
      if (next === 'calc') setCalcOpened(true)
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  // 描画の前に済ませる。描画のあとだと、前のページのスクロール位置で1コマ描かれてから先頭に飛ぶ
  useLayoutEffect(() => {
    document.title = documentTitle(page)
    // ページごとに背景（スクロールの外側まで）を変えるための目印
    document.documentElement.dataset.page = page

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
      {calcOpened && (
        <div
          className="page"
          role="region"
          aria-label={titleOf('calc')}
          tabIndex={-1}
          data-page-root
          hidden={page !== 'calc'}
        >
          <PageBar page="calc" />
          <Calc />
        </div>
      )}
    </div>
  )
}

/** 各ページ共通のバー（SPEC §12.5）。「← ホーム」とページ名だけを出す */
function PageBar({ page }: { page: PageKey }) {
  return (
    <nav className="pagebar" aria-label="ページ移動">
      <a className="pagebar__home" href={HOME_HASH}>
        ← ホーム
      </a>
      <span className="pagebar__title">{titleOf(page)}</span>
    </nav>
  )
}
