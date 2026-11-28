// A local stand-in for the PitWall API and OpenF1, for the e2e suite and the UI gate.
// It serves saved JSON only, so test runs never reach the production API, the chat or OpenF1
// (which answers 401 to everyone during a live F1 session). Unknown paths answer 404 and are logged,
// so a page that starts calling something new fails loudly instead of quietly going to production.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

// pathname -> fixture file (relative to FIXTURES). Query strings are ignored.
const ROUTES = new Map([
  // The season picker on /races: the 2026 count matches seasons-2026-races.json.
  ["/api/v1/seasons", "api/seasons.json"],
  ["/api/v1/standings/2026", "api/standings-2026.json"],
  ["/api/v1/standings/2026/progression", "api/standings-2026-progression.json"],
  ["/api/v1/seasons/2026/races", "api/seasons-2026-races.json"],
  // One driver's page (saved 2026-11-28, after round 21). The results ignore the query too, so every season
  // picked on his page answers with his 2026 results.
  ["/api/v1/drivers/antonelli", "api/drivers-antonelli.json"],
  ["/api/v1/drivers/antonelli/results", "api/drivers-antonelli-results-2026.json"],
  // An empty driver list: the leader tile shows its no-photo state, as it does when OpenF1 refuses.
  ["/openf1/v1/drivers", "openf1/drivers.json"],
]);
const RACE_IDS = new Set(["192", "193", "194", "195", "1388"]);
// Pit-stop strategy for a race page: the races not yet run (Qatar 195, Abu Dhabi 1388) have none, and the API
// answered none for Brazil 193 too (checked 2026-11-27: 2026's stops aren't in the database yet).
const NO_STRATEGY = new Set(["193", "195", "1388"]);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function send(res, status, body) {
  res.writeHead(status, { ...CORS, "Content-Type": "application/json" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

export function startFixtureApi({ port, host = "127.0.0.1" }) {
  const server = createServer(async (req, res) => {
    const { pathname } = new URL(req.url ?? "/", `http://${host}`);
    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS);
      res.end();
      return;
    }
    // Race details: the last three races and the two after them (ids 192–195 and 1388), so the homepage
    // finds its recent results whatever today's date is during the rest of the 2026 season.
    const race = /^\/api\/v1\/races\/(\d+)$/.exec(pathname);
    const strategy = /^\/api\/v1\/races\/(\d+)\/strategy$/.exec(pathname);
    const file =
      req.method !== "GET"
        ? undefined
        : race && RACE_IDS.has(race[1])
          ? `api/races-${race[1]}.json`
          : strategy && NO_STRATEGY.has(strategy[1])
            ? "api/races-strategy-none.json"
            : ROUTES.get(pathname);
    if (!file) {
      console.error(`fixture-api: no fixture for ${req.method} ${pathname}`);
      send(res, 404, { detail: `fixture-api: no fixture for ${req.method} ${pathname}` });
      return;
    }
    try {
      send(res, 200, await readFile(path.join(FIXTURES, file), "utf8"));
    } catch (err) {
      console.error(`fixture-api: can't read ${file}: ${err}`);
      send(res, 500, { detail: "fixture-api: fixture unreadable" });
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve(server));
  });
}
