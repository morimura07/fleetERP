import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@frontend/components/ui/toast";

export const metadata: Metadata = {
  title: "FleetFlow | Logistics ERP",
  description: "Transport & logistics ERP for cross-border fleet operations",
};

// Set the theme class before paint to avoid a flash of the wrong theme.
// Themes: 'dark' (default) and 'green' (green/white). Stored in localStorage.
const themeScript = `(function(){try{var t=localStorage.getItem('theme');var c=document.documentElement.classList;c.remove('dark','green');c.add(t==='green'?'green':'dark');}catch(e){document.documentElement.classList.add('dark');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-background antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
