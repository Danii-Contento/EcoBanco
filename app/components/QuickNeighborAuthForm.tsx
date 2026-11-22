"use client";

import React, { useState } from "react";
import { CheckCircle2, Lock, Phone, ShieldCheck, User as UserIcon, X } from "lucide-react";
import { sanitizeUserError } from "@/app/lib/friendlyCopy";
import {
  formatBolivianPhoneDisplay,
  isValidBolivianPhone,
  normalizeBolivianPhone,
  sanitizeLocalPhoneInput,
} from "@/app/lib/phone";
import { User } from "@/app/types/ecobanco";

interface BolivianPhoneFieldProps {
  id?: string;
  label?: string;
  value: string;
  onChange: (digits: string) => void;
  placeholder?: string;
  required?: boolean;
  helperText?: string;
}

/**
 * Campo táctil para ingresar un celular boliviano de 8 dígitos con prefijo `+591` fijo.
 */
export function BolivianPhoneField({
  id = "neighbor-whatsapp-input",
  label = "Número de celular (WhatsApp, 8 dígitos)",
  value,
  onChange,
  placeholder = "Ej. 76543210",
  required = true,
  helperText,
}: BolivianPhoneFieldProps) {
  const localDigits = sanitizeLocalPhoneInput(value);
  const isComplete = isValidBolivianPhone(localDigits);

  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="block text-xs font-extrabold uppercase tracking-wide text-ink dark:text-arena"
      >
        {label} {required ? "*" : ""}
      </label>

      <div className="flex items-stretch rounded-2xl border-2 border-earth-border dark:border-oro/45 bg-surface dark:bg-[#0D1714] focus-within:border-primary dark:focus-within:border-brillo overflow-hidden transition-colors">
        <span
          aria-hidden="true"
          className="inline-flex items-center gap-1.5 px-3.5 bg-surface-soft dark:bg-[#14221D] border-r border-earth-border dark:border-oro/30 text-sm sm:text-base font-extrabold text-ink dark:text-brillo shrink-0 select-none"
        >
          <span>🇧🇴</span>
          <span>+591</span>
        </span>
        <input
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          required={required}
          value={localDigits}
          onChange={(e) => onChange(sanitizeLocalPhoneInput(e.target.value))}
          placeholder={placeholder}
          className="flex-1 min-w-0 min-h-[52px] px-3.5 bg-transparent text-base sm:text-lg font-bold tracking-wide text-ink dark:text-arena placeholder:text-ink-muted/60 focus:outline-none"
        />
        {isComplete && (
          <span
            aria-label="Número válido"
            className="inline-flex items-center pr-3 text-primary dark:text-[#69D86E] shrink-0"
          >
            <CheckCircle2 className="w-5 h-5" />
          </span>
        )}
      </div>

      <p className="text-xs font-semibold text-ink-muted dark:text-arena/75">
        {isComplete
          ? `✓ Listo: ${formatBolivianPhoneDisplay(localDigits)}`
          : helperText || "Solo los 8 dígitos de tu celular en Bolivia (sin correo)."}
      </p>
    </div>
  );
}

interface QuickNeighborAuthFormProps {
  initialName?: string;
  initialPhone?: string;
  title?: string;
  subtitle?: string;
  submitLabel?: string;
  pollarDraft?: {
    pollarUserId?: string | null;
    stellarAddress?: string | null;
  };
  onAuthenticated: (buyer: User) => void;
  onCancel?: () => void;
}

/**
 * Acceso rápido y protegido para vecinos: Nombre o apodo, WhatsApp (8 dígitos) y PIN de 4 números.
 */
