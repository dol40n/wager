"use client";

import { useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, Copy, ExternalLink, Loader2 } from "lucide-react";
import { lamportsToSol, formatDeadline, statusLabel, shortenAddress } from "@/lib/utils";
import { APP_URL } from "@/lib/constants";
import { sendSerializedTransactionWithWallet } from "@/lib/solana/send-with-wallet";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

interface BetDetailData {
  id: string;
  onChainAddress: string | null;
  normalizedQuestion: string;
  originalText: string;
  category: string;
  yesDefinition: string;
  noDefinition: string;
  deadlineUtc: string;
  makerSide: string;
  stakeLamports: string;
  status: string;
  makerFunded: boolean;
  maker: { pubkey: string };
  taker: { pubkey: string } | null;
  proposedWinner: string | null;
  finalWinner: string | null;
  disputeDeadlineUtc: string | null;
  resolverConfidence: number | null;
  needsManualReview: boolean;
  evidenceHash: string | null;
  evidence: Array<{
    id: string;
    sourceUrl: string;
    sourceName: string;
    relevantExcerpt: string;
    supports: string;
    explanation: string;
  }>;
  disputes: Array<{
    id: string;
    reason: string;
    createdAt: string;
  }>;
  resolutionSources: string[];
  objectiveCriteria: string[];
}

export function BetDetail({ bet }: { bet: BetDetailData }) {
  const { publicKey, wallet, signTransaction } = useWallet();
  const { connection } = useConnection();
  const [disputeReason, setDisputeReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);

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
    new Date(bet.disputeDeadlineUtc).getTime() > Date.now();

  return (
    <div className="space-y-6">
      <Alert variant="warning">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Devnet Only</AlertTitle>
        <AlertDescription>
          This is experimental devnet software. Do not use real funds.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-lg">
              {bet.normalizedQuestion}
            </CardTitle>
            <Badge
              variant={
                bet.status === "FINALIZED"
                  ? "success"
                  : bet.status === "DISPUTED"
                  ? "destructive"
                  : "outline"
              }
            >
              {statusLabel(bet.status)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Original: &quot;{bet.originalText}&quot;
          </p>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium">YES means:</span>
              <p className="text-muted-foreground">{bet.yesDefinition}</p>
            </div>
            <div>
              <span className="font-medium">NO means:</span>
              <p className="text-muted-foreground">{bet.noDefinition}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium">Stake:</span> {stakeSol} SOL each
            </div>
            <div>
              <span className="font-medium">Maker side:</span> {bet.makerSide}
            </div>
            <div>
              <span className="font-medium">Deadline:</span>{" "}
              {formatDeadline(bet.deadlineUtc)}
            </div>
            <div>
              <span className="font-medium">Category:</span>{" "}
              <span className="capitalize">{bet.category}</span>
            </div>
            <div>
              <span className="font-medium">Maker:</span>{" "}
              {shortenAddress(bet.maker.pubkey)}
            </div>
            <div>
              <span className="font-medium">Taker:</span>{" "}
              {bet.taker ? shortenAddress(bet.taker.pubkey) : "None yet"}
            </div>
            {bet.onChainAddress && (
              <div className="col-span-2">
                <span className="font-medium">On-chain PDA:</span>{" "}
                {shortenAddress(bet.onChainAddress, 8)}
              </div>
            )}
          </div>

          {bet.proposedWinner && (
            <div className="text-sm space-y-1">
              <div>
                <span className="font-medium">Proposed Winner:</span>{" "}
                {bet.proposedWinner}
                {bet.resolverConfidence !== null && (
                  <span className="text-muted-foreground">
                    {" "}(confidence: {(bet.resolverConfidence * 100).toFixed(0)}%)
                  </span>
                )}
              </div>
              {bet.resolverConfidence !== null && bet.resolverConfidence < 0.8 && (
                <p className="text-xs text-warning-foreground">
                  Low confidence — flagged for admin review. AI was not certain enough to auto-resolve.
                </p>
              )}
              {bet.needsManualReview && (
                <p className="text-xs text-destructive">
                  This bet requires manual admin review before payout.
                </p>
              )}
            </div>
          )}

          {bet.finalWinner && (
            <div className="text-sm">
              <span className="font-medium">Final Winner:</span>{" "}
              {bet.finalWinner}
            </div>
          )}

          {bet.evidenceHash && (
            <div className="text-sm">
              <span className="font-medium">Evidence Hash:</span>{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">
                {bet.evidenceHash}
              </code>
            </div>
          )}

          {bet.disputeDeadlineUtc && (
            <div className="text-sm space-y-1">
              <div>
                <span className="font-medium">Dispute Deadline:</span>{" "}
                {formatDeadline(bet.disputeDeadlineUtc)}
              </div>
              <p className="text-xs text-muted-foreground">
                Either party can dispute the proposed result within 24 hours.
                If no dispute is filed, the payout finalizes automatically.
                Winner receives 99% of the pot; 1% goes to the platform fee wallet.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

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

      {bet.evidence.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resolution Evidence</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {bet.evidence.map((ev) => (
              <div key={ev.id} className="border rounded-lg p-3 text-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium">{ev.sourceName}</span>
                  <Badge
                    variant={
                      ev.supports === "YES"
                        ? "success"
                        : ev.supports === "NO"
                        ? "destructive"
                        : "secondary"
                    }
                  >
                    {ev.supports}
                  </Badge>
                </div>
                <p className="text-muted-foreground italic">
                  &quot;{ev.relevantExcerpt}&quot;
                </p>
                <p className="mt-1">{ev.explanation}</p>
                {ev.sourceUrl && (
                  <a
                    href={ev.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary mt-1 hover:underline"
                  >
                    Source <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {bet.disputes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Disputes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {bet.disputes.map((d) => (
              <div key={d.id} className="border rounded-lg p-3 text-sm">
                <p>{d.reason}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Filed: {new Date(d.createdAt).toLocaleString()}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

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
