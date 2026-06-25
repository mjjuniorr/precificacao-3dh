import type { NextFunction, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { config } from "./config.js";

export type AuthUser = {
  sub: string;
  name: string;
  email: string;
  permissions: string[];
  payload: JWTPayload;
};

const jwks = createRemoteJWKSet(new URL(config.oidcJwksUrl));

function permissionsFrom(payload: JWTPayload) {
  const permissions = new Set<string>();
  const realmRoles = payload.realm_access as { roles?: string[] } | undefined;
  const resources = payload.resource_access as Record<string, { roles?: string[] }> | undefined;
  realmRoles?.roles?.forEach((role) => permissions.add(role));
  Object.values(resources || {}).forEach((access) => {
    access.roles?.forEach((role) => permissions.add(role));
  });
  return [...permissions];
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return res.status(401).json({ error: "Nao autenticado" });

  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: config.oidcIssuer,
      audience: config.oidcAudience
    });
    const user: AuthUser = {
      sub: String(payload.sub || ""),
      name: String(payload.name || payload.preferred_username || payload.email || "Usuario"),
      email: String(payload.email || ""),
      permissions: permissionsFrom(payload),
      payload
    };
    if (!user.sub) return res.status(401).json({ error: "Sessao sem identificacao de usuario" });
    res.locals.user = user;
    next();
  } catch {
    return res.status(401).json({ error: "Sessao invalida ou expirada" });
  }
}

export function requirePermission(permission: string) {
  return (_req: Request, res: Response, next: NextFunction) => {
    const user = res.locals.user as AuthUser | undefined;
    if (!user?.permissions.includes(permission)) {
      return res.status(403).json({ error: "Seu usuario nao possui permissao para esta acao" });
    }
    next();
  };
}
