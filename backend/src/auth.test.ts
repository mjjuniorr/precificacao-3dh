import assert from "node:assert/strict";
import test from "node:test";
import { createLegacyToken, verifyLegacyToken } from "./auth.js";

test("token legado preserva identidade e permissoes", async () => {
  const token = await createLegacyToken("Responsavel Teste");
  const user = await verifyLegacyToken(token);
  assert.equal(user.name, "Responsavel Teste");
  assert.equal(user.source, "legacy");
  assert.ok(user.permissions.includes("precificacao:view"));
  assert.ok(user.permissions.includes("precificacao:admin"));
});

test("token legado adulterado e rejeitado", async () => {
  const token = await createLegacyToken("Responsavel Teste");
  await assert.rejects(() => verifyLegacyToken(`${token.slice(0, -1)}x`));
});
