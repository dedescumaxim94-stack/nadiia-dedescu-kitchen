import { randomUUID } from "crypto";

export function createAuthMiddleware({
  supabaseAuth,
  supabaseAdmin,
  authCookieName,
  authCookieMaxAgeSeconds,
  csrfCookieName,
  csrfCookieMaxAgeSeconds,
  loginRateLimitWindowMs,
  loginRateLimitMaxAttempts,
  nodeEnv,
}) {
  const loginRateLimitStore = new Map();

  function parseCookies(cookieHeader = "") {
    return cookieHeader
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean)
      .reduce((acc, pair) => {
        const eqIndex = pair.indexOf("=");
        if (eqIndex === -1) return acc;
        const key = pair.slice(0, eqIndex).trim();
        const value = pair.slice(eqIndex + 1).trim();
        try {
          acc[key] = decodeURIComponent(value);
        } catch {
          acc[key] = value;
        }
        return acc;
      }, {});
  }

  function getAuthTokenFromRequest(req) {
    return parseCookies(req.headers.cookie || "")[authCookieName] || null;
  }

  function getCsrfTokenFromRequest(req) {
    return parseCookies(req.headers.cookie || "")[csrfCookieName] || null;
  }

  function appendSetCookie(res, cookieValue) {
    const existing = res.getHeader("Set-Cookie");
    if (!existing) {
      res.setHeader("Set-Cookie", [cookieValue]);
      return;
    }
    if (Array.isArray(existing)) {
      res.setHeader("Set-Cookie", [...existing, cookieValue]);
      return;
    }
    res.setHeader("Set-Cookie", [String(existing), cookieValue]);
  }

  function setAuthCookie(res, token) {
    const cookieParts = [
      `${authCookieName}=${encodeURIComponent(token)}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      `Max-Age=${authCookieMaxAgeSeconds}`,
    ];
    if (nodeEnv === "production") cookieParts.push("Secure");
    appendSetCookie(res, cookieParts.join("; "));
  }

  function clearAuthCookie(res) {
    const cookieParts = [`${authCookieName}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
    if (nodeEnv === "production") cookieParts.push("Secure");
    appendSetCookie(res, cookieParts.join("; "));
  }

  function setCsrfCookie(res, token) {
    const cookieParts = [
      `${csrfCookieName}=${encodeURIComponent(token)}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      `Max-Age=${csrfCookieMaxAgeSeconds}`,
    ];
    if (nodeEnv === "production") cookieParts.push("Secure");
    appendSetCookie(res, cookieParts.join("; "));
  }

  function hasValidCsrfToken(req) {
    const cookieToken = getCsrfTokenFromRequest(req);
    if (!cookieToken) return false;
    const headerToken = String(req.get("x-csrf-token") || "").trim();
    const bodyToken = req.body && typeof req.body._csrf === "string" ? req.body._csrf.trim() : "";
    const providedToken = headerToken || bodyToken;
    return Boolean(providedToken && providedToken === cookieToken);
  }

  async function getAuthenticatedUser(token) {
    if (!supabaseAuth || !token) return null;
    const { data, error } = await supabaseAuth.auth.getUser(token);
    if (error || !data?.user) return null;
    return data.user;
  }

  async function isAdminUser(userId) {
    if (!supabaseAdmin || !userId) return false;
    const { data, error } = await supabaseAdmin.from("admin_users").select("user_id").eq("user_id", userId).maybeSingle();
    if (error) {
      console.error("Admin lookup failed:", error.message);
      return false;
    }
    return Boolean(data?.user_id);
  }

  function getSafeAdminRedirect(nextParam) {
    if (typeof nextParam !== "string") return "/admin";
    if (!nextParam.startsWith("/admin")) return "/admin";
    return nextParam;
  }

  function attachCsrfToken(req, res, next) {
    let token = getCsrfTokenFromRequest(req);
    if (!token) {
      token = randomUUID();
      setCsrfCookie(res, token);
    }
    req.csrfToken = token;
    res.locals.csrfToken = token;
    return next();
  }

  function requireCsrfApi(req, res, next) {
    if (!hasValidCsrfToken(req)) {
      return res.status(403).json({ error: "Invalid CSRF token." });
    }
    return next();
  }

  function getClientIp(req) {
    const forwarded = String(req.headers["x-forwarded-for"] || "")
      .split(",")[0]
      .trim();
    return forwarded || req.ip || req.socket?.remoteAddress || "unknown";
  }

  function getLoginRateLimitEntry(req) {
    const key = getClientIp(req);
    const now = Date.now();
    const current = loginRateLimitStore.get(key);
    if (!current) return { key, entry: null };
    if (current.resetAt <= now) {
      loginRateLimitStore.delete(key);
      return { key, entry: null };
    }
    return { key, entry: current };
  }

  function registerFailedLoginAttempt(req) {
    const now = Date.now();
    const { key, entry } = getLoginRateLimitEntry(req);
    const nextEntry = entry || { count: 0, resetAt: now + loginRateLimitWindowMs };
    nextEntry.count += 1;
    loginRateLimitStore.set(key, nextEntry);
  }

  function clearLoginRateLimit(req) {
    const { key } = getLoginRateLimitEntry(req);
    loginRateLimitStore.delete(key);
  }

  function getLoginRateLimitError(entry) {
    if (!entry || entry.count < loginRateLimitMaxAttempts) return null;
    const waitSeconds = Math.max(1, Math.ceil((entry.resetAt - Date.now()) / 1000));
    return `Too many login attempts. Try again in ${waitSeconds} seconds.`;
  }

  async function attachAuthContext(req, res, next) {
    res.locals.auth = {
      isAuthenticated: false,
      isAdmin: false,
      email: null,
    };

    const token = getAuthTokenFromRequest(req);
    if (!token) return next();

    const user = await getAuthenticatedUser(token);
    if (!user) {
      clearAuthCookie(res);
      return next();
    }

    const isAdmin = await isAdminUser(user.id);
    res.locals.auth = {
      isAuthenticated: true,
      isAdmin,
      email: user.email || null,
    };
    req.authToken = token;
    req.authUser = user;
    req.isAdmin = isAdmin;
    return next();
  }

  function requireAdminPage(req, res, next) {
    if (!res.locals.auth?.isAuthenticated) {
      const nextPath = encodeURIComponent(req.originalUrl || "/admin");
      return res.redirect(`/login?next=${nextPath}`);
    }
    if (!res.locals.auth?.isAdmin) {
      return res.status(403).render("auth/login", {
        title: "Login",
        activePage: "login",
        loginPageCSS: true,
        error: "This account is not authorized for admin access.",
        nextPath: "/admin",
      });
    }
    return next();
  }

  function requireAdminApi(req, res, next) {
    if (!res.locals.auth?.isAuthenticated) {
      return res.status(401).json({ error: "Authentication required." });
    }
    if (!res.locals.auth?.isAdmin) {
      return res.status(403).json({ error: "Admin access required." });
    }
    return next();
  }

  return {
    setAuthCookie,
    clearAuthCookie,
    isAdminUser,
    getSafeAdminRedirect,
    hasValidCsrfToken,
    getLoginRateLimitEntry,
    registerFailedLoginAttempt,
    clearLoginRateLimit,
    getLoginRateLimitError,
    attachCsrfToken,
    attachAuthContext,
    requireCsrfApi,
    requireAdminPage,
    requireAdminApi,
  };
}
