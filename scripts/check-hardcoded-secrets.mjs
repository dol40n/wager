#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const SECRET_NAMES = [
  "ADMIN_API_KEY",
  "CRON_SECRET",
  "ADMIN_KEY",
  "ADMIN",
  "RESOLVER_AUTHORITY_PRIVATE_KEY",
  "ANTHROPIC_API_KEY",
  "TAVILY_API_KEY",
  "DATABASE_URL",
];

const CREDENTIAL_ALIASES = {
  adminApiKey: "ADMIN_API_KEY",
  adminKey: "ADMIN_API_KEY",
  cronSecret: "CRON_SECRET",
  resolverAuthorityPrivateKey: "RESOLVER_AUTHORITY_PRIVATE_KEY",
  anthropicApiKey: "ANTHROPIC_API_KEY",
  tavilyApiKey: "TAVILY_API_KEY",
  databaseUrl: "DATABASE_URL",
};

const NAME_PATTERN = SECRET_NAMES.join("|");
const ALIAS_PATTERN = Object.keys(CREDENTIAL_ALIASES).join("|");
const LITERAL_PATTERNS = [
  { pattern: new RegExp(`\\b(${NAME_PATTERN})\\b\\s*=\\s*([\"'\\\`])([^\\r\\n]*?)\\2`, "g"), nameGroup: 1, valueGroup: 3 },
  { pattern: new RegExp(`([\"'])(${NAME_PATTERN})\\1\\s*:\\s*([\"'\\\`])([^\\r\\n]*?)\\3`, "g"), nameGroup: 2, valueGroup: 4 },
  { pattern: new RegExp(`\\b(${NAME_PATTERN})\\b\\s*:\\s*([\"'\\\`])([^\\r\\n]*?)\\2`, "g"), nameGroup: 1, valueGroup: 3 },
  { pattern: new RegExp(`\\bprocess\\.env\\.(${NAME_PATTERN})\\s*(?:\\|\\||\\?\\?)\\s*([\"'\\\`])([^\\r\\n]*?)\\2`, "g"), nameGroup: 1, valueGroup: 3 },
  { pattern: new RegExp(`\\bprocess\\.env\\[([\"'])(${NAME_PATTERN})\\1\\]\\s*(?:\\|\\||\\?\\?)\\s*([\"'\\\`])([^\\r\\n]*?)\\3`, "g"), nameGroup: 2, valueGroup: 4 },
  { pattern: /(["'])x-admin-api-key\1\s*:\s*(["'`])([^\r\n]*?)\2/gi, fixedName: "ADMIN_API_KEY", valueGroup: 3 },
  { pattern: /\.set\(\s*(["'])x-admin-api-key\1\s*,\s*(["'`])([^\r\n]*?)\2/gi, fixedName: "ADMIN_API_KEY", valueGroup: 3 },
  { pattern: new RegExp(`^\\s*(?:export\\s+)?(${NAME_PATTERN})\\s*=\\s*([^#;\\r\\n]+?)\\s*$`, "gm"), nameGroup: 1, valueGroup: 2 },
  { pattern: new RegExp(`^\\s*(${NAME_PATTERN})\\s*:\\s*([^#\\r\\n]+?)\\s*$`, "gm"), nameGroup: 1, valueGroup: 2 },
  { pattern: new RegExp(`(?:^|[{,])\\s*(${NAME_PATTERN})\\s*:\\s*([^,}#\\r\\n]+)`, "gm"), nameGroup: 1, valueGroup: 2 },
  { pattern: new RegExp(`\\$\\{(${NAME_PATTERN})(?::?[-=?+])([^}]*)\\}`, "g"), nameGroup: 1, valueGroup: 2 },
  { pattern: new RegExp(`\\b(${ALIAS_PATTERN})\\b\\s*=\\s*([\"'\\\`])([^\\r\\n]*?)\\2`, "g"), nameGroup: 1, valueGroup: 3 },
  { pattern: new RegExp(`\\b(${ALIAS_PATTERN})\\b\\s*:\\s*([\"'\\\`])([^\\r\\n]*?)\\2`, "g"), nameGroup: 1, valueGroup: 3 },
];

const ALLOWED_LITERALS = [
  /^$/,
  /^<[^>]+>$/,
  /^(example|demo|test|changeme|change-me|replace-me)$/i,
  /^your[-_][a-z0-9_-]+$/i,
];

function normalizeLiteral(rawValue) {
  const value = rawValue.trim();
  const first = value[0];
  if ((first === '"' || first === "'" || first === "`") && value.at(-1) === first) {
    return value.slice(1, -1).trim();
  }
  return value;
}

function isAllowedLiteral(rawValue) {
  const value = normalizeLiteral(rawValue);
  if (ALLOWED_LITERALS.some((allowed) => allowed.test(value))) return true;
  if (new RegExp(`^process\\.env\\.(?:${NAME_PATTERN})$`).test(value)) return true;
  if (new RegExp(`^\\$(?:${NAME_PATTERN})$`).test(value)) return true;
  if (new RegExp(`^\\$\\{(?:${NAME_PATTERN})\\}$`).test(value)) return true;
  return /^\$\{\{\s*secrets\.[A-Z0-9_]+\s*(?:\}\})?$/i.test(value);
}

function findNamedCredentialLiterals(source) {
  const findings = [];

  for (const { pattern, nameGroup, valueGroup, fixedName } of LITERAL_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of source.matchAll(pattern)) {
      const rawName = fixedName ?? match[nameGroup];
      const name = CREDENTIAL_ALIASES[rawName] ?? rawName;
      const value = match[valueGroup] ?? "";
      if (!name || isAllowedLiteral(value)) continue;

      const line = source.slice(0, match.index).split("\n").length;
      findings.push({ name, line });
    }
  }

  return findings.filter(
    (finding, index, all) =>
      all.findIndex(
        (candidate) =>
          candidate.name === finding.name && candidate.line === finding.line
      ) === index
  );
}

function validateExampleEnv(source) {
  const findings = [];
  for (const [index, line] of source.split("\n").entries()) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || !SECRET_NAMES.includes(match[1])) continue;

    const [, name, rawValue] = match;
    const value = normalizeLiteral(rawValue);
    if (name === "DATABASE_URL") {
      try {
        const url = new URL(value);
        if (!/^postgres(?:ql)?:$/.test(url.protocol) || !["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
          findings.push({ name, line: index + 1 });
        }
      } catch {
        findings.push({ name, line: index + 1 });
      }
    } else if (value !== "") {
      findings.push({ name, line: index + 1 });
    }
  }
  return findings;
}

function findAddedCredentialLiterals(patch) {
  const findings = [];
  let path = null;
  let newLine = 0;
  let inHunk = false;

  for (const line of patch.split("\n")) {
    if (line.startsWith("+++ ")) {
      const rawPath = line.slice(4);
      path = rawPath === "/dev/null" ? null : rawPath.replace(/^b\//, "");
      inHunk = false;
      continue;
    }

    if (line.startsWith("@@ ")) {
      const match = line.match(/\+(\d+)/);
      newLine = match ? Number(match[1]) : 0;
      inHunk = true;
      continue;
    }

    if (!inHunk || !path) continue;
    if (line.startsWith("+") && !line.startsWith("+++")) {
      if (path !== "scripts/check-hardcoded-secrets.mjs") {
        const source = line.slice(1);
        const lineFindings = path === ".env.example"
          ? validateExampleEnv(source)
          : findNamedCredentialLiterals(source);
        for (const finding of lineFindings) {
          findings.push({ path, name: finding.name, line: newLine });
        }
      }
      newLine += 1;
    } else if (!line.startsWith("-") && !line.startsWith("\\")) {
      newLine += 1;
    }
  }

  return findings;
}

function scanHistorySince(baseCommit) {
  execFileSync("git", ["merge-base", "--is-ancestor", baseCommit, "HEAD"]);
  const commits = execFileSync(
    "git",
    ["rev-list", "--reverse", `${baseCommit}..HEAD`],
    { encoding: "utf8" }
  ).trim().split("\n").filter(Boolean);

  const findings = [];
  for (const commit of commits) {
    const patch = execFileSync(
      "git",
      ["show", "--format=", "--unified=0", "--no-ext-diff", "--no-renames", commit],
      { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 }
    );
    for (const finding of findAddedCredentialLiterals(patch)) {
      findings.push({ ...finding, commit: commit.slice(0, 12) });
    }
  }
  return findings;
}

function runSelfTest() {
  const quote = '"';
  const fixtures = [
    { source: `const ADMIN_KEY = ${quote}historical-value${quote}`, expected: "ADMIN_KEY" },
    { source: `const ADMIN = ${quote}historical-value${quote}`, expected: "ADMIN" },
    { source: `ADMIN_API_KEY: ${quote}historical-value${quote}`, expected: "ADMIN_API_KEY" },
    { source: `process.env.CRON_SECRET || ${quote}fallback-value${quote}`, expected: "CRON_SECRET" },
    { source: `process.env.CRON_SECRET ?? ${quote}fallback-value${quote}`, expected: "CRON_SECRET" },
    { source: `process.env[${quote}CRON_SECRET${quote}] ?? ${quote}fallback-value${quote}`, expected: "CRON_SECRET" },
    { source: `${quote}x-admin-api-key${quote}: ${quote}header-value${quote}`, expected: "ADMIN_API_KEY" },
    { source: `headers.set(${quote}x-admin-api-key${quote}, ${quote}header-value${quote})`, expected: "ADMIN_API_KEY" },
    { source: "export ADMIN_API_KEY=unquoted-value", expected: "ADMIN_API_KEY" },
    { source: "CRON_SECRET: unquoted-value", expected: "CRON_SECRET" },
    { source: "{ CRON_SECRET: inline-value }", expected: "CRON_SECRET" },
    { source: "${ADMIN_API_KEY:-shell-default}", expected: "ADMIN_API_KEY" },
    { source: `ADMIN_API_KEY=${quote}test-real-secret${quote}`, expected: "ADMIN_API_KEY" },
    { source: `const adminKey = ${quote}camel-case-value${quote}`, expected: "ADMIN_API_KEY" },
    { source: `cronSecret: ${quote}camel-case-value${quote}`, expected: "CRON_SECRET" },
    { source: "const ADMIN_API_KEY = process.env.ADMIN_API_KEY", expected: null },
    { source: `ADMIN_API_KEY=${quote}${quote}`, expected: null },
    { source: `ADMIN_API_KEY=${quote}replace-me${quote}`, expected: null },
    { source: `ADMIN_API_KEY=${quote}\${ADMIN_API_KEY}${quote}`, expected: null },
    { source: "export ADMIN_KEY=$ADMIN_API_KEY", expected: null },
    { source: "ADMIN_API_KEY: ${{ secrets.ADMIN_API_KEY }}", expected: null },
    { source: "ADMIN_API_KEY: ${{ secrets.PRODUCTION_ADMIN }}", expected: null },
  ];

  for (const [index, fixture] of fixtures.entries()) {
    const names = findNamedCredentialLiterals(fixture.source).map(({ name }) => name);
    if (fixture.expected ? !names.includes(fixture.expected) : names.length > 0) {
      throw new Error(
        `Hardcoded-secret guard self-test failed at fixture ${index + 1}; expected=${fixture.expected ?? "none"}, detected=${names.join(",") || "none"}`
      );
    }
  }

  const safeExample = validateExampleEnv('DATABASE_URL="postgresql://demo:demo@localhost:5432/demo"\nADMIN_API_KEY=""\n');
  const unsafeExample = validateExampleEnv('DATABASE_URL="postgresql://user:pass@db.example.com/app"\nADMIN_API_KEY="literal"\n');
  if (safeExample.length !== 0 || unsafeExample.map(({ name }) => name).sort().join(",") !== "ADMIN_API_KEY,DATABASE_URL") {
    throw new Error("Hardcoded-secret guard .env.example self-test failed");
  }

  const patchFixture = [
    "diff --git a/config.ts b/config.ts",
    "+++ b/config.ts",
    "@@ -0,0 +1,2 @@",
    '+const ADMIN_KEY = "history-value";',
    "+const safe = process.env.ADMIN_API_KEY;",
    "diff --git a/.env.example b/.env.example",
    "+++ b/.env.example",
    "@@ -0,0 +1 @@",
    '+ADMIN_API_KEY="history-value"',
  ].join("\n");
  const patchNames = findAddedCredentialLiterals(patchFixture).map(({ name }) => name);
  if (patchNames.join(",") !== "ADMIN_KEY,ADMIN_API_KEY") {
    throw new Error("Hardcoded-secret guard history parser self-test failed");
  }

  console.log("Hardcoded-secret guard self-test passed.");
}

if (process.argv.includes("--self-test")) {
  runSelfTest();
  process.exit(0);
}

const historyIndex = process.argv.indexOf("--history-since");
if (historyIndex >= 0) {
  const baseCommit = process.argv[historyIndex + 1];
  if (!baseCommit) throw new Error("--history-since requires an audited base commit");

  const historyFindings = scanHistorySince(baseCommit);
  if (historyFindings.length > 0) {
    console.error("Hardcoded named credentials were added after the audited baseline:");
    for (const { path, name, line, commit } of historyFindings) {
      console.error(`- ${path}:${line} (${name}, commit ${commit})`);
    }
    process.exit(1);
  }
  console.log(`No hardcoded named credentials were added after ${baseCommit}.`);
  process.exit(0);
}

const files = execFileSync(
  "git",
  ["ls-files", "-co", "--exclude-standard", "-z"],
  { encoding: "utf8" }
)
  .split("\0")
  .filter(Boolean)
  .filter((path) => path !== "scripts/check-hardcoded-secrets.mjs");

const findings = [];
for (const path of files) {
  let source;
  try {
    source = readFileSync(path, "utf8");
  } catch {
    continue;
  }
  if (source.includes("\0")) continue;

  if (path === ".env.example") {
    for (const finding of validateExampleEnv(source)) {
      findings.push({ path, ...finding });
    }
    continue;
  }

  for (const finding of findNamedCredentialLiterals(source)) {
    findings.push({ path, ...finding });
  }
}

if (findings.length > 0) {
  console.error("Hardcoded privileged credential literals detected:");
  for (const { path, name, line } of findings) {
    console.error(`- ${path}:${line} (${name})`);
  }
  process.exit(1);
}

console.log("No hardcoded named credential literals found in tracked or non-ignored files.");
