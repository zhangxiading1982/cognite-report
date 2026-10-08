#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repository_root"

blocked_pattern='(^|/)(node_modules|dist|coverage|test-results|playwright-report|backend/var|\.cache|\.codex|\.claude|\.agents)(/|$)|\.(log|pptx|pid|sqlite|db)$'
tracked_generated="$(git ls-files | grep -E "$blocked_pattern" || true)"
if [[ -n "$tracked_generated" ]]; then
  echo "发现不应发布的已跟踪文件：" >&2
  echo "$tracked_generated" >&2
  exit 1
fi

node --input-type=module <<'NODE'
import { readFile } from "node:fs/promises";
const files = ["package.json", "backend/package.json", "frontend/package.json", "backend/packages/presentation/package.json"];
const versions = new Map();
for (const file of files) versions.set(file, JSON.parse(await readFile(file, "utf8")).version);
const unique = new Set(versions.values());
if (unique.size !== 1 || unique.has(undefined)) {
  console.error("工作区版本不一致：", Object.fromEntries(versions));
  process.exit(1);
}
console.log(`✓ 工作区版本一致：${[...unique][0]}`);
NODE

git diff --check
npm run docs:check
npm run verify

echo "发布检查通过"
