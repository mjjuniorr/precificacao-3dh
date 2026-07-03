import assert from "node:assert/strict";
import test from "node:test";
import type { NextFunction, Request, Response } from "express";
import { requirePermission, type AuthUser } from "./auth.js";

test("backend responde 403 quando a permissao exigida esta ausente", () => {
  const user: AuthUser = {
    sub: "usuario-sem-importacao",
    name: "Usuario sem importacao",
    email: "",
    permissions: ["precificacao:view"],
    source: "oidc",
    payload: {}
  };
  let status = 0;
  let body: unknown;
  let nextCalled = false;
  const response = {
    locals: { user },
    status(code: number) {
      status = code;
      return this;
    },
    json(value: unknown) {
      body = value;
      return this;
    }
  } as unknown as Response;

  requirePermission("precificacao:import")(
    {} as Request,
    response,
    (() => { nextCalled = true; }) as NextFunction
  );

  assert.equal(status, 403);
  assert.deepEqual(body, { error: "Seu usuario nao possui permissao para esta acao" });
  assert.equal(nextCalled, false);
});
