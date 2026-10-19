import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "DevFlow — Kanban for dev teams",
    template: "%s · DevFlow",
  },
  description:
    "Full-stack kanban SaaS built with Next.js 15, Prisma and JWT auth. Drag, drop, ship.",
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
