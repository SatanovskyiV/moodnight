/**
 * Turning a Ukrainian title into something that can live in a URL.
 *
 * Three models need this — a poem, an author and a tag each address themselves
 * by slug — so it lives here rather than in the API: the studio's editor will
 * want to show an author the slug their title is about to get, and a preview
 * that disagreed with what the server stored would be worse than no preview.
 * One function, called on both sides.
 */

/**
 * The Cyrillic → Latin table from the Cabinet of Ministers' 2010 resolution
 * (No. 55), which is the transliteration Ukrainian passports and road signs
 * use. Picking the official one rather than inventing a table matters because
 * these strings end up in shared links: `тінь-над-полем` becoming
 * `tin-nad-polem` is a URL somebody can read aloud over the phone.
 *
 * Four letters transliterate differently at the start of a word — є, ї, й, ю, я
 * take a leading `y` there and an `i` elsewhere (Єлизавета → Yelyzaveta, but
 * Заєць → Zaiets). {@link WORD_INITIAL} carries those forms and
 * {@link transliterate} decides which table a character is read from.
 *
 * ь and the apostrophe map to nothing at all, which is why they are present
 * with empty values rather than absent: an absent key falls through to the
 * "drop anything unrecognised" branch, and the difference between the two is
 * invisible here but not in the test that pins it.
 */
const CYRILLIC: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "h",
  ґ: "g",
  д: "d",
  е: "e",
  є: "ie",
  ж: "zh",
  з: "z",
  и: "y",
  і: "i",
  ї: "i",
  й: "i",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ь: "",
  ю: "iu",
  я: "ia",
  "'": "",
  "’": "",
  ʼ: "",
};

/** The five letters whose transliteration depends on standing first in a word. */
const WORD_INITIAL: Record<string, string> = {
  є: "ye",
  ї: "yi",
  й: "y",
  ю: "yu",
  я: "ya",
};

/**
 * One digraph the resolution spells out as an exception: зг is `zgh`, not the
 * `zh` that з followed by г would otherwise produce, so that Згорани comes out
 * Zghorany and stays distinguishable from a ж.
 */
const ZGH = "zgh";

/**
 * Whether a character is *inside* a word rather than a boundary before one —
 * which is what the initial-form rule above actually turns on.
 *
 * Letters, obviously. And the apostrophe, which is the part worth stating: in
 * Ukrainian orthography it separates a consonant from a following iotated vowel
 * *within* a word, so п'ять is one word and its я is medial — `piat`, not
 * `pyat`. Reading the apostrophe as a boundary is the plausible mistake here,
 * and it silently mistransliterates a very common spelling.
 *
 * A hyphen deliberately is not included: ніч-яв is two words joined, and the
 * standard gives the second one its initial form.
 */
function isWordInternal(character: string): boolean {
  return /[\p{L}'’ʼ]/u.test(character);
}

/**
 * Restores the case the source had. Only the first letter of a multi-character
 * mapping is capitalised: Щ becomes Shch, never SHCH.
 */
function matchCase(source: string, mapped: string): string {
  return source === source.toLowerCase()
    ? mapped
    : mapped.charAt(0).toUpperCase() + mapped.slice(1);
}

/**
 * Latinises Ukrainian text, leaving anything already Latin alone.
 *
 * Exported on its own because it is the half worth testing directly, and
 * because a display context may want the transliteration without the
 * lowercasing and hyphenation {@link slugify} adds on top.
 */
export function transliterate(input: string): string {
  let out = "";

  // `charAt` rather than indexing, throughout: it answers `""` past the end of
  // the string where `[]` answers `undefined`, and every use here — the
  // lookahead, the previous character — wants "not a letter" rather than a
  // narrowing branch.
  for (let index = 0; index < input.length; index += 1) {
    const character = input.charAt(index);
    const lower = character.toLowerCase();
    const previous = input.charAt(index - 1);
    // A word begins at the start of the string and after any boundary — so the
    // я in "моя" is medial, the one in "я йшла" is not, and the one in "п'ять"
    // is medial because an apostrophe does not end a word.
    const initial = !isWordInternal(previous);

    // Checked before the single-character tables, and consuming both letters,
    // so the г is not transliterated a second time on the next turn.
    if (lower === "з" && input.charAt(index + 1).toLowerCase() === "г") {
      out += matchCase(character, ZGH);
      index += 1;
      continue;
    }

    const mapped = initial ? (WORD_INITIAL[lower] ?? CYRILLIC[lower]) : CYRILLIC[lower];

    // Not Cyrillic — a Latin letter, a digit, a space, a dash. Passed through
    // for `slugify` to deal with rather than dropped here, so `transliterate`
    // on its own stays a faithful rendering of the input.
    out += mapped === undefined ? character : matchCase(character, mapped);
  }

  return out;
}

/**
 * A URL-safe slug: transliterated, lowercased, and reduced to letters, digits
 * and single hyphens.
 *
 * The result is *not* guaranteed unique — two poems may honestly share a title,
 * and two authors a pen name. Uniqueness is the database's job (the `slug`
 * columns carry unique indexes) and disambiguating a collision is the caller's;
 * this function's contract is only that the same input gives the same output.
 *
 * `maxLength` exists because a slug becomes a URL and a URL ends up in an email,
 * a Telegram preview and an OG tag. It cuts on a hyphen boundary rather than
 * mid-word, so a truncated slug is still made of whole words.
 */
export function slugify(input: string, maxLength = 80): string {
  const slug = transliterate(input)
    .normalize("NFKD")
    // Strip combining marks left by the decomposition, so an é that arrived
    // from a borrowed name becomes `e` rather than being dropped entirely.
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (slug.length <= maxLength) {
    return slug;
  }

  const cut = slug.slice(0, maxLength);
  const lastHyphen = cut.lastIndexOf("-");

  // A single word longer than the limit has no hyphen to cut on; taking the
  // hard slice is better than returning nothing.
  return lastHyphen > 0 ? cut.slice(0, lastHyphen) : cut;
}

/**
 * The initials shown in the avatar on a poem card — up to two letters, taken
 * from the first two words of a pen name.
 *
 * Cyrillic, not transliterated: the avatar is read by a Ukrainian reader and
 * "ОВ" is who Орися Вечірня is. This is the one derived string on an author
 * that stays in the source alphabet.
 */
export function initialsOf(penName: string): string {
  return penName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}
