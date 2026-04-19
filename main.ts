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
	statusBarItemEl: HTMLElement;
	updateInterval: number;

	async onload() {
		await this.loadSettings();

		// 1. 创建状态栏元素
		this.statusBarItemEl = this.addStatusBarItem();
		this.statusBarItemEl.classList.add('mod-clickable');
		
		// 2. 点击状态栏打开模态框
		this.statusBarItemEl.addEventListener('click', () => {
			new StatsModal(this.app, this.settings).open();
		});

		// 3. 初始更新状态栏
		this.updateStatusBar();

		// 4. 注册定时器：每秒更新一次（实时秒数显示）
		this.registerInterval(
			window.setInterval(() => this.updateStatusBar(), 1000)
		);

		// 5. 监听文件切换事件
		this.registerEvent(
			this.app.workspace.on('file-open', () => {
				this.updateStatusBar();
			})
		);

		// 6. 添加设置面板
		this.addSettingTab(new FileTimeSettingTab(this.app, this));
	}

	onunload() {
		// 插件卸载时的清理工作已由 Obsidian API 自动处理
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.updateStatusBar(); // 保存设置后立即刷新
	}

	// 更新状态栏显示
	updateStatusBar() {
		const activeFile = this.app.workspace.getActiveFile();
		
		if (!activeFile) {
			this.statusBarItemEl.setText('无活动文件');
			return;
		}

		const mtime = activeFile.stat.mtime;
		let displayText = '';

		if (this.settings.displayMode === 'relative') {
			displayText = `修改于: ${this.formatRelativePrecise(mtime)}`;
		} else {
			displayText = `修改于: ${moment(mtime).format(this.settings.absoluteFormat)}`;
		}

		this.statusBarItemEl.setText(displayText);
	}

	// 精确到秒的相对时间计算
	formatRelativePrecise(timestamp: number): string {
		const diff = Math.floor((Date.now() - timestamp) / 1000);
		if (diff < 0) return '刚刚';
		
		const days = Math.floor(diff / 86400);
		const hours = Math.floor((diff % 86400) / 3600);
		const minutes = Math.floor((diff % 3600) / 60);
		const seconds = diff % 60;

		const parts = [];
		if (days > 0) parts.push(`${days}天`);
		if (hours > 0 || days > 0) parts.push(`${hours}小时`);
		if (minutes > 0 || hours > 0 || days > 0) parts.push(`${minutes}分钟`);
		parts.push(`${seconds}秒前`);

		return parts.join(' ');
	}
}

// ==========================================
// 模态框：显示详细统计信息
// ==========================================
class StatsModal extends Modal {
	settings: FileTimeSettings;
	activeFile: TFile | null;
	updateTimer: number;
	timeContainer: HTMLElement;

	constructor(app: App, settings: FileTimeSettings) {
		super(app);
		this.settings = settings;
		this.activeFile = this.app.workspace.getActiveFile();
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		
		contentEl.createEl('h2', { text: '文件与仓库统计信息' });

		// --- 1. 当前文件时间统计区域 ---
		this.timeContainer = contentEl.createDiv({ cls: 'time-stats-container' });
		this.timeContainer.style.marginBottom = '20px';
		this.timeContainer.style.padding = '10px';
		this.timeContainer.style.backgroundColor = 'var(--background-secondary)';
		this.timeContainer.style.borderRadius = '8px';
		
		this.renderTimeStats();

		// 设置定时器，使模态框内的时间也能实时读秒
		this.updateTimer = window.setInterval(() => {
			this.renderTimeStats();
		}, 1000);

		// --- 2. 仓库资源统计区域 ---
		const vaultContainer = contentEl.createDiv({ cls: 'vault-stats-container' });
		vaultContainer.style.padding = '10px';
		vaultContainer.style.backgroundColor = 'var(--background-secondary)';
		vaultContainer.style.borderRadius = '8px';
		
		vaultContainer.createEl('h3', { text: '📦 仓库资源统计', cls: 'margin-bottom-sm' });

		const stats = this.getVaultStats();
		vaultContainer.createEl('p', { text: `📄 全部文件总量：${stats.totalFiles}` });
		vaultContainer.createEl('p', { text: `📁 文件夹总量：${stats.totalFolders}` });
		vaultContainer.createEl('p', { text: `📝 Markdown 笔记总量：${stats.mdFiles}` });
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
		// 清除定时器防止内存泄漏
		if (this.updateTimer) {
			window.clearInterval(this.updateTimer);
		}
	}

