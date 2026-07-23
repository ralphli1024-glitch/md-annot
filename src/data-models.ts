/*
 * data-models.ts — 数据模型定义
 *
 * 为什么单独抽一个文件放类型定义？
 * 所有模块都要引用这些类型（批注、笔触、设置等），放一个文件避免循环依赖，
 * 也方便你直接看这个文件理解"一个批注对象长什么样"。
 *
 * 核心概念：
 *   Annotation  — 一条批注（高亮/划线/文字批注/手写），锚定到文档中的一段文本
 *   Stroke      — 一条手写笔触，由一系列带压感的点组成
 *   AnnotationFile — 对应 .annotations/xxx.current.json 的文件结构
 *
 * 为什么用枚举而不是字符串常量？
 * 枚举有类型安全，编辑器自动补全友好，不用手写字符串比较。
 */

import { Vault } from "obsidian";

// ────────── 批注类型 ──────────
// 对应编辑模式的三种操作 + 阅读模式的手写
export enum AnnotationType {
  HIGHLIGHT = "highlight",   // 高亮：文字背景色
  UNDERLINE = "underline",   // 划线：文字下方波浪线
  COMMENT = "comment",       // 批注：高亮 + 右侧面板文字评论
  HANDWRITING = "handwriting", // 手写：Canvas 画布上的自由笔触
}

// ────────── 锚定状态 ──────────
// 批注定位到文档时，匹配精度的降级状态
// 用户看到这个状态就能知道"批注位置是否可靠"
export enum AnchorStatus {
  EXACT = "exact",           // 精确匹配：文本完全一致，位置准确（蓝色/绿色）
  FUZZY = "fuzzy",           // 模糊匹配：原文被修改过，但语义上找到了近似的文本（橙色）
  PARAGRAPH = "paragraph",   // 段落级匹配：具体文字找不到了，但能定位到段落范围（橙色虚线框）
  LOST = "lost",             // 丢失：原文已被删除，无法定位（红色虚线框 + 半透明）
}

// ────────── 笔触工具类型 ──────────
export enum StrokeTool {
  PEN = "pen",                 // 钢笔：实线，支持压感控制粗细
  HIGHLIGHTER = "highlighter", // 荧光笔：半透明粗线，用于文字上覆盖高亮
  ERASER = "eraser",           // 橡皮：擦除已有笔触
}

// ────────── 点数据 ──────────
// 手写路径中的单个采样点
export interface Point {
  x: number;          // Canvas 坐标系 X
  y: number;          // Canvas 坐标系 Y
  pressure: number;   // 笔压 0-1（Apple Pencil / 手写笔支持）
  timestamp: number;  // 时间戳，用于计算笔画速度（未来可用于笔迹美化）
}

// ────────── 笔触数据 ──────────
// 完整的一次落笔→抬笔轨迹
export interface Stroke {
  id: string;          // 唯一标识
  points: Point[];     // 采样点序列（注意：存储的是原始点，渲染时做 Catmull-Rom 插值）
  color: string;       // 颜色 hex
  width: number;       // 基础笔触宽度（高亮模式会放大）
  tool: StrokeTool;    // 使用的工具
}

// ────────── 批注数据 ──────────
// 这是整个插件的核心数据模型
//
// 设计要点：
// 1. 批注的位置靠字符级 offset（anchorPos/anchorEndPos）持久化，编辑时用 CM6 增量位移更新
// 2. 行号位（startLine/ch）是运行时计算的缓存，不持久化
// 3. 加载时先校验 contentHash 匹配则直接复用位置，不匹配走文本搜索 fallback
export interface Annotation {
  id: string;              // UUID，用于增删改查和事件引用
  type: AnnotationType;    // 批注类型

  // ── 锚定信息 ──
  targetText: string;      // 被批注的文本内容
  contextBefore: string;   // 选中文本前面的内容（用于锚定校验）
  contextAfter: string;    // 选中文本后面的内容（用于锚定校验）
  fingerprint: string;     // 内容指纹哈希，详见 anchor-engine.ts

  // ── 字符级位置（持久化）──
  // 文档开头的字符偏移量，用于 CM6 增量位移 + 跨 session 位置校验
  anchorPos?: number;      // 起始位置（从文档开头到选中文本开头的字符数）
  anchorEndPos?: number;   // 结束位置
  contentHash?: string;    // targetText 的 hash，加载时校验 position 是否仍然匹配

  // ── 运行时位置（不持久化） ──
  // 每次打开文件或文档内容变化时，由 AnchorEngine 重新计算
  startLine?: number;      // 起始行号
  startCh?: number;        // 起始列号
  endLine?: number;        // 结束行号
  endCh?: number;          // 结束列号

  // ── 锚定状态（运行时计算） ──
  anchorStatus: AnchorStatus;

  // ── 可选属性 ──
  color?: string;          // 自定义颜色（不设置则用默认色）
  commentText?: string;    // 文字批注内容（仅 COMMENT 类型使用）

  // ── 手写数据（仅 HANDWRITING 类型使用） ──
  strokes?: Stroke[];

  // ── 元数据 ──
  createdAt: number;       // 创建时间戳
  updatedAt: number;       // 更新时间戳
}

