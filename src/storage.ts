/*
 * storage.ts — 批注数据的持久化存储
 *
 * 存储结构（v2）：
 *   .annotations/
 *     registry.json                  ← id ↔ 路径映射（核心，解耦批注与文件名）
 *     {id}.current.json              ← 批注数据，以 id 命名
 *     {id}.history/                  ← 历史版本
 *       20260713_1430.json
 *       ...
 *
 * 为什么引入 registry？
 *   之前版本以 <santized-path>.current.json 命名批注文件，
 *   文件重命名后要迁移文件，不仅慢而且有竞态风险。
 *   registry 方案：id 永远不变，重命名只改 registry 中的路径一条记录。
 *
 * 迁移策略：
 *   首次加载时自动扫描 <santized-path>.current.json 旧格式文件，
 *   生成 id、建立 registry、重命名为 {id}.current.json。
 */

import { Vault, Notice } from "obsidian";
import {
  AnnotationFile,
  Annotation,
  SerializedAnnotation,
  deserializeAnnotation,
  Registry,
  RegistryEntry,
  sanitizeFileName,
  generateId,
} from "./data-models";

const ANNOTATIONS_DIR = ".obsidian/md_annot";
const OLD_ANNOTATIONS_DIR = ".annotations";
const REGISTRY_FILE = `${ANNOTATIONS_DIR}/registry.json`;
const CURRENT_VERSION = 2;
const REGISTRY_VERSION = 1;

export class StorageService {
  private vault: Vault;

  // registry 缓存，避免每次操作都读文件
  private registry: Registry | null = null;

  constructor(vault: Vault) {
    this.vault = vault;
  }

  // ══════════════════════════════════════════════
  //  Registry 管理
  // ══════════════════════════════════════════════

  // 获取 registry，首次调用时执行旧格式迁移
  private async getRegistry(): Promise<Registry> {
    if (this.registry) return this.registry;

    // .annotations/ -> .obsidian/md_annot/ 
    await this.migrateFromOldDir();

    await this.ensureDir(ANNOTATIONS_DIR);

    const exists = await this.vault.adapter.exists(REGISTRY_FILE);
    if (exists) {
      const content = await this.vault.adapter.read(REGISTRY_FILE);
      this.registry = JSON.parse(content) as Registry;
      return this.registry!;
    }

    // 不存在 registry → 尝试从旧格式文件迁移
    this.registry = { version: REGISTRY_VERSION, files: {} };
    await this.migrateFromV1();
    return this.registry;
  }

  private async saveRegistry(): Promise<void> {
    if (!this.registry) return;
    await this.vault.adapter.write(REGISTRY_FILE, JSON.stringify(this.registry, null, 2));
  }

  // 确保文件在 registry 中有记录，没有则生成 id
  // 返回该文件对应的 id
  async ensureEntry(filePath: string): Promise<string> {
    const reg = await this.getRegistry();

    if (reg.files[filePath]) {
      return reg.files[filePath].id;
    }

    const id = generateId();
    reg.files[filePath] = { id, createdAt: Date.now(), updatedAt: Date.now() };
    await this.saveRegistry();
    return id;
  }

  // 文件重命名时更新 registry 中的路径
  async updatePath(oldPath: string, newPath: string): Promise<void> {
    const reg = await this.getRegistry();
    const entry = reg.files[oldPath];
    if (!entry) return;

    // 删除旧路径条目，用相同 id 创建新条目
    delete reg.files[oldPath];
    reg.files[newPath] = { ...entry, updatedAt: Date.now() };
    await this.saveRegistry();
  }

  // ══════════════════════════════════════════════
  //  路径计算
  // ══════════════════════════════════════════════

  // 通过文件路径拿到 id，再拼出 JSON 路径
  // 如果 registry 中没有记录，返回 null
  private async getJsonPath(filePath: string): Promise<string | null> {
    const reg = await this.getRegistry();
    const entry = reg.files[filePath];
    if (!entry) return null;
    return `${ANNOTATIONS_DIR}/${entry.id}.current.json`;
  }

  // ══════════════════════════════════════════════
  //  目录管理
  // ══════════════════════════════════════════════

