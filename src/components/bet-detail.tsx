"use client";

import { useCallback, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, Copy, ExternalLink, Loader2 } from "lucide-react";
import { lamportsToSol, shortenAddress } from "@/lib/utils";
import { APP_URL } from "@/lib/constants";
import { sendSerializedTransactionWithWallet } from "@/lib/solana/send-with-wallet";
import { BetDetailData, TERMINAL_STATUSES } from "./bet-detail-types";
import { BetInfoCard } from "./bet-info-card";
import { BetEvidence } from "./bet-evidence";

const POLL_INTERVAL_MS = 8000;

// Polls the bet status while it's in a non-terminal state. When the status
// changes server-side (taker accepts, resolver proposes, dispute window closes),
// refreshes the server component to pull fresh data without a full reload.
function useStatusPolling(betId: string, currentStatus: string, onChange: () => void) {
  useEffect(() => {
    if (TERMINAL_STATUSES.includes(currentStatus)) return;

    let active = true;
    const poll = async () => {
      try {
        const res = await fetch(`/api/bets/${betId}`, { cache: "no-store" });
        if (!res.ok || !active) return;
        const data = await res.json();
        if (active && data.status && data.status !== currentStatus) {
          onChange();
        }
      } catch {
        // network blip — next tick retries
      }
    };

    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => { active = false; clearInterval(id); };
  }, [betId, currentStatus, onChange]);
}

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

