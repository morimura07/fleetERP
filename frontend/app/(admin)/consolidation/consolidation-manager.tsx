"use client";
import { useCallback, useEffect, useState } from "react";
import { Label } from "@frontend/components/ui/label";
import { Loader } from "@frontend/components/ui/loader";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@frontend/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@frontend/components/ui/tabs";
import { useToast } from "@frontend/components/ui/toast";
import { apiFetch, describeError } from "@frontend/lib/fetcher";
import { RunPanel } from "./run-panel";
import { MappingPanel } from "./mapping-panel";
import type { Available, EntityRow, MapRow } from "./shared";

/**
 * Consolidation to IAS 21: runs on one tab, the mapping and subsidiaries
 * on the other. The parent entity is chosen once and applies to both.
 */
export function ConsolidationManager() {
  const { toast } = useToast();
  const fail = useCallback((e: unknown) => toast({ title: "Error", description: describeError(e), variant: "destructive" }), [toast]);
  const [available, setAvailable] = useState<Available | null>(null);
  const [parentArea, setParentArea] = useState<string>("");
  const [entities, setEntities] = useState<EntityRow[]>([]);
  const [maps, setMaps] = useState<MapRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Available>("/api/consolidation/entities/available")
      .then((a) => { setAvailable(a); setParentArea(a.parentArea); })
      .catch((e) => setError(describeError(e)));
  }, []);

  const loadConfig = useCallback(async () => {
    if (!parentArea) return;
    try {
      const [e, m] = await Promise.all([
        apiFetch<EntityRow[]>(`/api/consolidation/entities?parentArea=${parentArea}`),
        apiFetch<MapRow[]>(`/api/consolidation/maps?parentArea=${parentArea}`),
      ]);
      setEntities(e); setMaps(m);
    } catch (err) { fail(err); }
  }, [parentArea, fail]);
  useEffect(() => { loadConfig(); }, [loadConfig]);

  if (error) return <p className="rounded-md border border-amber-500/30 bg-amber-500/5 p-4 text-sm">{error}</p>;
  if (!available || !parentArea) return <Loader size={36} label="Loading…" />;

  return (
    <div className="space-y-4">
      {available.companies.length > 1 && (
        <div className="flex items-center gap-2">
          <Label className="text-xs">Consolidating entity</Label>
          <Select value={parentArea} onValueChange={setParentArea}>
            <SelectTrigger className="w-72"><SelectValue /></SelectTrigger>
            <SelectContent>{available.companies.map((c) => <SelectItem key={c.code} value={c.code}>{c.code} · {c.name} ({c.baseCurrency})</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}
      <Tabs defaultValue="runs">
        <TabsList>
          <TabsTrigger value="runs">Consolidation runs</TabsTrigger>
          <TabsTrigger value="mapping">Mapping &amp; subsidiaries</TabsTrigger>
        </TabsList>
        <TabsContent value="runs" className="pt-4">
          <RunPanel key={parentArea} parentArea={parentArea} available={available} entities={entities} />
        </TabsContent>
        <TabsContent value="mapping" className="pt-4">
          <MappingPanel parentArea={parentArea} available={available} entities={entities} maps={maps} onChanged={loadConfig} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
