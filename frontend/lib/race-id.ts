// races.id is a Postgres SERIAL (a 32-bit integer): the API answers a larger id with a 500, not a 404
const MAX_RACE_ID = 2_147_483_647;

/** Whether an id from the URL can name a race: a whole positive number the database can hold. The API answers 193.5
 * with a 422 and 3000000000 with a 500, so a page that asked would offer a Retry that can never work. */
export function isRaceId(raceId: number): boolean {
  return Number.isSafeInteger(raceId) && raceId > 0 && raceId <= MAX_RACE_ID;
}
