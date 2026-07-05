import { App, Modal, Plugin, PluginSettingTab, Setting, TFile, TFolder, moment } from 'obsidian';

// 插件设置接口
interface FileStatsSettings {
    timeFormat: string;
    displayType: 'relative' | 'absolute';
}

const DEFAULT_SETTINGS: FileStatsSettings = {
    timeFormat: 'YYYY-MM-DD HH:mm:ss',
    displayType: 'relative'
};

// 自定义相对时间格式化函数
function getRelativeTime(mtime: number): string {
    const diffMs = Date.now() - mtime;
    const diffSec = Math.floor(diffMs / 1000);

    if (diffSec < 0) {
        return '0秒前';
    }
    // 60秒内显示具体秒数
    if (diffSec < 60) {
        return `${diffSec}秒前`;
    }
    // 超过60秒则使用 Moment.js 默认的相对时间
    return moment(mtime).fromNow();
}

export default class FileStatsPlugin extends Plugin {
    settings: FileStatsSettings;
    statusBarItem: HTMLElement;

    async onload() {
        await this.loadSettings();

        // 创建状态栏元素
        this.statusBarItem = this.addStatusBarItem();
        this.statusBarItem.addClass('file-stats-status-bar');
        this.statusBarItem.style.cursor = 'pointer';

        // 绑定状态栏点击事件，弹出模态框
        this.statusBarItem.addEventListener('click', () => {
            const activeFile = this.app.workspace.getActiveFile();
            new FileStatsModal(this.app, activeFile, this.settings).open();
        });

        // 监听活动文件切换事件
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', () => {
                this.updateStatusBar();
            })
        );

        // 监听文件修改事件以实时刷新
        this.registerEvent(
            this.app.vault.on('modify', (file) => {
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile && file.path === activeFile.path) {
                    this.updateStatusBar();
                }
            })
        );

        // 设置每秒更新的定时器，确保秒级计数实时变化
        this.registerInterval(
            window.setInterval(() => {
                this.updateStatusBar();
            }, 1000)
        );

        // 添加设置选项卡
        this.addSettingTab(new FileStatsSettingTab(this.app, this));

        // 首次加载初始化
        this.updateStatusBar();
    }

    // 更新状态栏文本
    updateStatusBar() {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            this.statusBarItem.setText('无活动文件');
            return;
        }

        const mtime = activeFile.stat.mtime;
        let displayTime = '';

        if (this.settings.displayType === 'relative') {
            displayTime = getRelativeTime(mtime);
        } else {
            displayTime = moment(mtime).format(this.settings.timeFormat);
        }

        this.statusBarItem.setText(`修改时间: ${displayTime}`);
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        this.updateStatusBar();
    }
}

// 模态框类
class FileStatsModal extends Modal {
    file: TFile | null;
    settings: FileStatsSettings;

    constructor(app: App, file: TFile | null, settings: FileStatsSettings) {
        super(app);
        this.file = file;
        this.settings = settings;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: '文件与仓库统计信息', attr: { style: 'margin-bottom: 20px;' } });

        // 1. 当前活动文件信息
        if (this.file) {
            const fileSection = contentEl.createDiv();
            fileSection.createEl('h3', { text: '当前文件信息' });

            const grid = fileSection.createDiv({
                attr: { 
                    style: 'display: grid; grid-template-columns: 120px 1fr; gap: 10px; margin-bottom: 20px; padding: 10px; background-color: var(--background-secondary); border-radius: 4px;' 
                }
            });

            const ctime = this.file.stat.ctime;
            const mtime = this.file.stat.mtime;

            grid.createDiv({ text: '文件名：', attr: { style: 'font-weight: bold; color: var(--text-muted);' } });
            grid.createDiv({ text: this.file.name });

            grid.createDiv({ text: '创建时间：', attr: { style: 'font-weight: bold; color: var(--text-muted);' } });
            grid.createDiv({ text: `${moment(ctime).format(this.settings.timeFormat)} (${getRelativeTime(ctime)})` });

            grid.createDiv({ text: '修改时间：', attr: { style: 'font-weight: bold; color: var(--text-muted);' } });
            grid.createDiv({ text: `${moment(mtime).format(this.settings.timeFormat)} (${getRelativeTime(mtime)})` });
        } else {
            contentEl.createEl('p', { text: '当前没有打开的活动文件。', attr: { style: 'color: var(--text-muted);' } });
        }

        contentEl.createEl('hr', { attr: { style: 'margin: 20px 0;' } });

        // 2. 仓库统计信息
        const vaultSection = contentEl.createDiv();
        vaultSection.createEl('h3', { text: '仓库统计' });

        const allFiles = this.app.vault.getAllLoadedFiles();
        let folderCount = 0;
        let fileCount = 0;
        let mdCount = 0;

        allFiles.forEach(item => {
            if (item instanceof TFolder) {
                folderCount++;
            } else if (item instanceof TFile) {
                fileCount++;
                if (item.extension === 'md') {
                    mdCount++;
                }
            }
        });

        const vaultGrid = vaultSection.createDiv({
            attr: { 
                style: 'display: grid; grid-template-columns: 150px 1fr; gap: 10px; padding: 10px; background-color: var(--background-secondary); border-radius: 4px;' 
            }
        });

        vaultGrid.createDiv({ text: '文件总数：', attr: { style: 'font-weight: bold; color: var(--text-muted);' } });
        vaultGrid.createDiv({ text: fileCount.toString() });

        vaultGrid.createDiv({ text: '文件夹总数：', attr: { style: 'font-weight: bold; color: var(--text-muted);' } });
        vaultGrid.createDiv({ text: (folderCount - 1).toString() }); // 减去根目录本身

        vaultGrid.createDiv({ text: 'Markdown 笔记总数：', attr: { style: 'font-weight: bold; color: var(--text-muted);' } });
        vaultGrid.createDiv({ text: mdCount.toString() });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

// 设置面板
class FileStatsSettingTab extends PluginSettingTab {
    plugin: FileStatsPlugin;

    constructor(app: App, plugin: FileStatsPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: '文件修改时间状态栏设置' });

        new Setting(containerEl)
            .setName('状态栏显示类型')
            .setDesc('选择在状态栏默认显示相对时间还是绝对时间')
            .addDropdown(dropdown => dropdown
                .addOption('relative', '相对时间')
                .addOption('absolute', '绝对时间')
                .setValue(this.plugin.settings.displayType)
                .onChange(async (value: 'relative' | 'absolute') => {
                    this.plugin.settings.displayType = value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName('绝对时间格式')
            .setDesc('自定义绝对时间的显示格式（基于 Moment.js 格式，如 "YYYY-MM-DD HH:mm:ss"）')
            .addText(text => text
                .setPlaceholder('YYYY-MM-DD HH:mm:ss')
                .setValue(this.plugin.settings.timeFormat)
                .onChange(async (value) => {
                    this.plugin.settings.timeFormat = value || 'YYYY-MM-DD HH:mm:ss';
                    await this.plugin.saveSettings();
                })
            );
    }
}