#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repository_root"

if [[ "${1:-}" == "--help" ]]; then
  cat <<'EOF'
用法：scripts/bootstrap-development.sh [--skip-install] [--without-test-db]

默认检查环境、按锁文件安装 Node.js 依赖、初始化开发/测试数据库，
并写入可重复生成的主题、模板、目录与内置资源数据。
EOF
  exit 0
fi

skip_install=false
with_test=true
for argument in "$@"; do
  case "$argument" in
    --skip-install) skip_install=true ;;
    --without-test-db) with_test=false ;;
    *) echo "未知参数：${argument}" >&2; exit 2 ;;
  esac
done

npm run env:check
if [[ "$skip_install" == false ]]; then
  npm ci
fi

if [[ "$with_test" == true ]]; then
  npm run db:init -- --with-test
else
  npm run db:init
fi
npm run db:seed

echo "初始化完成。运行 npm run dev，然后打开 http://127.0.0.1:5173。"
