import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@frontend/components/ui/toast";
import { ErrorReporter } from "@frontend/components/layout/error-reporter";

export const metadata: Metadata = {
  title: "FleetFlow | Logistics ERP",
  description: "Transport & logistics ERP for cross-border fleet operations",
};

// Set the theme class before paint to avoid a flash of the wrong theme.
// Themes: 'green' (green/white, default) and 'dark'. Stored in localStorage.
const themeScript = `(function(){try{var t=localStorage.getItem('theme');var c=document.documentElement.classList;c.remove('dark','green');c.add(t==='dark'?'dark':'green');}catch(e){document.documentElement.classList.add('green');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="green" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-background antialiased">
        <ToastProvider>
          <ErrorReporter />
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
