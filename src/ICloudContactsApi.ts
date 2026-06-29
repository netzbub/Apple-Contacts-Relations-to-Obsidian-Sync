import { ICloudContactsSettings } from "./SettingTab";
import { createFrontmatter } from "./frontMatter";
import { parseVCardToJCard } from "./parser";
import { sanitizeFilename } from "./sanitize";

export type ICloudVCard = {
	url: string;
	etag: string;
	data: string;
};

type Properties = {
	[key: string]: any;
};

const deletedFolder = "Deleted";
const iCloudVCardPropertieName = "iCloudVCard";
const errorsFileName = "Errors";
const pluginName = "iCloud Contacts";

interface ListedFiles {
	files: string[];
	folders: string[];
}

type TAbstractFile = {
	vault: Vault;
	path: string;
	name: string;
	parent: TFolder | null;
};

type Vault = {
	adapter: {
		list: (normalizedPath: string) => Promise<ListedFiles>;
		exists: (path: string, sensitive?: boolean) => Promise<boolean>;
	};
	append: (file: TFile, data: string) => Promise<void>;
	create: (path: string, data: string) => Promise<TFile>;
	createFolder: (path: string) => Promise<TFolder>;
	getFileByPath: (path: string) => TFile | null;
	getFolderByPath: (path: string) => TFolder | null;
	process: (file: TFile, fn: (data: string) => string) => Promise<string>;
};

type TFile = {
	stat: {
		ctime: number;
		mtime: number;
		size: number;
	};
	basename: string;
	extension: string;
} & TAbstractFile;

type TFolder = {
	children: TAbstractFile[];
	isRoot: () => boolean;
};

export type CachedMetadata = { frontmatter?: Properties };

export interface OnlyRequiredFromObsidianApi {
	normalizePath: (path: string) => string;
	app: {
		fileManager: {
			processFrontMatter: (
				file: TFile,
				fn: (frontmatter: any) => void,
			) => Promise<void>;
			renameFile: (file: TFile, newPath: string) => Promise<void>;
		};
		vault: Vault;
		workspace: {
			getLeaf: () => {
				openFile: (file: TFile) => Promise<void>;
			};
		};
		metadataCache: {
			getCache: (path: string) => CachedMetadata | null;
		};
	};
}

type NoticeShower = (
	message: string,
	duration: number,
) => {
	setMessage: (message: string) => void;
	hide: () => void;
};

export default class ICloudContactsApi {
	private app: OnlyRequiredFromObsidianApi["app"];
	private normalizePath: OnlyRequiredFromObsidianApi["normalizePath"];
	private newContacts: ICloudVCard[] = [];
	private modifiedContacts: ICloudVCard[] = [];
	private deletedContacts: ICloudVCard[] = [];
	private skippedContacts: ICloudVCard[] = [];
	private groupMap: Map<string, string[]> = new Map();

	constructor(
		onlyRequiredFromObsidianApp: OnlyRequiredFromObsidianApi,
		private settings: ICloudContactsSettings,
		private fetchContacts: (
			username: string,
			password: string,
			serverUrl: string,
		) => Promise<ICloudVCard[]>,
		private showNotice: NoticeShower,
	) {
		this.app = onlyRequiredFromObsidianApp.app;
		this.normalizePath = onlyRequiredFromObsidianApp.normalizePath;
	}

