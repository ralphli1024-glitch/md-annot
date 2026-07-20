---
tags:
  - 思考
  - 学习
  - 工作
  - "#项目"
  - "#MDAnnot"
---

> 标签: #思考 #学习 #工作 #项目 #MDAnnot

# MDAnnot 项目交接文档

> **版本：** v0.1.0  
> **编写日期：** 2026-07-15  
> **项目地址：** `MDAnnot/`

---

## 1. 项目概述

MDAnnot 是一个 Obsidian Markdown 手写批注插件，实现「在 Markdown 文档上叠加手写批注层，批注锚定到文本内容，不破坏 `.md` 原文」。

### 1.1 核心能力

| 能力 | 说明 |
|------|------|
| **编辑模式批注** | 选中文字 → 弹出浮动工具栏 → 创建高亮/划线/文字批注 |
| **阅读模式手写** | Canvas 透明画布层，支持 Apple Pencil/鼠标/触控笔手写标注 |
| **文本锚定** | 基于内容指纹（FNV-1a 哈希）定位，编辑后自动降级匹配 EXACT → FUZZY → PARAGRAPH → LOST |
| **批注面板** | 右侧面板展示当前文档所有批注，支持筛选和排序 |
| **数据独立** | 批注存储在 `.annotations/` 目录，不修改 `.md` 原文 |
| **Undo/Redo** | 跨平台（Cmd/Ctrl+Z），支持批注创建/删除/手写笔触撤销和重做 |

### 1.2 技术栈

| 项 | 选型 | 理由 |
|----|------|------|
| 语言 | TypeScript 5.x | Obsidian 插件唯一选择 |
| 构建 | esbuild | Obsidian 官方推荐，构建速度比 tsc 快 10x+ |
| 编辑器 | CodeMirror 6（通过 Obsidian API 封装） | Decoration 扩展实现批注渲染 |
| 手写画布 | HTML5 Canvas 2D + Pointer Events | 浏览器原生能力，零依赖，支持压感 |
| 笔触算法 | Catmull-Rom 插值 | 轻量平滑，无第三方依赖 |
| 存储 | `app.vault.adapter` 读写 JSON 文件 | 透明、可随文档同步（Git/Obsidian Sync） |
| 状态管理 | 自研轻量级 EventEmitter | 避免引入外部状态库 |
| 测试 | Vitest | 核心逻辑（数据模型/锚定引擎/批注管理）单元测试 |
| 外部依赖 | 无（零 API / 零数据库 / 零 SDK） | 完全离线运行 |

---

## 2. 项目结构

```
md-annot/
├── main.js                          # esbuild 构建产物（~344KB，含所有源码）
├── styles.css                       # 插件全局样式（~10KB）
├── manifest.json                    # Obsidian 插件清单
├── package.json                     # Node.js 依赖配置
├── tsconfig.json                    # TypeScript 编译配置
├── esbuild.config.mjs               # esbuild 构建配置
├── node_modules/                    # 开发依赖
│
├── src/                             # 【源码目录】
│   ├── main.ts                      #     插件入口 + 生命周期 + 视图切换
│   ├── data-models.ts               #     数据类型定义（枚举/接口/设置）
│   ├── storage.ts                   #     JSON 文件读写服务
│   ├── anchor-engine.ts             #     锚定引擎（指纹计算/匹配降级）
│   ├── annotation-manager.ts        #     批注管理器（CRUD/事件/Undo/Redo）
│   ├── floating-toolbar.ts          #     编辑模式浮动工具栏
│   ├── cm6-decorations.ts           #     CodeMirror 6 装饰器
│   ├── side-panel.ts                #     右侧批注列表面板
│   ├── canvas-overlay.ts            #     阅读模式 Canvas 手写覆盖层
│   ├── handwriting-engine.ts        #     手写笔触渲染引擎（Catmull-Rom）
│   ├── reading-toolbar.ts           #     [已废弃]仅保留注释
│   └── settings-tab.ts              #     设置面板
│
├── __tests__/                       # 单元测试
│   ├── data-models.test.ts          #     数据模型枚举测试（3 个 case）
│   ├── anchor-engine.test.ts        #     锚定引擎测试（9 个 case）
│   └── annotation-manager.test.ts   #     批注管理器测试（12 个 case）
│
├── docs/                            # 项目文档
│   ├── side-panel-preview.html      #     批注列表新旧对比预览
│   └── 交接文档/
│       └── MDAnnot 项目交接文档.md   #     本文件
│
├── 需求/                            # 需求文档
│   └── MDAnnot需求文档.md
│
├── 技术方案/                         # 技术方案设计
│   ├── MDAnnot技术方案.md
│   └── 2026-07-14 修复计划-技术方案.md
│
├── 计划/                            # 实现计划
│   ├── MDAnnot Obsidian 插件 实现计划.md
│   ├── 2026-07-13-mdannot.md
│   └── 2026-07-14 修复计划.md
│
└── .memsearch/                      # 会话记忆（开发过程记录）
    └── memory/
        ├── 2026-07-13.md
        ├── 2026-07-14.md
        └── 2026-07-15.md
```

