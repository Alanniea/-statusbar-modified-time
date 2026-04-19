import { App, Plugin, PluginSettingTab, Setting, Modal, TFile, moment, TAbstractFile } from 'obsidian';

// 插件设置接口定义
interface FileStatsSettings {
	dateFormat: string;           // 自定义时间格式
	useRelativeTime: boolean;     // 是否使用相对时间
	refreshInterval: number;      // 刷新间隔（分钟）
	prefixText: string;           // 前缀文字
}

const DEFAULT_SETTINGS: FileStatsSettings = {
	dateFormat: 'YYYY-MM-DD HH:mm',
	useRelativeTime: true,
	refreshInterval: 1,
	prefixText: '修改于'
}

export default class FileStatsPlugin extends Plugin {
	settings: FileStatsSettings;
	statusBarItemEl: HTMLElement;
	timerId: number | null = null;

	async onload() {
		await this.loadSettings();

		// 1. 创建状态栏项目
		this.statusBarItemEl = this.addStatusBarItem();
		this.statusBarItemEl.addClass('mod-clickable'); // 添加样式使其看起来可点击
		
		// 2. 状态栏点击事件：弹出模态框
		this.statusBarItemEl.addEventListener('click', () => {
			const activeFile = this.app.workspace.getActiveFile();
			if (activeFile) {
				new FileStatsModal(this.app, activeFile, this.settings).open();
			}
		});

		// 3. 监听事件以更新状态栏
		this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.triggerUpdate()));
		this.registerEvent(this.app.workspace.on('file-open', () => this.triggerUpdate()));
		this.registerEvent(this.app.vault.on('modify', (file) => {
			if (file === this.app.workspace.getActiveFile()) {
				this.triggerUpdate();
			}
		}));

		// 添加设置选项卡
		this.addSettingTab(new FileStatsSettingTab(this.app, this));

		// 初始化更新
		this.triggerUpdate();
	}

	onunload() {
		if (this.timerId !== null) {
			window.clearTimeout(this.timerId);
		}
	}

	// 触发更新逻辑
	triggerUpdate() {
		// 清除旧的计时器
		if (this.timerId !== null) {
			window.clearTimeout(this.timerId);
			this.timerId = null;
		}
		this.updateStatusBar();
	}

	updateStatusBar() {
		const activeFile = this.app.workspace.getActiveFile();
		
		if (!activeFile) {
			this.statusBarItemEl.setText('');
			return;
		}

		const mtime = moment(activeFile.stat.mtime);
		const now = moment();
		const diffSeconds = now.diff(mtime, 'seconds');
		
		let displayText = "";

		// 逻辑：如果修改时间在 60 秒内，强制显示秒数，且下次刷新设为 1 秒后
		// 否则，根据设置显示，且下次刷新根据 refreshInterval 设定
		
		let nextRefreshDelay = this.settings.refreshInterval * 60 * 1000;

		if (diffSeconds < 60 && diffSeconds >= 0) {
			// 实时秒数模式
			displayText = `${this.settings.prefixText} ${diffSeconds}秒前`;
			nextRefreshDelay = 1000; // 1秒后再次刷新
		} else {
			// 常规模式
			const timeString = this.settings.useRelativeTime 
				? mtime.fromNow() 
				: mtime.format(this.settings.dateFormat);
			displayText = `${this.settings.prefixText} ${timeString}`;
		}

		this.statusBarItemEl.setText(displayText);

		// 设置下一次递归调用
		this.timerId = window.setTimeout(() => {
			this.updateStatusBar();
		}, nextRefreshDelay);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.triggerUpdate(); // 保存后立即刷新显示
	}
}

// 统计模态框
class FileStatsModal extends Modal {
	file: TFile;
	settings: FileStatsSettings;

	constructor(app: App, file: TFile, settings: FileStatsSettings) {
		super(app);
		this.file = file;
		this.settings = settings;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('file-stats-modal');

		contentEl.createEl('h2', { text: `文件统计: ${this.file.basename}` });

		const statsContainer = contentEl.createDiv({ cls: 'stats-grid' });

		// 获取时间
		const ctime = moment(this.file.stat.ctime);
		const mtime = moment(this.file.stat.mtime);

		// 1. 创建时间
		this.createStatItem(statsContainer, "创建时间", ctime);
		
		// 2. 修改时间
		this.createStatItem(statsContainer, "修改时间", mtime);

		contentEl.createEl('hr');

		// 3. 仓库统计
		const allFiles = this.app.vault.getFiles();
		const mdFiles = allFiles.filter(f => f.extension === 'md');

		const vaultStatsDiv = contentEl.createDiv({ cls: 'vault-stats' });
		vaultStatsDiv.createEl('h3', { text: '仓库概览' });
		vaultStatsDiv.createEl('p', { text: `📁 全部文件数：${allFiles.length}` });
		vaultStatsDiv.createEl('p', { text: `📝 Markdown 笔记数：${mdFiles.length}` });
	}

	createStatItem(container: HTMLElement, label: string, time: moment.Moment) {
		const item = container.createDiv({ cls: 'stat-item' });
		item.createEl('strong', { text: label });
		item.createEl('div', { text: `相对：${time.fromNow()}`, cls: 'stat-sub' });
		item.createEl('div', { text: `绝对：${time.format(this.settings.dateFormat)}`, cls: 'stat-sub' });
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

		containerEl.createEl('h2', { text: '状态栏时间设置' });

		new Setting(containerEl)
			.setName('显示前缀')
			.setDesc('显示在时间前面的文字')
			.addText(text => text
				.setPlaceholder('修改于')
				.setValue(this.plugin.settings.prefixText)
				.onChange(async (value) => {
					this.plugin.settings.prefixText = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('显示模式')
			.setDesc('切换在状态栏显示的默认时间格式')
			.addDropdown(dropdown => dropdown
				.addOption('relative', '相对时间 (例如: 5分钟前)')
				.addOption('absolute', '绝对时间 (例如: 2023-10-01)')
				.setValue(this.plugin.settings.useRelativeTime ? 'relative' : 'absolute')
				.onChange(async (value) => {
					this.plugin.settings.useRelativeTime = value === 'relative';
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('绝对时间格式')
			.setDesc('基于 Moment.js 的格式字符串 (例如: YYYY-MM-DD HH:mm)')
			.addText(text => text
				.setPlaceholder('YYYY-MM-DD HH:mm')
				.setValue(this.plugin.settings.dateFormat)
				.onChange(async (value) => {
					this.plugin.settings.dateFormat = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('常规刷新间隔 (分钟)')
			.setDesc('当文件不是最近修改时，状态栏的刷新频率 (即时修改会自动覆盖此设置)')
			.addSlider(slider => slider
				.setLimits(1, 60, 1)
				.setValue(this.plugin.settings.refreshInterval)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.refreshInterval = value;
					await this.plugin.saveSettings();
				}));
	}
}