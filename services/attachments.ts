import { idbDelete, idbDeleteMany, idbGetAllByIndex, idbPut, STORE_ATTACHMENTS } from './idb';

export interface ProjectAttachment {
  id: string;
  projectId: string;
  nodeId?: string;
  name: string;
  type: string;
  size: number;
  blob: Blob;
  createdAt: number;
  notes?: string;
}

const makeId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `att_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, index);
  return `${value.toLocaleString('it-IT', { maximumFractionDigits: index === 0 ? 0 : 1 })} ${units[index]}`;
}

export async function listAttachments(projectId: string): Promise<ProjectAttachment[]> {
  const items = await idbGetAllByIndex<ProjectAttachment>(STORE_ATTACHMENTS, 'projectId', projectId);
  return items.sort((a, b) => b.createdAt - a.createdAt);
}

export async function addAttachment(
  projectId: string,
  file: File,
  nodeId?: string
): Promise<ProjectAttachment> {
  const attachment: ProjectAttachment = {
    id: makeId(),
    projectId,
    nodeId,
    name: file.name || 'allegato',
    type: file.type || 'application/octet-stream',
    size: file.size,
    blob: file,
    createdAt: Date.now(),
  };
  await idbPut(STORE_ATTACHMENTS, attachment);
  return attachment;
}

export async function deleteAttachment(id: string): Promise<void> {
  await idbDelete(STORE_ATTACHMENTS, id);
}

export async function deleteProjectAttachments(projectId: string): Promise<void> {
  const attachments = await listAttachments(projectId);
  await idbDeleteMany(STORE_ATTACHMENTS, attachments.map(item => item.id));
}

export function downloadAttachment(attachment: ProjectAttachment): void {
  const url = URL.createObjectURL(attachment.blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = attachment.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}
