/*
 * annotation-manager.ts — 批注管理器（核心状态管理）
 *
 * 这是插件的"大脑"——所有批注的增删改查、事件通知、持久化触发都在这里。
 *
 * 为什么需要这个类？
 * 编辑模式（FloatingToolbar）、CM6 装饰、侧面板（SidePanel）、阅读模式（CanvasOverlay）
 * 都需要操作批注数据。如果各自直接读写 StorageService，逻辑会分散，一致性问题多。
 * AnnotationManager 集中管理批注的生命周期，模块之间通过事件通信。
 *
 * 事件机制：
 *   模块之间不直接引用，通过 emit/on 解耦。
 *   例如：FloatingToolbar 创建批注 → manager emit('annotation:created') → CM6 更新装饰
 *
 * 数据流：
 *   openFile() → load from Storage → reanchorAll → emit → 各模块更新 UI
 *   createAnnotation() → add to cache → emit → 各模块更新 UI
 *   定时 persist() → save to Storage
 */

import {
  Annotation,
  AnnotationType,
  AnchorStatus,
  generateId,
  serializeAnnotation,
  deserializeAnnotation,
  UndoAction,
} from "./data-models";
import { StorageService } from "./storage";
import { computeFingerprint, findAnnotationPosition, fnv1aHash, lineColToOffset } from "./anchor-engine";

// 简单的事件总线——用 Set 存储回调函数，支持 on/off/emit
type EventCallback = (...args: any[]) => void;

export class AnnotationManager {
  // 当前文档的所有批注，按 id 索引
  private annotations: Map<string, Annotation> = new Map();
  // 当前打开的 Markdown 文件路径
  private currentFilePath: string = "";
  // 事件监听器
  private eventListeners: Map<string, Set<EventCallback>> = new Map();
  // Undo/Redo 栈
  private undoStack: UndoAction[] = [];
  private redoStack: UndoAction[] = [];
  private readonly maxUndoStack = 50;
  // 当前高亮定位的批注 id（用于呼吸动画）
  /** 上次 applyDeltaChanges 中被重叠编辑影响的批注 id 集合 */
  private _lastAffectedIds: Set<string> = new Set();
  private focusedAnnotationId: string | null = null;

  constructor(private storage: StorageService) {}

  // ── 事件 API ──

