import React, { useEffect, useMemo, useState } from "react";
import { ChevronRight, Folder, Image, Search, Shapes, Smile } from "lucide-react";
import { api } from "./api";
import { Modal } from "./ui";
import "./asset-library.css";

const kinds = [["icon", "图标"], ["vector", "矢量图"], ["image", "图片"]] as const;

function KindIcon({ kind }: { kind: string }) {
  const Icon = kind === "icon" ? Smile : kind === "vector" ? Shapes : Image;
  return <Icon size={16} aria-label={kinds.find(item => item[0] === kind)?.[1] ?? "图片"} />;
}

function FolderTree({ folders, value, onChange }: { folders: any[]; value: string | null; onChange: (id: string | null) => void }) {
  const children = (parentId: string | null) => folders.filter(folder => (folder.parentId ?? null) === parentId);
  const branch = (parentId: string | null): React.ReactNode => (
    <ul>
      {children(parentId).map(folder => (
        <li key={folder.id} role="treeitem" aria-selected={value === folder.id}>
          <button className={value === folder.id ? "selected" : ""} aria-label={`打开目录 ${folder.name}`} onClick={() => onChange(folder.id)}>
            <ChevronRight size={13} />
            <Folder size={15} />
            <span>{folder.name}</span>
          </button>
          {branch(folder.id)}
        </li>
      ))}
    </ul>
  );
  return (
    <nav className="asset-picker-tree" role="tree" aria-label="资源目录">
      <button className={value === null ? "selected" : ""} aria-label="打开根目录" onClick={() => onChange(null)}>
        <Folder size={15} />
        <span>/</span>
      </button>
      {branch(null)}
    </nav>
  );
}

function folderPath(folders: any[], folderId: string | null) {
  const names: string[] = [];
  let current = folders.find(folder => folder.id === folderId);
  while (current) {
    names.unshift(current.name);
    current = folders.find(folder => folder.id === current.parentId);
  }
  return `/${names.join("/")}`;
}

/** A deliberately read-only view used by the page editor. Resource mutations stay in the resource library. */
export function AssetPicker({ onSelect }: { onSelect: (asset: any) => void }) {
  const [assets, setAssets] = useState<any[]>([]);
  const [folders, setFolders] = useState<any[]>([]);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("");
  const [selected, setSelected] = useState<any>();
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api("/assets"), api("/folders?kind=assets")])
      .then(([assetResult, folderResult]) => {
        setAssets(assetResult.items ?? []);
        setFolders(folderResult.items ?? []);
      })
      .catch(problem => setError(problem.message));
  }, []);

  const visible = useMemo(
    () => assets.filter(asset => (asset.folderId ?? null) === folderId && asset.name?.includes(search) && (!kind || asset.kind === kind)),
    [assets, folderId, kind, search],
  );

  return (
    <section className="asset-library asset-library-refined asset-picker">
      <div className="asset-picker-layout">
        <FolderTree folders={folders} value={folderId} onChange={setFolderId} />
        <div className="asset-picker-content">
          <p className="asset-picker-path">{folderPath(folders, folderId)}</p>
          <div className="asset-filterbar">
            <div className="row">
              <button className={!kind ? "active" : ""} onClick={() => setKind("")}>全部</button>
              {kinds.map(([id, label]) => <button key={id} className={kind === id ? "active" : ""} onClick={() => setKind(id)}>{label}</button>)}
            </div>
            <label className="search">
              <Search size={16} />
              <input aria-label="搜索图片" placeholder="当前目录按名称搜索" value={search} onChange={event => setSearch(event.target.value)} />
            </label>
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="media-grid">
            {visible.map(asset => (
              <article className="media-card" key={asset.id}>
                <button className={`media-thumbnail ${asset.kind !== "image" ? "is-icon" : ""}`} aria-label={asset.name} onClick={() => setSelected(asset)}>
                  <img src={asset.url || `/api/assets/${asset.id}/file`} alt={asset.name} />
                </button>
                <div className="media-info"><KindIcon kind={asset.kind} /><h3>{asset.name}</h3></div>
                <button aria-label={`插入 ${asset.name}`} onClick={() => onSelect(asset)}>插入页面</button>
              </article>
            ))}
          </div>
          {!visible.length && <p className="empty">当前目录暂无匹配资源。</p>}
        </div>
      </div>
      {selected && (
        <Modal title={selected.name} wide onClose={() => setSelected(undefined)}>
          <div className="media-large"><img src={selected.url || `/api/assets/${selected.id}/file`} alt={`${selected.name} 预览`} /></div>
          <button className="primary" onClick={() => { onSelect(selected); setSelected(undefined); }}>插入此素材</button>
        </Modal>
      )}
    </section>
  );
}
