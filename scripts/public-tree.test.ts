// The public tree names nothing private. This repository is public: no host on our own domain that only our infrastructure uses, no private
// repository or its tracker, no one's home directory, no name of the setup mode that once wrote
// agent files, and none of the private words (the organisation's private CI provider, an adopter).
//
// The private words are never in this file, whole or in parts: two quoted fragments joined in a
// public file are the word to anyone who reads it. They come from the PUBLIC_TREE_PRIVATE_WORDS CI
// secret (comma- or newline-separated). A run without it (a fork's PR, Dependabot's, a local run)
// says it skipped them; this repository's own CI runs set PUBLIC_TREE_PRIVATE_WORDS_REQUIRED=1,
// where an empty secret fails. The setup mode's name is already public, so it is assembled here.
//
// The scan reads `git ls-files`, proves it read this file and counts what it read, so a wrong root
// is a failure, never a pass over nothing. A failure names the file and the rule, never the
// matched text: CI logs are public. Each rule is proven to fire below before it is trusted.

import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '..');
const SELF = 'scripts/public-tree.test.ts';
const MIN_TRACKED = 50;

const DOMAIN = ['developerz', 'ai'].join('.');
const PUBLIC_HOSTS = new Set([`www.${DOMAIN}`]);
// A host starts after a delimiter, so a URL-encoded label (`live%20demo-<host>`) is not one.
const OWN_HOST = new RegExp(
  `(?<![%\\w.-])(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+${DOMAIN.replace('.', '\\.')}\\b`,
  'gi',
);
const ORG = ['developerz', 'ai'].join('-');
// The organisation's public repositories this tree may name.
const PUBLIC_REPOS = new Set([
  'ai-army',
  'ai-designer',
  'ai-gaming-agent-mcp',
  'ai-task-master',
  'bun-on-rails',
  'cairn',
  'claude-and-conquer',
  'claude-task-master',
  'claudes',
  'db-mcp-gateway',
  'fast_rspec',
  'gold-standards-in-ai',
  'magik',
  'mcp-ssh',
  'mini',
  'multi-ai-router',
  'nexus-engine',
  'open-mmorpg',
  'open-remote-ssh-tmux',
  'research',
  'tessera',
  'ts23d',
  'ui-debugger-mcp',
  'ultimate',
  'universal-lsp',
  'wurk',
]);
// A GitHub reference to an org repository, after `github.com/` or bare; a registry path is an image.
const ORG_REPO = new RegExp(`(?:github\\.com/|(?<![\\w./-]))${ORG}/([\\w.-]+)`, 'gi');
// A bare tracker reference to a private repository (`name#12`, `name #12`); `dz` is the platform's shorthand.
const BARE_TRACKER = new RegExp(
  `(?<![\\w./-])(?:infrastructure|${DOMAIN.replace('.', '\\.')}|dz) ?#\\d`,
  'i',
);
// CI's and the tests' generic users are nobody's machine.
const HOME_PATH =
  /(?:^|[^\w.-])\/(?:home|Users)\/(?!(?:runner|user|app|tester|sdk|someone|u)\b)[\w.-]+/;
// Listed backwards so no literal here reads as the name.
const SETUP_MODE = new RegExp(
  `(?<![a-z0-9])${['runner', 'dz'].reverse().join('[-_ ]?')}(?![a-z0-9])`,
  'i',
);
const PRIVATE_WORDS_ENV = 'PUBLIC_TREE_PRIVATE_WORDS';
const REQUIRED_ENV = 'PUBLIC_TREE_PRIVATE_WORDS_REQUIRED';

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function privateWords(raw: string | undefined): RegExp[] {
  return (raw ?? '')
    .split(/[,\n]/)
    .map((word) => word.trim())
    .filter((word) => word.length > 0)
    .map((word) => new RegExp(escapeRegExp(word), 'i'));
}

/** The private words for this run, or an error when the run must check them and has none. */
export function privateWordsForRun(raw: string | undefined, required: boolean): RegExp[] {
  const words = privateWords(raw);
  if (words.length === 0 && required) {
    throw new Error(
      `${PRIVATE_WORDS_ENV} is empty, and ${REQUIRED_ENV}=1 says this run must check the private words`,
    );
  }
  return words;
}

