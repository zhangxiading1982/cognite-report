#!/usr/bin/env bash
set -euo pipefail

required_node_major=22
required_npm_major=10
required_postgres_major=16
failed=0

check_version() {
  local command_name="$1"
  local version_command="$2"
  local required_major="$3"
  local install_hint="$4"

  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "缺少 ${command_name}。${install_hint}" >&2
    failed=1
    return
  fi

  local version
  version="$($version_command 2>/dev/null | head -n 1)"
  local major
  major="$(printf '%s' "$version" | sed -E 's/^[^0-9]*([0-9]+).*/\1/')"
  if [[ ! "$major" =~ ^[0-9]+$ ]] || (( major < required_major )); then
    echo "${command_name} 版本不符合要求：${version}，需要 ${required_major}+。${install_hint}" >&2
    failed=1
    return
  fi
  echo "✓ ${command_name}: ${version}"
}

check_version node "node --version" "$required_node_major" "建议使用 nvm install 22。"
check_version npm "npm --version" "$required_npm_major" "Node.js 22 自带兼容 npm，也可运行 npm install -g npm@10。"
check_version psql "psql --version" "$required_postgres_major" "macOS 可运行 brew install postgresql@16；Ubuntu 可安装 postgresql-16。"

if command -v pg_isready >/dev/null 2>&1; then
  if pg_isready -q; then
    echo "✓ PostgreSQL 服务可连接"
  else
    echo "PostgreSQL 客户端已安装，但本地服务尚不可连接。请先启动 PostgreSQL。" >&2
    failed=1
  fi
fi

if (( failed )); then
  exit 1
fi

echo "SlideBI 开发环境依赖检查通过"
