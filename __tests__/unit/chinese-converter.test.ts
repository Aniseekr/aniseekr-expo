import { describe, it, expect } from 'bun:test';
import {
  containsChinese,
  convertOptionalToSimplified,
  convertOptionalToTraditional,
  convertSimplifiedToTraditional,
  expandSearchVariants,
  toSimplified,
  toTraditional,
} from '../../libs/utils/chinese-converter';

describe('chinese-converter — toTraditional (s2twp)', () => {
  it('CHC-001 char-level conversion of common simplified characters', () => {
    expect(toTraditional('进击的巨人')).toBe('進擊的巨人');
    expect(toTraditional('工作细胞')).toBe('工作細胞');
    expect(toTraditional('鬼灭之刃')).toBe('鬼滅之刃');
  });

  it('CHC-002 phrase-level Taiwan vocabulary substitution (s2twp)', () => {
    // OpenCC's TW phrases cover language-form vocabulary, not commercial
    // translation choices (e.g. it does NOT map 高达↔鋼彈 — that's a
    // localization decision OpenCC stays out of). Check the vocabulary
    // substitutions that DO ship with the dict.
    expect(toTraditional('软件')).toBe('軟體');
    expect(toTraditional('视频')).toBe('影片');
    expect(toTraditional('网络')).toBe('網路');
    expect(toTraditional('信息')).toBe('資訊');
    expect(toTraditional('服务器')).toBe('伺服器');
    expect(toTraditional('打印')).toBe('列印');
  });

  it('CHC-003 idempotent — already-traditional input is unchanged', () => {
    const trad = '進擊的巨人';
    expect(toTraditional(trad)).toBe(trad);
    expect(toTraditional(toTraditional(trad))).toBe(trad);
  });

  it('CHC-004 non-CJK input is returned as-is without invoking converter', () => {
    expect(toTraditional('Cowboy Bebop')).toBe('Cowboy Bebop');
    expect(toTraditional('カウボーイビバップ')).toBe('カウボーイビバップ');
    expect(toTraditional('')).toBe('');
    expect(toTraditional('Re:Zero')).toBe('Re:Zero');
  });

  it('CHC-005 mixed-script strings convert only the CJK portion', () => {
    // Latin/punctuation/digits stay intact.
    expect(toTraditional('Re:从零开始的异世界生活2')).toBe('Re:從零開始的異世界生活2');
  });
});

describe('chinese-converter — toSimplified (tw2sp)', () => {
  it('CHC-010 char-level conversion of common traditional characters', () => {
    expect(toSimplified('進擊的巨人')).toBe('进击的巨人');
    expect(toSimplified('工作細胞')).toBe('工作细胞');
  });

  it('CHC-011 phrase-level Mainland vocabulary substitution (tw2sp)', () => {
    expect(toSimplified('軟體')).toBe('软件');
    expect(toSimplified('網路')).toBe('网络');
    expect(toSimplified('資訊')).toBe('信息');
    expect(toSimplified('伺服器')).toBe('服务器');
  });

  it('CHC-012 idempotent — already-simplified input is unchanged', () => {
    const simp = '进击的巨人';
    expect(toSimplified(simp)).toBe(simp);
    expect(toSimplified(toSimplified(simp))).toBe(simp);
  });

  it('CHC-013 non-CJK input is returned as-is', () => {
    expect(toSimplified('Cowboy Bebop')).toBe('Cowboy Bebop');
    expect(toSimplified('')).toBe('');
  });
});

describe('chinese-converter — back-compat aliases', () => {
  it('CHC-020 convertSimplifiedToTraditional matches toTraditional', () => {
    expect(convertSimplifiedToTraditional('工作细胞')).toBe('工作細胞');
    expect(convertSimplifiedToTraditional).toBe(toTraditional);
  });

  it('CHC-021 convertOptionalToTraditional passes null/undefined through', () => {
    expect(convertOptionalToTraditional(null)).toBeNull();
    expect(convertOptionalToTraditional(undefined)).toBeUndefined();
    expect(convertOptionalToTraditional('工作细胞')).toBe('工作細胞');
  });

  it('CHC-022 convertOptionalToSimplified passes null/undefined through', () => {
    expect(convertOptionalToSimplified(null)).toBeNull();
    expect(convertOptionalToSimplified(undefined)).toBeUndefined();
    expect(convertOptionalToSimplified('工作細胞')).toBe('工作细胞');
  });
});

describe('chinese-converter — containsChinese', () => {
  it('CHC-030 detects CJK ideographs', () => {
    expect(containsChinese('進擊')).toBe(true);
    expect(containsChinese('mixed 进击')).toBe(true);
    expect(containsChinese('鬼')).toBe(true);
  });

  it('CHC-031 returns false for non-CJK input', () => {
    expect(containsChinese('Cowboy Bebop')).toBe(false);
    expect(containsChinese('カウボーイ')).toBe(false); // katakana only
    expect(containsChinese('ひらがな')).toBe(false); // hiragana only
    expect(containsChinese('한글')).toBe(false); // hangul only
    expect(containsChinese('')).toBe(false);
    expect(containsChinese('12345')).toBe(false);
  });
});

describe('chinese-converter — expandSearchVariants', () => {
  it('CHC-040 returns both S and T variants for a Chinese query', () => {
    const variants = expandSearchVariants('工作细胞');
    expect(variants).toContain('工作细胞');
    expect(variants).toContain('工作細胞');
    expect(variants.length).toBe(2);
  });

  it('CHC-041 keeps the original query in slot 0 for cache stability', () => {
    expect(expandSearchVariants('工作细胞')[0]).toBe('工作细胞');
    expect(expandSearchVariants('工作細胞')[0]).toBe('工作細胞');
  });

  it('CHC-042 returns single-element array for non-CJK input', () => {
    expect(expandSearchVariants('Cowboy Bebop')).toEqual(['Cowboy Bebop']);
    expect(expandSearchVariants('')).toEqual(['']);
  });

  it('CHC-043 dedupes when conversion leaves the string unchanged', () => {
    // 冰菓 contains chars that have no S↔T variant. Should be a single entry.
    const variants = expandSearchVariants('冰菓');
    expect(variants).toEqual(['冰菓']);
  });

  it('CHC-044 includes Mainland phrase form when querying with Taiwan vocab', () => {
    // 軟體 ↔ 软件 is an OpenCC-known phrase pair.
    const variants = expandSearchVariants('軟體少女');
    expect(variants).toContain('軟體少女');
    expect(variants).toContain('软件少女');
  });
});
