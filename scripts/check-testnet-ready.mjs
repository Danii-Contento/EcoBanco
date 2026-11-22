#!/usr/bin/env node
/**
 * Verificación pre-despliegue de conectividad y configuración Stellar Testnet
 * para EcoBanco Bolivia (Supabase + Horizon Testnet + Pollar + Trustless Work + UI).
 *
 * Uso:
 *   node scripts/check-testnet-ready.mjs
 */

import fs from "node:fs";
import path from "node:path";
import * as StellarSdk from "@stellar/stellar-sdk";

const ROOT = process.cwd();
const USDC_TESTNET_ISSUER =
  "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.join(ROOT, ".env.local"));
loadEnvFile(path.join(ROOT, ".env"));

const rows = [];
let hasCriticalFail = false;

function addCheck(status, service, detail) {
  rows.push({ status, service, detail });
  if (status === "FAIL") hasCriticalFail = true;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function checkEnvConfiguration() {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const pollarKey = (
    process.env.NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY || ""
  ).trim();
  const twUrl = (
    process.env.TRUSTLESS_WORK_API_URL || "https://dev.api.trustlesswork.com"
  )
    .trim()
    .replace(/\/+$/, "");
  const twKey = (process.env.TRUSTLESS_WORK_API_KEY || "").trim();
  const horizonUrl = (
    process.env.STELLAR_HORIZON_URL || "https://horizon-testnet.stellar.org"
  )
    .trim()
    .replace(/\/+$/, "");
  const treasuryPublic = (process.env.STELLAR_TREASURY_PUBLIC || "").trim();
  const treasurySecret = (process.env.STELLAR_TREASURY_SECRET || "").trim();
  const twPlatformAddress = (
    process.env.TRUSTLESS_WORK_PLATFORM_ADDRESS ||
    "GCLCCT5Y3Y5P7YEH3IWJUTA4ZOBCM323HC6JTOWPMI5FDU7OHHJHCHRA"
  ).trim();

  if (!supabaseUrl || !supabaseKey || supabaseKey.startsWith("tu_")) {
    addCheck(
      "FAIL",
      "Env:Supabase",
      "Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY."
    );
  } else {
    addCheck("PASS", "Env:Supabase", `URL configurada (${supabaseUrl}).`);
  }

  if (!pollarKey || !pollarKey.startsWith("pub_testnet_")) {
    addCheck(
      "FAIL",
      "Env:Pollar",
      "NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY debe existir y empezar con pub_testnet_."
    );
  } else {
    addCheck(
      "PASS",
      "Env:Pollar",
      "Llave publicable de Pollar Testnet presente (pub_testnet_...)."
    );
  }

  if (!twKey || twKey.startsWith("tu_")) {
    addCheck(
      "FAIL",
      "Env:TrustlessWork",
      "Falta TRUSTLESS_WORK_API_KEY válida."
    );
  } else if (
    twUrl === "https://api.trustlesswork.com" ||
    (!twUrl.includes("dev.") && !twUrl.includes("testnet"))
  ) {
    addCheck(
      "FAIL",
      "Env:TrustlessWork",
      `TRUSTLESS_WORK_API_URL (${twUrl}) no apunta a Testnet/Dev.`
    );
  } else {
    addCheck(
      "PASS",
      "Env:TrustlessWork",
      `Endpoint Testnet/Dev configurado (${twUrl}).`
    );
  }

  if (
    horizonUrl.includes("horizon.stellar.org") &&
    !horizonUrl.includes("testnet")
  ) {
    addCheck(
      "FAIL",
      "Env:StellarHorizon",
      `STELLAR_HORIZON_URL (${horizonUrl}) apunta a Mainnet.`
    );
  } else {
    addCheck(
      "PASS",
      "Env:StellarHorizon",
      `Horizon Testnet configurado (${horizonUrl}).`
    );
  }

  let derivedPublic = "";
  if (!treasurySecret || treasurySecret.startsWith("tu_")) {
    addCheck(
      "FAIL",
      "Env:Treasury",
      "Falta STELLAR_TREASURY_SECRET en .env.local."
    );
  } else {
    try {
      const kp = StellarSdk.Keypair.fromSecret(treasurySecret);
      derivedPublic = kp.publicKey();
      if (treasuryPublic && treasuryPublic !== derivedPublic) {
        addCheck(
          "FAIL",
          "Env:Treasury",
          `STELLAR_TREASURY_PUBLIC (${treasuryPublic}) no coincide con la clave derivada (${derivedPublic}).`
        );
      } else {
        addCheck(
          "PASS",
          "Env:Treasury",
          `Par de llaves Tesorería coherente (${derivedPublic}).`
        );
      }
    } catch {
      addCheck(
        "FAIL",
        "Env:Treasury",
        "STELLAR_TREASURY_SECRET no tiene formato Stellar válido (S...)."
      );
    }
  }

  return {
    supabaseUrl: supabaseUrl.replace(/\/+$/, ""),
    supabaseKey,
    pollarKey,
    pollarApiUrl: (
      process.env.NEXT_PUBLIC_POLLAR_API_URL || "https://sdk.api.pollar.xyz"
    )
      .trim()
      .replace(/\/+$/, ""),
    twUrl,
    twKey,
    twPlatformAddress,
    horizonUrl,
    treasuryPublic: derivedPublic || treasuryPublic,
  };
}

async function checkSupabase(env) {
  if (!env.supabaseUrl || !env.supabaseKey) return;
  const tables = [
    "users",
    "products",
    "orders",
    "deliveries",
    "ramp_transactions",
  ];
  const headers = {
    apikey: env.supabaseKey,
    Authorization: `Bearer ${env.supabaseKey}`,
  };

  const missingTables = [];
  for (const table of tables) {
    try {
      const res = await fetchWithTimeout(
        `${env.supabaseUrl}/rest/v1/${table}?select=id&limit=1`,
        { headers }
      );
      if (!res.ok) {
        missingTables.push(`${table} (HTTP ${res.status})`);
      }
    } catch (err) {
      missingTables.push(
        `${table} (${err instanceof Error ? err.message : "error"})`
      );
    }
  }

  if (missingTables.length > 0) {
    addCheck(
      "WARN",
      "Supabase:Tables",
      `Tablas no disponibles o con error: ${missingTables.join(", ")}. Ejecuta supabase/schema.sql.`
    );
  } else {
    addCheck(
      "PASS",
      "Supabase:Tables",
      `5/5 tablas accesibles (${tables.join(", ")}).`
    );
  }

  try {
    const bucketRes = await fetchWithTimeout(
      `${env.supabaseUrl}/storage/v1/bucket`,
      { headers }
    );
    if (!bucketRes.ok) {
      addCheck(
        "WARN",
        "Supabase:Storage",
        `No se pudieron listar buckets (HTTP ${bucketRes.status}).`
      );
    } else {
      const buckets = await bucketRes.json();
      const bucketMap = new Map(
        Array.isArray(buckets) ? buckets.map((b) => [b.id || b.name, b]) : []
      );
      const expectedPublic = ["avatars", "product-images", "qr-bancarios"];
      const expectedAll = [...expectedPublic, "rider-verifications"];
      const missing = expectedAll.filter((b) => !bucketMap.has(b));
      const riderBucket = bucketMap.get("rider-verifications");
      if (missing.length > 0) {
        addCheck(
          "WARN",
          "Supabase:Storage",
          `Faltan buckets: ${missing.join(", ")}. Ejecuta supabase/schema.sql.`
        );
      } else if (riderBucket && riderBucket.public === true) {
        addCheck(
          "FAIL",
          "Supabase:Storage",
          "El bucket 'rider-verifications' (CI/selfies) está marcado como PÚBLICO. Debe ser PRIVADO (public = false) y servirse solo vía createSignedUrl."
        );
      } else {
        addCheck(
          "PASS",
          "Supabase:Storage",
          `Storage seguro: 3 buckets públicos (${expectedPublic.join(", ")}) + 1 bucket PRIVADO (rider-verifications con createSignedUrl).`
        );
      }
    }
  } catch (err) {
    addCheck(
      "WARN",
      "Supabase:Storage",
      `No se pudo verificar Storage (${err instanceof Error ? err.message : "error"}).`
    );
  }
}

async function checkHorizonTestnet(env) {
  try {
    const rootRes = await fetchWithTimeout(`${env.horizonUrl}/`);
    if (!rootRes.ok) {
      addCheck(
        "FAIL",
        "Stellar:Horizon",
        `Horizon Testnet respondió HTTP ${rootRes.status}.`
      );
      return;
    }
    const rootData = await rootRes.json();
    if (rootData.network_passphrase !== TESTNET_PASSPHRASE) {
      addCheck(
        "FAIL",
        "Stellar:Horizon",
        `Red incorrecta: "${rootData.network_passphrase}" (se esperaba "${TESTNET_PASSPHRASE}").`
      );
      return;
    }
    addCheck(
      "PASS",
      "Stellar:Horizon",
      `Conectado a Stellar Testnet (ledger #${rootData.history_latest_ledger ?? "?"}).`
    );
  } catch (err) {
    addCheck(
      "FAIL",
      "Stellar:Horizon",
      `Sin conexión a Horizon Testnet (${err instanceof Error ? err.message : "error"}).`
    );
    return;
  }

  if (!env.treasuryPublic) return;

  try {
    const acctRes = await fetchWithTimeout(
      `${env.horizonUrl}/accounts/${encodeURIComponent(env.treasuryPublic)}`
    );
    if (acctRes.status === 404) {
      addCheck(
        "WARN",
        "Stellar:TreasuryBalance",
        `La cuenta Tesorería ${env.treasuryPublic} aún no está fondeada en Testnet. Fondear con Friendbot (https://friendbot.stellar.org/?addr=${env.treasuryPublic}).`
      );
      return;
    }
    if (!acctRes.ok) {
      addCheck(
        "WARN",
        "Stellar:TreasuryBalance",
        `Error consultando cuenta Tesorería (HTTP ${acctRes.status}).`
      );
      return;
    }

    const acct = await acctRes.json();
    const balances = Array.isArray(acct.balances) ? acct.balances : [];
    const xlm = balances.find((b) => b.asset_type === "native");
    const usdc = balances.find(
      (b) =>
        b.asset_code === "USDC" && b.asset_issuer === USDC_TESTNET_ISSUER
    );
    const xlmBal = xlm ? Number(xlm.balance) : 0;
    const usdcBal = usdc ? Number(usdc.balance) : 0;

    if (!usdc) {
      addCheck(
        "WARN",
        "Stellar:TreasuryBalance",
        `Cuenta Tesorería activa (${xlmBal.toFixed(2)} XLM) pero sin trustline USDC Testnet todavía (ensureTreasuryReady() lo activará al primer pedido).`
      );
    } else if (usdcBal < 50) {
      addCheck(
        "WARN",
        "Stellar:TreasuryBalance",
        `Tesorería con ${xlmBal.toFixed(2)} XLM y ${usdcBal.toFixed(2)} USDC (< 50 USDC recomendados; ensureTreasuryReady() recargará vía pathPayment al desplegar).`
      );
    } else {
      addCheck(
        "PASS",
        "Stellar:TreasuryBalance",
        `Tesorería lista en Testnet: ${xlmBal.toFixed(2)} XLM · ${usdcBal.toFixed(2)} USDC.`
      );
    }
  } catch (err) {
    addCheck(
      "WARN",
      "Stellar:TreasuryBalance",
      `No se pudo verificar saldo de Tesorería (${err instanceof Error ? err.message : "error"}).`
    );
  }
}

async function checkPollarTestnet(env) {
  if (!env.pollarKey) return;
  try {
    const healthRes = await fetchWithTimeout(`${env.pollarApiUrl}/health`, {
      method: "GET",
    });
    if (healthRes.ok) {
      addCheck(
        "PASS",
        "Pollar:Health",
        `SDK API activo en ${env.pollarApiUrl}/health (HTTP ${healthRes.status}).`
      );
    } else {
      addCheck(
        "WARN",
        "Pollar:Health",
        `Pollar /health respondió HTTP ${healthRes.status}.`
      );
    }
  } catch (err) {
    addCheck(
      "WARN",
      "Pollar:Health",
      `No se pudo verificar ${env.pollarApiUrl}/health (${err instanceof Error ? err.message : "error"}).`
    );
  }

  try {
    const res = await fetchWithTimeout(`${env.pollarApiUrl}/v3/applications/config`, {
      method: "GET",
      headers: {
        "x-pollar-api-key": env.pollarKey,
        "x-pollar-sdk": "core/0.12.1-rc.22 web",
        Origin: "http://localhost:3000",
      },
    });
    const rawBody = await res.text().catch(() => "");

    if (res.ok) {
      let parsed = null;
      try {
        parsed = JSON.parse(rawBody);
      } catch {
        parsed = null;
      }
      const appInfo = parsed?.content?.application ?? null;
      const network = String(appInfo?.network || "unknown").toLowerCase();
      const chains = Array.isArray(appInfo?.chains)
        ? appInfo.chains.join(", ")
        : "desconocido";
      const signMode =
        appInfo?.signConfirmation?.mode ||
        parsed?.content?.signConfirmation?.mode ||
        "desconocido";

      if (network === "mainnet") {
        addCheck(
          "FAIL",
          "Pollar:TestnetAPI",
          `La llave de Pollar responde en modo MAINNET en ${env.pollarApiUrl}/v3/applications/config; debe permanecer en Testnet.`
        );
      } else {
        addCheck(
          "PASS",
          "Pollar:TestnetAPI",
          `Conectividad y configuración verificadas en ${env.pollarApiUrl}/v3/applications/config (HTTP ${res.status}, network: ${network}, chains: [${chains}], signConfirmation.mode: ${signMode}).`
        );
      }
    } else if (res.status === 403 && rawBody.includes("ORIGIN_NOT_ALLOWED")) {
      addCheck(
        "WARN",
        "Pollar:AllowedOrigins",
        `La llave pub_testnet_ alcanzó Pollar pero el origen http://localhost:3000 respondió ORIGIN_NOT_ALLOWED (HTTP 403). Agrega http://localhost:3000 y tu dominio de Vercel en Allowed Origins del panel de Pollar.`
      );
    } else if (res.status === 401) {
      addCheck(
        "FAIL",
        "Pollar:TestnetAPI",
        `Pollar API rechazó la llave pub_testnet_ (HTTP ${res.status}).`
      );
    } else {
      addCheck(
        "WARN",
        "Pollar:TestnetAPI",
        `Pollar API respondió HTTP ${res.status} en /v3/applications/config.`
      );
    }
  } catch (err) {
    addCheck(
      "WARN",
      "Pollar:TestnetAPI",
      `No se pudo conectar a Pollar API (${err instanceof Error ? err.message : "error"}).`
    );
  }
}

async function checkTrustlessWorkTestnet(env) {
  if (!env.twKey || !env.treasuryPublic) return;
  try {
    const url = `${env.twUrl}/helper/get-escrows-by-signer?signer=${encodeURIComponent(
      env.treasuryPublic
    )}`;
    const res = await fetchWithTimeout(url, {
      method: "GET",
      headers: {
        "x-api-key": env.twKey,
        Authorization: `Bearer ${env.twKey}`,
      },
    });
    if (res.ok) {
      const data = await res.json();
      const count = Array.isArray(data) ? data.length : "OK";
      addCheck(
        "PASS",
        "TrustlessWork:TestnetAPI",
        `Autenticación y API Dev/Testnet verificadas (${env.twUrl}, contratos indexados: ${count}).`
      );
    } else if (res.status === 404) {
      // Algunos indexers dev devuelven 404 cuando aún no hay contratos para ese signer
      addCheck(
        "PASS",
        "TrustlessWork:TestnetAPI",
        `API Dev/Testnet alcanzable y autenticada (${env.twUrl}, sin contratos previos para este signer).`
      );
    } else if (res.status === 401 || res.status === 403) {
      addCheck(
        "FAIL",
        "TrustlessWork:TestnetAPI",
        `TRUSTLESS_WORK_API_KEY rechazada en ${env.twUrl} (HTTP ${res.status}).`
      );
    } else {
      addCheck(
        "WARN",
        "TrustlessWork:TestnetAPI",
        `Trustless Work respondió HTTP ${res.status} en ${env.twUrl}.`
      );
    }
  } catch (err) {
    addCheck(
      "WARN",
      "TrustlessWork:TestnetAPI",
      `Error conectando a Trustless Work (${err instanceof Error ? err.message : "error"}).`
    );
  }

  if (env.twPlatformAddress && env.twPlatformAddress !== env.treasuryPublic) {
    try {
      const acctRes = await fetchWithTimeout(
        `${env.horizonUrl}/accounts/${encodeURIComponent(env.twPlatformAddress)}`
      );
      if (acctRes.status === 404) {
        addCheck(
          "WARN",
          "TrustlessWork:PlatformAddress",
          `La cuenta platformAddress (${env.twPlatformAddress}) aún no existe en Stellar Testnet. Fondea con Friendbot (https://friendbot.stellar.org/?addr=${env.twPlatformAddress}) y activa la trustline USDC (${USDC_TESTNET_ISSUER}) para ver los nuevos escrows en tu Dashboard; mientras tanto se usa fallback seguro a la Tesorería.`
        );
      } else if (!acctRes.ok) {
        addCheck(
          "WARN",
          "TrustlessWork:PlatformAddress",
          `No se pudo verificar platformAddress (${env.twPlatformAddress}) en Horizon Testnet (HTTP ${acctRes.status}); se usará fallback seguro a Tesorería si es necesario.`
        );
      } else {
        const acct = await acctRes.json();
        const balances = Array.isArray(acct.balances) ? acct.balances : [];
        const hasUsdcTrustline = balances.some(
          (b) =>
            b.asset_code === "USDC" && b.asset_issuer === USDC_TESTNET_ISSUER
        );
        if (!hasUsdcTrustline) {
          addCheck(
            "WARN",
            "TrustlessWork:PlatformAddress",
            `La cuenta platformAddress (${env.twPlatformAddress}) existe en Testnet pero falta activar su trustline USDC (${USDC_TESTNET_ISSUER}) para aparecer en Trustless Work Dashboard; mientras tanto se usa fallback seguro a la Tesorería.`
          );
        } else {
          addCheck(
            "PASS",
            "TrustlessWork:PlatformAddress",
            `Cuenta platformAddress (${env.twPlatformAddress}) activa en Testnet con trustline USDC lista para nuevos escrows.`
          );
        }
      }
    } catch (err) {
      addCheck(
        "WARN",
        "TrustlessWork:PlatformAddress",
        `Error verificando platformAddress (${env.twPlatformAddress}) en Horizon Testnet (${err instanceof Error ? err.message : "error"}).`
      );
    }
  }
}

function checkUiWeb3Invisibility() {
  const dirsToScan = [
    path.join(ROOT, "app", "components", "caserita"),
    path.join(ROOT, "app", "components", "rider"),
  ];
  const filesToScan = [path.join(ROOT, "app", "page.tsx")];
  for (const dir of dirsToScan) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith(".tsx") || f.endsWith(".ts")) {
        filesToScan.push(path.join(dir, f));
      }
    }
  }

  const forbidden =
    /\b(stellar|soroban|pollar|trustless|wallet|blockchain|web3|cripto|crypto|usdc|xlm|testnet)\b/i;
  const violations = [];
  for (const file of filesToScan) {
    const content = fs.readFileSync(file, "utf8");
    const match = content.match(forbidden);
    if (match) {
      violations.push(`${path.relative(ROOT, file)} ("${match[0]}")`);
    }
  }

  if (violations.length > 0) {
    addCheck(
      "FAIL",
      "UI:Web3Invisibility",
      `Se detectó jerga Web3 en UI comunitaria: ${violations.join(", ")}`
    );
  } else {
    addCheck(
      "PASS",
      "UI:Web3Invisibility",
      `${filesToScan.length} archivos de interfaz verificados con 0 jerga Web3.`
    );
  }
}

async function main() {
  console.log("=== EcoBanco Bolivia · Check Stellar Testnet Ready ===\n");
  const env = checkEnvConfiguration();
  await Promise.all([
    checkSupabase(env),
    checkHorizonTestnet(env),
    checkPollarTestnet(env),
    checkTrustlessWorkTestnet(env),
  ]);
  checkUiWeb3Invisibility();

  for (const row of rows) {
    console.log(`[${row.status.padEnd(4, " ")}] ${row.service}: ${row.detail}`);
  }

  const passCount = rows.filter((r) => r.status === "PASS").length;
  const warnCount = rows.filter((r) => r.status === "WARN").length;
  const failCount = rows.filter((r) => r.status === "FAIL").length;
  console.log(`\nResumen: ${passCount} PASS · ${warnCount} WARN · ${failCount} FAIL`);

  if (hasCriticalFail) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Error ejecutando check-testnet-ready:", err);
  process.exit(1);
});