	async updateContacts(options = { rewriteAll: false }) {
		const haveSettingsChanged =
			!!this.settings.previousUpdateSettings &&
			!this.isSameSettings(
				this.settings,
				this.settings.previousUpdateSettings,
			);
		if (haveSettingsChanged) options.rewriteAll = true;
		const startNotice = this.showNotice(
			`${pluginName}: Updating contacts...`,
			0,
		);
		let interval: ReturnType<typeof setInterval> | null = null;

		try {
			this.validateSettings();
			await this.getCreateFolder(this.settings.folder);

			// Starte a interval that sets setMessage every 1 second
			let nDots = 0;
			interval = setInterval(() => {
				// Update the number ofr dots at the end every secoon
				if (nDots > 3) nDots = 0;
				// Pad the number of dots to 3
				const dots = ".".repeat(nDots).padEnd(3, " ");
				startNotice.setMessage(
					`${pluginName}: Downloading contacts${dots}`,
				);
				nDots++;
			}, 500);

			let iCloudVCards = await this.fetchContacts(
				this.settings.username,
				this.settings.password,
				this.settings.iCloudServerUrl,
			);

			this.groupMap = this.buildGroupMap(iCloudVCards);

			if (this.settings.groups.length > 0) {
				// Find all chosen group cards
				const groupVCards = iCloudVCards.filter(
					(vCard) =>
						// Only include group cards
						this.isGroupCard(vCard) &&
						// That are in the selected groups
						parseVCardToJCard(vCard.data)
							.filter((jCard) => jCard.key === "uid")
							.filter((jCard) =>
								this.settings.groups.some(
									(id) => id === (jCard.value as string),
								),
							).length > 0,
				);

				// Create a list of all uids in the group cards
				const contactUids = groupVCards.flatMap((vCard) =>
					parseVCardToJCard(vCard.data)
						.filter(
							(jCard) => jCard.key === "xAddressbookserverMember",
						)
						.map((jCard) =>
							(jCard.value as string).replace("urn:uuid:", ""),
						),
				);

				// Keep only the cards that have a uid in the list from the selected groups
				iCloudVCards = iCloudVCards.filter((vCard) =>
					contactUids.some((uid) =>
						vCard.data.includes("UID:" + uid),
					),
				);
			}

			// Remove group vCards so only actual contact cards are processed
			iCloudVCards = iCloudVCards.filter(
				(vCard) => !this.isGroupCard(vCard),
			);

			const existingContacts = await this.getAllCurrentContacts(
				this.settings.folder,
			);

			const previousUpdateData = this.settings.previousUpdateData || [];

			let i = 0;
			for (const iCloudVCard of iCloudVCards) {
				startNotice.setMessage(
					`${pluginName}: Updating contact ${i++} of ${iCloudVCards.length}`,
				);
				const previousUpdateVCard = previousUpdateData.find(
					(vCard) => vCard.url === iCloudVCard.url,
				);
				const existingContact = existingContacts.find(
					(c) =>
						c.frontmatter[iCloudVCardPropertieName].url ===
						iCloudVCard.url,
				);

				await this.processVCard(
					iCloudVCard,
					previousUpdateVCard,
					existingContact,
					options,
				);
			}

			if (options.rewriteAll) {
				await this.applyReciprocalEdges();
			}

			await this.moveDeletedContacts(existingContacts, iCloudVCards);
		} catch (e) {
			console.error(e);
			this.handleError("Error when running updateContacts", e, {
				options,
			});
		} finally {
			if (interval) clearInterval(interval);
		}
		const usedSettings = { ...this.settings };

		const updateData = [
			...this.newContacts,
			...this.modifiedContacts,
			...this.skippedContacts,
		];

		startNotice.hide();
		this.reportHappenings(haveSettingsChanged);

		this.newContacts = [];
		this.modifiedContacts = [];
		this.deletedContacts = [];
		this.skippedContacts = [];
		this.groupMap = new Map();

		return { updateData, usedSettings };
	}

	private isGroupCard(vCard: ICloudVCard) {
		return vCard.data.includes("X-ADDRESSBOOKSERVER-KIND:group");
	}

	private validateSettings() {
		if (!this.settings.username) {
			throw new Error("ICloud username is required in settings");
		}
		if (!this.settings.password) {
			throw new Error(
				"ICloud app specific password is required in settings",
			);
		}
		if (!this.settings.folder) {
			throw new Error("Folder is required in settings");
		}
		const normalizedFolderPath = this.normalizePath(this.settings.folder);
		if (this.settings.folder !== normalizedFolderPath) {
			throw new Error(
				`Folder "${this.settings.folder}" is not valid, How about using "${normalizedFolderPath}"`,
			);
		}
	}

	private async processVCard(
		iCloudVCard: ICloudVCard,
		previousVCard: ICloudVCard | undefined,
		existingContact: { frontmatter: Properties; path: string } | undefined,
		options: { rewriteAll: boolean },
	) {
		try {
			if (existingContact) {
				const isModified = this.isModified(
					existingContact.frontmatter,
					iCloudVCard,
				);
				if (isModified || options.rewriteAll) {
					await this.updateContactFile(
						iCloudVCard,
						existingContact,
						previousVCard,
					);
					this.modifiedContacts.push(iCloudVCard);
				} else {
					this.skippedContacts.push(iCloudVCard);
				}
				return;
			}

			await this.createContactFile(iCloudVCard);
			this.newContacts.push(iCloudVCard);
		} catch (e) {
			this.handleError("Error trying to process contact", e, iCloudVCard);
		}
	}

