import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "GraphGuard",
  description: "Suspicious relationship and fraud ring detection",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