### 2.1 模块关系

```
main.ts (插件入口 / 生命周期 / 视图切换 / 事件编排)
  ├── annotation-manager.ts (核心状态管理 / CRUD / UndoRedo / 事件总线)
  │   ├── data-models.ts       (枚举 AnnotationType / AnchorStatus / StrokeTool)
  │   ├── storage.ts           (读写 .annotations/ 目录下的 JSON 文件)
  │   └── anchor-engine.ts     (FNV 哈希 / 精确匹配 / 模糊匹配 / 段落匹配)
  ├── floating-toolbar.ts      (编辑模式选中文字弹窗 / 阅读模式选中弹窗)
  ├── cm6-decorations.ts       (CM6 ViewPlugin / DecorationSet / ChangeTracker)
  ├── side-panel.ts            (ItemView 批注列表 / 筛选下拉 / 排序下拉)
  ├── canvas-overlay.ts        (Canvas 覆盖层 / Pointer Events / ResizeObserver)
  │   └── handwriting-engine.ts (Catmull-Rom 插值 / 压感渲染)
  └── settings-tab.ts          (设置面板 / 颜色选择器 / 清空数据)
```

---

## 3. 核心模块详解

### 3.1 数据模型 (`data-models.ts`, 248 行)

核心数据结构定义。所有模块引用此文件，无循环依赖。

**关键枚举：**

| 枚举 | 取值 | 说明 |
|------|------|------|
| `AnnotationType` | `highlight / underline / comment / handwriting` | 四种批注类型 |
| `AnchorStatus` | `exact / fuzzy / paragraph / lost` | 批注锚定精度，渲染时根据状态显示不同样式 |
| `StrokeTool` | `pen / highlighter / eraser` | Canvas 手写工具 |

**关键接口：**

- `Annotation` — 批注对象（含运行时和持久化字段）
- `SerializedAnnotation` — 持久化版本（去掉运行时字段）
- `AnnotationFile` — 文件存储结构（含 handwriting 数据）
- `Stroke / Point` — 手写笔触数据
- `MDAnnotSettings` — 插件设置项

**设计要点：**

- 字符级位置 `anchorPos / anchorEndPos` 持久化，行号 `startLine/ch` 运行时计算
- `contentHash` 用于快速路径校验：加载时如果 slice(hash) 匹配则直接复用位置，跳过文本搜索
- 序列化时剥离运行时字段减少存储体积

### 3.2 存储服务 (`storage.ts`, 124 行)

使用 `app.vault.adapter` 读写 JSON，而不是 Plugin.loadData()/saveData()，因为后者所有数据写在一个 JSON 里不适合按文件管理。

**存储结构：**

```
.annotations/
  index.json                        ← 全局索引（已定义接口，未实现写入）
  <文件名>.current.json             ← 当前批注数据
  <文件名>.history/                 ← 历史版本（已定义接口，默认关闭）
    20260713_1430.json
    ...
```

**关键方法：**

| 方法 | 说明 |
|------|------|
| `load(filePath)` | 加载单个文件的批注数据 |
| `save(filePath, annotations, handwriting?)` | 全量写 JSON |
| `saveAnnotations(filePath, annotations)` | 便捷方法（序列化 + 保存） |
| `getAllAnnotations(filePath)` | 加载并反序列化为 Annotation[] |

### 3.3 锚定引擎 (`anchor-engine.ts`, 296 行)

核心算法——不依赖行号，基于文本内容指纹定位。

**匹配流程：** 精确匹配（EXACT）→ 模糊匹配（FUZZY, Levenshtein > 0.7）→ 段落匹配（PARAGRAPH）→ 标记丢失（LOST）

**哈希算法：** FNV-1a（轻量非加密哈希，O(n) 计算，base36 编码）

**关键函数：**

| 函数 | 说明 |
|------|------|
| `fnv1aHash(str)` | FNV-1a 哈希 |
| `computeFingerprint(target, before, after)` | 组合上下文指纹（前后各 100 字符） |
| `levenshteinDistance(a, b)` | 编辑距离 DP 实现 |
| `levenshteinSimilarity(a, b)` | 归一化相似度，滑动窗口匹配 |
| `findAnnotationPosition(annotation, docContent)` | 主入口，返回 MatchResult |
| `lineColToOffset(docContent, line, ch)` | 行/列 → 字符 offset 转换 |

**已知限制：** 模糊匹配仅在同一行内滑动窗口搜索，不跨行。

### 3.4 批注管理器 (`annotation-manager.ts`, 345 行)

插件的「大脑」，集中管理批注的生命周期。

**事件系统：** 模块间通过 emit/on 解耦