  async ensureDir(dirPath: string): Promise<void> {
    const exists = await this.vault.adapter.exists(dirPath);
    if (!exists) {
      await this.vault.adapter.mkdir(dirPath);
    }
  }

  // ══════════════════════════════════════════════
  //  读写操作
  // ══════════════════════════════════════════════

  // 加载文件的所有批注
  async getAllAnnotations(filePath: string): Promise<Annotation[]> {
    const data = await this.load(filePath);
    if (!data) return [];
    return data.annotations.map(deserializeAnnotation);
  }

  // 加载 .annotations/{id}.current.json
  async load(filePath: string): Promise<AnnotationFile | null> {
    const jsonPath = await this.getJsonPath(filePath);
    if (!jsonPath) return null;

    const exists = await this.vault.adapter.exists(jsonPath);
    if (!exists) return null;

    const content = await this.vault.adapter.read(jsonPath);
    return JSON.parse(content) as AnnotationFile;
  }

  // 保存批注（不含历史版本）
  async save(
    filePath: string,
    annotations: SerializedAnnotation[],
    handwriting?: AnnotationFile["handwriting"]
  ): Promise<void> {
    await this.ensureDir(ANNOTATIONS_DIR);
    const id = await this.ensureEntry(filePath);

    const data: AnnotationFile = {
      version: CURRENT_VERSION,
      filePath,
      annotations,
      handwriting,
      updatedAt: Date.now(),
    };

    const jsonPath = `${ANNOTATIONS_DIR}/${id}.current.json`;
    await this.vault.adapter.write(jsonPath, JSON.stringify(data, null, 2));
  }

  // ══════════════════════════════════════════════
  //  便捷方法
  // ══════════════════════════════════════════════

  // 保存 Annotation[]（带自动序列化）
  async saveAnnotations(
    filePath: string,
    annotations: Annotation[],
    handwriting?: AnnotationFile["handwriting"]
  ): Promise<void> {
    const serialized = annotations.map((a) => {
      const { anchorStatus, startLine, startCh, endLine, endCh, ...rest } = a;
      return rest;
    });

    await this.save(filePath, serialized, handwriting);
  }


  // ====================================================
  //  目录迁移 (.annotations/ -> .obsidian/md_annot/)
  // ====================================================

  /** 将旧版 .annotations/ 迁移到 .obsidian/md_annot/，仅一次 */
  private async migrateFromOldDir(): Promise<void> {
    const oldExists = await this.vault.adapter.exists(OLD_ANNOTATIONS_DIR);
    if (!oldExists) return;

    const newExists = await this.vault.adapter.exists(ANNOTATIONS_DIR);
    if (newExists) {
      await this.removeDirRecursive(OLD_ANNOTATIONS_DIR);
      return;
    }

    console.log("MDAnnot: migrating .annotations/ -> .obsidian/md_annot/");

    await this.ensureDir(ANNOTATIONS_DIR);

    const listed = await this.vault.adapter.list(OLD_ANNOTATIONS_DIR);
    for (const f of listed.files) {
      const text = await this.vault.adapter.read(f);
      const newPath = f.replace(OLD_ANNOTATIONS_DIR, ANNOTATIONS_DIR);
      await this.vault.adapter.write(newPath, text);
    }
    for (const d of listed.folders) {
      const newDir = d.replace(OLD_ANNOTATIONS_DIR, ANNOTATIONS_DIR);
      await this.ensureDir(newDir);
      await this.copyDirRecursive(d, newDir);
    }

    await this.removeDirRecursive(OLD_ANNOTATIONS_DIR);
    this.registry = null;
    new Notice("MDAnnot: batch data has migrated to .obsidian/md_annot/ (adapt multi-device sync)");
  }

  /** recusive copy dir */
  private async copyDirRecursive(src: string, dst: string): Promise<void> {
    const listed = await this.vault.adapter.list(src);
    for (const f of listed.files) {
      const text = await this.vault.adapter.read(f);
      await this.vault.adapter.write(f.replace(src, dst), text);
    }
    for (const d of listed.folders) {
      const subDst = d.replace(src, dst);
      await this.ensureDir(subDst);
      await this.copyDirRecursive(d, subDst);
    }
  }

