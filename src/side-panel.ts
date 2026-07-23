/*
 * side-panel.ts — 右侧批注列表面板（ItemView）
 *
 * 渲染位置：
 *   Obsidian 的右侧边栏。通过 registerView 注册，用 Ribbon 图标切换。
 *
 * 注意：
 *   - 使用 this.contentEl 而非 this.containerEl 来添加内容
 *   - containerEl 是 ItemView 的外部包装（含标题栏区域）
 *   - contentEl 是内部内容区，我们的批注列表应渲染在这里
 */

import { App, ItemView, MarkdownView, Modal, Notice, WorkspaceLeaf, setIcon } from "obsidian";
import { Annotation, AnnotationType, AnchorStatus, MDAnnotSettings } from "./data-models";
<<<<<<< HEAD
=======
import { t } from "./i18n";
>>>>>>> in18
import { AnnotationManager } from "./annotation-manager";

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const VIEW_TYPE_SIDE_PANEL = "md-annot-side-panel";

export class SidePanelView extends ItemView {
  private annotationManager: AnnotationManager;
  private settings: MDAnnotSettings;
  private filterType: AnnotationType | "all" = "all";
  private sortMode: "position" | "type-asc" | "type-desc" = "position";

  constructor(leaf: WorkspaceLeaf, annotationManager: AnnotationManager, settings: MDAnnotSettings) {
    super(leaf);
    this.annotationManager = annotationManager;
    this.settings = settings;
  }

  getViewType(): string {
    return VIEW_TYPE_SIDE_PANEL;
  }

  getDisplayText(): string {
    return "MDAnnot 批注面板";
  }

  getIcon(): string {
    return "highlighter";
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.classList.add("md-annot-side-panel");

    this.annotationManager.on("annotation:created", () => this.render());
    this.annotationManager.on("annotation:deleted", () => this.render());
    this.annotationManager.on("annotation:updated", () => this.render());
    this.annotationManager.on("file:opened", () => this.render());
    this.annotationManager.on("annotations:reanchored", () => this.render());
    this.annotationManager.on("annotation:focus-changed", (id: string | null) => {
      // 移除所有卡片的焦点类
      this.contentEl.querySelectorAll(".md-annot-item-focused").forEach(el => {
        el.removeClass("md-annot-item-focused");
      });
      // 为当前焦点卡片添加呼吸类
      if (id) {
        const target = this.contentEl.querySelector(`.md-annot-panel-item[data-annot-id="${id}"]`);
        if (target) {
          target.addClass("md-annot-item-focused");
        }
      }
    });

    this.render();
  }