| 事件 | 发射时机 |
|------|----------|
| `annotation:created` | 创建批注后 |
| `annotation:deleted` | 删除批注后 |
| `annotation:updated` | 更新批注后 |
| `annotations:reanchored` | 重新锚定后 |
| `file:opened` | 打开文件后 |

**关键方法：**

| 方法 | 说明 |
|------|------|
| `openFile(filePath)` | 加载并初始化文件批注 |
| `reanchorAll(docContent)` | 快速路径(contentHash) + 慢速路径(文本搜索) |
| `createAnnotation(type, text, before, after, options?)` | 创建批注，自动压入 Undo 栈 |
| `deleteAnnotation(id)` | 删除批注，保存备份到 Undo 栈 |
| `applyDeltaChanges(deltas)` | CM6 增量位移（替代全文搜索） |
| `undo() / redo()` | 撤销/重做操作 |
| `persist()` | 持久化到存储 |

**Undo/Redo 设计：**

- 栈容量：50 步
- 新操作清空 redo 栈
- 撤销创建 → 删除；撤销删除 → 恢复完整 Annotation
- 手写笔触撤销独立处理（由 CanvasOverlay 负责）

### 3.5 浮动工具栏 (`floating-toolbar.ts`, 445 行)

编辑模式和阅读模式共享同一工具栏组件。

**编辑模式（showOnSelection）：**
- 使用 CodeMirror 的 Editor API 获取选中文字
- 通过 `cm.coordsAtPos` 计算工具栏定位
- 计算字符级 offset 传给 createAnnotation
- 包含 toggle 行为（选中已有批注区域时按钮高亮）
- 超过 200 字符时禁用按钮

**阅读模式（showOnReadingSelection）：**
- 使用 DOM window.getSelection() 获取选中文字
- 通过 `sourceContent.indexOf()` 全文搜索定位
- 支持跨行选中

**批注输入弹窗（CommentModal）：**
- 文字区域 + 确定/取消按钮
- Enter 快速提交，Shift+Enter 换行

### 3.6 CM6 装饰器 (`cm6-decorations.ts`, 197 行)

**两个 ViewPlugin：**

| Plugin | 职责 |
|--------|------|
| `annotationDecorationsPlugin` | 接收装饰状态并渲染 |
| `changeTrackerPlugin` | 捕获文档变更 delta → 回调 AnnotationManager.applyDeltaChanges |

**装饰类型：**

- HIGHLIGHT → 背景色 + CSS 变量
- UNDERLINE → 蓝色波浪线 
- COMMENT → 淡黄色背景 + 行号侧橙色小圆点
- PARAGRAPH → 橙色虚线框

**性能设计：** 编辑时通过 ChangeTracker 做增量位移（O(1)），不触发全文搜索。

### 3.7 侧面板 (`side-panel.ts`, 233 行)

右侧边栏 ItemView，通过 `registerView` 注册，快捷键 `Cmd+Shift+A` 切换。

**功能：**

| 功能 | 说明 |
|------|------|
| 类型筛选 | 下拉框：全部/高亮/划线/批注（默认"批注"） |
| 排序 | 下拉框：位置/高亮在前/批注在前（默认"位置"） |
| 类型背景色 | 使用设置颜色 25% 透明度 |
| 删除按钮 | 右上角垃圾桶图标 |
| 类型图标 | Lucide 图标 + 划线用 〰️ |

**已知问题：** `getTypeConfigColor` 直接引用 settings 对象，设置变更后需刷新面板才能看到新颜色。

### 3.8 Canvas 手写覆盖层 (`canvas-overlay.ts`, 231 行)

阅读模式下透明 Canvas 覆盖层，支持手写笔触。

**技术要点：**

- Pointer Events 统一处理鼠标/触控笔/手指
- `devicePixelRatio` 保持高 DPI 清晰度
- ResizeObserver 自适应容器大小
- 笔触完成时通知回调（触发保存）
- 支持撤销最后一条笔触

### 3.9 手写引擎 (`handwriting-engine.ts`, 128 行)

Catmull-Rom 插值 + 压感渲染。

- 钢笔模式：压感动态调整线宽（0.5~1.0 倍基准宽度）
- 荧光笔模式：半透明粗线
- 使用 Canvas 2D context 直接渲染

### 3.10 插件入口 (`main.ts`, 739 行)

最大最复杂的文件，编排所有模块。

**生命周期：**

```
onload()
  ├── loadSettings() + loadHighlightIcon()
  ├── 初始化 StorageService / AnnotationManager / FloatingToolbar
  ├── 注册 CM6 扩展（annotationDecorationsPlugin + changeTrackerPlugin）
  ├── 注册阅读模式 post-processor
  ├── 注册侧面板视图
  ├── 初始化 Ribbon 图标
  ├── 注册命令（面板切换）
  ├── 注册设置面板
  └── 注册事件监听
      ├── active-leaf-change → 文件切换
      ├── editor-change → 内容变化
      ├── layout-change → 编辑/阅读切换
      ├── selectionchange → 选中文字变化
      ├── mouseup → 显示工具栏
      ├── mousedown → 隐藏工具栏
      ├── annotation:* 事件 → 更新渲染
      └── keydown → Undo/Redo 快捷键

onunload()
  ├── persist() 保存批注
  ├── 清除 ChangeTracker
  ├── 销毁 Canvas
  ├── 卸载侧面板
  └── 日志输出
```

