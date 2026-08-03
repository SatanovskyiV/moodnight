import type en from "../../messages/en.json";
import type uk from "../../messages/uk.json";

/**
 * A compile-time assertion that the two message catalogues stay structurally
 * identical. Nothing imports this module and nothing should: it exists so that
 * `pnpm typecheck` fails when a key is added to one language and forgotten in
 * the other, instead of that shipping as a runtime MISSING_MESSAGE nobody sees
 * until someone browses in the neglected language. It compiles to nothing.
 *
 * It deliberately does *not* live in `global.d.ts` alongside the `AppConfig`
 * augmentation it belongs with: `skipLibCheck` is on in tsconfig.base.json, so
 * TypeScript never checks declaration files and the assertion would be inert
 * there — which is exactly the trap it is meant to catch.
 */
type Covers<Reference, Candidate extends Reference> = Candidate;

export type EnglishCoversUkrainian = Covers<typeof uk, typeof en>;
export type UkrainianCoversEnglish = Covers<typeof en, typeof uk>;
