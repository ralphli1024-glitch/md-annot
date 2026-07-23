/*
 * cm6-decorations.ts — CodeMirror 6 装饰器
 *
 * 装饰类型：
 *   HIGHLIGHT → 背景色 + 结尾右上角深色小圆圈
 *   UNDERLINE → 蓝色波浪线（无尾标）
 *   COMMENT   → 淡黄色背景 + 结尾右上角深色小方块
 *
 * 锚定状态视觉：
 *   EXACT    → 正常渲染
 *   FUZZY    → 添加橙色虚线底纹
 *   PARAGRAPH → 行级橙色虚线框
 *   LOST     → 半透明 + 删除线 + 红色虚线框
 */

import { StateEffect, Range } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";
import { Annotation, AnchorStatus, AnnotationType } from "./data-models";

export const setAnnotationDecorations = StateEffect.define<DecorationSet>();

// ── 锚定状态 → CSS 类 ──
function statusCssClass(status: AnchorStatus): string {
  switch (status) {
    case AnchorStatus.FUZZY:      return "md-annot-status-fuzzy";
    case AnchorStatus.LOST:       return "md-annot-status-lost";
    default:                      return "";
  }
}

// ── 装饰工厂（带锚定状态）──

function highlightDecoration(color: string, status: AnchorStatus) {
  const statusCls = statusCssClass(status);
  return Decoration.mark({
    class: `md-annot-highlight${statusCls ? " " + statusCls : ""}`,
    attributes: {
      style: `background-color: ${color};`,
    },
  });
}

function underlineDecoration(color: string, status: AnchorStatus) {
  const statusCls = statusCssClass(status);
  return Decoration.mark({
    class: `md-annot-underline${statusCls ? " " + statusCls : ""}`,
    attributes: { style: `text-decoration: wavy underline ${color};` },
  });
}

function commentDecoration(color: string, status: AnchorStatus) {
  const statusCls = statusCssClass(status);
  return Decoration.mark({
    class: `md-annot-comment${statusCls ? " " + statusCls : ""}`,
    attributes: {
      style: `background-color: ${color};`,
    },
  });
}

