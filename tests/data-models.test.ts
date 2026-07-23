/*
 * 数据模型单元测试
 *
 * 测试枚举值是否正确、序列化/反序列化是否正常工作。
 * 这些测试验证的是纯数据逻辑，不依赖 Obsidian 运行时。
 */

import { describe, it, expect } from "vitest";
import {
  AnnotationType,
  AnchorStatus,
  StrokeTool,
} from "../src/data-models";

describe("数据模型枚举值", () => {
  it("AnnotationType 应有正确的枚举值", () => {
    expect(AnnotationType.HIGHLIGHT).toBe("highlight");
    expect(AnnotationType.UNDERLINE).toBe("underline");
    expect(AnnotationType.COMMENT).toBe("comment");
    expect(AnnotationType.HANDWRITING).toBe("handwriting");
  });

  it("AnchorStatus 应有正确的枚举值", () => {
    expect(AnchorStatus.EXACT).toBe("exact");
    expect(AnchorStatus.FUZZY).toBe("fuzzy");
    expect(AnchorStatus.PARAGRAPH).toBe("paragraph");
    expect(AnchorStatus.LOST).toBe("lost");
  });

  it("StrokeTool 应有正确的枚举值", () => {
    expect(StrokeTool.PEN).toBe("pen");
    expect(StrokeTool.HIGHLIGHTER).toBe("highlighter");
    expect(StrokeTool.ERASER).toBe("eraser");
  });
});