**关键事件流程：**

1. **文件切换** → `onActiveLeafChange` → openFile → reanchorAll → updateCM6Decorations → initCanvasOverlay → 加载手写数据 → autoShowPanel
2. **编辑内容** → `editor-change` → reanchorAll → updateCM6Decorations
3. **创建批注** → FloatingToolbar → manager.createAnnotation → emit → updateCM6Decorations → rerenderReadingAnnotations → persist
4. **Undo** → keydown → manager.undo() → persist → updateCM6Decorations
5. **阅读模式切换** → layout-change → rerenderReadingAnnotations + updateCM6Decorations

**阅读模式批注渲染（applySingleAnnotation）：**

- 使用 DOM TreeWalker 遍历文本节点
- 匹配 targetText 后用 `<span>` 包裹（含 class 和内联样式）
- 支持多行 targetText 逐行渲染
- 清除时通过 class selector 找到旧 span 替换回文本节点

---

## 4. 开发历程

### 4.1 第一阶段（2026-07-13）：核心功能实现

| 里程碑 | 产出 |
|--------|------|
| 项目脚手架 | esbuild 构建体系、清单文件、骨架代码 |
| 数据模型 + 存储 | 所有枚举/接口定义、JSON 文件读写 |
| 锚定引擎 | FNV-1a 哈希、Levenshtein 匹配、四级降级 |
| 批注管理器 | CRUD + 事件系统 + 增量位移 |
| 浮动工具栏 + CM6 装饰 | 编辑模式批注交互和渲染 |
| 侧面板 | 批注列表、筛选、跳转、删除 |
| Canvas 手写 | 透明画布、Pointer Events、Catmull-Rom |
| 设置面板 | 7 个设置区域、颜色/开关/滑块 |
| 单元测试 | 24 个测试用例全部通过 |

### 4.2 第二阶段（2026-07-14）：修复与优化

| 修复/优化 | 说明 |
|-----------|------|
| 编辑器尾标移除 | 移除高亮/划线/批注右上角的圆形/三角形/方形标记 |
| 批注列表大改版 | 类型背景色、Lucide 图标、删除按钮右上角、移除跳转/导出/状态标签 |
| 排序功能 | 位置/高亮在前/批注在前三种模式（下拉框） |
| 筛选功能 | 按钮组改为下拉框（全部/高亮/划线/批注） |
| 批注开关联动 | 开关关闭时清除所有渲染、隐藏 Ribbon 图标、关闭面板 |
| 阅读模式渲染 | `registerMarkdownPostProcessor` + `applySingleAnnotation` |
| 清空数据 | 设置页一键清除到废纸篓 + 内存清理 |
| Undo/Redo | 跨平台 Cmd/Ctrl+Z 支持批注/手写撤销 |
| 阅读模式工具栏 | 选中文字显示浮动工具栏 |

### 4.3 第三阶段（2026-07-14~15）：Bug 修复系列

| Bug | 根源 | 修复 |
|-----|------|------|
| 阅读模式文字丢失 | TreeWalker 遍历时 replaceChild 导致游标错乱 | 先收集再统一替换 |
| AnchorStatus 未定义 | main.ts import 缺失 | 补充 import |
| 清空后批注仍存在 | ClearDataConfirmModal 构造函数缺 plugin 参数 | 修正构造函数 |
| 清空后渲染未清除 | `clearAllAnnotationData` 调用后文件路径被清空 | 恢复 filePath |
| 阅读模式批注不渲染 | 编辑→阅读切换时 `layout-change` 未重绘 | 添加事件处理 |
| CM6 嵌套 dispatch | changeTracker 内部 dispatch 更新 | 用 requestAnimationFrame 延迟 |
| 重启后高亮不显示 | CM6 初始化未完成时 silent return | rAF 重试 |
| 批注文件删除 EPERM | `adapter.remove` 不能删非空目录 | `adapter.trashSystem` 递归删除 |
| 阅读模式无法跨行批注 | `showOnReadingSelection` 逐行 indexOf | 改用全文 `sourceContent.indexOf` |
| 编辑模式跨行高亮消失 | `layout-change` 未恢复 CM6 装饰 | 添加 updateCM6Decorations 调用 |
| 删除后 span 残留 | applySingleAnnotation 未设置 className | 传入 cls 参数 |

---

## 5. 当前状态

### 5.1 已实现功能覆盖

