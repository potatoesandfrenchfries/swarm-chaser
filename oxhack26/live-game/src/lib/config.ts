/** Where the PartyKit server runs. Local `partykit dev` serves on :1999. */
export const PARTYKIT_HOST = process.env.NEXT_PUBLIC_PARTYKIT_HOST || "127.0.0.1:1999";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to misread aloud

export function newRoomCode(length = 4) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

export function normaliseRoomCode(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}
