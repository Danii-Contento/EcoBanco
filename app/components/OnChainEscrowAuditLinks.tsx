"use client";

export interface OnChainEscrowAuditLinksProps {
  contractId?: string | null;
  engagementId?: string | null;
  fundTxHash?: string | null;
  releaseTxHash?: string | null;
  compact?: boolean;
}

/**
 * Componente mantenido por compatibilidad de imports.
 * No renderiza enlaces a exploradores externos ni hashes técnicos en la interfaz;
 * los registros técnicos se mantienen únicamente en los logs del servidor (app/api/escrow/route.ts).
 */
export function OnChainEscrowAuditLinks(_props: OnChainEscrowAuditLinksProps) {
  return null;
}
