import type { NextFunction, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify, SignJWT, type JWTPayload } from "jose";
import { config, type AuthMode } from "./config.js";

const ALL_PERMISSIONS = [
  "precificacao:view",
  "precificacao:import",
  "precificacao:edit",
  "precificacao:export",
  "precificacao:admin"
];
const ALLOWED_PERMISSIONS = new Set(ALL_PERMISSIONS);

export type AuthSource = "oidc" | "legacy";
export type AuthUser = {
  sub: string;
  name: string;
  email: string;
  permissions: string[];
  source: AuthSource;
  payload: JWTPayload;
};

const jwks = createRemoteJWKSet(new URL(config.oidcJwksUrl));
const legacySecret = new TextEncoder().encode(config.legacyJwtSecret);

function allows(mode: AuthMode, source: AuthSource) {
  return mode === "hybrid" || mode === source;
}

function permissionsFrom(payload: JWTPayload) {
  const permissions = new Set<string>();
  const realmRoles = payload.realm_access as { roles?: string[] } | undefined;
  const resources = payload.resource_access as Record<string, { roles?: string[] }> | undefined;
  const addAllowed = (role: string) => {
    if (ALLOWED_PERMISSIONS.has(role)) permissions.add(role);
  };
  realmRoles?.roles?.forEach(addAllowed);
  resources?.[config.oidcClientId]?.roles?.forEach(addAllowed);
  return [...permissions];
}

export async function createLegacyToken(name: string) {
  const normalizedName = name.trim().slice(0, 120);
  const sub = normalizedName.toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return new SignJWT({ name: normalizedName, permissions: ALL_PERMISSIONS, auth_source: "legacy" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(sub || "usuario-legado")
    .setIssuer("precificacao-legacy")
    .setAudience(config.oidcAudience)
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(legacySecret);
}

async function verifyOidcToken(token: string): Promise<AuthUser> {
  const { payload } = await jwtVerify(token, jwks, {
    issuer: config.oidcIssuer,
    audience: config.oidcAudience
  });
  return {
    sub: String(payload.sub || ""),
    name: String(payload.name || payload.preferred_username || payload.email || "Usuario"),
    email: String(payload.email || ""),
    permissions: permissionsFrom(payload),
    source: "oidc",
    payload
  };
}

export async function verifyLegacyToken(token: string): Promise<AuthUser> {
  const { payload } = await jwtVerify(token, legacySecret, {
    issuer: "precificacao-legacy",
    audience: config.oidcAudience,
    algorithms: ["HS256"]
  });
  return {
    sub: String(payload.sub || ""),
    name: String(payload.name || "Usuario legado"),
    email: "",
    permissions: Array.isArray(payload.permissions) ? payload.permissions.map(String) : ALL_PERMISSIONS,
    source: "legacy",
    payload
  };
}

export async function authenticateToken(token: string) {
  if (allows(config.authMode, "oidc")) {
    try {
      const user = await verifyOidcToken(token);
      if (user.sub) return user;
    } catch {
      // Hybrid mode falls through to the legacy verifier.
    }
  }
  if (allows(config.authMode, "legacy")) {
    try {
      const user = await verifyLegacyToken(token);
      if (user.sub) return user;
    } catch {
      return null;
    }
  }
  return null;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return res.status(401).json({ error: "Nao autenticado" });
  const user = await authenticateToken(token);
  if (!user) return res.status(401).json({ error: "Sessao invalida ou expirada" });
  res.locals.user = user;
  next();
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
