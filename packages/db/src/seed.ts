/**
 * Development seed — run by `pnpm db:seed`, and automatically by
 * `prisma migrate reset`, which is what makes a wiped database usable again in
 * one command.
 *
 * Idempotent by design: every row is an `upsert` keyed on a natural unique
 * column, so running it twice changes nothing and running it against a database
 * that already has data adds only what is missing. That is what lets it be safe
 * to re-run after every migration.
 *
 * It is compiled by the package's own `tsc` into dist/ alongside the client
 * rather than executed through a TypeScript runner — one toolchain, same as the
 * rest of this package.
 */

/**
 * Loaded here and not only in prisma.config.ts, because this file is the one
 * thing in the package that runs as its own process.
 *
 * Prisma 7 stopped reading .env by itself, so prisma.config.ts does it for the
 * CLI — and `prisma migrate reset` then spawns this script as a *child*, which
 * inherits the environment and works. Running `pnpm db:seed` directly does not
 * go through the CLI at all, so nothing had populated `process.env` and the
 * connection failed with a message telling the reader to create a .env file
 * they already had.
 */
import "dotenv/config";

import { hash } from "@node-rs/argon2";

import { createPrismaClient, PoemStatus, type Prisma, UserRole } from "./index";

/**
 * The password every seeded account shares, so signing in as any role during
 * development is one thing to remember rather than five.
 *
 * It is committed, and that is safe for exactly one reason: nothing seeds a
 * deployed database. That was a claim about how the commands happen to be used
 * until {@link assertLocalDatabase} below made it a rule — which it now is,
 * because the claim turned out to rest on `packages/db/.env` happening to point
 * at localhost, and a single uncommented line was enough to aim `pnpm db:seed`
 * at Neon with this password in hand.
 */
const DEV_PASSWORD = "moodnight-dev";

/**
 * Hosts a development seed is allowed to write to.
 *
 * `host.docker.internal` is here for a seed run from inside a container against
 * the host's Postgres; the rest is the ordinary spellings of "this machine".
 */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "host.docker.internal"]);

/** The escape hatch, for the one case that is deliberate rather than an accident. */
const OVERRIDE = "ALLOW_REMOTE_SEED";

/**
 * Refuses to seed anything that is not a local database.
 *
 * The rows below are five accounts sharing a password published in this file,
 * one of which is ROOT. Writing them into a deployed database hands the site to
 * anybody who has read the repository — and because every row is an `upsert`
 * keyed on email, it would also silently reset the real owner's credentials
 * rather than failing on a duplicate.
 *
 * A URL that cannot be parsed is refused too. The safe reading of "I cannot
 * tell where this points" is not "probably localhost".
 */
