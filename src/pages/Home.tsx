import { APP_NAME, PAGES, cupLabel } from '../pages'
import type { PageDef } from '../pages'
import { TODAYS_QUOTE } from '../quotes'
import { fmt, gapToTarget, parseCurrent } from '../state'
import { isCalcTargetInvalid, loadCurrentRaw, loadSavedTarget } from '../storage'
import { isReady } from '../views'

/**
 * トップページ（SPEC §12.4）。
 * 「コーヒーを飲みながらゆったり読書する」落ち着いた空間をイメージしているので、
 * ツールの一覧は本の目次として見せる。
 */
export default function Home() {
  return (
    // ページを切り替えたとき、App がここにフォーカスを移して切り替わったことを伝える
    <div className="home" role="region" aria-label={APP_NAME} tabIndex={-1} data-page-root>
      <header className="home__head">
        <CoffeeCup />
        <p className="home__eyebrow">LAST WAR</p>
        <h1 className="home__title">アプリいろいろ</h1>
        {/* 名言はリロードするたびに変わる（quotes.ts） */}
        <figure className="home__quote">
          <blockquote className="home__lead">{TODAYS_QUOTE.text}</blockquote>
          <figcaption className="home__author">― {TODAYS_QUOTE.author}</figcaption>
        </figure>
      </header>

      <nav className="home__book" aria-label={`${APP_NAME}の目次`}>
        <h2 className="home__contents">目次</h2>
        <ol className="home__list">
          {PAGES.map((page, i) => (
            <li key={page.key}>
              <Chapter page={page} index={i} />
            </li>
          ))}
        </ol>
      </nav>

      <footer className="home__foot">ページは少しずつ増えていきます。</footer>
    </div>
  )
}

/**
 * そのページの「前回のつづき」。保存された値から作るので、無ければ出さない。
 * 計算機が出している「目標まで ◯◯」と同じ判定（gapToTarget）を使う。
 */
function noteFor(page: PageDef): string | null {
  if (page.key !== 'calc') return null
  // 計算機の目標値の欄が不正なあいだは、計算機自身も不足額を出していないので合わせる
  if (isCalcTargetInvalid()) return null
  const current = parseCurrent(loadCurrentRaw()).value
  if (current === null) return null
  const gap = gapToTarget(current, loadSavedTarget())
  if (gap.kind === 'remaining') return `目標まで ${fmt(gap.amount)}`
  if (gap.kind === 'exact') return '目標値ちょうど'
  return `目標を ${fmt(gap.amount)} 超過`
}

function Chapter({ page, index }: { page: PageDef; index: number }) {
  const note = noteFor(page)
  // まだ画面が無いページ（views.ts で null）は「準備中」として出す
  const comingSoon = !isReady(page.key)
  const body = (
    <>
      <span className="home__no">
        <CafeIcon index={index} />
        {cupLabel(index)}
      </span>
      <span className="home__name">{page.title}</span>
      <span className="home__desc">{page.description}</span>
      {comingSoon ? (
        <span className="home__note">準備中</span>
      ) : (
        note && <span className="home__note">前回のつづき ― {note}</span>
      )}
    </>
  )
  // 準備中のページはリンクにしない（押しても開けないものを押せるように見せない）
  return comingSoon ? (
    <div className="home__chapter home__chapter--soon" aria-disabled="true">
      {body}
    </div>
  ) : (
    <a className="home__chapter" href={page.hash}>
      {body}
    </a>
  )
}

/** 湯気の立つコーヒーカップ。飾りなので読み上げ対象から外す */
function CoffeeCup() {
  return (
    <svg className="home__cup" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <g className="home__steam" fill="none" strokeWidth="2" strokeLinecap="round">
        <path d="M24 20c-3-4 3-6 0-10" />
        <path d="M32 18c-3-4 3-6 0-10" />
        <path d="M40 20c-3-4 3-6 0-10" />
      </g>
      <g fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 28h36v10a14 14 0 0 1-14 14h-8a14 14 0 0 1-14-14z" />
        <path d="M50 31h3a6 6 0 0 1 0 12h-4" />
        <path d="M10 57h44" />
      </g>
    </svg>
  )
}

/**
 * 「◯杯目」の先頭に添える小さなイラスト。
 * カップ → コーヒー豆 → 持ち帰りカップ → カップケーキ の順に、項目ごとに替える（一巡したら最初に戻る）。
 * 飾りなので読み上げ対象から外す。
 */
const CAFE_ICONS = [
  // カップ
  <>
    <path d="M8 3.5c-1 1.2 1 1.8 0 3M12 3.5c-1 1.2 1 1.8 0 3" />
    <path d="M4 9.5h13v3.5a6 6 0 0 1-6 6h-1a6 6 0 0 1-6-6z" />
    <path d="M17 10.5h1.3a2.5 2.5 0 0 1 0 5h-1.9" />
  </>,
  // コーヒー豆
  <g transform="rotate(35 12 12)">
    <ellipse cx="12" cy="12" rx="5.5" ry="8.5" />
    <path d="M12 3.5c-3 4.5 3 8 0 17" />
  </g>,
  // 持ち帰りカップ
  <>
    <path d="M8.3 4h7.4l.8 3h-9z" />
    <path d="M6 7h12" />
    <path d="M7 7l1.2 13.5h7.6L17 7" />
    <path d="M7.5 11.5h9M7.9 15.5h8.2" />
  </>,
  // カップケーキ
  <>
    <circle cx="12" cy="5" r="1.4" />
    <path d="M6 13a6 5.5 0 0 1 12 0z" />
    <path d="M7 13l1.4 7.5h7.2L17 13" />
    <path d="M10.5 13.5l.5 7M13.5 13.5l-.5 7" />
  </>,
] as const

function CafeIcon({ index }: { index: number }) {
  return (
    <svg className="home__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {CAFE_ICONS[index % CAFE_ICONS.length]}
    </svg>
  )
}
