# textum

<p align="center">
  <img src="https://img.shields.io/badge/dynamic/json?label=manifest&query=%24.version&url=https%3A%2F%2Fraw.githubusercontent.com%2Fnetzbub%2Ftextum%2Fmain%2Fmanifest.json&color=blue" alt="manifest version">
  <img src="https://img.shields.io/github/release-date/netzbub/textum?color=olive" alt="release date">
  <img src="https://img.shields.io/github/license/netzbub/textum" alt="license">
  <img src="https://img.shields.io/github/downloads/netzbub/textum/total?color=blueviolet" alt="downloads">
  <img src="https://img.shields.io/github/issues/netzbub/textum?color=yellow" alt="open issues">
</p>

*Weave your Apple / iCloud Contacts — and the relationships between them — into Obsidian
as clean, queryable Markdown.*

> **The name.** *textum* (Latin) — a woven fabric; also: a text. The plugin weaves your
> contacts and the relationships already in your address book into one connected, textual
> graph inside Obsidian.

Sync macOS / iCloud Contacts into Obsidian as clean, well-structured Markdown notes —
and turn the **relationships** that already live in your address book (family, project
teams, company membership) into data you can query, chart and visualise inside Obsidian.

<p align="center">
<img src="images/Beatles.jpg" width="700" alt="...">  
</p>

## Table of contents
<!-- TOC -->

