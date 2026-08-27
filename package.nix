{ lib, buildNpmPackage, importNpmLock, nodejs_24, runtimeShell }:

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
    mkdir -p $out/bin $out/libexec
    cp scripts/portfolio-performance-auth.mjs $out/libexec/
    cat > $out/bin/portfolio-kompass-auth <<EOF
    #!${runtimeShell}
    exec ${nodejs_24}/bin/node $out/libexec/portfolio-performance-auth.mjs "\$@"
    EOF
    chmod +x $out/bin/portfolio-kompass-auth

    runHook postInstall
  '';
}
