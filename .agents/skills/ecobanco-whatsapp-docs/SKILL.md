---
name: ecobanco-whatsapp-docs
description: Preparación del puente de eventos y webhook para el Bot de WhatsApp, migración SQL aditiva en Supabase y redacción del README con FAQs para usuarios. Úsala al trabajar en WhatsApp, `supabase/schema.sql`, `README.md` o `REPORTE_AUTONOMO.md`.
---
# Puente WhatsApp y Documentación Comunitaria

## 1. Arquitectura WhatsApp-First
- Agrega al final de `supabase/schema.sql` solo sentencias seguras (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`) para `phone_whatsapp`, `whatsapp_opt_in`, `short_code` (`#ECO-XXXX`) y estados granulares de pedido.
- Crea `app/lib/whatsappBridge.ts` en modo no bloqueante (`dry-run` en consola si faltan credenciales de Meta) con tono cálido alteño ("¡Buen día caserita!...").
- Crea `app/api/whatsapp/route.ts` con `GET` (verificación Meta) y `POST` (comandos `SALDO`, `CATALOGO`, `LISTO #ECO-XXXX`, `ENTREGADO #ECO-XXXX`).

## 2. README.md y FAQs
- Redacta `README.md` en español cercano bajo el slogan "EcoBanco Bolivia — Recuperando nuestro valor en comunidad".
- Incluye: qué es, cómo funciona paso a paso para Vecinos, Caseritas y Eco-Riders, explicación de MOTES (1 MOTE = 1 Bs), Pago Protegido, mínimo 10 FAQs sin jerga cripto y una sección técnica separada al final para despliegue en Testnet.

## Verificación Obligatoria
- Ejecuta `npm run build` y deja el resumen final de todo lo ejecutado en `REPORTE_AUTONOMO.md`.
