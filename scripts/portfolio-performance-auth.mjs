#!/usr/bin/env node

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import http from "node:http";
import path from "node:path";

const clientId = process.env.PORTFOLIO_PERFORMANCE_CLIENT_ID || "d6d0voq1w081sxty0qq7a";
const baseUrl = "https://accounts.portfolio-performance.info/oidc";
const tokenPath = process.argv[2];
const port = 49968;
const redirectUri = `http://localhost:${port}/success`;

if (!tokenPath) {
  console.error("Verwendung: portfolio-kompass-auth <refresh-token-datei>");
  process.exit(1);
}

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
const verifier = Array.from(randomBytes(128), (byte) => alphabet[byte % alphabet.length]).join("");
const challenge = createHash("sha256").update(verifier, "ascii").digest("base64url");
const state = randomUUID();
const authorizationUrl = new URL(`${baseUrl}/auth`);
authorizationUrl.search = new URLSearchParams({
  response_type: "code",
  prompt: "login consent",
  code_challenge: challenge,
  code_challenge_method: "S256",
  client_id: clientId,
  redirect_uri: redirectUri,
  scope: "openid offline_access",
  state,
}).toString();

const result = new Promise((resolve, reject) => {
  const server = http.createServer(async (request, response) => {
    try {
      const callback = new URL(request.url || "/", redirectUri);
      if (callback.pathname !== "/success" || callback.searchParams.get("state") !== state) {
        response.writeHead(400).end("Ungültige OAuth-Antwort.");
        return;
      }
      const code = callback.searchParams.get("code");
      if (!code) throw new Error("Die OAuth-Antwort enthält keinen Autorisierungscode.");

      const tokenResponse = await fetch(`${baseUrl}/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: clientId,
          code,
          code_verifier: verifier,
          redirect_uri: redirectUri,
        }),
      });
      const token = await tokenResponse.json().catch(() => undefined);
      if (!tokenResponse.ok || !token?.refresh_token) {
        throw new Error(`Token-Austausch fehlgeschlagen (HTTP ${tokenResponse.status}).`);
      }

      await fs.mkdir(path.dirname(tokenPath), { recursive: true });
      await fs.writeFile(tokenPath, `${token.refresh_token}\n`, { mode: 0o600 });
      response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Portfolio Performance wurde erfolgreich mit Portfolio Kompass verbunden. Dieses Fenster kann geschlossen werden.");
      resolve(undefined);
    } catch (error) {
      response.writeHead(500).end("Anmeldung fehlgeschlagen.");
      reject(error);
    } finally {
      server.close();
    }
  });
  server.on("error", reject);
  server.listen(port, "127.0.0.1", () => {
    console.log("Öffne diese Adresse im lokalen Browser:");
    console.log(authorizationUrl.toString());
  });
  setTimeout(() => {
    server.close();
    reject(new Error("Anmeldung nach fünf Minuten abgebrochen."));
  }, 5 * 60 * 1000).unref();
});

try {
  await result;
  console.log(`Refresh-Token sicher in ${tokenPath} gespeichert.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Anmeldung fehlgeschlagen.");
  process.exitCode = 1;
}
