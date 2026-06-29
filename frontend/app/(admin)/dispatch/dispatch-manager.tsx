"use client";
import { useState } from "react";
import { Download } from "lucide-react";
import { DataTable, type Column } from "@/components/data/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { apiFetch, ApiError } from "@/lib/fetcher";
import { formatDate } from "@/lib/utils";

interface UJob { id: string; jobCode: string; client: string; deliveryAddress: string; deliveryDate: string; }
interface DispatchRow {
  id: string;
  job: { jobCode: string; deliveryAddress: string };
  driver: { name: string };
  vehicle: { vehicleNumber: string };
  scheduledStart: string; scheduledEnd: string;
}
interface Resource { id: string; name?: string; vehicleNumber?: string; plateNumber?: string; }

export function DispatchManager({ undispatched }: { undispatched: UJob[] }) {
  const { toast } = useToast();
  const [refreshKey, setRefreshKey] = useState(0);

  // wizard state
  const [jobId, setJobId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [drivers, setDrivers] = useState<Resource[]>([]);
  const [vehicles, setVehicles] = useState<Resource[]>([]);
  const [driverId, setDriverId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [loadingResources, setLoadingResources] = useState(false);
  const [exportDate, setExportDate] = useState(new Date().toISOString().slice(0, 10));

  async function fetchAvailable() {
    if (!start || !end) { toast({ title: "Enter a time window", variant: "destructive" }); return; }
    setLoadingResources(true);
    try {
      const data = await apiFetch<{ drivers: Resource[]; vehicles: Resource[] }>(
        `/api/dispatch/available?start=${encodeURIComponent(new Date(start).toISOString())}&end=${encodeURIComponent(new Date(end).toISOString())}`,
      );
      setDrivers(data.drivers); setVehicles(data.vehicles);
      setDriverId(""); setVehicleId("");
      if (data.drivers.length === 0 || data.vehicles.length === 0) {
        toast({ title: "Not enough available resources", variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Failed to load", description: e instanceof ApiError ? e.message : "", variant: "destructive" });
    } finally {
      setLoadingResources(false);
    }
  }

  async function createDispatch() {
    if (!jobId || !driverId || !vehicleId || !start || !end) {
      toast({ title: "Please fill in all fields", variant: "destructive" }); return;
    }
    try {
      await apiFetch("/api/dispatch", {
        method: "POST",
        body: JSON.stringify({
          jobId, driverId, vehicleId,
          scheduledStart: new Date(start).toISOString(),
          scheduledEnd: new Date(end).toISOString(),
        }),
      });
      toast({ title: "Dispatch created", variant: "success" });
      setJobId(""); setDriverId(""); setVehicleId(""); setDrivers([]); setVehicles([]);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({ title: "Dispatch error", description: e instanceof ApiError ? e.message : "Failed to create", variant: "destructive" });
    }
  }

  const columns: Column<DispatchRow>[] = [
    { key: "job", header: "Job", render: (r) => r.job.jobCode },
    { key: "delivery", header: "Delivery To", render: (r) => r.job.deliveryAddress },
    { key: "driver", header: "Driver", render: (r) => r.driver.name },
    { key: "vehicle", header: "Vehicle", render: (r) => r.vehicle.vehicleNumber },
    { key: "time", header: "Window", render: (r) => `${formatDate(r.scheduledStart, true)} 〜 ${formatDate(r.scheduledEnd, true).slice(-5)}` },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Create Dispatch</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label>1. Select job</Label>
              <Select value={jobId} onValueChange={setJobId}>
                <SelectTrigger><SelectValue placeholder="Job awaiting dispatch" /></SelectTrigger>
                <SelectContent>
                  {undispatched.length === 0 && <SelectItem value="none" disabled>No jobs awaiting dispatch</SelectItem>}
                  {undispatched.map((j) => (
                    <SelectItem key={j.id} value={j.id}>{j.jobCode} / {j.client} / {formatDate(j.deliveryDate)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Start</Label><Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>End</Label><Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          </div>

          <Button variant="secondary" onClick={fetchAvailable} disabled={loadingResources}>
            2. Find available drivers & vehicles
          </Button>

          {(drivers.length > 0 || vehicles.length > 0) && (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>3. Driver ({drivers.length} free)</Label>
                <Select value={driverId} onValueChange={setDriverId}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{drivers.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Vehicle ({vehicles.length} free)</Label>
                <Select value={vehicleId} onValueChange={setVehicleId}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{vehicles.map((v) => <SelectItem key={v.id} value={v.id}>{v.vehicleNumber} ({v.plateNumber})</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          )}

          <Button onClick={createDispatch}>4. Create Dispatch</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Dispatch History</CardTitle>
          <div className="flex items-center gap-2">
            <Input type="date" className="w-40" value={exportDate} onChange={(e) => setExportDate(e.target.value)} />
            <Button variant="outline" asChild><a href={`/api/exports/dispatch-pdf?date=${exportDate}`}><Download className="h-4 w-4" />Dispatch Sheet PDF</a></Button>
          </div>
        </CardHeader>
        <CardContent>
          <DataTable<DispatchRow> endpoint="/api/dispatch" columns={columns} refreshKey={refreshKey} searchPlaceholder="" />
        </CardContent>
      </Card>
    </div>
  );
}
