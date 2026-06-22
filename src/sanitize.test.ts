import { describe, expect, test } from "@jest/globals";
import { sanitizeFilename } from "./sanitize";

describe("sanitizeFilename", () => {
	test("normalizes to NFC", () => {
		// NFD: 'ü' (u + combining umlaut) → NFC: 'ü'
		expect(sanitizeFilename("Müller")).toBe("Müller");
		expect(sanitizeFilename("Müller")).toBe("Müller");
	});

	test("keeps spaces and umlauts", () => {
		expect(sanitizeFilename("Franz Müller")).toBe("Franz Müller");
		expect(sanitizeFilename("Ärger Östreich")).toBe("Ärger Östreich");
	});

	test("replaces unsafe filesystem characters with -", () => {
		expect(sanitizeFilename("Foo/Bar")).toBe("Foo-Bar");
		expect(sanitizeFilename("A\\B")).toBe("A-B");
		expect(sanitizeFilename("A:B")).toBe("A-B");
		expect(sanitizeFilename("A*B")).toBe("A-B");
		expect(sanitizeFilename("A?B")).toBe("A-B");
		expect(sanitizeFilename('A"B')).toBe("A-B");
		expect(sanitizeFilename("A<B")).toBe("A-B");
		expect(sanitizeFilename("A>B")).toBe("A-B");
		expect(sanitizeFilename("A|B")).toBe("A-B");
		expect(sanitizeFilename("A#B")).toBe("A-B");
	});

	test("collapses consecutive dashes", () => {
		expect(sanitizeFilename("A//B")).toBe("A-B");
		expect(sanitizeFilename("A/?B")).toBe("A-B");
	});

	test("trims leading/trailing whitespace and dashes", () => {
		expect(sanitizeFilename("  Franz  ")).toBe("Franz");
		expect(sanitizeFilename("-Franz-")).toBe("Franz");
	});

	test("removes trailing dots", () => {
		expect(sanitizeFilename("Franz...")).toBe("Franz");
	});

	test("leaves normal names unchanged", () => {
		expect(sanitizeFilename("Anna-Maria Berger")).toBe("Anna-Maria Berger");
	});
});
