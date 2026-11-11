import React, { useState } from 'react';
import { Project, MemberPermission, RoleType } from '../types';
import { Users, UserPlus, Shield, Check, Trash2, X, CheckCircle2, ShieldCheck, KeyRound, Mail, Copy, AlertTriangle } from 'lucide-react';

interface Props {
  project: Project;
  currentUserEmail: string;
  onSave: (updatedProject: Project) => void;
  onClose: () => void;
}

export const ROLE_PRESETS: Record<RoleType, {
  label: string;
  description: string;
  color: string;
  permissions: Omit<MemberPermission, 'email' | 'role'>;
}> = {
  admin: {
    label: 'Amministratore',
    description: 'Accesso completo, gestione utenti, permessi e modifiche libere.',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    permissions: {
      canRead: true,
      canWrite: true,
      canManageMembers: true,
      canEditSAL: true,
      canEditPriceBooks: true,
      canExport: true,
    }
  },
  geometra: {
    label: 'Geometra / Direttore Lavori',
    description: 'Gestione computo, misure, contabilità SAL e prezzari.',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    permissions: {
      canRead: true,
      canWrite: true,
      canManageMembers: false,
      canEditSAL: true,
      canEditPriceBooks: true,
      canExport: true,
    }
  },
  tecnico: {
    label: 'Tecnico / Progettista',
    description: 'Modifica struttura WBS, voci di spesa e misura.',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    permissions: {
      canRead: true,
      canWrite: true,
      canManageMembers: false,
      canEditSAL: false,
      canEditPriceBooks: true,
      canExport: true,
    }
  },
  computista: {
    label: 'Computista',
    description: 'Compilazione analitica ed inserimento da prezzari.',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    permissions: {
      canRead: true,
      canWrite: true,
      canManageMembers: false,
      canEditSAL: false,
      canEditPriceBooks: true,
      canExport: true,
    }
  },
  contabile: {
    label: 'Contabile',
    description: 'Gestione e registrazione degli Stati Avanzamento Lavori (SAL).',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    permissions: {
      canRead: true,
      canWrite: false,
      canManageMembers: false,
      canEditSAL: true,
      canEditPriceBooks: false,
      canExport: true,
    }
  },
  ditta: {
    label: 'Ditta / Fornitore',
    description: 'Compilazione offerta prezzi in bianco e tematiche ditta.',
    color: 'bg-slate-100 text-slate-700 border-slate-200',
    permissions: {
      canRead: true,
      canWrite: false, // Solo campi offerta ditta
      canManageMembers: false,
      canEditSAL: false,
      canEditPriceBooks: false,
      canExport: true,
    }
  },
  viewer: {
    label: 'Spettatore',
    description: 'Sola lettura per consultazione ed anteprima di stampa.',
    color: 'bg-slate-100 text-slate-700 border-slate-200',
    permissions: {
      canRead: true,
      canWrite: false,
      canManageMembers: false,
      canEditSAL: false,
      canEditPriceBooks: false,
      canExport: true,
    }
  },
  custom: {
    label: 'Personalizzato',
    description: 'Permessi configurati manualmente per le esigenze specifiche.',
    color: 'bg-slate-100 text-slate-800 border-slate-200',
    permissions: {
      canRead: true,
      canWrite: false,
      canManageMembers: false,
      canEditSAL: false,
      canEditPriceBooks: false,
      canExport: true,
    }
  }
};

