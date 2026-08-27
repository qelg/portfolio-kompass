{ lib, buildNpmPackage, importNpmLock, nodejs_24 }:

buildNpmPackage {
  pname = "portfolio-kompass";
  version = "0.1.0";
  src = lib.cleanSource ./.;

  nodejs = nodejs_24;
  npmDeps = importNpmLock { npmRoot = ./.; };
  npmConfigHook = importNpmLock.npmConfigHook;
  npmBuildScript = "build";

  env = {
    DATABASE_PATH = ":memory:";
    NEXT_TELEMETRY_DISABLED = "1";
    PORTFOLIO_BASE_PATH = "/portfolio";
  };

  installPhase = ''
    runHook preInstall

    test -f .next/standalone/server.js
    mkdir -p $out/.next
    cp -R .next/standalone/. $out/
    cp -R .next/static $out/.next/static

    runHook postInstall
  '';
}
