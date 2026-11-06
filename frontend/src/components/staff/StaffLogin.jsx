"use client";
import { Text, LocalizedAttrs } from "@/components/LocalizedText";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api";
import Icon from "@/components/Icon";

// Shown when sign-in succeeded but the browser did not send the new session cookie back.
export const SESSION_NOT_KEPT_MESSAGE =
  "Sign-in succeeded, but this browser did not keep the secure session cookie. Allow cookies for this site (or disable strict tracking prevention), then sign in again.";

export default function StaffLogin({ realm }) {
  const router = useRouter();
  const owner = realm === "owner";
  const roleLabel = owner ? "Owner" : "Admin";
  const [adminId, setAdminId] = useState(""),
    [password, setPassword] = useState(""),
    [code, setCode] = useState(""),
    [method, setMethod] = useState("security"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [supportId, setSupportId] = useState("");
  const inFlight = useRef(false);
  const authenticator = method === "authenticator";

  // Confirm the cookie round-trips before leaving the page; otherwise the dashboard
  // would receive 401 and send the user straight back here without explanation.
  async function enterWorkspace() {
    try {
      await apiRequest(`${realm}/auth/me`, { cache: "no-store", dedupe: false });
    } catch (sessionError) {
      if (sessionError.status === 401) throw Object.assign(new Error(SESSION_NOT_KEPT_MESSAGE), { requestId: sessionError.requestId });
      throw sessionError;
    }
    setPassword("");
    setCode("");
    router.replace(`/${realm}/dashboard`);
  }

  async function login(event) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setSupportId("");
    try {
      const factor = code.trim();
      if (authenticator) {
        const challenge = await apiRequest(`${realm}/auth/login`, { method: "POST", body: JSON.stringify({ adminId, password }) });
        await apiRequest(`${realm}/auth/mfa/verify`, { method: "POST", body: JSON.stringify({ challengeToken: challenge.challengeToken, code: factor }) });
      } else {
        await apiRequest(`${realm}/auth/login`, { method: "POST", body: JSON.stringify({ adminId, password, securityCode: factor }) });
      }
      await enterWorkspace();
    } catch (failure) {
      setSupportId(failure.requestId || "");
      setError(failure.message);
      setCode("");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <main id="main" className="staff-login-page">
      <div className="staff-login-story">
        <Icon name="sun" size={48} />
        <p className="eyebrow">
          <Text>{"SON MASALA · SECURE ACCESS"}</Text>
        </p>
        <h1>
          <Text>{"Your workspace."}</Text>
          <br />
          <Text>{"Your responsibilities."}</Text>
        </h1>
        <p>
          <Text>
            Access the business tools assigned to your staff account. Every administrative action is checked by the server.
          </Text>
        </p>
        <LocalizedAttrs>
          <span lang="hi">
            <Text>{"हर स्वाद में अपनापन"}</Text>
          </span>
        </LocalizedAttrs>
      </div>
      <div className="staff-login-form">
        <p className="eyebrow">
          <Text>{"AUTHORIZED STAFF ONLY"}</Text>
        </p>
        <h2>
          <Text>{`${roleLabel} sign-in`}</Text>
        </h2>
        <p>
          <Text>
            {authenticator
              ? "Use your staff ID, password, and the current code from your authenticator app."
              : `Use your configured staff ID, password, and private ${roleLabel.toLowerCase()} security code.`}
          </Text>
        </p>
        <form onSubmit={login}>
          <label>
            <Text>{`${roleLabel} ID`}</Text>
            <input
              name="adminId"
              value={adminId}
              onChange={(event) => setAdminId(event.target.value.toUpperCase())}
              required
              maxLength={40}
              autoComplete="username"
              spellCheck={false}
            />
          </label>
          <label>
            <Text>{"Password"}</Text>
            <LocalizedAttrs>
              <input
                name="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                maxLength={128}
                autoComplete="current-password"
                placeholder="Enter your password"
              />
            </LocalizedAttrs>
          </label>
          <label>
            <Text>{authenticator ? "Authenticator code" : `${roleLabel} Security Code`}</Text>
            <LocalizedAttrs>
              <input
                key={method}
                name={authenticator ? "mfaCode" : "securityCode"}
                aria-label={authenticator ? "MFA verification code" : `${roleLabel} security code`}
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase().trim())}
                required
                maxLength={authenticator ? 39 : 6}
                pattern={authenticator ? "[0-9]{6}|[A-F0-9]{4}(-[A-F0-9]{4}){7}" : "[0-9]{6}"}
                inputMode={authenticator ? "text" : "numeric"}
                autoComplete="one-time-code"
                placeholder={authenticator ? "6-digit code or recovery code" : "Enter your 6-digit security code"}
              />
            </LocalizedAttrs>
            <small>
              <Text>
                {authenticator
                  ? "Enter the current six-digit code from your authenticator app, or one unused recovery code."
                  : `Enter your private six-digit ${roleLabel.toLowerCase()} security code.`}
              </Text>
            </small>
          </label>
          {error && (
            <p className="form-error" role="alert">
              <Text error>{error}</Text>
            </p>
          )}
          <button className="button w-full" disabled={busy}>
            <Text>{busy ? "Verifying secure access…" : `Sign in as ${roleLabel}`}</Text>{" "}
            <Icon size={24} />
          </button>
          <button
            type="button"
            className="text-link staff-login-method"
            onClick={() => { setMethod(authenticator ? "security" : "authenticator"); setCode(""); setError(""); }}
            disabled={busy}
          >
            <Text>{authenticator ? "Use the security code instead" : "Use my authenticator app instead"}</Text>
          </button>
        </form>
        {error && supportId && <p className="auth-support-reference"><Text>Support reference</Text>: <code>{supportId}</code></p>}
        <p className="staff-login-help">
          <Text>
            {`${roleLabel} access requires a valid ${roleLabel} ID, password, and a second factor. Public registration is unavailable.`}
          </Text>
        </p>
      </div>
    </main>
  );
}
