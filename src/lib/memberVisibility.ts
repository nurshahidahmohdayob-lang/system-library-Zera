import { UserProfile } from '@/src/types';

/**
 * Which member records are redundant duplicates of another.
 *
 * Signing in creates a profile keyed by the auth uid and named from the email
 * ("wafi.a"), while the staff sync holds the real record ("Wafi", Zerastaff38).
 * Both describe one person, so every teacher who logs in adds a second,
 * worse-named row to every member list in the app.
 *
 * The login stub is hidden rather than deleted: it is the record their login is
 * attached to, and removing it only invites a fresh one on their next sign-in.
 *
 * Shared by the Members list and the circulation lending terminal so the two
 * cannot disagree about who exists — a member visible in one and missing from
 * the other is worse than the duplicate itself.
 */

/** A record created purely by signing in: no sync origin, no barcode, no school id. */
const isLoginStub = (u: UserProfile): boolean =>
  !u.syncSource && !u.barcode && !u.studentId;

const emailOf = (u: UserProfile): string => String(u.email || '').toLowerCase().trim();

/**
 * Doc ids to collapse out of a member list.
 *
 * `idsWithLoans` keeps a stub visible when it holds borrowing history — that is
 * where the loans point, and hiding it would put a member's books out of reach.
 */
export const collapsibleDuplicateIds = (
  members: UserProfile[],
  idsWithLoans: Set<string>
): Set<string> => {
  const registryEmails = new Set(
    members.filter(u => !isLoginStub(u)).map(emailOf).filter(Boolean)
  );
  return new Set(
    members
      .filter(u => isLoginStub(u) && !!emailOf(u) && registryEmails.has(emailOf(u)) && !idsWithLoans.has(u.uid))
      .map(u => u.uid)
  );
};
