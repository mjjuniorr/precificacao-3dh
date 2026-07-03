import dotenv from "dotenv";

dotenv.config();

export type AuthMode = "legacy" | "hybrid" | "oidc";

function authMode(value = "hybrid"): AuthMode {
  return value === "legacy" || value === "oidc" ? value : "hybrid";
}

export const config = {
  databaseUrl:
    process.env.DATABASE_URL ||
    "postgres://precificacao:precificacao_dev@localhost:5432/precificacao",
  port: Number(process.env.API_PORT || process.env.PORT || 4000),
  corsOrigin: process.env.CORS_ORIGIN || process.env.VITE_API_URL || "*",
  authMode: authMode(process.env.AUTH_MODE),
  appPassword: process.env.APP_PASSWORD || "admin",
  legacyJwtSecret: process.env.JWT_SECRET || "dev-secret-change-me",
  oidcIssuer: (process.env.OIDC_ISSUER || "http://localhost:8080/realms/3dh").replace(/\/$/, ""),
  oidcClientId: process.env.OIDC_CLIENT_ID || "precificacao-web",
  oidcAudience: process.env.OIDC_AUDIENCE || "precificacao-web",
  oidcJwksUrl:
    process.env.OIDC_JWKS_URL ||
    `${(process.env.OIDC_ISSUER || "http://localhost:8080/realms/3dh").replace(/\/$/, "")}/protocol/openid-connect/certs`,
  portalUrl: process.env.PORTAL_URL || "http://localhost:4180"
};
