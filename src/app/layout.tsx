import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/header";
import { SolanaWalletProvider } from "@/components/wallet-provider";

export const metadata: Metadata = {
  title: "Wager - P2P Escrow on Solana Devnet",
  description:
    "Experimental P2P wager escrow with wallet-signed settlement on Solana devnet",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased dark">
      <body className="min-h-full flex flex-col">
        <SolanaWalletProvider>
          <Header />
          <main className="flex-1">{children}</main>
        </SolanaWalletProvider>
      </body>
    </html>
  );
}