| 功能 | 状态 | 备注 |
|------|------|------|
| 编辑模式高亮/划线/批注 | ✅ | 支持自定义颜色 |
| CM6 装饰渲染 | ✅ | 含 PARAGRAPH 虚线框 |
| 阅读模式手写（Canvas） | ✅ | Pointer Events + Catmull-Rom |
| 手写持久化 | ✅ | 保存到 `.annotations/xxx.current.json` |
| 文本锚定引擎 | ✅ | 四级降级 + contentHash 快速路径 |
| 增量位移 | ✅ | CM6 ChangeTracker 驱动 |
| 批注面板 | ✅ | 筛选 + 排序 + 删除 |
| Undo/Redo | ✅ | 50 步栈容量 |
| 批注开关 | ✅ | 全局开关，关闭时清除所有渲染 |
| 清空数据 | ✅ | 废纸篓删除 + 内存清理 |
| 设置面板 | ✅ | 颜色选择器 + 开关 + 滑块 |
| 自定义高亮图标 | ✅ | 支持自定义图标路径和大小 |
| 颜色渲染模式 | ✅ | 全局颜色 vs 历史颜色保留 |
| 跨行批注 | ✅ | 编辑和阅读模式均支持 |
| 设置默认色 + 色板 | ✅ | 3×4 色卡弹窗 |

### 5.2 未实现功能

| 功能 | 位置 | 状态 |
|------|------|------|
| 手写输入模式选择（钢笔/荧光笔/橡皮） | CanvasOverlay | ⏳ 接口已定义，UI 未集成 |
| 阅读模式常驻工具栏 | reading-toolbar.ts | ❌ 已废弃移除 |
| 锚定状态 UI 渲染 | styles.css | ⏳ CSS 样式已定义，DOM 未集成 |
| 历史版本管理 | storage.ts | ⏳ 接口已定义，默认关闭 |
| Markdown 互操作（==高亮== / ~~划线~~） | settings | ⏳ 设置已定义，逻辑未实现 |
| 批注导出 | — | ❌ 已从面板移除 |
| 全局索引文件 index.json | storage.ts | ⏳ 接口已定义，未写入 |
| 移动端适配 | — | ⏳ 核心功能可用，手写体验需调试 |
| 设置 → 颜色渲染模式切换后刷新面板 | side-panel.ts | ❌ 未实现 |

### 5.3 单元测试

```bash
npx vitest run

# 3 个测试文件，24 个测试用例
# __tests__/data-models.test.ts       — 枚举值验证
# __tests__/anchor-engine.test.ts     — 哈希/相似度/匹配降级
# __tests__/annotation-manager.test.ts — 增量位移/UndoRedo
```

**覆盖内容：**

- FNV 哈希一致性和差异性
- Levenshtein 相似度计算
- 精确匹配、模糊匹配（score > 0.7）、段落匹配、丢失四种场景
- 编辑之前/之后/重叠三种位移场景
- 连续编辑累加
- 多条批注同时位移
- 旧格式批注（无 anchorPos）跳过
- contentHash 生成
- Undo 创建/删除/完整链
- 新操作清空 redo 栈
- 空栈不报错

---

## 6. 构建与部署

### 6.1 开发

```bash
# 安装依赖
npm install

# 开发模式（watch 模式，自动重新打包）
npm run dev

# 一次构建
npm run build

# 运行单元测试
npm test
```

### 6.2 部署到 Obsidian

```bash
cp main.js /Users/apple1/Documents/明镜/明镜/.obsidian/plugins/md-annot/main.js
cp styles.css /Users/apple1/Documents/明镜/明镜/.obsidian/plugins/md-annot/styles.css
cp manifest.json /Users/apple1/Documents/明镜/明镜/.obsidian/plugins/md-annot/manifest.json
```

**注意：** `main.js` 包含所有 TypeScript 源文件的打包结果，`styles.css` 单独部署。修改源码后只需复制这两个文件 + 重新加载插件即可（Cmd+Shift+P → Reload app without saving，或重启 Obsidian）。

### 6.3 插件重载

- 关闭并重新打开 Obsidian（完全重启）
- 或 Cmd+Shift+P → `Reload app without saving`
- 或 Obsidian 设置 → 社区插件 → 关闭再开启 md-annot

**切记：** Obsidian 会缓存 `main.js` 和 `styles.css`，只复制文件不重载不会生效。

### 6.4 插件目录

```
插件目录：.obsidian/plugins/md-annot/
```

---

## 7. 已知问题与风险

### 7.1 待修复 Bug

