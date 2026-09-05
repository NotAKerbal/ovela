import { mkdirSync, writeFileSync } from 'node:fs';

const site = new URL(process.env.SITE_URL || 'http://127.0.0.1:3000');
const photos = new URL(process.env.IMMICH_URL || 'http://127.0.0.1:2283');
const secret = process.env.OVELA_IMMICH_CLIENT_SECRET;
if (!secret || secret.length < 32) throw new Error('Immich requires a generated Ovela client secret.');
if (!['http:', 'https:'].includes(site.protocol)) throw new Error('SITE_URL must use HTTP or HTTPS.');
if (!['http:', 'https:'].includes(photos.protocol)) throw new Error('IMMICH_URL must use HTTP or HTTPS.');

const config = {
  machineLearning: { urls: ['http://immich-machine-learning:3003'] },
  oauth: {
    enabled: true,
    autoLaunch: true,
    autoRegister: true,
    mobileOverrideEnabled: true,
    mobileRedirectUri: `${photos.origin}/api/oauth/mobile-redirect`,
    buttonText: 'Continue with Ovela',
    clientId: 'immich',
    clientSecret: secret,
    issuerUrl: `${site.origin}/api/auth/.well-known/openid-configuration`,
    scope: 'openid email profile',
    signingAlgorithm: 'RS256',
    roleClaim: 'immich_role',
    allowInsecureRequests: site.protocol === 'http:',
  },
  passwordLogin: { enabled: false },
};

mkdirSync('/config', { recursive: true });
writeFileSync('/config/immich.json', `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
console.log('Immich single sign-on configuration saved.');