export function QuickNeighborAuthForm({
  initialName = "",
  initialPhone = "",
  title = "Entra en 10 segundos",
  subtitle = "Ingresa tu nombre, tu WhatsApp de 8 dígitos y un PIN personal de 4 números para proteger tu saldo.",
  submitLabel = "Continuar ahora →",
  pollarDraft,
  onAuthenticated,
  onCancel,
}: QuickNeighborAuthFormProps) {
  const [nameInput, setNameInput] = useState<string>(initialName);
  const [phoneDigits, setPhoneDigits] = useState<string>(() =>
    sanitizeLocalPhoneInput(initialPhone)
  );
  const [pinInput, setPinInput] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanName = nameInput.trim();
    if (!cleanName) {
      setError("Escribe tu nombre o apodo para continuar.");
      return;
    }

    const normalizedPhone = normalizeBolivianPhone(phoneDigits);
    if (!normalizedPhone) {
      setError("Ingresa los 8 dígitos de tu WhatsApp de Bolivia (ej. 76543210).");
      return;
    }

    const cleanPin = pinInput.replace(/\D/g, "").slice(0, 4);
    if (cleanPin.length !== 4) {
      setError("Ingresa tu PIN personal de 4 números para proteger tu libreta.");
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "quick_neighbor_login",
          name: cleanName,
          phone: normalizedPhone,
          pin: cleanPin,
          pollar_user_id: pollarDraft?.pollarUserId || undefined,
          stellar_address: pollarDraft?.stellarAddress || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.buyer) {
        setError(sanitizeUserError(data.error));
        return;
      }
      onAuthenticated(data.buyer as User);
    } catch (err) {
      setError(sanitizeUserError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-left">
      <div className="space-y-1">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 dark:bg-brote/20 text-primary dark:text-[#69D86E] text-xs font-extrabold uppercase tracking-wide">
          <ShieldCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>WhatsApp + PIN de 4 números</span>
        </div>
        <h2 className="font-brand text-2xl text-ink dark:text-arena leading-tight">
          {title}
        </h2>
        <p className="text-sm text-ink-muted dark:text-arena/80 leading-relaxed">
          {subtitle}
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="p-3.5 rounded-2xl eco-alert-error text-sm font-bold"
        >
          ⚠️ {error}
        </div>
      )}

      <div className="space-y-1.5">
        <label
          htmlFor="quick-neighbor-name"
          className="block text-xs font-extrabold uppercase tracking-wide text-ink dark:text-arena"
        >
          Tu Nombre o apodo *
        </label>
        <div className="flex items-center rounded-2xl border-2 border-earth-border dark:border-oro/45 bg-surface dark:bg-[#0D1714] focus-within:border-primary dark:focus-within:border-brillo px-3.5 transition-colors">
          <UserIcon
            className="w-5 h-5 text-ink-muted dark:text-brillo shrink-0 mr-2.5"
            aria-hidden="true"
          />
          <input
            id="quick-neighbor-name"
            type="text"
            autoComplete="name"
            required
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="Ej. Doña Rosa o Carlitos"
            className="flex-1 min-w-0 min-h-[52px] bg-transparent text-base sm:text-lg font-semibold text-ink dark:text-arena placeholder:text-ink-muted/60 focus:outline-none"
          />
        </div>
      </div>

      <BolivianPhoneField
        id="quick-neighbor-phone"
        value={phoneDigits}
        onChange={setPhoneDigits}
      />

      <div className="space-y-1.5">
        <label
          htmlFor="quick-neighbor-pin"
          className="block text-xs font-extrabold uppercase tracking-wide text-ink dark:text-arena"
        >
          Tu PIN secreto de 4 números *
        </label>
        <div className="flex items-center rounded-2xl border-2 border-earth-border dark:border-oro/45 bg-surface dark:bg-[#0D1714] focus-within:border-primary dark:focus-within:border-brillo px-3.5 transition-colors">
          <Lock
            className="w-5 h-5 text-ink-muted dark:text-brillo shrink-0 mr-2.5"
            aria-hidden="true"
          />
          <input
            id="quick-neighbor-pin"
            type="password"
            inputMode="numeric"
            maxLength={4}
            required
            value={pinInput}
            onChange={(e) =>
              setPinInput(e.target.value.replace(/\D/g, "").slice(0, 4))
            }
            placeholder="Ej. 1234"
            className="flex-1 min-w-0 min-h-[52px] bg-transparent text-base sm:text-lg font-extrabold tracking-[0.3em] text-ink dark:text-arena placeholder:tracking-normal placeholder:font-semibold placeholder:text-ink-muted/60 focus:outline-none"
          />
        </div>
        <p className="text-xs font-semibold text-ink-muted dark:text-arena/75">
          Si es tu primera vez, elige 4 números para proteger tu saldo. Si ya
          tienes cuenta, escribe tu PIN.
        </p>
      </div>

      <div className="space-y-2 pt-1">
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full min-h-[54px] px-5 py-3.5 rounded-2xl bg-primary hover:bg-primary-hover text-white dark:bg-gradient-to-r dark:from-oro dark:via-brillo dark:to-oro dark:text-bosque font-brand text-lg shadow-warm-card dark:shadow-gold-glow active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
        >
          <Phone className="w-5 h-5 shrink-0" aria-hidden="true" />
          <span>{isSubmitting ? "Ingresando..." : submitLabel}</span>
        </button>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="w-full min-h-[48px] rounded-2xl text-sm font-bold text-ink-muted dark:text-arena/80 hover:text-ink dark:hover:text-arena transition-colors"
          >
            Seguir viendo sin entrar
          </button>
        )}
      </div>
    </form>
  );
}

interface QuickNeighborAuthModalProps {
  open: boolean;
  initialName?: string;
  initialPhone?: string;
  pollarDraft?: {
    pollarUserId?: string | null;
    stellarAddress?: string | null;
  };
  onClose: () => void;
  onAuthenticated: (buyer: User) => void;
}

/**
 * Modal de acceso ultrarrápido desde el marketplace o al querer ver la libreta.
 */
export function QuickNeighborAuthModal({
  open,
  initialName,
  initialPhone,
  pollarDraft,
  onClose,
  onAuthenticated,
}: QuickNeighborAuthModalProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Acceso rápido de vecino"
      className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-surface dark:bg-[#182822] border-2 border-earth-border dark:border-oro/45 shadow-warm-lg dark:shadow-gold-glow p-5 sm:p-6 relative max-h-[92vh] overflow-y-auto">
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar acceso rápido"
          className="absolute top-4 right-4 w-10 h-10 rounded-full bg-surface-soft dark:bg-bosque text-ink dark:text-arena flex items-center justify-center hover:bg-earth-border/60 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <QuickNeighborAuthForm
          initialName={initialName}
          initialPhone={initialPhone}
          pollarDraft={pollarDraft}
          onAuthenticated={(buyer) => {
            onAuthenticated(buyer);
            onClose();
          }}
          onCancel={onClose}
        />
      </div>
    </div>
  );
}