- [textum](#textum)
    - [Table of contents](#table-of-contents)
    - [Purpose](#purpose)
    - [What this fork adds vs. Truls Aagaard's original](#what-this-fork-adds-vs-truls-aagaards-original)
    - [Complete list of fields and how to use them](#complete-list-of-fields-and-how-to-use-them)
    - [Prerequisites](#prerequisites)
    - [Installation](#installation)
    - [Configuration plugin settings](#configuration-plugin-settings)
    - [Directory structure](#directory-structure)
    - [Usage](#usage)
        - [A Prepare the data in Apple Contacts](#a-prepare-the-data-in-apple-contacts)
        - [B Sync into Obsidian](#b-sync-into-obsidian)
        - [C Analyse / visualise in Obsidian](#c-analyse--visualise-in-obsidian)
    - [Localisation](#localisation)
        - [A note on languages with richer kinship systems](#a-note-on-languages-with-richer-kinship-systems)
    - [License](#license)
    - [Acknowledgments](#acknowledgments)

<!-- /TOC -->
---

## Purpose

`Apple Contacts.app` is an excellent place to *store* contact data but a poor place to
*analyse* it. Years — sometimes a decade — of carefully maintained names, addresses,
dates, photos, group memberships and **related names** sit in a flat store with no query
language, no joins, no graph.

This extension extracts that data into one Markdown note per contact with a clean YAML
frontmatter, so it can be used and cross-analysed in Obsidian with extensions like
**Relations**, **Breadcrumbs**, **Bases**, **Dataview**, **Charted Roots** and others.

Typical uses:

- **Project teams** — link every contact assigned to a building project, see all
  participants of ***"Project renovation city hall"***, filter by trade ( carpenter, bricklayer, etc.).
  Examples: who is on which project, which trades are covered, who rated "recommended".
- **Family / genealogy** — render family trees and pedigrees from the *related names*
  you already maintain (Mother, Father, Uncle, Grandfather …).
- **Company / org membership** — who belongs to which firm or department.
- **Map** — plot contact addresses on a map (requires a geocoding step, see *Usage*).

---

<p align="center">
<img src="images/contacts-example.jpg" width="550" alt="...">  
</p>

## What this fork adds (vs. Truls Aagaard's original)

The original syncs contacts faithfully but flattens several things that this fork now
makes **structured and analysable**. Status per item (all implemented):

| # | Improvement | Why it matters ("leverage") | Status |
|---|---|---|---|
| 1 | **Write group membership** as a `groups:` property per contact | The original already *fetches* iCloud group cards (CardDAV `X-ADDRESSBOOKSERVER-KIND:group`) but only uses them to *filter* which contacts to sync. Writing membership exposes your entire ~X00-group taxonomy as a queryable property. | done |
| 2 | **Split the address** into `street` / `city` / `postcode` / `country` | The original joins `ADR` into one string. Split fields enable map/geocoding and clean queries. | done |
| 3 | **Un-escape notes** (`\n`, `\,` → real newline/comma) | The original leaks vCard escaping into the note text. | done |
| 4 | **Typed relationship keys** (`parent`, `spouse`, `child`, `sibling`, …) | The original puts all related names into one `related names` list. Splitting into typed keys is what lets Obsidian extensions like **Relations** / **Breadcrumbs** draw family trees and project hierarchies. Reciprocal `parent` / `spouse` / `sibling` edges are auto-completed on a full sync, so one-sided entries still produce a complete tree. | done |
| 5 | **Localisation layer** (`relationship_locales.json`) | English canonical relationship keys + per-language label maps, so the tool works for non-German/English address books. | done |
| 6 | **Filesystem-safe filenames + name-based linking** | Sanitises only the characters that are unsafe on file systems / WebDAV (slash, colon, asterisk, quote, angle brackets, pipe, hash, leading/trailing whitespace, trailing dots), keeps spaces and umlauts, and normalises to Unicode NFC (avoids macOS ↔ Nextcloud mismatches). Relationships resolve against the `name` frontmatter / alias, not the raw filename — so sanitising a name never breaks a link. | done |

"Leverage" = biggest benefit per unit of effort. #1 and #4 unlock the most (groups +
genealogy visualisation); #2 enables maps; #3 fixes readability.

---

## Complete list of fields and how to use them

Mapping from Apple Contacts field → recommended use → Obsidian frontmatter key.
**Rule of thumb:** *Person ↔ person → Related name. Categories → Groups. Role → Job title.
Free text → Notes (with the `---` convention below).*

| Apple field | vCard | Recommended use | Frontmatter key | Multi |
|---|---|---|---|---|
| First/Last/  Prefix/Suffix | N / FN | Name, note title | `name` / file name | – |
| Nickname | NICKNAME | Nickname | `nickname` | – |
| Company | ORG | Organisation | `organization` | – |
| Department | – | Sub-grouping | `department` | – |
| **Job title** | TITLE | **Role / trade (Gewerk) of a person** | `role` | – |
| Phone | TEL | Contact | `telephone` | yes |
| Email | EMAIL | Contact | `email` | yes |
| Homepage | URL | Web | `url` | yes |
| **Address** | ADR | **Location → map (after geocoding)** | `street`/`city`/`postcode`/`country` | yes |
| Birthday | BDAY | Life dates | `birthday` | – |
| Date (custom) | X-ABDATE + label | **Death date**, anniversary, events | `death` / `date` | yes |
| **Related name** | X-ABRELATEDNAMES + label | **Genealogy + person relations** | `parent`/`spouse`/`child`/`sibling`/… | yes |
| Social profile | X-SOCIALPROFILE | Social | `social profile` | yes |
| Instant message | IMPP | Messaging | `instant message` | yes |
| **Notes** | NOTE | **Tag block + prose** (see below) | `tags` + body | – |
| **Groups** | group card | **Project / trade / rating / district / selection** | `groups` | yes |

---

## Prerequisites

- macOS (tested on macOS 15.7.5)
- macOS Contacts (tested on v14.0)
- Obsidian (tested on v1.12.7)
- An iCloud **app-specific password** (or a Nextcloud address-book share URL)

---

## Installation

Not yet in the community store. Two ways to install:

### Option A — BRAT (recommended)

1. Install **BRAT** (Settings → Community plugins → Browse → "BRAT").
2. BRAT → **Add beta plugin** → paste: `netzbub/textum`
3. Confirm. BRAT installs **textum** from the latest release and keeps it updated.
4. Enable **textum** under *Settings → Community plugins*.

### Option B — manual

1. Build: `npm install` then `npm run build` → produces `main.js`.
2. Copy `main.js` and `manifest.json` into
   `<your-vault>/.obsidian/plugins/textum/`.
3. Enable the plugin under *Settings → Community plugins*.

(For development: `npm run dev` for a watching build; `npm test` runs the Jest suite.)

---

## Configuration (plugin settings)

- **iCloud username** — your iCloud email.
- **iCloud app-specific password** — generate at
  [support.apple.com/102654](https://support.apple.com/en-us/102654).
- **iCloud server URL** — default `https://contacts.icloud.com`
  (China: `https://contacts.icloud.com.cn`; Nextcloud: the address-book share URL).
- **Contacts folder** — vault folder for the notes (default `Contacts`).
- **Labels toggles** — add labels to phone / email / url / related names / addresses.
- **Excluded keys** — space-delimited keys not written to frontmatter (raw data stays in
  `iCloudVCard`).
- **Groups** — select which iCloud groups to sync.

---

## Directory structure

```
.
├── main.ts                  # plugin entry, commands, Obsidian API wrapper
├── manifest.json            # Obsidian plugin manifest
├── src/
│   ├── ICloudContactsApi.ts # core sync orchestration
│   ├── iCloudClient.ts      # CardDAV client (adapted from tsdav)
│   ├── parser.ts            # vCard → jCard parsing, full-name logic
│   ├── frontMatter.ts       # jCard → YAML frontmatter (the mapping core)
│   ├── SettingTab.ts        # settings UI incl. group discovery
│   ├── VCards.d.ts          # types
│   └── *.test.ts            # Jest tests
├── esbuild.config.mjs       # build
├── package.json / tsconfig.json / jest.config.js / .eslintrc
├── version-bump.mjs / versions.json
└── LICENSE.TXT              # AGPL-3.0
```

---

## Usage

### A) Prepare the data in Apple Contacts

This is where the value is created.  
Conventions:

- **Person ↔ person relationships** (genealogy): use **Related name** with labels
  (Mother, Father, Brother, Sister, Son, Daughter, Spouse, and custom labels such as
  Uncle, Grandfather, Stepfather). The value (=**first name & family name**) must **exactly match** the other contact's display name — resolution is by name.  
  As soon as the localisation is finished, it will be possible to use the localized expressions in the Contacts.app for the following languages:  
  **Ready:** English · German  
  **Planned:** French · Spanish · Italian · Portuguese · Dutch · Danish · Norwegian · Swedish · Finnish · Russian · Ukrainian · Polish · Turkish · Japanese · Chinese (Mandarin) · Korean · Hindi · Arabic
- **Categories** (project, trade/Gewerk, rating, district, selection): use **Groups**.
- **Role / trade of a person**: use the **Job title** field.
- **Free text + structured tags in Notes** — use a delimiter convention so the note stays
  parseable:

  ```
  Doctors, ENT
  ---
  Opening hours Mon–Thu 8–17:00, Fri 8–12:00
  ```

  Everything **above** the `---` line is treated as comma- or line-separated **tags**
  (here → `Doctors`, `ENT`); everything **below** stays as free note body. Pick one style
  (comma *or* one entry per line) and keep it consistent.

> Apple Contacts cannot create arbitrary new field types — only custom *labels* on
> existing types. That is why categorical data goes into Groups, not invented fields.

### B) Sync into Obsidian

Run the command **"Update Contacts"** (only changed contacts) or **"Update all
Contacts"** (rewrites everything — use after changing settings/excluded keys). Reciprocal
relationship edges are completed during a full **"Update all Contacts"** run.

The plugin only manages a fixed set of keys plus the title and the top H1. **Anything
else you write in a note — and any extra frontmatter keys you add yourself (e.g.
`rating:`, `lat:`, `lng:`) — is preserved across syncs.** Sync is one-way (iCloud →
Obsidian) by design: edits or corruption in Obsidian can never flow back to your address
book.

### C) Analyse / visualise in Obsidian

| Purpose | Extension | Output |
|---|---|---|
| Family trees, pedigrees, relationship graphs | **Relations** (`parent`/`spouse` + ` ```relations / family-graph: true ``` `) | family graph |
| Hierarchy navigation, project/org trees | **Breadcrumbs** (typed links) | tree / matrix / Mermaid / Markmap / Canvas |
| Tables, cards, **map** of contacts | **Bases** (core) | table / card / map view |
| Ad-hoc queries (e.g. birthdays today, phone list of linked contacts) | **Dataview** | tables / lists |
| GEDCOM round-trip, Ahnentafel / kinship reports | **Charted Roots** | classic genealogy charts |
| Canvas-based family/migration views | **Canvas Roots** | canvas + Leaflet maps |
| Address pins (after geocoding) | **Map View** / Leaflet | interactive map |

Example — Dataview list of contacts linked in the current note:

````markdown
```dataview
TABLE email, telephone
FROM outgoing([[#]])
WHERE iCloudVCard
```
````

**Map:** addresses need geocoding (address string → `lat`/`lng`) before plotting — a
one-time batch step (Nominatim/OSM with rate limits, or a paid geocoder) that writes
coordinates into the notes. Then Bases map view or Map View renders them.

---

## Localisation

Relationship type names are **English canonical** (`parent`, `spouse`, `uncle`,
`grandfather`, …). Apple's standard relationship labels are already stored as English
tokens internally (`_$!<Mother>!$_`), so only **custom labels** (in the user's language)
need a per-language map in `relationship_locales.json`
(`label_map_source_to_canonical`).

Adding a language = adding ~20–40 kinship terms → canonical keys. Mechanically cheap.
Linguistically, languages with finer kinship systems (Chinese, Japanese, Arabic, Hindi)
distinguish e.g. paternal vs. maternal uncle; map several source terms onto one canonical
key (lossy) or extend the canonical keys (`uncle_paternal`, `uncle_maternal`).

Widely spoken languages worth supporting: English, Mandarin Chinese, Hindi, Spanish,
French, Arabic, Portuguese, Russian, Japanese, plus Italian, Korean, Turkish, Dutch,
Polish.

### A note on languages with richer kinship systems

Several of the planned languages — **Chinese, Japanese, Korean, Arabic and Hindi** — encode
kinship distinctions that English and German simply collapse. Where English has a single
word *uncle*, these languages mark the **father's vs. the mother's side**, and often the
**relative age** of the linked relative: Mandarin separates 伯 (father's elder brother),
叔 (father's younger brother) and 舅 (mother's brother); Arabic distinguishes عم (paternal
uncle) from خال (maternal uncle); Hindi has चाचा / ताऊ versus मामा. Siblings are split by
seniority in Chinese, Japanese and Korean (e.g. 哥 *elder* vs. 弟 *younger* brother; 兄 vs.
弟), and Korean terms additionally depend on the **speaker's own gender** (a male says 형
for an older brother, a female says 오빠).

Because these distinctions have no one-to-one equivalent among the English canonical keys,
the localisation resolves them in one of two ways, configurable per language:

- **Collapse (default).** Every source term is mapped to the nearest canonical key — 伯, 叔
  and 舅 all become `uncle`. This keeps relationship graphs consistent and comparable
  across languages. The nuance is **not lost silently**: the original label is preserved on
  the link (as its display alias / `relation_label`), so it stays visible in the note even
  though the structural key is generic.
- **Extended keys (opt-in).** Finer canonical keys such as `uncle_paternal` /
  `uncle_maternal` or `brother_elder` / `brother_younger` can be enabled, preserving the
  distinction as structured data. Note that the family-tree visualisers (Relations,
  Breadcrumbs) build their layout only from the structural core (`parent`, `spouse`,
  `child`); extended kinship keys therefore act as descriptive metadata and do not change
  the shape of the tree.

The default is *collapse*, because it yields clean, comparable graphs and never discards
information (the original term is retained as a label). Speakers of these languages who
want full fidelity can switch on the extended keys for their locale.

---

## License

GNU Affero General Public License v3.0 (AGPL-3.0). See `LICENSE.TXT`.
(The upstream `package.json` declared `GPL-3.0` while its manifest/LICENSE stated
AGPL-3.0; this fork uses AGPL-3.0 consistently.)

---

## Acknowledgments

- Built on Truls Aagaard's
  [obsidian-icloud-contacts](https://github.com/trulsaa/obsidian-icloud-contacts).
  Not affiliated with or endorsed by Truls.
- The CardDAV client (`iCloudClient`) is adapted from
  [tsdav](https://github.com/natelindev/tsdav).
- Not affiliated with Apple in any way.
- Concept and structure was optimized by Claude, the code was mostly done by Claude Code.