// ── 批注列表 → DecorationSet ──
export function buildDecorations(
  view: EditorView,
  annotations: Annotation[],
  settings: {
    highlightColor?: string;
    underlineColor?: string;
    commentHighlightColor?: string;
    applyColorGlobally?: boolean;
    focusedAnnotationId?: string | null;
  } = {}
): DecorationSet {
  const decos: Range<Decoration>[] = [];
  const doc = view.state.doc;

  // 文档为空时跳过所有装饰，防止 stale anchorPos 引发 RangeError
  if (doc.length === 0) return Decoration.none;

  for (const anno of annotations) {
    // ── 优先用字符级 offset（CM6 增量位移后的精确位置）──
    let from: number;
    let to: number;
    let fromLineNo: number;

    if (anno.anchorPos !== undefined && anno.anchorEndPos !== undefined) {
      from = anno.anchorPos;
      to = anno.anchorEndPos;
      fromLineNo = doc.lineAt(from).number;
    } else if (anno.startLine !== undefined && anno.startCh !== undefined) {
      const fromLine = doc.line(anno.startLine + 1);
      from = fromLine.from + anno.startCh;
      fromLineNo = fromLine.number;
      const endLine = anno.endLine ?? anno.startLine;
      const endCh = anno.endCh ?? anno.startCh + anno.targetText.length;
      const toLine = doc.line(endLine + 1);
      to = toLine.from + endCh;
    } else {
      continue;
    }

    if (from >= to) continue;

    // ── 段落匹配 & 丢失：行级虚线框 ──
    if (anno.anchorStatus === AnchorStatus.PARAGRAPH) {
      const paraFromLine = doc.line(fromLineNo);
      const paraTo = doc.line(doc.lineAt(to).number);
      for (let lineNo = paraFromLine.number; lineNo <= paraTo.number; lineNo++) {
        const l = doc.line(lineNo);
        decos.push(
          Decoration.line({
            class: "md-annot-paragraph",
          }).range(l.from)
        );
      }
      continue;
    }

    if (anno.anchorStatus === AnchorStatus.LOST) {
      const lostFromLine = doc.line(fromLineNo);
      const lostTo = doc.line(doc.lineAt(to).number);
      for (let lineNo = lostFromLine.number; lineNo <= lostTo.number; lineNo++) {
        const l = doc.line(lineNo);
        decos.push(
          Decoration.line({
            class: "md-annot-status-lost",
          }).range(l.from)
        );
      }
      // 仍然渲染文本标记（半透明+删除线）
    }

    // ── 按类型渲染 ──
    switch (anno.type) {
      case AnnotationType.HIGHLIGHT:
        {
          const isFocused = settings.focusedAnnotationId === anno.id;
          const deco = highlightDecoration(
            settings.applyColorGlobally ? (settings.highlightColor || "#90EE90") : (anno.color || settings.highlightColor || "#90EE90"),
            anno.anchorStatus
          );
          if (isFocused) {
            decos.push(Decoration.mark({
              class: "md-annot-breathing",
              attributes: {}
            }).range(from, to));
          }
          decos.push(deco.range(from, to));
        }
        break;
        break;
      case AnnotationType.UNDERLINE:
        {
          const isFocused = settings.focusedAnnotationId === anno.id;
          const deco = underlineDecoration(
            settings.applyColorGlobally ? (settings.underlineColor || "#4169E1") : (anno.color || settings.underlineColor || "#4169E1"),
            anno.anchorStatus
          );
          if (isFocused) {
            decos.push(Decoration.mark({
              class: "md-annot-breathing",
              attributes: {}
            }).range(from, to));
          }
          decos.push(deco.range(from, to));
        }
        break;
        break;
      case AnnotationType.COMMENT:
        {
          const isFocused = settings.focusedAnnotationId === anno.id;
          const deco = commentDecoration(
            settings.applyColorGlobally ? (settings.commentHighlightColor || "#FFFFAA") : (anno.color || settings.commentHighlightColor || "#FFFFAA"),
            anno.anchorStatus
          );
          if (isFocused) {
            decos.push(Decoration.mark({
              class: "md-annot-breathing",
              attributes: {}
            }).range(from, to));
          }
          decos.push(deco.range(from, to));
        }
        break;
        decos.push(
          Decoration.line({ class: "md-annot-comment-line" }).range(doc.line(fromLineNo).from)
        );
        break;
    }
  }

  return Decoration.set(decos, true);
}

// ── ViewPlugin ──
export const annotationDecorationsPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet = Decoration.none;

    update(update: ViewUpdate) {
      for (const tr of update.transactions) {
        for (const effect of tr.effects) {
          if (effect.is(setAnnotationDecorations)) {
            this.decorations = effect.value;
          }
        }
      }
    }
  },
  { decorations: (v) => v.decorations }
);

// ── ChangeTracker ──
let globalChangeCallback: ((deltas: Array<{ from: number; to: number; insertLength: number }>) => void) | null = null;

export function setChangeCallback(
  cb: (deltas: Array<{ from: number; to: number; insertLength: number }>) => void
): void {
  globalChangeCallback = cb;
}

export function clearChangeCallback(): void {
  globalChangeCallback = null;
}

export const changeTrackerPlugin = ViewPlugin.fromClass(
  class {
    update(update: ViewUpdate) {
      for (const tr of update.transactions) {
        if (!tr.docChanged) continue;
        const deltas: Array<{ from: number; to: number; insertLength: number }> = [];
        tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
          deltas.push({ from: fromA, to: toA, insertLength: inserted.length });
        });
        if (deltas.length > 0) {
          globalChangeCallback?.(deltas);
        }
      }
    }
  }
);
