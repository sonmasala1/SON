'use client';
import { Text, LocalizedAttrs } from '@/components/LocalizedText';


import { useCallback, useEffect, useState } from 'react';
import { API_BASE_URL, getHealth, getReadiness } from '@/lib/api';
import Icon from '@/components/Icon';

export default function HealthPage() {
  const [health, setHealth] = useState(null);
  const [readiness, setReadiness] = useState(null);
  const [error, setError] = useState('');
  const [databaseError, setDatabaseError] = useState('');
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setDatabaseError(''); setHealth(null); setReadiness(null);
    Promise.all([
      getHealth({ signal: controller.signal }).then(result => {
        if (result.success !== true || result.status !== 'healthy') throw new Error('The API did not report a healthy status.');
        setHealth(result);
      }).catch(error => { if (!controller.signal.aborted) setError(error.message); }),
      getReadiness({ signal: controller.signal }).then(setReadiness).catch(error => { if (!controller.signal.aborted) setDatabaseError(error.message); }),
    ]).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);
  return <main id="main" className="wrap page-content health-page"><p className="eyebrow"><Text>{"SERVICE STATUS"}</Text></p><h1><Text>{"Backend Health Check"}</Text></h1><div className="status-card" aria-live="polite">
    <Icon name={health ? 'check' : 'clock'} size={42} />
    <h2><Text>{loading ? 'Checking the connection…' : health ? 'Backend Connected Successfully' : 'Backend connection unavailable'}</Text></h2>
    <Text error>{error && <><p className="error-text"><Text error>{error}</Text></p><p><Text>{"Confirm that Express is running at the address below and that CORS allows this frontend origin."}</Text></p></>}</Text>
    <Text>{health && <p><Text>{health.message}</Text></p>}</Text>
    <dl><div><dt><Text>{"API endpoint"}</Text></dt><dd><Text>{API_BASE_URL}</Text><Text>{"/health"}</Text></dd></div><div><dt><Text>{"Database readiness"}</Text></dt><dd><Text>{loading ? 'Checking…' : readiness ? 'Connected and ready' : databaseError || 'Unavailable'}</Text></dd></div><Text>{health && <div><dt><Text>{"Last API response"}</Text></dt><dd><Text>{health.timestamp}</Text></dd></div>}</Text></dl>
    <Text>{health && <details><summary><Text>{"View actual API response"}</Text></summary><pre><Text>{JSON.stringify(health, null, 2)}</Text></pre></details>}</Text>
    <button disabled={loading} className="button" onClick={retry}><Text>{loading ? 'Checking…' : 'Check again'}</Text></button>
  </div></main>;
}
