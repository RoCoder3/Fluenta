import type { ConfigProblem } from '@/server/config'

/**
 * Shown in place of the app when production environment variables are missing.
 *
 * Deliberately self-contained inline styles: this has to render correctly even
 * if something about the deployment is broken enough that the app itself
 * cannot. It names the variables and the exact commands, because the whole
 * point is that nobody should have to read server logs to fix a deploy.
 *
 * It reveals only which variables are unset — never any value.
 */
export function SetupRequired({ problems }: { problems: ConfigProblem[] }) {
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1.5rem',
        background: '#faf8f5',
        color: '#1b1a17',
        fontFamily: 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div style={{ maxWidth: '38rem', width: '100%' }}>
        <p
          style={{
            fontSize: '11px',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: '#9b948a',
            margin: '0 0 0.75rem',
          }}
        >
          Fluenta
        </p>
        <h1
          style={{
            fontFamily: 'ui-serif, "New York", Georgia, serif',
            fontSize: '1.9rem',
            lineHeight: 1.15,
            margin: '0 0 0.75rem',
            letterSpacing: '-0.015em',
          }}
        >
          Almost there — this deployment needs its environment variables.
        </h1>
        <p style={{ color: '#6d675e', lineHeight: 1.6, margin: '0 0 2rem', fontSize: '15px' }}>
          The build succeeded. The app is refusing to serve because it would otherwise run with an
          insecure session secret or a database that cannot work on serverless hosting.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem' }}>
          {problems.map((p) => (
            <div
              key={p.variable}
              style={{
                border: '1px solid #e9e4dc',
                background: '#ffffff',
                borderRadius: '12px',
                padding: '1rem 1.15rem',
              }}
            >
              <code
                style={{
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#9d4033',
                }}
              >
                {p.variable}
              </code>
              <p style={{ margin: '0.4rem 0 0.5rem', fontSize: '14px', lineHeight: 1.5 }}>{p.problem}</p>
              <p
                style={{
                  margin: 0,
                  fontSize: '13px',
                  color: '#6d675e',
                  lineHeight: 1.5,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                }}
              >
                {p.fix}
              </p>
            </div>
          ))}
        </div>

        <div
          style={{
            border: '1px solid #e9e4dc',
            background: '#ffffff',
            borderRadius: '12px',
            padding: '1.15rem',
          }}
        >
          <p style={{ margin: '0 0 0.75rem', fontSize: '14px', fontWeight: 600 }}>
            On Vercel, in order:
          </p>
          <ol
            style={{
              margin: 0,
              paddingLeft: '1.1rem',
              color: '#6d675e',
              fontSize: '14px',
              lineHeight: 1.75,
            }}
          >
            <li>Storage → create a Postgres database, and copy its pooled connection string.</li>
            <li>
              Settings → Environment Variables → add <code>DATABASE_URL</code> and{' '}
              <code>AUTH_SECRET</code>.
            </li>
            <li>
              Run the migrations against it once, from your machine:
              <br />
              <code style={{ fontSize: '12.5px' }}>
                DATABASE_URL=&quot;postgres://…&quot; npm run db:migrate &amp;&amp; DATABASE_URL=&quot;postgres://…&quot; npm run db:seed
              </code>
            </li>
            <li>Redeploy.</li>
          </ol>
        </div>

        <p style={{ marginTop: '1.5rem', fontSize: '13px', color: '#9b948a', lineHeight: 1.6 }}>
          Full instructions are in <code>DEPLOYMENT.md</code> in the repository. No secret values are
          shown on this page.
        </p>
      </div>
    </div>
  )
}
