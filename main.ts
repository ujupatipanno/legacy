import { App, Plugin, PluginSettingTab, Setting, TFile, Notice, normalizePath } from 'obsidian';

// 플러그인 설정 인터페이스
interface LegacyFilePluginSettings {
	legacyFolder: string; // 레거시 파일이 저장될 폴더
	sortOrder: 'asc' | 'desc'; // 정렬 순서 (오름차순/내림차순)
}

// 기본 설정값
const DEFAULT_SETTINGS: LegacyFilePluginSettings = {
	legacyFolder: 'legacy',
	sortOrder: 'asc'
}

export default class LegacyFilePlugin extends Plugin {
	settings: LegacyFilePluginSettings;

	async onload() {
		// 설정 로드
		await this.loadSettings();

		// 명령어 1: 현재 문서의 레거시 파일 만들기
		this.addCommand({
			id: 'create-legacy-file',
			name: '현재 문서의 레거시 파일 만들기',
			icon: 'lucide-save',
			callback: () => this.createLegacyFile()
		});

		// 명령어 2: 현재 문서의 레거시 파일 보존하기
		this.addCommand({
			id: 'preserve-legacy-files',
			name: '현재 문서의 레거시 파일 보존하기',
			icon: 'lucide-save-all',
			callback: () => this.preserveLegacyFiles()
		});

		// 리본 아이콘 1: 레거시 파일 만들기
		this.addRibbonIcon('lucide-save', '레거시 파일 만들기', () => {
			this.createLegacyFile();
		});

		// 리본 아이콘 2: 레거시 파일 보존하기
		this.addRibbonIcon('lucide-save-all', '레거시 파일 보존하기', () => {
			this.preserveLegacyFiles();
		});

		// 설정 탭 추가
		this.addSettingTab(new LegacyFileSettingTab(this.app, this));
	}

	onunload() {
		// 플러그인 언로드 시 정리 작업
	}

	// 설정 로드
	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	// 설정 저장
	async saveSettings() {
		await this.saveData(this.settings);
	}

	// 현재 날짜/시간을 YYYYMMDDHHmmss 형식으로 반환
	getTimestamp(): string {
		const now = new Date();
		const year = now.getFullYear();
		const month = String(now.getMonth() + 1).padStart(2, '0');
		const day = String(now.getDate()).padStart(2, '0');
		const hour = String(now.getHours()).padStart(2, '0');
		const minute = String(now.getMinutes()).padStart(2, '0');
		const second = String(now.getSeconds()).padStart(2, '0');
		return `${year}${month}${day}${hour}${minute}${second}`;
	}

	// 레거시 파일 만들기
	async createLegacyFile() {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice('활성화된 파일이 없습니다.');
			return;
		}