  /** recusive remove dir */
  private async removeDirRecursive(dir: string): Promise<void> {
    try {
      const listed = await this.vault.adapter.list(dir);
      for (const f of listed.files) await this.vault.adapter.remove(f);
      for (const d of listed.folders) await this.removeDirRecursive(d);
      await this.vault.adapter.remove(dir);
    } catch (e) {
      console.warn("MDAnnot: removeDirRecursive error", e);
    }
  }


  // ══════════════════════════════════════════════
  //  旧格式迁移（v1 → v2）
  // ══════════════════════════════════════════════

  // 扫描 .annotations/ 下所有 *.current.json 旧格式文件，
  // 为其生成 id 并写入 registry，然后将文件重命名为 {id}.current.json
  private async migrateFromV1(): Promise<void> {
    const dirExists = await this.vault.adapter.exists(ANNOTATIONS_DIR);
    if (!dirExists) return;

    let listed;
    try {
      listed = await this.vault.adapter.list(ANNOTATIONS_DIR);
    } catch {
      return;
    }

    for (const f of listed.files) {
      // 只处理旧格式：以 .current.json 结尾但不以 UUID 开头的文件
      if (!f.endsWith(".current.json")) continue;
      const name = f.replace(`${ANNOTATIONS_DIR}/`, "").replace(".current.json", "");
      // 跳过 registry.json 和已经是 id 格式的文件（纯 UUID）
      if (name === "registry" || /^[0-9a-z]{10,}$/.test(name)) continue;

      try {
        const content = await this.vault.adapter.read(f);
        const data = JSON.parse(content) as AnnotationFile;
        if (!data.filePath) continue;

        // 生成 id 并写入 registry
        const id = generateId();
        this.registry!.files[data.filePath] = { id, createdAt: Date.now(), updatedAt: Date.now() };

        // 更新 filePath 字段（可选，保留引用）
        data.filePath = data.filePath;

        // 写入新文件：{id}.current.json
        const newPath = `${ANNOTATIONS_DIR}/${id}.current.json`;
        await this.vault.adapter.write(newPath, JSON.stringify(data, null, 2));

        // 删除旧文件（先确认文件仍存在）
        const stillExists = await this.vault.adapter.exists(f);
        if (stillExists) {
          await this.vault.adapter.remove(f);
        }
      } catch (e) {
        console.warn(`MDAnnot: 跳过旧格式文件 ${f}`, e);
        continue;
      }
    }

    // 保存 registry
    await this.saveRegistry();
  }

  // ══════════════════════════════════════════════
  //  清理失效缓存
  // ══════════════════════════════════════════════

  // 清理 registry 中 path 对应的 .md 已不存在的记录，
  // 同时删除对应的 {id}.current.json
  async cleanupOrphanedAnnotations(): Promise<string[]> {
    const reg = await this.getRegistry();
    const removed: string[] = [];

    // 遍历 registry 副本（避免遍历时删除导致问题）
    const entries = Object.entries(reg.files);
    for (const [path, entry] of entries) {
      const sourceExists = await this.vault.adapter.exists(path);
      if (!sourceExists) {
        // 删除对应的 .current.json
        const jsonPath = `${ANNOTATIONS_DIR}/${entry.id}.current.json`;
        const exists = await this.vault.adapter.exists(jsonPath);
        if (exists) {
          await this.vault.adapter.remove(jsonPath);
          removed.push(jsonPath);
        }
        // 从 registry 删除
        delete reg.files[path];
      }
    }

    if (removed.length > 0) {
      await this.saveRegistry();
    }

    return removed;
  }

  // ══════════════════════════════════════════════
  //  状态查询
  // ══════════════════════════════════════════════

  /** get current annotations dir path (relative) */
  getAnnotationsDir(): string { return ANNOTATIONS_DIR; }

  // 获取已注册的文件列表（仅供 UI 展示或调试）
  async getRegisteredFiles(): Promise<Array<{ path: string; id: string }>> {
    const reg = await this.getRegistry();
    return Object.entries(reg.files).map(([path, entry]) => ({
      path,
      id: entry.id,
    }));
  }
}
