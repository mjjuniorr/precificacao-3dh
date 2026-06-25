import dotenv from "dotenv";

dotenv.config();

export const config = {
  databaseUrl:
    process.env.DATABASE_URL ||
    "postgres://precificacao:precificacao_dev@localhost:5432/precificacao",
  port: Number(process.env.API_PORT || process.env.PORT || 4000),
  corsOrigin: process.env.CORS_ORIGIN || process.env.VITE_API_URL || "*",
  oidcIssuer: (process.env.OIDC_ISSUER || "http://localhost:8080/realms/3dh").replace(/\/$/, ""),
  oidcClientId: process.env.OIDC_CLIENT_ID || "precificacao-web",
  oidcAudience: process.env.OIDC_AUDIENCE || "precificacao-web",
  oidcJwksUrl:
    process.env.OIDC_JWKS_URL ||
    `${(process.env.OIDC_ISSUER || "http://localhost:8080/realms/3dh").replace(/\/$/, "")}/protocol/openid-connect/certs`,
  portalUrl: process.env.PORTAL_URL || "http://localhost:4180"
};
