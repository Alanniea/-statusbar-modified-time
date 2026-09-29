import { App, Modal, Plugin, PluginSettingTab, Setting, TFile, TFolder, moment } from 'obsidian';

interface FileTimePluginSettings {
    timeFormat: string;
    displayMode: 'relative' | 'absolute';
}

const DEFAULT_SETTINGS: FileTimePluginSettings = {
    timeFormat: 'YYYY-MM-DD HH:mm:ss',
    displayMode: 'relative'
};

export default class FileTimePlugin extends Plugin {
    settings: FileTimePluginSettings;
    statusBarItemEl: HTMLElement;
    intervalId: number | null = null;
    currentFile: TFile | null = null;

    async onload() {
        await this.loadSettings();

        // 1. 添加状态栏项目
        this.statusBarItemEl = this.addStatusBarItem();
        this.statusBarItemEl.addClass('mod-clickable');
        this.statusBarItemEl.setAttribute('aria-label', '点击查看文件详情与仓库统计');

        // 点击状态栏弹出模态框
        this.statusBarItemEl.onClickEvent(() => {
            if (this.currentFile) {
                new FileStatsModal(this.app, this.currentFile, this.settings).open();
            }
        });

        // 2. 监听文件切换与修改事件
        this.registerEvent(
            this.app.workspace.on('file-open', (file) => {
                this.currentFile = file;
                this.updateStatusBar();
            })
        );

        this.registerEvent(
            this.app.vault.on('modify', (file) => {
                if (file === this.currentFile) {
                    this.updateStatusBar();
                }
            })
        );

        // 3. 启动每秒更新一次的定时器（用于秒级相对时间更新）
        this.intervalId = window.setInterval(() => {
            if (this.currentFile && this.settings.displayMode === 'relative') {
                this.updateStatusBar();
            }
        }, 1000);

        // 4. 注册设置标签页
        this.addSettingTab(new FileTimeSettingTab(this.app, this));

        // 初始化当前激活的文件
        this.currentFile = this.app.workspace.getActiveFile();
        this.updateStatusBar();
    }

    onunload() {
        if (this.intervalId !== null) {
            window.clearInterval(this.intervalId);
        }
    }

    // 更新状态栏文本
    updateStatusBar() {
        if (!this.currentFile) {
            this.statusBarItemEl.setText('');
            return;
        }

        const mtime = this.currentFile.stat.mtime;
        if (this.settings.displayMode === 'relative') {
            const relTime = getDetailedRelativeTime(mtime);
            this.statusBarItemEl.setText(`修改于: ${relTime}`);
        } else {
            const absTime = moment(mtime).format(this.settings.timeFormat);
            this.statusBarItemEl.setText(`修改于: ${absTime}`);
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        this.updateStatusBar();
    }
}

// ==================== 辅助函数：计算高精度相对时间 ====================
function getDetailedRelativeTime(timestamp: number): string {
    const now = Date.now();
    const diffSec = Math.max(0, Math.floor((now - timestamp) / 1000));

    if (diffSec < 60) {
        return `${diffSec}秒前`;
    }
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) {
        return `${diffMin}分钟前`;
    }
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) {
        return `${diffHour}小时前`;
    }
    const diffDay = Math.floor(diffHour / 24);
    return `${diffDay}天前`;
}

// ==================== 模态框 (Modal) ====================
class FileStatsModal extends Modal {
    file: TFile;
    settings: FileTimePluginSettings;

    constructor(app: App, file: TFile, settings: FileTimePluginSettings) {
        super(app);
        this.file = file;
        this.settings = settings;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: '📄 文件信息与仓库统计' });

        // --- 当前文件信息 ---
        const fileInfoSection = contentEl.createDiv({ cls: 'file-info-section' });
        fileInfoSection.createEl('h3', { text: '当前文件' });

        const ul = fileInfoSection.createEl('ul');
        
        // 文件名
        ul.createEl('li', { text: `文件名: ${this.file.name}` });

        // 创建时间
        const ctime = this.file.stat.ctime;
        const ctimeAbs = moment(ctime).format(this.settings.timeFormat);
        const ctimeRel = getDetailedRelativeTime(ctime);
        ul.createEl('li', { text: `创建时间: ${ctimeRel} (${ctimeAbs})` });

        // 修改时间
        const mtime = this.file.stat.mtime;
        const mtimeAbs = moment(mtime).format(this.settings.timeFormat);
        const mtimeRel = getDetailedRelativeTime(mtime);
        ul.createEl('li', { text: `修改时间: ${mtimeRel} (${mtimeAbs})` });

        contentEl.createEl('hr');

        // --- 仓库总览统计 ---
        const vaultStatsSection = contentEl.createDiv({ cls: 'vault-stats-section' });
        vaultStatsSection.createEl('h3', { text: '仓库统计' });

        // 统计数据计算
        const allItems = this.app.vault.getAllLoadedFiles();
        let folderCount = 0;
        for (const item of allItems) {
            if (item instanceof TFolder) {
                folderCount++;
            }
        }
        // 排除根路径 '/' 文件夹
        folderCount = Math.max(0, folderCount - 1);

        const totalFiles = this.app.vault.getFiles().length;
        const mdFiles = this.app.vault.getMarkdownFiles().length;

        // 按指定顺序展示：文件总数、文件夹总数、Markdown 笔记总数
        const statsList = vaultStatsSection.createEl('ol');
        statsList.createEl('li', { text: `总文件数（含附件等）: ${totalFiles}` });
        statsList.createEl('li', { text: `文件夹总数: ${folderCount}` });
        statsList.createEl('li', { text: `Markdown 笔记数: ${mdFiles}` });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

// ==================== 设置面板 (Settings Tab) ====================
class FileTimeSettingTab extends PluginSettingTab {
    plugin: FileTimePlugin;

    constructor(app: App, plugin: FileTimePlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: '文件时间状态栏设置' });

        // 显示模式切换
        new Setting(containerEl)
            .setName('状态栏显示模式')
            .setDesc('选择状态栏默认展示相对时间（每秒更新）还是绝对时间')
            .addDropdown(drop => drop
                .addOption('relative', '相对时间 (默认，如：12秒前)')
                .addOption('absolute', '绝对时间 (固定格式)')
                .setValue(this.plugin.settings.displayMode)
                .onChange(async (value: 'relative' | 'absolute') => {
                    this.plugin.settings.displayMode = value;
                    await this.plugin.saveSettings();
                })
            );

        // 时间格式自定义
        new Setting(containerEl)
            .setName('绝对时间格式')
            .setDesc('采用 Moment.js 格式规范（例如：YYYY-MM-DD HH:mm:ss）')
            .addText(text => text
                .setPlaceholder('YYYY-MM-DD HH:mm:ss')
                .setValue(this.plugin.settings.timeFormat)
                .onChange(async (value) => {
                    this.plugin.settings.timeFormat = value.trim() || 'YYYY-MM-DD HH:mm:ss';
                    await this.plugin.saveSettings();
                })
            );
    }
}