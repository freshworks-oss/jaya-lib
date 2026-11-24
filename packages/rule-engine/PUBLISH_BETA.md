# Publish `@freshworks-jaya/rule-engine@0.18.10-beta.4` (CX-332784 RCA)

Uses npm dot prerelease style (`0.18.10-beta.3` is current `@beta` on registry).

```bash
cd packages/rule-engine
yarn build
npm login
npm publish --tag beta
npm view @freshworks-jaya/rule-engine@beta version
```

Pre-built tarball (offline): `freshworks-jaya-rule-engine-0.18.10-beta.4.tgz` in this directory after `npm pack`.