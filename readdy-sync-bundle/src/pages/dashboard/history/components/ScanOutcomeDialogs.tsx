import { useState, useEffect } from 'react';
import Button from '../../../../components/base/Button';

interface MarkBoughtDialogProps {
  open: boolean;
  title?: string;
  defaultPriceGbp: number | null;
  onClose: () => void;
  onConfirm: (boughtPriceGbp: number | null) => void;
}

export function MarkBoughtDialog({
  open,
  title = 'Mark as bought',
  defaultPriceGbp,
  onClose,
  onConfirm,
}: MarkBoughtDialogProps) {
  const [price, setPrice] = useState('');

  useEffect(() => {
    if (!open) return;
    setPrice(defaultPriceGbp != null && defaultPriceGbp > 0 ? String(defaultPriceGbp) : '');
  }, [open, defaultPriceGbp]);

  if (!open) return null;

  const submit = () => {
    const n = parseFloat(price);
    onConfirm(Number.isFinite(n) && n >= 0 ? n : null);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
        <h3 className="text-lg font-bold text-black">{title}</h3>
        <p className="text-sm text-gray-600">
          Confirm you bought this item. Optionally set the price you paid (defaults to your scan buy price when
          left blank).
        </p>
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Price paid (£)</label>
          <div className="relative mt-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">£</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full pl-7 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
              placeholder="Optional"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} className="whitespace-nowrap">
            Cancel
          </Button>
          <Button onClick={submit} className="whitespace-nowrap">
            Confirm bought
          </Button>
        </div>
      </div>
    </div>
  );
}

interface MarkSoldDialogProps {
  open: boolean;
  brandName?: string;
  onClose: () => void;
  onConfirm: (soldPriceGbp: number) => void;
}

export function MarkSoldDialog({ open, brandName, onClose, onConfirm }: MarkSoldDialogProps) {
  const [price, setPrice] = useState('');

  useEffect(() => {
    if (open) setPrice('');
  }, [open]);

  if (!open) return null;

  const submit = () => {
    const n = parseFloat(price);
    if (!Number.isFinite(n) || n < 0) return;
    onConfirm(n);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
        <h3 className="text-lg font-bold text-black">Record sale</h3>
        <p className="text-sm text-gray-600">
          Enter what you sold <span className="font-medium text-gray-800">{brandName ?? 'this item'}</span> for
          (fees can be deducted mentally for now).
        </p>
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sale price (£)</label>
          <div className="relative mt-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">£</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full pl-7 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
              placeholder="0.00"
              autoFocus
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} className="whitespace-nowrap">
            Cancel
          </Button>
          <Button onClick={submit} disabled={!price.trim()} className="whitespace-nowrap">
            Save &amp; mark sold
          </Button>
        </div>
      </div>
    </div>
  );
}
