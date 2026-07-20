/*
 * 锚定引擎单元测试
 *
 * 测试内容：
 *   1. FNV 哈希的确定性和差异性
 *   2. Levenshtein 相似度计算的准确性
 *   3. 精确匹配、模糊匹配、段落匹配、丢失四种场景
 */

import { describe, it, expect } from "vitest";
import {
  computeFingerprint,
  fnv1aHash,
  levenshteinSimilarity,
  findAnnotationPosition,
} from "../src/anchor-engine";
import { Annotation, AnnotationType, AnchorStatus } from "../src/data-models";

describe("fnv1aHash", () => {
  it("相同输入应产生相同哈希", () => {
    const h1 = fnv1aHash("hello world");
    const h2 = fnv1aHash("hello world");
    expect(h1).toBe(h2);
  });

  it("不同输入应产生不同哈希", () => {
    const h1 = fnv1aHash("hello");
    const h2 = fnv1aHash("world");
    expect(h1).not.toBe(h2);
  });

  it("返回类型应为字符串", () => {
    const h = fnv1aHash("test");
    expect(typeof h).toBe("string");
    expect(h.length).toBeGreaterThan(0);
  });
});

describe("computeFingerprint", () => {
  it("应从上下文 + 目标文本产生哈希", () => {
    const fp = computeFingerprint("target", "before", "after");
    expect(fp).toBeTruthy();
    expect(typeof fp).toBe("string");
  });

  it("相同输入应产生相同指纹", () => {
    const fp1 = computeFingerprint("same", "ctx", "aft");
    const fp2 = computeFingerprint("same", "ctx", "aft");
    expect(fp1).toBe(fp2);
  });
});

describe("levenshteinSimilarity", () => {
  it("相同字符串相似度应为 1", () => {
    expect(levenshteinSimilarity("abc", "abc")).toBe(1);
  });

  it("相近字符串相似度应 > 0.9", () => {
    const score = levenshteinSimilarity("hello world", "hello world!");
    expect(score).toBeGreaterThan(0.9);
  });

  it("空字符串相似度应为 1", () => {
    expect(levenshteinSimilarity("", "")).toBe(1);
  });

  it("完全不同的字符串相似度应为 0", () => {
    expect(levenshteinSimilarity("abc", "")).toBe(0);
  });
});

describe("findAnnotationPosition", () => {
  const docContent = [
    "# Title",
    "This is a paragraph with some text.",
    "Another line here.",
    "Yet another paragraph with important content.",
    "Final line.",
  ].join("\n");

  const exactAnnotation: Annotation = {
    id: "test1",
    type: AnnotationType.HIGHLIGHT,
    targetText: "paragraph with some text",
    contextBefore: "This is a ",
    contextAfter: ".",
    fingerprint: "",
    anchorStatus: AnchorStatus.LOST,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  it("应找到精确匹配", () => {
    const result = findAnnotationPosition(exactAnnotation, docContent);
    expect(result.status).toBe(AnchorStatus.EXACT);
    expect(result.score).toBe(1);
  });

  it("文本轻微变化应走模糊匹配", () => {
    const fuzzyAnno: Annotation = {
      ...exactAnnotation,
      targetText: "paragraph with sme text", // 故意拼错
      contextBefore: "",
      contextAfter: "",
    };
    const result = findAnnotationPosition(fuzzyAnno, docContent);
    expect(result.status).toBe(AnchorStatus.FUZZY);
    expect(result.score).toBeGreaterThan(0.7);
  });

  it("找不到时返回段落级匹配", () => {
    // 使用一个在文档中完全不存在的文本，但包含关键词 "important"
    const paraAnno: Annotation = {
      id: "test2",
      type: AnnotationType.HIGHLIGHT,
      targetText: "important nuance that was omitted",
      contextBefore: "",
      contextAfter: "",
      fingerprint: "",
      anchorStatus: AnchorStatus.LOST,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const result = findAnnotationPosition(paraAnno, docContent);
    expect(result.status).toBe(AnchorStatus.PARAGRAPH);
  });

  it("空文档应返回丢失", () => {
    const result = findAnnotationPosition(exactAnnotation, "");
    expect(result.status).toBe(AnchorStatus.LOST);
  });
});
