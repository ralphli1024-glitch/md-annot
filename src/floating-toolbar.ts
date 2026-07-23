/*
 * floating-toolbar.ts — 浮动工具栏（编辑模式 + 阅读模式）
 *
 * 三个按钮：
 *   高亮 — Lucide "brush" 图标，颜色取高亮色的加深版
 *   划线 — 波浪线 〰️，颜色取划线设置色
 *   批注 — Lucide "message-circle" 图标，颜色取批注高亮色的加深版
 *
 * 编辑模式使用 CodeMirror Editor API，
 * 阅读模式使用 DOM window.getSelection()，行为保持一致。
 */

import { App, Editor, MarkdownView, Modal, setIcon } from "obsidian";
import { AnnotationType } from "./data-models";
import { AnnotationManager } from "./annotation-manager";
import { t } from "./i18n";

// 将 hex 颜色加深指定比例，用于图标颜色（比背景色更深）
function darkenColor(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const dr = Math.max(0, Math.floor(r * (1 - amount)));
  const dg = Math.max(0, Math.floor(g * (1 - amount)));
  const db = Math.max(0, Math.floor(b * (1 - amount)));
  return `#${dr.toString(16).padStart(2, '0')}${dg.toString(16).padStart(2, '0')}${db.toString(16).padStart(2, '0')}`;
}

export class FloatingToolbar {
  private toolbarEl: HTMLElement | null = null;
  private lastEditor: Editor | null = null;

  constructor(
    private app: App,
    private annotationManager: AnnotationManager,
    private styleConfig?: {
      highlightColor?: string;
      underlineColor?: string;
      commentColor?: string;
    },
    private iconConfig?: {
      customHighlightIcon: string | null;
      highlightIconSize: number;
    },
    private applyColorGlobally: boolean = true
  ) {}

  /**
   * 更新颜色配置（设置页面修改后调用，使下次弹出的工具栏使用新颜色）
   */
  updateStyleConfig(config: {
    highlightColor?: string;
    underlineColor?: string;
    commentColor?: string;
  }): void {
    Object.assign(this.styleConfig!, config);
  }

