{
  description = "Portfolio Kompass";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";

  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
    in
    {
      packages.${system}.default = pkgs.callPackage ./package.nix { };

      devShells.${system}.default = pkgs.mkShell {
        packages = with pkgs; [
          nodejs_24
          pnpm_11
        ];

        env.NEXT_TELEMETRY_DISABLED = "1";
      };
    };
}
