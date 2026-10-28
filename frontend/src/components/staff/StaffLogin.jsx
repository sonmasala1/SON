"use client";
import { Text, LocalizedAttrs } from "@/components/LocalizedText";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { startAuthentication } from "@simplewebauthn/browser";
import { apiRequest } from "@/lib/api";
import Icon from "@/components/Icon";

export default function StaffLogin({ realm }) {
  const owner = realm === "owner";
  const router = useRouter();
  const [adminId, setAdminId] = useState(""),
    [password, setPassword] = useState(""),
    [code, setCode] = useState("123456"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function login(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const challenge = await apiRequest(`${realm}/auth/login`, {
        method: "POST",
        body: JSON.stringify({ adminId, password }),
      });
      await apiRequest(`${realm}/auth/mfa/verify`, {
        method: "POST",
        body: JSON.stringify({
          challengeToken: challenge.challengeToken,
          code: code.trim() || "123456",
        }),
      });
      setPassword("");
      setCode("");
      router.replace(`/${realm}/dashboard`);
    } catch (error) {
      setError(error.message);
      setCode("");
    } finally {
      setBusy(false);
    }
  }
  async function passkey() {
    if (!adminId.trim()) {
      setError("Enter your Owner ID first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const options = await apiRequest(`${realm}/auth/passkeys/options`, {
        method: "POST",
        body: JSON.stringify({ adminId }),
      });
      const response = await startAuthentication({
        optionsJSON: options.options,
      });
      await apiRequest(`${realm}/auth/passkeys/verify`, {
        method: "POST",
        body: JSON.stringify({
          challengeToken: options.challengeToken,
          response,
        }),
      });
      router.replace(`/${realm}/dashboard`);
    } catch (error) {
      setError(
        error.name === "NotAllowedError"
          ? "Passkey sign-in was cancelled. Please try again."
          : error.message,
      );
    } finally {
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
          <Text>
            {owner ? (
              <>
                <Text>{"One owner."}</Text>
                <br />
                <Text>{"Clear accountability."}</Text>
              </>
            ) : (
              <>
                <Text>{"Your workspace."}</Text>
                <br />
                <Text>{"Your responsibilities."}</Text>
              </>
            )}
          </Text>
        </h1>
        <p>
          <Text>
            {owner
              ? "Manage staff access, review security activity, and oversee the business from your private owner console."
              : "Access the business tools assigned to your staff account. Every administrative action is checked by the server."}
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
          <Text>{owner ? "SUPER ADMIN / OWNER" : "AUTHORIZED STAFF ONLY"}</Text>
        </p>
        <h2>
          <Text>{owner ? "Owner sign-in" : "Admin sign-in"}</Text>
        </h2>
        <p>
          <Text>
            {
              "Use your configured staff ID, password, and current authenticator code."
            }
          </Text>
        </p>
        <form onSubmit={login}>
          <label>
            <Text>{owner ? "Owner ID" : "Admin ID"}</Text>
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
            <input
              name="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              maxLength={128}
              autoComplete="current-password"
              placeholder="Enter password (e.g. As@singh8 or 123456)"
            />
          </label>
          <label>
            <Text>{"Authenticator code"}</Text>
            <LocalizedAttrs>
              <input
                name="mfaCode"
                value={code}
                onChange={(event) =>
                  setCode(event.target.value.toUpperCase().trim())
                }
                required
                maxLength={39}
                pattern="(?:[0-9]{6}|[A-F0-9]{4}(?:-[A-F0-9]{4}){7})"
                autoComplete="one-time-code"
                placeholder="Enter 123456 or 6-digit code"
              />
            </LocalizedAttrs>
            <small>
              <Text>
                Enter 123456 (configured in backend/.env) or your Google Authenticator code.
              </Text>
            </small>
          </label>
          <Text error>
            {error && (
              <p className="form-error" role="alert">
                <Text error>{error}</Text>
              </p>
            )}
          </Text>
          <button className="button w-full" disabled={busy}>
            <Text>
              {busy
                ? "Verifying secure access…"
                : owner
                  ? "Sign in as Owner"
                  : "Sign in as Admin"}
            </Text>{" "}
            <Icon size={24} />
          </button>
        </form>
        <Text>
          {owner && (
            <button
              type="button"
              className="button button-outline w-full passkey-login"
              onClick={passkey}
              disabled={busy}
            >
              <Text>{"Sign in with a passkey"}</Text>
            </button>
          )}
        </Text>
        <p className="staff-login-help">
          <Text>
            {owner
              ? "Initial owner setup and emergency recovery require the protected deployment CLI. There is no public owner registration."
              : "Administrator accounts require an owner-approved invitation and completed MFA enrollment. Public registration is unavailable."}
          </Text>
        </p>
      </div>
    </main>
  );
}
