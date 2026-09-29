import { App, Modal, Plugin, PluginSettingTab, Setting, TFile, TFolder, moment } from 'obsidian';

interface FileTimeSettings {
    dateFormat: string;
    displayMode: 'relative' | 'absolute';
}

const DEFAULT_SETTINGS: FileTimeSettings = {
    dateFormat: 'YYYY-MM-DD HH:mm:ss',
    displayMode: 'relative'
};

export default class FileTimePlugin extends Plugin {
    settings: FileTimeSettings;
    statusBarItemEl: HTMLElement;

    async onload() {
        await this.loadSettings();

        // 1. 创建状态栏项
        this.statusBarItemEl = this.addStatusBarItem();
        this.statusBarItemEl.addClass('mod-clickable');
        
        // 绑定点击事件，弹出模态框
        this.statusBarItemEl.onClickEvent(() => {
            const activeFile = this.app.workspace.getActiveFile();
            if (activeFile) {
                new FileStatsModal(this.app, activeFile, this.settings).open();
            }
        });

        // 2. 注册每秒更新定时器（由插件自动管理生命周期，禁用时自动注销）
        this.registerInterval(
            window.setInterval(() => {
                this.updateStatusBar();
            }, 1000)
        );

        // 3. 监听文件切换与文件修改事件
        this.registerEvent(this.app.workspace.on('file-open', () => this.updateStatusBar()));
        this.registerEvent(this.app.vault.on('modify', () => this.updateStatusBar()));

        // 4. 注册设置面板
        this.addSettingTab(new FileTimeSettingTab(this.app, this));

        // 初始更新
        this.updateStatusBar();
    }

    onunload() {
        // 清理在 unload 时会自动完成
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        this.updateStatusBar();
    }

    // 更新状态栏文本
    updateStatusBar() {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            this.statusBarItemEl.setText('');
            return;
        }

        const mtime = activeFile.stat.mtime;
        if (this.settings.displayMode === 'relative') {
            const relTime = getExactRelativeTime(mtime);
            this.statusBarItemEl.setText(`修改于: ${relTime}`);
        } else {
            const absTime = moment(mtime).format(this.settings.dateFormat);
            this.statusBarItemEl.setText(`修改于: ${absTime}`);
        }
    }
}

/**
 * 计算精确到秒的相对时间字符串
 */
function getExactRelativeTime(timestamp: number): string {
    const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
    
    if (diffSeconds < 60) {
        return `${diffSeconds}秒前`;
    }
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) {
        return `${diffMinutes}分钟前`;
    }
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
        return `${diffHours}小时前`;
    }
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) {
        return `${diffDays}天前`;
    }
    const diffMonths = Math.floor(diffDays / 30);
    if (diffMonths < 12) {
        return `${diffMonths}个月前`;
    }
    const diffYears = Math.floor(diffDays / 365);
    return `${diffYears}年前`;
}

/**
 * 详细信息模态框
 */
class FileStatsModal extends Modal {
    file: TFile;
    settings: FileTimeSettings;

    constructor(app: App, file: TFile, settings: FileTimeSettings) {
        super(app);
        this.file = file;
        this.settings = settings;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        // 标题
        contentEl.createEl('h2', { text: '📄 笔记统计详情' });

        // --- 1. 当前文件信息 ---
        const fileSection = contentEl.createEl('div', { cls: 'file-stats-section' });

        // 文件名
        const nameP = fileSection.createEl('p');
        nameP.createEl('strong', { text: '文件名：' });
        nameP.appendText(this.file.name);

        // 创建时间
        const ctime = this.file.stat.ctime;
        const ctimeAbs = moment(ctime).format(this.settings.dateFormat);
        const ctimeRel = getExactRelativeTime(ctime);
        const ctimeP = fileSection.createEl('p');
        ctimeP.createEl('strong', { text: '创建时间：' });
        ctimeP.appendText(`${ctimeAbs} (${ctimeRel})`);

        // 修改时间
        const mtime = this.file.stat.mtime;
        const mtimeAbs = moment(mtime).format(this.settings.dateFormat);
        const mtimeRel = getExactRelativeTime(mtime);
        const mtimeP = fileSection.createEl('p');
        mtimeP.createEl('strong', { text: '修改时间：' });
        mtimeP.appendText(`${mtimeAbs} (${mtimeRel})`);

        // 分割线
        contentEl.createEl('hr');

        // --- 2. 仓库全量统计 ---
        contentEl.createEl('h3', { text: '📊 仓库总览' });

        let totalFiles = 0;
        let totalFolders = 0;
        let totalMdNotes = 0;

        // 获取仓库所有加载的文件
        const allItems = this.app.vault.getAllLoadedFiles();
        for (const item of allItems) {
            if (item instanceof TFolder) {
                // 排除根目录自身
                if (!item.isRoot()) {
                    totalFolders++;
                }
            } else if (item instanceof TFile) {
                totalFiles++;
                if (item.extension.toLowerCase() === 'md') {
                    totalMdNotes++;
                }
            }
        }

        // 按照需求严格顺序展示：文件总数 -> 文件夹总数 -> Markdown 笔记总数
        const statsList = contentEl.createEl('ul', { cls: 'vault-stats-list' });
        
        const liFiles = statsList.createEl('li');
        liFiles.createEl('strong', { text: '文件总数：' });
        liFiles.appendText(`${totalFiles} 个`);

        const liFolders = statsList.createEl('li');
        liFolders.createEl('strong', { text: '文件夹总数：' });
        liFolders.appendText(`${totalFolders} 个`);

        const liMd = statsList.createEl('li');
        liMd.createEl('strong', { text: 'Markdown 笔记总数：' });
        liMd.appendText(`${totalMdNotes} 篇`);
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

/**
 * 设置选项页
 */
class FileTimeSettingTab extends PluginSettingTab {
    plugin: FileTimePlugin;

    constructor(app: App, plugin: FileTimePlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: '文件时间状态栏插件设置' });

        // 设置项：显示模式（相对时间 vs 绝对时间）
        new Setting(containerEl)
            .setName('状态栏显示模式')
            .setDesc('选择在状态栏默认显示的时间格式（默认为相对时间，每秒刷新）')
            .addDropdown(dropdown => {
                dropdown
                    .addOption('relative', '相对时间 (例如: 5秒前)')
                    .addOption('absolute', '绝对时间 (具体时间)')
                    .setValue(this.plugin.settings.displayMode)
                    .onChange(async (value: 'relative' | 'absolute') => {
                        this.plugin.settings.displayMode = value;
                        await this.plugin.saveSettings();
                    });
            });

        // 设置项：自定义时间格式
        new Setting(containerEl)
            .setName('绝对时间格式')
            .setDesc('自定义绝对日期的输出格式（基于 Moment.js 语法规则）')
            .addText(text => {
                text
                    .setPlaceholder('YYYY-MM-DD HH:mm:ss')
                    .setValue(this.plugin.settings.dateFormat)
                    .onChange(async (value) => {
                        this.plugin.settings.dateFormat = value.trim() || 'YYYY-MM-DD HH:mm:ss';
                        await this.plugin.saveSettings();
                    });
            });
    }
}