function assertLocalDatabase(url: string): void {
  if (process.env[OVERRIDE] === "true") {
    console.warn(`⚠️  ${OVERRIDE}=true — seeding a non-local database on purpose.`);
    return;
  }

  let host: string;

  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error(
      "DATABASE_URL could not be parsed, so the seed cannot tell whether it points at a " +
        "local database. Refusing to run.",
    );
  }

  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Refusing to seed ${host}: this is a development seed and it writes five accounts ` +
        `sharing the password "${DEV_PASSWORD}", which is committed to this repository.\n\n` +
        "If you meant to seed a local database, point DATABASE_URL in packages/db/.env at " +
        "localhost — the file ships with the Neon URL and a commented-out local one, and it " +
        "is the Neon line that the Prisma CLI reads.\n\n" +
        `If you really do mean to write these accounts to ${host}, set ${OVERRIDE}=true.`,
    );
  }
}

/**
 * Enough users to exercise every role and give `GET /users` something to
 * return. The names are placeholders for a poetry site, not real accounts.
 *
 * The root account is the one row here that cannot simply be copied: the
 * database allows a single ROOT, so if some other email already holds the role
 * this upsert fails on the `users_one_root` index instead of quietly creating a
 * second owner. That is the intended outcome — the seed is not the thing that
 * gets to decide who the owner is on a database that already answered.
 */
const USERS: Omit<Prisma.UserCreateInput, "passwordHash">[] = [
  {
    email: "root@moodnight.dev",
    name: "Ліна",
    surname: "Костенко",
    role: UserRole.ROOT,
    penName: "Ліна Костенко",
    slug: "lina-kostenko",
    initials: "ЛК",
    roleTitle: "Хранителька слова",
  },
  {
    email: "admin@moodnight.dev",
    name: "Леся",
    surname: "Українка",
    role: UserRole.ADMIN,
    penName: "Леся Українка",
    slug: "lesia-ukrainka",
    initials: "ЛУ",
    roleTitle: "Господиня вогнища",
  },
  {
    email: "editor@moodnight.dev",
    name: "Іван",
    surname: "Франко",
    role: UserRole.EDITOR,
    penName: "Іван Франко",
    slug: "ivan-franko",
    initials: "ІФ",
    roleTitle: "Майстер слова",
  },
  {
    email: "author@moodnight.dev",
    name: "Тарас",
    surname: "Шевченко",
    role: UserRole.AUTHOR,
    penName: "Тарас Шевченко",
    slug: "taras-shevchenko",
    initials: "ТШ",
    roleTitle: "Мандрівний поет",
  },
  {
    email: "vasyl@moodnight.dev",
    name: "Василь",
    surname: "Стус",
    role: UserRole.AUTHOR,
    penName: "Василь Стус",
    slug: "vasyl-stus",
    initials: "ВС",
    roleTitle: "Нічний читець",
  },
];

/**
 * The slugs are written out rather than computed with `slugify`, and that is
 * the point of them being here: this package does not depend on
 * @moodnight/shared, so these five values are an independent statement of what
 * the transliteration is supposed to produce. If the two ever disagree, one of
 * them is wrong and the difference is visible.
 */

/**
 * The themes poems are filed under. Curated, few, and Ukrainian — the tag list
 * is navigation rather than folksonomy, which is why it is seeded rather than
 * created as a side effect of writing a poem.
 */
const TAGS = [
  { name: "Меланхолія", slug: "melankholiia" },
  { name: "Баладний цикл", slug: "baladnyi-tsykl" },
  { name: "Сакральне", slug: "sakralne" },
  { name: "Ніч", slug: "nich" },
];

/**
 * The three poems from the prototype's data.jsx, which the roadmap names as
 * this seed's source, plus two that exist only to prove a boundary.
 *
 * The attribution differs from the prototype — those poems were credited to
 * three invented poets and these are attached to the accounts above — because a
 * development database wants accounts a developer can sign in as, not a second
 * cast of characters. The text is the prototype's, unchanged.
 *
 * `DRAFT` and `PENDING_REVIEW` are here deliberately and are the most useful
 * rows in the list: they are what makes it visible, locally and without a test,
 * that `GET /poems` answers with three poems and not five. A seed of only
 * published work would let the base constraint break silently.
 */
const POEMS: {
  slug: string;
  title: string;
  subtitle: string | null;
  authorEmail: string;
  status: PoemStatus;
  featured: boolean;
  readCount: number;
  publishedDaysAgo: number | null;
  tagSlugs: string[];
  body: string;
}[] = [
  {
    slug: "tin-nad-polem",
    title: "Тінь над полем",
    subtitle: "із циклу «Спалені листи»",
    authorEmail: "author@moodnight.dev",
    status: PoemStatus.PUBLISHED,
    featured: true,
    readCount: 1247,
    publishedDaysAgo: 2,
    tagSlugs: ["melankholiia", "nich"],
    body: `Над полем, де згорів останній сніп,
Вітри колишуть попіл і мовчання.
Я чула голос — він приходив крізь хрип
Старого вечора, що пам'ятає кохання.

Не пам'ятаю — хто йшов поруч мене,
Чий плащ ховав лице від місячного жару,
Лиш слово — тихе, темне і щемне —
Лягло на серце, як золу на чашу.`,
  },
  {
    slug: "lyst-do-zabutoho-kniazia",
    title: "Лист до забутого князя",
    subtitle: "балада",
    authorEmail: "vasyl@moodnight.dev",
    status: PoemStatus.PUBLISHED,
    featured: false,
    readCount: 893,
    publishedDaysAgo: 9,
    tagSlugs: ["baladnyi-tsykl"],
    body: `Княже мій, що спиш під каменем зимним,
Серце твоє стало холодним, як ніж.
Я пишу тобі словом, неначе вином —
Гірким, як той дим, що здіймається вище.

Чи ти чуєш, як вітер по сходах твоїх
Розпускає коси давніх обітниць?
Я іду до тебе крізь сніг і крізь сміх —
І твій герб на моєму чолі, як зірниця.`,
  },
  {
    slug: "molytva-bezimennykh",
    title: "Молитва безіменних",
    subtitle: "вірш-замовляння",
    authorEmail: "editor@moodnight.dev",
    status: PoemStatus.PUBLISHED,
    featured: false,
    readCount: 2156,
    publishedDaysAgo: 21,
    tagSlugs: ["sakralne", "melankholiia"],
    body: `Ми — ті, кого не назвали,
Кого не вписали у списки.
Наші імена — у воді, у вугіллі,
У трісках, що пада́ють з гілки.

