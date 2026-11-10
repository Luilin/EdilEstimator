import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Project, WBSNode } from '../types';
import {
  addAttachment,
  deleteAttachment,
  downloadAttachment,
  formatBytes,
  listAttachments,
  ProjectAttachment,
} from '../services/attachments';
import {
  X, Paperclip, Upload, Download, Trash2, FolderOpen, Image, FileText, File, ExternalLink,
  Loader2, AlertTriangle, Cloud, Info,
} from 'lucide-react';

interface Props {
  project: Project;
  canEdit: boolean;
  canExport: boolean;
  onUpdateProject: (project: Project) => void;
  onClose: () => void;
}

type NodeOption = { id: string; path: string };

const MAX_FILE_BYTES = 100 * 1024 * 1024;

const collectNodeOptions = (root: WBSNode): NodeOption[] => {
  const options: NodeOption[] = [];
  const walk = (node: WBSNode, parentPath: string) => {
    if (node.level > 0) {
      const path = `${parentPath ? `${parentPath} · ` : ''}${node.code} ${node.name}`.trim();
      options.push({ id: node.id, path });
      node.children.forEach(child => walk(child, path));
    } else {
      node.children.forEach(child => walk(child, ''));
    }
  };
  walk(root, '');
  return options;
};

const fileIcon = (type: string, name: string) => {
  if (type.startsWith('image/')) return <Image size={18} className="text-emerald-600" />;
  if (type.includes('pdf') || /\.pdf$/i.test(name)) return <FileText size={18} className="text-red-500" />;
  if (/\.(xlsx?|csv)$/i.test(name)) return <FileText size={18} className="text-emerald-700" />;
  if (/\.(docx?|rtf)$/i.test(name)) return <FileText size={18} className="text-blue-600" />;
  return <File size={18} className="text-slate-500" />;
};

const dateLabel = (ts: number) => new Date(ts).toLocaleString('it-IT');

