export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: any,
  ) {
    super(detail.message || `请求失败 (${status})`);
  }
}
export async function api<T = any>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const r = await fetch(`/api${path}`, {
    ...init,
    headers: {
      ...(init.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...init.headers,
    },
  });
  if (!r.ok) {
    if(r.status===401&&!path.startsWith("/auth/"))window.dispatchEvent(new Event("slidebi:unauthorized"));
    throw new ApiError(
      r.status,
      await r.json().catch(() => ({ message: r.statusText })),
    );
  }
  return r.status === 204 ? (undefined as T) : r.json();
}
export const post = (path: string, body: any = {}) =>
  api(path, {
    method: "POST",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify(body),
  });
export const saveSlide = (slide: any, revision: number) =>
  api(`/slides/${slide.id}`, {
    method: "PUT",
    headers: { "If-Match": String(revision) },
    body: JSON.stringify(slide),
  });
export type BindingRoleConstraint = {label:string;types:string[];multiple:boolean;min?:number;max?:number;requiresMeasure?:boolean};
export type Template = {
  id: string;
  version: number;
  name: string;
  scene: string;
  favorite?: boolean;
  chartType?: string;
  bindingSchema?: Record<string,{roles:Record<string,BindingRoleConstraint>}>;
  requiredBindings?: Record<string,{roles?:string[];roleConstraints?:Record<string,BindingRoleConstraint>}>;
  slide?: any;
};
export type ExportJob = {
  id: string;
  slideId: string;
  revision: number;
  state: string;
  deliveryMode: string;
  error?: any;
  createdAt?: string;
};
