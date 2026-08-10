import { initialsOf, slugify, transliterate } from "@moodnight/shared";
import { describe, expect, it } from "vitest";

/**
 * The Ukrainian transliteration, which lives in @moodnight/shared because three
 * models and the studio's slug preview all need the same answer.
 *
 * It is tested from *here* for the same reason `list-query.spec.ts` tests
 * `defineList`: this app owns the only Vitest in the workspace, and adding a
 * second runner to a package of pure functions would cost a toolchain to
 * maintain and buy nothing. What it does mean is that these run against
 * `packages/shared/dist` rather than its source — the artifact the API actually
 * imports — which turbo guarantees is current by making `test` depend on
 * `^build`.
 *
 * This is the one piece of the project encoding an *external* standard rather
 * than a decision of ours: the Cabinet of Ministers' 2010 table, the same one
 * Ukrainian passports use. That is why the cases below are literals rather than
 * derived — a test that reproduced the mapping in order to check it would agree
 * with any table, including a wrong one. Every expected value here can be
 * checked against the published standard by eye.
 */
describe("transliterate", () => {
  it("maps the plain letters", () => {
    expect(transliterate("вітер")).toBe("viter");
    expect(transliterate("пісня")).toBe("pisnia");
  });

  // The four multi-letter mappings are where a hand-rolled table usually goes
  // wrong, щ most of all: four Latin characters for one Cyrillic.
  it("maps the digraph letters", () => {
    expect(transliterate("хата")).toBe("khata");
    expect(transliterate("цукор")).toBe("tsukor");
    expect(transliterate("чорний")).toBe("chornyi");
    expect(transliterate("шепіт")).toBe("shepit");
    expect(transliterate("щастя")).toBe("shchastia");
  });

  /**
   * The rule that makes this the official table rather than an approximation:
   * є, ї, й, ю and я take a leading `y` at the start of a word and an `i`
   * inside one. Both forms of the same letter, in one assertion each, so a
   * regression cannot pass by getting the commoner half right.
   */
  it("distinguishes the word-initial forms", () => {
    expect(transliterate("Єлизавета")).toBe("Yelyzaveta");
    expect(transliterate("Заєць")).toBe("Zaiets");

    expect(transliterate("їжак")).toBe("yizhak");
    expect(transliterate("Україна")).toBe("Ukraina");

    expect(transliterate("яблуко")).toBe("yabluko");
    expect(transliterate("моя")).toBe("moia");

    expect(transliterate("юність")).toBe("yunist");
    expect(transliterate("лють")).toBe("liut");
  });

  // A word boundary is "after anything that is not a letter", so the second
  // half of a hyphenated name gets the initial form too.
  it("starts a new word after punctuation and spaces", () => {
    expect(transliterate("ніч-яв")).toBe("nich-yav");
    expect(transliterate("моя яблуня")).toBe("moia yablunia");
  });

  // зг is `zgh` and not `zh`, or Згорани would collide with a ж.
  it("spells the зг digraph apart from ж", () => {
    expect(transliterate("Згорани")).toBe("Zghorany");
    expect(transliterate("жоден")).toBe("zhoden");
  });

  // The soft sign and the apostrophe carry no sound and no letter.
  it("drops the soft sign and the apostrophe", () => {
    expect(transliterate("Русь")).toBe("Rus");
    expect(transliterate("п'ять")).toBe("piat");
    expect(transliterate("п’ять")).toBe("piat");
  });

  // Only the first letter of a multi-character mapping is capitalised: Шевченко
  // is Shevchenko, never SHevchenko or SHEVCHENKO.
  it("capitalises a multi-letter mapping once", () => {
    expect(transliterate("Шевченко")).toBe("Shevchenko");
    expect(transliterate("Щедрик")).toBe("Shchedryk");
  });

  it("leaves Latin text and punctuation alone", () => {
    expect(transliterate("MoodNight 2026")).toBe("MoodNight 2026");
  });
});

describe("slugify", () => {
  it("lowercases, transliterates and hyphenates", () => {
    expect(slugify("Тінь над полем")).toBe("tin-nad-polem");
    expect(slugify("Молитва безіменних")).toBe("molytva-bezimennykh");
  });

  // The subtitle characters a title actually carries — guillemets, em dashes,
  // apostrophes — all collapse to separators rather than surviving into a URL.
  it("collapses punctuation into single hyphens", () => {
    expect(slugify("із циклу «Спалені листи»")).toBe("iz-tsyklu-spaleni-lysty");
    expect(slugify("Лист  —  до   князя")).toBe("lyst-do-kniazia");
  });

  it("trims hyphens from both ends", () => {
    expect(slugify("«Ніч»")).toBe("nich");
    expect(slugify("...край...")).toBe("krai");
  });

  /**
   * A slug becomes a URL and a URL ends up in a Telegram preview, so the length
   * is bounded — and the cut lands on a hyphen, because half a transliterated
   * word is unreadable in a way a missing one is not.
   */
  it("cuts long slugs on a word boundary", () => {
    const slug = slugify("Молитва безіменних та інших", 20);

    expect(slug.length).toBeLessThanOrEqual(20);
    expect(slug).toBe("molytva-bezimennykh");
    expect(slug.endsWith("-")).toBe(false);
  });

  // One word longer than the limit has no hyphen to cut on, and returning
  // nothing would be worse than returning a hard slice.
  it("hard-cuts a single word that has no boundary", () => {
    expect(slugify("безіменних", 6)).toBe("bezime");
  });

  /**
   * An empty result is a real possibility — a title of only punctuation — and
   * the caller has to be able to tell. `uniqueSlug` in apps/api is what turns
   * this into a usable address; pretending here that something was produced
   * would hide the case from it.
   */
  it("returns an empty string when nothing survives", () => {
    expect(slugify("«»—...")).toBe("");
  });
});

describe("initialsOf", () => {
  it("takes the first letter of the first two words", () => {
    expect(initialsOf("Орися Вечірня")).toBe("ОВ");
    expect(initialsOf("Леся Українка")).toBe("ЛУ");
  });

  // Cyrillic and deliberately not transliterated: the avatar is read by a
  // Ukrainian reader, for whom "ОВ" is who Орися Вечірня is and "OV" is not.
  it("stays in the source alphabet", () => {
    expect(initialsOf("Тарас Шевченко")).toBe("ТШ");
  });

  it("handles one word and extra whitespace", () => {
    expect(initialsOf("Сковорода")).toBe("С");
    expect(initialsOf("  Іван   Франко  ")).toBe("ІФ");
  });

  it("stops at two even when the name has more", () => {
    expect(initialsOf("Анна Марія Святогірська")).toBe("АМ");
  });
});
