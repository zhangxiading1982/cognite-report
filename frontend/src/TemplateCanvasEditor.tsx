import React from "react";
import { Editor } from "./Editor";

/** Reuses the document page workspace while saving edits into the template draft. */
export function TemplateCanvasEditor({
  slide,
  dataSpec,
  onChange,
  onClose,
}: {
  slide: any;
  dataSpec: any;
  onChange: (slide: any) => void;
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
    initialFullscreen
    onWorkspaceClose={onClose}
    onSaved={onChange}
  />;
}
