# OpenBible.info cross-reference dataset (vendored)

Generator input for `tools/gen-scripture-web.mjs` → `src/data/scripture-web-data.js`.
Not shipped as-is; only the derived asset reaches the app.

| Field | Value |
|---|---|
| File | `cross_references.txt` |
| Source | <https://www.openbible.info/labs/cross-references/> |
| Download URL | <https://a.openbible.info/data/cross-references.zip> |
| Retrieved | 2026-08-10 (the file's own header line carries this date) |
| Rows | 344,799 data rows + 1 header |
| Bytes | 8,301,974 |
| sha256 | `9055f13fdf8cb8067c49995dd19b27e8c1f91f71f713f6f0e19d92cfbe443fcc` |
| **License** | **CC-BY 4.0 — attribution REQUIRED** |

## Format

Tab-separated, one header row:

```
From Verse	To Verse	Votes	#www.openbible.info CC-BY 2026-08-10
Gen.1.1	Jer.32.17	90
Gen.1.1	Isa.44.24	97
```

- `From Verse` / `To Verse` — `Book.Chapter.Verse` using the dataset's own 66-book
  abbreviations (`Gen`, `1Cor`, `Song`, `Matt`, …). `To Verse` may be a range
  (`Gen.1.1-Gen.1.3`); the generator resolves a range to its **start** verse.
- `Votes` — community relevance weight, **−86 … 1287**, median 3. Negative votes
  are real signal (community-downvoted references), not corruption, and are
  preserved through to the shipped asset.

The data draws primarily from public-domain sources, chiefly R.A. Torrey's
*Treasury of Scripture Knowledge*.

## Attribution obligation

CC-BY requires attribution wherever the data is displayed. In this app that is:

- `src/ui/screens/AboutScreen.jsx` — credits line
- The Scripture Web screen's own info surface

Do not remove either without replacing it with equivalent visible credit.

## Refresh

```sh
curl -L -o cross-references.zip https://a.openbible.info/data/cross-references.zip
unzip -o cross-references.zip
node tools/gen-scripture-web.mjs      # regenerates src/data/scripture-web-data.js
```

Then update the table above (rows / bytes / sha256 / date), bump `CORPUS_VERSION`
in `service-worker.js` (the generated asset lives in the stable corpus cache),
and re-run the gates — `node tools/validate-schemas.js --strict` and
`node tools/check-corpus-version.js`.
