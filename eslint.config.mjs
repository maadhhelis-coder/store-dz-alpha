import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // البادئة "_" اتفاقية معتمدة صراحةً فالمشروع (مثلًا: تجريد التوكنات الحساسة عمدًا
      // من الكائن قبل تمريره لمكوّن عميل) — يجب ألا تُعامَل كمتغير منسي.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { varsIgnorePattern: "^_", argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // ملفات ثابتة تُقدَّم كما هي (public/) — ليست شيفرة تطبيق TypeScript، لا تخضع لقواعد
    // هذا المشروع (مثال: public/pixel-loader.js فانيلا JS مقصود لبيئة متصفح قديمة التوافق).
    "public/**",
  ]),
]);

export default eslintConfig;
