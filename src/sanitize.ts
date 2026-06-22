// Removes only filesystem/WebDAV-unsafe characters; keeps spaces and umlauts.
// Normalizes to NFC (avoids macOS NFD ↔ Nextcloud/WebDAV mismatches).
export function sanitizeFilename(name: string): string {
	return name
		.normalize("NFC")
		.replace(/[/\\:*?"<>|#]/g, "-")
		.replace(/-{2,}/g, "-")
		.replace(/^[\s-]+|[\s-]+$/g, "")
		.replace(/\.+$/, "");
}