  /**
   * 编辑模式：使用 CodeMirror Editor 的选中文字
   */
  showOnSelection(editor: Editor): void {
    this.hide();
    this.lastEditor = editor;

    const selection = editor.getSelection();
    if (!selection || selection.trim().length === 0) return;
    const isOverLimit = selection.length > 200;

    const cursorFrom = editor.getCursor("from");
    const cursorTo = editor.getCursor("to");
    const overlappingAnnotations = this.annotationManager.getAllAnnotations()
      .filter(a => {
        if (a.startLine === undefined || a.startCh === undefined) return false;
        const endCh = a.endCh ?? a.startCh + a.targetText.length;
        return a.startLine === cursorFrom.line
          && a.startCh < cursorTo.ch
          && endCh > cursorFrom.ch;
      });
    const highlightActive = overlappingAnnotations.some(a => a.type === AnnotationType.HIGHLIGHT);
    const underlineActive = overlappingAnnotations.some(a => a.type === AnnotationType.UNDERLINE);
    const commentActive = overlappingAnnotations.some(a => a.type === AnnotationType.COMMENT);
    const fromLine = editor.getLine(cursorFrom.line);
    const contextBefore = fromLine.substring(0, cursorFrom.ch);
    let contextAfter;
    if (cursorFrom.line !== cursorTo.line) {
      const toLine = editor.getLine(cursorTo.line);
      contextAfter = toLine.substring(cursorTo.ch);
    } else {
      contextAfter = fromLine.substring(cursorTo.ch);
    }

    const cm = (editor as any).cm as any;
    if (!cm) return;

    // 计算字符级 offset，传给 createAnnotation
    const anchorPos = cm.state.selection.main.from;
    const anchorEndPos = cm.state.selection.main.to;

    const coords = cm.coordsAtPos(anchorPos, false);
    if (!coords) return;

    this.toolbarEl = document.createElement("div");
    this.toolbarEl.className = "md-annot-toolbar";
    this.toolbarEl.style.cssText = `
      position: fixed;
      top: ${coords.top - 45}px;
      left: ${coords.left}px;
      z-index: 1000;
    `;

    // ── 高亮：brush 图标 ──
    const highlightColor = darkenColor(this.styleConfig?.highlightColor || "#90EE90", 0.4);
    this.addButton("brush", "highlight", t("toolbar.highlight"), true, () => {
      if (isOverLimit) return;
      this.removeOverlappingHLUL(cursorFrom.line, cursorFrom.ch, cursorTo.ch, cursorTo.line);
      const hlColorOpt = !this.applyColorGlobally && this.styleConfig?.highlightColor
        ? { color: this.styleConfig.highlightColor } : undefined;
      this.annotationManager.createAnnotation(
        AnnotationType.HIGHLIGHT, selection, contextBefore, contextAfter,
        { ...hlColorOpt, anchorPos, anchorEndPos }
      );
      this.hide();
      this.annotationManager.persist();
    }, highlightColor, this.iconConfig?.customHighlightIcon, this.iconConfig?.highlightIconSize,
      highlightActive);

    // ── 划线：波浪线 ──
    this.addButton("〰️", "underline", t("toolbar.underline"), false, () => {
      if (isOverLimit) return;
      this.removeOverlappingHLUL(cursorFrom.line, cursorFrom.ch, cursorTo.ch, cursorTo.line);
      const ulColorOpt = !this.applyColorGlobally && this.styleConfig?.underlineColor
        ? { color: this.styleConfig.underlineColor } : undefined;
      this.annotationManager.createAnnotation(
        AnnotationType.UNDERLINE, selection, contextBefore, contextAfter,
        { ...ulColorOpt, anchorPos, anchorEndPos }
      );
      this.hide();
      this.annotationManager.persist();
    }, this.styleConfig?.underlineColor || "#4169E1",
      null, undefined, underlineActive);

    // ── 批注：message-circle 图标 ──
    this.addButton("message-circle", "comment", t("toolbar.comment"), true, () => {
      if (isOverLimit) return;
      this.hide();
      const modal = new CommentModal(this.app,
        (comment) => {
          const cmntOpt: { commentText: string; color?: string } = { commentText: comment };
          if (!this.applyColorGlobally && this.styleConfig?.commentColor) {
            cmntOpt.color = this.styleConfig.commentColor;
          }
          this.annotationManager.createAnnotation(
            AnnotationType.COMMENT, selection, contextBefore, contextAfter,
            { ...cmntOpt, anchorPos, anchorEndPos }
          );
          this.annotationManager.persist();
        },
        () => {
          if (this.lastEditor) {
            this.showOnSelection(this.lastEditor);
          }
        }
      );
      modal.open();
    }, darkenColor(this.styleConfig?.commentColor || "#FFFFAA", 0.45),
      null, undefined, commentActive);

    document.body.appendChild(this.toolbarEl);
  }


  /**
   * 删除与指定位置重叠的高亮/划线批注（toggle 行为）
   */
  private removeOverlappingHLUL(startLine: number, startCh: number, toCh: number, endLine?: number): void {
    const overlapping = this.annotationManager.getAllAnnotations()
      .filter(a => {
        if (a.type !== AnnotationType.HIGHLIGHT && a.type !== AnnotationType.UNDERLINE) return false;
        // Use anchorPos-based overlap when available (supports multi-line)
        if (a.anchorPos !== undefined && a.anchorEndPos !== undefined) {
          // Calculate the selection's char offset range from line/ch
          // Approximate: skip for now as computing offset from line+ch requires doc content
          // Fall through to line-based check below
        }
        if (a.startLine === undefined || a.startCh === undefined) return false;
        const aEndLine = a.endLine ?? a.startLine;
        const aEndCh = a.endCh ?? a.startCh + a.targetText.length;
        // Two rectangles overlap if one starts before the other ends
        // Use lexicographic (line, ch) comparison
        const aStart = a.startLine * 1000000 + a.startCh;
        const aEnd = aEndLine * 1000000 + aEndCh;
        const selEndLine = endLine ?? startLine;
        const selStart = startLine * 1000000 + startCh;
        const selEnd = selEndLine * 1000000 + toCh;
        return aStart < selEnd && aEnd > selStart;
      });
    overlapping.forEach(a => this.annotationManager.deleteAnnotation(a.id));
  }

