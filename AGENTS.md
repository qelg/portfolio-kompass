# Portfolio Kompass agent notes

## Development

- The default Nix development shell provides the repository's Node.js and pnpm toolchain. Use `nix develop` outside an Amp orb.
- Orb login shells automatically load the same environment with `nix print-dev-env` when their working directory is this repository.
- Install dependencies with `pnpm install --frozen-lockfile`.
- Verify changes with `pnpm test` and `pnpm build`.
- `TWELVE_DATA_API_KEY` is optional for local development; only market-price imports need it.

## Deployment

Production deployment is owned by the separate `fkz/server-config` repository. Changes in this repository do not deploy on their own. Portfolio Kompass is integrated there through `portfolio-kompass.nix`; its host-local secrets live outside Git and the Nix store in `/var/lib/portfolio-kompass/portfolio-kompass.env`.

For later application releases, update the `portfolio-kompass` input in `server-config/flake.lock`, validate, and merge the server-config change to `main`. Its GitHub Actions validation then calls the server's authenticated update receiver, which starts `nixos-update.service`; that service fast-forwards `/etc/nixos` and runs `nixos-rebuild switch`. The daily NixOS update timer is only a fallback.
