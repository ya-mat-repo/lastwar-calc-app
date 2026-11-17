import { TARGET } from './data'
import { parseTarget } from './state'

/**
 * localStorage の読み書き。
 * サイトデータをブロックした環境やプライベートブラウズでは localStorage への
 * アクセス自体が throw する。保存できなくても計算には影響しないので黙って諦める。
 */

/** 計算機の現在値 */
export const CURRENT_STORAGE_KEY = 'lastwar-calc:current'
/** 計算機の目標値（初期値から変えたときだけ保存される） */
export const TARGET_STORAGE_KEY = 'lastwar-calc:target'

export const load = (key: string): string | null => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/** value が null ならキーごと消す */
export const save = (key: string, value: string | null): void => {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* 保存できない環境ではメモリ上だけで動かす */
  }
}

/** 保存された現在値の入力（未保存なら空文字） */
export const loadCurrentRaw = (): string => load(CURRENT_STORAGE_KEY) ?? ''

/** 保存された目標値。保存されていない・不正な値なら初期値 */
export const loadSavedTarget = (): number =>
  parseTarget(load(TARGET_STORAGE_KEY) ?? '').value ?? TARGET

/**
 * 計算機の目標値の欄が、いま不正な値になっているか。
 * 不正な値は保存しない（最後に有効だった値を残す）ので、保存値だけを見ているトップページには
 * 「計算機はいま計算できない状態」であることが伝わらない。それを伝えるための目印。
 * リロードすれば計算機は有効な値で始まるので、保存はせずメモリ上だけで持つ。
 */
let calcTargetInvalid = false
export const setCalcTargetInvalid = (invalid: boolean): void => {
  calcTargetInvalid = invalid
}
export const isCalcTargetInvalid = (): boolean => calcTargetInvalid
