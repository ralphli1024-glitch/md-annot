/*
 * canvas-overlay.ts — 阅读模式透明 Canvas 手写层
 *
 * 功能：在 Obsidian 阅读模式（Markdown 渲染视图）的顶部覆盖一个透明 Canvas，
 * 用户可以在上面自由手写（划线、画圈、荧光笔标注）。
 *
 * 为什么用 Canvas 而不是 SVG？
 *   Canvas 的 2D 上下文直接操作像素，手写渲染性能远好于 SVG，
 *   尤其是高频 Pointer Events 场景。SVG 的 DOM 节点在高频更新时会卡顿。
 *
 * 为什么用 Pointer Events 而不是 Mouse/Touch 事件？
 *   Pointer Events 统一了鼠标、触控笔和手指的输入，一个事件处理所有设备。
 *   支持 pressure（压感）、pointerType（设备类型）等属性。
 *
 * 实现要点：
 *   1. Canvas 通过 ResizeObserver 自适应容器大小
 *   2. 使用 devicePixelRatio 保持高 DPI 屏幕的清晰度
 *   3. 所有笔触数据以 Stroke[] 保存，可序列化到 JSON
 *   4. 实时渲染：pointermove 时不断重绘 Canvas
 *   5. 通知回调：笔触完成时通知外部（用于自动保存）
 */

import { Stroke, StrokeTool, generateId, HandwritingData } from "./data-models";
import { renderStroke } from "./handwriting-engine";

export interface CanvasOverlayConfig {
  penColor: string;
  penWidth: number;
  highlighterWidth: number;
  smoothness: number;
  activeTool: StrokeTool;
  usePressure: boolean;
}

export class CanvasOverlay {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private strokes: Stroke[] = [];
  private currentStroke: Stroke | null = null;
  private isDrawing: boolean = false;
  private visible: boolean = true;
  private config: CanvasOverlayConfig;

  // 笔触完成时的回调（用于外部保存）
  private onHandwritingChange: ((data: HandwritingData) => void) | null = null;

  constructor(
    container: HTMLElement,
    config: CanvasOverlayConfig,
    onHandwritingChange?: (data: HandwritingData) => void
  ) {
    this.config = { ...config, usePressure: config.usePressure ?? true };
    this.onHandwritingChange = onHandwritingChange || null;

    // 创建 Canvas 元素
    this.canvas = document.createElement("canvas");
    this.canvas.className = "md-annot-canvas-overlay";

    // Canvas 覆盖在阅读视图上方，透明背景
    this.canvas.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: auto;
      z-index: 100;
    `;

    this.ctx = this.canvas.getContext("2d")!;
    container.appendChild(this.canvas);
    this.initEvents();
  }

  // ── 事件初始化 ──

  private initEvents(): void {
    // Pointer Events：统一处理鼠标、触控笔、手指
    this.canvas.addEventListener("pointerdown", this.onPointerDown.bind(this));
    this.canvas.addEventListener("pointermove", this.onPointerMove.bind(this));
    this.canvas.addEventListener("pointerup", this.onPointerUp.bind(this));
    this.canvas.addEventListener("pointerleave", this.onPointerUp.bind(this));

    // 阻止 Canvas 上的 click 事件冒泡到 Obsidian 的链接/按钮
    this.canvas.addEventListener("click", (e) => e.stopPropagation());

    // 自适应容器大小变化
    const resizeObserver = new ResizeObserver(() => this.handleResize());
    resizeObserver.observe(this.canvas.parentElement!);

    this.handleResize();
  }

  // ── 尺寸自适应 ──

  private handleResize(): void {
    const parent = this.canvas.parentElement;
    if (!parent) return;

    const rect = parent.getBoundingClientRect();
    // 使用 devicePixelRatio 确保高 DPI 屏幕不模糊
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    this.ctx.scale(dpr, dpr);

    this.render();
  }

  // ── 指针事件处理 ──

  private onPointerDown(e: PointerEvent): void {
    if (!this.visible) return;
    this.isDrawing = true;
    // 捕获指针，确保在 Canvas 外移动时也能收到事件
    this.canvas.setPointerCapture(e.pointerId);

    this.currentStroke = {
      id: generateId(),
      points: [],
      color: this.config.penColor,
      width:
        this.config.activeTool === StrokeTool.HIGHLIGHTER
          ? this.config.highlighterWidth
          : this.config.penWidth,
      tool: this.config.activeTool,
    };

    this.addPoint(e);
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.isDrawing || !this.currentStroke) return;
    this.addPoint(e);
    // 实时渲染：每次移动都重绘 Canvas
    // 为什么不用 requestAnimationFrame？手写场景需要即时反馈，
    // requestAnimationFrame 的 16ms 延迟会让笔触"滞后于笔尖"
    this.render();
  }

  private onPointerUp(e: PointerEvent): void {
    if (!this.isDrawing || !this.currentStroke) return;
    this.isDrawing = false;

    if (this.currentStroke.points.length > 0) {
      this.strokes.push(this.currentStroke);
      this.currentStroke = null;
      // 通知外部笔触已保存（用于触发自动保存）
      const rect = this.canvas.getBoundingClientRect();
      this.onHandwritingChange?.({
        strokes: [...this.strokes],
        width: rect.width,
        height: rect.height,
      });
    }
  }

  // ── 坐标转换 ──

  private addPoint(e: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    this.currentStroke!.points.push({
      x: e.clientX - rect.left,   // 相对于 Canvas 的坐标
      y: e.clientY - rect.top,
      pressure: this.config.usePressure ? (e.pressure || 0.5) : 1.0,
      timestamp: Date.now(),
    });
  }

  // ── 渲染 ──

  render(): void {
    const dpr = window.devicePixelRatio || 1;
    const width = this.canvas.width / dpr;
    const height = this.canvas.height / dpr;

    // 清除画布（Canvas 不会自动清除）
    this.ctx.clearRect(0, 0, width, height);

    // 渲染所有已完成的笔触
    for (const stroke of this.strokes) {
      renderStroke(this.ctx, stroke, this.config.smoothness);
    }

    // 渲染当前正在画的笔触
    if (this.currentStroke) {
      renderStroke(this.ctx, this.currentStroke, this.config.smoothness);
    }
  }

  // ── 外部 API ──

  setStrokes(strokes: Stroke[]): void {
    this.strokes = strokes;
    this.render();
  }

  getStrokes(): Stroke[] {
    return [...this.strokes];
  }


  undoLastStroke(): Stroke | null {
    const stroke = this.strokes.pop();
    if (stroke) {
      this.render();
      const rect = this.canvas.getBoundingClientRect();
      this.onHandwritingChange?.({
        strokes: [...this.strokes],
        width: rect.width,
        height: rect.height,
      });
      return stroke;
    }
    return null;
  }
  setVisible(visible: boolean): void {
    this.visible = visible;
    this.canvas.style.display = visible ? "block" : "none";
  }

  setConfig(config: Partial<CanvasOverlayConfig>): void {
    Object.assign(this.config, config);
  }

  destroy(): void {
    this.canvas.remove();
  }
}