  on(event: string, callback: EventCallback): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);
  }

  off(event: string, callback: EventCallback): void {
    this.eventListeners.get(event)?.delete(callback);
  }

  private emit(event: string, ...args: any[]): void {
    this.eventListeners.get(event)?.forEach((cb) => cb(...args));
  }

  // ── 文件管理 ──

  // 打开一个文件：从存储加载批注，重置状态
  async openFile(filePath: string): Promise<void> {
    this.currentFilePath = filePath;
    const loaded = await this.storage.getAllAnnotations(filePath);
    this.annotations.clear();
    for (const anno of loaded) {
      this.annotations.set(anno.id, anno);
    }
    this.emit("file:opened", { path: filePath, count: loaded.length });
  }

  // ── 锚定重算 ──

  // 文档内容变化后，重新对所有批注执行定位
  // 先尝试位置校验（contentHash 匹配则直接复用），不匹配则走文本搜索
  async reanchorAll(docContent: string): Promise<void> {
    for (const [id, anno] of this.annotations) {
      // ── 快速路径：contentHash 匹配 → 位置有效，直接使用 ──
      if (anno.contentHash && anno.anchorPos !== undefined && anno.anchorEndPos !== undefined) {
        const slice = docContent.slice(anno.anchorPos, anno.anchorEndPos);
        if (fnv1aHash(slice) === anno.contentHash) {
          anno.anchorStatus = AnchorStatus.EXACT;
          const preLines = docContent.slice(0, anno.anchorPos).split("\n");
          anno.startLine = preLines.length - 1;
          anno.startCh = preLines[preLines.length - 1].length;
          const postLines = docContent.slice(0, anno.anchorEndPos).split("\n");
          anno.endLine = postLines.length - 1;
          anno.endCh = postLines[postLines.length - 1].length;
          continue;
        }
      }

      // ── 慢速路径：文本搜索 ──
      const result = findAnnotationPosition(anno, docContent);
      anno.anchorStatus = result.status;
      anno.startLine = result.startLine;
      anno.startCh = result.startCh;
      anno.endLine = result.endLine;
      anno.endCh = result.endCh;

      // 文本搜索成功 → 同步更新字符级位置 + contentHash
      if (result.status !== AnchorStatus.LOST) {
        anno.anchorPos = lineColToOffset(docContent, result.startLine, result.startCh);
        anno.anchorEndPos = lineColToOffset(docContent, result.endLine, result.endCh);
        anno.contentHash = fnv1aHash(docContent.slice(anno.anchorPos, anno.anchorEndPos));
      }
    }
this.emit("annotations:reanchored", Array.from(this.annotations.values()));
  }

  // ── 批注 CRUD ──

  // 创建批注
  // contextBefore/After 用于锚定时的辅助校验，创建时计算指纹
  createAnnotation(
    type: AnnotationType,
    targetText: string,
    contextBefore: string,
    contextAfter: string,
    options?: { color?: string; commentText?: string; anchorPos?: number; anchorEndPos?: number }
  ): Annotation | null {
    if (!targetText) return null;

    const fingerprint = computeFingerprint(targetText, contextBefore, contextAfter);
    const annotation: Annotation = {
      id: generateId(),
      type,
      targetText,
      contextBefore,
      contextAfter,
      fingerprint,
      color: options?.color,
      commentText: options?.commentText,
      anchorPos: options?.anchorPos,
      anchorEndPos: options?.anchorEndPos,
      contentHash: options?.anchorPos !== undefined ? fnv1aHash(targetText) : undefined,
      // 有 anchorPos 时位置立即有效，设为 EXACT；无位置则后续由 reanchorAll 定位
      anchorStatus: options?.anchorPos !== undefined ? AnchorStatus.EXACT : AnchorStatus.LOST,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.annotations.set(annotation.id, annotation);
    this.undoStack.push({
      type: 'annotation:created',
      timestamp: Date.now(),
      payload: { id: annotation.id },
    });
    this.redoStack = [];
    this.trimUndoStack();
    this.emit("annotation:created", annotation);
    return annotation;
  }

  // 删除批注
  deleteAnnotation(id: string): boolean {
    const oldAnnotation = this.annotations.get(id);
    if (!oldAnnotation) return false;

    this.annotations.delete(id);
    this.undoStack.push({
      type: 'annotation:deleted',
      timestamp: Date.now(),
      payload: { ...oldAnnotation },
    });
    this.redoStack = [];
    this.trimUndoStack();
    this.emit("annotation:deleted", { id });
    return true;
  }

  // 更新批注的部分字段
  updateAnnotation(id: string, updates: Partial<Annotation>): Annotation | null {
    const anno = this.annotations.get(id);
    if (!anno) return null;

    Object.assign(anno, updates, { updatedAt: Date.now() });
    this.emit("annotation:updated", anno);
    return anno;
  }

  // 按 id 获取单条批注
  getAnnotation(id: string): Annotation | undefined {
    return this.annotations.get(id);
  }

  // 获取当前文件的所有批注
  getAllAnnotations(): Annotation[] {
    return Array.from(this.annotations.values());
  }

  // 按类型和/或锚定状态筛选
  getFilteredAnnotations(
    type?: AnnotationType,
    anchorStatus?: AnchorStatus
  ): Annotation[] {
    let result = Array.from(this.annotations.values());
    if (type) result = result.filter((a) => a.type === type);
    if (anchorStatus) result = result.filter((a) => a.anchorStatus === anchorStatus);
    return result;
  }

  // ── Undo/Redo ──

  undo(): void {
    const action = this.undoStack.pop();
    if (!action) return;

    switch (action.type) {
      case 'annotation:created': {
        const { id } = action.payload;
        const deleted = this.annotations.get(id);
        if (deleted) {
          this.annotations.delete(id);
          this.redoStack.push({
            type: 'annotation:deleted',
            timestamp: Date.now(),
            payload: { ...deleted },
          });
          this.emit("annotation:deleted", { id });
        }
        break;
      }
      case 'annotation:deleted': {
        const restored = deserializeAnnotation(action.payload);
        this.annotations.set(restored.id, restored);
        this.redoStack.push({
          type: 'annotation:created',
          timestamp: Date.now(),
          payload: { id: restored.id },
        });
        this.emit("annotation:created", restored);
        break;
      }
    }
    this.emit("annotations:reanchored", Array.from(this.annotations.values()));
  }

  redo(): void {
    const action = this.redoStack.pop();
    if (!action) return;

    switch (action.type) {
      case 'annotation:created': {
        const { id } = action.payload;
        const deleted = this.annotations.get(id);
        if (deleted) {
          this.annotations.delete(id);
          this.undoStack.push({
            type: 'annotation:created',
            timestamp: Date.now(),
            payload: { id },
          });
          this.emit("annotation:deleted", { id });
        }
        break;
      }
      case 'annotation:deleted': {
        const restored = deserializeAnnotation(action.payload);
        this.annotations.set(restored.id, restored);
        this.undoStack.push({
          type: 'annotation:deleted',
          timestamp: Date.now(),
          payload: { ...restored },
        });
        this.emit("annotation:created", restored);
        break;
      }
    }
    this.emit("annotations:reanchored", Array.from(this.annotations.values()));
  }

  private trimUndoStack(): void {
    while (this.undoStack.length > this.maxUndoStack) {
      this.undoStack.shift();
    }
  }

  // ── 持久化 ──

  // 将当前批注保存到存储
  async persist(): Promise<void> {
    if (!this.currentFilePath) return;
    const annotations = Array.from(this.annotations.values());
    await this.storage.saveAnnotations(this.currentFilePath, annotations);
  }

  // ── CM6 增量位移 ──

  // 用户编辑文档时，CM6 ChangeTracker 捕获所有 {from, to, insertLength}，
  // 此方法对受影响批注做 O(1) 位置位移
  // 替代每次编辑都走全文文本搜索
  applyDeltaChanges(
    deltas: Array<{ from: number; to: number; insertLength: number }>
  ): void {
    this._lastAffectedIds.clear();
    for (const delta of deltas) {
      const offset = delta.insertLength - (delta.to - delta.from);
      if (offset === 0) continue;

      for (const [id, anno] of this.annotations) {
        if (anno.anchorPos === undefined || anno.anchorEndPos === undefined) continue;

        // 编辑在批注之后 → 无需位移
        if (delta.from >= anno.anchorEndPos) continue;

        // 编辑在批注之前 → 整条批注平移
        if (delta.to <= anno.anchorPos) {
          anno.anchorPos += offset;
          anno.anchorEndPos += offset;
          continue;
        }

        // 编辑与批注区间重叠 → 调整 endPos
        // 可能缩小（删除时）或扩大（插入时）
        anno.anchorEndPos += offset;
        this._lastAffectedIds.add(id);

        // 防止批注区间变成负数
        if (anno.anchorEndPos < anno.anchorPos) {
          anno.anchorEndPos = anno.anchorPos;
        }
      }
    }
  }

  // ── 增量重锚（仅受影响的批注）──

  /**
   * 只对 affectedIds 中的批注执行快速 contentHash 校验
   * contentHash 不匹配则直接标记为 FUZZY（跳过全文 Levenshtein 搜索）
   */
  reanchorAffected(docContent: string, affectedIds: Set<string>): void {
    for (const id of affectedIds) {
      const anno = this.annotations.get(id);
      if (!anno) continue;

      // 快速路径：contentHash 匹配
      if (anno.contentHash && anno.anchorPos !== undefined && anno.anchorEndPos !== undefined) {
        const from = Math.max(0, anno.anchorPos);
        const to = Math.min(docContent.length, anno.anchorEndPos);
        if (from < to && fnv1aHash(docContent.slice(from, to)) === anno.contentHash) {
          anno.anchorStatus = AnchorStatus.EXACT;
          const preLines = docContent.slice(0, anno.anchorPos).split("\n");
          anno.startLine = preLines.length - 1;
          anno.startCh = preLines[preLines.length - 1].length;
          const postLines = docContent.slice(0, anno.anchorEndPos).split("\n");
          anno.endLine = postLines.length - 1;
          anno.endCh = postLines[postLines.length - 1].length;
          continue;
        }
      }

      // contentHash 不匹配 → 编辑改变了批注范围内容
      anno.anchorStatus = AnchorStatus.FUZZY;
      // 根据当前位置更新行号，使装饰器可以正确定位
      if (anno.anchorPos !== undefined) {
        const preLines = docContent.slice(0, Math.min(anno.anchorPos, docContent.length)).split("\n");
        anno.startLine = preLines.length - 1;
        anno.startCh = preLines[preLines.length - 1].length;
      }
      if (anno.anchorEndPos !== undefined) {
        const postLines = docContent.slice(0, Math.min(anno.anchorEndPos, docContent.length)).split("\n");
        anno.endLine = postLines.length - 1;
        anno.endCh = postLines[postLines.length - 1].length;
      }
    }
    this.emit("annotations:reanchored", Array.from(this.annotations.values()));
  }

  /**
   * 同步更新受影响批注的 targetText，使其与当前位置的文档内容一致
   * 调用前必须先执行 applyDeltaChanges，确保 anchorPos/anchorEndPos 已位移到正确位置
   */
  syncAnnotatedText(docContent: string, affectedIds: Set<string>): void {
    for (const id of affectedIds) {
      const anno = this.annotations.get(id);
      if (!anno) continue;
      if (anno.anchorPos === undefined || anno.anchorEndPos === undefined) continue;

      // 读取当前位置的实际文本
      const from = Math.max(0, anno.anchorPos);
      const to = Math.min(docContent.length, anno.anchorEndPos);
      if (from >= to) continue;

      const newText = docContent.slice(from, to);
      if (!newText || newText === anno.targetText) continue;

      // 更新 targetText + 指纹
      anno.targetText = newText;
      anno.contentHash = fnv1aHash(newText);
      anno.anchorStatus = AnchorStatus.EXACT;
      anno.updatedAt = Date.now();

      // 更新行号
      const preLines = docContent.slice(0, anno.anchorPos).split("\n");
      anno.startLine = preLines.length - 1;
      anno.startCh = preLines[preLines.length - 1].length;
      const postLines = docContent.slice(0, anno.anchorEndPos).split("\n");
      anno.endLine = postLines.length - 1;
      anno.endCh = postLines[postLines.length - 1].length;

      this.emit("annotation:updated", anno);
    }
  }

  /** 获取最后一次 applyDeltaChanges 中受影响的批注 ID */
  getLastAffectedIds(): Set<string> {
    return this._lastAffectedIds;
  }


  // ── 状态查询 ──

  getCurrentFilePath(): string {
    return this.currentFilePath;
  }

  // ── 焦点定位（呼吸动画） ──

  setFocusAnnotation(id: string | null): void {
    this.focusedAnnotationId = id;
    this.emit("annotation:focus-changed", id);
  }

  clearFocusAnnotation(): void {
    if (this.focusedAnnotationId !== null) {
      this.focusedAnnotationId = null;
    this._lastAffectedIds.clear();
      this.emit("annotation:focus-changed", null);
    }
  }

  getFocusedAnnotationId(): string | null {
    return this.focusedAnnotationId;
  }

  // 清空所有状态（插件卸载/切换库时调用）
  clear(): void {
    this.annotations.clear();
    this.currentFilePath = "";
    this.undoStack = [];
    this.redoStack = [];
    this.focusedAnnotationId = null;
    this._lastAffectedIds.clear();
  }
}