		try {
			// 현재 파일의 내용 읽기
			const content = await this.app.vault.read(activeFile);
			
			// 파일 이름에서 확장자 제거
			const baseName = activeFile.basename;
			
			// 타임스탬프 생성
			const timestamp = this.getTimestamp();
			
			// 새 파일 이름 생성 (형식: 파일명_legacy_YYYYMMDDHHmmss.md)
			const newFileName = `${baseName}_legacy_${timestamp}.md`;
			
			// 레거시 폴더 경로 생성 (정규화)
			const legacyFolderPath = normalizePath(this.settings.legacyFolder);
			
			// 레거시 폴더가 없으면 생성
			if (!(await this.app.vault.adapter.exists(legacyFolderPath))) {
				await this.app.vault.createFolder(legacyFolderPath);
			}
			
			// 새 파일 경로
			const newFilePath = normalizePath(`${legacyFolderPath}/${newFileName}`);
			
			// 새 파일 생성
			await this.app.vault.create(newFilePath, content);
			
			new Notice(`레거시 파일이 생성되었습니다: ${newFileName}`);
		} catch (error) {
			console.error('레거시 파일 생성 중 오류:', error);
			new Notice('레거시 파일 생성에 실패했습니다.');
		}
	}

	// 레거시 파일 보존하기
	async preserveLegacyFiles() {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice('활성화된 파일이 없습니다.');
			return;
		}

		try {
			const baseName = activeFile.basename;
			const legacyFolderPath = normalizePath(this.settings.legacyFolder);
			
			// 레거시 폴더가 없으면 종료
			if (!(await this.app.vault.adapter.exists(legacyFolderPath))) {
				new Notice('레거시 폴더가 존재하지 않습니다.');
				return;
			}

			// 레거시 폴더의 모든 파일 가져오기
			const allFiles = this.app.vault.getFiles();
			
			// 현재 노트의 레거시 파일들만 필터링
			// 현재 작업 중인 파일의 basename과 정확히 일치하는 레거시 파일만 선택
			const legacyFiles = allFiles.filter(file => {
				// 레거시 폴더 내에 있는지 확인
				const fileFolder = file.parent ? normalizePath(file.parent.path) : '';
				const isInLegacyFolder = fileFolder === legacyFolderPath;
				
				// 파일 이름이 {현재파일명}_legacy_YYYYMMDDHHmmss 패턴인지 확인
				const pattern = new RegExp(`^${baseName}_legacy_\\d{14}$`);
				const matchesPattern = pattern.test(file.basename);
				
				return isInLegacyFolder && matchesPattern;
			});

			if (legacyFiles.length === 0) {
				new Notice('레거시 파일이 없습니다.');
				return;
			}

			// 파일 이름에서 타임스탬프 추출 및 정렬
			const filesWithTimestamp = legacyFiles.map(file => {
				// 파일 이름에서 타임스탬프 추출 (예: note_legacy_20241215103045)
				const match = file.basename.match(/_legacy_(\d{14})$/);
				const timestamp = match ? match[1] : '00000000000000';
				return { file, timestamp };
			});

			// 정렬 순서에 따라 정렬
			filesWithTimestamp.sort((a, b) => {
				if (this.settings.sortOrder === 'asc') {
					return a.timestamp.localeCompare(b.timestamp);
				} else {
					return b.timestamp.localeCompare(a.timestamp);
				}
			});

			// 보존 파일 내용 생성
			let preservedContent = '';
			const timestamps: string[] = [];

			for (let i = 0; i < filesWithTimestamp.length; i++) {
				const { file, timestamp } = filesWithTimestamp[i];
				const content = await this.app.vault.read(file);
				
				// 타임스탬프 저장
				timestamps.push(timestamp);
				
				// 구분선과 태그 추가
				if (i > 0) {
					preservedContent += '\n___\n\n';
				}
				
				preservedContent += `# ${baseName}_legacy_${timestamp}\n\n`;
				preservedContent += content;
			}

			// 보존 파일 이름 생성
			const startTimestamp = timestamps[0];
			const endTimestamp = timestamps[timestamps.length - 1];
			const preservedFileName = `${baseName}_legacy_${startTimestamp}-${endTimestamp}.md`;
			const preservedFilePath = normalizePath(`${legacyFolderPath}/${preservedFileName}`);

			// 보존 파일 생성
			await this.app.vault.create(preservedFilePath, preservedContent);

			// 레거시 파일들 삭제
			for (const { file } of filesWithTimestamp) {
				await this.app.vault.delete(file);
			}

			new Notice(`레거시 파일이 보존되었습니다: ${preservedFileName}`);
		} catch (error) {
			console.error('레거시 파일 보존 중 오류:', error);
			new Notice('레거시 파일 보존에 실패했습니다.');
		}
	}
}

// 설정 탭
class LegacyFileSettingTab extends PluginSettingTab {
	plugin: LegacyFilePlugin;

	constructor(app: App, plugin: LegacyFilePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		// 레거시 폴더 설정
		new Setting(containerEl)
			.setName('레거시 폴더 위치')
			.setDesc('레거시 파일이 저장될 폴더 경로를 지정하세요.')
			.addText(text => text
				.setPlaceholder('legacy')
				.setValue(this.plugin.settings.legacyFolder)
				.onChange(async (value) => {
					this.plugin.settings.legacyFolder = value || 'legacy';
					await this.plugin.saveSettings();
				}));

		// 정렬 순서 설정
		new Setting(containerEl)
			.setName('정렬 순서')
			.setDesc('레거시 파일을 보존할 때 정렬 순서를 선택하세요.')
			.addDropdown(dropdown => dropdown
				.addOption('asc', '오름차순 (오래된 것부터)')
				.addOption('desc', '내림차순 (최신 것부터)')
				.setValue(this.plugin.settings.sortOrder)
				.onChange(async (value) => {
					this.plugin.settings.sortOrder = value as 'asc' | 'desc';
					await this.plugin.saveSettings();
				}));
	}
}