	private reportHappenings(haveSettingsChanged: boolean) {
		const newCount = this.newContacts.length;
		const modifiedCount = this.modifiedContacts.length;
		const deletedCount = this.deletedContacts.length;
		const skippedCount = this.skippedContacts.length;
		let noticeText = pluginName + ":\n";
		noticeText += `Created ${newCount}\n`;
		noticeText += `Modified ${modifiedCount}\n`;
		noticeText += `Deleted ${deletedCount}\n`;
		noticeText += `Skipped ${skippedCount}\n`;
		if (haveSettingsChanged)
			noticeText += "All contacts were updated to reflect new settings";
		if (newCount + modifiedCount + deletedCount === 0)
			noticeText += "Already up to date";
		this.showNotice(noticeText, 7000);
	}

	private async moveDeletedContacts(
		existingContacts: { frontmatter: Properties; path: string }[],
		iCloudVCards: ICloudVCard[],
	) {
		const deletedContacts = existingContacts.filter(
			(c) =>
				!iCloudVCards.some(
					(i) =>
						i.url === c.frontmatter[iCloudVCardPropertieName].url,
				),
		);

		this.deletedContacts = deletedContacts.map(
			(c) => c.frontmatter[iCloudVCardPropertieName],
		);
		if (deletedContacts.length > 0) {
			const folderPath = this.settings.folder + "/" + deletedFolder;
			await this.getCreateFolder(folderPath);
		}

		// Move deleted contacts to deleted folder
		for (const deletedContact of deletedContacts) {
			await this.moveDeletedContact(deletedContact);
		}
	}

	private async moveDeletedContact(deletedContact: {
		frontmatter: Properties;
		path: string;
	}) {
		try {
			const contactFile = this.app.vault.getFileByPath(
				deletedContact.path,
			);
			if (!contactFile)
				throw new Error(deletedContact.path + " not found");

			const uniqueFilePath = await this.createUniqeContactFilePath(
				`${deletedFolder}/${contactFile.basename}`,
			);
			await this.app.fileManager.renameFile(
				contactFile,
				this.normalizePath(uniqueFilePath),
			);
		} catch (e) {
			this.handleError(
				"Error trying to move deleted contact",
				e,
				deletedContact.frontmatter[iCloudVCardPropertieName],
			);
		}
	}

	private isModified(
		existingFrontmatter: Properties,
		iCloudVCard: ICloudVCard,
	) {
		return (
			existingFrontmatter[iCloudVCardPropertieName].etag !==
			iCloudVCard.etag
		);
	}

	private async updateContactFile(
		iCloudVCard: ICloudVCard,
		existingContact: { frontmatter: Properties; path: string },
		previousVCard: ICloudVCard | undefined,
	) {
		const groupNames = this.getGroupNamesForVCard(iCloudVCard.data);
		const newFrontMatter = createFrontmatter(
			iCloudVCard.data,
			this.settings,
			groupNames,
		);

		const contactFile = this.app.vault.getFileByPath(existingContact.path);
		if (!contactFile) {
			throw new Error("contactFile not found");
		}

		const isFullNameModified =
			existingContact.frontmatter.name !== newFrontMatter.name;
		if (isFullNameModified) {
			const uniqueFilePath = await this.createUniqeContactFilePath(
				newFrontMatter.name as string,
			);
			await this.app.fileManager.renameFile(
				contactFile,
				this.normalizePath(uniqueFilePath),
			);
		}

		let isPrevNameHeading =
			this.settings.previousUpdateSettings?.isNameHeading;
		// This takes into acoount the first time, when the isNameHeading is not in previousUpdateSettings
		if (isPrevNameHeading === undefined) isPrevNameHeading = true;
		const isNameHeading = this.settings.isNameHeading;

		const isRemoveHeading = isPrevNameHeading && !isNameHeading;
		const isAddHeading = !isPrevNameHeading && isNameHeading;

		let searchValue = `# ${existingContact.frontmatter.name}`;
		let replaceValue = `# ${newFrontMatter.name}`;

		if (isRemoveHeading) {
			replaceValue = "";
		} else if (isAddHeading) {
			searchValue = `\n---\n`;
			replaceValue = `\n---\n# ${newFrontMatter.name}`;
		}

		if (
			searchValue !== replaceValue &&
			(isPrevNameHeading || isNameHeading)
		) {
			await this.app.vault.process(contactFile, (data) => {
				if (!data.endsWith(searchValue)) replaceValue += "\n";
				return data.replace(searchValue, replaceValue);
			});
		}

		const previousData = previousVCard
			? previousVCard.data
			: existingContact.frontmatter[iCloudVCardPropertieName].data;
		const prevFrontMatter = createFrontmatter(
			previousData,
			this.settings.previousUpdateSettings || this.settings,
		);

		await this.app.fileManager.processFrontMatter(
			contactFile,
			(fileFrontmatter) => {
				if (prevFrontMatter) {
					for (const [key] of Object.entries(prevFrontMatter)) {
						// If the kay exists in prev but not in new delete it
						if (!newFrontMatter[key]) {
							delete fileFrontmatter[key];
						}
					}
				}
				for (const [key, value] of Object.entries(newFrontMatter)) {
					fileFrontmatter[key] = value;
				}
				fileFrontmatter[iCloudVCardPropertieName] =
					JSON.stringify(iCloudVCard);
			},
		);
	}

