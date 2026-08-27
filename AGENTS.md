# Portfolio Kompass agent notes

## Development

- The default Nix development shell provides the repository's Node.js and pnpm toolchain. Use `nix develop` outside an Amp orb.
- Orb login shells automatically load the same environment with `nix print-dev-env` when their working directory is this repository.
- Install dependencies with `pnpm install --frozen-lockfile`.
- Verify changes with `pnpm test` and `pnpm build`.
- `TWELVE_DATA_API_KEY` is optional for local development; only market-price imports need it.

## Deployment

Production deployment is owned by the separate `qelg/server-config` repository. Changes in this repository do not deploy on their own.

As of August 2026, `server-config` has no Portfolio Kompass integration yet. Before the first deployment:

1. Add this repository as a flake input in `server-config/flake.nix` and pass the input to the NixOS modules.
2. Add and import a NixOS service module that runs this flake's default package, configures its environment and listen address, and persists `data/portfolio.db` (or sets `DATABASE_PATH` to persistent storage).
3. Configure required secrets and the intended nginx/Tailscale exposure in `server-config`; never commit secret values here.
4. Run `nix flake lock --update-input portfolio-kompass` in `server-config` and validate that repository's checks.

For later application releases, update the `portfolio-kompass` input in `server-config/flake.lock`, validate, and merge the server-config change to `main`. Its GitHub Actions validation then calls the server's authenticated update receiver, which starts `nixos-update.service`; that service fast-forwards `/etc/nixos` and runs `nixos-rebuild switch`. The daily NixOS update timer is only a fallback.
