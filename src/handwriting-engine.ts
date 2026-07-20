/*
 * handwriting-engine.ts — 手写笔触渲染引擎
 *
 * 功能：将手写笔触（采样的点序列）渲染到 Canvas 上。
 *
 * 核心算法：Catmull-Rom 插值
 *   为什么采样点不能直接画折线？
 *   手写笔快速移动时，Pointer Events 的采样率有限（约 60-120Hz），
 *   点与点之间间距大，直接画折线会显得"锯齿状"。
 *   Catmull-Rom 插值在每两个采样点之间生成平滑曲线，让笔触看起来流畅自然。
 *
 * 压感支持：
 *   Apple Pencil 和部分手写笔会报告 pressure 值（0-1），
 *   我们用这个值动态调整笔触宽度，模拟真实的钢笔书写效果。
 *   没有压感的设备默认 pressure = 0.5。
 */

import { Point, Stroke, StrokeTool } from "./data-models";

// ────────── Catmull-Rom 样条插值 ──────────
// 在每对相邻点之间插入 segments 个插值点，产生平滑曲线
// 参考：https://en.wikipedia.org/wiki/Centripetal_Catmull-Rom_spline
export function catmullRomSpline(
  points: Point[],
  segments: number = 8
): Point[] {
  if (points.length < 2) return points;

  // 结果数组从第一个点开始
  const result: Point[] = [points[0]];

  // 对每个区间 [p[i], p[i+1]] 进行插值
  for (let i = 0; i < points.length - 1; i++) {
    // 取四个控制点 p0, p1, p2, p3，边界处用端点外推
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    // 在 t ∈ [0, 1] 上插值
    for (let s = 1; s <= segments; s++) {
      const t = s / segments;
      const t2 = t * t;
      const t3 = t2 * t;

      // Catmull-Rom 基函数
      const x =
        0.5 *
        (2 * p1.x +
          (-p0.x + p2.x) * t +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);

      const y =
        0.5 *
        (2 * p1.y +
          (-p0.y + p2.y) * t +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);

      // 压感在 p1 和 p2 之间线性插值
      const pressure = p1.pressure + (p2.pressure - p1.pressure) * t;

      result.push({ x, y, pressure, timestamp: p1.timestamp });
    }
  }

  // 加入最后一个点
  result.push(points[points.length - 1]);
  return result;
}

// ────────── 渲染一条笔触到 Canvas ──────────
// 支持钢笔（实线+压感）和荧光笔（半透明粗线）两种模式
export function renderStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  smoothness: number = 0.5
): void {
  const { points, color, width, tool } = stroke;
  if (points.length < 2) return;

  ctx.save();

  // 根据工具类型设置样式
  if (tool === StrokeTool.HIGHLIGHTER) {
    // 荧光笔：半透明，粗线，圆头端
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.globalAlpha = 0.3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  } else {
    // 钢笔：不透明，支持压感变宽
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.globalAlpha = 1.0;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }

  // 计算平滑后的点序列
  const smoothed = catmullRomSpline(points, Math.round(8 * smoothness));

  ctx.beginPath();

  if (tool === StrokeTool.PEN) {
    // 钢笔模式：逐段绘制，每段根据压感调整宽度
    ctx.moveTo(smoothed[0].x, smoothed[0].y);
    for (let i = 1; i < smoothed.length; i++) {
      const p = smoothed[i];
      // 压感控制宽度变化：0.5~1.0 倍的基准宽度
      // 无压感设备默认 pressure=0.5，所以宽度会在 0.75x~1.0x 之间
      const adaptiveWidth = width * (0.5 + p.pressure * 0.5);
      ctx.lineWidth = adaptiveWidth;
      ctx.lineTo(p.x, p.y);
    }
  } else {
    // 荧光笔/橡皮：等宽绘制
    ctx.moveTo(smoothed[0].x, smoothed[0].y);
    for (let i = 1; i < smoothed.length; i++) {
      ctx.lineTo(smoothed[i].x, smoothed[i].y);
    }
  }

  ctx.stroke();
  ctx.restore();
}
