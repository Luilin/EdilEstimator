import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, X } from 'lucide-react';

export interface ToolbarMenuItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  badge?: string | number;
  tone?: 'default' | 'primary' | 'danger';
}

export interface ToolbarMenuSection {
  title: string;
  items: ToolbarMenuItem[];
}

interface Props {
  label: string;
  icon: React.ReactNode;
  title?: string;
  sections: ToolbarMenuSection[];
  buttonClassName?: string;
}

const toneClasses: Record<NonNullable<ToolbarMenuItem['tone']>, string> = {
  default: 'hover:bg-slate-50',
  primary: 'hover:bg-emerald-50 hover:text-emerald-800',
  danger: 'hover:bg-red-50 text-red-600',
};

export const ToolbarMenu: React.FC<Props> = ({ label, icon, title, sections, buttonClassName = '' }) => {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const openMenu = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    const width = Math.min(window.innerWidth - 16, 460);
    const left = rect ? Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)) : 8;
    const top = rect ? rect.bottom + 8 : 64;
    setPosition({
      top,
      left,
      width,
      maxHeight: Math.max(220, window.innerHeight - top - 16),
    });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const runItem = (item: ToolbarMenuItem) => {
    if (item.disabled) return;
    setOpen(false);
    item.onClick();
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        className={`btn btn-neutral shrink-0 ${open ? '!border-emerald-200 !bg-emerald-50 !text-emerald-700' : ''} ${buttonClassName}`}
        title={title || label}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {icon}
        <span>{label}</span>
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && position && createPortal(
        <>
          <div className="fixed inset-0 z-[110] bg-slate-900/20 backdrop-blur-[1px]" onClick={() => setOpen(false)} />
          <div
            role="menu"
            aria-label={title || label}
            className="fixed z-[120] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
            style={{
              top: position.top,
              left: position.left,
              width: position.width,
              maxHeight: position.maxHeight,
            }}
          >
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{title || label}</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded p-1 text-slate-400 transition-colors hover:bg-white hover:text-slate-700"
                aria-label="Chiudi menu"
              >
                <X size={15} />
              </button>
            </div>

            <div className="overflow-y-auto p-2" style={{ maxHeight: position.maxHeight - 40 }}>
              {sections.map(section => (
                <div key={section.title} className="mb-2 last:mb-0">
                  <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    {section.title}
                  </div>
                  <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
                    {section.items.map(item => (
                      <button
                        key={item.id}
                        type="button"
                        role="menuitem"
                        onClick={() => runItem(item)}
                        disabled={item.disabled}
                        className={`flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${toneClasses[item.tone || 'default']}`}
                      >
                        <span className="mt-0.5 shrink-0 text-emerald-600">{item.icon}</span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                            <span className="truncate">{item.label}</span>
                            {item.badge !== undefined && item.badge !== 0 && (
                              <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold leading-none text-emerald-700">
                                {item.badge}
                              </span>
                            )}
                          </span>
                          {item.description && (
                            <span className="mt-0.5 block text-[10px] leading-snug text-slate-400">{item.description}</span>
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  );
};
