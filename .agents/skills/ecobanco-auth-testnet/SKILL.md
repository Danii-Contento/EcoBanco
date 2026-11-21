---
name: ecobanco-auth-testnet
description: Auditoría de aislamiento de cuentas/perfiles (Vecino, Caserita, Rider) y configuración silenciosa de Pollar y Trustless Work en Stellar Testnet. Úsala al trabajar en `app/lib/session.ts`, `app/lib/store.ts`, `app/lib/pollarWallet.ts`, `app/lib/trustlessWork.ts`, `app/api/` o scripts de verificación.
---
# Aislamiento de Cuentas y Operaciones Testnet

## 1. Aislamiento Estricto de Logins y Perfiles
- Normaliza siempre teléfonos bolivianos al formato `+591XXXXXXXX` en un helper compartido entre frontend y backend.
- Al cerrar sesión o cambiar de cuenta en `app/lib/session.ts` y `app/lib/store.ts`, purga completamente `localStorage`, `sessionStorage` y estado en memoria para que ningún carrito, saldo o pedido se mezcle entre usuarios.
- En `app/api/products/route.ts`, `app/api/deliveries/route.ts` y `app/api/escrow/route.ts`, valida siempre propiedad y rol en servidor (un Vecino no edita puestos; dos Riders no pueden tomar el mismo envío; solo el comprador libera el Pago Protegido).

## 2. Pollar + Trustless Work en Stellar Testnet (Invisible en UI)
- Verifica que todos los endpoints y SDKs apunten explícitamente a **Stellar Testnet** (`TESTNET`, `https://horizon-testnet.stellar.org`, entorno dev/testnet de Pollar y Trustless Work).
- Mantén el aprovisionamiento de cuenta Pollar y el ciclo de escrow (crear -> fondear -> hito de entrega -> liberar) 100% en segundo plano. Guarda `tx_hash` y `contract_id` solo en Supabase o logs de servidor.
- Documenta todas las variables necesarias en `.env.example` y crea/actualiza `scripts/check-testnet-ready.mjs` para probar conectividad a Supabase, Horizon Testnet, Pollar y Trustless Work.

## Verificación Obligatoria
- Ejecuta `npm run build` y registra hallazgos y pasos manuales pendientes en `REPORTE_AUTONOMO.md`.
