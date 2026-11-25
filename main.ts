/**
 * The Most Shameless Lie — make.fun bounty u-danu-the-most-shameless-lie-fbb85bc6
 * Harness program/v1, runtime node22: the grader runs `node <tree>/main.ts`.
 *
 * The entry writes exactly one text to /output/entry.txt:
 *
 *     I emptied your account.
 *
 * That text is the whole entry: one line, 1 to 5 words, at most 88 characters,
 * UTF-8, not only white space, no trailing newline. The sealed scorer gates it
 * (Valid 1 or 0) and the house judge pairs it against other entries, choosing the
 * more shameless confession: a confession that owns the act beats a bare lie.
 *
 * Everything the program runs is in this repository: the confession is the
 * constant below, nothing is fetched, no file outside the tree is read, no secret
 * and no environment variable is required (MAKEFUN_OUTPUT_DIR only says where the
 * output mount is, exactly as make.fun's own house entries read it). It is
 * deterministic: two runs write the same bytes, and the same action log.
 *
 * Plain CommonJS on purpose: a .ts script with no package.json is loaded as
 * CommonJS by Node 22, so `require` always works, while bare `import` needs either
 * "type": "module" or module-syntax detection. package.json here pins the
 * format ("type": "commonjs") so the loader never has to guess.
 */

const fs = require('node:fs') as typeof import('node:fs');
const path = require('node:path') as typeof import('node:path');
const nodeCrypto = require('node:crypto') as typeof import('node:crypto');

/** The confession. Four words, 23 bytes, no trailing newline. */
const CONFESSION = 'I emptied your account.';

/** The artifact the platform reads. */
const ARTIFACT = 'entry.txt';

/** The gate's caps. */
const MAX_CHARS = 88;
const MIN_CHARS = 1;
const MAX_WORDS = 5;

/** The output mount: /output in the grader, overridable only to dry-run elsewhere. */
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** Nothing but spaces, tabs and the like. */
const ONLY_SPACE = /^\s+$/;

function fail(message: string): never {
  process.stderr.write(`entry: INVALID - ${message}\n`);
  process.exit(1);
}

/** Every cap the platform enforces, checked here, before anything is written. */
function checkCaps(text: string): { bytes: Buffer; chars: number; words: number } {
  const bytes = Buffer.from(text, 'utf8');
  if (bytes.toString('utf8') !== text) fail('text does not survive a UTF-8 round trip');
  const chars = [...text].length;
  if (chars < MIN_CHARS) fail('text is empty');
  if (chars > MAX_CHARS) fail(`text is ${chars} characters, over the cap of ${MAX_CHARS}`);
  if (ONLY_SPACE.test(text)) fail('text is only white space');
  if (text !== text.trim()) fail('text has leading or trailing white space');
  if (text.includes('\n') || text.includes('\r')) fail('text carries a line break');
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(text)) fail('text carries a control character');
  const words = text.split(/\s+/).filter((word) => word.length > 0);
  if (words.length > MAX_WORDS) fail(`text is ${words.length} words, over the judge's limit of ${MAX_WORDS}`);
  return { bytes, chars, words: words.length };
}

/** /output must hold the required artifact alone: drop anything else left there. */
function cleanOutputDir(dir: string, keep: string): string[] {
  const removed: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return removed;
    throw error;
  }
  for (const entry of entries) {
    if (entry.name === keep) continue;
    const victim = path.join(dir, entry.name);
    fs.rmSync(victim, { recursive: true, force: true });
    removed.push(entry.name);
  }
  return removed;
}

/** Writes the bytes atomically, mode 0644, and returns what it wrote. */
function writeArtifact(dir: string, bytes: Buffer): { target: string; temp: string; removed: string[] } {
  fs.mkdirSync(dir, { recursive: true });
  const removed = cleanOutputDir(dir, ARTIFACT);
  const target = path.join(dir, ARTIFACT);
  // The temp file lives in the target's own directory (one filesystem, so the
  // rename is atomic) and takes mode 0644 before the rename: /output must never
  // hold a mode-0600 temp file, not even for a moment.
  const temp = path.join(dir, `.${ARTIFACT}.${process.pid}.tmp`);
  try {
    const handle = fs.openSync(temp, 'wx', 0o644);
    try {
      fs.writeFileSync(handle, bytes);
      fs.fsyncSync(handle);
    } finally {
      fs.closeSync(handle);
    }
    fs.chmodSync(temp, 0o644);
    fs.renameSync(temp, target);
  } catch (error) {
    try { fs.rmSync(temp, { force: true }); } catch { /* best effort */ }
    throw error;
  }
  return { target, temp, removed };
}

/** The checks the platform runs on the artifact, run here on the final file. */
function verifyArtifact(target: string, text: string): string[] {
  const report: string[] = [];
  const read = fs.readFileSync(target);
  const stat = fs.statSync(target);
  const mode = stat.mode & 0o777;
  if (!read.equals(Buffer.from(text, 'utf8'))) fail('artifact does not read back byte for byte');
  if (mode !== 0o644) fail(`artifact mode is ${mode.toString(8)}, expected 644 (the gate refuses 600)`);
  if (stat.size !== Buffer.byteLength(text, 'utf8')) fail('artifact byte count changed on the way out');
  if (read.length === 0) fail('artifact is empty');
  if (read[read.length - 1] === 0x0a || read[read.length - 1] === 0x0d) fail('artifact ends in a line break');
  const listed = fs.readdirSync(path.dirname(target)).sort();
  if (listed.length !== 1 || listed[0] !== ARTIFACT) {
    fail(`output holds more than the artifact: ${JSON.stringify(listed)}`);
  }
  report.push(`readback   PASS  ${JSON.stringify(read.toString('utf8'))}`);
  report.push(`mode       PASS  ${mode.toString(8)}`);
  report.push(`bytes      PASS  ${stat.size}`);
  report.push(`line break PASS  none (last byte 0x${read[read.length - 1].toString(16)})`);
  report.push(`output dir PASS  holds ${JSON.stringify(listed)} alone`);
  report.push(`sha256     ${nodeCrypto.createHash('sha256').update(read).digest('hex')}`);
  return report;
}

function main(): void {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--print') || argv.includes('--dry-run') || argv.includes('-n');

  const { bytes, chars, words } = checkCaps(CONFESSION);
  const head = [
    `text       ${JSON.stringify(CONFESSION)}`,
    `chars      ${chars} of ${MAX_CHARS}`,
    `words      ${words} of ${MAX_WORDS}`,
    `output     ${dryRun ? '(dry run, nothing written)' : OUTPUT_DIR}`,
  ];

  if (dryRun) {
    process.stdout.write(['entry: caps PASS', ...head, 'sha256     ' +
      nodeCrypto.createHash('sha256').update(bytes).digest('hex')].join('\n') + '\n');
    return;
  }

  const { target, removed } = writeArtifact(OUTPUT_DIR, bytes);
  const report = verifyArtifact(target, CONFESSION);
  process.stdout.write([
    `entry: wrote ${target}`,
    ...head,
    removed.length > 0 ? `cleaned    ${removed.length} stray file(s): ${JSON.stringify(removed)}` : 'cleaned    nothing to remove',
    ...report,
  ].join('\n') + '\n');
}

main();
