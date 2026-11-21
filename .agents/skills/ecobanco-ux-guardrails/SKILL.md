---
name: ecobanco-ux-guardrails
description: Reglas obligatorias de UX/UI, identidad visual "Ajayu", invisibilidad Web3 y desmonolitización segura para EcoBanco Bolivia. Úsala siempre al modificar páginas, componentes, textos o estilos dentro de `app/`.
---
# Guardrails de UX/UI para EcoBanco Bolivia

## Restricciones Inviolables
1. **Ignorar legacy:** NUNCA leas ni modifiques `index.html` en la raíz del proyecto. Trabaja exclusivamente dentro de `app/`.
2. **Invisibilidad Web3 (Cero Jerga):** El usuario final jamás debe ver menciones a Stellar, Soroban, Pollar, Trustless Work, Web3, blockchain, cripto, wallet, llaves públicas o hashes. Usa únicamente lenguaje comunitario ("Mi Libreta", "Bs / MOTES", "1 MOTE = 1 Bs", "Pago Protegido") y sanitiza errores vía `app/lib/friendlyCopy.ts`.
3. **Identidad Dual:** Mantén el tema claro cálido ("Ajayu") como predeterminado, conserva el soporte `dark:` para Modo Noche, y respeta el slogan "Recuperando nuestro valor en comunidad".
4. **Protección de Monolitos:** `app/panel-caserita/page.tsx` y `app/panel-rider/page.tsx` son archivos muy extensos. No los reescribas desde cero ni elimines llamadas a `app/lib/store.ts`; extrae bloques visuales a `app/components/caserita/` y `app/components/rider/`.
5. **Ahorro de Megas y Fricción 0:** Toda foto subida por caseritas o riders debe pasar por `app/lib/imageCompressor.ts` antes de llegar a `app/api/storage/route.ts`. Botones principales táctiles mínimo de 48px-56px de alto.

## Verificación Obligatoria
Al terminar cualquier cambio visual o de componente:
1. Busca cadenas prohibidas (`Stellar`, `Pollar`, `Trustless`, `Wallet`, `Blockchain`) en los archivos de UI editados.
2. Ejecuta `npm run build` y corrige cualquier error antes de hacer commit.