export function BetDetail({ bet }: { bet: BetDetailData }) {
  const router = useRouter();
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const [disputeReason, setDisputeReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(
      () => setCurrentTime(Date.now()),
      POLL_INTERVAL_MS
    );
    return () => window.clearInterval(timer);
  }, []);

  const refreshBet = useCallback(() => router.refresh(), [router]);
  useStatusPolling(bet.id, bet.status, refreshBet);

  const blinkUrl = `${APP_URL}/api/actions/bet/${bet.id}`;
  const stakeSol = lamportsToSol(Number(bet.stakeLamports));
  const connected = !!publicKey;
  const walletPubkey = publicKey?.toBase58() || "";
  const isMaker = connected && walletPubkey === bet.maker.pubkey;

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch(`/api/bets/${bet.id}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok && data.synced) {
        setMessage(`Synced: ${data.updates?.join(", ") || "no changes"}`);
        window.location.reload();
      } else {
        setMessage(data.error || "Sync failed — admin API key required");
      }
    } catch {
      setMessage("Sync request failed");
    } finally {
      setSyncing(false);
    }
  }

  async function handleFund() {
    if (!publicKey || !signTransaction) return;
    setLoading(true);
    setMessage(null);
    setTxSig(null);
    try {
      const res = await fetch(`/api/bets/${bet.id}/fund-maker/tx`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maker_pubkey: publicKey.toBase58() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const sig = await sendSerializedTransactionWithWallet({
        serializedTransactionBase64: data.transaction,
        wallet: { publicKey, signTransaction },
        connection,
      });
      setTxSig(sig);
      setMessage(`Funded! TX: ${sig.slice(0, 20)}...`);

      // Auto-sync after funding
      await fetch(`/api/bets/${bet.id}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      window.location.reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      if (msg.includes("User rejected")) {
        setMessage("Transaction cancelled by wallet.");
      } else if (msg.includes("insufficient")) {
        setMessage("Insufficient devnet SOL. Get free SOL at faucet.solana.com");
      } else {
        setMessage(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleAccept() {
    if (!publicKey || !signTransaction) return;
    setLoading(true);
    setMessage(null);
    setTxSig(null);
    try {
      const res = await fetch(`/api/actions/bet/${bet.id}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account: publicKey.toBase58() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const sig = await sendSerializedTransactionWithWallet({
        serializedTransactionBase64: data.transaction,
        wallet: { publicKey, signTransaction },
        connection,
      });
      setTxSig(sig);
      setMessage(`Accepted! TX: ${sig.slice(0, 20)}...`);

      await fetch(`/api/bets/${bet.id}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      window.location.reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      if (msg.includes("User rejected")) {
        setMessage("Transaction cancelled by wallet.");
      } else if (msg.includes("insufficient")) {
        setMessage("Insufficient devnet SOL. Get free SOL at faucet.solana.com");
      } else {
        setMessage(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleDispute() {
    if (!publicKey) return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/bets/${bet.id}/dispute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet_pubkey: publicKey.toBase58(),
          reason: disputeReason,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage("Dispute filed successfully.");
      window.location.reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to file dispute");
    } finally {
      setLoading(false);
    }
  }

  const canDispute =
    bet.status === "RESULT_PROPOSED" &&
    bet.disputeDeadlineUtc &&
    new Date(bet.disputeDeadlineUtc).getTime() > currentTime;

  return (
    <div className="space-y-6">
      <Alert variant="warning">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Devnet Only</AlertTitle>
        <AlertDescription>
          This is experimental devnet software. Do not use real funds.
        </AlertDescription>
      </Alert>

      <BetInfoCard bet={bet} />

      {bet.status === "OPEN" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {bet.makerFunded ? "Share & Accept" : "Next Step: Fund Escrow"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!bet.makerFunded && (
              <div className="space-y-3">
                <Alert>
                  <AlertDescription>
                    The maker must fund the escrow ({stakeSol} SOL) before a taker can accept.
                  </AlertDescription>
                </Alert>

                {!connected && (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Connect your wallet to continue.</p>
                    <WalletMultiButton />
                  </div>
                )}

                {connected && isMaker && (
                  <div className="space-y-2">
                    <Button onClick={handleFund} disabled={loading}>
                      {loading ? (
                        <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Signing...</>
                      ) : (
                        `Fund Escrow (${stakeSol} SOL)`
                      )}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Your wallet will open to sign the transaction.
                    </p>
                  </div>
                )}

                {connected && !isMaker && (
                  <p className="text-sm text-muted-foreground">
                    Only the maker wallet (<code>{shortenAddress(bet.maker.pubkey, 6)}</code>) can fund this escrow.
                    Waiting for maker to fund.
                  </p>
                )}
              </div>
            )}
            {bet.makerFunded && (
              <div className="space-y-3">
                {!connected && (
                  <div className="space-y-2">
                    <p className="text-sm">Escrow funded ({stakeSol} SOL). Connect wallet to accept or share the link.</p>
                    <WalletMultiButton />
                  </div>
                )}

                {connected && isMaker && (
                  <>
                    <p className="text-sm">
                      You funded this wager. Share the link below with a taker.
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs bg-muted p-2 rounded overflow-x-auto">
                        {blinkUrl}
                      </code>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => navigator.clipboard.writeText(blinkUrl)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </>
                )}

                {connected && !isMaker && (
                  <div className="space-y-2">
                    <p className="text-sm">
                      Take the opposite side of this wager by depositing {stakeSol} SOL.
                    </p>
                    <Button onClick={handleAccept} disabled={loading}>
                      {loading ? (
                        <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Signing...</>
                      ) : (
                        `Accept Wager (${stakeSol} SOL)`
                      )}
                    </Button>
                  </div>
                )}

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Blink:</span>
                  <code className="flex-1 bg-muted p-1 rounded overflow-x-auto">{blinkUrl}</code>
                  <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(blinkUrl)}>
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}
            {message && (
              <Alert variant={txSig ? "default" : "destructive"}>
                <AlertDescription>
                  {message}
                  {txSig && (
                    <a
                      href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-1 underline inline-flex items-center gap-0.5"
                    >
                      Explorer <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </AlertDescription>
              </Alert>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleSync}
              disabled={syncing}
            >
              {syncing ? "Syncing..." : "Sync From Chain"}
            </Button>
          </CardContent>
        </Card>
      )}

      {bet.status === "ACCEPTED" && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              Both sides funded. Waiting for the deadline to pass so the resolver can propose a result.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={handleSync}
              disabled={syncing}
            >
              {syncing ? "Syncing..." : "Sync From Chain"}
            </Button>
          </CardContent>
        </Card>
      )}

      <BetEvidence bet={bet} />

      {canDispute && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">File a Dispute</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!connected && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Connect your wallet to file a dispute.</p>
                <WalletMultiButton />
              </div>
            )}
            {connected && (
              <>
                <p className="text-xs text-muted-foreground">
                  Filing as: <code>{shortenAddress(walletPubkey, 6)}</code>
                </p>
                <Textarea
                  placeholder="Explain why you dispute this result..."
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value)}
                  rows={3}
                />
                <Button
                  onClick={handleDispute}
                  disabled={loading || disputeReason.length < 10}
                  variant="destructive"
                >
                  {loading ? "Filing..." : "File Dispute"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
