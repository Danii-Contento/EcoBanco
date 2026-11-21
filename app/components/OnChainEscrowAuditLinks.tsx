"use client";

import React from "react";

interface OnChainEscrowAuditLinksProps {
  contractId?: string | null;
  engagementId?: string | null;
  fundTxHash?: string | null;
  releaseTxHash?: string | null;
  compact?: boolean;
}

const SOROBAN_CONTRACT_REGEX = /^C[A-Z2-7]{55}$/;

export function OnChainEscrowAuditLinks({
  contractId,
  engagementId,
  fundTxHash,
  releaseTxHash,
  compact = false,
}: OnChainEscrowAuditLinksProps) {
  const cleanContractId = (contractId || "").trim();
  if (!cleanContractId) return null;

  const isSorobanContract = SOROBAN_CONTRACT_REGEX.test(cleanContractId);
  const viewerUrl = isSorobanContract
    ? `https://viewer.trustlesswork.com/${encodeURIComponent(cleanContractId)}`
    : "https://viewer.trustlesswork.com";

  const stellarExpertUrl = isSorobanContract
    ? `https://stellar.expert/explorer/testnet/contract/${encodeURIComponent(
        cleanContractId
      )}`
    : "https://stellar.expert/explorer/testnet";

  return (
    <div
      aria-label="Auditoría On-Chain Soroban Testnet"
      className={`rounded-xl bg-[#0B1410] border border-oro/45 ${
        compact ? "p-2.5 space-y-2" : "p-3 space-y-2.5"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px]">
        <span className="font-extrabold uppercase tracking-wider text-oro">
          🔗 Contrato Multi-Release (Soroban Testnet)
        </span>
        {engagementId && (
          <span className="font-mono text-arena/75">{engagementId}</span>
        )}
      </div>

      <div className="px-2.5 py-1.5 rounded-lg bg-bosque border border-arena/20 font-mono text-xs text-brillo break-all select-all">
        {cleanContractId}
      </div>

      {(fundTxHash || releaseTxHash) && (
        <div className="flex flex-wrap gap-2 text-[11px] font-mono text-arena/80">
          {fundTxHash && (
            <a
              href={`https://stellar.expert/explorer/testnet/tx/${encodeURIComponent(
                fundTxHash
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-brillo"
            >
              Fondeo TX: {fundTxHash.slice(0, 8)}...{fundTxHash.slice(-6)}
            </a>
          )}
          {releaseTxHash && (
            <a
              href={`https://stellar.expert/explorer/testnet/tx/${encodeURIComponent(
                releaseTxHash
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-brote hover:text-brillo"
            >
              Liberación TX: {releaseTxHash.slice(0, 8)}...
              {releaseTxHash.slice(-6)}
            </a>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5">
        <a
          href={viewerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-2 rounded-lg bg-oro/20 hover:bg-oro hover:text-bosque border border-oro text-brillo text-xs font-extrabold text-center transition"
        >
          Ver en Trustless Work Viewer ↗
        </a>
        <a
          href={stellarExpertUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-2 rounded-lg bg-brote/20 hover:bg-brote hover:text-bosque border border-brote text-arena text-xs font-extrabold text-center transition"
        >
          Ver en Stellar Expert ↗
        </a>
      </div>
    </div>
  );
}