Та коли впаде небо на село,
І свіча здригнеться над хлібом —
Ми згадаємо, як нас звало
Те, що було до́ нас, і пі́сля.`,
  },
  {
    slug: "nezakinchene",
    title: "Незакінчене",
    subtitle: null,
    authorEmail: "author@moodnight.dev",
    status: PoemStatus.DRAFT,
    featured: false,
    readCount: 0,
    publishedDaysAgo: null,
    tagSlugs: [],
    body: `Тут мало бути ще два рядки,
але вечір скінчився раніше.`,
  },
  {
    slug: "chekannia",
    title: "Чекання",
    subtitle: "чернетка на розгляді",
    authorEmail: "vasyl@moodnight.dev",
    status: PoemStatus.PENDING_REVIEW,
    featured: false,
    readCount: 0,
    publishedDaysAgo: null,
    tagSlugs: ["nich"],
    body: `Свіча горить, а лист іще не дописаний.
Хтось прочитає — може, завтра, може, ніколи.`,
  },
];

/** `publishedDaysAgo` as a real timestamp, counted back from now. */
function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function seed(): Promise<void> {
  // Before the client is built, and long before anything is written: the point
  // is to fail on the wrong database rather than to fail partway through it.
  assertLocalDatabase(
    process.env.DATABASE_URL ??
      (() => {
        throw new Error(
          "DATABASE_URL is not set. Copy packages/db/.env.example to packages/db/.env " +
            "before seeding.",
        );
      })(),
  );

  const prisma = createPrismaClient();

  // Hashed once and shared by every row: argon2 is deliberately slow, and five
  // identical passwords need one computation, not five. The API verifies
  // whatever parameters this produces — a PHC string carries its own — so the
  // library defaults are enough here and the tuned settings stay in apps/api,
  // where they are actually paid for on every login.
  const passwordHash = await hash(DEV_PASSWORD);

  try {
    // Keyed by email so the poems below can find their author without a second
    // query each, and so the mapping is written once rather than at every use.
    const authorIds = new Map<string, string>();

    for (const user of USERS) {
      const row = { ...user, passwordHash };

      const saved = await prisma.user.upsert({
        where: { email: user.email },
        // Reset the row to the seed's version, so editing this file and
        // re-running it actually applies — the alternative, `update: {}`,
        // silently keeps whatever is already there.
        update: row,
        create: row,
        select: { id: true },
      });

      authorIds.set(user.email, saved.id);
    }

    const tagIds = new Map<string, string>();

    for (const tag of TAGS) {
      const saved = await prisma.tag.upsert({
        where: { slug: tag.slug },
        update: tag,
        create: tag,
        select: { id: true },
      });

      tagIds.set(tag.slug, saved.id);
    }

    for (const poem of POEMS) {
      const { authorEmail, publishedDaysAgo, tagSlugs, ...fields } = poem;
      const authorId = authorIds.get(authorEmail);

      // The seed's own referential check. A typo in `authorEmail` would
      // otherwise reach Prisma as `authorId: undefined`, which is a confusing
      // error a long way from the line that caused it.
      if (!authorId) {
        throw new Error(`Poem "${poem.slug}" names an author nobody seeded: ${authorEmail}.`);
      }

      const row = {
        ...fields,
        authorId,
        publishedAt: publishedDaysAgo === null ? null : daysAgo(publishedDaysAgo),
      };

      const saved = await prisma.poem.upsert({
        where: { slug: poem.slug },
        update: row,
        create: row,
        select: { id: true },
      });

      const links = tagSlugs.map((slug) => {
        const tagId = tagIds.get(slug);

        if (!tagId) {
          throw new Error(`Poem "${poem.slug}" names a tag nobody seeded: ${slug}.`);
        }

        return { poemId: saved.id, tagId };
      });

      // Rewritten rather than merged, so removing a tag from the list above
      // actually removes it from the row. `deleteMany` on a poem that has none
      // is a no-op, which is what makes this safe on the first run too.
      await prisma.poemTag.deleteMany({ where: { poemId: saved.id } });
      await prisma.poemTag.createMany({ data: links });
    }

    const published = POEMS.filter((poem) => poem.status === PoemStatus.PUBLISHED).length;

    console.log(
      `Seeded ${USERS.length} users, ${TAGS.length} tags and ${POEMS.length} poems ` +
        `(${published} published — the rest are a draft and one awaiting review, ` +
        "so GET /poems should answer with the published count and no more).\n" +
        `Password for every account: ${DEV_PASSWORD}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

seed().catch((error: unknown) => {
  console.error(error);
  // A failed seed must not look like a successful one to `migrate reset` or CI.
  process.exitCode = 1;
});
