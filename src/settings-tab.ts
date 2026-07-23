import { App, Modal, Notice, PluginSettingTab, Setting } from "obsidian";
import MDAnnotPlugin from "./main";
import { AnnotationType, DEFAULT_SETTINGS } from "./data-models";
<<<<<<< HEAD
=======
import { t, setLanguage } from "./i18n";
>>>>>>> in18

export class MDAnnotSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: MDAnnotPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
<<<<<<< HEAD
    containerEl.createEl("h2", { text: "MDAnnot 设置" });

    containerEl.createEl("h3", { text: "显示控制" });

    new Setting(containerEl)
      .setName("批注开关")
      .setDesc("打开后可实现文本渲染 高亮/波浪线/评论")
=======
    containerEl.createEl("h2", { text: t('settings.title') });


    new Setting(containerEl)
      .setName(t('settings.language.name'))
      .setDesc(t('settings.language.desc'))
      .addDropdown((dropdown) => {
        dropdown
          .addOption('zh', '中文')
          .addOption('en', 'English')
          .setValue(this.plugin.settings.language)
          .onChange(async (val: string) => {
            this.plugin.settings.language = val as 'zh' | 'en';
            await this.plugin.saveSettings();
            setLanguage(val);
            this.display();
          });
      });

    containerEl.createEl("h3", { text: t('settings.displayControl') });

    new Setting(containerEl)
      .setName(t('settings.showInEditor.name'))
      .setDesc(t('settings.showInEditor.desc'))
>>>>>>> in18
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showInEditor)
          .onChange(async (val) => {
            this.plugin.settings.showInEditor = val;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
<<<<<<< HEAD
      .setName("自动显示批注面板")
      .setDesc("当前文档存在批注时，自动在右侧打开批注列表面板")
=======
      .setName(t('settings.autoShowPanel.name'))
      .setDesc(t('settings.autoShowPanel.desc'))
>>>>>>> in18
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoShowPanel)
          .onChange(async (val) => {
            this.plugin.settings.autoShowPanel = val;
            await this.plugin.saveSettings();
          })
      );

    // ── 2. 批注样式 ──
<<<<<<< HEAD
    containerEl.createEl("h3", { text: "颜色设置" });

    this.addColorPopup(
      containerEl,
      "高亮颜色", "编辑模式下高亮批注的背景色",
=======
    containerEl.createEl("h3", { text: t('settings.colorSettings') });

    this.addColorPopup(
      containerEl,
      t('settings.colorSettings') + ' - ' + t('settings.showInEditor.name'), t('settings.colorDesc'),
>>>>>>> in18
      "highlightColor", DEFAULT_SETTINGS.highlightColor,
      ["#F2EFE9","#D6D2CB","#1E1C19","#F9D2D2",
       "#FFE2C7","#FFF2BC","#D4EEDF","#D2E4F4",
       "#E2D9F3","#F29E6D","#4CB899","#488FC2"]
    );

    this.addColorPopup(
      containerEl,
<<<<<<< HEAD
      "划线颜色", "编辑模式下划线批注的波浪线颜色",
=======
      t('toolbar.underline'), t('settings.colorDesc'),
>>>>>>> in18
      "underlineColor", DEFAULT_SETTINGS.underlineColor,
      ["#D6D2CB","#5A5650","#1E1C19","#D4EEDF",
       "#D2E4F4","#E2D9F3","#E07A7A","#F29E6D",
       "#4CB899","#488FC2","#733E7F","#2F5F8A"]
    );

    this.addColorPopup(
      containerEl,
<<<<<<< HEAD
      "评论高亮颜色", "编辑模式下文字评论的标记背景色",
=======
      t('toolbar.comment'), t('settings.colorDesc'),
>>>>>>> in18
      "commentHighlightColor", DEFAULT_SETTINGS.commentHighlightColor,
      ["#5A5650","#F9D2D2","#FFE2C7","#FFF2BC",
       "#D2E4F4","#E2D9F3","#E07A7A","#F29E6D",
       "#4CB899","#488FC2","#733E7F","#2F5F8A"]
    );

    // ── 颜色渲染模式 ──
    new Setting(containerEl)
<<<<<<< HEAD
      .setName("颜色渲染模式")
      .setDesc("开启：选中文本颜色统一使用配置颜色。关闭：新选中文本使用配置颜色，不影响历史选中")
=======
      .setName(t('settings.colorRenderMode.name'))
      .setDesc(t('settings.colorRenderMode.desc'))
>>>>>>> in18
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.applyColorGlobally)
          .onChange(async (val) => {
            // 从「仅新建」切到「全局」时需要确认
            if (val && !this.plugin.settings.applyColorGlobally) {
              const confirmed = await new Promise<boolean>((res) => {
                new ConfirmModal(this.app, res).open();
              });
              if (!confirmed) {
                toggle.setValue(false);
                return;
              }
            }
            this.plugin.settings.applyColorGlobally = val;
            await this.plugin.saveSettings();
          })
      );

    // ── 数据存储 ──