  private addButton(
    icon: string, type: string, label: string,
    useSetIcon: boolean, onClick: () => void,
    color?: string,
    customIcon?: string | null,
    iconSize?: number,
    active?: boolean
  ): void {
    const btn = document.createElement("button");
    btn.className = `md-annot-toolbar-btn md-annot-toolbar-${type}`;
    if (active) btn.classList.add("md-annot-toolbar-active");
    btn.title = label;
    btn.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });

    if (customIcon) {
      const img = btn.createEl("img", {
        attr: {
          src: customIcon,
          width: iconSize || 24,
          height: iconSize || 24,
        },
      });
      img.style.cssText = "display: block; pointer-events: none;";
    } else if (useSetIcon) {
      const iconEl = btn.createSpan({ cls: "md-annot-btn-icon" });
      setIcon(iconEl, icon);
    } else {
      btn.innerHTML = icon;
    }

    if (!useSetIcon && color) btn.style.color = color;
    if (color) btn.style.setProperty("--md-badge-color", color);

    this.toolbarEl!.appendChild(btn);
  }

  /**
   * 阅读模式：使用 DOM window.getSelection()
   */
  showOnReadingSelection(view: MarkdownView): void {
    this.hide();

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const selection = sel.toString().trim();
    if (!selection || selection.length === 0) return;
    const isOverLimit = selection.length > 200;

    // 在全文中定位选中文本（支持跨行），获取上下文
    const sourceContent = view.data;
    const selectionIdx = sourceContent.indexOf(selection);
    let foundLine = -1;
    let foundCh = -1;
    let contextBefore = "";
    let contextAfter = "";

    if (selectionIdx !== -1) {
      const preContent = sourceContent.substring(0, selectionIdx);
      const preLines = preContent.split("\n");
      foundLine = preLines.length - 1;
      foundCh = preLines[preLines.length - 1].length;
      contextBefore = preLines[preLines.length - 1];
      const postContent = sourceContent.substring(selectionIdx + selection.length);
      const postLines = postContent.split("\n");
      contextAfter = postLines[0];
    } else {
      // 精确全文匹配失败，逐行匹配跨行选中文本
      const selLines = selection.split("\n");
      const lines = sourceContent.split("\n");
      if (selLines.length > 1) {
        for (let i = 0; i < lines.length; i++) {
        const firstLineIdx = lines[i].indexOf(selLines[0]);
          if (firstLineIdx === -1) continue;
          let matched = true;
          for (let j = 1; j < selLines.length; j++) {
            if (i + j >= lines.length || lines[i + j].trim() !== selLines[j].trim()) {
              matched = false;
              break;
            }
          }
          if (matched) {
            foundLine = i;
            foundCh = firstLineIdx;
            contextBefore = lines[i].substring(0, firstLineIdx);
            const lastLineIdx = lines[i + selLines.length - 1].indexOf(selLines[selLines.length - 1]);
            if (lastLineIdx !== -1) {
              contextAfter = lines[i + selLines.length - 1].substring(lastLineIdx + selLines[selLines.length - 1].length);
            }
            break;
          }
        }
      }
    }

    // 检查该位置是否已有同类型批注（toggle 行为）
    const existingAnnotations = this.annotationManager.getAllAnnotations()
      .filter(a => a.targetText === selection
        && (a.startLine === foundLine || (a.anchorPos !== undefined && selectionIdx !== -1 && a.anchorPos === selectionIdx)));    const highlightActive = existingAnnotations.some(a => a.type === AnnotationType.HIGHLIGHT);
    const underlineActive = existingAnnotations.some(a => a.type === AnnotationType.UNDERLINE);
    const commentActive = existingAnnotations.some(a => a.type === AnnotationType.COMMENT);

    // 定位工具栏在选中文字上方
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    this.toolbarEl = document.createElement("div");
    this.toolbarEl.className = "md-annot-toolbar";
    this.toolbarEl.style.cssText = `
      position: fixed;
      top: ${rect.top - 45}px;
      left: ${rect.left}px;
      z-index: 1000;
    `;

    // ── 高亮 ──
    const highlightColor = darkenColor(this.styleConfig?.highlightColor || "#90EE90", 0.4);
    this.addButton("brush", "highlight", t("toolbar.highlight"), true, () => {
      if (isOverLimit || foundLine < 0) return;
      this.removeOverlappingHLUL(foundLine, foundCh, foundCh + selection.length, foundLine + (selection.split('\n').length - 1));
      this.annotationManager.createAnnotation(
        AnnotationType.HIGHLIGHT, selection, contextBefore, contextAfter,
        { ...(selectionIdx !== -1 ? { anchorPos: selectionIdx, anchorEndPos: selectionIdx + selection.length } : {}) }
      );
      this.hide();
      this.annotationManager.persist();
    }, highlightColor, this.iconConfig?.customHighlightIcon, this.iconConfig?.highlightIconSize,
      highlightActive);

    // ── 划线 ──
    this.addButton("\u3030\ufe0f", "underline", t("toolbar.underline"), false, () => {
      if (isOverLimit || foundLine < 0) return;
      this.removeOverlappingHLUL(foundLine, foundCh, foundCh + selection.length, foundLine + (selection.split('\n').length - 1));
      this.annotationManager.createAnnotation(
        AnnotationType.UNDERLINE, selection, contextBefore, contextAfter,
        { ...(selectionIdx !== -1 ? { anchorPos: selectionIdx, anchorEndPos: selectionIdx + selection.length } : {}) }
      );
      this.hide();
      this.annotationManager.persist();
    }, this.styleConfig?.underlineColor || "#4169E1",
      null, undefined, underlineActive);

    // ── 批注 ──
    this.addButton("message-circle", "comment", t("toolbar.comment"), true, () => {
      if (isOverLimit) return;
      this.hide();
      const modal = new CommentModal(this.app,
        (comment) => {
          this.annotationManager.createAnnotation(
            AnnotationType.COMMENT, selection, contextBefore, contextAfter,
          { commentText: comment, ...(selectionIdx !== -1 ? { anchorPos: selectionIdx, anchorEndPos: selectionIdx + selection.length } : {}) }
          );
          this.annotationManager.persist();
        },
        () => {
          // 阅读模式下不恢复工具栏
        }
      );
      modal.open();
    }, darkenColor(this.styleConfig?.commentColor || "#FFFFAA", 0.45),
      null, undefined, commentActive);

    document.body.appendChild(this.toolbarEl);
  }

  hide(): void {
    this.toolbarEl?.remove();
    this.toolbarEl = null;
  }

  handleClickOutside(e: MouseEvent): void {
    if (this.toolbarEl && !this.toolbarEl.contains(e.target as Node)) {
      this.hide();
    }
  }
}

