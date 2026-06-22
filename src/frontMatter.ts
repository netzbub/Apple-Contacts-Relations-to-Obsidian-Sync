import { VCards } from "./VCards";
import { parseVCardToJCardAndFullName } from "./parser";
import { labelToCanonical } from "./relationshipMapping";
import { sanitizeFilename } from "./sanitize";

type Address = {
	label?: string;
	street?: string;
	city?: string;
	state?: string;
	postcode?: string;
	country?: string;
};

export function createFrontmatter(
	iCloudVCardData: string,
	settings: {
		telLabels: boolean;
		emailLabels: boolean;
		urlLabels: boolean;
		relatedLabels: boolean;
		addressLabels: boolean;
		excludedKeys: string;
	},
	groupNames?: string[],
) {
	const { jCard, fullName } = parseVCardToJCardAndFullName(iCloudVCardData);
	return createFrontmatterFromParsedVCard(
		jCard as VCards[],
		fullName,
		settings,
		groupNames,
	);
}

export function createFrontmatterFromParsedVCard(
	parsedVCards: VCards[],
	fullName: string,
	{
		telLabels,
		emailLabels,
		urlLabels,
		relatedLabels,
		addressLabels,
		excludedKeys,
	}: {
		telLabels: boolean;
		emailLabels: boolean;
		urlLabels: boolean;
		relatedLabels: boolean;
		addressLabels: boolean;
		excludedKeys: string;
	},
	groupNames?: string[],
) {
	const labels = parsedVCards.filter(({ key }) => key === "xAbLabel");
	const contact = parsedVCards.reduce(
		(o, { key, value, meta }) => {
			if (excludedKeys.split(/\s+/).indexOf(key) > -1) return o;
			if (key === "fn") return o;
			if (key === "org") return addOrganizationAndDepartement(value, o);

			const rawLabel = getLabel(meta, labels);
			const label = rawLabel ? capitalize(rawLabel) : undefined;
			if (key === "tel")
				return addValueToArray(
					"telephone",
					telLabels && label ? `${label}: ${value}` : value,
					o,
				);
			if (key === "email")
				return addValueToArray(
					"email",
					emailLabels && label ? `${label}: ${value}` : value,
					o,
				);
			if (key === "adr")
				return addAddresses(
					value,
					o,
					addressLabels ? label : undefined,
				);
			if (key === "url")
				return addValueToArray(
					"url",
					urlLabels && label ? `${label}: ${value}` : value,
					o,
				);
			if (key === "xAbrelatednames") {
				const canonicalKey = label ? labelToCanonical(label) : "related";
				const safeName = sanitizeFilename(value as string);
				return addValueToArray(canonicalKey, `[[${safeName}]]`, o);
			}
			if (key === "note") {
				const unescaped = unescapeVCard(value as string);
				const delimIdx = unescaped.indexOf("\n---\n");
				if (delimIdx !== -1) {
					const tagPart = unescaped.slice(0, delimIdx);
					const body = unescaped.slice(delimIdx + 5).trim();
					const tags = tagPart
						.split(/[\n,]/)
						.map((t) => t.trim())
						.filter(Boolean);
					const result: { [key: string]: string | string[] } = {
						...(o as any),
					};
					if (tags.length > 0) result.tags = tags;
					if (body) result.note = body;
					return result;
				}
				return { ...o, note: unescaped };
			}
			if (key === "impp")
				return addValueToArray(
					"instant message",
					`${meta.xServiceType}: ${value
						.replace("xmpp:", "")
						.replace("x-apple:", "")}`,
					o,
				);
			if (key === "xSocialprofile")
				return addValueToArray(
					"social profile",
					`${
						meta.type ? `${capitalize(meta.type)}: ` : ""
					}${stripSocialValue(value)}`,
					o,
				);
			if (key === "xAbdate")
				return addValueToArray(
					"date",
					label ? `${label}: ${value}` : value,
					o,
				);

			if (key === "bday") return { ...o, birthday: value };
			return { ...o, [key]: value };
		},
		{ name: fullName },
	);
	if (groupNames && groupNames.length > 0)
		(contact as any).groups = groupNames.map((g) => `[[${g}]]`);
	return contact as { [key: string]: string | string[] };
}

function stripSocialValue(value: string) {
	const toRemove = ["x-apple:", "xmpp:"];
	// romove all of the above from value
	return toRemove.reduce(
		(value, searchValue) => value.replace(searchValue, ""),
		value,
	);
}

function addAddresses(
	value: string[],
	o: { name: string; addresses?: Address[] },
	label?: string,
) {
	const address: Address = {};
	if (label) address.label = label;
	if (value[2]) address.street = value[2];
	if (value[3]) address.city = value[3];
	if (value[4]) address.state = value[4];
	if (value[5]) address.postcode = value[5];
	if (value[6]) address.country = value[6];
	if (Array.isArray(o.addresses))
		return { ...o, addresses: [...o.addresses, address] };
	return { ...o, addresses: [address] };
}

function unescapeVCard(value: string): string {
	return value
		.replace(/\\n/gi, "\n")
		.replace(/\\,/g, ",")
		.replace(/\\;/g, ";");
}

function addValueToArray(
	key: string,
	value: string[] | string,
	o: { [key: string]: string[] | string | undefined },
) {
	if (Array.isArray(o[key])) return { ...o, [key]: [...o[key]!, value] };

	return {
		...o,
		[key]: [value],
	};
}

function addOrganizationAndDepartement(
	value: string | string[],
	o: { [key: string]: string },
): {
	[key: string]: string | undefined;
	organization?: string;
	departement?: string;
} {
	const organization = (value as string[])[0];
	const departement = (value as string[])[1];
	let newO: any = o;
	if (organization) {
		newO = {
			...newO,
			organization,
		};
	}
	if (departement) {
		newO = {
			...newO,
			departement,
		};
	}
	return newO;
}

function getLabel(
	parsedVCardMeta: { [key: string]: string | string[] },
	parsedVCards: VCards[],
): string | undefined {
	if (
		!parsedVCardMeta.group &&
		!Array.isArray(parsedVCardMeta.type) &&
		!parsedVCardMeta.type
	) {
		return;
	}

	if (parsedVCardMeta.group) {
		const xAbLabel = parsedVCards.find(
			({ key, meta }) =>
				key === "xAbLabel" && meta.group === parsedVCardMeta.group,
		);
		if (xAbLabel) {
			const value = xAbLabel.value as string;
			return value.replace("_$!<", "").replace(">!$_", "");
		}
	}

	const type = parsedVCardMeta.type;
	if (Array.isArray(type)) return type.find(isLabel);
	if (!isLabel(type)) return;
	return type;
}

function isLabel(label: string) {
	return ["cell", "voice", "pref", "internet"].indexOf(label) === -1;
}

function capitalize(str: string) {
	if (str === "iphone") return "iPhone";
	return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}
