import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const { generateApiKey } = await import("../src/server/services/apiKeysService");
  const { rawKey, record } = await generateApiKey("verification-test-prod");
  console.log(JSON.stringify({ rawKey, id: record.id }));
}

main().then(() => process.exit(0));
