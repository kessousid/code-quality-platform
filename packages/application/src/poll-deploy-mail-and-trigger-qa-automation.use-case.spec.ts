import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PollDeployMailAndTriggerQaAutomationUseCase } from './poll-deploy-mail-and-trigger-qa-automation.use-case.js';
import { InMemoryDeployMailPollCursorRepository } from './testing/in-memory-deploy-mail-poll-cursor-repository.js';

const ORG_ID = 'org_1';
const CONFIG = { tenantId: 'tenant_1', clientId: 'client_1', clientSecret: 'secret_1' };
const MAILBOX = 'deploys@example.com';
const BODY_MATCH = 'Deployment succeeded';

function mockGraphResponses(messagesBody: unknown): void {
  vi.mocked(global.fetch)
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: 'token_abc' }), { status: 200 }),
    )
    .mockResolvedValueOnce(new Response(JSON.stringify(messagesBody), { status: 200 }));
}

describe('PollDeployMailAndTriggerQaAutomationUseCase', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-02T12:00:00.000Z'));
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.useRealTimers();
  });

  it('reports a match and advances the cursor when a message body matches', async () => {
    mockGraphResponses({
      value: [
        {
          id: 'm1',
          receivedDateTime: '2026-09-02T11:00:00Z',
          body: { content: 'Deployment succeeded for prod' },
        },
      ],
    });
    const cursorRepository = new InMemoryDeployMailPollCursorRepository();
    const useCase = new PollDeployMailAndTriggerQaAutomationUseCase(
      cursorRepository,
      CONFIG,
      MAILBOX,
      BODY_MATCH,
    );

    const result = await useCase.execute(ORG_ID);

    expect(result).toEqual({ matched: true });
    const cursor = await cursorRepository.get(ORG_ID);
    expect(cursor.lastPolledAt).toEqual(new Date('2026-09-02T12:00:00.000Z'));
  });

  it('reports no match but still advances the cursor when nothing matches', async () => {
    mockGraphResponses({
      value: [
        {
          id: 'm1',
          receivedDateTime: '2026-09-02T11:00:00Z',
          body: { content: 'unrelated email' },
        },
      ],
    });
    const cursorRepository = new InMemoryDeployMailPollCursorRepository();
    const useCase = new PollDeployMailAndTriggerQaAutomationUseCase(
      cursorRepository,
      CONFIG,
      MAILBOX,
      BODY_MATCH,
    );

    const result = await useCase.execute(ORG_ID);

    expect(result).toEqual({ matched: false });
    const cursor = await cursorRepository.get(ORG_ID);
    expect(cursor.lastPolledAt).toEqual(new Date('2026-09-02T12:00:00.000Z'));
  });

  it('matches case-insensitively', async () => {
    mockGraphResponses({
      value: [
        {
          id: 'm1',
          receivedDateTime: '2026-09-02T11:00:00Z',
          body: { content: 'DEPLOYMENT SUCCEEDED!' },
        },
      ],
    });
    const useCase = new PollDeployMailAndTriggerQaAutomationUseCase(
      new InMemoryDeployMailPollCursorRepository(),
      CONFIG,
      MAILBOX,
      BODY_MATCH,
    );

    expect(await useCase.execute(ORG_ID)).toEqual({ matched: true });
  });

  it('reports only one match even when several messages match in the same window', async () => {
    mockGraphResponses({
      value: [
        {
          id: 'm1',
          receivedDateTime: '2026-09-02T10:00:00Z',
          body: { content: 'Deployment succeeded' },
        },
        {
          id: 'm2',
          receivedDateTime: '2026-09-02T11:00:00Z',
          body: { content: 'Deployment succeeded again' },
        },
      ],
    });
    const useCase = new PollDeployMailAndTriggerQaAutomationUseCase(
      new InMemoryDeployMailPollCursorRepository(),
      CONFIG,
      MAILBOX,
      BODY_MATCH,
    );

    expect(await useCase.execute(ORG_ID)).toEqual({ matched: true });
  });

  it('defaults to a 2-hour lookback window on the first-ever poll', async () => {
    mockGraphResponses({ value: [] });
    const useCase = new PollDeployMailAndTriggerQaAutomationUseCase(
      new InMemoryDeployMailPollCursorRepository(),
      CONFIG,
      MAILBOX,
      BODY_MATCH,
    );

    await useCase.execute(ORG_ID);

    const [messagesUrl] = vi.mocked(global.fetch).mock.calls[1]!;
    expect(messagesUrl as string).toContain('receivedDateTime+ge+2026-09-02T10%3A00%3A00.000Z');
  });

  it('polls since the stored cursor on a subsequent poll', async () => {
    const cursorRepository = new InMemoryDeployMailPollCursorRepository();
    await cursorRepository.updateLastPolledAt(ORG_ID, new Date('2026-09-02T09:30:00.000Z'));
    mockGraphResponses({ value: [] });
    const useCase = new PollDeployMailAndTriggerQaAutomationUseCase(
      cursorRepository,
      CONFIG,
      MAILBOX,
      BODY_MATCH,
    );

    await useCase.execute(ORG_ID);

    const [messagesUrl] = vi.mocked(global.fetch).mock.calls[1]!;
    expect(messagesUrl as string).toContain('receivedDateTime+ge+2026-09-02T09%3A30%3A00.000Z');
  });
});
