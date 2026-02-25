export function registerAuthRoutes(app, deps) {
  const {
    supabaseAuth,
    supabaseAdmin,
    getSafeAdminRedirect,
    getLoginRateLimitEntry,
    getLoginRateLimitError,
    hasValidCsrfToken,
    registerFailedLoginAttempt,
    isAdminUser,
    clearLoginRateLimit,
    setAuthCookie,
    clearAuthCookie,
  } = deps;

  app.get("/login", (req, res) => {
    if (res.locals.auth?.isAdmin) return res.redirect("/admin");
    const nextPath = getSafeAdminRedirect(req.query.next);
    return res.render("auth/login", {
      title: "Login",
      activePage: "login",
      loginPageCSS: true,
      error: null,
      nextPath,
    });
  });

  app.post("/login", async (req, res) => {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const nextPath = getSafeAdminRedirect(req.body.next);
    const { entry: rateLimitEntry } = getLoginRateLimitEntry(req);
    const rateLimitError = getLoginRateLimitError(rateLimitEntry);

    if (rateLimitError) {
      return res.status(429).render("auth/login", {
        title: "Login",
        activePage: "login",
        loginPageCSS: true,
        error: rateLimitError,
        nextPath,
      });
    }

    if (!hasValidCsrfToken(req)) {
      registerFailedLoginAttempt(req);
      return res.status(403).render("auth/login", {
        title: "Login",
        activePage: "login",
        loginPageCSS: true,
        error: "Invalid session token. Refresh the page and try again.",
        nextPath,
      });
    }

    if (!supabaseAuth || !supabaseAdmin) {
      return res.status(503).render("auth/login", {
        title: "Login",
        activePage: "login",
        loginPageCSS: true,
        error: "Auth is not configured. Set SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.",
        nextPath,
      });
    }

    if (!email || !password) {
      registerFailedLoginAttempt(req);
      return res.status(400).render("auth/login", {
        title: "Login",
        activePage: "login",
        loginPageCSS: true,
        error: "Email and password are required.",
        nextPath,
      });
    }

    const { data, error } = await supabaseAuth.auth.signInWithPassword({ email, password });
    if (error || !data?.user || !data?.session?.access_token) {
      registerFailedLoginAttempt(req);
      return res.status(401).render("auth/login", {
        title: "Login",
        activePage: "login",
        loginPageCSS: true,
        error: "Invalid email or password.",
        nextPath,
      });
    }

    const isAdmin = await isAdminUser(data.user.id);
    if (!isAdmin) {
      registerFailedLoginAttempt(req);
      return res.status(403).render("auth/login", {
        title: "Login",
        activePage: "login",
        loginPageCSS: true,
        error: "This account is not authorized for admin access.",
        nextPath,
      });
    }

    clearLoginRateLimit(req);
    setAuthCookie(res, data.session.access_token);
    return res.redirect(nextPath);
  });

  app.post("/logout", (req, res) => {
    if (!hasValidCsrfToken(req)) {
      return res.status(403).send("Invalid CSRF token.");
    }
    clearAuthCookie(res);
    return res.redirect("/login");
  });
}