	// 渲染文件时间（会被定时器每秒调用更新）
	renderTimeStats() {
		this.timeContainer.empty();
		this.timeContainer.createEl('h3', { text: '⏱️ 当前文件时间', cls: 'margin-bottom-sm' });

		if (!this.activeFile) {
			this.timeContainer.createEl('p', { text: '当前没有打开任何文件。' });
			return;
		}

		const ctime = this.activeFile.stat.ctime;
		const mtime = this.activeFile.stat.mtime;
		const format = this.settings.absoluteFormat;

		// 创建时间
		this.timeContainer.createEl('div', { text: `创建时间 (绝对): ${moment(ctime).format(format)}` });
		this.timeContainer.createEl('div', { text: `创建时间 (相对): ${this.formatRelativePrecise(ctime)}` });
		this.timeContainer.createEl('br');
		// 修改时间
		this.timeContainer.createEl('div', { text: `修改时间 (绝对): ${moment(mtime).format(format)}` });
		this.timeContainer.createEl('div', { text: `修改时间 (相对): ${this.formatRelativePrecise(mtime)}` });
	}

	// 获取仓库统计
	getVaultStats() {
		const allFiles = this.app.vault.getAllLoadedFiles();
		let totalFolders = 0;
		let totalFiles = 0;
		let mdFiles = 0;

		for (const file of allFiles) {
			if (file instanceof TFolder) {
				totalFolders++;
			} else if (file instanceof TFile) {
				totalFiles++;
				if (file.extension === 'md') {
					mdFiles++;
				}
			}
		}

		// 减去根目录 "/" 本身（可选）
		if (totalFolders > 0) totalFolders--; 

		return { totalFiles, totalFolders, mdFiles };
	}

	formatRelativePrecise(timestamp: number): string {
		const diff = Math.floor((Date.now() - timestamp) / 1000);
		if (diff < 0) return '刚刚';
		const days = Math.floor(diff / 86400);
		const hours = Math.floor((diff % 86400) / 3600);
		const minutes = Math.floor((diff % 3600) / 60);
		const seconds = diff % 60;

		const parts = [];
		if (days > 0) parts.push(`${days}天`);
		if (hours > 0 || days > 0) parts.push(`${hours}小时`);
		if (minutes > 0 || hours > 0 || days > 0) parts.push(`${minutes}分钟`);
		parts.push(`${seconds}秒前`);

		return parts.join(' ');
	}
}

// ==========================================
// 设置面板
// ==========================================
class FileTimeSettingTab extends PluginSettingTab {
	plugin: FileTimePlugin;

	constructor(app: App, plugin: FileTimePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: '文件时间状态栏 设置' });

		new Setting(containerEl)
			.setName('显示模式')
			.setDesc('选择在状态栏中显示相对时间还是绝对时间。')
			.addDropdown(dropdown => dropdown
				.addOption('relative', '相对时间 (例如：2小时 5分钟 30秒前)')
				.addOption('absolute', '绝对时间 (例如：2023-10-25 14:30:00)')
				.setValue(this.plugin.settings.displayMode)
				.onChange(async (value: 'relative' | 'absolute') => {
					this.plugin.settings.displayMode = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('绝对时间格式')
			.setDesc('自定义绝对时间的显示格式 (使用 Moment.js 格式，包含 ss 可以实现秒数跳动)。')
			.addText(text => text
				.setPlaceholder('YYYY-MM-DD HH:mm:ss')
				.setValue(this.plugin.settings.absoluteFormat)
				.onChange(async (value) => {
					this.plugin.settings.absoluteFormat = value || 'YYYY-MM-DD HH:mm:ss';
					await this.plugin.saveSettings();
				}));
	}
}