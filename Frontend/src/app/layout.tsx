import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { RoleProvider } from '../context/RoleContext';
import { ChainWardDataProvider } from '../context/ChainWardDataProvider';
import { Providers } from './providers';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ChainWard - Orbit Incident Command Center",
  description: "Real-time multi-chain incident monitoring &management dashboard for Arbitrum Orbit chains. Track health, manage incidents, &respond to blockchain failures.",
  keywords: ["blockchain", "incident management", "Arbitrum Orbit", "monitoring", "DeFi", "chain health"],
  authors: [{ name: "ChainWard Team" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>
          <ChainWardDataProvider>
            <RoleProvider>
              {children}
            </RoleProvider>
          </ChainWardDataProvider>
        </Providers>
      </body>
    </html>
  );
}
