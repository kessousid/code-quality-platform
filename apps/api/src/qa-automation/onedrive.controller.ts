import { Controller, Get, Inject, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  buildOneDriveAuthorizeUrl,
  encryptRepoToken,
  exchangeOneDriveAuthCode,
  fetchOneDriveAccountEmail,
  type OneDriveAppConfig,
} from '@cqp/application';
import type { OneDriveConnectionRepository } from '@cqp/core';
import { CurrentOrg } from '../auth/current-org.decorator.js';
import { Public } from '../auth/public.decorator.js';
import {
  ONEDRIVE_APP_CONFIG,
  ONEDRIVE_CONNECTION_REPOSITORY,
  ONEDRIVE_TOKEN_ENCRYPTION_KEY,
} from '../tokens.js';

/**
 * The one-time OAuth dance for connecting a personal OneDrive (docs:
 * "save QA reports to OneDrive"). `/connect` is a normal authenticated
 * endpoint the web app calls to get the Microsoft login URL; the browser
 * then navigates there directly (a full-page redirect, not an XHR), so
 * `/callback` -- where Microsoft redirects back to -- is necessarily
 * `@Public()`: it's a raw browser GET with no Authorization header. Orgs
 * aren't a meaningful secret in this internal tool, so `state` carries
 * the initiating orgId directly rather than needing a separate
 * server-side nonce store just for CSRF protection.
 */
@ApiBearerAuth()
@ApiTags('qa-automation')
@Controller('qa-automation/onedrive')
export class OneDriveController {
  constructor(
    @Inject(ONEDRIVE_CONNECTION_REPOSITORY)
    private readonly connectionRepository: OneDriveConnectionRepository,
    @Inject(ONEDRIVE_APP_CONFIG)
    private readonly config: OneDriveAppConfig,
    @Inject(ONEDRIVE_TOKEN_ENCRYPTION_KEY)
    private readonly encryptionKey: Buffer,
  ) {}

  @Get('status')
  async status(@CurrentOrg() orgId: string) {
    const connection = await this.connectionRepository.find(orgId);
    return connection
      ? { connected: true as const, accountEmail: connection.accountEmail }
      : { connected: false as const };
  }

  @Get('connect')
  connect(@CurrentOrg() orgId: string): { url: string } {
    return { url: buildOneDriveAuthorizeUrl(this.config, orgId) };
  }

  @Public()
  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') orgId: string | undefined,
    @Query('error_description') errorDescription: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (!code || !orgId) {
      res
        .status(400)
        .send(this.renderPage('Connection failed', errorDescription ?? 'Missing code or state.'));
      return;
    }
    try {
      const tokens = await exchangeOneDriveAuthCode(this.config, code);
      const accountEmail = await fetchOneDriveAccountEmail(tokens.accessToken);
      await this.connectionRepository.upsert(
        orgId,
        encryptRepoToken(tokens.refreshToken, this.encryptionKey),
        accountEmail,
      );
      res
        .status(200)
        .send(
          this.renderPage(
            'OneDrive connected',
            accountEmail
              ? `Connected as ${accountEmail}. QA automation reports will now be saved to OneDrive automatically. You can close this tab.`
              : 'Connected. QA automation reports will now be saved to OneDrive automatically. You can close this tab.',
          ),
        );
    } catch (error) {
      res.status(500).send(this.renderPage('Connection failed', (error as Error).message));
    }
  }

  /** No templating engine wired up for this one-off page — plain escaped strings are enough. */
  private renderPage(title: string, message: string): string {
    const escape = (s: string): string =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<!doctype html><html><body style="font-family: sans-serif; max-width: 480px; margin: 80px auto;"><h2>${escape(title)}</h2><p>${escape(message)}</p></body></html>`;
  }
}
