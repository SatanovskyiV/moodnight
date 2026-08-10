import { describe, expect, it } from "vitest";

import { slugPrefix, uniqueSlug } from "./unique-slug";

/**
 * Choosing an address nobody holds.
 *
 * What this does *not* claim is worth stating first: it does not make an insert
 * safe. Two requests can read the same set of taken slugs and both settle on
 * the same suffix, and only the unique index settles that — the caller catches
 * the violation and answers 409. What these cases pin down is the other half:
 * that the common cases never reach the index at all.
 */
describe("uniqueSlug", () => {
  it("uses the plain slug when nothing holds it", () => {
    expect(uniqueSlug("Тінь над полем", [])).toBe("tin-nad-polem");
  });

  // Starts at 2, because the unsuffixed slug is conceptually the first — the
  // second Іван Франко is `ivan-franko-2`, not `ivan-franko-1`.
  it("steps to -2 for the second holder", () => {
    expect(uniqueSlug("Іван Франко", ["ivan-franko"])).toBe("ivan-franko-2");
  });

  it("keeps stepping past a run of them", () => {
    expect(uniqueSlug("Іван Франко", ["ivan-franko", "ivan-franko-2", "ivan-franko-3"])).toBe(
      "ivan-franko-4",
    );
  });

  /**
   * The caller fetches by prefix, so the list it passes contains near misses as
   * well as exact ones. A slug is only taken if something holds it *exactly* —
   * treating `ivan-frankovych` as a collision would push every Франко one place
   * further along for no reason.
   */
  it("ignores neighbours that merely share the prefix", () => {
    expect(uniqueSlug("Іван Франко", ["ivan-frankovych", "ivan-franko-ii"])).toBe("ivan-franko");
  });

  // A gap left by a deleted account is reusable: the search is for the first
  // free suffix, not the highest one ever issued.
  it("fills a gap rather than counting past it", () => {
    expect(uniqueSlug("Іван Франко", ["ivan-franko", "ivan-franko-3"])).toBe("ivan-franko-2");
  });

  /**
   * A pen name of only punctuation transliterates to nothing, and a row still
   * needs an address. Collapsing every such row onto one empty key would make
   * the unique index reject all but the first, so they fall back to a name and
   * then suffix like anything else.
   */
  it("falls back to a readable name when nothing transliterates", () => {
    expect(uniqueSlug("«»—", [])).toBe("author");
    expect(uniqueSlug("...", ["author"])).toBe("author-2");
  });
});

describe("slugPrefix", () => {
  /**
   * The two steps have to agree or the whole thing is theatre: fetching the
   * rows that begin with one string and then suffixing a *different* one would
   * look correct and hand back a slug somebody already holds. Exported for
   * exactly this reason, and asserted here so the pairing cannot quietly break.
   */
  it("is the base uniqueSlug suffixes, for every input", () => {
    for (const source of ["Тінь над полем", "Іван Франко", "«»—", "Ніч"]) {
      expect(uniqueSlug(source, []).startsWith(slugPrefix(source))).toBe(true);
    }
  });

  it("shares the fallback", () => {
    expect(slugPrefix("«»—")).toBe("author");
  });
});
