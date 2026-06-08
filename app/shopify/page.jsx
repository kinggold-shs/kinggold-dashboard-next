'use client';

import { useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ShoppingBag } from 'lucide-react';
import DashboardShell from '../../components/DashboardShell';
import BulkRepairVariantOptionsButton from '../../components/shopify/BulkRepairVariantOptionsButton';
import CleanupDiscriminatorsButton from '../../components/shopify/CleanupDiscriminatorsButton';
import ItemsListTab from '../../components/shopify/ItemsListTab';
import ItemsManagementTab from '../../components/shopify/ItemsManagementTab';
import { CLEANUP_DISCRIMINATORS_UI_ENABLED } from '../../lib/featureFlags';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';

export default function ShopifyPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab') === 'manage' ? 'manage' : 'list';
  const sku = searchParams.get('sku') || '';

  const setRoute = useMemo(() => (nextTab, nextSku = '') => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', nextTab);
    if (nextSku) params.set('sku', nextSku);
    else params.delete('sku');
    router.replace(`${pathname}?${params.toString()}`);
  }, [pathname, router, searchParams]);

  return (
    <DashboardShell>
      <div className="space-y-5">
        <div className="shopify-page-header space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <ShoppingBag size={20} />
                <h1 className="text-xl font-bold tracking-tight">Shopify Items</h1>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Browse products in Items List, then open complete CRUD workflows in Items Management.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <BulkRepairVariantOptionsButton />
              {CLEANUP_DISCRIMINATORS_UI_ENABLED ? <CleanupDiscriminatorsButton /> : null}
            </div>
          </div>
        </div>

        <Tabs
          value={tab}
          onValueChange={(nextTab) => setRoute(nextTab, nextTab === 'manage' ? sku : '')}
          className="w-full !flex !flex-col"
        >
          <TabsList>
            <TabsTrigger value="list">Items List</TabsTrigger>
            <TabsTrigger value="manage">Items Management</TabsTrigger>
          </TabsList>
          <TabsContent value="list" className="pt-3">
            <ItemsListTab onManageSku={(nextSku) => setRoute('manage', nextSku || '')} />
          </TabsContent>
          <TabsContent value="manage" className="pt-3">
            <ItemsManagementTab initialSku={sku} />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardShell>
  );
}
