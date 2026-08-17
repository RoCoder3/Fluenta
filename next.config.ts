import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['@electric-sql/pglite', '@node-rs/argon2', 'postgres'],
  // This repo documents itself in README.md; don't scaffold AGENTS.md/CLAUDE.md.
  agentRules: false,
  experimental: {
    // Server Actions carry the whole learning flow; allow room for audio/transcripts.
    serverActions: { bodySizeLimit: '4mb' },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'microphone=(self), camera=(), geolocation=()' },
        ],
      },
    ]
  },
}

export default nextConfig
