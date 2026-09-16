# Convex — Production Deploy Key Setup

Makes `npx convex deploy` push straight to **production** (no manual promotion step).

## 1. Create a prod-scoped deploy key

1. Go to **dashboard.convex.com** → your deployment (`successful-squirrel-121`)
2. **Settings → Deploy Keys → Create Deploy Key**
3. Choose scope **Production** (NOT preview — preview keys cannot touch prod, which is why the sandbox keeps falling back to previews)
4. Copy the key (starts with `prod:`)

## 2. Give the command the key

```bash
# one-off:
CONVEX_DEPLOY_KEY=prod:xxxxxxxx npx convex deploy

# or persist it where the sandbox looks (root-only file, NOT in the repo):
echo "prod:xxxxxxxx" > ~/.convex-prod-key && chmod 600 ~/.convex-prod-key
CONVEX_DEPLOY_KEY=$(cat ~/.convex-prod-key) npx convex deploy
```

Never commit the key. `.env*` and `~/.convex*` are outside version control.

## 3. Deploy

```bash
cd builds/jarvis-os
CONVEX_DEPLOY_KEY=$(cat ~/.convex-prod-key) npx convex deploy
```

Expected output ends with:
`✔ Deployed Convex functions to https://successful-squirrel-121.convex.cloud`

## Alternative: promote instead

If you prefer not to hold a prod key: dashboard.convex.com → deployment
**ardent-cardinal-12** (preview `library-upgrades`, already validated) →
**Deployments → Promote to production**.

## 4. Verify (either path)

```bash
bash builds/jarvis-os/scripts/verify-library-upgrade.sh
```

Prints page health + whether the new functions are live in production.
