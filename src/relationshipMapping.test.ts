import { describe, expect, test } from "@jest/globals";
import { labelToCanonical } from "./relationshipMapping";

describe("labelToCanonical", () => {
	test.each([
		["Mother", "parent"],
		["Father", "parent"],
		["Parent", "parent"],
		["Child", "child"],
		["Son", "child"],
		["Daughter", "child"],
		["Brother", "sibling"],
		["Sister", "sibling"],
		["Spouse", "spouse"],
		["Partner", "spouse"],
		["Husband", "spouse"],
		["Wife", "spouse"],
		["Friend", "friend"],
		["Assistant", "assistant"],
		["Manager", "manager"],
	])("Apple token %s → %s", (label, expected) => {
		expect(labelToCanonical(label)).toBe(expected);
	});

	test.each([
		["Onkel", "uncle"],
		["Tante", "aunt"],
		["Neffe", "nephew"],
		["Nichte", "niece"],
		["Großvater", "grandfather"],
		["Großmutter", "grandmother"],
		["Stiefvater", "stepfather"],
		["Stiefmutter", "stepmother"],
		["Großtante", "greataunt"],
		["Großonkel", "greatuncle"],
		["Schwager", "brotherinlaw"],
		["Schwägerin", "sisterinlaw"],
		["Cousin", "cousin"],
		["Cousine", "cousin"],
		["Enkel", "grandchild"],
		["Enkelin", "grandchild"],
		["Schwiegervater", "fatherinlaw"],
		["Schwiegermutter", "motherinlaw"],
		["Schwiegersohn", "soninlaw"],
		["Schwiegertochter", "daughterinlaw"],
		["Pate", "godfather"],
		["Patin", "godmother"],
		["Patenkind", "godchild"],
		["Freund", "friend"],
		["Freundin", "friend"],
	])("deutsches Label %s → %s", (label, expected) => {
		expect(labelToCanonical(label)).toBe(expected);
	});

	test("unbekanntes Label → 'related'", () => {
		expect(labelToCanonical("Götti")).toBe("related");
		expect(labelToCanonical("Kummerkasten")).toBe("related");
		expect(labelToCanonical("")).toBe("related");
	});
});
