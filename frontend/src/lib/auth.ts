import { UserManager, WebStorageStateStore, type User } from "oidc-client-ts";
import { API_URL } from "./api";

type AuthConfig = {
  authMode: "legacy" | "hybrid" | "oidc";
  issuer: string;
  clientId: string;
  scope: string;
  portalUrl: string;
};

let manager: UserManager | null = null;
let config: AuthConfig | null = null;

export async function getAuthConfig() {
  if (config) return config;
  const response = await fetch(`${API_URL}/api/config`);
  if (!response.ok) throw new Error("Nao foi possivel carregar a configuracao de acesso.");
  config = await response.json() as AuthConfig;
  return config;
}

export async function getAuthManager() {
  if (manager) return manager;
  const authConfig = await getAuthConfig();
  manager = new UserManager({
    authority: authConfig.issuer,
    client_id: authConfig.clientId,
    redirect_uri: window.location.origin,
    post_logout_redirect_uri: window.location.origin,
    response_type: "code",
    scope: authConfig.scope,
    automaticSilentRenew: false,
    userStore: new WebStorageStateStore({ store: window.sessionStorage })
  });
  return manager;
}

export async function restoreUser(): Promise<User | null> {
  const auth = await getAuthManager();
  if (window.location.search.includes("code=") || window.location.search.includes("error=")) {
    const user = await auth.signinRedirectCallback();
    window.history.replaceState({}, document.title, window.location.pathname);
    return user;
  }
  return auth.getUser();
}

export async function login() {
  return (await getAuthManager()).signinRedirect();
}

export async function logout() {
  return (await getAuthManager()).signoutRedirect();
}
