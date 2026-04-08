'use client';

import { useState } from 'react';
import { useAppStore } from '@/lib/store';
import { Input, TextArea } from './ui';
import { useToast } from './toast';

export function ManufacturingPanel({ conceptId }: { conceptId: string }) {
  const { concepts, updateManufacturing } = useAppStore();
  const { toast } = useToast();
  const concept = concepts.find((c) => c.id === conceptId);
  const record = concept?.manufacturingRecord;

  const [machineNotes, setMachineNotes] = useState(record?.machineReadyNotes || '');
  const [material, setMaterial] = useState(record?.targetMaterial || '');
  const [etchSettings, setEtchSettings] = useState(record?.etchingSettings || '');
  const [estTime, setEstTime] = useState(record?.estimatedProductionTime || '');
  const [batchName, setBatchName] = useState(record?.batchName || '');
  const [sentDate, setSentDate] = useState(record?.dateSentToProduction || '');
  const [mfgDate, setMfgDate] = useState(record?.dateManufactured || '');
  const [quantity, setQuantity] = useState(record?.quantityProduced?.toString() || '');
  const [qcNotes, setQcNotes] = useState(record?.qcNotes || '');
  const [saving, setSaving] = useState(false);
  const [quantityError, setQuantityError] = useState('');

  const save = () => {
    setSaving(true);
    updateManufacturing(conceptId, {
      machineReadyNotes: machineNotes,
      targetMaterial: material,
      etchingSettings: etchSettings,
      estimatedProductionTime: estTime,
      batchName,
      dateSentToProduction: sentDate,
      dateManufactured: mfgDate,
      quantityProduced: parseInt(quantity) || 0,
      qcNotes,
    });
    toast('Manufacturing data saved', 'success');
    setSaving(false);
  };

  if (!concept) return null;

  return (
    <div className="max-w-2xl space-y-4">
      <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold">Production Details</h3>
        <div>
          <label className="block text-xs text-muted mb-1">Machine-Ready Notes</label>
          <TextArea value={machineNotes} onChange={setMachineNotes} placeholder="Notes for machine setup..." rows={2} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-muted mb-1">Target Material</label>
            <Input value={material} onChange={setMaterial} placeholder="e.g., Borosilicate glass" />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Etching Settings</label>
            <Input value={etchSettings} onChange={setEtchSettings} placeholder="Speed, power, freq..." />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-muted mb-1">Est. Production Time</label>
            <Input value={estTime} onChange={setEstTime} placeholder="e.g., 6 min per unit" />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Batch / Run Name</label>
            <Input value={batchName} onChange={setBatchName} placeholder="e.g., GEO-BATCH-001" />
          </div>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold">Production Tracking</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-muted mb-1">Date Sent to Production</label>
            <Input type="date" value={sentDate ? sentDate.split('T')[0] : ''} onChange={(v) => setSentDate(v ? new Date(v).toISOString() : '')} />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Date Manufactured</label>
            <Input type="date" value={mfgDate ? mfgDate.split('T')[0] : ''} onChange={(v) => setMfgDate(v ? new Date(v).toISOString() : '')} />
          </div>
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">Quantity Produced</label>
          <Input value={quantity} onChange={(v: string) => { if (v && (isNaN(Number(v)) || Number(v) < 0)) { setQuantityError('Must be a positive number'); } else { setQuantityError(''); setQuantity(v); } }} placeholder="0" type="number" />
          {quantityError && <p className="text-xs text-red-400 mt-1">{quantityError}</p>}
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">QC Notes</label>
          <TextArea value={qcNotes} onChange={setQcNotes} placeholder="Quality control notes..." rows={2} />
        </div>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm rounded-lg transition-colors disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save Manufacturing Data'}
      </button>
    </div>
  );
}
