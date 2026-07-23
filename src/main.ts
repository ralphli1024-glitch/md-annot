/*
 * main.ts — MDAnnot 插件主入口
 */

import { App, Plugin, MarkdownView, WorkspaceLeaf } from "obsidian";
import { AnnotationManager } from "./annotation-manager";
import { StorageService } from "./storage";
import { FloatingToolbar } from "./floating-toolbar";
import { SidePanelView, VIEW_TYPE_SIDE_PANEL } from "./side-panel";
import { CanvasOverlay, CanvasOverlayConfig } from "./canvas-overlay";
import { AnnotationType, StrokeTool, AnchorStatus } from "./data-models";
import { MDAnnotSettingTab } from "./settings-tab";
import { Annotation, MDAnnotSettings, DEFAULT_SETTINGS } from "./data-models";
import { t, setLanguage } from "./i18n";
import {
  annotationDecorationsPlugin,
  changeTrackerPlugin,
  setAnnotationDecorations,
  setChangeCallback,
  clearChangeCallback,
  buildDecorations,
} from "./cm6-decorations";
import { EditorView, Decoration } from "@codemirror/view";

export default class MDAnnotPlugin extends Plugin {
  settings: MDAnnotSettings = DEFAULT_SETTINGS;

  storage: StorageService;
  annotationManager: AnnotationManager;
  floatingToolbar: FloatingToolbar;
  sidePanelView: SidePanelView | null = null;
  canvasOverlay: CanvasOverlay | null = null;

  /** 当前打开的文档内容（用于阅读模式保留段落间距） */
  currentDocContent: string = "";

  private isMouseDown: boolean = false;
  private ribbonIconEl: HTMLElement | null = null;
  highlightIconDataUri: string | null = null;
  private iconConfig = { customHighlightIcon: null as string | null, highlightIconSize: 24 };

