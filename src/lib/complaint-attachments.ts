export type ComplaintAttachmentKind = "image" | "video";

export type StoredComplaintAttachment = {
  kind: ComplaintAttachmentKind;
  path: string;
  name?: string;
};

const ATTACHMENTS_START = "[[netspas:attachments]]";
const ATTACHMENTS_END = "[[/netspas:attachments]]";
const ATTACHMENTS_RE = /\n*\[\[netspas:attachments\]\]\s*([\s\S]*?)\s*\[\[\/netspas:attachments\]\]/m;

function cleanAttachment(input: unknown): StoredComplaintAttachment | null {
  if (!input || typeof input !== "object") return null;
  const item = input as Partial<StoredComplaintAttachment>;
  if (item.kind !== "image" && item.kind !== "video") return null;
  if (typeof item.path !== "string" || item.path.length < 3) return null;
  return {
    kind: item.kind,
    path: item.path,
    name: typeof item.name === "string" && item.name.trim() ? item.name.trim() : undefined,
  };
}

export function appendComplaintAttachmentBlock(
  description: string,
  attachments: StoredComplaintAttachment[],
) {
  const unique = new Map<string, StoredComplaintAttachment>();
  for (const attachment of attachments) {
    const clean = cleanAttachment(attachment);
    if (clean) unique.set(clean.path, clean);
  }
  const list = [...unique.values()];
  if (list.length === 0) return description;
  return `${description}\n\n${ATTACHMENTS_START}\n${JSON.stringify(list)}\n${ATTACHMENTS_END}`;
}

export function parseComplaintAttachments(description: string | null | undefined): StoredComplaintAttachment[] {
  if (!description) return [];
  const match = description.match(ATTACHMENTS_RE);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[1]) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(cleanAttachment).filter((item): item is StoredComplaintAttachment => Boolean(item));
  } catch {
    return [];
  }
}

export function stripComplaintAttachmentBlock(description: string | null | undefined) {
  return (description ?? "").replace(ATTACHMENTS_RE, "").trim();
}

export function isAiEscalatedComplaint(description: string | null | undefined) {
  return (description ?? "").startsWith("Обращение из чата с ИИ.");
}