	private async createContactFile(iCloudVCard: ICloudVCard) {
		if (!iCloudVCard.data) {
			throw new Error("iCloudVCard.data is undefined");
		}

		const groupNames = this.getGroupNamesForVCard(iCloudVCard.data);
		const frontMatter = createFrontmatter(iCloudVCard.data, this.settings, groupNames);

		let filePath = await this.createUniqeContactFilePath(
			frontMatter.name as string,
		);

		const newFile = await this.app.vault.create(
			this.normalizePath(filePath),
			this.settings.isNameHeading ? `# ${frontMatter.name}` : "",
		);
		await this.app.fileManager.processFrontMatter(newFile, (fm) => {
			for (const [key, value] of Object.entries(frontMatter)) {
				fm[key] = value;
			}
			fm[iCloudVCardPropertieName] = JSON.stringify(iCloudVCard);
		});
	}

	private async createUniqeContactFilePath(subPath: string) {
		const parts = subPath.split("/");
		const safeName = sanitizeFilename(parts[parts.length - 1]);
		const safeSubPath = [...parts.slice(0, -1), safeName].join("/");
		let filePath = `${this.settings.folder}/${safeSubPath}.md`;
		let i = 1;
		while (true) {
			const fileExists = await this.app.vault.adapter.exists(
				this.normalizePath(filePath),
				true,
			);
			if (!fileExists) break;
			i++;
			filePath = `${this.settings.folder}/${safeSubPath} ${i}.md`;
		}
		return filePath;
	}

	private async getAllCurrentContacts(folder: string) {
		// Get all files in folder
		const listedFiles = await this.app.vault.adapter.list(folder);
		const contacts = listedFiles.files
			.filter(
				(path) =>
					path.endsWith(".md") && !path.includes(errorsFileName),
			)
			.map((path) => ({
				frontmatter: this.getContactProperties(path),
				path,
			}))
			.filter((x) => x.frontmatter !== undefined);
		return contacts as { frontmatter: Properties; path: string }[];
	}

	private getContactProperties(filePath: string) {
		const cache = this.app.metadataCache.getCache(filePath);
		if (!cache) {
			throw new Error(`cache is falsy in ${filePath}`);
		}
		const frontmatter = cache.frontmatter;
		if (!frontmatter || !frontmatter[iCloudVCardPropertieName])
			return undefined;

		if (typeof frontmatter[iCloudVCardPropertieName] === "string")
			if (frontmatter[iCloudVCardPropertieName])
				frontmatter[iCloudVCardPropertieName] = JSON.parse(
					frontmatter[iCloudVCardPropertieName],
				);
		return frontmatter;
	}

	private async getCreateFolder(folderPath: string) {
		try {
			const folder = this.app.vault.getFolderByPath(folderPath);
			if (folder) return folder;
			return this.app.vault.createFolder(folderPath);
		} catch (error) {
			this.handleError(
				`Error trying to create the ${folderPath} folder`,
				error,
				{ folderPath },
			);
		}
	}

