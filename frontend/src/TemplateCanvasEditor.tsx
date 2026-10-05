import React from "react";
import { Editor } from "./Editor";

/** Reuses the document page workspace while saving edits into the template draft. */
export function TemplateCanvasEditor({
  slide,
  dataSpec,
  onChange,
  onDataChange,
  onClose,
}: {
  slide: any;
  dataSpec: any;
  onChange: (slide: any) => void;
  onDataChange?: (dataSpec: any) => void;
  onClose: () => void;
}) {
  return <Editor
    initial={slide}
    templates={[]}
    onClose={onClose}
    onOpen={() => {}}
    onExports={() => {}}
    embedded
    workspaceMode="template"
    workspaceData={dataSpec}
    onWorkspaceDataChange={onDataChange}
    initialFullscreen
    onWorkspaceClose={onClose}
    onSaved={onChange}
  />;
}
