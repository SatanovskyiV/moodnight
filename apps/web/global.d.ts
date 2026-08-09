import type { CellData, RowData, TableFeatures } from "@tanstack/react-table";

import type uk from "./messages/uk.json";
import type { routing } from "./src/i18n/routing";

/**
 * Teaches next-intl about this app specifically: `useTranslations` then
 * autocompletes real message keys and rejects typos, and `Locale` narrows to the
 * two languages we ship instead of `string`.
 *
 * Ukrainian is the reference catalogue — it is the language the site is written
 * in, and English is the translation of it. What keeps English from drifting
 * away from it is the assertion in `src/i18n/catalogues.ts`, which has to sit in
 * a real module because `skipLibCheck` exempts this file from checking.
 */
declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof uk;
  }
}

/**
 * The two things this site needs to say about a column that TanStack has no
 * opinion on. `meta` is the sanctioned place for them — the alternative is a
 * parallel record keyed by column id, which is the same data with a second
 * chance to fall out of step with the columns it describes.
 *
 * The type parameters have to be restated exactly as table-core declares them
 * (`types/ColumnDef.d.ts`), constraints and default included, or TypeScript
 * refuses the augmentation rather than merging it. They are unused here on
 * purpose; the `_` prefix is what the repo's `no-unused-vars` rule accepts.
 */
declare module "@tanstack/react-table" {
  interface ColumnMeta<
    in out _TFeatures extends TableFeatures,
    in out _TData extends RowData,
    _TValue extends CellData = CellData,
  > {
    /**
     * The width below which this column is not worth its share of the screen.
     * Five columns do not fit a 375px phone, and a table that scrolls sideways
     * hides the answer rather than the detail — so each list says which of its
     * columns are the answer and which are the detail.
     *
     * Read by `ListTable`, which turns it into the one class Tailwind can see.
     */
    hideBelow?: "narrow" | "compact";

    /** Ranged right instead of left — for counts and dates. */
    align?: "end";
  }
}