	private isSameSettings(
		a: ICloudContactsSettings,
		b: ICloudContactsSettings,
	) {
		return Object.entries(a)
			.filter(
				([key]) =>
					key !== "previousUpdateSettings" &&
					key !== "previousUpdateData",
			)
			.every(([key, value]) => {
				const other = b[key];

				// Handle array settings (like `groups`) by value, not reference
				if (Array.isArray(value) && Array.isArray(other)) {
					if (value.length !== other.length) return false;
					const sortedValue = [...value].sort();
					const sortedOther = [...other].sort();
					return sortedValue.every((v, i) => v === sortedOther[i]);
				}

				return value == other;
			});
	}

	private async createErrorFile() {
		const filePath = this.settings.folder + "/" + `${errorsFileName}.md`;
		const file = this.app.vault.getFileByPath(filePath);
		if (file) return file;
		return await this.app.vault.create(filePath, "");
	}

	private buildGroupMap(allVCards: ICloudVCard[]): Map<string, string[]> {
		const map = new Map<string, string[]>();
		for (const vCard of allVCards) {
			if (!this.isGroupCard(vCard)) continue;
			const jCard = parseVCardToJCard(vCard.data);
			const groupName = jCard.find((c) => c.key === "fn")?.value as
				| string
				| undefined;
			if (!groupName) continue;
			for (const card of jCard) {
				if (card.key !== "xAddressbookserverMember") continue;
				const uid = (card.value as string).replace("urn:uuid:", "");
				const existing = map.get(uid);
				if (existing) existing.push(groupName);
				else map.set(uid, [groupName]);
			}
		}
		return map;
	}

	private getGroupNamesForVCard(vCardData: string): string[] | undefined {
		const match = vCardData.match(/^UID:(.+)$/m);
		if (!match) return undefined;
		const uid = match[1].trim();
		return this.groupMap.get(uid);
	}

	private async applyReciprocalEdges() {
		const contacts = await this.getAllCurrentContacts(this.settings.folder);

		const nameToPath = new Map<string, string>();
		for (const contact of contacts) {
			const name = contact.frontmatter.name as string | undefined;
			if (name) nameToPath.set(name, contact.path);
		}

		const RECIPROCAL: Record<string, string> = {
			child: "parent",
			spouse: "spouse",
			sibling: "sibling",
		};

		for (const contact of contacts) {
			const sourceName = contact.frontmatter.name as string | undefined;
			if (!sourceName) continue;
			const sourceLink = `[[${sanitizeFilename(sourceName)}]]`;

			for (const [key, reciprocalKey] of Object.entries(RECIPROCAL)) {
				const links = this.toStringArray(contact.frontmatter[key]);
				for (const link of links) {
					const targetName = this.extractWikilinkTarget(link);
					const targetPath = nameToPath.get(targetName);
					if (!targetPath) continue;
					await this.addReciprocalEdge(
						targetPath,
						reciprocalKey,
						sourceLink,
					);
				}
			}
		}
	}

	private async addReciprocalEdge(
		filePath: string,
		key: string,
		value: string,
	) {
		const file = this.app.vault.getFileByPath(filePath);
		if (!file) return;
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			const existing = fm[key];
			if (Array.isArray(existing)) {
				if (!existing.includes(value)) existing.push(value);
			} else if (existing) {
				if (existing !== value) fm[key] = [existing, value];
			} else {
				fm[key] = [value];
			}
		});
	}

	private extractWikilinkTarget(link: string): string {
		const match = link.match(/^\[\[([^|\]]+)/);
		return match ? match[1].trim() : link;
	}

	private toStringArray(value: unknown): string[] {
		if (!value) return [];
		if (Array.isArray(value))
			return value.filter((v) => typeof v === "string") as string[];
		if (typeof value === "string") return [value];
		return [];
	}

	private async handleError(heading: string, error: unknown, data?: any) {
		let errorText = `## ${heading}
### Error message

${error instanceof Error ? error.message : String(error)}
`;
		if (data)
			errorText += `### Data

\`\`\`json
${JSON.stringify(data)}
\`\`\`
`;

		const errorFile = await this.createErrorFile();
		if (errorFile) {
			await this.app.vault.append(errorFile, errorText);
			await this.app.workspace.getLeaf().openFile(errorFile);
		}
	}
}