export const TeamManagementModal: React.FC<Props> = ({ project, currentUserEmail, onSave, onClose }) => {
  const [memberPermissions, setMemberPermissions] = useState<Record<string, MemberPermission>>(() => {
    const existing = { ...(project.memberPermissions || {}) };
    
    // Legacy support: fill from collaborators if memberPermissions wasn't present
    if (project.collaborators) {
      Object.entries(project.collaborators).forEach(([email, roleStr]) => {
        if (!existing[email]) {
          let role: RoleType = 'viewer';
          if (roleStr === 'editor') role = 'geometra';
          else if (roleStr === 'ditta') role = 'ditta';
          
          existing[email] = {
            email,
            role,
            roleName: ROLE_PRESETS[role].label,
            ...ROLE_PRESETS[role].permissions,
            addedAt: Date.now()
          };
        }
      });
    }
    return existing;
  });

  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<RoleType>('geometra');
  const [customPerms, setCustomPerms] = useState<Omit<MemberPermission, 'email' | 'role'>>({
    ...ROLE_PRESETS['geometra'].permissions
  });

  const [lastAddedMember, setLastAddedMember] = useState<{ email: string; role: RoleType } | null>(null);
  const [copied, setCopied] = useState(false);

  // EmailJS Settings state
  const [showEmailSettings, setShowEmailSettings] = useState(false);
  const [emailServiceId, setEmailServiceId] = useState(() => localStorage.getItem('stimia_emailjs_service_id') || '');
  const [emailTemplateId, setEmailTemplateId] = useState(() => localStorage.getItem('stimia_emailjs_template_id') || '');
  const [emailPublicKey, setEmailPublicKey] = useState(() => localStorage.getItem('stimia_emailjs_public_key') || '');
  const [emailEnabled, setEmailEnabled] = useState(() => localStorage.getItem('stimia_emailjs_enabled') === 'true');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailStatusMessage, setEmailStatusMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const saveEmailSettings = (serviceId: string, templateId: string, publicKey: string, enabled: boolean) => {
    localStorage.setItem('stimia_emailjs_service_id', serviceId);
    localStorage.setItem('stimia_emailjs_template_id', templateId);
    localStorage.setItem('stimia_emailjs_public_key', publicKey);
    localStorage.setItem('stimia_emailjs_enabled', enabled ? 'true' : 'false');
    
    setEmailServiceId(serviceId);
    setEmailTemplateId(templateId);
    setEmailPublicKey(publicKey);
    setEmailEnabled(enabled);
    
    setEmailStatusMessage({ type: 'success', text: 'Impostazioni email salvate con successo!' });
    setTimeout(() => setEmailStatusMessage(null), 3000);
  };

  const sendEmailJSInvite = async (email: string, role: RoleType) => {
    if (!emailServiceId || !emailTemplateId || !emailPublicKey) {
      setEmailStatusMessage({ type: 'error', text: 'Per favore, configura prima le chiavi di EmailJS.' });
      return false;
    }
    setSendingEmail(true);
    setEmailStatusMessage(null);
    try {
      const roleLabel = ROLE_PRESETS[role]?.label || role;
      const appUrl = typeof window !== 'undefined' && window.location.origin ? window.location.origin : 'https://computo-henna.vercel.app';
      const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          service_id: emailServiceId,
          template_id: emailTemplateId,
          user_id: emailPublicKey,
          template_params: {
            to_email: email,
            project_name: project.name,
            role_name: roleLabel,
            invite_link: appUrl,
            reply_to: currentUserEmail,
            from_name: currentUserEmail
          }
        })
      });

      if (response.ok) {
        setEmailStatusMessage({ type: 'success', text: `Email d'invito inviata automaticamente a ${email}!` });
        setTimeout(() => setEmailStatusMessage(null), 5000);
        return true;
      } else {
        const errText = await response.text();
        console.error('EmailJS error:', errText);
        setEmailStatusMessage({ type: 'error', text: `Errore nell'invio automatico: ${errText || 'controlla le chiavi EmailJS'}` });
        return false;
      }
    } catch (error: any) {
      console.error('EmailJS error:', error);
      setEmailStatusMessage({ type: 'error', text: `Errore di connessione: ${error.message}` });
      return false;
    } finally {
      setSendingEmail(false);
    }
  };

  const persistChanges = (newPermissions: Record<string, MemberPermission>) => {
    const collaborators: Record<string, 'editor' | 'viewer' | 'ditta'> = {};
    const sharedWithEmailsSet = new Set<string>();

    (Object.entries(newPermissions) as [string, MemberPermission][]).forEach(([rawEmail, perm]) => {
      const email = rawEmail.trim();
      const emailLower = email.toLowerCase();
      sharedWithEmailsSet.add(email);
      sharedWithEmailsSet.add(emailLower);

      let simpleRole: 'editor' | 'viewer' | 'ditta' = 'viewer';
      if (perm.role === 'ditta') {
        simpleRole = 'ditta';
      } else if (perm.canWrite) {
        simpleRole = 'editor';
      }

      collaborators[email] = simpleRole;
      collaborators[emailLower] = simpleRole;
    });

    const updatedProject: Project = {
      ...project,
      memberPermissions: newPermissions,
      collaborators,
      sharedWithEmails: Array.from(sharedWithEmailsSet)
    };

    setMemberPermissions(newPermissions);
    onSave(updatedProject);
  };

  const triggerInviteEmail = (email: string, role: RoleType) => {
    const roleLabel = ROLE_PRESETS[role]?.label || role;
    const appUrl = typeof window !== 'undefined' && window.location.origin ? window.location.origin : 'https://computo-henna.vercel.app';
    const subject = encodeURIComponent(`Invito a collaborare su Stimia - ${project.name}`);
    const body = encodeURIComponent(
      `Ciao,\n\nTi ho aggiunto come collaboratore con il ruolo di "${roleLabel}" sul progetto di computo metrico "${project.name}" su Stimia.\n\nPuoi registrarti ed accedere al computo cliccando sul seguente link:\n${appUrl}\n\nUna volta registrato con questa email (${email}), vedrai automaticamente il progetto condiviso nella tua dashboard.\n\nBuon lavoro!`
    );
    const link = document.createElement('a');
    link.href = `mailto:${email}?subject=${subject}&body=${body}`;
    link.click();
  };

  const copyInviteText = (email: string, role: RoleType) => {
    const roleLabel = ROLE_PRESETS[role]?.label || role;
    const appUrl = typeof window !== 'undefined' && window.location.origin ? window.location.origin : 'https://computo-henna.vercel.app';
    const text = `Ciao! Ti ho aggiunto come collaboratore con il ruolo di "${roleLabel}" sul progetto di computo metrico "${project.name}" su Stimia.\n\nPuoi registrarti ed accedere al computo cliccando qui:\n${appUrl}\n\nRegistrati con l'indirizzo: ${email}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRoleChangeSelect = (r: RoleType) => {
    setNewRole(r);
    if (r !== 'custom') {
      setCustomPerms({ ...ROLE_PRESETS[r].permissions });
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailToUse = newEmail.trim().toLowerCase();
    if (!emailToUse) return;

    // Validazione email minima.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailToUse)) {
      setEmailStatusMessage({ type: 'error', text: 'Inserisci un indirizzo email valido.' });
      return;
    }

    // Il proprietario è già presente come amministratore.
    if (emailToUse === (currentUserEmail || '').trim().toLowerCase()) {
      setEmailStatusMessage({ type: 'error', text: 'Il proprietario è già presente come amministratore del progetto.' });
      return;
    }

    // Evita duplicati silenziosi.
    if (memberPermissions[emailToUse]) {
      setEmailStatusMessage({ type: 'error', text: 'Questo membro è già presente nel team.' });
      return;
    }

    const roleInfo = ROLE_PRESETS[newRole];
    const permObj: MemberPermission = {
      email: emailToUse,
      role: newRole,
      roleName: roleInfo.label,
      ...(newRole === 'custom' ? customPerms : roleInfo.permissions),
      addedAt: Date.now()
    };

    const updated = {
      ...memberPermissions,
      [emailToUse]: permObj
    };
    persistChanges(updated);
    setLastAddedMember({ email: emailToUse, role: newRole });
    setNewEmail('');

    // Trigger automatic email if EmailJS is enabled
    if (emailEnabled && emailServiceId && emailTemplateId && emailPublicKey) {
      await sendEmailJSInvite(emailToUse, newRole);
    }
  };

  const handleRemoveMember = (email: string) => {
    const updated = { ...memberPermissions };
    delete updated[email];
    persistChanges(updated);
    if (lastAddedMember?.email === email) {
      setLastAddedMember(null);
    }
  };

  const handleToggleMemberPerm = (email: string, permKey: keyof Omit<MemberPermission, 'email' | 'role' | 'roleName' | 'addedAt'>) => {
    const current = memberPermissions[email];
    if (!current) return;

    const updatedPerms = {
      ...current,
      [permKey]: !current[permKey],
      role: 'custom' as RoleType,
      roleName: 'Personalizzato'
    };

    const updated = {
      ...memberPermissions,
      [email]: updatedPerms
    };
    persistChanges(updated);
  };

  const handleChangeMemberRole = (email: string, targetRole: RoleType) => {
    const roleInfo = ROLE_PRESETS[targetRole];
    const updatedPerms: MemberPermission = {
      ...memberPermissions[email],
      email,
      role: targetRole,
      roleName: roleInfo.label,
      ...(targetRole === 'custom' ? ROLE_PRESETS.custom.permissions : roleInfo.permissions)
    };

    const updated = {
      ...memberPermissions,
      [email]: updatedPerms
    };
    persistChanges(updated);
  };

  const handleSaveAndClose = () => {
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-xs flex items-center justify-center z-[150] p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden border border-gray-200 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-600 rounded-lg text-white shadow-md">
              <ShieldCheck size={22} />
            </div>
            <div>
              <h3 className="font-bold text-lg leading-tight flex items-center gap-2">
                Gestione Membri & Permessi
                <span className="text-xs font-semibold bg-emerald-500/30 text-emerald-200 px-2.5 py-0.5 rounded-full border border-emerald-400/30">
                  Amministratore
                </span>
              </h3>
              <p className="text-xs text-slate-300 mt-0.5">
                Progetto: <span className="font-semibold text-white">{project.name}</span>
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">

          {/* ADD MEMBER SECTION */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h4 className="font-bold text-sm text-slate-800 flex items-center gap-2 uppercase tracking-wide text-[11px]">
                <UserPlus size={16} className="text-emerald-600" /> Aggiungi Nuovo Membro al Team
              </h4>
              <button
                type="button"
                onClick={() => setShowEmailSettings(!showEmailSettings)}
                className={`text-xs font-semibold flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-all ${
                  emailEnabled 
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' 
                    : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                }`}
              >
                <Mail size={14} className={emailEnabled ? 'text-emerald-600' : 'text-slate-400'} />
                {emailEnabled ? 'Email Automatiche: ON' : 'Email Automatiche: OFF'}
              </button>
            </div>

            {emailStatusMessage && (
              <div className={`p-3 rounded-lg text-xs font-medium border flex items-center gap-2 ${
                emailStatusMessage.type === 'success' 
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                  : 'bg-red-50 text-red-800 border-red-200'
              }`}>
                {emailStatusMessage.type === 'success' ? <CheckCircle2 size={16} className="text-emerald-600" /> : <AlertTriangle size={16} className="text-red-600" />}
                <span>{emailStatusMessage.text}</span>
              </div>
            )}

            {showEmailSettings && (
              <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-4 shadow-xs animate-fade-in text-xs">
                <div className="flex items-start justify-between">
                  <div>
                    <h5 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                      <KeyRound size={16} className="text-emerald-600" />
                      Configura Invio Email Automatico (EmailJS)
                    </h5>
                    <p className="text-slate-500 mt-1 max-w-xl">
                      Per inviare email d'invito istantanee e automatiche dal browser senza aprire Outlook o altri client sul computer, puoi utilizzare il servizio gratuito di <a href="https://www.emailjs.com/" target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline font-semibold">EmailJS.com</a>.
                    </p>
                  </div>
                  <button 
                    type="button" 
                    onClick={() => setShowEmailSettings(false)}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Service ID</label>
                    <input 
                      type="text" 
                      placeholder="es. service_xxxxxx"
                      id="emailjs-service-id"
                      defaultValue={emailServiceId}
                      className="w-full p-2 border border-slate-300 rounded text-xs bg-slate-50 focus:bg-white focus:ring-1 focus:ring-emerald-500 outline-none text-slate-950"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Template ID</label>
                    <input 
                      type="text" 
                      placeholder="es. template_xxxxxx"
                      id="emailjs-template-id"
                      defaultValue={emailTemplateId}
                      className="w-full p-2 border border-slate-300 rounded text-xs bg-slate-50 focus:bg-white focus:ring-1 focus:ring-emerald-500 outline-none text-slate-950"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Public Key (API Key)</label>
                    <input 
                      type="text" 
                      placeholder="es. xxxxxxxxxxxxxx"
                      id="emailjs-public-key"
                      defaultValue={emailPublicKey}
                      className="w-full p-2 border border-slate-300 rounded text-xs bg-slate-50 focus:bg-white focus:ring-1 focus:ring-emerald-500 outline-none text-slate-950"
                    />
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-200 p-2.5 rounded text-slate-700 text-[11px] leading-relaxed">
                  <span className="font-bold text-amber-800">Variabili del template consigliate su EmailJS:</span>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-1.5 font-mono bg-white/60 p-1.5 rounded border border-amber-100/50">
                    <div>{'{{to_email}}'} <span className="text-slate-400 font-sans block text-[9px]">Email destinatario</span></div>
                    <div>{'{{project_name}}'} <span className="text-slate-400 font-sans block text-[9px]">Nome computo</span></div>
                    <div>{'{{role_name}}'} <span className="text-slate-400 font-sans block text-[9px]">Ruolo assegnato</span></div>
                    <div>{'{{invite_link}}'} <span className="text-slate-400 font-sans block text-[9px]">Link di registrazione</span></div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-800">
                    <input 
                      type="checkbox"
                      id="emailjs-enabled"
                      defaultChecked={emailEnabled}
                      className="w-4 h-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500"
                    />
                    Attiva l'invio automatico immediato
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const serviceId = (document.getElementById('emailjs-service-id') as HTMLInputElement)?.value.trim() || '';
                      const templateId = (document.getElementById('emailjs-template-id') as HTMLInputElement)?.value.trim() || '';
                      const publicKey = (document.getElementById('emailjs-public-key') as HTMLInputElement)?.value.trim() || '';
                      const enabled = (document.getElementById('emailjs-enabled') as HTMLInputElement)?.checked || false;
                      saveEmailSettings(serviceId, templateId, publicKey, enabled);
                    }}
                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded shadow-xs"
                  >
                    Salva Impostazioni
                  </button>
                </div>
              </div>
            )}

            <form onSubmit={handleAddMember} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Email Utente</label>
                  <input 
                    type="email" 
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    placeholder="geometra@studio-tecnico.it" 
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Ruolo Predefinito</label>
                  <select 
                    value={newRole}
                    onChange={e => handleRoleChangeSelect(e.target.value as RoleType)}
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none font-medium"
                  >
                    {Object.entries(ROLE_PRESETS).map(([key, roleInfo]) => (
                      <option key={key} value={key}>{roleInfo.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Role description banner */}
              <div className="text-xs bg-emerald-50/70 border border-emerald-100 text-emerald-900 p-2.5 rounded-lg flex items-start gap-2">
                <Shield size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">{ROLE_PRESETS[newRole].label}: </span>
                  {ROLE_PRESETS[newRole].description}
                </div>
              </div>

              {/* GRANULAR PERMISSIONS CHECKLIST */}
              <div className="pt-2">
                <span className="block text-xs font-bold text-slate-700 mb-2 uppercase tracking-wider text-[10px]">
                  Permessi Dettagliati:
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  <label className="flex items-center gap-2 p-2 bg-white rounded border border-slate-200 cursor-pointer hover:bg-slate-100/80">
                    <input 
                      type="checkbox" 
                      checked={newRole === 'custom' ? customPerms.canRead : ROLE_PRESETS[newRole].permissions.canRead}
                      disabled={newRole !== 'custom'}
                      onChange={e => setCustomPerms({ ...customPerms, canRead: e.target.checked })}
                      className="rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="font-medium text-slate-800">Lettura Progetto</span>
                  </label>

                  <label className="flex items-center gap-2 p-2 bg-white rounded border border-slate-200 cursor-pointer hover:bg-slate-100/80">
                    <input 
                      type="checkbox" 
                      checked={newRole === 'custom' ? customPerms.canWrite : ROLE_PRESETS[newRole].permissions.canWrite}
                      disabled={newRole !== 'custom'}
                      onChange={e => setCustomPerms({ ...customPerms, canWrite: e.target.checked })}
                      className="rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="font-medium text-slate-800">Scrittura / Modifica</span>
                  </label>

                  <label className="flex items-center gap-2 p-2 bg-white rounded border border-slate-200 cursor-pointer hover:bg-slate-100/80">
                    <input 
                      type="checkbox" 
                      checked={newRole === 'custom' ? customPerms.canEditSAL : ROLE_PRESETS[newRole].permissions.canEditSAL}
                      disabled={newRole !== 'custom'}
                      onChange={e => setCustomPerms({ ...customPerms, canEditSAL: e.target.checked })}
                      className="rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="font-medium text-slate-800">Gestione SAL / Contabilità</span>
                  </label>

                  <label className="flex items-center gap-2 p-2 bg-white rounded border border-slate-200 cursor-pointer hover:bg-slate-100/80">
                    <input 
                      type="checkbox" 
                      checked={newRole === 'custom' ? customPerms.canEditPriceBooks : ROLE_PRESETS[newRole].permissions.canEditPriceBooks}
                      disabled={newRole !== 'custom'}
                      onChange={e => setCustomPerms({ ...customPerms, canEditPriceBooks: e.target.checked })}
                      className="rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="font-medium text-slate-800">Gestione Prezzari</span>
                  </label>

                  <label className="flex items-center gap-2 p-2 bg-white rounded border border-slate-200 cursor-pointer hover:bg-slate-100/80">
                    <input 
                      type="checkbox" 
                      checked={newRole === 'custom' ? customPerms.canManageMembers : ROLE_PRESETS[newRole].permissions.canManageMembers}
                      disabled={newRole !== 'custom'}
                      onChange={e => setCustomPerms({ ...customPerms, canManageMembers: e.target.checked })}
                      className="rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="font-medium text-slate-800">Gestione Team & Permessi</span>
                  </label>

                  <label className="flex items-center gap-2 p-2 bg-white rounded border border-slate-200 cursor-pointer hover:bg-slate-100/80">
                    <input 
                      type="checkbox" 
                      checked={newRole === 'custom' ? customPerms.canExport : ROLE_PRESETS[newRole].permissions.canExport}
                      disabled={newRole !== 'custom'}
                      onChange={e => setCustomPerms({ ...customPerms, canExport: e.target.checked })}
                      className="rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="font-medium text-slate-800">Esporta & Stampa PDF</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button 
                  type="submit"
                  className="px-5 py-2.5 bg-emerald-600 text-white rounded-lg font-bold text-xs hover:bg-emerald-700 shadow-sm flex items-center gap-2 transition-all"
                >
                  <UserPlus size={16} /> Aggiungi Membro al Team
                </button>
              </div>
            </form>

            {lastAddedMember && (
              <div className="bg-emerald-50/80 border border-emerald-200 rounded-lg p-3.5 space-y-2 text-xs mt-3 animate-fade-in">
                <div className="flex items-center gap-2 text-emerald-800 font-bold">
                  <CheckCircle2 size={16} className="text-emerald-600 animate-bounce" />
                  <span>Membro salvato in memoria (Cloud)!</span>
                </div>
                <p className="text-slate-600">
                  L'utente <b className="text-slate-900">{lastAddedMember.email}</b> è stato aggiunto come <b className="text-slate-900">{ROLE_PRESETS[lastAddedMember.role]?.label}</b>. È stata aperta la tua app di posta per inviargli l'invito.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => triggerInviteEmail(lastAddedMember.email, lastAddedMember.role)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-semibold transition-colors shadow-xs"
                  >
                    <Mail size={14} /> Apri Mail di Invito
                  </button>
                  <button
                    type="button"
                    onClick={() => copyInviteText(lastAddedMember.email, lastAddedMember.role)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded font-semibold transition-colors"
                  >
                    <Copy size={14} /> {copied ? 'Testo Copiato!' : 'Copia Testo per WhatsApp / Chat'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setLastAddedMember(null)}
                    className="px-3 py-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded font-semibold transition-colors ml-auto"
                  >
                    Nascondi Avviso
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* CURRENT MEMBERS LIST */}
          <div className="space-y-3">
            <h4 className="font-bold text-sm text-slate-800 flex items-center justify-between uppercase tracking-wide text-[11px]">
              <span className="flex items-center gap-2">
                <Users size={16} className="text-slate-600" /> Membri Correnti ({Object.keys(memberPermissions).length + 1})
              </span>
            </h4>

            {/* OWNER ROW */}
            <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-xl flex items-center justify-between text-xs">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-emerald-200 text-emerald-900 font-bold flex items-center justify-center text-xs">
                  PRO
                </div>
                <div>
                  <div className="font-bold text-slate-900 flex items-center gap-2">
                    {project.createdBy || 'Proprietario del Progetto'}
                    <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-300">
                      Proprietario
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500">Creatore del progetto. Tutti i permessi attivi.</div>
                </div>
              </div>
              <span className="text-[10px] text-emerald-700 font-bold bg-emerald-100 px-2 py-1 rounded">Controllo Totale</span>
            </div>

            {/* MEMBERS LIST */}
            {Object.keys(memberPermissions).length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-xs border border-dashed rounded-xl bg-slate-50">
                Nessun collaboratore aggiunto. Utilizza il modulo in alto per invitare membri.
              </div>
            ) : (
              <div className="space-y-2">
                {(Object.entries(memberPermissions) as [string, MemberPermission][]).map(([email, perm]) => {
                  const rolePreset = ROLE_PRESETS[perm.role] || ROLE_PRESETS.custom;
                  return (
                    <div key={email} className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-2xs hover:border-emerald-200 transition-all space-y-3">
                      
                      {/* Member Top Bar */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 font-bold flex items-center justify-center text-xs uppercase border">
                            {email.charAt(0)}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 text-xs flex items-center gap-2">
                              {email}
                              {email.toLowerCase() === currentUserEmail.toLowerCase() && (
                                <span className="text-[10px] bg-emerald-50 text-emerald-600 px-1.5 py-0.2 rounded font-medium">
                                  Tu
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-2">
                              <span>Ruolo: </span>
                              <select 
                                value={perm.role}
                                onChange={e => handleChangeMemberRole(email, e.target.value as RoleType)}
                                className="font-bold text-slate-800 bg-slate-50 border border-slate-300 rounded px-1.5 py-0.5 text-xs outline-none focus:ring-1 focus:ring-emerald-500"
                              >
                                {Object.entries(ROLE_PRESETS).map(([k, rInfo]) => (
                                  <option key={k} value={k}>{rInfo.label}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-center">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${rolePreset.color}`}>
                            {perm.roleName || rolePreset.label}
                          </span>
                          <button
                            onClick={async () => {
                              if (emailEnabled && emailServiceId && emailTemplateId && emailPublicKey) {
                                await sendEmailJSInvite(email, perm.role);
                              } else {
                                triggerInviteEmail(email, perm.role);
                              }
                            }}
                            disabled={sendingEmail}
                            className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors animate-pulse disabled:cursor-wait disabled:opacity-50"
                            title={emailEnabled ? "Reinvia email automatica (EmailJS)" : "Invia email (Client locale)"}
                          >
                            <Mail size={16} />
                          </button>
                          <button 
                            onClick={() => handleRemoveMember(email)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Rimuovi membro"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>

                      {/* Toggles for Granular Permissions */}
                      <div className="pt-2 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-1.5 text-[11px]">
                        <button
                          type="button"
                          onClick={() => handleToggleMemberPerm(email, 'canRead')}
                          className={`p-1.5 rounded flex items-center justify-between border transition-all ${
                            perm.canRead ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-slate-50 text-slate-400 border-slate-200 line-through'
                          }`}
                        >
                          <span>Lettura</span>
                          {perm.canRead ? <Check size={12}/> : <X size={12}/>}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleToggleMemberPerm(email, 'canWrite')}
                          className={`p-1.5 rounded flex items-center justify-between border transition-all ${
                            perm.canWrite ? 'bg-emerald-50 text-emerald-800 border-emerald-200 font-medium' : 'bg-slate-50 text-slate-400 border-slate-200 line-through'
                          }`}
                        >
                          <span>Scrittura</span>
                          {perm.canWrite ? <Check size={12}/> : <X size={12}/>}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleToggleMemberPerm(email, 'canEditSAL')}
                          className={`p-1.5 rounded flex items-center justify-between border transition-all ${
                            perm.canEditSAL ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-slate-50 text-slate-400 border-slate-200 line-through'
                          }`}
                        >
                          <span>SAL</span>
                          {perm.canEditSAL ? <Check size={12}/> : <X size={12}/>}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleToggleMemberPerm(email, 'canEditPriceBooks')}
                          className={`p-1.5 rounded flex items-center justify-between border transition-all ${
                            perm.canEditPriceBooks ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-slate-50 text-slate-400 border-slate-200 line-through'
                          }`}
                        >
                          <span>Prezzari</span>
                          {perm.canEditPriceBooks ? <Check size={12}/> : <X size={12}/>}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleToggleMemberPerm(email, 'canManageMembers')}
                          className={`p-1.5 rounded flex items-center justify-between border transition-all ${
                            perm.canManageMembers ? 'bg-emerald-50 text-emerald-800 border-emerald-200 font-medium' : 'bg-slate-50 text-slate-400 border-slate-200 line-through'
                          }`}
                        >
                          <span>Membri</span>
                          {perm.canManageMembers ? <Check size={12}/> : <X size={12}/>}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleToggleMemberPerm(email, 'canExport')}
                          className={`p-1.5 rounded flex items-center justify-between border transition-all ${
                            perm.canExport ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-slate-50 text-slate-400 border-slate-200 line-through'
                          }`}
                        >
                          <span>Esporta</span>
                          {perm.canExport ? <Check size={12}/> : <X size={12}/>}
                        </button>
                      </div>

                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center shrink-0">
          <div className="text-xs text-slate-500 font-medium">
            I permessi aggiornati si applicano immediatamente all'account salvato.
          </div>
          <div className="flex gap-2">
            <button 
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Annulla
            </button>
            <button 
              onClick={handleSaveAndClose}
              className="px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm transition-all flex items-center gap-1.5"
            >
              <CheckCircle2 size={16} /> Chiudi
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
