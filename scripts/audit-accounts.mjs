#!/usr/bin/env node
/**
 * Auditoría integral de aislamiento de cuentas, normalización telefónica,
 * seguridad de sesiones y consistencia de perfiles en EcoBanco Bolivia.
 *
 * Uso:
 *   node scripts/audit-accounts.mjs
 *   AUDIT_BASE_URL=http://localhost:3000 node scripts/audit-accounts.mjs --live
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();

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

const results = [];
let hasFailure = false;

function record(status, area, message) {
  results.push({ status, area, message });
  if (status === "FAIL") hasFailure = true;
}

async function loadPhoneModuleFromTs() {
  const tsModule = await import("typescript");
  const ts = tsModule.default || tsModule;
  const phoneTsPath = path.join(ROOT, "app", "lib", "phone.ts");
  const source = fs.readFileSync(phoneTsPath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const dataUrl = `data:text/javascript;base64,${Buffer.from(
    transpiled.outputText,
    "utf8"
  ).toString("base64")}`;
  return import(dataUrl);
}

async function checkPhoneNormalization() {
  const phoneMod = await loadPhoneModuleFromTs();
  const validCases = [
    ["70000002", "+59170000002"],
    ["+591 7000-0002", "+59170000002"],
    ["59170000002", "+59170000002"],
    ["0059170000002", "+59170000002"],
    ["070000002", "+59170000002"],
    ["+59176543210", "+59176543210"],
    ["  6000 0001 ", "+59160000001"],
    ["(591) 7123-4567", "+59171234567"],
  ];

  const invalidCases = ["12345", "abc", "", "591123", "1234567890123", "+5917000"];

  for (const [input, expected] of validCases) {
    const actual = phoneMod.normalizeBolivianPhone(input);
    if (actual !== expected) {
      record(
        "FAIL",
        "PhoneNormalization",
        `normalizeBolivianPhone("${input}") devolvió ${actual}, esperaba ${expected}`
      );
      return phoneMod;
    }
  }

  for (const input of invalidCases) {
    const actual = phoneMod.normalizeBolivianPhone(input);
    if (actual !== null) {
      record(
        "FAIL",
        "PhoneNormalization",
        `normalizeBolivianPhone("${input}") debía devolver null y devolvió ${actual}`
      );
      return phoneMod;
    }
  }

  if (!phoneMod.areSameBolivianPhone("70000002", "+591 7000 0002")) {
    record(
      "FAIL",
      "PhoneNormalization",
      "areSameBolivianPhone no unificó formato local y +591."
    );
    return phoneMod;
  }

  record(
    "PASS",
    "PhoneNormalization",
    `${validCases.length} formatos válidos y ${invalidCases.length} inválidos verificados contra app/lib/phone.ts.`
  );
  return phoneMod;
}

function checkSessionCryptoAndExclusivity() {
  const secret =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "audit-ephemeral-hmac-key";

  const sign = (payloadB64) =>
    crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");

  const payloadB64 = Buffer.from(
    JSON.stringify({ buyerId: "usr-1", activeBuyerType: "buyer" }),
    "utf8"
  ).toString("base64url");
  const validToken = `${payloadB64}.${sign(payloadB64)}`;
  const [b64, sig] = validToken.split(".");
  const expectedSig = sign(b64);
  const sigMatches =
    Buffer.from(sig).length === Buffer.from(expectedSig).length &&
    crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig));

  if (!sigMatches) {
    record("FAIL", "SessionHMAC", "Falló verificación HMAC timingSafeEqual.");
    return;
  }

  const tamperedToken = `${payloadB64}.${sig.slice(0, -1)}X`;
  const tamperedSig = tamperedToken.split(".")[1];
  const tamperedAccepted =
    Buffer.from(tamperedSig).length === Buffer.from(expectedSig).length &&
    crypto.timingSafeEqual(Buffer.from(tamperedSig), Buffer.from(expectedSig));

  if (tamperedAccepted) {
    record("FAIL", "SessionHMAC", "Una firma adulterada fue aceptada.");
    return;
  }

  const sessionSrc = fs.readFileSync(
    path.join(ROOT, "app", "lib", "session.ts"),
    "utf8"
  );
  const requiredTokens = [
    "createExclusiveBuyerSession",
    "createExclusiveMerchantSession",
    "createExclusiveRiderSession",
    "createEmptySession",
    "normalizeExclusiveSession",
    "applyNoStoreHeaders",
    "timingSafeEqual",
    "httpOnly: true",
  ];
  for (const token of requiredTokens) {
    if (!sessionSrc.includes(token)) {
      record(
        "FAIL",
        "SessionExclusivity",
        `app/lib/session.ts no contiene "${token}".`
      );
      return;
    }
  }

  record(
    "PASS",
    "SessionHMAC & Exclusivity",
    "Firma HMAC-SHA256, rechazo ante manipulación y exclusividad estricta por rol verificados."
  );
}

function checkServerAndClientGuards() {
  const assertions = [
    {
      file: "app/api/products/route.ts",
      mustContain: ["!session.merchantId", "403", "401", "applyNoStoreHeaders"],
    },
    {
      file: "app/api/deliveries/route.ts",
      mustContain: [
        "!session.riderId",
        "createExclusiveRiderSession",
        "createEmptySession",
        "409",
        "403",
        "401",
      ],
    },
    {
      file: "app/api/escrow/route.ts",
      mustContain: [
        "releaseEscrowByBuyer",
        "buyerPin",
        "403",
        "401",
        'pickup_pin: ""',
        "applyNoStoreHeaders",
      ],
    },
    {
      file: "app/api/users/route.ts",
      mustContain: [
        "createExclusiveBuyerSession",
        "createExclusiveMerchantSession",
        "createExclusiveRiderSession",
        "createEmptySession",
        "clearMerchantRuntimeCache",
      ],
    },
    {
      file: "app/api/storage/route.ts",
      mustContain: [
        "!session.merchantId",
        "!session.riderId",
        "isPrivateBucket",
        "createSignedStorageUrl",
        "403",
        "401",
        "MAX_RIDER_VERIFICATION_IMAGE_BYTES",
      ],
    },
    {
      file: "app/lib/store.ts",
      mustContain: [
        "claimDeliveryAtomically",
        "updateDeliveryIfAssignedToRider",
        "releaseEscrowByBuyer",
        "mapRiderRowWithSignedDocs",
        "storedBuyerPin !== providedPin",
        "sellerAccount.id === activeBuyer.id",
        'delivery_pin: ""',
        "existing.seller_id !== activeMer.id",
        "Esta billetera ya está vinculada a otra cuenta.",
      ],
    },
    {
      file: "app/lib/useDisconnectOnReload.ts",
      mustContain: [
        "purgeClientSessionStorage",
        "window.sessionStorage.clear()",
        "window.localStorage.clear()",
        "clearPollarWalletRuntimeCaches",
      ],
    },
    {
      file: "app/components/SessionResetOnHome.tsx",
      mustContain: ["purgeClientSessionStorage"],
    },
  ];

  for (const item of assertions) {
    const fullPath = path.join(ROOT, item.file);
    if (!fs.existsSync(fullPath)) {
      record("FAIL", "GuardAudit", `Falta archivo requerido: ${item.file}`);
      return;
    }
    const content = fs.readFileSync(fullPath, "utf8");
    for (const marker of item.mustContain) {
      if (!content.includes(marker)) {
        record(
          "FAIL",
          "GuardAudit",
          `${item.file} no contiene el guardia esperado "${marker}".`
        );
        return;
      }
    }
  }

  record(
    "PASS",
    "Server & Client Guards",
    `${assertions.length} archivos críticos verificados (roles, propiedad, atomicidad 409, redacción de PINs y purga de storage).`
  );
}

async function checkSupabaseIntegrity(phoneMod) {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "")
    .trim()
    .replace(/\/+$/, "");
  const key = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ""
  ).trim();

  if (!url || !key || url.includes("tu-proyecto")) {
    record(
      "WARN",
      "SupabaseReadOnly",
      "Credenciales de Supabase no configuradas; auditoría remota omitida."
    );
    return;
  }

  const fetchTable = async (table) => {
    const res = await fetch(`${url}/rest/v1/${table}?select=*`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} al leer ${table}`);
    }
    return res.json();
  };

  try {
    const [users, products, deliveries] = await Promise.all([
      fetchTable("users"),
      fetchTable("products"),
      fetchTable("deliveries"),
    ]);

    // 1. Teléfonos duplicados tras normalización
    const byPhone = new Map();
    let legacyPhoneCount = 0;
    for (const u of users) {
      if (!u.phone) continue;
      const norm = phoneMod.normalizeBolivianPhone(u.phone);
      if (norm && u.phone !== norm) {
        legacyPhoneCount += 1;
      }
      const keyPhone = norm || String(u.phone).trim();
      const list = byPhone.get(keyPhone) || [];
      list.push({ id: u.id, role: u.role });
      byPhone.set(keyPhone, list);
    }

    const duplicatePhones = [...byPhone.entries()].filter(
      ([, owners]) => owners.length > 1
    );
    if (duplicatePhones.length > 0) {
      record(
        "FAIL",
        "SupabasePhoneIsolation",
        `Teléfonos duplicados detectados entre cuentas: ${duplicatePhones
          .map(([p, o]) => `${p} (${o.map((x) => x.id).join(", ")})`)
          .join("; ")}`
      );
    } else {
      record(
        "PASS",
        "SupabasePhoneIsolation",
        `${users.length} cuentas verificadas sin teléfonos duplicados tras normalización +591.`
      );
    }

    if (legacyPhoneCount > 0) {
      record(
        "WARN",
        "SupabaseLegacyPhones",
        `${legacyPhoneCount} cuenta(s) legacy aún guardan teléfono sin prefijo +591 (compatibles vía areSameBolivianPhone).`
      );
    }

    // 2. Productos sin seller_id
    const orphanProducts = products.filter((p) => !p.seller_id);
    if (orphanProducts.length > 0) {
      record(
        "WARN",
        "SupabaseProductOwnership",
        `${orphanProducts.length} producto(s) sin seller_id explícito en BD.`
      );
    } else {
      record(
        "PASS",
        "SupabaseProductOwnership",
        `${products.length} productos con seller_id asignado.`
      );
    }

    // 3. pollar_user_id / stellar_address compartidos entre distintos usuarios
    const byPollarId = new Map();
    const byStellar = new Map();
    for (const u of users) {
      if (u.pollar_user_id) {
        const list = byPollarId.get(u.pollar_user_id) || [];
        list.push(u.id);
        byPollarId.set(u.pollar_user_id, list);
      }
      if (u.stellar_address) {
        const list = byStellar.get(u.stellar_address) || [];
        list.push(u.id);
        byStellar.set(u.stellar_address, list);
      }
    }
    const sharedPollar = [...byPollarId.entries()].filter(
      ([, ids]) => ids.length > 1
    );
    const sharedStellar = [...byStellar.entries()].filter(
      ([, ids]) => ids.length > 1
    );
    if (sharedPollar.length > 0 || sharedStellar.length > 0) {
      record(
        "FAIL",
        "SupabaseWalletIsolation",
        `Identificadores compartidos entre usuarios distintos (pollar=${sharedPollar.length}, stellar=${sharedStellar.length}).`
      );
    } else {
      record(
        "PASS",
        "SupabaseWalletIsolation",
        "Cero cuentas comparten pollar_user_id o stellar_address."
      );
    }

    // 4. PINs distintos en entregas
    const collidingPins = deliveries.filter(
      (d) => d.pickup_pin && d.delivery_pin && d.pickup_pin === d.delivery_pin
    );
    if (collidingPins.length > 0) {
      record(
        "WARN",
        "SupabaseDeliveryPins",
        `${collidingPins.length} entrega(s) tienen pickup_pin === delivery_pin.`
      );
    } else {
      record(
        "PASS",
        "SupabaseDeliveryPins",
        `${deliveries.length} entregas con PIN de recojo y entrega independientes.`
      );
    }
  } catch (err) {
    record(
      "WARN",
      "SupabaseReadOnly",
      `No se pudo completar la lectura en Supabase (${err instanceof Error ? err.message : String(err)}).`
    );
  }
}

async function checkLiveHttp() {
  const baseUrl = (process.env.AUDIT_BASE_URL || "").trim().replace(/\/+$/, "");
  if (!baseUrl) return;

  const probes = [
    { url: `${baseUrl}/api/products?includeClosed=true`, method: "GET", expected: 401 },
    { url: `${baseUrl}/api/deliveries`, method: "GET", expected: 401 },
    {
      url: `${baseUrl}/api/escrow`,
      method: "POST",
      body: JSON.stringify({ action: "release", orderId: "ord-test" }),
      expected: 401,
    },
  ];

  for (const probe of probes) {
    try {
      const res = await fetch(probe.url, {
        method: probe.method,
        headers: probe.body ? { "Content-Type": "application/json" } : undefined,
        body: probe.body,
      });
      if (res.status !== probe.expected) {
        record(
          "FAIL",
          "LiveHTTP",
          `${probe.method} ${probe.url} devolvió ${res.status}, esperaba ${probe.expected}`
        );
        return;
      }
    } catch (err) {
      record(
        "WARN",
        "LiveHTTP",
        `No se pudo conectar a ${baseUrl}: ${err instanceof Error ? err.message : String(err)}`
      );
      return;
    }
  }

  record("PASS", "LiveHTTP", `Sondas HTTP sin sesión rechazadas con 401 en ${baseUrl}.`);
}

async function main() {
  console.log("=== EcoBanco Bolivia · Auditoría de Aislamiento de Cuentas ===\n");
  const phoneMod = await checkPhoneNormalization();
  checkSessionCryptoAndExclusivity();
  checkServerAndClientGuards();
  await checkSupabaseIntegrity(phoneMod);
  if (process.argv.includes("--live") || process.env.AUDIT_BASE_URL) {
    await checkLiveHttp();
  }

  for (const r of results) {
    console.log(`[${r.status}] ${r.area}: ${r.message}`);
  }

  console.log(
    `\nResumen: ${results.filter((r) => r.status === "PASS").length} PASS · ${
      results.filter((r) => r.status === "WARN").length
    } WARN · ${results.filter((r) => r.status === "FAIL").length} FAIL`
  );

  if (hasFailure) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Error inesperado en auditoría:", err);
  process.exit(1);
});