  private render(): void {
    this.contentEl.empty();

    const header = this.contentEl.createDiv({ cls: "md-annot-panel-header" });
<<<<<<< HEAD
    header.createEl("h3", { text: "批注列表" });
=======
    header.createEl("h3", { text: t("panel.title") });
>>>>>>> in18

    // 筛选 + 排序并排下拉框
    const controlsBar = this.contentEl.createDiv({ cls: "md-annot-controls-bar" });

    // 筛选下拉
    const filterSelect = controlsBar.createEl("select", { cls: "md-annot-controls-select" });
    const filterOptions: Array<{ value: AnnotationType | "all"; label: string }> = [
<<<<<<< HEAD
      { value: "all", label: "全部" },
      { value: AnnotationType.HIGHLIGHT, label: "高亮" },
      { value: AnnotationType.UNDERLINE, label: "划线" },
      { value: AnnotationType.COMMENT, label: "批注" },
=======
      { value: "all", label: t("panel.filterAll") },
      { value: AnnotationType.HIGHLIGHT, label: t("panel.filterHighlight") },
      { value: AnnotationType.UNDERLINE, label: t("panel.filterUnderline") },
      { value: AnnotationType.COMMENT, label: t("panel.filterComment") },
>>>>>>> in18
    ];
    for (const opt of filterOptions) {
      filterSelect.createEl("option", { value: opt.value, text: opt.label });
    }
    filterSelect.value = this.filterType;
    filterSelect.addEventListener("change", () => {
      this.filterType = filterSelect.value as AnnotationType | "all";
      this.render();
    });

    // 排序下拉
    const sortSelect = controlsBar.createEl("select", { cls: "md-annot-controls-select" });
    const sortOptions: Array<{ value: string; label: string }> = [
<<<<<<< HEAD
      { value: "position", label: "位置" },
      { value: "type-asc", label: "高亮在前" },
      { value: "type-desc", label: "批注在前" },
=======
      { value: "position", label: t("panel.sortPosition") },
      { value: "type-asc", label: t("panel.sortHighlightFirst") },
      { value: "type-desc", label: t("panel.sortCommentFirst") },
>>>>>>> in18
    ];
    for (const opt of sortOptions) {
      sortSelect.createEl("option", { value: opt.value, text: opt.label });
    }
    sortSelect.value = this.sortMode;
    sortSelect.addEventListener("change", () => {
      this.sortMode = sortSelect.value as "position" | "type-asc" | "type-desc";
      this.render();
    });

    const listEl = this.contentEl.createDiv({ cls: "md-annot-panel-list" });
    const annotations = this.getFilteredAnnotations();

    if (annotations.length === 0) {
      listEl.createEl("p", {
<<<<<<< HEAD
        text: "暂无批注",
=======
        text: t("panel.empty"),
>>>>>>> in18
        cls: "md-annot-panel-empty",
      });
      return;
    }

    for (const anno of annotations) {
      const item = listEl.createDiv({ cls: "md-annot-panel-item", attr: { "data-annot-id": anno.id } });
      item.style.backgroundColor = this.getTypeBgColor(anno.type);
      item.addEventListener("click", () => {
        this.scrollToAnnotation(anno);
      });

      const row1 = item.createDiv({ cls: "md-annot-item-row1" });

      const typeIcon = row1.createSpan({ cls: "md-annot-item-type-icon" });
      this.renderTypeIcon(typeIcon, anno.type);

      const statusBar = row1.createDiv({ cls: "md-annot-status-bar" });
      this.renderStatusBar(statusBar, anno.anchorStatus);

      const deleteBtn = row1.createEl("button", { cls: "md-annot-item-delete-btn" });
      deleteBtn.style.cssText = "width:15px;height:15px;margin-top:-2px;margin-right:2px;display:flex;align-items:center;justify-content:center;border:none;background:transparent;cursor:pointer;padding:0;";
      const iconEl = deleteBtn.createSpan();
      setIcon(iconEl, "trash");
      const svgEl = iconEl.querySelector('.svg-icon') || iconEl.querySelector('svg');
      if (svgEl) {
        (svgEl as HTMLElement).style.cssText = "width:8px;height:8px;";
      }
<<<<<<< HEAD
      deleteBtn.title = "删除";
=======
      deleteBtn.title = t("settings.deleteBtn");
>>>>>>> in18
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.annotationManager.deleteAnnotation(anno.id);
        this.annotationManager.persist();
      });

      const textEl = item.createDiv({ cls: "md-annot-item-text" });
      textEl.setText(
        anno.targetText.substring(0, 50) +
          (anno.targetText.length > 50 ? "..." : "")
      );