// ────────── 序列化批注 ──────────
// 存储到 JSON 文件时去掉运行时字段，减少存储体积
// anchorStatus/startLine 这些每次加载都会重新算，不需要存
// anchorPos/anchorEndPos/contentHash 持久化，用于跨 session 位置恢复
export interface SerializedAnnotation {
  anchorPos?: number;
  anchorEndPos?: number;
  contentHash?: string;
  id: string;
  type: AnnotationType;
  targetText: string;
  contextBefore: string;
  contextAfter: string;
  fingerprint: string;
  color?: string;
  commentText?: string;
  strokes?: Stroke[];
  createdAt: number;
  updatedAt: number;
}

// ────────── 序列化 ↔ 反序列化 ──────────
export function serializeAnnotation(anno: Annotation): SerializedAnnotation {
  const { anchorStatus, startLine, startCh, endLine, endCh, ...rest } = anno;
  return rest;
}

export function deserializeAnnotation(
  serialized: SerializedAnnotation
): Annotation {
  // 反序列化后锚定状态默认为 LOST，等运行 reanchorAll 时重新计算
  return {
    ...serialized,
    anchorStatus: AnchorStatus.LOST,
    startLine: undefined,
    startCh: undefined,
    endLine: undefined,
    endCh: undefined,
  };
}

// ────────── 文件存储结构 ──────────
// 对应 .annotations/<文件名>.current.json 的结构
export interface AnnotationFile {
  version: number;                     // 数据格式版本，未来升级用
  filePath: string;                    // 关联的 Markdown 文件路径
  annotations: SerializedAnnotation[]; // 批注列表（序列化后的）
  handwriting?: {                      // 阅读模式下的手写数据
    strokes: Stroke[];
    width: number;                     // 画布宽度（用于渲染比例还原）
    height: number;                    // 画布高度
  };
  updatedAt: number;                   // 最后更新时间
}

// ────────── 全局索引 ──────────
// 对应 .annotations/index.json
// 记录 vault 中哪些文件有批注，方便快速列出
export interface AnnotationIndex {
  files: Record<
    string,
    { count: number; updatedAt: number; hasHandwriting: boolean }
  >;
}

// ────────── 工具函数 ──────────

// 生成短 UID：时间戳（base36）+ 随机数
// 为什么不用 UUID？UUID 36 字符太长，在文件名和日志里不易读

// ────────── 手写数据载荷 ──────────
export interface HandwritingData {
  strokes: Stroke[];
  width: number;
  height: number;
}

// ────────── Undo/Redo 动作条目 ──────────
export interface UndoAction {
  type: 'annotation:created' | 'annotation:deleted' | 'annotation:updated';
  timestamp: number;
  payload: any;
}

// ────────── Registry 注册表 ──────────
// 集中管理所有被批注过的文档，实现 id ↔ 路径映射
// 存储在 .annotations/registry.json，以路径为 key 加锁 O(1) 查询
// 目的是让批注数据文件名与文档路径解耦：文件重命名不影响批注
export interface RegistryEntry {
  id: string;         // 文档唯一 ID（生成策略同 generateId）
  createdAt: number;
  updatedAt: number;
}

export interface Registry {
  version: number;
  files: Record<string, RegistryEntry>;  // key = 文件路径（如 "notes/study.md"）
}

// 这个生成器在单线程中够用（并发最多到毫秒级）
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

// 文件路径 → 安全的文件名
// 把路径中的 / 和 \ 替换为 __，避免嵌套目录问题
// 例: "notes/study.md" → "notes__study"
export function sanitizeFileName(filePath: string): string {
  return filePath.replace(/\.md$/i, "").replace(/[\/\\:]/g, "__");
}

// ────────── 插件的设置项 ──────────
// 为什么设置项定义在这里？
// 多个模块需要读设置（工具栏颜色、画布笔触、面板开关等），集中定义方便引用
export interface MDAnnotSettings {
  // 显示控制
  showInEditor: boolean;    // 编辑模式显示批注标记
  autoShowPanel: boolean;   // 有批注时自动打开侧面板

  // 批注样式
  highlightColor: string;          // 高亮背景色
  underlineColor: string;          // 划线的波浪线颜色
  commentHighlightColor: string;   // 文字批注的高亮色

  // 手写输入
  defaultPenColor: string;   // 默认笔触颜色
  defaultPenWidth: number;   // 默认笔触粗细（px）
  defaultHighlighterWidth: number; // 荧光笔宽度
  smoothness: number;        // 笔触平滑度 0.1-1.0

  // 数据存储
  autoSaveInterval: number;  // 自动保存间隔（秒）
  applyColorGlobally: boolean;   // true=所有批注使用当前设置色（默认），false=新建时固定颜色

  // 自定义图标
  highlightIconPath: string;   // 高亮工具栏图标文件路径（vault 内相对路径），空 = 默认 Lucide brush
  highlightIconSize: number;   // 图标显示尺寸 px
  // 国际化
  language: 'zh' | 'en';       // 界面语言
}

// 默认设置值
export const DEFAULT_SETTINGS: MDAnnotSettings = {
  showInEditor: true,
  autoShowPanel: true,
  highlightColor: "#F2EFE9",
  underlineColor: "#D6D2CB",
  commentHighlightColor: "#5A5650",
  defaultPenColor: "#FFFFFF",
  defaultPenWidth: 2,
  defaultHighlighterWidth: 12,
  smoothness: 0.5,
  autoSaveInterval: 30,

  applyColorGlobally: true,
  highlightIconPath: '',
  highlightIconSize: 24,
  language: 'zh',
};