  async onload() {
    await this.loadSettings();
    setLanguage(this.settings.language);
    await this.loadHighlightIcon();

    this.storage = new StorageService(this.app.vault);
    this.annotationManager = new AnnotationManager(this.storage);
    this.floatingToolbar = new FloatingToolbar(this.app, this.annotationManager, {
      highlightColor: this.settings.highlightColor,
      underlineColor: this.settings.underlineColor,
      commentColor: this.settings.commentHighlightColor,
    }, this.iconConfig, this.settings.applyColorGlobally);
    this.registerEditorExtension(annotationDecorationsPlugin);
    this.registerEditorExtension(changeTrackerPlugin);

    // 阅读模式批注渲染 — 高亮/划线/批注效果
    this.registerMarkdownPostProcessor((el, ctx) => {
      try {
        const curPath = this.annotationManager.getCurrentFilePath();
        if (ctx.sourcePath !== curPath) {
          return;
        }
        const annotations = this.annotationManager.getAllAnnotations()
          .filter(a => a.anchorStatus !== AnchorStatus.LOST && a.type !== AnnotationType.HANDWRITING);
        if (annotations.length === 0) return;
        for (const anno of annotations) {
          this.applySingleAnnotation(el, anno);
        }
      } catch (e) {
        console.error("MDAnnot: reading mode render error", e);
      }
      // 保留源码中的多空行间距
      this.preserveParagraphSpacing(el, ctx);
    });

    // 注册侧面板视图
    this.registerView(VIEW_TYPE_SIDE_PANEL, (leaf: WorkspaceLeaf) => {
      this.sidePanelView = new SidePanelView(leaf, this.annotationManager, this.settings);
      return this.sidePanelView;
    });

    // Ribbon 图标
    if (this.settings.showInEditor) {
      this.initRibbonIcon();
    }

    // 命令
    this.addCommand({
      id: "toggle-annot-panel",
      name: t('command.togglePanel'),
      hotkeys: [{ modifiers: ["Mod", "Shift"], key: "A" }],
      callback: () => this.toggleSidePanel(),
    });

    // 设置面板
    this.addSettingTab(new MDAnnotSettingTab(this.app, this));

    // ── 事件监听 ──

    // 文档切换
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () =>
        this.onActiveLeafChange()
      )
    );

    // 布局变化（编辑⇄阅读切换）：刷新阅读模式批注渲染
    this.registerEvent(
      this.app.workspace.on("layout-change", () => {
        this.rerenderReadingAnnotations();
        // 切回编辑模式时恢复 CM6 装饰
        const curView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (curView && curView.getMode() === "source") {
          this.updateCM6Decorations(curView);
        }
      })
    );

    // 文件重命名/移动：同步迁移批注数据文件
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        this.storage.updatePath(oldPath, file.path);
      })
    );

    // 选中文字变化：只在无选中时隐藏工具栏，选中时由 mouseup 触发
    this.registerDomEvent(document, "selectionchange", () => {
      this.onSelectionChange();
    });

    // 鼠标松开时：检测选中文字并显示工具栏
    this.registerDomEvent(document, "mouseup", (e: MouseEvent) => {
      this.onEditorMouseUp(e);
    });

    // 鼠标按下时：标记拖选状态 + 隐藏工具栏（如果点击在工具栏外部）
    this.registerDomEvent(document, "mousedown", (e: MouseEvent) => {
      this.isMouseDown = true;
      this.floatingToolbar.handleClickOutside(e);
    });

    // 批注事件 → 更新编辑器装饰 + 阅读模式渲染
    this.annotationManager.on("annotation:created", () => {
      const v = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (v) this.updateCM6Decorations(v);
      this.rerenderReadingAnnotations();
    });
    this.annotationManager.on("annotation:deleted", () => {
      const v = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (v) this.updateCM6Decorations(v);
      this.rerenderReadingAnnotations();
    });
    this.annotationManager.on("annotation:updated", () => {
      this.rerenderReadingAnnotations();
    });

    // 定位呼吸动画
    this.annotationManager.on("annotation:focus-changed", (id: string | null) => {
      const leaves = this.app.workspace.getLeavesOfType("markdown");
      const markdownView = leaves.length > 0 ? leaves[0].view as MarkdownView : null;
      if (markdownView) {
        this.updateCM6Decorations(markdownView);
      }
      this.rerenderReadingAnnotations(markdownView ?? undefined);
      if (id) {
        // 2.5s 后自动清除呼吸动画
        setTimeout(() => {
          if (this.annotationManager.getFocusedAnnotationId() === id) {
            this.annotationManager.clearFocusAnnotation();
          }
        }, 2500);
      }
    });

    // CM6 ChangeTracker → 增量位移批注位置
    // 替代每次编辑都走全文文本搜索
    setChangeCallback((deltas) => {
      this.annotationManager.applyDeltaChanges(deltas);
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!view) return;

      const docContent = view.data;
      const affectedIds = this.annotationManager.getLastAffectedIds();

      if (affectedIds.size > 0) {
        // 增量重锚：只处理文本范围被编辑的批注，避免全文扫描
        this.annotationManager.reanchorAffected(docContent, affectedIds);

      }

      // 无论是否影响批注，都需要更新装饰（位置已位移）
      this.updateCM6Decorations(view);
      this.currentDocContent = docContent;
    });

    console.log("MDAnnot: loaded");

    // Undo/Redo 快捷键（macOS: Cmd+Z, Windows: Ctrl+Z）
    this.registerDomEvent(document, "keydown", (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod || e.key !== "z") return;

      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!activeView || !this.annotationManager.getCurrentFilePath()) return;

      const cm = (activeView.editor as any)?.cm as any;
      if (cm && cm.hasFocus && activeView.getMode() === "source") return;

      if (activeView.getMode() === "preview" && !e.shiftKey && this.canvasOverlay) {
        const strokes = this.canvasOverlay.getStrokes();
        if (strokes.length > 0) {
          e.preventDefault();
          this.canvasOverlay.undoLastStroke();
          const filePath = this.annotationManager.getCurrentFilePath();
          const annotations = this.annotationManager.getAllAnnotations();
          setTimeout(() => {
            this.storage.saveAnnotations(filePath, annotations, {
              strokes: this.canvasOverlay!.getStrokes(),
              width: 0, height: 0,
            });
          }, 100);
          return;
        }
      }

      if (!e.shiftKey) {
        e.preventDefault();
        this.annotationManager.undo();
      } else {
        e.preventDefault();
        this.annotationManager.redo();
      }

      this.annotationManager.persist();
      this.updateCM6Decorations(activeView);
    });
  }

  async onunload() {
    await this.annotationManager.persist();
    clearChangeCallback();
    this.canvasOverlay?.destroy();
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_SIDE_PANEL);
    console.log("MDAnnot: unloaded");
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    await this.loadHighlightIcon();
    this.floatingToolbar.updateStyleConfig({
      highlightColor: this.settings.highlightColor,
      underlineColor: this.settings.underlineColor,
      commentColor: this.settings.commentHighlightColor,
    });

    // 批注开关：控制所有渲染（Ribbon 图标、侧面板、浮动工具栏、CM6 装饰、阅读模式批注）
    if (!this.settings.showInEditor) {
      // 关闭时：移除所有渲染
      this.ribbonIconEl?.remove();
      this.ribbonIconEl = null;
      this.app.workspace.detachLeavesOfType(VIEW_TYPE_SIDE_PANEL);
      this.floatingToolbar.hide();
      // 清除阅读模式批注渲染
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (view && view.getMode() === "preview") {
        const previewEl = (view as any).previewMode?.containerEl as HTMLElement | undefined;
        if (previewEl) {
          const selectors = ['.md-annot-reading-highlight', '.md-annot-reading-underline', '.md-annot-reading-comment'];
          for (const sel of selectors) {
            previewEl.querySelectorAll(sel).forEach(el => {
              const text = el.textContent || '';
              el.replaceWith(document.createTextNode(text));
            });
          }
        }
      }
      // 清除 CM6 装饰
      if (view) {
        this.updateCM6Decorations(view);
      }
    } else {
      // 开启时：恢复所有渲染
      if (!this.ribbonIconEl || !document.body.contains(this.ribbonIconEl)) {
        this.initRibbonIcon();
      }
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (view) {
        this.updateCM6Decorations(view);
        this.rerenderReadingAnnotations();
      }
    }
  }

  // ── Ribbon 图标 ──

  private initRibbonIcon(): void {
    this.ribbonIconEl = this.addRibbonIcon("highlighter", "MDAnnot 批注面板", () => {
      this.toggleSidePanel();
    });
    // 如果未启用，则初始化后立即隐藏
    if (!this.settings.showInEditor) {
      this.ribbonIconEl.remove();
      this.ribbonIconEl = null;
    }
  }

  // ── 加载自定义高亮图标 ──

  async loadHighlightIcon(): Promise<void> {
    this.iconConfig.highlightIconSize = this.settings.highlightIconSize;
    const path = this.settings.highlightIconPath;
    if (!path) {
      this.highlightIconDataUri = null;
      this.iconConfig.customHighlightIcon = null;
      return;
    }

    try {
      const arrayBuffer = await this.app.vault.adapter.readBinary(path);
      const ext = path.split('.').pop()?.toLowerCase() || 'png';
      const mimeType = ext === 'svg' ? 'image/svg+xml' : 'image/png';

      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);
      this.highlightIconDataUri = `data:${mimeType};base64,${base64}`;
      this.iconConfig.customHighlightIcon = this.highlightIconDataUri;
    } catch (err) {
      console.warn(`MDAnnot: 无法加载图标 ${path}`, err);
      this.highlightIconDataUri = null;
      this.iconConfig.customHighlightIcon = null;
    }
  }

  // ── 侧面板切换 ──

  private async toggleSidePanel(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_SIDE_PANEL);
    if (existing.length > 0) {
      this.app.workspace.detachLeavesOfType(VIEW_TYPE_SIDE_PANEL);
    } else {
      if (this.app.workspace.rightSplit.collapsed) {
        this.app.workspace.rightSplit.expand();
      }
      const leaf = this.app.workspace.getRightLeaf(false);
      if (leaf) {
        await leaf.setViewState({ type: VIEW_TYPE_SIDE_PANEL, active: true });
      }
    }
  }

  // ── 文档切换 ──

  private async onActiveLeafChange(): Promise<void> {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || !view.file) return;

    const filePath = view.file.path;
    await this.annotationManager.openFile(filePath);
    const content = view.data;
    this.currentDocContent = content;
    await this.annotationManager.reanchorAll(content);
    this.updateCM6Decorations(view);
    this.initCanvasOverlay(view);
    // 加载手写数据
    this.storage.load(filePath).then(annotationFile => {
      if (annotationFile?.handwriting?.strokes && this.canvasOverlay) {
        this.canvasOverlay.setStrokes(annotationFile.handwriting.strokes);
      }
    }).catch(err => console.warn("MDAnnot: 加载手写数据失败", err));
    if (
      this.settings.showInEditor &&
      this.settings.autoShowPanel &&
      this.annotationManager.getAllAnnotations().length > 0
    ) {
      const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_SIDE_PANEL);
      if (existing.length === 0) {
        const leaf = this.app.workspace.getRightLeaf(false);
        if (leaf) {
          await leaf.setViewState({ type: VIEW_TYPE_SIDE_PANEL, active: true });
        }
      }
    }
    // 文件切换后确保阅读模式批注渲染（post-processor 可能在 annotations 加载前执行）
    this.rerenderReadingAnnotations();
  }

  // ── 选中文字变化 ──
  // 只负责"无选中时隐藏工具栏"，"有选中时显示"由 onEditorMouseUp 负责
  // 这样避免拖选过程中 selectionchange 反复触发导致工具栏闪烁

  private onSelectionChange(): void {
    if (this.isMouseDown) return; // 拖选中，不处理

    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;

    if (view.getMode() === "source") {
      const selection = view.editor.getSelection();
      if (!selection || selection.trim().length === 0) {
        this.floatingToolbar.hide();
      }
    } else if (view.getMode() === "preview") {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.toString().trim().length === 0) {
        this.floatingToolbar.hide();
      }
    }
  }

  // ── 鼠标松开时：显示工具栏（如果有选中文字） ──

  private onEditorMouseUp(e: MouseEvent): void {
    this.isMouseDown = false;
    if (!this.settings.showInEditor) return;

    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;
    const existingToolbar = document.querySelector(".md-annot-toolbar");
    if (existingToolbar) return;

    if (view.getMode() === "source" && (e.target as HTMLElement).closest(".cm-editor")) {
      const selection = view.editor.getSelection();
      if (selection && selection.trim().length > 0) {
        this.floatingToolbar.showOnSelection(view.editor);
      }
    } else if (view.getMode() === "preview") {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) {
        this.floatingToolbar.showOnReadingSelection(view);
      }
    }
  }

  // ── CM6 装饰更新 ──

  private updateCM6Decorations(view: MarkdownView): void {
    const cm = (view.editor as any)?.cm as EditorView | undefined;
    if (!cm) {
      // CM6 编辑器尚未就绪，延迟重试
      requestAnimationFrame(() => this.updateCM6Decorations(view));
      return;
    }

    let decorations: import("@codemirror/view").DecorationSet;
    if (this.settings.showInEditor) {
      const annotations = this.annotationManager.getAllAnnotations();
      decorations = buildDecorations(cm, annotations, {
        highlightColor: this.settings.highlightColor,
        underlineColor: this.settings.underlineColor,
        commentHighlightColor: this.settings.commentHighlightColor,
        applyColorGlobally: this.settings.applyColorGlobally,
        focusedAnnotationId: this.annotationManager.getFocusedAnnotationId(),
      });
    } else {
      decorations = Decoration.none;
    }

    // 用 requestAnimationFrame 延迟 dispatch，避免在 CM6 update 循环内嵌套 dispatch
    requestAnimationFrame(() => {
      cm.dispatch({
        effects: setAnnotationDecorations.of(decorations),
      });
    });
  }

  // ── Canvas 初始化 ──

  private initCanvasOverlay(view: MarkdownView): void {
    this.canvasOverlay?.destroy();
    if (view.getMode() !== "preview") return;

    const previewEl = (view as any).previewMode?.containerEl as
      | HTMLElement
      | undefined;
    if (!previewEl) return;

    if (getComputedStyle(previewEl).position === "static") {
      previewEl.style.position = "relative";
    }

    const config: CanvasOverlayConfig = {
      penColor: this.settings.defaultPenColor,
      penWidth: this.settings.defaultPenWidth,
      highlighterWidth: this.settings.defaultHighlighterWidth,
      smoothness: this.settings.smoothness,
      activeTool: StrokeTool.PEN,
      usePressure: true,
    };

    this.canvasOverlay = new CanvasOverlay(previewEl, config, (data) => {
      const filePath = this.annotationManager.getCurrentFilePath();
      if (!filePath) return;
      const annotations = this.annotationManager.getAllAnnotations();
      this.storage.saveAnnotations(filePath, annotations, {
        strokes: data.strokes,
        width: data.width,
        height: data.height,
      });
    });

    this.canvasOverlay.setVisible(false);
  }

  /** 重新渲染阅读模式批注（批注变更后触发） */
  private rerenderReadingAnnotations(targetView?: MarkdownView): void {
    try {
      const view = targetView ?? this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!view || view.getMode() !== "preview") return;
      const previewEl = (view as any).previewMode?.containerEl as HTMLElement | undefined;
      if (!previewEl) return;

      // 清除旧的批注 span
      const selectors = [
        '.md-annot-reading-highlight',
        '.md-annot-reading-underline',
        '.md-annot-reading-comment',
      ];
      for (const sel of selectors) {
        previewEl.querySelectorAll(sel).forEach(el => {
          const text = el.textContent || '';
          el.replaceWith(document.createTextNode(text));
        });
      }

      // 重新渲染（包括丢失的批注，用不同样式展示）
      const focusedId = this.annotationManager.getFocusedAnnotationId();
      const annotations = this.annotationManager.getAllAnnotations()
        .filter(a => a.type !== AnnotationType.HANDWRITING);
      for (const anno of annotations) {
        this.applySingleAnnotation(previewEl, anno, anno.id === focusedId);
      }
    } catch (e) {
      console.error("MDAnnot: rerender reading annotations error", e);
    }
  }

  /** 清除所有批注数据（清空内存 + 清除渲染） */
  clearAllAnnotationData(): void {
    try {
      // 清空内存中的批注
      this.annotationManager.clear();
      // 重新打开当前文件以恢复 currentFilePath，否则后续创建批注/persist/post-processor 都无法正常工作
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (view && view.file) {
        this.annotationManager.openFile(view.file.path);
      }
      if (view) {
        this.updateCM6Decorations(view);
      }
      // 清除阅读模式渲染
      this.rerenderReadingAnnotations();
      // 关闭侧面板
      this.app.workspace.detachLeavesOfType(VIEW_TYPE_SIDE_PANEL);
    } catch (e) {
      console.error("MDAnnot: clearAllAnnotationData error", e);
    }
  }

  /** 渲染一条批注到阅读模式 DOM（支持多行文本，带锚定状态视觉） */
  private applySingleAnnotation(container: HTMLElement, anno: Annotation, isFocused: boolean = false): void {
    const targetText = anno.targetText;
    if (!targetText) return;

    let color: string;
    let baseCls: string;
    let isUnderline = false;
    switch (anno.type) {
      case AnnotationType.HIGHLIGHT:
        baseCls = "md-annot-reading-highlight";
        color = anno.color || this.settings.highlightColor;
        break;
      case AnnotationType.UNDERLINE:
        baseCls = "md-annot-reading-underline";
        color = anno.color || this.settings.underlineColor;
        isUnderline = true;
        break;
      case AnnotationType.COMMENT:
        baseCls = "md-annot-reading-comment";
        color = anno.color || this.settings.commentHighlightColor;
        break;
      default:
        return;
    }

    // 根据锚定状态追加 CSS 类
    let statusCls = "";
    switch (anno.anchorStatus) {
      case AnchorStatus.FUZZY:
        statusCls = " md-annot-reading-fuzzy";
        break;
      case AnchorStatus.PARAGRAPH:
        statusCls = " md-annot-reading-paragraph";
        break;
      case AnchorStatus.LOST:
        statusCls = " md-annot-reading-lost";
        break;
    }
    const fullCls = baseCls + statusCls + (isFocused ? " md-annot-reading-breathing" : "");

    // 多行文本：逐行渲染
    const lines = targetText.split("\n");
    if (lines.length > 1) {
      for (const line of lines) {
        if (line.trim()) {
          this._highlightLine(container, line, fullCls, color, isUnderline);
        }
      }
      return;
    }

    // 单行文本：原逻辑
    const textNodes: Text[] = [];
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      if (node.textContent && node.textContent.includes(targetText)) {
        textNodes.push(node);
      }
    }

    for (const node of textNodes) {
      const text = node.textContent!;
      const parent = node.parentNode;
      if (!parent) continue;

      const frag = document.createDocumentFragment();
      let remaining = text;
      let foundAny = false;
      while (true) {
        const matchIdx = remaining.indexOf(targetText);
        if (matchIdx < 0) break;
        foundAny = true;

        if (matchIdx > 0) {
          frag.appendChild(document.createTextNode(remaining.substring(0, matchIdx)));
        }

        const span = document.createElement("span");
        span.className = fullCls;
        if (isUnderline) {
          span.style.textDecoration = "wavy underline " + color;
          span.style.textUnderlineOffset = "2px";
        } else {
          span.style.backgroundColor = color;
          span.style.borderRadius = "2px";
        }
        span.textContent = targetText;
        frag.appendChild(span);

        remaining = remaining.substring(matchIdx + targetText.length);
      }

      if (remaining) {
        frag.appendChild(document.createTextNode(remaining));
      }

      if (foundAny) {
        parent.replaceChild(frag, node);
      }
    }
  }

  /** 高亮阅读模式中的单行文本 */
  private _highlightLine(container: HTMLElement, line: string, fullCls: string, color: string, isUnderline: boolean): void {
    if (!line.trim()) return;
    const textNodes: Text[] = [];
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      if (node.textContent && node.textContent.includes(line)) {
        textNodes.push(node);
      }
    }
    for (const node of textNodes) {
      const text = node.textContent!;
      const parent = node.parentNode;
      if (!parent) continue;
      const frag = document.createDocumentFragment();
      let remaining = text;
      let foundAny = false;
      while (true) {
        const matchIdx = remaining.indexOf(line);
        if (matchIdx < 0) break;
        foundAny = true;
        if (matchIdx > 0) frag.appendChild(document.createTextNode(remaining.substring(0, matchIdx)));
        const span = document.createElement("span");
        span.className = fullCls;
        if (isUnderline) {
          span.style.textDecoration = "wavy underline " + color;
          span.style.textUnderlineOffset = "2px";
        } else {
          span.style.backgroundColor = color;
          span.style.borderRadius = "2px";
        }
        span.textContent = line;
        frag.appendChild(span);
        remaining = remaining.substring(matchIdx + line.length);
      }
      if (remaining) frag.appendChild(document.createTextNode(remaining));
      if (foundAny) parent.replaceChild(frag, node);
    }
  }

  /** 保留源码中的多空行间距，使阅读模式段落间距与编辑模式一致 */
  private preserveParagraphSpacing(el: HTMLElement, ctx: any): void {
    if (!this.currentDocContent) return;
    const source = this.currentDocContent;
    
    // 找到源码中所有段落边界（多个连续换行）
    // 标准段落间隔是 2 个换行，多了就是额外空行
    const paraBoundaries: number[] = [];
    const re = /\n{3,}/g;
    let match;
    while ((match = re.exec(source)) !== null) {
      const extraBreakLen = match[0].length - 2;
      if (extraBreakLen > 0) {
        paraBoundaries.push(match.index + 2);
      }
    }
    if (paraBoundaries.length === 0) return;
    
    const pEls = Array.from(el.querySelectorAll<HTMLParagraphElement>('p'));
    if (pEls.length === 0) return;
    
    // 将源码按双换行切分成段落
    const sourceParas = source.split(/\n\n+/);
    const extraBlankCounts: number[] = [];
    let cumPos = 0;
    for (let i = 0; i < sourceParas.length; i++) {
      cumPos += sourceParas[i].length;
      if (i < sourceParas.length - 1) {
        const remaining = source.slice(cumPos);
        const m = remaining.match(/^\n+/);
        const blankCount = m ? m[0].length : 0;
        extraBlankCounts.push(Math.max(0, blankCount - 2));
        cumPos += blankCount;
      }
    }
    
    // 按文本指纹匹配 <p> 元素到源码段落
    let sourceIdx = 0;
    for (const pEl of pEls) {
      const pText = pEl.textContent?.trim() || '';
      if (!pText) continue;
      const fingerprint = pText.substring(0, 20);
      
      while (sourceIdx < sourceParas.length) {
        const srcText = sourceParas[sourceIdx].replace(/\n/g, ' ').trim();
        if (srcText.includes(fingerprint) || fingerprint.includes(srcText.substring(0, 20))) {
          break;
        }
        sourceIdx++;
      }
      
      if (sourceIdx < sourceParas.length - 1 && sourceIdx < extraBlankCounts.length) {
        const extraBlanks = extraBlankCounts[sourceIdx];
        if (extraBlanks > 0) {
          const extraMargin = extraBlanks * 0.5;
          const currentMargin = parseFloat(pEl.style.marginTop) || 0;
          pEl.style.marginTop = `${currentMargin + extraMargin}em`;
        }
        sourceIdx++;
      }
    }
  }

}