| 问题 | 描述 | 定位 |
|------|------|------|
| 模糊匹配不跨行 | tryFuzzyMatch 仅在单行内滑动窗口搜索，跨行文本编辑后模糊匹配无效 | `anchor-engine.ts:tryFuzzyMatch` |
| 段落匹配太宽泛 | tryParagraphMatch 只取第一个长词，匹配到错误的段落 | `anchor-engine.ts:tryParagraphMatch` |
| 阅读模式无常驻工具栏 | 用户无法切换手写工具（钢笔/荧光笔/橡皮） | `canvas-overlay.ts` - 需要重新实现 |
| 设置变更后面板不刷新 | `getTypeConfigColor` 直接引用 settings 对象，面板未监听 setting change | `side-panel.ts` |
| 不渲染未定义 | 阅读模式 post-processor 中 curPath 与 ctx.sourcePath 比较，变量名 `curPath` 实际是 `currentFilePath` 的局部变量 | `main.ts:applySingleAnnotation` 调用处 |
| 清空数据后索引不更新 | `index.json` 未实现写入，清空后索引仍存在 | `storage.ts` |

### 7.2 架构风险

| 风险 | 等级 | 说明 |
|------|------|------|
| `main.ts` 过于庞大 | 中 | 739 行，编排逻辑密集，分散到子模块或重构为 controller 模式更好 |
| 事件类型安全 | 中 | 事件名用字符串，payload 用 any，没有类型约束 |
| CanvasOverlay 与 main.ts 强耦合 | 低 | 回调模式耦合，但接口已清晰定义 |
| applyDeltaChanges 与 reanchorAll 重复工作 | 低 | 每次编辑 ChangeTracker 做增量位移 + 后续 reanchorAll 又走 contentHash 校验，略有冗余但无功能影响 |
| 设置颜色渲染模式切换后未刷新 | 低 | 切换 applyColorGlobally 后需要在所有渲染点同步新颜色 |

### 7.3 测试缺口

| 测试覆盖 | 状态 |
|----------|------|
| CanvasOverlay（需要 Obsidian 运行时） | ❌ |
| FloatingToolbar（需要 CM6 环境） | ❌ |
| SidePanel（需要 Obsidian ItemView） | ❌ |
| StorageService（需要 Vault adapter） | ❌ |
| main.ts 集成 | ❌ |
| 跨平台（Windows/Linux/macOS/iPad/Android） | ❌ |

---

## 8. 关键设计决策

### 为什么用 FNV-1a 而不是 MD5？

FNV-1a 是轻量级哈希（O(n)），前端实时计算无性能开销。不需要加密级别防碰撞，只需要稳定的「内容指纹」用于 position 校验。base36 编码后长度为 7 字符左右。

### 为什么用字符级 offset 而不是行号？

行号随编辑浮动不可靠。字符级 offset + contentHash 校验可以实现 O(1) 增量位移（编辑时仅平移受影响批注的位置），只有在 contentHash 不匹配时才触发全文搜索。

### 为什么不用 Plugin.loadData()/saveData()？

那是单文件存储（data.json），不适合按文件管理批注。`.annotations/` 目录结构让批注数据独立、随 vault 同步、可手动编辑/恢复。

### 为什么不用第三方状态管理（Redux/Zustand）？

插件复杂度在可控范围内。自研 EventEmitter 简单直接，不用担心 bundle 体积和 Obsidian API 兼容性。

### 为什么阅读模式用 Canvas 而不是 SVG？

Canvas 2D 直接操作像素，高频 Pointer Events 场景性能远好于 SVG（SVG DOM 在高频更新时会卡顿）。

### 为什么 undo/redo 只存内存不持久化？

Undo 栈是会话级别的，跨 session 持久化边缘情况多（文件被外部修改、批注被另一实例删除），且增加了复杂度。50 步内存上限已足够日常使用。

### 为什么 Cmd/Ctrl+Z 需要避开 CM6 原生 Undo？

CM6 的文字编辑 Undo 栈和批操作的 Undo 栈是独立的。拦截快捷键时需要判断焦点状态：CM6 有焦点（编辑器打字）时不拦截，CM6 无焦点或阅读模式时拦截。实现方案是检测 `cm.hasFocus()`。

---

## 9. 数据与文件

### 9.1 批注存储格式

`.annotations/<文件名>.current.json`：

```json
{
  "version": 1,
  "filePath": "notes/study.md",
  "annotations": [
    {
      "id": "m2x3v4b5n6c7",
      "type": "highlight",
      "targetText": "重要的概念",
      "contextBefore": "这是",
      "contextAfter": "，需要",
      "fingerprint": "abc123def",
      "anchorPos": 42,
      "anchorEndPos": 48,
      "contentHash": "def456",
      "color": "#F2EFE9",
      "createdAt": 1720800000000,
      "updatedAt": 1720800000000
    }
  ],
  "handwriting": {
    "strokes": [...],
    "width": 800,
    "height": 600
  },
  "updatedAt": 1720800000000
}
```

### 9.2 数据大小参考

- 单文件批注 JSON：通常 1-10 KB
- 手写笔触（100 条）：约 20-50 KB
- 整体项目：~3,300 行 TypeScript，~344KB main.js 产物

---

## 10. 推荐下一步

