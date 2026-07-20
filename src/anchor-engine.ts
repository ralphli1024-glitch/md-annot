/*
 * anchor-engine.ts — 锚定引擎
 *
 * 核心问题：用户编辑 Markdown 后，批注对应的文本位置变了怎么办？
 *
 * 方案：不依赖行号，而是基于文本内容指纹来定位。
 *
 * 工作流程：
 *   1. 创建批注时，计算 targetText + contextBefore + contextAfter 的哈希（fingerprint）
 *   2. 每次打开文件/编辑内容时，重新对所有批注执行定位
 *   3. 定位精度逐步降级：精确匹配 → 模糊匹配 → 段落级 → 标记丢失
 *
 * 匹配策略详解：
 *   EXACT    — 找到完全相同的文本。只要 targetText 在文档中出现就认为是精确匹配，
 *              不依赖上下文校验（因为同一段长文本在文档中出现两次的概率很低）。
 *   FUZZY    — 文本有细微改动（typo/增删词），用 Levenshtein 距离找最接近的
 *   PARAGRAPH — 具体文字找不到了，但能通过关键词定位到段落
 *   LOST     — 原文已被删除，无法定位（保留原始内容供用户查阅）
 *
 * 哈希算法：FNV-1a
 *   为什么不用 SHA-256/MD5？
 *   因为 FNV-1a 是轻量级哈希，计算极快（O(n)），适合前端实时计算。
 *   我们不需要加密级别的防碰撞，只需要一个稳定的"内容指纹"。
 */

import { Annotation, AnchorStatus } from "./data-models";

// ────────── 匹配结果 ──────────
export interface AnchorMatchResult {
  status: AnchorStatus;
  startLine: number;
  startCh: number;
  endLine: number;
  endCh: number;
  score: number;  // 匹配置信度 0-1
}

// ────────── FNV-1a 哈希 ──────────
// 轻量非加密哈希，适合"内容指纹"场景
// 参考：https://en.wikipedia.org/wiki/Fowler–Noll–Vo_hash_function
export function fnv1aHash(str: string): string {
  let hash = 0x811c9dc5;  // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);  // FNV prime
    hash >>>= 0;  // 转成无符号 32 位整数
  }
  return hash.toString(36);  // base36 编码，比十进制短
}

// ────────── 内容指纹计算 ──────────
// 组合上下文的哈希值作为锚定指纹
// context 只取前后各 100 字符，避免文件过长导致哈希不稳定
export function computeFingerprint(
  targetText: string,
  contextBefore: string,
  contextAfter: string
): string {
  const content = `${contextBefore.slice(-100)}|||${targetText}|||${contextAfter.slice(0, 100)}`;
  return fnv1aHash(content);
}

// ────────── Levenshtein 距离 ──────────
// 编辑距离：将字符串 A 变成 B 需要的最少操作次数（插入/删除/替换）
// 用于模糊匹配阶段，衡量"这个位置是否可能是被修改过的批注文本"
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = [];

  // 初始化 DP 表
  for (let i = 0; i <= m; i++) dp[i] = [i];
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,     // 删除
        dp[i][j - 1] + 1,     // 插入
        dp[i - 1][j - 1] + cost  // 替换
      );
    }
  }

  return dp[m][n];
}

// ────────── Levenshtein 相似度 ──────────
// 将编辑距离归一化为 0-1 的相似度分数
// 1 = 完全相同，0 = 完全不同
// 使用滑动窗口让较长的字符串匹配较短的字符串，提高容错
export function levenshteinSimilarity(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  // 确保 b 是较短的那个
  if (b.length > a.length) [a, b] = [b, a];

  let bestScore = 0;
  // 滑动窗口匹配：在长字符串上滑动，找与短字符串最匹配的子串
  for (let i = 0; i <= a.length - b.length; i++) {
    const window = a.substring(i, i + b.length);
    const dist = levenshteinDistance(b, window);
    const score = 1 - dist / Math.max(b.length, 1);
    if (score > bestScore) bestScore = score;
  }

  return bestScore;
}

// ────────── 主入口：定位批注 ──────────
// 给定一条批注和文档内容，找到它在文档中的位置
// 返回 AnchorMatchResult，包含匹配状态和位置信息
export function findAnnotationPosition(
  annotation: Annotation,
  docContent: string
): AnchorMatchResult {
  const lines = docContent.split("\n");

  // 1. 尝试精确匹配
  //    只校验 targetText 是否出现在文档中。只要文本精确匹配就认为是 EXACT，
  //    不依赖上下文校验——因为同一段长文本在文档中重复出现的概率很低。
  //    如果出现多个匹配位置，选与 contextBefore 最接近的那个。
  const exact = tryExactMatch(annotation, lines);
  if (exact) return exact;

  // 2. 精确匹配失败 → 尝试模糊匹配
  const fuzzy = tryFuzzyMatch(annotation, lines);
  if (fuzzy && fuzzy.score > 0.7) return fuzzy;

  // 3. 模糊匹配也失败 → 尝试段落级匹配
  const para = tryParagraphMatch(annotation, lines);
  if (para) return para;

  // 4. 全部失败 → 标记为丢失
  return {
    status: AnchorStatus.LOST,
    startLine: 0,
    startCh: 0,
    endLine: 0,
    endCh: 0,
    score: 0,
  };
}

