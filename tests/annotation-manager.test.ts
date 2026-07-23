/*
 * 增量位移核心逻辑测试
 *
 * 测试 applyDeltaChanges 在三种场景下的行为：
 *   1. 编辑在批注之前 → 整条批注平移
 *   2. 编辑在批注之后 → 无变化
 *   3. 编辑与批注重叠 → endPos 扩张/收缩
 *   4. contentHash 快速路径校验
 */

import { describe, it, expect, beforeEach } from "vitest";
import { AnnotationManager } from "../src/annotation-manager";
import {
  AnnotationType,
  AnchorStatus,
  Annotation,
} from "../src/data-models";

// 最小化 StorageService mock
const mockStorage = {
  getAllAnnotations: async () => [],
  saveAnnotations: async () => {},
} as any;

describe("AnnotationManager.applyDeltaChanges", () => {
  let manager: AnnotationManager;

  beforeEach(() => {
    manager = new AnnotationManager(mockStorage as any);
  });

  it("编辑在批注之前 → 整条批注平移", () => {
    // 文档: "AAAA[BBBB]CCCC"
    // 批注锚定位置 [4, 8) → "BBBB"
    manager.createAnnotation(
      AnnotationType.HIGHLIGHT, "BBBB", "AAAA", "CCCC",
      { anchorPos: 4, anchorEndPos: 8 }
    );

    // 在位置 2 插入 "XX" → 文档变成 "AAXXAABBBBCCCC"
    // 批注位置从 [4,8) 平移到 [6,10)
    manager.applyDeltaChanges([{ from: 2, to: 2, insertLength: 4 }]);

    const annos = manager.getAllAnnotations();
    expect(annos[0].anchorPos).toBe(8);
    expect(annos[0].anchorEndPos).toBe(12);
  });

  it("编辑在批注之后 → 无变化", () => {
    manager.createAnnotation(
      AnnotationType.HIGHLIGHT, "BBBB", "AAAA", "CCCC",
      { anchorPos: 4, anchorEndPos: 8 }
    );

    // 在位置 10 插入 "XX"（批注结束于 8，编辑在之后）
    // 批注位置不变
    manager.applyDeltaChanges([{ from: 10, to: 10, insertLength: 4 }]);

    const annos = manager.getAllAnnotations();
    expect(annos[0].anchorPos).toBe(4);
    expect(annos[0].anchorEndPos).toBe(8);
  });

  it("编辑与批注重叠 → endPos 扩展", () => {
    manager.createAnnotation(
      AnnotationType.HIGHLIGHT, "BBBB", "AAAA", "CCCC",
      { anchorPos: 4, anchorEndPos: 8 }
    );

    // 在位置 6（批注内部）插入 "XX" → 文档变成 "AAAA BBXXBB CCCC"
    // 批注从 [4,8) 扩展到 [4,10)
    manager.applyDeltaChanges([{ from: 6, to: 6, insertLength: 2 }]);

    const annos = manager.getAllAnnotations();
    expect(annos[0].anchorPos).toBe(4);
    expect(annos[0].anchorEndPos).toBe(10);
  });

  it("删除批注内部的文字 → endPos 收缩", () => {
    manager.createAnnotation(
      AnnotationType.HIGHLIGHT, "BBBB", "AAAA", "CCCC",
      { anchorPos: 4, anchorEndPos: 8 }
    );

    // 删除位置 5-7 的两个字符 → "BB" 变成 "B"
    // 批注从 [4,8) 收缩到 [4,6)
    manager.applyDeltaChanges([{ from: 5, to: 7, insertLength: 0 }]);

    const annos = manager.getAllAnnotations();
    expect(annos[0].anchorPos).toBe(4);
    expect(annos[0].anchorEndPos).toBe(6);
  });

  it("连续多次编辑应正确累加位移", () => {
    manager.createAnnotation(
      AnnotationType.HIGHLIGHT, "BBBB", "AAAA", "CCCC",
      { anchorPos: 4, anchorEndPos: 8 }
    );

    // 第一次：在位置 0 插入 "XX" → 批注平移至 [6,10)
    manager.applyDeltaChanges([{ from: 0, to: 0, insertLength: 2 }]);
    // 第二次：在位置 0 再插入 "YY" → 批注平移至 [8,12)
    manager.applyDeltaChanges([{ from: 0, to: 0, insertLength: 2 }]);
    // 第三次：在位置 10（批注内部）插入 "Z" → 批注扩展至 [8,13)
    manager.applyDeltaChanges([{ from: 10, to: 10, insertLength: 1 }]);

    const annos = manager.getAllAnnotations();
    expect(annos[0].anchorPos).toBe(8);
    expect(annos[0].anchorEndPos).toBe(13);
  });

  it("没有 anchorPos 的批注应被跳过", () => {
    // 创建一条旧格式批注（没有 anchorPos）
    const anno = manager.createAnnotation(
      AnnotationType.HIGHLIGHT, "BBBB", "AAAA", "CCCC"
    );
    // 手动去掉 anchorPos（模拟旧数据）
    manager.updateAnnotation(anno.id, { anchorPos: undefined, anchorEndPos: undefined });

    // 执行位移（应不报错）
    manager.applyDeltaChanges([{ from: 2, to: 2, insertLength: 4 }]);

    // 批注无位置，内容未受影响
    const annos = manager.getAllAnnotations();
    expect(annos[0].anchorPos).toBeUndefined();
  });

  it("多条批注同时位移", () => {
    // 文档: "AAAA[BBBB]CCCC[DDDD]EEEE"
    manager.createAnnotation(
      AnnotationType.HIGHLIGHT, "BBBB", "AAAA", "CCCC",
      { anchorPos: 4, anchorEndPos: 8 }
    );
    manager.createAnnotation(
      AnnotationType.UNDERLINE, "DDDD", "CCCC", "EEEE",
      { anchorPos: 12, anchorEndPos: 16 }
    );

    // 在位置 0 插入 "XX" → 两条批注都平移
    manager.applyDeltaChanges([{ from: 0, to: 0, insertLength: 2 }]);

    const annos = manager.getAllAnnotations();
    expect(annos[0].anchorPos).toBe(6);
    expect(annos[0].anchorEndPos).toBe(10);
    expect(annos[1].anchorPos).toBe(14);
    expect(annos[1].anchorEndPos).toBe(18);
  });
});