export const AttachmentsModal: React.FC<Props> = ({ project, canEdit, canExport, onUpdateProject, onClose }) => {
  const [attachments, setAttachments] = useState<ProjectAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nodeFilter, setNodeFilter] = useState('');
  const [uploadNodeId, setUploadNodeId] = useState('');
  const [preview, setPreview] = useState<ProjectAttachment | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cloudUrl, setCloudUrl] = useState(project.cloudFolderUrl || '');
  const inputRef = useRef<HTMLInputElement>(null);

  const nodeOptions = useMemo(() => collectNodeOptions(project.rootWBS), [project.rootWBS]);

  const load = async () => {
    setLoading(true);
    try {
      setAttachments(await listAttachments(project.id));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossibile leggere gli allegati.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  useEffect(() => {
    if (!preview) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(preview.blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [preview]);

  const filtered = useMemo(
    () => attachments.filter(item => !nodeFilter || item.nodeId === nodeFilter),
    [attachments, nodeFilter]
  );

  const attachedByNode = useMemo(() => {
    const map = new Map<string, number>();
    attachments.forEach(item => {
      if (!item.nodeId) return;
      map.set(item.nodeId, (map.get(item.nodeId) || 0) + 1);
    });
    return map;
  }, [attachments]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || !canEdit) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        if (file.size > MAX_FILE_BYTES) {
          setError(`"${file.name}" supera il limite di 100 MB.`);
          continue;
        }
        await addAttachment(project.id, file, uploadNodeId || undefined);
      }
      await load();
      if (inputRef.current) inputRef.current.value = '';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore durante il caricamento.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (attachment: ProjectAttachment) => {
    if (!canEdit) return;
    if (!window.confirm(`Eliminare l’allegato "${attachment.name}"?`)) return;
    await deleteAttachment(attachment.id);
    if (preview?.id === attachment.id) setPreview(null);
    await load();
  };

  const saveCloudUrl = () => {
    if (!canEdit) return;
    onUpdateProject({ ...project, cloudFolderUrl: cloudUrl.trim() });
  };

  const openCloudFolder = () => {
    const url = cloudUrl.trim();
    if (!/^https?:\/\//i.test(url)) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const nodeLabel = (nodeId?: string) => {
    if (!nodeId) return '';
    return nodeOptions.find(option => option.id === nodeId)?.path || 'Categoria';
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/60 p-2 backdrop-blur-sm sm:p-6">
      <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-2xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-800 bg-slate-900 px-4 py-3 text-white sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 shadow-sm">
              <Paperclip size={20} />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-base font-bold leading-tight sm:text-lg">Allegati del progetto</h2>
              <p className="truncate text-xs text-slate-300">{project.name} · {attachments.length} file</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white" aria-label="Chiudi">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-5">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-bold text-slate-800">Carica allegati</h3>
              <p className="text-xs text-slate-500">
                PDF, foto di cantiere, contratti, DURC, offerte, certificati. I file restano nel browser (IndexedDB).
              </p>

              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-slate-600">Collega a una categoria (opzionale)</span>
                <select value={uploadNodeId} disabled={!canEdit} onChange={e => setUploadNodeId(e.target.value)} className="field">
                  <option value="">— Nessun collegamento —</option>
                  {nodeOptions.map(option => (
                    <option key={option.id} value={option.id}>
                      {option.path}{attachedByNode.get(option.id) ? ` (${attachedByNode.get(option.id)})` : ''}
                    </option>
                  ))}
                </select>
              </label>

              <input
                ref={inputRef}
                type="file"
                multiple
                className="hidden"
                onChange={e => handleFiles(e.target.files)}
              />
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={!canEdit || uploading}
                className="btn btn-primary w-full"
              >
                {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                {uploading ? 'Caricamento…' : 'Seleziona file'}
              </button>

              {error && (
                <p className="flex items-start gap-1.5 rounded-lg bg-red-50 p-2 text-[11px] text-red-600">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {error}
                </p>
              )}

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                  <Cloud size={15} className="text-emerald-600" /> Cartella OneDrive / Drive
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  Incolla il link della cartella condivisa del progetto. Si apre con un clic.
                </p>
                <input
                  type="url"
                  value={cloudUrl}
                  disabled={!canEdit}
                  onChange={e => setCloudUrl(e.target.value)}
                  onBlur={saveCloudUrl}
                  placeholder="https://onedrive.live.com/..."
                  className="field mt-2 text-xs"
                />
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={saveCloudUrl} disabled={!canEdit} className="btn btn-neutral flex-1">Salva link</button>
                  <button type="button" onClick={openCloudFolder} disabled={!cloudUrl} className="btn btn-neutral flex-1">
                    <ExternalLink size={14} /> Apri
                  </button>
                </div>
              </div>
            </div>

            <div className="lg:col-span-2">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2">
                  <Paperclip size={15} className="text-slate-400" />
                  <span className="text-xs font-bold text-slate-700">{filtered.length} allegati</span>
                </div>
                <select value={nodeFilter} onChange={e => setNodeFilter(e.target.value)} className="field ml-auto h-8 w-auto min-w-[200px] py-0 text-xs">
                  <option value="">Tutte le categorie</option>
                  {nodeOptions.map(option => (
                    <option key={option.id} value={option.id}>{option.path}</option>
                  ))}
                </select>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                {loading ? (
                  <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-slate-500">
                    <Loader2 size={18} className="animate-spin" /> Caricamento allegati…
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="px-4 py-12 text-center">
                    <Paperclip size={28} className="mx-auto mb-2 text-slate-300" />
                    <p className="text-sm font-semibold text-slate-600">Nessun allegato</p>
                    <p className="text-xs text-slate-400">Carica il primo documento del progetto.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {filtered.map(attachment => (
                      <div key={attachment.id} className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-slate-50">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                          {fileIcon(attachment.type, attachment.name)}
                        </div>
                        <button
                          type="button"
                          onClick={() => setPreview(attachment)}
                          className="min-w-0 flex-1 text-left"
                          title="Anteprima"
                        >
                          <div className="truncate text-xs font-semibold text-slate-800">{attachment.name}</div>
                          <div className="truncate text-[10px] text-slate-400">
                            {formatBytes(attachment.size)} · {dateLabel(attachment.createdAt)}
                            {attachment.nodeId ? ` · ${nodeLabel(attachment.nodeId)}` : ''}
                          </div>
                        </button>
                        <button type="button" onClick={() => downloadAttachment(attachment)} disabled={!canExport} className="rounded p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-40" title="Scarica">
                          <Download size={15} />
                        </button>
                        {canEdit && (
                          <button type="button" onClick={() => handleDelete(attachment)} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Elimina">
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <p className="mt-2 flex items-start gap-1.5 text-[11px] text-slate-400">
                <Info size={13} className="mt-0.5 shrink-0" />
                Gli allegati sono salvati localmente in questo browser e non vengono inclusi nel backup JSON. Per condividerli usa la cartella cloud.
              </p>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 justify-end border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
          <button onClick={onClose} className="btn btn-neutral">Chiudi</button>
        </div>
      </div>

      {preview && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-900/80 p-3 backdrop-blur-sm" onClick={() => setPreview(null)}>
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-2.5">
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-slate-800">{preview.name}</div>
                <div className="text-[10px] text-slate-400">{formatBytes(preview.size)} · {preview.type || 'file'}</div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => downloadAttachment(preview)} disabled={!canExport} className="btn btn-neutral btn-icon" title="Scarica"><Download size={16} /></button>
                <button onClick={() => setPreview(null)} className="btn btn-neutral btn-icon" title="Chiudi"><X size={16} /></button>
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-slate-100 p-3">
              {previewUrl && preview.type.startsWith('image/') && (
                <img src={previewUrl} alt={preview.name} className="mx-auto max-h-[72vh] max-w-full rounded-lg object-contain shadow-sm" />
              )}
              {previewUrl && (preview.type.includes('pdf') || /\.pdf$/i.test(preview.name)) && (
                <iframe src={previewUrl} title={preview.name} className="h-[72vh] w-full rounded-lg border-0 bg-white" />
              )}
              {previewUrl && !preview.type.startsWith('image/') && !preview.type.includes('pdf') && !/\.pdf$/i.test(preview.name) && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <FolderOpen size={40} className="mb-3 text-slate-300" />
                  <p className="text-sm font-semibold text-slate-600">Anteprima non disponibile</p>
                  <p className="mb-3 text-xs text-slate-400">Scarica il file per aprirlo con il programma adatto.</p>
                  <button onClick={() => downloadAttachment(preview)} className="btn btn-primary"><Download size={16} /> Scarica</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
