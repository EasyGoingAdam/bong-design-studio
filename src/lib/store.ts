import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import {
  Concept,
  ConceptStatus,
  SpecTemplate,
  User,
  Comment,
  ApprovalLog,
  ConceptVersion,
  AIGenerationRecord,
  ManufacturingRecord,
} from './types';
import { sampleUsers } from './sample-data';

interface AppState {
  concepts: Concept[];
  templates: SpecTemplate[];
  users: User[];
  currentUser: User;
  openAIKey: string;
  geminiKey: string;
  loading: boolean;
  initialized: boolean;

  // Init
  initialize: () => Promise<void>;

  // Concept CRUD
  addConcept: (concept: Partial<Concept>) => Promise<Concept>;
  updateConcept: (id: string, updates: Partial<Concept>) => Promise<void>;
  deleteConcept: (id: string) => Promise<void>;
  duplicateConcept: (id: string) => Promise<Concept>;
  moveConcept: (id: string, status: ConceptStatus) => void;

  // Comments
  addComment: (conceptId: string, text: string) => void;

  // Approvals
  addApproval: (conceptId: string, action: ApprovalLog['action'], notes: string, fromStage?: ConceptStatus, toStage?: ConceptStatus) => void;

  // Versions
  addVersion: (conceptId: string, version: Partial<ConceptVersion>) => void;

  // AI Generations
  addAIGeneration: (conceptId: string, record: Partial<AIGenerationRecord>) => void;

  // Manufacturing
  updateManufacturing: (conceptId: string, record: Partial<ManufacturingRecord>) => void;

  // Templates
  addTemplate: (template: Partial<SpecTemplate>) => void;
  updateTemplate: (id: string, updates: Partial<SpecTemplate>) => void;
  deleteTemplate: (id: string) => void;

  // Auth
  setAuthUser: (userId: string, email: string) => void;

  // Settings
  setOpenAIKey: (key: string) => void;
  setGeminiKey: (key: string) => void;
  setCurrentUserName: (name: string) => void;

  // Refresh from server
  refreshConcepts: () => Promise<void>;
}

