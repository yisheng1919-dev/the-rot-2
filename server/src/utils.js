import { customAlphabet } from "nanoid";

// Room codes: unambiguous uppercase letters + digits (no 0/O/1/I confusion).
const roomCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const generateRoomCode = customAlphabet(roomCodeAlphabet, 6);

const idAlphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
export const generatePlayerId = customAlphabet(idAlphabet, 12);
export const generateReconnectToken = customAlphabet(idAlphabet, 32);

export function shuffle(array) {
  const arr = array.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function pointInZone(x, z, zone) {
  return x >= zone.x && x <= zone.x + zone.w && z >= zone.z && z <= zone.z + zone.d;
}

export function distance2D(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz);
}

// A basic, deliberately small blocklist — this is a first line of defense
// against obvious slurs/profanity in display names and chat, not a
// comprehensive moderation system. It normalizes common leetspeak
// substitutions (0->o, 1/!->i, 3->e, etc.) and checks for the blocked word
// as a substring after stripping non-letters, so simple obfuscation
// ("f-u-c-k", "fuuuck") still gets caught without needing a huge word list.
// Intentionally short and English-focused; expand as needed, and consider
// a proper third-party moderation API before a large public launch.
//
// Known trade-off: plain substring matching means a handful of legitimate
// words/names that happen to contain a blocked substring (the classic
// example being the UK town "Scunthorpe", which contains "cunt") will get
// incorrectly rejected. Accepted deliberately — the cost of a rare, odd
// name getting rejected in a nickname field is low, versus the complexity
// of word-boundary-aware matching that's also robust to spaced-out
// evasion like "f u c k". Revisit if this ever causes real complaints.
const BLOCKED_SUBSTRINGS = [
  "fuck", "shit", "bitch", "asshole", "cunt", "nigger", "nigga", "faggot",
  "retard", "whore", "slut", "rape", "cock", "dick", "pussy",
];

export function containsBlockedWord(text) {
  const normalized = String(text || "")
    .toLowerCase()
    .replace(/0/g, "o")
    .replace(/1|!/g, "i")
    .replace(/3/g, "e")
    .replace(/4|@/g, "a")
    .replace(/5|\$/g, "s")
    .replace(/7/g, "t")
    .replace(/[^a-z]/g, "") // strip spaces/punctuation so "f u c k" still matches
    .replace(/(.)\1{2,}/g, "$1"); // collapse 3+ repeats ("fuuuck" -> "fuck") so stretching a word doesn't dodge the check
  return BLOCKED_SUBSTRINGS.some((word) => normalized.includes(word));
}