      if (anno.commentText) {
        const commentEl = item.createDiv({ cls: "md-annot-item-comment" });
        commentEl.setText(`💬 ${anno.commentText}`);
      }
    }

    // ── 导出批注按钮 ──
    const exportBtnContainer = this.contentEl.createDiv({ cls: "md-annot-panel-export" });
    const exportBtn = exportBtnContainer.createEl("button", {
      cls: "md-annot-panel-export-btn",
<<<<<<< HEAD
      text: "📥 导出批注",
=======
      text: t("panel.exportBtn"),
>>>>>>> in18
    });
    exportBtn.addEventListener("click", () => {
      this.exportCurrentAnnotations();
    });
  }

  private getTypeLucideIcon(type: AnnotationType): string {
    switch (type) {
      case AnnotationType.HIGHLIGHT:  return "brush";
      case AnnotationType.UNDERLINE:  return "underline";
      case AnnotationType.COMMENT:    return "message-circle";
      case AnnotationType.HANDWRITING: return "pen";
    }
  }

  /** 划线使用 emoji 〰️ 以匹配工具栏图标 */
  private renderTypeIcon(container: HTMLElement, type: AnnotationType): void {
    container.style.cssText = "margin-left:-5px;margin-top:-15px;";
    if (type === AnnotationType.UNDERLINE) {
      container.setText("〰️");
      container.style.fontSize = "8px";
    } else {
      setIcon(container, this.getTypeLucideIcon(type));
      const svgEl = container.querySelector('.svg-icon') || container.querySelector('svg');
      if (svgEl) {
        (svgEl as HTMLElement).style.cssText = "width:8px;height:8px;";
      }
    }
  }

  private getTypeBgColor(type: AnnotationType): string {
    const hex = this.getTypeConfigColor(type);
    if (!hex) return "transparent";
    return hexToRgba(hex, 0.25);
  }

  private getTypeConfigColor(type: AnnotationType): string {
    switch (type) {
      case AnnotationType.HIGHLIGHT:  return this.settings.highlightColor;
      case AnnotationType.UNDERLINE:  return this.settings.underlineColor;
      case AnnotationType.COMMENT:    return this.settings.commentHighlightColor;
      default:                        return "";
    }
  }

  private getFilteredAnnotations(): Annotation[] {
    let all = this.annotationManager.getAllAnnotations();
    if (this.filterType !== "all") {
      all = all.filter((a) => a.type === this.filterType);
    }
    return this.sortAnnotations(all);
  }

  private sortAnnotations(annotations: Annotation[]): Annotation[] {
    const sorted = [...annotations];
    
    switch (this.sortMode) {
      case "position":
        sorted.sort((a, b) => {
          const posA = a.anchorPos ?? (a.startLine !== undefined ? a.startLine * 1000 + (a.startCh || 0) : 0);
          const posB = b.anchorPos ?? (b.startLine !== undefined ? b.startLine * 1000 + (b.startCh || 0) : 0);
          return posA - posB;
        });
        break;
      case "type-asc":
        sorted.sort((a, b) => this.getTypeOrder(a.type) - this.getTypeOrder(b.type));
        break;
      case "type-desc":
        sorted.sort((a, b) => this.getTypeOrder(b.type) - this.getTypeOrder(a.type));
        break;
    }
    
    return sorted;
  }

  private getTypeOrder(type: AnnotationType): number {
    switch (type) {
      case AnnotationType.HIGHLIGHT:  return 1;
      case AnnotationType.UNDERLINE:  return 2;
      case AnnotationType.COMMENT:    return 3;
      default:                        return 4;
    }
  }

  refresh(): void {
    this.render();
  }

  private renderStatusBar(container: HTMLElement, status: AnchorStatus): void {
    const gradients: Record<string, string[]> = {
      exact: [
        '#28a745','#28a745','#28a745','#28a745','#28a745',
        '#28a745','#28a745','#28a745','#28a745','#28a745'
      ],
      fuzzy: [
        '#28a745','#28a745','#28a745','#28a745','#28a745','#28a745',
        '#8BC34A','#FFEB3B','#FF9800','#F44336'
      ],
      paragraph: [
        '#28a745','#28a745','#28a745',
        '#8BC34A','#FFEB3B',
        '#FF9800','#FF9800',
        '#F44336','#F44336','#F44336'
      ],
      lost: [
        '#FFEB3B','#FFEB3B','#FFEB3B',
        '#FF9800','#FF9800',
        '#F44336','#F44336','#F44336','#F44336','#F44336'
      ],
    };
    const colors = gradients[status] || gradients.exact;
    for (const color of colors) {
      const block = container.createDiv({ cls: "md-annot-status-block" });
      block.style.backgroundColor = color;
    }
  }

  private scrollToAnnotation(anno: Annotation): void {
    // 使用 getLeavesOfType 而非 getActiveViewOfType，
    // 因为点击侧面板时侧面板 leaf 成为 active leaf
    const leaves = this.app.workspace.getLeavesOfType("markdown");
    if (leaves.length === 0) return;
    const view = leaves[0].view as MarkdownView;
    if (!view) return;

    // 阅读模式：滚动预览 DOM 到批注位置
    if (view.getMode() === "preview") {
      // 先触发呼吸动画（rerenderReadingAnnotations 会添加 md-annot-reading-breathing）
      this.annotationManager.setFocusAnnotation(anno.id);
      // 等待 DOM 更新后滚动到呼吸元素
      requestAnimationFrame(() => {
        const previewEl = (view as any).previewMode?.containerEl as HTMLElement | undefined;
        if (!previewEl) return;
        const breathing = previewEl.querySelector(".md-annot-reading-breathing") as HTMLElement | null;
        if (breathing) {
          breathing.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      });
      return;
    }

    // 编辑模式：通过 editor API 滚动
    if (!view.editor) return;

    // 计算定位位置
    let line: number;
    let ch: number;

    if (anno.anchorStatus === AnchorStatus.LOST) {
      // 丢失状态：用 anchorPos 估算最近位置
      if (anno.anchorPos !== undefined && anno.anchorPos > 0) {
        const content = view.data;
        const preContent = content.slice(0, anno.anchorPos);
        const lines = preContent.split("\n");
        line = Math.max(0, lines.length - 1);
        ch = 0;
      } else {
        line = 0;
        ch = 0;
      }
    } else if (anno.endLine !== undefined) {
      line = anno.endLine;
      ch = anno.endCh ?? 0;
    } else if (anno.startLine !== undefined) {
      line = anno.startLine;
      ch = (anno.startCh ?? 0) + (anno.targetText.length > 10 ? 10 : anno.targetText.length);
    } else {
      line = 0;
      ch = 0;
    }

    // 滚动定位并设置光标
    const pos = { line, ch };
    view.editor.setCursor(pos);
    view.editor.scrollIntoView({ from: pos, to: pos }, true);

    // 触发呼吸动画
    this.annotationManager.setFocusAnnotation(anno.id);
  }

  private async exportCurrentAnnotations(): Promise<void> {
    const filePath = this.annotationManager.getCurrentFilePath();
    if (!filePath) {
<<<<<<< HEAD
      new Notice("MDAnnot: 当前没有打开的文件");
=======
      new Notice(t('panel.noFileOpen'));
>>>>>>> in18
      return;
    }

    const allAnnotations = this.annotationManager.getAllAnnotations();
    const annotations = allAnnotations.filter(
      (a) => a.type !== AnnotationType.HANDWRITING
    );

    if (annotations.length === 0) {
<<<<<<< HEAD
      new Notice("MDAnnot: 当前文档没有批注");
=======
      new Notice(t('panel.noAnnotations'));
>>>>>>> in18
      return;
    }

    const mdContent = this.generateExportMarkdown(annotations, filePath);

    // 生成带时间戳的文件名
    const now = new Date();
    const ts = String(now.getFullYear()).slice(2)
      + String(now.getMonth() + 1).padStart(2, "0")
      + String(now.getDate()).padStart(2, "0")
      + String(now.getHours()).padStart(2, "0")
      + String(now.getMinutes()).padStart(2, "0")
      + String(now.getSeconds()).padStart(2, "0");
    const exportPath = filePath.replace(/\.md$/i, `_${ts}_批注.md`);

    // 检查是否已存在
    const exists = await this.app.vault.adapter.exists(exportPath);
    if (exists) {
      const confirmed = await new Promise<boolean>((res) => {
        new OverwriteConfirmModal(this.app, exportPath, res).open();
      });
      if (!confirmed) return;
    }

    try {
      await this.app.vault.adapter.write(exportPath, mdContent);
<<<<<<< HEAD
      new Notice(`MDAnnot: 已导出批注到 ${exportPath}`);
    } catch (e) {
      console.error("MDAnnot: 导出批注失败", e);
      new Notice("MDAnnot: 导出批注失败");
=======
      new Notice(`${t('panel.exported')} ${exportPath}`);
    } catch (e) {
      console.error("MDAnnot: 导出批注失败", e);
      new Notice(t('panel.exportFail'));
>>>>>>> in18
    }
  }

  private generateExportMarkdown(
    annotations: Annotation[],
    filePath: string
  ): string {
    let md = "> \u6807\u7b7e #\u6279\u6ce8\n\n";

    const highlights = annotations.filter(
      (a) => a.type === AnnotationType.HIGHLIGHT
    );
    const underlines = annotations.filter(
      (a) => a.type === AnnotationType.UNDERLINE
    );
    const comments = annotations.filter(
      (a) => a.type === AnnotationType.COMMENT
    );

    if (highlights.length > 0) {
<<<<<<< HEAD
      md += `# 高亮\n`;
=======
      md += `${t("exportTemplate.highlights")}\n`;
>>>>>>> in18
      highlights.forEach((a) => {
        md += `- ${a.targetText}\n`;
      });
      md += "\n";
    }

    if (underlines.length > 0) {
<<<<<<< HEAD
      md += `# 划线\n`;
=======
      md += `${t("exportTemplate.underlines")}\n`;
>>>>>>> in18
      underlines.forEach((a) => {
        md += `- ${a.targetText}\n`;
      });
      md += "\n";
    }

    if (comments.length > 0) {
<<<<<<< HEAD
      md += `# 批注\n`;
=======
      md += `${t("exportTemplate.comments")}\n`;
>>>>>>> in18
      comments.forEach((a) => {
        md += `- ${a.targetText}\n`;
        if (a.commentText) {
          md += `  - ${a.commentText}\n`;
        }
      });
      md += "\n";
    }

    // 追加源文档链接
    const srcName = filePath.replace(/\.md$/i, '');
    md += `# 源文档\n[[${srcName}]]\n`;

    return md;
  }


/** 覆盖确认弹窗 */
}

