// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    server: {
      // Port fixe et STRICT, volontairement.
      //
      // Par défaut Vite prend le premier port libre à partir de 8080 : lancer
      // le serveur deux fois, ou depuis deux copies du dépôt, produit
      // silencieusement deux applications sur deux ports. On finit par
      // regarder une version périmée en croyant que le code ne s'applique pas.
      // Avec strictPort, un second démarrage échoue franchement au lieu de
      // glisser sur le port suivant.
      port: 8080,
      strictPort: true,
      host: true,
    },
    // Contournement de rolldown #8809 : avec le découpage en morceaux, le helper
    // __exportAll reste enfermé dans _runtime.mjs et n'est pas importé par les
    // morceaux qui l'appellent. Le Worker Cloudflare lève alors
    // « __exportAll is not a function » au rendu serveur, alors que le même code
    // passe en `vite dev` (une seule portée, tout est visible).
    //
    // codeSplitting: false rend à nitro le fichier unique qu'il demandait — il
    // pose inlineDynamicImports, que le découpage écrasait silencieusement.
    //
    // UNIQUEMENT sur l'environnement `nitro` : appliqué au client, il fusionnerait
    // les ~170 morceaux de route en un seul bundle et dégraderait le chargement.
    //
    // À retirer quand rolldown#8809 sera corrigé.
    //
    // Les deux environnements serveur : les noms de morceaux naissent dans `ssr`,
    // `nitro` ne fait que les réémettre. Ne traiter que `nitro` ne suffit pas.
    environments: {
      ssr: {
        build: {
          rolldownOptions: { output: { codeSplitting: false } },
        },
      },
      nitro: {
        build: {
          rolldownOptions: { output: { codeSplitting: false } },
        },
      },
    },
  },
});