describe("AnnotationManager.createAnnotation - contentHash", () => {
  let manager: AnnotationManager;

  beforeEach(() => {
    manager = new AnnotationManager(mockStorage as any);
  });

  it("创建时自动计算 contentHash", () => {
    const anno = manager.createAnnotation(
      AnnotationType.HIGHLIGHT, "重要的文字", "前面", "后面",
      { anchorPos: 10, anchorEndPos: 16 }
    );
    expect(anno?.contentHash).toBeDefined();
    expect(anno?.contentHash).toBeTypeOf("string");
    expect(anno?.contentHash!.length).toBeGreaterThan(0);
  });

  it("不带 anchorPos 时 contentHash 为 undefined", () => {
    const anno = manager.createAnnotation(
      AnnotationType.HIGHLIGHT, "重要的文字", "前面", "后面"
    );
    expect(anno?.contentHash).toBeUndefined();
  });
});

describe("AnnotationManager.undo/redo", () => {
  let manager: AnnotationManager;

  beforeEach(() => {
    manager = new AnnotationManager(mockStorage as any);
  });

  it("undo 撤销创建批注", () => {
    manager.createAnnotation(
      AnnotationType.HIGHLIGHT, "target", "ctxBefore", "ctxAfter",
      { anchorPos: 0, anchorEndPos: 6 }
    );
    expect(manager.getAllAnnotations()).toHaveLength(1);

    manager.undo();
    expect(manager.getAllAnnotations()).toHaveLength(0);
  });

  it("undo 撤销删除批注", () => {
    manager.createAnnotation(
      AnnotationType.HIGHLIGHT, "target", "ctxBefore", "ctxAfter",
      { anchorPos: 0, anchorEndPos: 6 }
    );
    const anno = manager.getAllAnnotations()[0];
    manager.deleteAnnotation(anno.id);
    expect(manager.getAllAnnotations()).toHaveLength(0);

    manager.undo();
    expect(manager.getAllAnnotations()).toHaveLength(1);
    expect(manager.getAllAnnotations()[0].id).toBe(anno.id);
  });

  it("undo+redo 完整操作链", () => {
    manager.createAnnotation(
      AnnotationType.HIGHLIGHT, "first", "", "",
      { anchorPos: 0, anchorEndPos: 5 }
    );
    manager.createAnnotation(
      AnnotationType.UNDERLINE, "second", "", "",
      { anchorPos: 6, anchorEndPos: 12 }
    );
    expect(manager.getAllAnnotations()).toHaveLength(2);

    manager.undo();
    expect(manager.getAllAnnotations()).toHaveLength(1);
    expect(manager.getAllAnnotations()[0].type).toBe(AnnotationType.HIGHLIGHT);

    manager.undo();
    expect(manager.getAllAnnotations()).toHaveLength(0);

    manager.redo();
    expect(manager.getAllAnnotations()).toHaveLength(1);

    manager.redo();
    expect(manager.getAllAnnotations()).toHaveLength(2);
  });

  it("新操作清空 redo 栈", () => {
    manager.createAnnotation(
      AnnotationType.HIGHLIGHT, "first", "", "",
      { anchorPos: 0, anchorEndPos: 5 }
    );
    manager.undo();
    expect(manager.getAllAnnotations()).toHaveLength(0);

    manager.createAnnotation(
      AnnotationType.COMMENT, "new", "", "",
      { anchorPos: 0, anchorEndPos: 3 }
    );
    expect(manager.getAllAnnotations()).toHaveLength(1);

    manager.redo();
    expect(manager.getAllAnnotations()).toHaveLength(1);
  });

  it("空栈 undo/redo 不报错", () => {
    expect(() => manager.undo()).not.toThrow();
    expect(() => manager.redo()).not.toThrow();
  });
});