<<<<<<< HEAD
    containerEl.createEl("h3", { text: "数据存储" });
=======
    containerEl.createEl("h3", { text: t('settings.dataStorage') });
>>>>>>> in18

    const annotDir = this.plugin.storage.getAnnotationsDir();
    const basePath = ((this.app.vault.adapter as any).getBasePath?.() || (this.app.vault.adapter as any).basePath || "") as string;
    const pathSetting = new Setting(containerEl)
<<<<<<< HEAD
      .setName("批注数据保存路径")
      .setDesc("存放所有批注数据（.obsidian/md_annot/）的实际位置。如需多设备同步，请在 Remotely Save 中开启【同步配置文件夹】")
      .addExtraButton((btn) => {
        btn.setIcon("copy")
          .setTooltip("复制路径到剪贴板")
=======
      .setName(t('settings.dataPath.name'))
      .setDesc(t('settings.dataPath.desc'))
      .addExtraButton((btn) => {
        btn.setIcon("copy")
          .setTooltip(t('settings.copyPathTooltip'))
>>>>>>> in18
          .onClick(() => {
            navigator.clipboard.writeText(basePath + "/" + annotDir + "/");
          });
      })
      .addButton((btn) => {
<<<<<<< HEAD
        btn.setButtonText("清空数据")
          .setTooltip("删除所有批注数据到废纸篓")
=======
        btn.setButtonText(t('settings.clearDataBtn'))
          .setTooltip(t('settings.clearDataTooltip'))
>>>>>>> in18
          .onClick(() => {
            new ClearDataConfirmModal(this.app, annotDir, this.plugin).open();
          });
      });
    const pathEl = containerEl.createDiv({ cls: "setting-item-description" });
    pathEl.style.cssText = "font-family: monospace; font-size: 11px; word-break: break-all; color: var(--text-muted); margin-top: -8px; padding-bottom: 12px;";
    pathEl.setText(basePath + "/" + annotDir + "/");

    new Setting(containerEl)
<<<<<<< HEAD
      .setName("清理失效缓存")
      .setDesc("扫描批注数据目录，删除那些对应源 .md 文件已不存在的孤立批注数据文件")
      .addButton((btn) => {
        btn.setButtonText("开始清理")
          .setTooltip("检查并删除已无法找到对应文档的批注缓存")
          .onClick(async () => {
            const removed = await this.plugin.storage.cleanupOrphanedAnnotations();
            if (removed.length === 0) {
              new Notice("MDAnnot: 未发现失效缓存文件");
            } else {
              new Notice(`MDAnnot: 已清理 ${removed.length} 个失效缓存文件`);
=======
      .setName(t('settings.cleanupCache.name'))
      .setDesc(t('settings.cleanupCache.desc'))
      .addButton((btn) => {
        btn.setButtonText(t('settings.startCleanupBtn'))
          .setTooltip(t('settings.cleanupTooltip'))
          .onClick(async () => {
            const removed = await this.plugin.storage.cleanupOrphanedAnnotations();
            if (removed.length === 0) {
              new Notice(t('settings.noCacheFiles'));
            } else {
              new Notice(`${t('settings.cleanedCache')} ${removed.length} ${t('settings.cleanedCacheSuffix')}`);
>>>>>>> in18
            }
          });
      });

    // ── 数据导出 ──
<<<<<<< HEAD
    containerEl.createEl("h3", { text: "数据导出" });

    new Setting(containerEl)
      .setName("导出所有批注")
      .setDesc("将所有文档的批注导出为 Markdown 文件，保存到仓库根目录")
      .addButton((btn) => {
        btn.setButtonText("导出所有批注")
=======
    containerEl.createEl("h3", { text: t('settings.dataExport') });

    new Setting(containerEl)
      .setName(t('settings.exportAll.name'))
      .setDesc(t('settings.exportAll.desc'))
      .addButton((btn) => {
        btn.setButtonText(t('settings.exportAllBtn'))
>>>>>>> in18
          .setCta()
          .onClick(async () => {
            await this.exportAllAnnotations();
          });
      });

  }

  // 点击圆形色块 → 浮动弹出 3×4 色卡网格 → 点击选色或点外部关闭
  private addColorPopup(
    container: HTMLElement,
    name: string,
    desc: string,
    settingKey: keyof MDAnnotPlugin["settings"],
    defaultColor: string,
    presets: string[]
  ): void {
    const setting = new Setting(container).setName(name).setDesc(desc);

    // 触发按钮：圆形色块显示当前颜色
    const trigger = setting.controlEl.createEl("button", {
      cls: "md-annot-color-trigger",
    });
    trigger.style.cssText = `
      width: 36px; height: 36px; border-radius: 50%; padding: 0;
      background: ${this.plugin.settings[settingKey] as string};
      border: 2px solid var(--background-modifier-border);
      cursor: pointer; box-shadow: 0 1px 3px rgba(0,0,0,0.15);
    `;
<<<<<<< HEAD
    trigger.title = "点击选择颜色";
=======
    trigger.title = t("settings.colorPickTooltip");
>>>>>>> in18

    // 点击触发按钮时创建弹窗
    trigger.addEventListener("click", (e) => {
      e.stopPropagation();

      // 移除已有的弹窗（点击同一个触发按钮时切换）
      const existing = container.querySelector(".md-annot-color-popup");
      if (existing) { existing.remove(); return; }

      // 创建弹窗容器
      const popup = container.createDiv({ cls: "md-annot-color-popup" });
      popup.style.cssText = `
        position: fixed;
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
        padding: 14px;
        background: var(--background-primary);
        border: 1px solid var(--background-modifier-border);
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.2);
        z-index: 1000;
      `;

      // 定位弹窗：在触发按钮下方
      const r = trigger.getBoundingClientRect();
      popup.style.top = `${r.bottom + 6}px`;
      popup.style.left = `${r.left}px`;

      const currentColor = this.plugin.settings[settingKey] as string;
      const isDefault = (c: string) => c === defaultColor;
      const isActive = (c: string) => c === currentColor;

      // 渲染 12 个圆形色卡（3×4 网格）
      for (const preset of presets) {
        const swatch = popup.createEl("button", { attr: { "data-color": preset } });
        swatch.style.cssText = `
          width: 30px; height: 30px; border-radius: 50%; padding: 0;
          background: ${preset}; cursor: pointer;
          border: 2px solid ${isActive(preset) ? "var(--interactive-accent)" : "transparent"};
          ${isDefault(preset) ? "outline: 2px dashed var(--text-muted); outline-offset: 2px;" : ""}
          box-sizing: border-box; transition: transform 0.1s;
        `;
<<<<<<< HEAD
        swatch.title = isDefault(preset) ? `${preset}（默认色）` : preset;
=======
        swatch.title = isDefault(preset) ? t('settings.defaultColorLabel').replace('%s', preset) : preset;
>>>>>>> in18

        swatch.addEventListener("click", (ev) => {
          ev.stopPropagation();
          (this.plugin.settings[settingKey] as string) = preset;
          this.plugin.saveSettings();
          trigger.style.background = preset;
          popup.remove();
        });
      }

      // 点击弹窗外任意位置 → 关闭弹窗
      // 用 setTimeout 避免当前点击事件冒泡到 document 立即触发关闭
      const closeOnClickOutside = (ev: MouseEvent) => {
        if (!popup.contains(ev.target as Node) && ev.target !== trigger) {
          popup.remove();
        }
      };
      setTimeout(() => {
        document.addEventListener("click", closeOnClickOutside, { once: true });
      }, 0);
    });
  }

  private async exportAllAnnotations(): Promise<void> {
    const storage = this.plugin.storage;
    const registeredFiles = await storage.getRegisteredFiles();

    if (registeredFiles.length === 0) {
<<<<<<< HEAD
      new Notice("MDAnnot: 没有找到批注数据");
=======
      new Notice(t('settings.noAnnotationData'));
>>>>>>> in18
      return;
    }

    let md = "> \u6807\u7b7e #\u6279\u6ce8\n\n";

    for (const { path } of registeredFiles) {
      const annotations = await storage.getAllAnnotations(path);
      const filtered = annotations.filter(
        (a) => a.type !== AnnotationType.HANDWRITING
      );
      if (filtered.length === 0) continue;

            const srcName = path.replace(/\.md$/i, '');
      md += `# ${srcName}\n[[${srcName}]]\n\n`;

      const highlights = filtered.filter(
        (a) => a.type === AnnotationType.HIGHLIGHT
      );
      const underlines = filtered.filter(
        (a) => a.type === AnnotationType.UNDERLINE
      );
      const comments = filtered.filter(
        (a) => a.type === AnnotationType.COMMENT
      );

      if (highlights.length > 0) {
        md += `## 高亮\n`;
        highlights.forEach((a) => {
          md += `- ${a.targetText}\n`;
        });
        md += `\n`;
      }

      if (underlines.length > 0) {
        md += `## 划线\n`;
        underlines.forEach((a) => {
          md += `- ${a.targetText}\n`;
        });
        md += `\n`;
      }

      if (comments.length > 0) {
        md += `## 批注\n`;
        comments.forEach((a) => {
          md += `- ${a.targetText}\n`;
          if (a.commentText) {
            md += `  - ${a.commentText}\n`;
          }
        });
        md += `\n`;
      }
    }

    if (!md) {
<<<<<<< HEAD
      new Notice("MDAnnot: 没有找到批注数据");
=======
      new Notice(t('settings.noAnnotationData'));
>>>>>>> in18
      return;
    }

    // 生成时间戳文件名
    const now = new Date();
    const y = now.getFullYear();
    const M = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const h = String(now.getHours()).padStart(2, "0");
    const m = String(now.getMinutes()).padStart(2, "0");
    const s = String(now.getSeconds()).padStart(2, "0");
    const timestamp = `${y}${M}${d}_${h}${m}${s}`;
    const exportPath = `${timestamp}_批注.md`;

    try {
      await this.app.vault.adapter.write(exportPath, md);
<<<<<<< HEAD
      new Notice(`MDAnnot: 已导出所有批注到 ${exportPath}`);
    } catch (e) {
      console.error("MDAnnot: 导出所有批注失败", e);
      new Notice("MDAnnot: 导出所有批注失败");
=======
      new Notice(`${t('settings.exportedAll')} ${exportPath}`);
    } catch (e) {
      console.error(t('settings.exportAllFail'), e);
      new Notice(t('settings.exportAllFail'));
>>>>>>> in18
    }
  }
}

/** 删除批注数据确认弹窗 */
class ClearDataConfirmModal extends Modal {
  constructor(app: App, private annotDir: string, private plugin: MDAnnotPlugin) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    this.modalEl.style.width = "360px";
    this.modalEl.style.maxWidth = "90vw";

    contentEl.createEl("h3", {
<<<<<<< HEAD
      text: "清空批注数据",
      attr: { style: "color: var(--text-normal);" },
    });
    contentEl.createEl("p", {
      text: "数据将被删除到废纸篓，确认清除吗？",
=======
      text: t('settings.confirmClearTitle'),
      attr: { style: "color: var(--text-normal);" },
    });
    contentEl.createEl("p", {
      text: t('settings.confirmClearDesc'),
>>>>>>> in18
      attr: { style: "color: var(--text-muted);" },
    });

    const btnRow = contentEl.createDiv({
      attr: { style: "display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px;" },
    });

    btnRow.createEl("button", {
<<<<<<< HEAD
      text: "取消",
=======
      text: t('settings.cancel'),
>>>>>>> in18
      attr: {
        style: "padding: 6px 16px; border-radius: 6px; border: 1px solid var(--background-modifier-border); background: transparent; cursor: pointer;",
      },
    }).addEventListener("click", () => {
      this.close();
    });

    btnRow.createEl("button", {
<<<<<<< HEAD
      text: "确认清除",
=======
      text: t('settings.confirmClearBtn'),
>>>>>>> in18
      attr: {
        style: "padding: 6px 16px; border-radius: 6px; border: none; background: var(--color-red); color: var(--text-on-accent); cursor: pointer;",
      },
    }).addEventListener("click", async () => {
      try {
        const adapter = this.app.vault.adapter as any;
        // 尝试系统废纸篓
        if (adapter.trashSystem) {
          await adapter.trashSystem(this.annotDir);
        } else {
          // 逐个删除文件 + 目录
          const listed = await adapter.list(this.annotDir);
          for (const f of listed.files) await adapter.remove(f);
          for (const d of listed.folders) await adapter.remove(d);
          await adapter.remove(this.annotDir);
        }
      } catch (e) {
        console.error("MDAnnot: 清空批注数据失败", e);
      }
      this.plugin.clearAllAnnotationData();
      this.close();
    });
  }
}

/** 简单确认弹窗，resolve true=确定 / false=取消 */
class ConfirmModal extends Modal {
  constructor(app: App, private resolve: (v: boolean) => void) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
<<<<<<< HEAD
    contentEl.createEl('h3', { text: '确认开启', attr: { style: 'color: var(--text-normal);' } });
    contentEl.createEl('p', {
      text: '开启后，所有已高亮、划线、评论都将使用当前颜色，已存储的单个批注颜色会被忽略，是否确定？',
    });
    const row = contentEl.createDiv({ attr: { style: 'display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px;' } });
    row.createEl('button', { text: '取消' }).addEventListener('click', () => {
=======
    contentEl.createEl('h3', { text: t('settings.confirmRenderModeTitle'), attr: { style: 'color: var(--text-normal);' } });
    contentEl.createEl('p', {
      text: t('settings.confirmRenderModeDesc'),
    });
    const row = contentEl.createDiv({ attr: { style: 'display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px;' } });
    row.createEl('button', { text: t('settings.cancel') }).addEventListener('click', () => {
>>>>>>> in18
      this.resolve(false);
      this.close();
    });
    row.createEl('button', {
<<<<<<< HEAD
      text: '确定',
=======
      text: t('settings.confirm'),
>>>>>>> in18
      attr: { style: 'background: var(--interactive-accent); color: var(--text-on-accent);' },
    }).addEventListener('click', () => {
      this.resolve(true);
      this.close();
    });
  }
}
