"use client";

import React from "react";
import { COMMUNITY_COPY, formatBs } from "@/app/lib/friendlyCopy";

interface QuickProductModalProps {
  open: boolean;
  step: "edit" | "preview";
  isEditing: boolean;
  storeName: string;
  name: string;
  priceMotes: string;
  imageUrl: string;
  compressedKb: number | null;
  isUploadingImage: boolean;
  isSubmitting: boolean;
  error: string | null;
  priceInputRef: React.RefObject<HTMLInputElement>;
  onNameChange: (value: string) => void;
  onPriceChange: (value: string) => void;
  onSelectFile: (file: File) => void;
  onContinueToPreview: (e: React.FormEvent) => void;
  onCorrectPrice: () => void;
  onConfirmPublish: () => void;
  onClose: () => void;
}

/**
 * Modal de publicación rápida de producto en 3 campos obligatorios
 * (1. Foto con compresión Modo Megas, 2. Nombre, 3. Precio en Bs) + vista previa.
 */
export function QuickProductModal({
  open,
  step,
  isEditing,
  storeName,
  name,
  priceMotes,
  imageUrl,
  compressedKb,
  isUploadingImage,
  isSubmitting,
  error,
  priceInputRef,
  onNameChange,
  onPriceChange,
  onSelectFile,
  onContinueToPreview,
  onCorrectPrice,
  onConfirmPublish,
  onClose,
}: QuickProductModalProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isEditing ? "Editar producto" : "Subir producto en 3 pasos"}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
    >
      <div className="max-w-md w-full rounded-2xl eco-card p-5 sm:p-6 space-y-5 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-brand text-2xl eco-text">
            {step === "preview"
              ? "¿Se ve bien tu producto?"
              : isEditing
              ? "Editar Producto"
              : "Subir Producto (3 pasos)"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[48px] px-3 rounded-xl text-sm font-extrabold eco-text-muted hover:eco-text"
          >
            ✕ Cerrar
          </button>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl eco-alert-error text-sm font-bold">
            ⚠️ {error}
          </div>
        )}

        {step === "edit" ? (
          <form onSubmit={onContinueToPreview} className="space-y-4">
            {/* Campo 1: Foto con compresión automática */}
            <div className="rounded-2xl eco-inset p-4 space-y-2">
              <span className="block text-sm font-extrabold uppercase eco-text-gold">
                1. Foto del producto
              </span>
              <label className="block w-full rounded-2xl border-2 border-dashed border-oro/70 p-4 text-center cursor-pointer transition">
                {imageUrl ? (
                  <div className="space-y-2">
                    <img
                      src={imageUrl}
                      alt="Vista previa del producto"
                      className="w-full h-44 object-cover rounded-xl mx-auto"
                    />
                    <span className="inline-block text-sm font-extrabold eco-text-gold">
                      📷 Toca aquí para cambiar la foto
                    </span>
                    {compressedKb !== null && (
                      <span className="block text-xs font-bold eco-text-green">
                        ✅ Foto liviana lista ({compressedKb} KB · Modo Megas)
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="py-5 space-y-1.5">
                    <div className="text-4xl">📸</div>
                    <span className="block text-base font-extrabold eco-text-gold">
                      {isUploadingImage
                        ? "Optimizando foto (Modo Megas)..."
                        : "Toca aquí para tomar o elegir foto"}
                    </span>
                    <span className="block text-xs eco-text-muted">
                      Se achica automáticamente para gastar menos megas
                    </span>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onSelectFile(file);
                  }}
                  className="hidden"
                />
              </label>
            </div>

            {/* Campo 2: Nombre */}
            <div className="rounded-2xl eco-inset p-4 space-y-2">
              <label
                htmlFor="product-name-input"
                className="block text-sm font-extrabold uppercase eco-text-gold"
              >
                2. Nombre del producto
              </label>
              <input
                id="product-name-input"
                type="text"
                required
                value={name}
                onChange={(e) => onNameChange(e.target.value)}
                placeholder="Ej. Sopita de fideo, Pan casero..."
                className="w-full min-h-[56px] px-4 py-3.5 rounded-xl eco-input text-lg font-bold"
              />
            </div>

            {/* Campo 3: Precio en Bs */}
            <div className="rounded-2xl eco-inset p-4 space-y-2">
              <label
                htmlFor="product-price-input"
                className="block text-sm font-extrabold uppercase eco-text-gold"
              >
                3. Precio en Bolivianos (Bs)
              </label>
              <div className="relative flex items-center">
                <input
                  id="product-price-input"
                  ref={priceInputRef}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  required
                  value={priceMotes}
                  onChange={(e) =>
                    onPriceChange(e.target.value.replace(/[^0-9]/g, ""))
                  }
                  placeholder="15"
                  className="w-full min-h-[56px] pl-4 pr-16 py-4 rounded-xl eco-input font-brand text-3xl"
                />
                <span className="absolute right-4 font-brand text-2xl eco-text-gold">
                  Bs
                </span>
              </div>
              <p className="text-xs font-bold eco-text-green">
                {COMMUNITY_COPY.zeroCommission} · {COMMUNITY_COPY.moteParity}
              </p>
            </div>

            <button
              type="submit"
              disabled={isUploadingImage}
              className="w-full min-h-[56px] py-4 rounded-2xl bg-gradient-to-r from-oro via-brillo to-oro text-bosque font-brand text-xl shadow-gold-glow active:scale-95 transition disabled:opacity-60"
            >
              Revisar antes de publicar →
            </button>
          </form>
        ) : (
          <div className="space-y-5">
            <div className="rounded-2xl eco-card-gold overflow-hidden">
              {imageUrl && (
                <img
                  src={imageUrl}
                  alt={name}
                  className="w-full h-52 object-cover border-b border-oro/20"
                />
              )}
              <div className="p-4 space-y-2">
                <span className="text-xs font-extrabold eco-text-green uppercase">
                  🏪 {storeName || "Tu puesto"}
                </span>
                <h4 className="font-brand text-2xl eco-text">{name}</h4>
                <div className="pt-2 border-t border-oro/20 flex items-baseline justify-between">
                  <span className="text-xs font-bold uppercase eco-text-muted">
                    Precio para tus vecinos
                  </span>
                  <span className="font-brand text-3xl eco-text-gold">
                    {formatBs(priceMotes)}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={onConfirmPublish}
                className="w-full min-h-[56px] py-4 rounded-2xl bg-gradient-to-r from-brote via-[#5cd060] to-brote text-bosque font-brand text-xl shadow-green-glow active:scale-95 transition"
              >
                {isSubmitting ? "Guardando..." : "Publicar así"}
              </button>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={onCorrectPrice}
                className="w-full min-h-[52px] py-3.5 rounded-2xl eco-btn-ghost font-extrabold text-base uppercase transition"
              >
                Corregir precio
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