/** 覆盖确认弹窗 */
class OverwriteConfirmModal extends Modal {
  constructor(
    app: App,
    private path: string,
    private resolve: (v: boolean) => void
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    this.modalEl.style.width = "400px";
    this.modalEl.style.maxWidth = "90vw";

<<<<<<< HEAD
    contentEl.createEl("h3", { text: "文件已存在" });
    contentEl.createEl("p", {
      text: `"${this.path}" 已存在，是否覆盖？`,
=======
    contentEl.createEl("h3", { text: t("panel.fileExists") });
    contentEl.createEl("p", {
      text: `"${this.path}" ${t("panel.fileExistsDesc")}`,
>>>>>>> in18
      attr: { style: "color: var(--text-muted); word-break: break-all;" },
    });

    const row = contentEl.createDiv({
      attr: { style: "display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px;" },
    });

    row.createEl("button", {
<<<<<<< HEAD
      text: "取消",
=======
      text: t("panel.cancel"),
>>>>>>> in18
      attr: {
        style: "padding: 6px 16px; border-radius: 6px; border: 1px solid var(--background-modifier-border); background: transparent; cursor: pointer;",
      },
    }).addEventListener("click", () => {
      this.resolve(false);
      this.close();
    });

    row.createEl("button", {
<<<<<<< HEAD
      text: "覆盖",
=======
      text: t("panel.overwrite"),
>>>>>>> in18
      attr: {
        style: "padding: 6px 16px; border-radius: 6px; border: none; background: var(--interactive-accent); color: var(--text-on-accent); cursor: pointer;",
      },
    }).addEventListener("click", () => {
      this.resolve(true);
      this.close();
    });
  }
}
