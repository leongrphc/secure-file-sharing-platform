import "./globals.css";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Secure File Sharing",
  description: "Private files and controlled sharing",
};
export default function Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