/** The names of every rule `text` breaks. Never the matched text. */
export function violations(text: string, words: readonly RegExp[]): string[] {
  const rules: string[] = [];
  const hosts = text.match(OWN_HOST) ?? [];
  if (hosts.some((host) => !PUBLIC_HOSTS.has(host.toLowerCase())))
    rules.push('internal host on our own domain');
  if (SETUP_MODE.test(text)) rules.push('setup-mode name');
  if (HOME_PATH.test(text)) rules.push("someone's home directory");
  const privateRepo = [...text.matchAll(ORG_REPO)].some(
    (m) =>
      !PUBLIC_REPOS.has(
        (m[1] ?? '')
          .toLowerCase()
          .replace(/\.git$/, '')
          .replace(/\.+$/, ''),
      ),
  );
  if (privateRepo || BARE_TRACKER.test(text)) rules.push('private repository');
  if (words.some((word) => word.test(text))) rules.push('private word (from the secret)');
  return rules;
}

function trackedFiles(): string[] {
  const top = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: ROOT, encoding: 'utf8' });
  if (top.status !== 0) throw new Error('git rev-parse --show-toplevel failed');
  if (realpathSync(top.stdout.trim()) !== realpathSync(ROOT))
    throw new Error("git answers for another repository's tree");
  const listed = spawnSync('git', ['ls-files', '-z'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (listed.status !== 0) throw new Error('git ls-files failed');
  return listed.stdout.split('\0').filter((path) => path.length > 0);
}

test('no tracked file names anything private', () => {
  const words = privateWordsForRun(
    process.env[PRIVATE_WORDS_ENV],
    process.env[REQUIRED_ENV] === '1',
  );
  if (words.length === 0)
    console.warn(`public-tree: ${PRIVATE_WORDS_ENV} is unset, private words not checked`);
  const files = trackedFiles();
  expect(files.includes(SELF)).toBe(true);
  let read = 0;
  const failures: string[] = [];
  for (const path of files) {
    const full = join(ROOT, path);
    let bytes: Buffer;
    try {
      if (!statSync(full).isFile()) continue;
      bytes = readFileSync(full);
    } catch {
      continue;
    }
    if (bytes.subarray(0, 8000).includes(0)) continue;
    read += 1;
    for (const rule of violations(bytes.toString('utf8'), words)) failures.push(`${path}: ${rule}`);
  }
  console.warn(
    `public-tree: read ${read} of ${files.length} tracked files, ${words.length} private words`,
  );
  expect(read).toBeGreaterThanOrEqual(MIN_TRACKED);
  expect(failures).toEqual([]);
});

// The rules, proven to fire before they are trusted on the tree.

test('an internal host fires and the public site passes', () => {
  expect(violations(`url: https://mcp.${DOMAIN}/v1/mcp`, [])).toEqual([
    'internal host on our own domain',
  ]);
  expect(violations(`see https://www.${DOMAIN}`, [])).toEqual([]);
});

test('a private repository or bare tracker fires; public repositories and image paths pass', () => {
  expect(violations(`see ${ORG}/vault#12`, [])).toEqual(['private repository']);
  expect(violations(`(${DOMAIN}#2964, epic #2958)`, [])).toEqual(['private repository']);
  expect(violations(`(${['d', 'z'].join('')}#12)`, [])).toEqual(['private repository']);
  expect(violations(`${ORG}/ui-debugger-mcp#12, github.com/${ORG}/wurk`, [])).toEqual([]);
  expect(violations(`registry.example.com/${ORG}/vault-demo:sha-1`, [])).toEqual([]);
});

test("someone's home directory and the setup mode fire", () => {
  expect(violations(`cd ${['', 'home', 'jane', 'src'].join('/')}`, [])).toEqual([
    "someone's home directory",
  ]);
  expect(violations(`ANDROID_HOME=${['', 'home', 'sdk'].join('/')}`, [])).toEqual([]);
  expect(violations(`a ${['RUNNER', 'DZ'].reverse().join('-')} box`, [])).toEqual([
    'setup-mode name',
  ]);
});

test('a private word from the secret fires', () => {
  const words = privateWords(' Quimtel ,\n\nzorblax.io\n');
  expect(words).toHaveLength(2);
  expect(violations('# runs on QUIMTEL', words)).toEqual(['private word (from the secret)']);
  expect(violations('zorblax-io and quim', words)).toEqual([]);
  expect(privateWords(undefined)).toEqual([]);
});

test('a required run without the secret fails', () => {
  expect(() => privateWordsForRun(undefined, true)).toThrow(REQUIRED_ENV);
  expect(() => privateWordsForRun(' , \n', true)).toThrow(REQUIRED_ENV);
  expect(privateWordsForRun(undefined, false)).toEqual([]);
  expect(privateWordsForRun('quimtel', true)).toHaveLength(1);
});

// The only comment a `runs-on:` may carry: the public runner, in the wording ci.yml uses. A name
// from the secret in that comment rule fires only where the secret is set (CI); this check needs no
// secret, so a fork, Dependabot and a local run catch it too. The allowed line itself is public, so
// it is written out; the failure names the file and line, never the offending text.
const RUNNER_COMMENT = '# GitHub-hosted runner.';
const RUNS_ON = /^\s*runs-on:/;

/** The failures `text` has for its `runs-on:` comments. Never the offending text. */
export function runnerCommentFailures(name: string, text: string): string[] {
  const failures: string[] = [];
  const lines = text.split('\n');
  lines.forEach((line, index) => {
    if (!RUNS_ON.test(line)) return;
    const above = (lines[index - 1] ?? '').trim();
    // No comment above the key: nothing can leak there.
    if (above === RUNNER_COMMENT || !above.startsWith('#')) return;
    failures.push(`${name}:${index}: the comment above runs-on: is not "${RUNNER_COMMENT}"`);
  });
  return failures;
}

test('the line above every runs-on: is the public runner comment or none', () => {
  const dir = join(ROOT, '.github/workflows');
  const files = readdirSync(dir)
    .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
    .sort();
  expect(files.length).toBeGreaterThanOrEqual(2);
  const failures: string[] = [];
  let checked = 0;
  for (const name of files) {
    const text = readFileSync(join(dir, name), 'utf8');
    checked += text.split('\n').filter((line) => RUNS_ON.test(line)).length;
    failures.push(...runnerCommentFailures(name, text));
  }
  // A workflow that moved or lost its keys is a failure, never a pass over nothing.
  expect(checked).toBeGreaterThanOrEqual(2);
  expect(failures).toEqual([]);
});

test('a runs-on: comment that is not the public runner fires', () => {
  const allowed = ['jobs:', '  gate:', `    ${RUNNER_COMMENT}`, '    runs-on: ubuntu-latest', ''].join(
    '\n',
  );
  expect(runnerCommentFailures('ok.yml', allowed)).toEqual([]);
  // No comment above the key: nothing can leak there.
  expect(runnerCommentFailures('ok.yml', '    runs-on: ubuntu-latest\n')).toEqual([]);
  // Any other comment above the key, such as the wording release.yml carried before its reword.
  const other = ['jobs:', '  gate:', '    # Runs on a runner that is not the public one.', '    runs-on: ubuntu-latest', ''].join(
    '\n',
  );
  expect(runnerCommentFailures('release.yml', other)).toEqual([
    `release.yml:3: the comment above runs-on: is not "${RUNNER_COMMENT}"`,
  ]);
  // A comment further up is not the one above the key.
  const above = ['# Runs on a runner that is not the public one.', 'jobs:', '    runs-on: ubuntu-latest', ''].join(
    '\n',
  );
  expect(runnerCommentFailures('ok.yml', above)).toEqual([]);
});

test("CI passes the secret and the required flag to this guard's run", () => {
  // Deleting, commenting out or weakening either line would switch the private-word check off
  // with every test still green, so the step's live (uncommented) lines are matched exactly.
  const ci = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');
  const start = ci.indexOf('- name: unit tests\n');
  expect(start).toBeGreaterThanOrEqual(0);
  const end = ci.indexOf('run: bun run test', start);
  expect(end).toBeGreaterThan(start);
  const live = ci
    .slice(start, end)
    .split('\n')
    .filter((line) => !/^\s*#/.test(line));
  expect(live.some((line) => /^\s+PUBLIC_TREE_PRIVATE_WORDS: \$\{\{ secrets\.PUBLIC_TREE_PRIVATE_WORDS \}\}\s*$/.test(line))).toBe(true);
  // The exact condition: a weaker one (`false && '1'`, a renamed repo check) never sets the flag.
  expect(live.map((line) => line.trim())).toContain(
    'PUBLIC_TREE_PRIVATE_WORDS_REQUIRED: ${{ (github.event_name != \'pull_request\' || github.event.pull_request.head.repo.full_name == github.repository) && github.actor != \'dependabot[bot]\' && \'1\' || \'\' }}',
  );
});