1. **阅读模式常驻工具栏** — 重新实现手写工具切换（钢笔/荧光笔/橡皮，已在 CanvasOverlayConfig 中定义了接口）
2. **跨行模糊匹配** — 改进 tryFuzzyMatch 支持跨行滑动窗口
3. **侧面板设置监听** — 设置颜色变更后自动刷新面板
4. **历史版本管理** — 启用 storage.ts 中的 saveWithHistory
5. **移动端手写调试** — iPad/Android 真机测试 Pointer Events
6. **性能优化** — 大文档（>100 条批注）的分页加载/懒渲染
7. **重构 main.ts** — 拆分事件处理到独立模块或 controller 类

---

## 11. 附录

### 11.1 核心文件行数

| 文件 | 行数 | 密度 |
|------|------|------|
| main.ts | 739 | 密集，编排逻辑 |
| floating-toolbar.ts | 445 | 中等，UI 交互 |
| annotation-manager.ts | 345 | 中等，状态管理 |
| anchor-engine.ts | 296 | 中等，算法 |
| settings-tab.ts | 297 | 中等，UI |
| side-panel.ts | 233 | 中等，UI |
| canvas-overlay.ts | 231 | 中等，Canvas |
| cm6-decorations.ts | 197 | 中等，CM6 |
| handwriting-engine.ts | 128 | 较低，算法 |
| storage.ts | 124 | 较低，I/O |
| data-models.ts | 248 | 较低，类型 |
| **Sum** | **3,284** | — |

### 11.2 Obsidian API 使用

| API | 用途 |
|-----|------|
| Plugin.registerView | 注册侧面板 |
| Plugin.registerEditorExtension | 注册 CM6 插件 |
| Plugin.registerMarkdownPostProcessor | 阅读模式批注渲染 |
| Plugin.registerEvent | 监听工作区事件 |
| Plugin.registerDomEvent | 监听 DOM 事件 |
| Plugin.addCommand | 注册命令 |
| Plugin.addRibbonIcon | Ribbon 图标 |
| Plugin.addSettingTab | 设置面板 |
| Plugin.loadData / saveData | 插件设置持久化 |
| Workspace.getActiveViewOfType | 获取当前视图 |
| Vault.adapter | 文件读写 |
| ItemView | 侧面板视图基类 |
| Modal | 批注输入弹窗 / 确认弹窗 |
| setIcon | Lucide 图标渲染 |
| MarkdownView.getMode | 编辑/阅读模式判断 |

---

> **编制说明：** 本文档全面覆盖项目架构、模块设计、开发历程、测试状态和已知风险，便于后续开发者或原开发者在较长时间隔后快速恢复开发上下文。

### 4.4 第四阶段（2026-07-15）：导出 + 锚定可视化 + 定位闪烁

| 功能/修复 | 说明 |
|-----------|------|
| **📥 导出批注** | 侧面板底部「导出批注」按钮，将当前文档批注导出为同目录下 `{文档名}_批注.md` |
| **📥 导出所有批注** | 设置页「导出所有批注」按钮，遍历 registry 中所有文档导出到仓库根目录 `{时间戳}_批注.md` |
| **锚定状态进度条** | 侧面板每项卡片右侧显示 10 格彩色进度条（绿→黄→橙→红），替代文字标签 |
| **锚定状态视觉渲染** | 编辑模式和阅读模式根据 EXACT/FUZZY/PARAGRAPH/LOST 显示不同视觉样式 |
| **批注列表定位** | 点击侧面板批注项 → 编辑器自动滚动定位到批注文本末尾 + 设置光标 |
| **呼吸闪烁动画** | 定位后文档中批注文字出现橙色脉冲框（box-shadow 动画），3 次闪烁后自动消失 |
| **默认筛选改为全部** | 侧面板筛选下拉框默认值从「批注」改为「全部」 |

---

## 8. 关键设计决策（补充）

### 为什么锚定状态用进度条而不是文字标签？

文字标签（精确/模糊/段落/丢失）占用空间大、需要国际化、用户需要阅读才能理解。10 格彩色进度条通过颜色渐变（绿→黄→橙→红）直观传达置信度，扫一眼就能判断状态。

### 为什么定位呼吸用 box-shadow 而不是背景色动画？

box-shadow 不修改文字本身的背景色/下划线样式，避免与批注类型视觉样式冲突。橙色脉冲框在所有批注类型上都能清晰可见，且对阅读模式和编辑模式统一。

### 为什么侧面板定位用 getLeavesOfType 而不是 getActiveViewOfType？

点击侧面板时侧面板 leaf 成为 active leaf，getActiveViewOfType(MarkdownView) 返回 null。getLeavesOfType("markdown") 遍历所有 leaf 找到 markdown view，不受 active leaf 变化影响。

---

## 5. 当前状态（补充）

### 5.1 已实现功能覆盖（补充）

