import { createPrismaClient, PrismaApiTokenRepository } from '@cqp/db';
import { CreateApiTokenUseCase } from '@cqp/application';

/**
 * Operator-run only — there is no public "create org"/"create token"
 * endpoint (see docs/adr/0014-auth-model.md). Talks to Prisma directly
 * rather than going through an OrgRepository port: this is a one-off ops
 * script, not a use case any controller calls, so it doesn't need the same
 * layering as the request-serving code.
 */
async function main() {
  const [orgName, tokenName = 'default'] = process.argv.slice(2);
  if (!orgName) {
    console.error('Usage: node dist/scripts/bootstrap-org.js <org-name> [token-name]');
    process.exitCode = 1;
    return;
  }

  const prisma = createPrismaClient();
  try {
    const org = await prisma.org.create({
      data: { name: orgName, slug: orgName.toLowerCase().replace(/\s+/g, '-') },
    });

    const apiTokenRepository = new PrismaApiTokenRepository(prisma);
    const { rawToken } = await new CreateApiTokenUseCase(apiTokenRepository).execute(
      org.id,
      tokenName,
    );

    console.log(`Org created: ${org.id} (${org.slug})`);
    console.log(`API token (shown once, store it now): ${rawToken}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
