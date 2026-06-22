import locales from "./relationship_locales.json";

const sourceMap = locales.label_map_source_to_canonical as Record<string, string>;
const extendedMap = locales.extended_label_map as Record<string, string>;

export function labelToCanonical(rawLabel: string): string {
	const lower = rawLabel.toLowerCase();
	return sourceMap[lower] ?? sourceMap[rawLabel] ?? "related";
}

export function labelToExtended(rawLabel: string): string | undefined {
	return extendedMap[rawLabel] ?? extendedMap[rawLabel.toLowerCase()];
}

export function getDisplayName(canonicalKey: string, lang = "en"): string {
	const entry = (locales.locales as Record<string, Record<string, string>>)[canonicalKey];
	if (!entry) return canonicalKey;
	return entry[lang] ?? entry["en"] ?? canonicalKey;
}

export function getCanonicalKeys(): string[] {
	return locales.canonical_keys;
}

export function getExtendedCanonicalKeys(): string[] {
	return locales.extended_canonical_keys;
}
