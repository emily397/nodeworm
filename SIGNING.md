# Code signing (free, for a no-block double-click installer)

Goal: a downloaded `NodeWorm-Setup.exe` / `nodeworm-agent.exe` that installs on a
double-click with no Smart App Control block and no PowerShell paste. That
requires an Authenticode signature from a Windows-trusted cert. The free route
for an open-source project is **SignPath Foundation**.

## One-time application (you)

1. Go to https://about.signpath.io/product/open-source and apply. Project:
   `github.com/emily397/nodeworm` (public repo qualifies).
2. On approval SignPath creates an Organization with:
   - an **Organization ID**
   - a **project** (slug, e.g. `nodeworm`)
   - a **signing policy** (slug, e.g. `release-signing`)
   - an **artifact configuration** (slug, e.g. `initial`)
   - a CI **API token**
3. Add these as GitHub Actions secrets on `emily397/nodeworm`:
   - `SIGNPATH_API_TOKEN`
   - `SIGNPATH_ORG_ID`
   (the slugs go straight into the workflow snippet below.)

## Workflow wiring (me, once the secrets exist)

Paste after the "Build installer EXE" step in
`.github/workflows/build-installer.yml`. It is inert until the secret is set, so
adding it never breaks the current build:

```yaml
      - name: Code-sign (SignPath, only when configured)
        if: ${{ env.SIGNPATH_API_TOKEN != '' }}
        env:
          SIGNPATH_API_TOKEN: ${{ secrets.SIGNPATH_API_TOKEN }}
        uses: signpath/github-action-submit-signing-request@v1
        with:
          api-token: ${{ secrets.SIGNPATH_API_TOKEN }}
          organization-id: ${{ secrets.SIGNPATH_ORG_ID }}
          project-slug: nodeworm
          signing-policy-slug: release-signing
          artifact-configuration-slug: initial
          github-artifact-id: ${{ steps.upload.outputs.artifact-id }}
          wait-for-completion: true
          output-artifact-directory: signed/
```

Then the release step uploads `signed/NodeWorm-Setup.exe` instead of the
unsigned one, and `install.ps1` can switch to serving the signed EXE for a
true double-click install.

## Interim (already live)

Until signing is approved, distribution uses the cert-free PowerShell one-liner
(`irm .../install.ps1 | iex`), which sidesteps the block because a CLI download
carries no Mark-of-the-Web. See `reference_windows_sac_unsigned_exe` in memory.
The hosted bridge path (Signal via a server) needs no install at all.
