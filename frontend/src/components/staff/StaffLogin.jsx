"use client";
import { Text, LocalizedAttrs } from "@/components/LocalizedText";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api";
import Icon from "@/components/Icon";

export default function StaffLogin({ realm }) {
  const router = useRouter();
  const [adminId, setAdminId] = useState(""),
    [password, setPassword] = useState(""),
    [code, setCode] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [supportId, setSupportId] = useState('');
  const inFlight = useRef(false);
  async function login(event) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await apiRequest(`${realm}/auth/login`, {
        method: "POST",
        body: JSON.stringify({
          adminId,
          password,
          securityCode: code.trim(),
        }),
      });
      setPassword("");
      setCode("");
      router.replace(`/${realm}/dashboard`);
    } catch (error) {
      setSupportId(error.requestId || '');
      setError(error.message);
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
          <Text>
            <>
              <Text>{"Your workspace."}</Text>
              <br />
              <Text>{"Your responsibilities."}</Text>
            </>
          </Text>
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
          <Text>{"Admin sign-in"}</Text>
        </h2>
        <p>
          <Text>
            {
              "Use your configured staff ID, password, and private admin security code."
            }
          </Text>
        </p>
        <form onSubmit={login}>
          <label>
            <Text>{"Admin ID"}</Text>
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
              placeholder="Enter your password"
            />
          </label>
          <label>
            <Text>{"Admin Security Code"}</Text>
            <LocalizedAttrs>
              <input
                name="securityCode"
                aria-label="Admin security code"
                value={code}
                onChange={(event) =>
                  setCode(event.target.value.toUpperCase().trim())
                }
                required
                maxLength={39}
                pattern="[0-9]{6}"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="Enter your 6-digit security code"
              />
            </LocalizedAttrs>
            <small><Text>Enter your private six-digit admin security code.</Text></small>
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
              {busy ? "Verifying secure access…" : "Sign In as Admin"}
            </Text>{" "}
            <Icon size={24} />
          </button>
        </form>
        {error && supportId && <p className="auth-support-reference"><Text>Support reference</Text>: <code>{supportId}</code></p>}
        <p className="staff-login-help">
          <Text>
            Administrator access requires a valid Admin ID, password, and private security code. Public registration is unavailable.
          </Text>
        </p>
      </div>
    </main>
  );
}
