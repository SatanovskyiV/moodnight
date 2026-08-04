import { Algorithm, hash, verify } from "@node-rs/argon2";

/**
 * Password hashing, and the one place its cost is decided.
 *
 * Argon2id rather than bcrypt or scrypt: it is the current OWASP first choice,
 * and the `@node-rs/argon2` binding ships prebuilt binaries rather than
 * compiling through node-gyp at install — which is what makes it viable inside
 * a Vercel function, where a build toolchain is not something to rely on.
 */
const PARAMS = {
  algorithm: Algorithm.Argon2id,

  /**
   * OWASP's recommended argon2id settings: 19 MiB of memory, two passes, one
   * lane. The memory cost is the point of the algorithm — it is what makes a
   * GPU no better at guessing than a CPU — and 19 MiB per hash is comfortable
   * inside a Vercel function's memory while being ruinous to an attacker
   * running millions of guesses.
   *
   * These may be raised later without invalidating anything: an argon2 hash is
   * a PHC string that carries the parameters it was made with, so `verify`
   * reads them out of the stored hash rather than assuming today's values.
   */
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

/** Hashes a plaintext password for storage. Never logs or returns the input. */
export function hashPassword(password: string): Promise<string> {
  return hash(password, PARAMS);
}

/**
 * Whether `password` produced `storedHash`.
 *
 * Resolves `false` rather than throwing when the stored value is not a hash
 * argon2 can parse. A malformed row is a failed sign-in, not a 500 — the
 * caller's job is to answer "no", and an exception here would answer "the
 * server is broken" to someone who typed the wrong password.
 */
export async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
  try {
    return await verify(storedHash, password, PARAMS);
  } catch {
    return false;
  }
}

/**
 * A real argon2id hash of a value nobody knows.
 *
 * Built on first use and kept, rather than at module load: this app compiles to
 * CommonJS, where there is no top-level await, and hashing eagerly would put
 * ~50 ms of work into a cold start that may never sign anybody in.
 *
 * The plaintext behind it is random and immediately discarded, so no password
 * verifies against it — which is the entire requirement.
 */
let dummyHash: Promise<string> | undefined;

/**
 * Spends the same time a real password check spends, and answers no.
 *
 * This is what a sign-in attempt gets when the address has no account, or the
 * account has no password. Without it, those requests would skip hashing
 * altogether and return in about a millisecond while a registered address takes
 * fifty — a difference measurable from outside, which turns the login route
 * into a way of enumerating who has an account here. Verifying against a hash
 * nothing matches costs the same as verifying against a real one, so the timing
 * says nothing either way.
 */
export async function dummyVerify(password: string): Promise<false> {
  dummyHash ??= hashPassword(crypto.randomUUID() + crypto.randomUUID());
  await verifyPassword(await dummyHash, password);

  return false;
}