/*
 * 批注输入弹窗
 */
class CommentModal extends Modal {
  private result = "";
  private confirmed = false;

  constructor(
    app: App,
    private onConfirm: (text: string) => void,
    private onCancel: () => void
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;

    this.modalEl.style.width = "320px";
    this.modalEl.style.maxWidth = "90vw";

    const input = contentEl.createEl("textarea", {
      attr: {
        rows: "4",
        style: "width: 100%; padding: 8px; border-radius: 6px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); box-sizing: border-box;",
      },
    });
    input.placeholder = t("toolbar.commentPlaceholder");
    input.focus();

    const btnRow = contentEl.createDiv({
      attr: { style: "display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px;" },
    });

    btnRow.createEl("button", {
      text: t("toolbar.cancel"),
      attr: {
        style: "padding: 6px 16px; border-radius: 6px; border: 1px solid var(--background-modifier-border); background: transparent; cursor: pointer;",
      },
    }).addEventListener("click", () => this.close());

    btnRow.createEl("button", {
      text: t("toolbar.confirm"),
      attr: {
        style: "padding: 6px 16px; border-radius: 6px; border: none; background: var(--interactive-accent); color: var(--text-on-accent); cursor: pointer;",
      },
    }).addEventListener("click", () => {
      this.result = input.value;
      this.confirmed = true;
      this.close();
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.result = input.value;
        this.confirmed = true;
        this.close();
      }
    });
  }

  onClose(): void {
    if (this.confirmed && this.result) {
      this.onConfirm(this.result);
    } else {
      this.onCancel();
    }
  }
}
