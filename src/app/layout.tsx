import type { Metadata } from "next";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: `${APP_NAME} — Kanban for dev teams`,
    template: `%s · ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
