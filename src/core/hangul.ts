/** 낱말 끝 글자의 받침에 맞춰 조사를 고른다 — 「묵호와」「봉황과」, 「대숲을」「산사를」 */
export type JosaPair = '을/를' | '이/가' | '와/과' | '은/는' | '으로/로';

export function josa(word: string, pair: JosaPair): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  const hangul = code >= 0 && code <= 11171;
  const final = hangul ? code % 28 : 0;
  const [withFinal, without] = pair.split('/');
  // 「으로」는 ㄹ 받침 뒤에서도 「로」
  if (pair === '으로/로') return word + (final !== 0 && final !== 8 ? withFinal : without);
  return word + (final !== 0 ? withFinal : without);
}
