import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { version } = require('../../package.json') as { version: string };

/**
 * The User-Agent Rapi sends to outside services. The version follows
 * package.json, which semantic-release bumps on every release.
 */
export const USER_AGENT = `RapiBot/${version} (Discord Bot; +https://github.com/mascarell/rapi-bot)`;
