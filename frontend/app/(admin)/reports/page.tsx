"use client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@frontend/components/ui/tabs";
import { ReportLibrary } from "./report-library";
import { DailyReports } from "./daily-reports";

/**
 * "Daily report (should be just REPORT)" in the September requirements: the
 * screen becomes the report library, with the drivers' daily sheets kept as a
 * second tab rather than removed.
 */
export default function ReportsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
      <Tabs defaultValue="library">
        <TabsList>
          <TabsTrigger value="library">Report library</TabsTrigger>
          <TabsTrigger value="daily">Daily reports</TabsTrigger>
        </TabsList>
        <TabsContent value="library" className="pt-4"><ReportLibrary /></TabsContent>
        <TabsContent value="daily" className="pt-4"><DailyReports /></TabsContent>
      </Tabs>
    </div>
  );
}
