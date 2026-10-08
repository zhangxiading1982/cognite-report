import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const directories = ["docs"];
const entryFiles = ["README.md", "CONTRIBUTING.md", "SECURITY.md", "CHANGELOG.md"];

async function markdownFiles(directory) {
  const entries = await readdir(path.join(root, directory), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await markdownFiles(relative));
    else if (entry.name.endsWith(".md")) files.push(relative);
  }
  return files;
}

const files = [
  ...entryFiles.filter(file => file !== "CHANGELOG.md"),
  ...await markdownFiles(directories[0]),
];
try {
  await readFile(path.join(root, "CHANGELOG.md"));
  files.push("CHANGELOG.md");
} catch {}

const missing = [];
for (const file of files) {
  const markdown = await readFile(path.join(root, file), "utf8");
  for (const match of markdown.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].split("#", 1)[0].trim();
    if (!target || /^(https?:|mailto:)/.test(target)) continue;
    const resolved = path.resolve(root, path.dirname(file), decodeURIComponent(target));
    try { await readFile(resolved); }
    catch { missing.push(`${file} -> ${target}`); }
  }
}

if (missing.length) {
  console.error(`发现失效的本地文档链接：\n${missing.join("\n")}`);
  process.exit(1);
}
console.log(`文档链接检查通过：${files.length} 个 Markdown 文件`);