// Helper to sync a concept update to the API (fire-and-forget for speed)
async function syncConceptToAPI(concept: Concept) {
  try {
    await fetch(`/api/concepts/${concept.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(concept),
    });
  } catch (err) {
    console.error('Failed to sync concept:', err);
  }
}

// Helper to save a setting to the server
async function saveSetting(key: string, value: string) {
  try {
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value }),
    });
  } catch (err) {
    console.error('Failed to save setting:', err);
  }
}

export const useAppStore = create<AppState>()((set, get) => ({
  concepts: [],
  templates: [],
  users: sampleUsers,
  currentUser: sampleUsers[0],
  openAIKey: '',
  geminiKey: '',
  loading: false,
  initialized: false,

  setAuthUser: (userId, email) => {
    // Load profile from Supabase
    fetch(`/api/auth/users`).then(res => res.json()).then(profiles => {
      const profile = (profiles || []).find((p: { id: string }) => p.id === userId);
      if (profile) {
        set({
          currentUser: {
            id: profile.id,
            name: profile.name || email.split('@')[0],
            role: profile.role || 'designer',
            avatar: (profile.name || email.split('@')[0]).split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2),
          },
        });
      } else {
        set({
          currentUser: {
            id: userId,
            name: email.split('@')[0],
            role: 'designer',
            avatar: email[0].toUpperCase(),
          },
        });
      }
    }).catch(console.error);
  },

  initialize: async () => {
    if (get().initialized) return;
    set({ loading: true });
    try {
      // Fetch concepts, templates, and settings from API in parallel
      const [conceptsRes, templatesRes, settingsRes] = await Promise.all([
        fetch('/api/concepts'),
        fetch('/api/templates'),
        fetch('/api/settings'),
      ]);

      if (conceptsRes.ok) {
        const conceptsData = await conceptsRes.json();
        set({ concepts: conceptsData });
      }

      if (templatesRes.ok) {
        const templatesData = await templatesRes.json();
        if (templatesData.length > 0) {
          set({ templates: templatesData });
        }
      }

      // Load settings from server
      if (settingsRes.ok) {
        const settings = await settingsRes.json();
        if (settings.openai_key) {
          set({ openAIKey: settings.openai_key });
        }
        if (settings.gemini_key) {
          set({ geminiKey: settings.gemini_key });
        }
        if (settings.user_name) {
          const name = settings.user_name;
          set({
            currentUser: {
              ...get().currentUser,
              name,
              avatar: name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2),
            },
          });
        }
      }
    } catch (err) {
      console.error('Failed to initialize from API:', err);
    } finally {
      set({ loading: false, initialized: true });
    }
  },

  refreshConcepts: async () => {
    try {
      const res = await fetch('/api/concepts');
      if (res.ok) {
        const data = await res.json();
        set({ concepts: data });
      }
    } catch (err) {
      console.error('Failed to refresh concepts:', err);
    }
  },

  addConcept: async (partial) => {
    const now = new Date().toISOString();
    const concept: Concept = {
      id: uuidv4(),
      name: partial.name || 'Untitled Concept',
      collection: partial.collection || '',
      status: partial.status || 'ideation',
      createdAt: now,
      updatedAt: now,
      designer: get().currentUser.name,
      tags: partial.tags || [],
      description: partial.description || '',
      intendedAudience: partial.intendedAudience || '',
      manufacturingNotes: partial.manufacturingNotes || '',
      marketingStory: partial.marketingStory || '',
      coilImageUrl: partial.coilImageUrl || '',
      baseImageUrl: partial.baseImageUrl || '',
      combinedImageUrl: partial.combinedImageUrl || '',
      specs: partial.specs || {
        designStyleName: '',
        designTheme: '',
        patternDensity: 'medium',
        laserComplexity: 3,
        estimatedEtchingTime: '',
        surfaceCoverage: 50,
        lineThickness: '',
        bwContrastGuidance: '',
        symmetryRequirement: 'none',
        coordinationMode: 'thematic',
        productionFeasibility: 3,
        riskNotes: '',
        baseShape: 'circle',
      },
      coilSpecs: partial.coilSpecs || { dimensions: '', printableArea: '', notes: '' },
      baseSpecs: partial.baseSpecs || { dimensions: '', printableArea: '', notes: '' },
      priority: partial.priority || 'medium',
      lifecycleType: partial.lifecycleType || 'evergreen',
      versions: [],
      comments: [],
      approvalLogs: [],
      aiGenerations: [],
      ...partial,
    };

    // Optimistic update
    set((state) => ({ concepts: [...state.concepts, concept] }));

    // Persist to API
    try {
      await fetch('/api/concepts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(concept),
      });
    } catch (err) {
      console.error('Failed to save concept to API:', err);
    }

    return concept;
  },

  updateConcept: async (id, updates) => {
    set((state) => ({
      concepts: state.concepts.map((c) =>
        c.id === id ? { ...c, ...updates, updatedAt: new Date().toISOString() } : c
      ),
    }));

    // Send just the updates to the API, not the full concept
    try {
      await fetch(`/api/concepts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
    } catch (err) {
      console.error('Failed to update concept:', err);
    }
  },

  deleteConcept: async (id) => {
    set((state) => ({ concepts: state.concepts.filter((c) => c.id !== id) }));
    try {
      await fetch(`/api/concepts/${id}`, { method: 'DELETE' });
    } catch (err) {
      console.error('Failed to delete concept:', err);
    }
  },

  duplicateConcept: async (id) => {
    const original = get().concepts.find((c) => c.id === id);
    if (!original) throw new Error('Concept not found');
    // Deep-copy all nested objects to avoid shared references
    const newConcept = await get().addConcept({
      name: `${original.name} (Copy)`,
      collection: original.collection,
      status: 'ideation',
      designer: get().currentUser.name,
      tags: [...original.tags],
      description: original.description,
      intendedAudience: original.intendedAudience,
      manufacturingNotes: original.manufacturingNotes,
      coilImageUrl: original.coilImageUrl,
      baseImageUrl: original.baseImageUrl,
      combinedImageUrl: original.combinedImageUrl,
      priority: original.priority,
      lifecycleType: original.lifecycleType,
      specs: { ...original.specs },
      coilSpecs: { ...original.coilSpecs },
      baseSpecs: { ...original.baseSpecs },
      versions: [],
      comments: [],
      approvalLogs: [],
      aiGenerations: [],
    });
    return newConcept;
  },

  moveConcept: (id, status) => {
    const concept = get().concepts.find((c) => c.id === id);
    if (!concept) return;
    const fromStage = concept.status;
    get().updateConcept(id, { status });
    get().addApproval(id, 'moved_stage', `Moved from ${fromStage} to ${status}`, fromStage, status);
  },

  addComment: (conceptId, text) => {
    const comment: Comment = {
      id: uuidv4(),
      conceptId,
      userId: get().currentUser.id,
      userName: get().currentUser.name,
      text,
      createdAt: new Date().toISOString(),
    };
    set((state) => ({
      concepts: state.concepts.map((c) =>
        c.id === conceptId ? { ...c, comments: [...c.comments, comment] } : c
      ),
    }));
    // Persist
    fetch(`/api/concepts/${conceptId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(comment),
    }).catch(console.error);
  },

  addApproval: (conceptId, action, notes, fromStage, toStage) => {
    const log: ApprovalLog = {
      id: uuidv4(),
      conceptId,
      userId: get().currentUser.id,
      userName: get().currentUser.name,
      action,
      fromStage,
      toStage,
      notes,
      createdAt: new Date().toISOString(),
    };
    set((state) => ({
      concepts: state.concepts.map((c) =>
        c.id === conceptId ? { ...c, approvalLogs: [...c.approvalLogs, log] } : c
      ),
    }));
    fetch(`/api/concepts/${conceptId}/approvals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(log),
    }).catch(console.error);
  },

  addVersion: (conceptId, version) => {
    const concept = get().concepts.find((c) => c.id === conceptId);
    if (!concept) return;
    const ver: ConceptVersion = {
      id: uuidv4(),
      conceptId,
      versionNumber: concept.versions.length + 1,
      coilImageUrl: version.coilImageUrl || '',
      baseImageUrl: version.baseImageUrl || '',
      combinedImageUrl: version.combinedImageUrl || '',
      prompt: version.prompt,
      notes: version.notes || '',
      createdAt: new Date().toISOString(),
    };
    set((state) => ({
      concepts: state.concepts.map((c) =>
        c.id === conceptId ? { ...c, versions: [...c.versions, ver] } : c
      ),
    }));
    fetch(`/api/concepts/${conceptId}/versions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ver),
    }).catch(console.error);
  },

  addAIGeneration: (conceptId, record) => {
    const gen: AIGenerationRecord = {
      id: uuidv4(),
      conceptId,
      prompt: record.prompt || '',
      coilPrompt: record.coilPrompt || '',
      basePrompt: record.basePrompt || '',
      mode: record.mode || 'concept_art',
      coilImageUrl: record.coilImageUrl || '',
      baseImageUrl: record.baseImageUrl || '',
      combinedImageUrl: record.combinedImageUrl || '',
      createdAt: new Date().toISOString(),
      variationOf: record.variationOf,
    };
    set((state) => ({
      concepts: state.concepts.map((c) =>
        c.id === conceptId ? { ...c, aiGenerations: [...c.aiGenerations, gen] } : c
      ),
    }));
    fetch(`/api/concepts/${conceptId}/generations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(gen),
    }).catch(console.error);
  },

  updateManufacturing: (conceptId, record) => {
    set((state) => ({
      concepts: state.concepts.map((c) =>
        c.id === conceptId
          ? {
              ...c,
              manufacturingRecord: { ...c.manufacturingRecord, conceptId, ...record } as ManufacturingRecord,
            }
          : c
      ),
    }));
    fetch(`/api/concepts/${conceptId}/manufacturing`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conceptId, ...record }),
    }).catch(console.error);
  },

  addTemplate: (partial) => {
    const template: SpecTemplate = {
      id: uuidv4(),
      name: partial.name || 'Untitled Template',
      category: partial.category || '',
      description: partial.description || '',
      specs: partial.specs || {},
      coilSpecs: partial.coilSpecs || {},
      baseSpecs: partial.baseSpecs || {},
    };
    set((state) => ({ templates: [...state.templates, template] }));
    fetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(template),
    }).catch(console.error);
  },

  updateTemplate: (id, updates) => {
    set((state) => ({
      templates: state.templates.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    }));
    const template = get().templates.find((t) => t.id === id);
    if (template) {
      fetch('/api/templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(template),
      }).catch(console.error);
    }
  },

  deleteTemplate: (id) => {
    set((state) => ({ templates: state.templates.filter((t) => t.id !== id) }));
    fetch('/api/templates', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    }).catch(console.error);
  },

  setOpenAIKey: (key) => {
    set({ openAIKey: key });
    saveSetting('openai_key', key);
  },

  setGeminiKey: (key) => {
    set({ geminiKey: key });
    saveSetting('gemini_key', key);
  },

  setCurrentUserName: (name) => {
    set((state) => ({
      currentUser: { ...state.currentUser, name, avatar: name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) },
    }));
    saveSetting('user_name', name);
  },
}));
