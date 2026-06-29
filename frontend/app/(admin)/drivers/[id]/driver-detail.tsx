"use client";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@frontend/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@frontend/components/ui/card";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { useToast } from "@frontend/components/ui/toast";
import { WEEKDAYS } from "@frontend/lib/labels";
import { apiFetch } from "@frontend/lib/fetcher";
import { Trash2 } from "lucide-react";

interface Availability { weekday: number; startTime: string; endTime: string; isActive: boolean; }
interface Holiday { id: string; date: string; reason: string | null; }

export function DriverDetail({ driverId, name, availability, holidays: initialHolidays }: {
  driverId: string; name: string; availability: Availability[]; holidays: Holiday[];
}) {
  const { toast } = useToast();
  const [avail, setAvail] = useState<Record<number, Availability>>(() => {
    const m: Record<number, Availability> = {};
    for (let d = 0; d < 7; d++) m[d] = { weekday: d, startTime: "09:00", endTime: "18:00", isActive: false };
    availability.forEach((a) => (m[a.weekday] = a));
    return m;
  });
  const [holidays, setHolidays] = useState<Holiday[]>(initialHolidays);
  const [newHoliday, setNewHoliday] = useState({ date: "", reason: "" });

  async function saveAvailability(weekday: number) {
    const a = avail[weekday];
    await apiFetch(`/api/drivers/${driverId}/availability`, { method: "POST", body: JSON.stringify(a) });
    toast({ title: `Saved availability for ${WEEKDAYS[weekday]}`, variant: "success" });
  }

  async function addHoliday() {
    if (!newHoliday.date) return;
    const created = await apiFetch<Holiday>(`/api/drivers/${driverId}/holidays`, {
      method: "POST", body: JSON.stringify(newHoliday),
    });
    setHolidays((h) => [...h, { ...created, date: newHoliday.date }].sort((a, b) => a.date.localeCompare(b.date)));
    setNewHoliday({ date: "", reason: "" });
    toast({ title: "Holiday saved", variant: "success" });
  }

  async function removeHoliday(id: string) {
    await apiFetch(`/api/drivers/${driverId}/holidays?holidayId=${id}`, { method: "DELETE" });
    setHolidays((h) => h.filter((x) => x.id !== id));
  }

  const holidaySet = new Set(holidays.map((h) => h.date));
  const today = new Date();
  const monthDays = Array.from({ length: new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth(), i + 1);
    return d.toISOString().slice(0, 10);
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">{name} — Settings</h1>
      <Tabs defaultValue="availability">
        <TabsList>
          <TabsTrigger value="availability">Availability</TabsTrigger>
          <TabsTrigger value="holidays">Holidays</TabsTrigger>
        </TabsList>

        <TabsContent value="availability">
          <Card>
            <CardHeader><CardTitle>Weekly Working Hours</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {WEEKDAYS.map((label, d) => (
                <div key={d} className="flex flex-wrap items-center gap-3 border-b pb-3">
                  <label className="flex w-20 items-center gap-2">
                    <input type="checkbox" checked={avail[d].isActive}
                      onChange={(e) => setAvail((s) => ({ ...s, [d]: { ...s[d], isActive: e.target.checked } }))} />
                    {label}
                  </label>
                  <Input type="time" className="w-32" value={avail[d].startTime}
                    onChange={(e) => setAvail((s) => ({ ...s, [d]: { ...s[d], startTime: e.target.value } }))} />
                  <span>〜</span>
                  <Input type="time" className="w-32" value={avail[d].endTime}
                    onChange={(e) => setAvail((s) => ({ ...s, [d]: { ...s[d], endTime: e.target.value } }))} />
                  <Button size="sm" variant="outline" onClick={() => saveAvailability(d)}>Save</Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="holidays">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Add Holiday</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5"><Label>Date</Label>
                  <Input type="date" value={newHoliday.date} onChange={(e) => setNewHoliday((s) => ({ ...s, date: e.target.value }))} />
                </div>
                <div className="space-y-1.5"><Label>Reason (optional)</Label>
                  <Input value={newHoliday.reason} onChange={(e) => setNewHoliday((s) => ({ ...s, reason: e.target.value }))} />
                </div>
                <Button onClick={addHoliday}>Create</Button>

                <ul className="divide-y pt-2">
                  {holidays.map((h) => (
                    <li key={h.id} className="flex items-center justify-between py-2 text-sm">
                      <span>{h.date} {h.reason && <span className="text-muted-foreground">/ {h.reason}</span>}</span>
                      <Button variant="ghost" size="icon" onClick={() => removeHoliday(h.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>{today.getFullYear()}-{today.getMonth() + 1} Calendar</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-7 gap-1 text-center text-xs">
                  {WEEKDAYS.map((w) => <div key={w} className="font-medium text-muted-foreground">{w}</div>)}
                  {Array.from({ length: new Date(today.getFullYear(), today.getMonth(), 1).getDay() }).map((_, i) => <div key={`pad${i}`} />)}
                  {monthDays.map((iso) => {
                    const day = Number(iso.slice(-2));
                    const isHoliday = holidaySet.has(iso);
                    return (
                      <div key={iso} className={`rounded p-2 ${isHoliday ? "bg-destructive text-destructive-foreground font-bold" : "bg-muted/40"}`}>
                        {day}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
