import { create } from 'zustand';
import { persist } from 'zustand/middleware';
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
import { sampleConcepts, sampleTemplates, sampleUsers } from './sample-data';

interface AppState {
  concepts: Concept[];
  templates: SpecTemplate[];
  users: User[];
  currentUser: User;
  openAIKey: string;

  // Concept CRUD
  addConcept: (concept: Partial<Concept>) => Concept;
  updateConcept: (id: string, updates: Partial<Concept>) => void;
  deleteConcept: (id: string) => void;
  duplicateConcept: (id: string) => Concept;
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

  // Settings
  setOpenAIKey: (key: string) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      concepts: sampleConcepts,
      templates: sampleTemplates,
      users: sampleUsers,
      currentUser: sampleUsers[0],
      openAIKey: '',

      addConcept: (partial) => {
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
        set((state) => ({ concepts: [...state.concepts, concept] }));
        return concept;
      },

      updateConcept: (id, updates) => {
        set((state) => ({
          concepts: state.concepts.map((c) =>
            c.id === id ? { ...c, ...updates, updatedAt: new Date().toISOString() } : c
          ),
        }));
      },

      deleteConcept: (id) => {
        set((state) => ({ concepts: state.concepts.filter((c) => c.id !== id) }));
      },

      duplicateConcept: (id) => {
        const original = get().concepts.find((c) => c.id === id);
        if (!original) throw new Error('Concept not found');
        const newConcept = get().addConcept({
          ...original,
          id: undefined as unknown as string,
          name: `${original.name} (Copy)`,
          status: 'ideation',
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
      },

      updateTemplate: (id, updates) => {
        set((state) => ({
          templates: state.templates.map((t) => (t.id === id ? { ...t, ...updates } : t)),
        }));
      },

      deleteTemplate: (id) => {
        set((state) => ({ templates: state.templates.filter((t) => t.id !== id) }));
      },

      setOpenAIKey: (key) => set({ openAIKey: key }),
    }),
    {
      name: 'bong-design-studio-storage',
    }
  )
);
