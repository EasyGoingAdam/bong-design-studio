'use client';

import { useState, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { useToast } from './toast';

interface Profile {
  id: string;
  email: string;
  name: string;
  role: string;
  created_at: string;
}

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { openAIKey, setOpenAIKey, currentUser, setCurrentUserName } = useAppStore();
  const { toast } = useToast();
  const [key, setKey] = useState(openAIKey);
  const [name, setName] = useState(currentUser.name);
  const [activeSection, setActiveSection] = useState<'general' | 'team'>('general');

  // Team management
  const [teamMembers, setTeamMembers] = useState<Profile[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('designer');
  const [inviting, setInviting] = useState(false);
  const [loadingTeam, setLoadingTeam] = useState(false);

  const isAdmin = currentUser.role === 'admin';

  useEffect(() => {
    if (isAdmin && activeSection === 'team') {
      setLoadingTeam(true);
      fetch('/api/auth/users')
        .then(res => res.json())
        .then(data => setTeamMembers(data || []))
        .catch(console.error)
        .finally(() => setLoadingTeam(false));
    }
  }, [isAdmin, activeSection]);

  const handleSave = () => {
    setOpenAIKey(key);
    setCurrentUserName(name);
    toast('Settings saved', 'success');
    onClose();
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      const res = await fetch('/api/auth/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast(`Invite sent to ${inviteEmail}`, 'success');
      setInviteEmail('');
      // Refresh team list
      const usersRes = await fetch('/api/auth/users');
      setTeamMembers(await usersRes.json());
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to invite', 'error');
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveUser = async (userId: string, email: string) => {
    if (!window.confirm(`Remove ${email} from the team?`)) return;
    try {
      const res = await fetch('/api/auth/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) throw new Error('Failed to remove user');
      setTeamMembers(prev => prev.filter(m => m.id !== userId));
      toast(`${email} removed`, 'success');
    } catch {
      toast('Failed to remove user', 'error');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 modal-backdrop z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface border border-border rounded-xl w-full max-w-lg p-6 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button onClick={onClose} className="text-muted hover:text-foreground text-lg">×</button>
        </div>

        {/* Section Tabs */}
        <div className="flex gap-1 border-b border-border mb-4">
          <button
            onClick={() => setActiveSection('general')}
            className={`px-3 py-2 text-sm relative ${activeSection === 'general' ? 'text-accent' : 'text-muted hover:text-foreground'}`}
          >
            General
            {activeSection === 'general' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-full" />}
          </button>
          {isAdmin && (
            <button
              onClick={() => setActiveSection('team')}
              className={`px-3 py-2 text-sm relative ${activeSection === 'team' ? 'text-accent' : 'text-muted hover:text-foreground'}`}
            >
              Team Members
              {activeSection === 'team' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-full" />}
            </button>
          )}
        </div>

        {activeSection === 'general' && (
          <div className="space-y-4">
            {/* Current user info */}
            <div className="bg-background border border-border rounded-lg p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center text-white font-bold text-sm">
                {currentUser.avatar}
              </div>
              <div>
                <div className="text-sm font-medium">{currentUser.name}</div>
                <div className="text-xs text-muted capitalize">{currentUser.role}</div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted mb-1.5">Display Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-muted mb-1.5">OpenAI API Key</label>
              <input
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="sk-..."
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
              />
              <p className="text-xs text-muted mt-1">Used for AI image generation and brainstorm. Stored securely on the server.</p>
            </div>

            <div className="flex justify-between pt-2">
              <button
                onClick={handleSignOut}
                className="px-4 py-2 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
              >
                Sign Out
              </button>
              <div className="flex gap-2">
                <button onClick={onClose} className="px-4 py-2 text-sm text-muted hover:text-foreground transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'team' && isAdmin && (
          <div className="space-y-4">
            {/* Invite form */}
            <div className="bg-background border border-border rounded-lg p-3 space-y-3">
              <h3 className="text-sm font-semibold">Invite Team Member</h3>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="email@company.com"
                  className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                />
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="bg-surface border border-border rounded-lg px-2 py-2 text-sm"
                >
                  <option value="designer">Designer</option>
                  <option value="reviewer">Reviewer</option>
                  <option value="admin">Admin</option>
                </select>
                <button
                  onClick={handleInvite}
                  disabled={inviting || !inviteEmail.trim()}
                  className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm rounded-lg disabled:opacity-50"
                >
                  {inviting ? '...' : 'Invite'}
                </button>
              </div>
              <p className="text-xs text-muted">They'll receive an email to set their password and access the app.</p>
            </div>

            {/* Team list */}
            <div>
              <h3 className="text-sm font-semibold mb-2">Team ({teamMembers.length})</h3>
              {loadingTeam ? (
                <p className="text-sm text-muted text-center py-4">Loading...</p>
              ) : (
                <div className="space-y-2">
                  {teamMembers.map((member) => (
                    <div key={member.id} className="flex items-center justify-between bg-background border border-border rounded-lg p-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-bold">
                          {(member.name || member.email[0]).split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                        </div>
                        <div>
                          <div className="text-sm font-medium">{member.name || member.email}</div>
                          <div className="text-xs text-muted">{member.email}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted capitalize bg-border/50 px-2 py-0.5 rounded">{member.role}</span>
                        {member.id !== currentUser.id && (
                          <button
                            onClick={() => handleRemoveUser(member.id, member.email)}
                            className="text-xs text-red-500 hover:text-red-700 px-2 py-1"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
