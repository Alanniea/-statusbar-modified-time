import { App, Modal, Plugin, PluginSettingTab, Setting, TFile, TFolder, moment } from 'obsidian';

interface FileTimeSettings {
	displayMode: 'relative' | 'absolute';
	absoluteFormat: string;
}

const DEFAULT_SETTINGS: FileTimeSettings = {
	displayMode: 'relative',
	absoluteFormat: 'YYYY-MM-DD HH:mm:ss'
}

export default class FileTimePlugin extends Plugin {
	settings: FileTimeSettings;
	statusBarEl: HTMLElement;

	async onload() {
		await this.loadSettings();

		// 添加状态栏元素
		this.statusBarEl = this.addStatusBarItem();
		this.statusBarEl.classList.add('mod-clickable');
		
		// 点击状态栏打开模态框
		this.registerDomEvent(this.statusBarEl, 'click', () => {
			const activeFile = this.app.workspace.getActiveFile();
			if (activeFile) {
				new StatsModal(this.app, activeFile, this.settings).open();
			}
		});

		// 注册定时器，每秒刷新一次状态栏（实现 1 分钟内秒数实时更新）
		this.registerInterval(
			window.setInterval(() => this.updateStatusBar(), 1000)
		);

		// 监听文件切换和内容修改事件
		this.registerEvent(this.app.workspace.on('file-open', () => this.updateStatusBar()));
		this.registerEvent(this.app.vault.on('modify', (file) => {
			if (file instanceof TFile && file === this.app.workspace.getActiveFile()) {
				this.updateStatusBar();
			}
		}));

		// 添加设置面板
		this.addSettingTab(new FileTimeSettingTab(this.app, this));

		// 初始化执行一次
		this.updateStatusBar();
	}

	onunload() {
		this.statusBarEl.empty();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.updateStatusBar();
	}

	// 更新状态栏显示的逻辑
	updateStatusBar() {
		const file = this.app.workspace.getActiveFile();
		if (!file) {
			this.statusBarEl.setText('');
			return;
		}

		const mtime = file.stat.mtime;
		const now = Date.now();
		const diff = now - mtime;

		let displayText = '';

		if (this.settings.displayMode === 'absolute') {
			displayText = `修改于: ${moment(mtime).format(this.settings.absoluteFormat)}`;
		} else {
			// 相对时间模式
			if (diff < 60000) { 
				// 1分钟内，实时显示秒数
				const seconds = Math.floor(diff / 1000);
				displayText = `修改于: ${seconds === 0 ? '刚刚' : seconds + ' 秒前'}`;
			} else {
				// 超过1分钟使用 moment.js 的相对时间
				displayText = `修改于: ${moment(mtime).fromNow()}`;
			}
		}

		this.statusBarEl.setText(displayText);
	}
}

/**
 * 模态框：显示文件详细时间和仓库资源汇总
 */
class StatsModal extends Modal {
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

		contentEl.createEl('h2', { text: '📊 当前文件与仓库统计' });

		// --- 1. 当前文件时间统计 ---
		const ctime = this.file.stat.ctime;
		const mtime = this.file.stat.mtime;
		const format = this.settings.absoluteFormat;

		contentEl.createEl('h3', { text: `📄 ${this.file.name}` });
		
		const fileStatsDiv = contentEl.createDiv({ cls: 'file-time-stats-container' });
		fileStatsDiv.style.marginBottom = '20px';
		fileStatsDiv.style.lineHeight = '1.8';

		fileStatsDiv.createEl('div', { 
			text: `🕒 创建时间: ${moment(ctime).format(format)} (${moment(ctime).fromNow()})` 
		});
		fileStatsDiv.createEl('div', { 
			text: `✏️ 修改时间: ${moment(mtime).format(format)} (${moment(mtime).fromNow()})` 
		});

		contentEl.createEl('hr');

		// --- 2. 仓库资源汇总 ---
		contentEl.createEl('h3', { text: '🗂️ 仓库资源汇总' });

		const allFiles = this.app.vault.getAllLoadedFiles();
		let totalFiles = 0;
		let totalFolders = 0;
		let mdFiles = 0;

		allFiles.forEach(f => {
			if (f instanceof TFolder) {
				// 排除根目录自身
				if (f.path !== '/') totalFolders++;
			} else if (f instanceof TFile) {
				totalFiles++;
				if (f.extension === 'md') mdFiles++;
			}
		});

		const vaultStatsDiv = contentEl.createDiv();
		vaultStatsDiv.style.lineHeight = '1.8';
		
		vaultStatsDiv.createEl('div', { text: `📁 文件夹总数: ${totalFolders}` });
		vaultStatsDiv.createEl('div', { text: `📝 Markdown 笔记总数: ${mdFiles}` });
		vaultStatsDiv.createEl('div', { text: `📎 全部文件总数 (含附件): ${totalFiles}` });
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

/**
 * 插件设置面板
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

		containerEl.createEl('h2', { text: '文件修改时间设置' });

		new Setting(containerEl)
			.setName('显示模式')
			.setDesc('选择状态栏时间的显示方式。')
			.addDropdown(dropdown => dropdown
				.addOption('relative', '相对时间 (如: 12秒前, 2小时前)')
				.addOption('absolute', '绝对时间 (如: 2023-10-01 12:00)')
				.setValue(this.plugin.settings.displayMode)
				.onChange(async (value: 'relative' | 'absolute') => {
					this.plugin.settings.displayMode = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('绝对时间格式')
			.setDesc('设置绝对时间的显示格式（使用 Moment.js 语法，如 YYYY-MM-DD HH:mm:ss）。仅在模态框或绝对时间模式下生效。')
			.addText(text => text
				.setPlaceholder('YYYY-MM-DD HH:mm:ss')
				.setValue(this.plugin.settings.absoluteFormat)
				.onChange(async (value) => {
					this.plugin.settings.absoluteFormat = value || 'YYYY-MM-DD HH:mm:ss';
					await this.plugin.saveSettings();
				}));
	}
}