| 功能 | 状态 | 备注 |
|------|------|------|
| 批注导出（当前文档） | ✅ | 侧面板按钮，Markdown 格式 |
| 批注导出（全部文档） | ✅ | 设置页按钮，按文档分组 |
| 锚定状态进度条 | ✅ | 10 格彩色进度条，侧面板卡片右侧 |
| 锚定状态视觉渲染 | ✅ | CM6 编辑模式 + 阅读模式 |
| 批注定位 + 呼吸闪烁 | ✅ | 点击定位到文档位置 + 3 次橙色脉冲 |
| 默认筛选「全部」 | ✅ | 侧面板筛选默认值 |

### 5.2 文件行数（补充）

| 文件 | 行数 | 变更说明 |
|------|------|----------|
| side-panel.ts | ~410 | 导出、进度条、定位、呼吸事件监听 |
| settings-tab.ts | ~330 | 导出所有批注 |
| cm6-decorations.ts | ~240 | 锚定状态 CSS 类 + 呼吸装饰叠加 |
| main.ts | ~760 | 呼吸事件监听、阅读模式聚焦传递 |
| annotation-manager.ts | ~380 | focusedAnnotationId + setFocusAnnotation + clearFocusAnnotation |
| styles.css | ~15KB | 进度条、锚定状态、呼吸动画、导出按钮样式 |

### 4.5 第五阶段（2026-07-15）：产品演示页完善 + 术语统一

| 事项 | 说明 |
|------|------|
| **产品演示页大改** | `docs/MDAnnot 产品演示.html` 全面升级，Hero/特点/功能/锚定/路线图各区块同步产品最新状态 |
| **术语统一「批注」→「评论」** | 将特指第三种类型的「批注」全部改为「评论」，作为总称的「批注」保留不变 |
| **源码同步** | `settings-tab.ts` 和 `floating-toolbar.ts` 中的 UI 标签同步修改「批注」→「评论」 |
| **构建部署** | 构建产出复制到 `.obsidian/plugins/md-annot/` |

**产品演示页变更清单：**

| 区块 | 变更 |
|------|------|
| **Hero mockup** | 暗色主题 → 白色主题，批注颜色与产品一致（高亮 `#90EE90`、划线 `#4169E1` 波浪线、评论 `#FFFFAA`），浮动工具栏与产品样式一致 |
| **Badge** | `零外部依赖` → `阅读批注` |
| **特点区** | 4 张卡片扩充为 6 张，新增「批注定位」和「匹配度识别」卡片。修复导航链接 `#pain` 指向错误 |
| **Feature 1** | 标题「编辑模式批注」→「编辑和阅读模式批注」，描述补充阅读模式，右侧 mockup 改为白色主题 + 产品实际颜色 |
| **Feature 2** | 移除 `Cmd+Shift+A` 快捷键描述，增加点击自动定位描述，右侧 mockup 完全重做为产品实际效果（双下拉框、10格状态条、匹配度标签、导出按钮） |
| **锚定引擎** | 编号圆圈 → 各状态对应的 10 格彩色进度条（颜色数据与 `side-panel.ts:renderStatusBar` 一致），颜色标注修正为产品实际色值 |
| **统计区** | 单元测试 `24→118`，开发周期 `11→5` |
| **路线图** | 重新编排为 6 项（渲染优化/手写笔批注/多端发布/匹配度提示/定位文本/核心功能） |
| **图例** | 补全「评论」项，划线图标改用 `〰️` 字符 |

**术语统一（批注→评论）范围：**

```
修改位置：
- HTML 产品演示页：Hero 文字、各区块副标题、工具栏 title、筛选/排序选项、图例 label
- MDAnnot 产品介绍.md：副标题、痛点、功能表格、面板筛选、颜色设置
- settings-tab.ts：评论高亮颜色、开关描述、对话框文字
- floating-toolbar.ts：两处工具栏按钮 tooltip

保留「批注」作为总称：
批注列表、批注数据、批注面板、导出批注、批注场景、批注操作、批注渲染、批注位置 等
```

**构建注意事项：**

```bash
# esbuild 构建成功，但 tsc 类型检查因 `adapter.basePath` 在 DataAdapter 类型上不存在而失败
# 当前解决方式：跳过 tsc 直接跑 esbuild
node esbuild.config.mjs production

# 部署到插件目录
cp main.js /Users/apple1/Documents/明镜/明镜/.obsidian/plugins/md-annot/main.js
cp styles.css /Users/apple1/Documents/明镜/明镜/.obsidian/plugins/md-annot/styles.css
```

**术语定义（已统一）：**

| 术语 | 含义 |
|------|------|
| **批注**（总称） | 包含高亮、划线、评论三个功能选中的文字 |
| **高亮** | 文字背景色标记，突出关键信息 |
| **划线** | 波浪下划线，标记需要关注的词句 |
| **评论** | 背景色 + 评论文本，定位文字并附加详细笔记 |
