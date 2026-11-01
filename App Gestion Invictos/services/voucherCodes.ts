// Códigos de vales al portador. El secreto es el código completo;
// no usar Math.random ni códigos correlativos para emitirlos.
const SAFE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 símbolos; sin I, O, 0, 1.

export function newVoucherCode(kind: 'gift_card' | 'credit_note'): string {
  if (typeof crypto === 'undefined' || !crypto.getRandomValues) {
    throw new Error('Este navegador no permite crear códigos de vale seguros.');
  }
  const random = new Uint8Array(8);
  crypto.getRandomValues(random);
  const suffix = Array.from(random, n => SAFE_ALPHABET[n & 31]).join('');
  return `${kind === 'gift_card' ? 'GC' : 'NC'}-${suffix}`;
}

// Acepta códigos nuevos GC-/NC- y anteriores INV-GC-/INV-NC-.
// Normalización para facilitar escritura manual, sin alterar los códigos antiguos.
export function normalizeVoucherCode(input: string): string {
  return String(input || '').trim().toUpperCase().replace(/\s+/g, '');
}

export function voucherDocumentId(input: string): string | null {
  const code = normalizeVoucherCode(input);
  const newer = /^(GC|NC)-([A-HJ-NP-Z2-9]{8})$/.exec(code);
  if (newer) return newer[2];
  // Los ID históricos de Firestore distinguen mayúsculas y minúsculas.
  // Conservar el sufijo original tal como fue almacenado.
  const legacy = /^INV-(GC|NC)-([A-Za-z0-9]+)$/i.exec(String(input || '').trim());
  return legacy ? legacy[2] : null;
}