// ────────── 单行精确匹配 ──────────
// 在文档中逐行搜索 target 文本的精确出现
// 返回首个（或上下文最接近的）匹配位置
function trySingleLineExact(
  annotation: Annotation,
  lines: string[],
  target: string
): AnchorMatchResult | null {
  if (!target || lines.length === 0) return null;

  const matches: { line: number; ch: number }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const idx = lines[i].indexOf(target);
    if (idx !== -1) {
      matches.push({ line: i, ch: idx });
    }
  }

  if (matches.length === 0) return null;

  let bestMatch = matches[0];
  // 多个匹配时，用 contextBefore 消歧
  if (matches.length > 1 && annotation.contextBefore) {
    let bestScore = 0;
    const ctxSuffix = annotation.contextBefore.slice(-30);
    for (const m of matches) {
      const linePrefix = lines[m.line].substring(0, m.ch);
      const score = linePrefix.endsWith(ctxSuffix) ? 1 : 0;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = m;
      }
    }
  }

  return {
    status: AnchorStatus.EXACT,
    startLine: bestMatch.line,
    startCh: bestMatch.ch,
    endLine: bestMatch.line,
    endCh: bestMatch.ch + target.length,
    score: 1.0,
  };
}

// ────────── 精确匹配 ──────────
// 逐行查找完全匹配的文本
// 找到即返回 EXACT，不做上下文校验（上下文仅用于多匹配时的消歧）
function tryExactMatch(
  annotation: Annotation,
  lines: string[]
): AnchorMatchResult | null {
  const target = annotation.targetText;
  if (!target || lines.length === 0) return null;

  const targetLines = target.split("\n");

  // 单行 target → 原逻辑
  if (targetLines.length === 1) {
    return trySingleLineExact(annotation, lines, target);
  }

  // 多行 target → 跨行搜索
  // 在 lines 中找连续 targetLines.length 行，每行分别匹配 targetLines[i]
  const matches: { line: number; ch: number }[] = [];
  for (let i = 0; i <= lines.length - targetLines.length; i++) {
    let match = true;
    for (let j = 0; j < targetLines.length; j++) {
      const expectedLine = targetLines[j];
      // 首行用 indexOf 定位列，后续行精确匹配整行
      if (j === 0) {
        const idx = lines[i].indexOf(expectedLine);
        if (idx === -1) { match = false; break; }
      } else {
        if (lines[i + j].trim() !== expectedLine.trim()) { match = false; break; }
      }
    }
    if (match) {
      matches.push({ line: i, ch: lines[i].indexOf(targetLines[0]) });
    }
  }

  if (matches.length === 0) return null;

  let bestMatch = matches[0];
  if (matches.length > 1 && annotation.contextBefore) {
    let bestScore = 0;
    for (const m of matches) {
      const linePrefix = lines[m.line].substring(0, m.ch);
      const score = linePrefix.endsWith(annotation.contextBefore.slice(-30)) ? 1 : 0;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = m;
      }
    }
  }

  return {
    status: AnchorStatus.EXACT,
    startLine: bestMatch.line,
    startCh: bestMatch.ch,
    endLine: bestMatch.line,
    endCh: bestMatch.ch + target.length,
    score: 1.0,
  };
}

// ────────── 模糊匹配 ──────────
// 用 Levenshtein 距离在文档中找与 targetText 最相似的文本段
// 阈值：score > 0.7 被认为匹配成功
function tryFuzzyMatch(
  annotation: Annotation,
  lines: string[]
): AnchorMatchResult | null {
  const target = annotation.targetText;
  if (!target || target.length < 3) return null;

  let best: AnchorMatchResult | null = null;
  let bestScore = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // 在每一行上滑动窗口，窗口大小 = target 长度的 0.5 倍 ~ 1.5 倍
    const maxJ = Math.max(0, line.length - Math.floor(target.length * 0.5));

    for (let j = 0; j <= maxJ; j++) {
      const end = Math.min(j + Math.ceil(target.length * 1.5), line.length);
      const candidate = line.substring(j, end);
      if (candidate.length < 3) continue;

      const score = levenshteinSimilarity(target, candidate);
      if (score > bestScore && score > 0.7) {
        bestScore = score;
        best = {
          status: AnchorStatus.FUZZY,
          startLine: i,
          startCh: j,
          endLine: i,
          endCh: j + candidate.length,
          score,
        };
      }
    }
  }

  return best;
}

// ────────── 段落级匹配 ──────────
// 取 targetText 中第一个有意义的词（长度 > 2），在文档中找所在的段落
// 精确找到词所在的段落，返回段落范围
function tryParagraphMatch(
  annotation: Annotation,
  lines: string[]
): AnchorMatchResult | null {
  const target = annotation.targetText;
  if (!target || lines.length === 0) return null;

  // 取第一个长度 > 2 的词作为线索
  const firstWord = target.split(/\s+/).find((w) => w.length > 2);
  if (!firstWord) return null;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(firstWord)) {
      const paraStart = Math.max(0, i - 1);
      const paraEnd = Math.min(lines.length - 1, i + 1);
      return {
        status: AnchorStatus.PARAGRAPH,
        startLine: paraStart,
        startCh: 0,
        endLine: paraEnd,
        endCh: lines[paraEnd].length,
        score: 0.4,
      };
    }
  }

  return null;
}

// ────────── 行/列 → 字符偏移 ──────────
// 把行号（0-based）+ 列号（0-based）转成文档开头的字符级 offset
// 用于统一 CM6 的字符级定位和文本搜索的行列级定位
export function lineColToOffset(
  docContent: string,
  line: number,
  ch: number
): number {
  const lines = docContent.split("\n");
  let offset = 0;
  for (let i = 0; i < line; i++) {
    offset += lines[i].length + 1; // +1 for newline
  }
  return offset + ch;
}
