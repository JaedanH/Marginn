import { useState, useEffect } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import Card from '../../../components/base/Card';
import Button from '../../../components/base/Button';
import { supabase } from '../../../supabaseClient';
import { useAuth } from '../../../context/AuthContext';

interface SavedItem {
  id: string;
  created_at: string;
  brand_name: string;
  product_line: string | null;
  image_url: string | null;
  expected_resale_gbp: number | null;
  decision: string | null;
  notes: string | null;
}

export default function SavedItemsPage() {
  const [items, setItems] = useState<SavedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    fetchSavedItems();
  }, [user]);

  const fetchSavedItems = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('saved_items')
      .select('*')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false });

    if (!error && data) setItems(data as SavedItem[]);
    setLoading(false);
  };

  const handleRemove = async (id: string) => {
    setRemoving(id);
    await supabase.from('saved_items').delete().eq('id', id);
    setItems((prev) => prev.filter((item) => item.id !== id));
    setRemoving(null);
  };

  const decisionColor = (decision: string | null) => {
    if (!decision) return 'bg-gray-100 text-gray-600';
    const d = decision.toLowerCase();
    if (d === 'buy' || d === 'resell') return 'bg-emerald-100 text-emerald-700';
    if (d === 'skip' || d === 'pass') return 'bg-red-100 text-red-700';
    return 'bg-amber-100 text-amber-700';
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-black">Saved Items</h1>
            <p className="text-gray-500 mt-1">Items you've bookmarked for later</p>
          </div>
          <span className="text-sm text-gray-500">{items.length} saved</span>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-4 animate-pulse">
                <div className="w-full aspect-square bg-gray-100 rounded-lg mb-4" />
                <div className="h-4 bg-gray-100 rounded w-3/4 mb-2" />
                <div className="h-3 bg-gray-100 rounded w-1/2" />
              </Card>
            ))}
          </div>
        ) : items.length === 0 ? (
          <Card className="p-16 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <i className="ri-bookmark-line text-gray-400 text-2xl"></i>
            </div>
            <h3 className="text-lg font-semibold text-black mb-2">No saved items yet</h3>
            <p className="text-gray-500 mb-6">
              When you scan items and save them, they'll appear here for easy reference.
            </p>
            <Button onClick={() => window.location.href = '/scan'} className="whitespace-nowrap">
              Start Scanning
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {items.map((item) => (
              <Card key={item.id} className="overflow-hidden">
                <div className="relative">
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={item.brand_name}
                      className="w-full aspect-square object-cover object-top"
                    />
                  ) : (
                    <div className="w-full aspect-square bg-gray-100 flex items-center justify-center">
                      <i className="ri-image-line text-gray-300 text-4xl"></i>
                    </div>
                  )}
                  {item.decision && (
                    <span className={`absolute top-3 left-3 px-2.5 py-1 text-xs font-semibold rounded-full ${decisionColor(item.decision)}`}>
                      {item.decision}
                    </span>
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="font-semibold text-black text-sm leading-tight">
                      {item.brand_name}
                      {item.product_line ? ` — ${item.product_line}` : ''}
                    </h3>
                    {item.expected_resale_gbp != null && (
                      <span className="text-emerald-600 font-bold text-sm whitespace-nowrap">
                        £{item.expected_resale_gbp}
                      </span>
                    )}
                  </div>
                  {item.notes && (
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{item.notes}</p>
                  )}
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-xs text-gray-400">
                      {new Date(item.created_at).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </span>
                    <button
                      onClick={() => handleRemove(item.id)}
                      disabled={removing === item.id}
                      className="text-xs text-gray-400 hover:text-red-500 transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <i className="ri-delete-bin-line"></i>
                      {removing === item.id ? 'Removing...' : 'Remove'}
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
