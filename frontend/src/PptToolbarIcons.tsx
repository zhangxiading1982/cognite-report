/** Compact metaphors matching PowerPoint's Insert ribbon. */
export function PptTextBoxIcon() {
  return <svg className="ppt-textbox-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <rect x="4" y="4" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" />
    <path d="M8 17 11.2 8h1.6L16 17M9.2 14h5.6" fill="none" stroke="currentColor" strokeWidth="1.7" />
    {[[3,3],[11,3],[19,3],[3,11],[19,11],[3,19],[11,19],[19,19]].map(([x,y]) => <rect key={`${x}-${y}`} x={x} y={y} width="2" height="2" fill="#1686d9" stroke="none" />)}
  </svg>;
}

export function PptShapesIcon() {
  return <svg className="ppt-shapes-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <rect x="3" y="4" width="12" height="12" fill="#dbeafe" stroke="#1686d9" strokeWidth="1.5" />
    <circle cx="16.5" cy="15.5" r="5" fill="#fff" stroke="currentColor" strokeWidth="1.6" />
    <rect x="2" y="3" width="2" height="2" fill="#1686d9" stroke="none" />
    <rect x="14" y="3" width="2" height="2" fill="#1686d9" stroke="none" />
  </svg>;
}
